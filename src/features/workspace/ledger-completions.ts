import type { CompletionContext } from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";

/** Returns true if `account` matches `query`, using direct substring or segment-aware prefix matching. */
export function matchesAccount(account: string, query: string): boolean {
  if (!query) return true;
  const lAccount = account.toLowerCase();
  const lQuery = query.toLowerCase();
  if (lAccount.includes(lQuery)) return true;
  // Segment-aware: "exp:util" matches "Expenses:Utilities"
  const querySegs = lQuery.split(":");
  const accountSegs = lAccount.split(":");
  let ai = 0;
  for (const qSeg of querySegs) {
    while (ai < accountSegs.length && !accountSegs[ai].startsWith(qSeg)) ai++;
    if (ai >= accountSegs.length) return false;
    ai++;
  }
  return true;
}

export function filterAccounts(accounts: string[], query: string): string[] {
  return accounts.filter((a) => matchesAccount(a, query));
}

/**
 * If the cursor is on an indented posting line and in the account token position,
 * returns { from: absolute start of account token, prefix: typed text }.
 * Returns null otherwise (e.g. cursor is past 2+ spaces in the amount position).
 */
export function accountAt(context: CompletionContext): { from: number; prefix: string } | null {
  const line = context.state.doc.lineAt(context.pos);
  if (!/^\s/.test(line.text)) return null; // posting lines are indented
  const beforeCursor = line.text.slice(0, context.pos - line.from);
  // If cursor is past two consecutive spaces the user is typing the amount
  if (/\S\s{2,}$/.test(beforeCursor)) return null;
  const match = context.matchBefore(/[\w:]+/);
  if (!match && !context.explicit) return null;
  return { from: match?.from ?? context.pos, prefix: match?.text ?? "" };
}

/**
 * If the cursor is inside a quoted string on a date header line, returns
 * { from: absolute position right after the opening quote, prefix: typed text }.
 */
export function payeeAt(context: CompletionContext): { from: number; prefix: string } | null {
  const line = context.state.doc.lineAt(context.pos);
  if (!/^\d{4}-\d{2}-\d{2}\s/.test(line.text)) return null;
  const textBeforePos = line.text.slice(0, context.pos - line.from);
  const quotesBefore = (textBeforePos.match(/"/g) ?? []).length;
  if (quotesBefore % 2 === 0) return null; // cursor is outside all quoted strings
  const lastQuoteIndex = textBeforePos.lastIndexOf('"');
  return { from: line.from + lastQuoteIndex + 1, prefix: textBeforePos.slice(lastQuoteIndex + 1) };
}

/**
 * Returns "first" if the cursor is on the first posting line of a transaction
 * (no indented lines above the header within the same block), "balancing" otherwise.
 */
export function postingPosition(state: EditorState, pos: number): "first" | "balancing" {
  const cursorLine = state.doc.lineAt(pos);
  for (let lineNum = cursorLine.number - 1; lineNum >= 1; lineNum--) {
    const text = state.doc.line(lineNum).text;
    if (/^\d{4}-\d{2}-\d{2}\s/.test(text)) return "first"; // header with no prior posting
    if (text.trim() === "") return "first"; // block boundary
    if (/^\s+\S/.test(text)) return "balancing"; // another posting line above
  }
  return "first";
}

/**
 * Walks up from `pos` to find the enclosing transaction header and extracts its description text.
 * Returns null if not inside a transaction block.
 */
export function blockDescriptionAt(state: EditorState, pos: number): string | null {
  const cursorLine = state.doc.lineAt(pos);
  for (let lineNum = cursorLine.number; lineNum >= 1; lineNum--) {
    const text = state.doc.line(lineNum).text;
    if (text.trim() === "" && lineNum !== cursorLine.number) return null;
    if (/^\d{4}-\d{2}-\d{2}\s/.test(text)) {
      const match = text.match(/^\d{4}-\d{2}-\d{2}\s+[!*]\s+"?([^"]+)"?/);
      return match?.[1]?.trim() ?? null;
    }
  }
  return null;
}
