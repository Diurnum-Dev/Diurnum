# Ledger Editor Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement account-name completion, payee/narration completion, per-block context ranking, and fix Ledger Editor auto-save (issues #74–#77).

**Architecture:** Pure completion logic (context detection, segment filtering, debit/credit ranking) lives in a new `ledger-completions.ts` module. Account and payee data is held in refs inside `CodeMirrorEditor` and filtered in-memory with no per-keystroke backend calls. Two new Rust commands (`get_account_context_hints`, `list_entry_descriptions`) are added to `ledger_editor.rs`. Auto-save is fixed by stabilizing two App.tsx callbacks with `useCallback` to break the identity-churn feedback loop.

**Tech Stack:** React 18, CodeMirror 6 (`@codemirror/autocomplete`), Tauri 2, Rust, Vitest

## Global Constraints

- No LSP server, sidecar process, or Python runtime (ADR-0004)
- No per-keystroke backend calls — account and payee lists are in-memory
- AI whole-entry ghost (date header line) is untouched
- `alignTransactionAmounts` does NOT run on completion accept — only on save
- Dropdown does NOT auto-open on the bare date header line (Context 3)
- `@codemirror/autocomplete` is already installed as a transitive dep of `codemirror`

---

## File Map

**New files:**
- `src/features/workspace/ledger-completions.ts` — pure functions: context detection, segment filtering, debit/credit bias, block description extraction
- `src/features/workspace/ledger-completions.test.ts` — vitest unit tests

**Modified frontend files:**
- `src/App.tsx` — `useCallback` on two handlers; pass `knownAccounts` to LedgerEditor
- `src/features/workspace/LedgerEditor.tsx` — blur-save, `knownAccounts`/`payeeDescriptions` props and state, completion Compartment and ghost plugins, Tab/Ctrl+Space/Esc key updates
- `src/lib/workspace/api.ts` — `getAccountContextHints`, `listEntryDescriptions` wrappers
- `src/lib/workspace/types.ts` — `EntryDescription` type

**Modified Rust files:**
- `src-tauri/src/workspace/ledger_editor.rs` — `AccountContextHintsInput`, `EntryDescription`, `get_account_context_hints`, `list_entry_descriptions`
- `src-tauri/src/commands/workspace.rs` — expose both as Tauri commands
- `src-tauri/src/lib.rs` — register both commands

---

## Task 1: Fix Ledger Editor auto-save (#74)

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/features/workspace/LedgerEditor.tsx`

**Root cause:** `handleLedgerValidationChange` and `handleLedgerFileSaved` in App.tsx are plain function declarations — new identity every render. They flow into `runValidation` / `saveActiveFile` `useCallback` deps. `applyLedgerValidation` mints a new `workspace` object → forces re-render → new handler identities → new `runValidation` → validation effect re-arms → loop. The 2 s save timer never fires.

**Interfaces:**
- Consumes: nothing new
- Produces: stable `onValidationChange` and `onSaved` props; blur/visibilitychange save behavior

- [ ] **Step 1: Wrap App.tsx handlers with `useCallback`**

In `src/App.tsx`, `handleLedgerValidationChange` is a plain function around line 543 and `handleLedgerFileSaved` around line 560. Replace both with `useCallback`. `session = sessionRef.current` is stable (from `useRef`), so these callbacks will be stable across renders.

```typescript
// Replace the two plain function declarations with:
const handleLedgerValidationChange = useCallback((validation: LedgerValidationSummary) => {
  session.applyLedgerValidation(validation);
}, [session]);

const handleLedgerFileSaved = useCallback(async () => {
  await session.notifyLedgerSaved().catch(() => undefined);
}, [session]);
```

- [ ] **Step 2: Pass `knownAccounts` to `LedgerEditor` in App.tsx**

`knownAccounts` is already destructured from `sessionState` at line 74. The `LedgerEditor` call at line 882 does not yet include it. Add:

```typescript
<LedgerEditor
  workspace={workspace}
  requestedFile={ledgerRequestedFile}
  requestedCursor={ledgerRequestedCursor}
  requestedFileVersion={ledgerRequestedVersion}
  onActiveFileChange={setLedgerActiveFile}
  onFilesChange={setLedgerFiles}
  onValidationChange={handleLedgerValidationChange}
  onSaved={handleLedgerFileSaved}
  onError={session.setError}
  onCursorChange={setLedgerCursor}
  knownAccounts={knownAccounts}
