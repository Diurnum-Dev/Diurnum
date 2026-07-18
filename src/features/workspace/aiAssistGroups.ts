import type {
  AiAssistPassState,
  AiAssistProposedRule,
  SuggestedEntry,
} from "../../lib/workspace/types";

export type AiAssistReviewRow = {
  statementRowId: string;
  postedDate: string;
  payee: string;
  narration: string | null;
  rawDescription: string;
  sourceAccount: string;
  sourceAmount: string;
  amount: number;
  explanation: string | null;
  failed: boolean;
};

export type AiAssistGroup = {
  ledgerAccount: string;
  rows: AiAssistReviewRow[];
  net: number;
  rules: AiAssistProposedRule[];
};

export function buildAiAssistGroups(
  entries: SuggestedEntry[],
  pass: AiAssistPassState,
): { groups: AiAssistGroup[]; needsEye: AiAssistReviewRow[] } {
  const entriesById = new Map(entries.map((entry) => [entry.statementRowId, entry]));
  const grouped = new Map<string, AiAssistReviewRow[]>();
  const needsEye: AiAssistReviewRow[] = [];

  for (const suggestion of pass.suggestions) {
    const entry = entriesById.get(suggestion.statementRowId);
    if (!entry) continue;

    const amount = Number.parseFloat(entry.sourceAmount);
    const row: AiAssistReviewRow = {
      statementRowId: entry.statementRowId,
      postedDate: entry.postedDate,
      payee: suggestion.payee ?? entry.description,
      narration: suggestion.narration ?? null,
      rawDescription: entry.description,
      sourceAccount: entry.sourceAccount,
      sourceAmount: entry.sourceAmount,
      amount: Number.isFinite(amount) ? amount : 0,
      explanation: suggestion.explanation ?? null,
      failed: suggestion.status === "failed",
    };

    if (suggestion.status === "suggested" && suggestion.ledgerAccount) {
      const rows = grouped.get(suggestion.ledgerAccount) ?? [];
      rows.push(row);
      grouped.set(suggestion.ledgerAccount, rows);
    } else {
      needsEye.push(row);
    }
  }

  const groups: AiAssistGroup[] = [...grouped.entries()]
    .map(([ledgerAccount, rows]) => ({
      ledgerAccount,
      rows,
      net: rows.reduce((sum, row) => sum + row.amount, 0),
      rules: pass.proposedRules.filter((rule) => rule.ledgerAccount === ledgerAccount),
    }))
    .sort(
      (a, b) =>
        b.rows.length - a.rows.length || a.ledgerAccount.localeCompare(b.ledgerAccount),
    );

  return { groups, needsEye };
}
