# V1 Roadmap: MVP → V1 Transition Plan

This document maps the V1 PRD into milestones agents can execute. Each milestone is a coherent slice that ships value, with dependencies declared explicitly. Milestones that have no shared state can run in parallel.

For feature specs and acceptance criteria, see [`prd.md`](prd.md). This document is about ordering and dependencies, not feature definitions.

## Guiding Principles for the Transition

1. **The Rust workspace core is preserved.** Existing modules in `src-tauri/src/workspace/` (create, open, validation, source_accounts, imports, approval, ai_adapter, categorization_rules, reports, beancount, paths) stay. They are extended where needed; they are not rewritten.
2. **The UI layer is rebuilt incrementally.** Each MVP screen migrates into the new App Shell as its replacement V1 feature lands. The old screens get deleted as their V1 replacements ship — not in a single big-bang PR.
3. **No flag day.** The app stays runnable and tests stay green after every PR. If a V1 feature isn't ready, the MVP equivalent stays in place.
4. **Tag the MVP baseline first.** `git tag v0.1.0-mvp` before starting V1 work, so the foundation is always recoverable.

## Pre-Transition Setup

These tasks happen once before milestone work begins.

| Task | Notes |
|---|---|
| Tag MVP baseline | `git tag v0.1.0-mvp && git push --tags` — preserves the "this is what the MVP looked like" marker |
| Update README | Reflects MVP → V1 transition, points to PRD and this roadmap (done in this PR) |
| Add `src/styles/tokens.css` | Already created; import in `main.tsx` so V1 components can reference tokens |
| Optionally rename repo | `Ledgerly-MVP` → `Ledgerly` (local `mv` + GitHub rename). Cosmetic; doesn't block work. |

---

## Milestone Order and Dependencies

```
M1 App Shell ─┬─→ M3 Editor ─→ M6 Predictive Completion
              │
              ├─→ M4 Smart CSV Import
              │
              ├─→ M5 Documents + Settings
              │
              ├─→ M7 Git Integration
              │
              └─→ M8 Command Palette

M2 Data Integrity (runs in parallel with M1)

M9 macOS Packaging (last; gates V1 release)
```

**Critical path:** M1 → M3 → M6 (editor work).
**Parallelizable:** M2, M4, M5, M7, M8 can each run alongside M1 once foundations are in place.

---

## Milestone 1: App Shell Foundation

**Goal:** New two-column shell + Welcome Screen + workspace switcher. All existing MVP screens render inside the new shell instead of as standalone panels. From this milestone forward, the new visual language is established.

**Why first:** Everything else needs a place to render. The PRD calls this "the hidden lift" — most V1 features integrate into the shell, so the shell must exist before they can land.

**Order:**
- M1.1 App Shell skeleton — sidebar (200px) + main pane + status bar; uses `tokens.css`
- M1.2 Sidebar navigation items (Ledger, Inbox, Reports, Documents, Import, Settings; Git conditional)
- M1.3 Workspace switcher dropdown (recents from app config, "Open existing…")
- M1.4 Welcome Screen (3 cards: new blank, example, open existing; recents list)
- M1.5 Migrate existing MVP screens into the main pane (Inbox = Suggested Entry Review; Import = CSV Import setup; Reports = MVP Reports panel; Settings shell stub)

**Dependencies:** none.
**Unblocks:** M3, M4, M5, M7, M8.

---

## Milestone 2: Data Integrity Layer

**Goal:** Atomic file writes, backup snapshots, restore from snapshot, crash recovery dialog.

**Why parallel with M1:** Pure Rust work in `src-tauri/src/workspace/`. No UI dependency beyond the restore dialog. Lands quietly under everything else.

**Order:**
- M2.1 Atomic file write helper (`write_temp_then_rename` with fsync) — used by all Beancount writes
- M2.2 Snapshot creation (before every Approval, plus daily on first workspace open)
- M2.3 Snapshot retention (last 10 per workspace, automatic pruning)
- M2.4 Snapshot listing API + restore-with-pre-restore-snapshot
- M2.5 Crash recovery dialog (shown on workspace open when validation fails)
- M2.6 Settings → Snapshots UI (lands with M5)

**Dependencies:** none.
**Unblocks:** everything that writes to `.bean` files benefits, but nothing is hard-blocked.

---

## Milestone 3: Embedded Ledger Editor

**Goal:** The home screen. IDE-like editor with file tabs, session restore, Alabaster-inspired syntax highlighting, inline validation, hybrid autosave.

**Why before M6:** Predictive completion is built on top of the editor.

**Order:**
- M3.1 **ADR: Editor library choice** (CodeMirror 6 preferred per PRD; confirm and lock in). Set up dependency and basic editor rendering.
- M3.2 Tab bar + session restore (tabs persist in `.ledgerly/workspace.json`; `Cmd+W`, `Cmd+Shift+T`)
- M3.3 Beancount syntax mode + Alabaster highlighting (default text near-black; comments prominent; amounts medium weight; strings warm background tint; validation errors red)
- M3.4 Inline validation (300ms debounce; gutter indicators; tooltip on hover; status bar reflects validity)
- M3.5 Hybrid autosave (2000ms debounce; `Cmd+S` forces immediate save; dirty indicator on tabs)
- M3.6 Auto-alignment (decimal-column alignment on save; not while typing)
- M3.7 External file change detection + reload prompt
- M3.8 Bracket matching, code folding by transaction block, current-transaction background tint

**Dependencies:** M1 (App Shell), M2 (atomic writes used by save).
**Unblocks:** M6.

---

## Milestone 4: Smart CSV Import