/>
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck 2>&1 | head -40
```

Expected: one error — `knownAccounts` not yet in `LedgerEditorProps`. That's expected; we fix it in Task 2.

- [ ] **Step 4: Add blur-save to `LedgerEditor.tsx`**

In `LedgerEditor.tsx`, add two ref-syncing effects and the blur/visibility effect. Insert after the `MENU_SAVE_EVENT` listener effect (around line 284):

```typescript
// Refs so blur handler always calls the latest version of saveActiveFile and reads latest isDirty
const saveActiveFileRef = useRef(saveActiveFile);
useEffect(() => {
  saveActiveFileRef.current = saveActiveFile;
}, [saveActiveFile]);

const activeTabRef = useRef(activeTab);
useEffect(() => {
  activeTabRef.current = activeTab;
}, [activeTab]);

useEffect(() => {
  function handleBlur() {
    if (activeTabRef.current?.isDirty) void saveActiveFileRef.current();
  }
  function handleVisibility() {
    if (document.visibilityState === "hidden") void saveActiveFileRef.current();
  }
  window.addEventListener("blur", handleBlur);
  document.addEventListener("visibilitychange", handleVisibility);
  return () => {
    window.removeEventListener("blur", handleBlur);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}, []);
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: all tests pass (the typecheck error for `knownAccounts` prop is resolved in Task 2)

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/features/workspace/LedgerEditor.tsx
git commit -m "fix: break auto-save debounce loop and add blur-save (#74)"
```

---

## Task 2: Account completion — ghost + dropdown (#75)

**Files:**
- Create: `src/features/workspace/ledger-completions.ts`
- Create: `src/features/workspace/ledger-completions.test.ts`
- Modify: `src/features/workspace/LedgerEditor.tsx`

**Interfaces:**
- Consumes: `knownAccounts: string[]` from App.tsx (wired in Task 1)
- Produces: `matchesAccount`, `filterAccounts`, `accountAt`, `payeeAt`, `postingPosition`, `blockDescriptionAt` from `ledger-completions.ts`; account completion in posting position with ghost and dropdown

- [ ] **Step 1: Write failing tests**

Create `src/features/workspace/ledger-completions.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { matchesAccount, filterAccounts } from "./ledger-completions";

describe("matchesAccount", () => {
  it("matches by direct substring (case-insensitive)", () => {
    expect(matchesAccount("Expenses:Utilities", "util")).toBe(true);
    expect(matchesAccount("Expenses:Utilities", "UTIL")).toBe(true);
  });

  it("matches by segment prefix: exp:util → Expenses:Utilities", () => {
    expect(matchesAccount("Expenses:Utilities", "exp:util")).toBe(true);
  });

  it("matches by partial segment: exp:u → Expenses:Utilities", () => {
    expect(matchesAccount("Expenses:Utilities", "exp:u")).toBe(true);
  });

  it("returns true for empty query", () => {
    expect(matchesAccount("Assets:Bank", "")).toBe(true);
  });

  it("returns false for non-matching segment", () => {
    expect(matchesAccount("Assets:Bank:Checking", "exp:util")).toBe(false);
  });
});

describe("filterAccounts", () => {
  const accounts = [
    "Assets:Bank:Checking",
    "Expenses:Utilities:Electric",
    "Expenses:Utilities:Water",
    "Income:Services",
  ];

  it("returns all accounts for empty query", () => {
    expect(filterAccounts(accounts, "")).toHaveLength(4);
  });

  it("returns segment-matched accounts", () => {
    expect(filterAccounts(accounts, "exp:util")).toEqual([
      "Expenses:Utilities:Electric",
      "Expenses:Utilities:Water",
    ]);
  });

  it("returns empty array for no match", () => {
    expect(filterAccounts(accounts, "xyz")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- --reporter=verbose src/features/workspace/ledger-completions.test.ts 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module './ledger-completions'`

- [ ] **Step 3: Create `ledger-completions.ts`**

Create `src/features/workspace/ledger-completions.ts`:

```typescript
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
  if (/\S\s{2,}$/.test(beforeCursor) || /\s{2,}\S/.test(beforeCursor)) return null;
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
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test -- --reporter=verbose src/features/workspace/ledger-completions.test.ts 2>&1 | tail -20
```

Expected: all tests PASS

- [ ] **Step 5: Add `knownAccounts` to `LedgerEditorProps` and thread through**

In `src/features/workspace/LedgerEditor.tsx`, add `knownAccounts` to the props type (around line 27):

```typescript
type LedgerEditorProps = {
  workspace: WorkspaceSummary;
  requestedFile?: string | null;
  requestedCursor?: number | null;
  requestedFileVersion?: number;
  onActiveFileChange: (relativePath: string) => void;
  onFilesChange?: (files: string[]) => void;
  onValidationChange: (validation: LedgerValidationSummary) => void;
  onSaved?: (relativePath: string) => void | Promise<void>;
  onError: (message: string | null) => void;
  onCursorChange?: (cursor: { line: number; column: number }) => void;
  knownAccounts?: string[];
};
```

Add to the destructure (around line 54):

```typescript
export function LedgerEditor({
  workspace,
  requestedFile,
  requestedCursor,
  requestedFileVersion,
  onActiveFileChange,
  onFilesChange,
  onValidationChange,
  onSaved,
  onError,
  onCursorChange,
  knownAccounts = [],
}: LedgerEditorProps) {
```

Pass to `CodeMirrorEditor` (around line 516):

```typescript
<CodeMirrorEditor
  key={activePath}
  contents={activeTab.contents}
  cursor={activeTab.cursor}
  scrollTop={activeTab.scrollTop}
  validationErrors={validationErrorsForFile(validationErrors, activePath)}
  completionText={predictiveCompletion?.insertText ?? null}
  knownAccounts={knownAccounts}
  workspaceRootPath={workspace.rootPath}
  onChange={updateActiveContents}
  onSave={saveActiveFile}
  onCloseTab={() => closeTab()}
  onReopenTab={reopenClosedTab}
  onOpenInclude={(relativePath) => void openFile(relativePath)}
  onDismissCompletion={() => setPredictiveCompletion(null)}
  onCursorChange={onCursorChange}
/>
```

- [ ] **Step 6: Add imports and update `CodeMirrorEditorProps`**

At the top of `LedgerEditor.tsx`, add to the existing imports:

```typescript
import {
  autocompletion,
  completionStatus,
  acceptCompletion,
  startCompletion,
  closeCompletion,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { filterAccounts, accountAt } from "./ledger-completions";
```

Update `CodeMirrorEditorProps` (around line 800):

```typescript
type CodeMirrorEditorProps = {
  contents: string;
  cursor: number;
  scrollTop: number;
  validationErrors: FileValidationError[];
  completionText: string | null;
  knownAccounts: string[];
  workspaceRootPath: string;
  onChange: (contents: string, cursor: number, scrollTop: number) => void;
  onSave: () => void;
  onCloseTab: () => void;
  onReopenTab: () => void;
  onOpenInclude: (relativePath: string) => void;
  onDismissCompletion: () => void;
  onCursorChange?: (cursor: { line: number; column: number }) => void;
};
```

- [ ] **Step 7: Add the `buildInstantCompletion` helper above `CodeMirrorEditor`**

Insert this helper function above the `CodeMirrorEditor` function definition. It builds a CM6 extension for account completion and will be extended in Task 4 for payees.

```typescript
function buildInstantCompletion(
  knownAccountsRef: React.MutableRefObject<string[]>,
  contextHintsRef: React.MutableRefObject<string[]>,
): Extension {
  const accountSource: CompletionSource = (context) => {
    const match = accountAt(context);
    if (!match) return null;
    const accounts = knownAccountsRef.current;
    const hints = new Set(contextHintsRef.current);
    const candidates = filterAccounts(accounts, match.prefix);
    if (!candidates.length && !context.explicit) return null;

    // Rank: hinted accounts first, then debit/credit-position bias, then chart order
    const pos = postingPosition(context.state, context.pos);
    const debitPreferred = pos === "first"; // first posting → Expenses/Income; balancing → Assets/Liabilities
    const sorted = [...candidates].sort((a, b) => {
      const aHint = hints.has(a) ? 0 : 1;
      const bHint = hints.has(b) ? 0 : 1;
      if (aHint !== bHint) return aHint - bHint;
      const aBias = (debitPreferred ? isExpenseOrIncome(a) : isAssetOrLiability(a)) ? 0 : 1;
      const bBias = (debitPreferred ? isExpenseOrIncome(b) : isAssetOrLiability(b)) ? 0 : 1;
      return aBias - bBias;
    });

    return {
      from: match.from,
      options: sorted.map((account) => ({
        label: account,
        type: "variable",
        apply: (view: EditorView, _completion, from: number, to: number) => {
          view.dispatch({
            changes: { from, to, insert: account + "  " },
            selection: EditorSelection.cursor(from + account.length + 2),
          });
        },
      })),
      validFor: /[\w:]*/,
    };
  };
  return autocompletion({ override: [accountSource] });
}

function isExpenseOrIncome(account: string): boolean {
  return account.startsWith("Expenses:") || account.startsWith("Income:");
}

function isAssetOrLiability(account: string): boolean {
  return account.startsWith("Assets:") || account.startsWith("Liabilities:");
}
```

Also add the `postingPosition` import to the ledger-completions import line:

```typescript
import { filterAccounts, accountAt, postingPosition } from "./ledger-completions";
```

- [ ] **Step 8: Wire the completion Compartment in `CodeMirrorEditor`**

In the `CodeMirrorEditor` function body, after the existing refs (around line 829), add:

```typescript
const knownAccountsCompartment = useRef(new Compartment());
const knownAccountsRef = useRef<string[]>(knownAccounts);
const contextHintsRef = useRef<string[]>([]);

// Sync prop → ref and reconfigure the completion extension
useEffect(() => {
  knownAccountsRef.current = knownAccounts;
  const view = viewRef.current;
  if (!view) return;
  view.dispatch({
    effects: knownAccountsCompartment.current.reconfigure(
      buildInstantCompletion(knownAccountsRef, contextHintsRef),
    ),
  });
}, [knownAccounts]);
```

Also add `workspaceRootPath` to `callbacksRef` so the block-description hint fetcher (Task 3) can access it:

```typescript
// In the callbacksRef definition, add:
workspaceRootPath,

// In the useEffect that syncs callbacksRef, add:
workspaceRootPath,
```

In the `EditorState.create` extensions array (inside the `useEffect(() => { ... }, [])` at line 857), add the compartment alongside the existing extensions:

```typescript
knownAccountsCompartment.current.of(
  buildInstantCompletion(knownAccountsRef, contextHintsRef),
),
```

- [ ] **Step 9: Update Tab, add Ctrl+Space, update Esc in the keymap**

In the `keymap.of([...])` block (around line 877), replace the Tab and Escape handlers, and add Ctrl+Space:

```typescript
// Tab — dropdown → ghost → indent
{
  key: "Tab",
  run: (view) => {
    if (completionStatus(view.state) === "active") {
      return acceptCompletion(view);
    }
    const text = callbacksRef.current.completionText;
    if (!text) return false;
    const cursor = view.state.selection.main.head;
    view.dispatch({
      changes: { from: cursor, to: cursor, insert: text },
      selection: EditorSelection.cursor(cursor + text.length),
    });
    callbacksRef.current.onDismissCompletion();
    return true;
  },
},
// Ctrl+Space — force-open dropdown in any completable context
{
  key: "Ctrl-Space",
  run: (view) => {
    startCompletion(view);
    return true;
  },
},
// Esc — dismiss dropdown first, then ghost
{
  key: "Escape",
  run: (view) => {
    if (completionStatus(view.state) !== null) {
      closeCompletion(view);
      return true;
    }
    if (!callbacksRef.current.completionText) return false;
    callbacksRef.current.onDismissCompletion();
    return true;
  },
},
```

- [ ] **Step 10: Run typecheck + tests**

```bash
npm run typecheck 2>&1 | head -40
npm test
```

Expected: no errors, all tests pass

- [ ] **Step 11: Commit**

```bash
git add src/features/workspace/ledger-completions.ts src/features/workspace/ledger-completions.test.ts src/features/workspace/LedgerEditor.tsx src/App.tsx
git commit -m "feat: account name completion with ghost + dropdown in posting position (#75)"
```

---

## Task 3: Per-block context ranking (#76)

**Files:**
- Modify: `src-tauri/src/workspace/ledger_editor.rs`
- Modify: `src-tauri/src/commands/workspace.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/workspace/api.ts`
- Modify: `src/features/workspace/LedgerEditor.tsx`

**Interfaces:**
- Consumes: `rule_matches`, `history_matches`, `load_history_entries`, `list_categorization_rules_from_connection` — all already in `ledger_editor.rs`
- Produces: Tauri command `get_account_context_hints(input) → Vec<String>`; frontend `getAccountContextHints(path, description): Promise<string[]>`

- [ ] **Step 1: Add `AccountContextHintsInput` struct and `get_account_context_hints` to `ledger_editor.rs`**

In `src-tauri/src/workspace/ledger_editor.rs`, add the struct near the other input structs (around line 45):

```rust
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountContextHintsInput {
    pub workspace_root_path: String,
    pub description: String,
}
```

Add the function after `read_chart_of_accounts` (around line 258):

```rust
pub fn get_account_context_hints(
    workspace_root_path: impl AsRef<Path>,
    description: &str,
) -> Result<Vec<String>, WorkspaceError> {
    let root = workspace_root_path.as_ref();
    let connection = open_connection(root)?;
    let accounts = read_chart_of_accounts(root)?;
    let account_set: HashSet<String> = accounts.into_iter().collect();
    let mut hints: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    // Rule-based hints (highest priority)
    let rules = categorization_rules::list_categorization_rules_from_connection(&connection)?;
    for rule in &rules {
        if rule.enabled
            && account_set.contains(&rule.ledger_account)
            && rule_matches(&rule.match_text, description)
            && seen.insert(rule.ledger_account.clone())
        {
            hints.push(rule.ledger_account.clone());
        }
    }

    // History-based hints
    if let Ok(entries) = load_history_entries(root, &connection) {
        for entry in entries {
            if account_set.contains(&entry.ledger_account)
                && history_matches(&entry.description, description)
                && seen.insert(entry.ledger_account.clone())
            {
                hints.push(entry.ledger_account.clone());
            }
        }
    }

    Ok(hints)
}
```

- [ ] **Step 2: Expose as a Tauri command**

In `src-tauri/src/commands/workspace.rs`, add:

```rust
#[tauri::command]
pub fn get_account_context_hints(
    input: ledger_editor::AccountContextHintsInput,
) -> Result<Vec<String>, WorkspaceError> {
    ledger_editor::get_account_context_hints(&input.workspace_root_path, &input.description)
}
```

In `src-tauri/src/lib.rs`, inside `generate_handler![...]`, add:

```rust
commands::workspace::get_account_context_hints,
```

- [ ] **Step 3: Compile Rust**

```bash
cd src-tauri && cargo check 2>&1 | tail -20
```

Expected: no errors

- [ ] **Step 4: Add frontend API wrapper**

In `src/lib/workspace/api.ts`, add:

```typescript
export async function getAccountContextHints(
  workspaceRootPath: string,
  description: string,
): Promise<string[]> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.getAccountContextHints?.(workspaceRootPath, description) ?? [];
  }
  return invoke<string[]>("get_account_context_hints", {
    input: { workspaceRootPath, description },
  });
}
```

- [ ] **Step 5: Fetch hints on block entry in `CodeMirrorEditor`**

In `LedgerEditor.tsx`, import the new API and helper:

```typescript
import { getAccountContextHints } from "../../lib/workspace/api";
import { filterAccounts, accountAt, postingPosition, blockDescriptionAt } from "./ledger-completions";
```

In `CodeMirrorEditor`, add a ref for the last fetched description to avoid re-fetching for the same block:

```typescript
const lastFetchedDescriptionRef = useRef<string | null>(null);
```

Inside the `EditorView.updateListener.of(...)` callback (around line 924), after the existing cursor/onChange logic, add:

```typescript
// Fetch per-block context hints when the cursor enters a new transaction block
if (update.selectionSet || update.docChanged) {
  const description = blockDescriptionAt(
    update.state,
    update.state.selection.main.head,
  );
  if (description !== null && description !== lastFetchedDescriptionRef.current) {
    lastFetchedDescriptionRef.current = description;
    void getAccountContextHints(
      callbacksRef.current.workspaceRootPath,
      description,
    )
      .then((hints) => {
        contextHintsRef.current = hints;
      })
      .catch(() => undefined);
  }
}
```

- [ ] **Step 6: Run typecheck + tests**

```bash
npm run typecheck 2>&1 | head -40
npm test
```

Expected: no errors, all tests pass

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/workspace/ledger_editor.rs src-tauri/src/commands/workspace.rs src-tauri/src/lib.rs src/lib/workspace/api.ts src/features/workspace/LedgerEditor.tsx
git commit -m "feat: per-block context ranking for account completion (#76)"
```

---

## Task 4: Payee and narration completion (#77)

**Files:**
- Modify: `src-tauri/src/workspace/ledger_editor.rs`
- Modify: `src-tauri/src/commands/workspace.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/workspace/api.ts`
- Modify: `src/lib/workspace/types.ts`
- Modify: `src/features/workspace/LedgerEditor.tsx`

**Interfaces:**
- Consumes: `ledger_files`, `fs::read_to_string` — already in `ledger_editor.rs`; `payeeAt` from `ledger-completions.ts`
- Produces: Tauri command `list_entry_descriptions(workspace_root_path) → Vec<EntryDescription>`; `EntryDescription { text: string; kind: "payee" | "narration" }`; payee/narration completion on header quoted strings

- [ ] **Step 1: Add `EntryDescription` struct and `list_entry_descriptions` to `ledger_editor.rs`**

In `src-tauri/src/workspace/ledger_editor.rs`, add the struct near the other public structs (around line 45):

```rust
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryDescription {
    pub text: String,
    pub kind: String, // "payee" or "narration"
}
```

Add the function after `get_account_context_hints`:

```rust
pub fn list_entry_descriptions(
    workspace_root_path: impl AsRef<Path>,
) -> Result<Vec<EntryDescription>, WorkspaceError> {
    let root = workspace_root_path.as_ref();
    let files = ledger_files(root)?;
    let mut seen: HashSet<(String, String)> = HashSet::new();
    let mut result: Vec<EntryDescription> = Vec::new();

    for relative_path in files {
        let path = root.join(&relative_path);
        let Ok(contents) = fs::read_to_string(&path) else {
            continue;
        };
        for line in contents.lines() {
            // Only transaction header lines start with a digit (date)
            if !line.starts_with(|c: char| c.is_ascii_digit()) {
                continue;
            }
            // Extract all quoted strings from the line
            let strings: Vec<&str> = {
                let mut found = Vec::new();
                let mut rest = line;
                while let Some(start) = rest.find('"') {
                    rest = &rest[start + 1..];
                    if let Some(end) = rest.find('"') {
                        found.push(&rest[..end]);
                        rest = &rest[end + 1..];
                    } else {
                        break;
                    }
                }
                found
            };
            match strings.as_slice() {
                [payee, narration, ..] => {
                    let payee = payee.trim();
                    let narration = narration.trim();
                    if !payee.is_empty() && seen.insert(("payee".into(), payee.to_string())) {
                        result.push(EntryDescription { text: payee.to_string(), kind: "payee".into() });
                    }
                    if !narration.is_empty() && seen.insert(("narration".into(), narration.to_string())) {
                        result.push(EntryDescription { text: narration.to_string(), kind: "narration".into() });
                    }
                }
                [narration] => {
                    let narration = narration.trim();
                    if !narration.is_empty() && seen.insert(("narration".into(), narration.to_string())) {
                        result.push(EntryDescription { text: narration.to_string(), kind: "narration".into() });
                    }
                }
                _ => {}
            }
        }
    }
    Ok(result)
}
```

- [ ] **Step 2: Expose as a Tauri command**

In `src-tauri/src/commands/workspace.rs`:

```rust
#[tauri::command]
pub fn list_entry_descriptions(
    workspace_root_path: String,
) -> Result<Vec<ledger_editor::EntryDescription>, WorkspaceError> {
    ledger_editor::list_entry_descriptions(&workspace_root_path)
}
```

In `src-tauri/src/lib.rs`, add to `generate_handler![...]`:

```rust
commands::workspace::list_entry_descriptions,
```

- [ ] **Step 3: Compile Rust**

```bash
cd src-tauri && cargo check 2>&1 | tail -20
```

Expected: no errors

- [ ] **Step 4: Add TypeScript type and frontend API wrapper**

In `src/lib/workspace/types.ts`, add:

```typescript
export type EntryDescription = {
  text: string;
  kind: "payee" | "narration";
};
```

In `src/lib/workspace/api.ts`:

```typescript
import type { ..., EntryDescription } from "./types";

export async function listEntryDescriptions(
  workspaceRootPath: string,
): Promise<EntryDescription[]> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.listEntryDescriptions?.(workspaceRootPath) ?? [];
  }
  return invoke<EntryDescription[]>("list_entry_descriptions", { workspaceRootPath });
}
```

- [ ] **Step 5: Add `payeeDescriptions` state in `LedgerEditor` and refresh on save**

In `LedgerEditor.tsx`, import:

```typescript
import type { EntryDescription } from "../../lib/workspace/types";
import { listEntryDescriptions } from "../../lib/workspace/api";
```

In the `LedgerEditor` component body, add state:

```typescript
const [payeeDescriptions, setPayeeDescriptions] = useState<EntryDescription[]>([]);
```

Fetch on mount (add after the `isLoading` `useEffect`):

```typescript
useEffect(() => {
  void listEntryDescriptions(workspace.rootPath)
    .then(setPayeeDescriptions)
    .catch(() => undefined);
}, [workspace.rootPath]);
```

In `saveActiveFile`, after the successful `setTabs` update (around line 263), add a refresh call:

```typescript
// After setTabs(current => ...) in the try block:
void listEntryDescriptions(workspace.rootPath)
  .then(setPayeeDescriptions)
  .catch(() => undefined);
```

Pass `payeeDescriptions` to `CodeMirrorEditor`:

```typescript
<CodeMirrorEditor
  ...
  payeeDescriptions={payeeDescriptions}
/>
```

- [ ] **Step 6: Add `payeeDescriptions` prop and payee source to `CodeMirrorEditor`**

Add to `CodeMirrorEditorProps`:

```typescript
payeeDescriptions: EntryDescription[];
```

Add to destructure and `callbacksRef`:

```typescript
// In destructure:
payeeDescriptions,

// In callbacksRef object and its sync effect:
payeeDescriptions,
```

Add `payeeDescriptionsRef`:

```typescript
const payeeDescriptionsRef = useRef<EntryDescription[]>(payeeDescriptions);
useEffect(() => {
  payeeDescriptionsRef.current = payeeDescriptions;
  const view = viewRef.current;
  if (!view) return;
  view.dispatch({
    effects: knownAccountsCompartment.current.reconfigure(
      buildInstantCompletion(knownAccountsRef, contextHintsRef, payeeDescriptionsRef),
    ),
  });
}, [payeeDescriptions]);
```

Also update the `knownAccounts` sync effect to pass `payeeDescriptionsRef`:

```typescript
useEffect(() => {
  knownAccountsRef.current = knownAccounts;
  const view = viewRef.current;
  if (!view) return;
  view.dispatch({
    effects: knownAccountsCompartment.current.reconfigure(
      buildInstantCompletion(knownAccountsRef, contextHintsRef, payeeDescriptionsRef),
    ),
  });
}, [knownAccounts]);
```

Also update the initial compartment setup in `EditorState.create`:

```typescript
knownAccountsCompartment.current.of(
  buildInstantCompletion(knownAccountsRef, contextHintsRef, payeeDescriptionsRef),
),
```

- [ ] **Step 7: Add payee source to `buildInstantCompletion`**

Update the signature and body of `buildInstantCompletion`:

```typescript
import { payeeAt } from "./ledger-completions";

function buildInstantCompletion(
  knownAccountsRef: React.MutableRefObject<string[]>,
  contextHintsRef: React.MutableRefObject<string[]>,
  payeeDescriptionsRef: React.MutableRefObject<EntryDescription[]>,
): Extension {
  const accountSource: CompletionSource = (context) => {
    // ... (unchanged from Task 2/3)
  };

  const payeeSource: CompletionSource = (context) => {
    const match = payeeAt(context);
    if (!match) return null;
    const descriptions = payeeDescriptionsRef.current;
    const prefix = match.prefix.toLowerCase();
    const candidates = descriptions.filter((d) =>
      d.text.toLowerCase().includes(prefix),
    );
    if (!candidates.length && !context.explicit) return null;
    return {
      from: match.from,
      options: candidates.map((d) => ({
        label: d.text,
        detail: d.kind,
        type: "text",
      })),
      validFor: /[^"]*/,
    };
  };

  return autocompletion({ override: [accountSource, payeeSource] });
}
```

- [ ] **Step 8: Run typecheck + tests**

```bash
npm run typecheck 2>&1 | head -40
npm test
```

Expected: no errors, all tests pass

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/workspace/ledger_editor.rs src-tauri/src/commands/workspace.rs src-tauri/src/lib.rs src/lib/workspace/api.ts src/lib/workspace/types.ts src/features/workspace/LedgerEditor.tsx
git commit -m "feat: payee and narration completion in description position (#77)"
```

---

## Self-Review

**Spec coverage:**

| AC | Covered by |
|----|-----------|
| 0.1 Debounce fires exactly once | Task 1 Step 1 — useCallback stabilizes runValidation |
| 0.2 validateWorkspace not in loop | Task 1 Step 1 — same fix breaks the re-render loop |
| 0.3 Blur/visibilitychange triggers save | Task 1 Step 4 |
| 0.4 No regression to Mod-s | Task 1 — keymap unchanged |
| 1.1 Ghost on posting line, Tab accepts | Task 2 — autocompletion's first item; Tab handler Step 9 |
| 1.2 Dropdown ≥2 matches | Task 2 — autocompletion handles auto-open |
| 1.3 Segment-aware filtering | Task 2 — matchesAccount |
| 1.4 Rule/history ranked first | Task 3 — contextHintsRef sort |
| 1.5 Debit/credit bias | Task 2 Step 7 — isExpenseOrIncome / isAssetOrLiability sort |
| 1.6 Cursor to amount, no reformat | Task 2 Step 7 — apply inserts account + "  " and advances cursor |
| 2.1 Payee/narration ghost in quoted string | Task 4 Step 7 — payeeSource |
| 2.2 Tagged payee vs narration | Task 4 Step 7 — detail: d.kind |
| 2.3 Freshness after save | Task 4 Step 5 — refresh after saveActiveFile |
| 3.1 AI ghost unchanged | Tasks 1–4 — completionText prop path untouched |
| 3.2 Dropdown not on date line | Tasks 2–4 — accountAt requires indented, payeeAt requires inside quotes on header; neither auto-opens on bare date line |
| 4.1 Ctrl+Space | Task 2 Step 9 |
| 4.2 Tab precedence | Task 2 Step 9 — completionStatus check |
| 4.3 Esc priority | Task 2 Step 9 — closeCompletion first |
| 4.4 No per-keystroke backend | Tasks 2–4 — in-memory filter; only block-entry fetches hints |

**Placeholder scan:** None found.

**Type consistency:**
- `contextHintsRef: MutableRefObject<string[]>` — created Task 2, passed to `buildInstantCompletion` in Tasks 2/3/4
- `payeeDescriptionsRef: MutableRefObject<EntryDescription[]>` — created Task 4, passed alongside the others
- `buildInstantCompletion` signature grows from `(accounts, hints)` → `(accounts, hints, payees)` across Tasks 2→4; all call sites updated in each task
- `accountAt`, `payeeAt`, `postingPosition`, `blockDescriptionAt` all exported from `ledger-completions.ts` and imported in `LedgerEditor.tsx`