**Goal:** Replace manual column mapping with automatic inference. In-preview duplicate detection. Auto-saved Source Mappings.

**Why parallel with M3:** Independent code paths. M4 touches Rust import logic and a new React Import screen; M3 touches the editor.

**Order:**
- M4.1 Inference engine — header pattern matching + content signal detection (Rust)
- M4.2 Date format detection across 6 formats
- M4.3 Amount convention detection (signed / debit+credit / amount+type)
- M4.4 Edge case handling (currency markers, parens negatives, non-USD block, pending flag, summary row skip)
- M4.5 In-preview duplicate detection (90-day lookback via Import Fingerprint)
- M4.6 Source Mapping auto-save behavior (silent when unchanged, prompt when adjusted)
- M4.7 New CSV Import UI matching the mockup (file metadata strip, row stats, Auto-detected badge, Unknown column treatment, +New/Duplicate badges, footer status row, keyboard hints)
- M4.8 Pending Statement Row visibility in Inbox (`Pending at import` badge)
- M4.9 End-to-end AC: all three example CSVs in `docs/example-statements/` import without manual mapping

**Dependencies:** M1 (App Shell for the Import screen layout).
**Unblocks:** Documents auto-filing (M5.1).

---

## Milestone 5: Documents + Settings

**Goal:** Documents file browser with per-Source-Account folders and auto-filing. Settings multi-section surface with AI Adapter auto-detection, snapshot restore, etc.

**Why parallel with M3/M4:** Independent surface. Touches different Rust commands and React components.

**Order:**
- M5.1 Documents folder structure on workspace creation; auto-filing CSV on import (depends on M4 for the auto-file hook)
- M5.2 Documents browser UI (folder tree + file list + inline preview)
- M5.3 Settings shell + sub-nav
- M5.4 Settings → AI Adapter (auto-detection of Claude Code CLI, Codex CLI, OpenCode; manual override; Test adapter; AI Context Disclosure)
- M5.5 Settings → Updates (toggle + check now + version display) — full implementation lands with M9
- M5.6 Settings → Workspace (display name editable, path, base currency, books start date)
- M5.7 Settings → Source Accounts (list, rename, close, edit opening balance)
- M5.8 Settings → Categorization Rules (list, edit, disable, delete)
- M5.9 Settings → Git Identity (conditional on git repo, reads/writes git config)
- M5.10 Settings → Snapshots (list + restore action; backed by M2)
- M5.11 Settings → Privacy (policy display + crash reporting toggle, default off)

**Dependencies:** M1 (App Shell), partially M4 (auto-filing), partially M2 (snapshot restore UI).

---

## Milestone 6: Predictive Entry Completion

**Goal:** Tab-to-complete transaction entries in the editor. Ghost text shows full predicted transaction.

**Order:**
- M6.1 Completion source layer (Rust) — rules first, history second, AI adapter third
- M6.2 Editor integration — ghost text rendering, `Tab` accept, `Escape` dismiss, real-time update
- M6.3 AI Adapter `complete` task type extension
- M6.4 Constraint enforcement (accounts must exist in chart of accounts; amounts only from history)

**Dependencies:** M3 (editor must exist).

---

## Milestone 7: Git Integration

**Goal:** Detect git repo, silently auto-commit Approvals and manual edits, expose Git panel for history and custom commits.

**Order:**
- M7.1 Git repo detection on workspace open + `.gitignore` management
- M7.2 Silent auto-commit on Approval (default message: `ledgerly: approve N entries (YYYY-MM)`)
- M7.3 Silent auto-commit on manual edits (60s debounce + on workspace close; default message: `workspace backup <ISO 8601>`)
- M7.4 Git panel UI (branch, working tree, recent commits, diff viewer)
- M7.5 "Commit with custom message…" action
- M7.6 Failed commit handling (non-blocking warnings, never block operations)

**Dependencies:** M1 (App Shell for nav item + Git panel).

---

## Milestone 8: Command Palette

**Goal:** `Cmd+K` global overlay for keyboard-driven navigation and actions.

**Order:**
- M8.1 Modal + fuzzy search + keyboard navigation
- M8.2 Required commands implementation (Go to *, Open file, Import CSV, Run Validation, Open Git panel, Commit with message, New entry, Switch workspace, Close workspace)
- M8.3 Recently used commands at top

**Dependencies:** M1 (App Shell). M7 commands are conditional on git detection.

---

## Milestone 9: macOS Packaging

**Goal:** Signed, notarized `.app` + `.dmg` distributed via GitHub Releases. Auto-update on launch.

**Why last:** Packaging the still-changing app produces churn. Ship packaging once V1 features are functionally complete.

**Order:**
- M9.1 Apple Developer cert + signing pipeline in CI
- M9.2 Notarization workflow (staple ticket, verify Gatekeeper passes)
- M9.3 Auto-update mechanism (Tauri updater plugin or equivalent — see PRD Open Technical Decisions)
- M9.4 GitHub Releases distribution
- M9.5 Settings → Updates fully wired

**Dependencies:** Everything else feature-complete and stable.

---

## Beyond V1

Once V1 ships, the V1.1 and V1.2 roadmap items begin (see [`prd.md`](prd.md) → Roadmap Beyond V1):

- **V1.1:** Bean Query Language (BQL) engine + Ask Ledgerly natural-language Q&A
- **V1.2:** Proactive Insights + Multi-currency support (with beanprice integration)
- **Post-V1.2:** Crypto support, Paid Sync Service, Linux + Windows, Bank Feeds, Migration Wizard, Collaboration, etc.

V1 is the foundation that makes those land cleanly.
