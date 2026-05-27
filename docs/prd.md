# Ledgerly PRD

This document is the authoritative product specification for Ledgerly V1. It is written for contributors and agents implementing features. Each V1 feature includes acceptance criteria precise enough to implement and verify without follow-up questions.

---

## Product Definition

Ledgerly is a local-first, FOSS desktop accounting workspace for technical operators who want transparent, portable books. It stores all accounting data in plain Beancount-compatible text files that the user owns. AI and automation assist but never write to the ledger without explicit human approval.

**License:** GPL v3. The app is free forever. A separate commercial sync service will be offered post-V1.

**Tagline:** *Own your books. Let AI help.*

---

## Ideal Customer Profile (V1)

**The Founder-Operator**: a technically literate solo business owner who runs their own books. They are comfortable with text files, terminal tools, and version control. They are frustrated by accounting software opacity — they want to see exactly what changed and why. They may already use Beancount, Fava, or plain-text accounting tools.

**Concrete profile:** A freelance developer or indie SaaS founder doing their own bookkeeping. Runs macOS. Uses git for everything. Has a Chase checking account and a Stripe account. Wants a P&L they can trust without clicking through 14 QuickBooks screens.

**Who V1 is not for:** bookkeepers managing multiple clients, firms, payroll-heavy businesses, ecommerce, multi-entity, or non-technical users.

---

## Product Principles

1. **The ledger is the product.** Every other feature exists to help the Founder-Operator maintain a clean, trustworthy Beancount ledger. The ledger screen is the home screen.
2. **AI proposes. Humans approve.** No AI action writes to the ledger. Every change is a reviewable diff that the Founder-Operator explicitly approves.
3. **Ledger-grounded AI.** Every AI feature that produces a number, a category, or an insight must do so by querying the actual ledger or workspace data — not by reasoning about it from prompt context alone. AI outputs cite the entries that produced them. Numbers are never generated; they are computed and surfaced. This applies to V1 categorization and predictive completion, and to every future AI feature.
4. **You own your files.** All accounting data lives in the local workspace folder as readable Beancount-compatible text files. No Ledgerly cloud account is required to use the app.
5. **Transparent and reversible.** Every approved entry is traceable to its source. Every change is visible and undoable.
6. **Built for keyboards.** The ICP lives in their editor. Ledgerly should feel fast and navigable without touching the mouse.
7. **Calm and private.** Ledgerly does not phone home with accounting data. Performance budgets are part of the product, not implementation details.

---

## Beancount Compatibility

Ledgerly implements its own Beancount-compatible parser. It does **not** bundle or fork the Beancount library. The portability promise is about **exit**: a Ledgerly workspace is always a valid Beancount project. Importing arbitrary external Beancount projects is a post-V1 feature.

**Beancount version target:** V3. Ledgerly's parser, validator, and writer all target Beancount V3 syntax and semantics. Directives Ledgerly writes (`open`, `close`, `balance`, `pad`, `txn`, metadata) are V3-compatible.

**Acceptance criteria — interoperability:**
- [ ] A Ledgerly workspace can be opened in [Fava](https://github.com/beancount/fava) without errors
- [ ] A Ledgerly workspace can be validated with the `bean-check` CLI (V3) without errors
- [ ] A valid Beancount file manually placed in the workspace and included from `main.bean` does not cause Ledgerly to crash or corrupt the workspace
- [ ] Ledgerly writes only valid Beancount V3 directives
- [ ] Ledgerly does not write any directives or syntax that are not valid Beancount V3

---

## Scope: MVP → V1

The MVP (internal proof-of-concept) proves the core accounting loop. V1 is the first public release.

### What the MVP already delivers (inherited in V1)

| Feature | Notes |
|---|---|
| App-Created Workspace lifecycle | Create, open, close a local workspace folder |
| Starter Chart of Accounts | Small editable set of Beancount accounts for a cash-basis US service business |
| Source Account setup | Add bank/credit-card accounts with optional Opening Balances |
| CSV Import | Drag-drop CSV, map columns, import Statement Rows into Staging Area |
| Source Mapping | Saved column mapping per Source Account, reused on future imports |
| Import Fingerprint deduplication | Prevents re-importing the same rows |
| Suggested Entry review | Entry Preview + Journal Detail for each pending Statement Row |
| Approval | Writes Suggested Entry to Monthly Transaction File with Ledgerly Entry Metadata |
| Categorization Rules | User-confirmed, source-scoped rules that prefill future suggestions |
| Transfer Match | Detect and approve inter-account transfers as one balanced entry |
| BYO AI Adapter | Optional local adapter (stdin/stdout) for AI-assisted suggestions |
| Broken Provenance detection | Surface entries whose metadata link to Staging Area was broken |
| Ledger Validation | Structural validation; blocks Approval and Reports during Invalid Ledger State |
| MVP Reports | Income Statement, Expense Breakdown, Source Account Balances, Balance Sheet |

### What V1 adds

1. **App Shell** — two-column sidebar + main-pane shell that all inherited MVP features integrate into
2. **Welcome Screen** — first-launch and no-workspace state
3. **Embedded Ledger Editor** — the home screen; IDE-like editing of `.bean` files
4. **Predictive Entry Completion** — tab-to-complete transaction entries
5. **Documents** — per-source-account file browser with auto-filing
6. **Settings** — AI adapter, updates, workspace info, source accounts, rules, git identity, snapshot restore
7. **Git Integration** — silent auto-commits, modal commit prompt on Approval, history panel
8. **Command Palette** — keyboard-driven command search
9. **macOS Packaging** — signed, notarized `.app` and `.dmg` for distribution
10. **Data Integrity layer** — atomic file writes, backup snapshots, crash recovery

> **App shell is the hidden lift.** The current MVP UI is a flat collection of standalone React panels. V1 requires assembling those into a coherent shell. Agents implementing V1 should treat the app shell as a substantial restructuring of the existing UI layer, not a small addition.

---

## V1 Feature Specifications

### 1. App Shell

The structural container that holds all other screens. Built once; every other V1 feature lives inside it.

#### Layout

- Two-column split: narrow sidebar (~200px) on the left, main pane on the right
- The sidebar is fixed-width; the main pane is fluid
- A thin status bar runs across the bottom of the main pane (not full-width)

#### Sidebar contents

- Top: workspace name with a chevron (`⌄`) that opens the workspace switcher dropdown
- Navigation items, vertically stacked, with monoline icons:
  - **Ledger** (default active when a workspace is open)
  - **Inbox** (with badge count of pending Statement Rows)
  - **Reports**
  - **Documents**
  - **Import**
  - **Git** (shown only when a git repo is detected)
  - **Settings**
- Active item: subtle pastel accent background pill
- Bottom: settings gear icon (also reachable via the nav item — gear is a convenience)

#### Workspace switcher dropdown

- Clicking the chevron next to the workspace name opens a dropdown
- Lists up to 10 recent workspaces (display name + truncated path, most-recent first)
- Workspaces whose folder no longer exists at the recorded path appear grayed out with a "Remove from recents" action
- Bottom of the dropdown has an "Open existing…" action that triggers a folder picker
- The recents list persists in app config (not in the workspace itself), keyed by absolute path
- Workspace display name is the user-provided name stored in `workspace.json`, not the folder name

#### Status bar

- Always visible across all screens
- Left side: current file or screen context (e.g., `main.bean · Ln 42, Col 1` in the editor; `Inbox` in the Inbox)
- Right side: ledger validity (`✓ Valid` or `✗ N errors`) and, when git is detected, uncommitted-changes indicator (`● 3 uncommitted`)

#### Acceptance criteria

- [ ] Two-column shell renders on every screen except the Welcome screen
- [ ] All inherited MVP panels (Source Account setup, CSV Import, Suggested Entry Review, Categorization Rules, MVP Reports, AI Adapter config) integrate into the main pane based on active nav item
- [ ] Workspace switcher dropdown shows the recents list, grays out missing workspaces, and includes "Open existing…"
- [ ] The Git nav item is hidden when the workspace folder is not a git repo
- [ ] The status bar updates context as the active screen changes

---

### 2. Welcome Screen

The first thing the Founder-Operator sees when launching Ledgerly with no workspace open.

#### When it shows

- First-ever launch (no recents, no workspace open)
- App reopens with no last-opened workspace (or last-opened was removed)
- Founder-Operator chooses "Close workspace" from a menu

#### Layout

- No sidebar, no main shell — full-window centered layout
- Ledgerly wordmark/logo at the top
- Three large card-style options below:

| Option | Action |
|---|---|
| **New blank workspace** | Goes to the New Workspace form with no template selected |
| **Example workspace** | Goes to the New Workspace form with the example template (starter accounts, sample entries) preselected |
| **Open existing workspace** | Opens a folder picker to open a previously App-Created Ledgerly workspace |

- Below the cards: a small recents list (if any), with up to 5 most recent workspaces as clickable entries
- Footnote at the bottom: "Your books are stored locally. No account required."

> **Open existing vs. import:** "Open existing workspace" opens a previously App-Created Ledgerly workspace (one with a `.ledgerly/workspace.json` manifest). It is **not** a general Beancount import — importing arbitrary external Beancount projects is post-V1.

#### Acceptance criteria

- [ ] Welcome screen displays on first launch with no recents
- [ ] Welcome screen displays when no workspace is open
- [ ] All three options are functional and lead to the correct flow
- [ ] Recents list shows up to 5 most recent workspaces if any exist
- [ ] Selecting "Open existing workspace" with a folder that lacks `.ledgerly/workspace.json` shows a clear error: "This folder is not a Ledgerly workspace."

---

### 3. Embedded Ledger Editor

The Ledger Editor is the default landing screen when a workspace is opened. It replaces the current Workspace Overview as the primary surface.

> **Open technical decision:** The editor library (CodeMirror 6 preferred, Monaco, or other) is not yet chosen. Requirements below are library-agnostic. CodeMirror 6 is the current preference for bundle size and extensibility.

#### File navigation and tabs

- The editor opens `main.bean` by default the first time a workspace is opened
- Subsequent opens restore the previous session: the same tabs open, the same active tab, and the cursor/scroll position per tab
- A tab bar runs across the top of the editor; each tab shows the file name and a close affordance
- A small dirty indicator (●) appears on tabs with unsaved changes
- `Cmd+W` closes the active tab; closing the last tab opens `main.bean`
- `Cmd+Shift+T` reopens the most recently closed tab
- The Founder-Operator can open any `.bean` file by clicking it in the file tree (sidebar within the editor area), via the command palette, or by clicking an `include` directive in `main.bean`
- Tab and cursor state persists per-workspace in `.ledgerly/workspace.json`

#### Editor behavior

- The editor is fully read-write; the Founder-Operator can edit `.bean` files directly
- Monospace font (JetBrains Mono or SF Mono)
- Line numbers in the left gutter
- Long lines do not wrap by default (horizontal scroll)
- Standard editor features come from the chosen library: undo/redo, find/replace, multi-cursor, select-all, go-to-line, bracket matching, code folding by transaction block

#### Save behavior — hybrid autosave

- Inline validation runs on a fast debounce: **300ms after the last keystroke**
- Save and auto-alignment fire on a slower debounce: **2000ms after the last keystroke**
- `Cmd+S` forces an immediate save, alignment, and validation run
- Save is atomic (see Data Integrity)
- The dirty indicator on tabs is only visible between autosave intervals

#### Auto-alignment

- Within a transaction block, amount columns are automatically aligned on the decimal point
- Alignment is applied at save time only; not while the user is mid-typing
- Alignment does not reformat lines the user is actively editing

#### Syntax highlighting — Alabaster-inspired (minimal)

Most tokens render in default text color (`#18181B`, near-black on white). Color and weight are used sparingly, only for tokens that carry semantic meaning.

| Element | Treatment | Rationale |
|---|---|---|
| Comments (`; ...`) | Default color, normal weight — **prominent, not muted** | Comments explain *why*; they should be readable |
| Amounts (`1,842.17`) | Default color, **medium weight** | Money is the most important data; emphasis via weight, not color |
| Strings (payee, narration) | Default color, subtle warm background tint (`#FEF8E1`) | Distinguishes data from structure without shouting |
| Account names | Default color, normal weight | Hierarchy is already structurally obvious from `:` separators |
| Validation errors | **Red gutter dot + red underline** on offending token | The one place where alarm color is justified |
| All other tokens (dates, directive keywords, currency, operators, tags, links, metadata keys) | Default color, normal weight | Structurally obvious; don't need color |

#### Functional editor features (no color impact)

- Bracket matching for `{}`, `()`, `""` (subtle outline on the matched pair)
- Code folding by transaction block; collapse all transactions in current file
- Current transaction subtle background tint (`#FAFAFA`) on the block containing the cursor

#### Inline validation

- Validation errors shown as red gutter indicators at the relevant line
- Hovering a gutter indicator shows the error message in a tooltip
- The status bar reflects ledger validity (`✓ Valid` or `✗ N errors`)
- Approval and Reports remain blocked during Invalid Ledger State (same as MVP behavior)

#### External file change detection

- If a `.bean` file is modified outside Ledgerly (External Ledger Edit), the editor detects the change and prompts the Founder-Operator to reload
- On reload, Ledger Validation runs automatically
- The editor does not silently overwrite external changes

#### Acceptance criteria

- [ ] Opening a workspace lands on the Ledger Editor; first time shows `main.bean`, subsequent opens restore prior session
- [ ] Tabs persist in `.ledgerly/workspace.json` including active tab and cursor position
- [ ] `Cmd+W` closes active tab; `Cmd+Shift+T` reopens last closed
- [ ] Editor saves automatically 2s after last keystroke; `Cmd+S` forces immediate save
- [ ] Validation feedback appears within 300ms of edit
- [ ] Comments render in default color, not muted
- [ ] Amounts render in medium weight
- [ ] Strings have a subtle warm background tint
- [ ] Validation errors are clearly visible (red gutter + underline)
- [ ] Amounts within a transaction block are decimal-aligned on save
- [ ] The block containing the cursor has a subtle background tint
- [ ] Bracket matching and code folding work as expected from a modern code editor
- [ ] Editing `main.bean` externally while the app is open triggers a reload prompt
- [ ] Approving a transaction from the Inbox returns to the Ledger Editor with the newly written entry visible

---

### 4. Predictive Entry Completion

The editor predicts complete Beancount transaction entries as the Founder-Operator types, similar to how Cursor or GitHub Copilot predict code.

#### Trigger

- Completion is triggered when the Founder-Operator types a valid Beancount date (`YYYY-MM-DD`) at the start of a new line, followed by a space
- The editor shows a ghost-text completion of the full transaction inline (rendered in a muted color so it's clearly distinct from typed text)

#### Completion source (priority order)

1. **Categorization Rules** — if a matching rule exists for the partial description, use it to form the suggestion
2. **Approved entry history** — find the most recent approved entry with a similar payee or narration; use it as a template with the date updated
3. **BYO AI Adapter** — if configured, send the partial entry + Curated Ledger Context and use the structured AI Suggestion to fill remaining fields
4. If none of the above produce a match, no suggestion is shown

#### Interaction

- `Tab` accepts the full suggestion and inserts it at the cursor
- `Escape` dismisses the suggestion without inserting
- Continuing to type updates or dismisses the suggestion in real time
- The accepted entry is inserted as valid Beancount text; the Founder-Operator can then edit individual fields

#### Constraints

- Suggested accounts must exist in the workspace's chart of accounts — no hallucinated account names
- Suggested amounts are drawn from history, never fabricated
- The completion inserts text into the editor buffer only; autosave handles persistence
- Completion works without a configured BYO AI Adapter (falls back to rules and history)

#### Acceptance criteria

- [ ] Typing `2026-05-08 ` at the start of a new line triggers ghost-text if a matching prior entry exists
- [ ] `Tab` accepts the completion; `Escape` dismisses it
- [ ] Accepted completions only reference accounts that exist in the workspace chart of accounts
- [ ] Completion works without a BYO AI Adapter configured
- [ ] When an AI Adapter is configured, it is used as the final fallback after rules and history
- [ ] No suggestion appears if no matching history, rule, or AI result exists

---

### 5. Inbox

> **Inherited from MVP.** The Inbox screen is the existing MVP Suggested Entry Review experience integrated into the V1 app shell. The functional behavior — pending Statement Rows, suggestions, Approval, Transfer Match approval — is unchanged from the MVP. V1 wraps it in the new shell, gives it a sidebar nav item with a pending-count badge, and uses the V1 visual language.

#### V1-specific additions

- Inbox nav item shows a count badge of pending Statement Rows
- Approving an entry navigates back to the Ledger Editor with the new entry visible at the cursor position (closes the loop between Inbox and Ledger)
- Inbox layout uses the shared status bar and sidebar; no standalone navigation

---

### 6. Documents

A file browser for the workspace's `documents/` folder. Hybrid passive browser + light attachment system.

#### Folder structure

- `documents/` contains one subfolder per Source Account (e.g., `documents/chase-checking/`, `documents/amex-platinum/`)
- Additional subfolders may exist for general documents: `documents/receipts/`, `documents/contracts/`, `documents/other/`
- The Founder-Operator can create additional subfolders as needed

#### Auto-filing

- When the Founder-Operator runs a CSV Import for a Source Account, the original CSV file is copied (not moved) into the corresponding source account subfolder, named with the import date (`2026-05-08_chase_statement.csv`)
- Bank statement PDFs dragged into the Documents screen with a Source Account selected are auto-filed into that account's subfolder

#### Documents screen UI

- Folder tree on the left (source account folders + custom folders)
- File list on the right showing files in the selected folder
- File preview pane on the right for selected file (basic preview for PDFs, images, text; opens externally for other types)
- Drag-and-drop into a folder to add files
- Right-click to delete, rename, or open in Finder

#### File types supported

- PDFs (preview inline)
- Images (PNG, JPG, HEIC — preview inline)
- Text files including CSVs (preview inline)
- Any other file type can be added but opens externally

#### Acceptance criteria

- [ ] On workspace creation, a `documents/` folder is created with `.gitkeep`
- [ ] When a Source Account is added, a subfolder is created under `documents/` with the account's slug
- [ ] CSV Imports copy the original CSV to the matching source account subfolder
- [ ] The Documents screen shows the folder tree and lets the Founder-Operator browse files
- [ ] PDFs, images, and text files preview inline
- [ ] Drag-and-drop into a folder adds the file
- [ ] Files in `documents/` are committable to git (not in `.gitignore`)

---

### 7. Settings

Configuration surface for the workspace and the app. Several subsections, each independently navigable.

#### a. AI Adapter

- Auto-detects available agent harnesses on launch. V1 supports: **Claude Code CLI**, **OpenAI Codex CLI**, and optionally **OpenCode** if its CLI is on `PATH`.
- Shows a list of detected adapters with: name, command path, status (`Available` / `Not found`), and a "Set as default" radio button
- Manual override: the Founder-Operator can enter a custom adapter command
- "Test adapter" button sends a small Curated Ledger Context payload and shows the structured response (or error)
- AI Context Disclosure: an always-visible expandable section showing exactly what data Ledgerly sends to the adapter

#### b. Updates

- Toggle: "Check for updates on launch" (default on)
- "Check now" button
- Current version display

#### c. Workspace

- Workspace display name (editable)
- Workspace path (read-only, with "Show in Finder" button)
- Base currency (USD only in V1, but shown as a configurable field for forward compatibility)
- Books start date (editable, with warning if changed after entries exist)

#### d. Source Accounts

- List of all Source Accounts in the workspace
- Per-account actions: rename, close (writes a `close` directive), edit opening balance
- "Add Source Account" button (opens existing MVP setup flow)

#### e. Categorization Rules

- List of all confirmed Categorization Rules with Source Account scope and target Ledger Account
- Per-rule actions: edit description match, change target account, delete
- Toggle to disable a rule temporarily

#### f. Git Identity

- Shown only when a git repo is detected
- Displays the git `user.name` and `user.email` that Ledgerly will use for its commits (read from `git config`)
- Editable: override locally for this workspace
- Warning if neither global nor local git config is set: "Set a git identity to enable commits"

#### g. Snapshots

- List of recent snapshots from `.ledgerly/snapshots/` with timestamp, affected files, and a "Restore" action
- Snapshots are created automatically before every Approval and on a daily schedule
- Last 10 snapshots are retained; older ones are pruned automatically
- The "Restore" action replaces the current file content with the snapshot version after confirmation, and runs Ledger Validation

#### h. Privacy

- Read-only display of the Privacy section content
- Toggle: "Send anonymous crash reports" (default **off**)

#### Acceptance criteria

- [ ] AI Adapter section auto-detects Claude Code CLI and Codex CLI on launch
- [ ] OpenCode is auto-detected if its CLI is on `PATH`
- [ ] Manual adapter command can be entered and tested
- [ ] AI Context Disclosure is visible and accurate
- [ ] Update preferences are persisted and respected
- [ ] Workspace name change updates `workspace.json` and the sidebar
- [ ] Source Account list reflects all accounts in the workspace
- [ ] Categorization Rules list shows all confirmed rules with edit/delete/disable
- [ ] Git Identity section is hidden when no git repo is detected
- [ ] Snapshots list shows the last 10 with timestamps and Restore actions
- [ ] Privacy section displays the policy and crash reporting toggle (default off)

---

### 8. Git Integration

Optional git behavior, activated when the workspace folder is inside a git repository.

#### Detection

- On workspace open, Ledgerly checks whether the workspace folder is inside a git repository
- If detected: Git nav item appears in sidebar, auto-commit behavior activates, and `.gitignore` is verified
- If not: no git UI is shown anywhere
- Ledgerly does not initialize a git repo automatically

#### Auto-commit behavior

All commits are silent with auto-generated default messages. No modal prompts during the routine flow.

| Trigger | Commit message | Files staged |
|---|---|---|
| Approval | `ledgerly: approve N entries (YYYY-MM)` | Affected Monthly Transaction File(s), updated `main.bean` includes |
| Manual edits (autosave debounce, 60s after last edit, or on workspace close) | `workspace backup <ISO 8601 timestamp>` | Any modified files outside `.ledgerly/` |

- Auto-commits do not require Founder-Operator action
- Failed commits surface as a non-blocking notice in the Git panel (and a warning in the status bar) but never block Ledgerly operations
- The Git panel allows the Founder-Operator to make a one-off commit with a custom message — this is the only manual commit path in V1

#### Git panel

- Sidebar nav item: "Git" (shown only when repo detected)
- Shows current branch name, working tree status, and recent commit history (last 20 commits with date, short hash, message)
- "Commit with custom message…" action: opens a small form with file checkboxes (default all checked) and message field
- View diff of any recent commit (in-app diff viewer, monospace, +/- with sage green / soft red backgrounds)

#### `.gitignore` management

- On workspace creation or first detection of a git repo, Ledgerly ensures `.ledgerly/` and `.ledgerly/snapshots/` are excluded
- Beancount files, `workspace.json`, and `documents/` contents are committable

#### Constraints

- Ledgerly does not manage `git push`, `git pull`, or remote operations
- Ledgerly does not create branches
- Ledgerly does not resolve merge conflicts
- If a commit fails due to a pre-commit hook, Ledgerly shows the hook output in the Git panel

#### Acceptance criteria

- [ ] Opening a workspace inside a git repo activates git features; outside a git repo shows no git UI
- [ ] Approval triggers a silent commit with the default message
- [ ] Manual edits trigger an auto-commit on 60s debounce and on workspace close
- [ ] The Git panel shows the current branch, modified files, and last 20 commits with diff views
- [ ] `.ledgerly/` is present in `.gitignore` after workspace creation or first git detection
- [ ] All Ledgerly features work identically in a workspace with no git repo
- [ ] Git Identity section in Settings is shown only when a git repo is detected
- [ ] Failed commits surface as non-blocking warnings, never block app operation

---

### 9. Command Palette

A keyboard-driven command palette for navigating and executing actions without the mouse.

#### Activation

- `Cmd+K` opens the command palette
- `Escape` or clicking outside closes it without executing

#### Behavior

- Opens with an empty search field and a list of available commands
- Typing filters commands with fuzzy search (matches anywhere in command name)
- Arrow keys navigate the list; `Enter` executes the selected command
- Recently used commands appear at the top of the unfiltered list

#### Required commands for V1

| Command | Action |
|---|---|
| Go to Ledger | Navigate to Ledger Editor |
| Go to Inbox | Navigate to Inbox |
| Go to Reports | Navigate to Reports |
| Go to Documents | Navigate to Documents |
| Go to Import | Navigate to CSV Import |
| Go to Settings | Navigate to Settings |
| Open file… | Open a `.bean` file from the workspace by name |
| Import CSV… | Open the CSV import flow |
| Run Ledger Validation | Trigger manual ledger validation |
| Open Git panel | Navigate to Git panel (when git is detected) |
| Commit with message… | Open the manual commit form (when git is detected) |
| New entry | Position cursor at end of current month's transaction file |
| Switch workspace… | Open the workspace switcher |
| Close workspace | Return to Welcome screen |

#### Acceptance criteria

- [ ] `Cmd+K` opens the palette from any screen (except Welcome)
- [ ] Typing filters commands with fuzzy match
- [ ] Arrow keys and `Enter` navigate and execute
- [ ] `Escape` closes without executing
- [ ] All commands in the required set are present and functional
- [ ] Recently used commands appear at the top on next open

---

### 10. macOS Packaging and Distribution

V1 ships as a properly signed and notarized macOS application.

#### Requirements

- Packaged as a `.app` bundle
- `.dmg` disk image provided for installation
- Code-signed with a valid Apple Developer ID certificate
- Notarized by Apple (passes Gatekeeper on first launch without warnings)
- **Architecture: Apple Silicon (`arm64`) only for V1**. Universal binary deferred to a later release if Intel demand appears.
- Target macOS 13 Ventura or later
- Distributed via GitHub Releases (not the Mac App Store)

#### Auto-update

- The app checks for new releases on launch (Tauri updater plugin or equivalent — see Open Technical Decisions)
- Non-blocking notification when an update is available
- Updates can be deferred; the app is fully usable without updating
- The Founder-Operator can disable update checks in Settings

#### Acceptance criteria

- [ ] The `.dmg` mounts and installs the app to `/Applications` without error
- [ ] Double-clicking the app on a clean macOS 13+ Apple Silicon system opens Ledgerly without a Gatekeeper warning
- [ ] `codesign --verify --deep --strict Ledgerly.app` passes
- [ ] `spctl --assess --type execute Ledgerly.app` passes
- [ ] A GitHub Release contains the signed `.dmg` as an attached asset
- [ ] Launching the app when a newer version is available shows an update notification
- [ ] The app functions fully with update checks disabled

---

## Data Integrity

Ledgerly is accounting software. Data loss is catastrophic. V1 ships with explicit guarantees.

### Atomic file writes

- Every `.bean` file mutation uses write-temp-then-rename with fsync
- Sequence: write new content to `<file>.tmp`, fsync the temp file, rename `<file>.tmp` to `<file>` atomically
- A `SIGKILL` mid-write leaves the file either unchanged or with the complete new content — never partial

### Backup snapshots

- Before every Approval, Ledgerly takes a snapshot of all `.bean` files in the workspace to `.ledgerly/snapshots/<ISO-8601-timestamp>/`
- A daily snapshot is taken automatically on first workspace open of the day
- Last 10 snapshots retained; older ones pruned automatically
- Snapshots are excluded from git (via `.gitignore`)

### Restore from snapshot

- The Settings → Snapshots section lists recent snapshots
- "Restore" replaces the current state with the snapshot after confirmation
- Restore creates an additional snapshot of the current state first (rollback safety)
- After restore, Ledger Validation runs automatically

### Crash recovery

- On workspace open, Ledger Validation runs
- If validation fails (suggesting partial-write or corruption), Ledgerly surfaces an explicit recovery dialog with the option to restore from the most recent snapshot

### Acceptance criteria

- [ ] Killing the app mid-write (verifiable with SIGKILL during an Approval) leaves the `.bean` file either unchanged or with the complete new entry
- [ ] Every Approval creates a snapshot before mutation
- [ ] A daily snapshot is created on first workspace open per day
- [ ] At most 10 snapshots are retained per workspace
- [ ] The Settings → Snapshots section shows snapshots with timestamps and Restore actions
- [ ] Restore creates an additional pre-restore snapshot before reverting
- [ ] On workspace open with corrupted files, the recovery dialog appears with a restore option

---

## Performance Budgets

Performance is a product feature, not an implementation detail. Ledgerly should never make the Founder-Operator wait. Expensive work happens in the background; the UI responds first.

### Inherited from MVP

```
App shell visible:          < 500ms
Workspace sidebar visible:  < 300ms from cache
Inbox cached render:        < 200ms
Report cached render:       < 300ms
Simple search:              < 150ms
Approval UI response:       < 100ms
Full validation:            background
AI classification:          background
CSV import processing:      background
```

### V1 additions

```
Editor first paint:               < 200ms after workspace open
Syntax highlighting (1000 lines): < 100ms
Inline validation debounce:       300ms after last keystroke
Save + alignment debounce:        2000ms after last keystroke
Predictive completion latency:    < 150ms (local) / < 800ms (AI Adapter)
Tab switch:                       < 50ms
Git status refresh:               < 100ms
Atomic file write (10KB file):    < 50ms
Snapshot creation:                background, < 500ms typical
```

These are budgets, not benchmarks. They define the bar; specific performance tests live alongside the implementation.

---

## Privacy

Ledgerly does not transmit accounting data to any server.

### Allowed network requests in V1

- **Update checks** to GitHub Releases (configurable; can be disabled in Settings). Transmits only IP and a `Ledgerly version X` user agent.
- **Crash reports** (opt-in, **off by default**). When enabled, sends stack traces and app version — no workspace data, no file contents.
- **BYO AI Adapter calls**, fully controlled by the user's adapter command. Curated Ledger Context is built by Ledgerly and disclosed in Settings → AI Adapter.

### Not transmitted, ever

- `.bean` file contents
- Workspace structure or names
- Source Account names or balances
- Statement Row data
- Categorization Rules
- Anonymous usage statistics (not implemented in V1)

This list is not aspirational — agents implementing V1 must not add additional outbound requests without explicit PRD changes.

---

## Out of Scope for V1

The following are explicitly deferred. Do not let them creep into V1 scope.

- Sync service (multi-device, encrypted backup)
- Import of arbitrary external Beancount files
- Collaboration / shared workspaces
- Bank feeds (Plaid, Teller, direct connections)
- Payroll
- Invoicing and Accounts Receivable
- Customers / contacts
- Tax filing or tax reports
- Multi-currency (USD only in V1)
- Mobile (iOS, Android)
- Windows support
- Linux support
- Plugin marketplace
- Natural language report queries
- AI narrative reports
- Accountant portal or client-facing features
- Anonymous usage statistics
- Dark mode (light mode only in V1)
- Universal binary (Apple Silicon only in V1)
- Per-transaction document attachment (Documents in V1 is folder-based only)

---

## Open Technical Decisions

| Decision | Context | Options | Status |
|---|---|---|---|
| Ledger editor library | Affects bundle size, extensibility, syntax highlighting API, completion API | CodeMirror 6 (preferred), Monaco Editor, others | Open — evaluate before implementing |
| Auto-update mechanism | Tauri has a built-in updater; needs configuration for GitHub Releases | Tauri updater plugin, custom GitHub Releases poller | Open — evaluate during packaging work |

---

## Roadmap Beyond V1

Captured here so contributors understand what V1 is building toward. Items are tiered by target release.

### V1.1: Ask Ledgerly (plain-language Q&A)

Founder-Operator can ask the ledger questions in plain English: *"How much did I spend on software last month?"* *"What were my top three vendors in Q1?"* *"Show me all transactions over $500 in May."*

**Design requirements (per the Ledger-grounded AI principle):**
- A new "Ask" surface — likely a dedicated screen or a command-palette-style overlay accepting natural language
- The BYO AI Adapter contract is extended with a `query` task type alongside existing `categorize` and `complete` tasks
- The adapter translates the question into a deterministic ledger query (account filter, date range, aggregation). It does **not** answer the question itself.
- Ledgerly runs the translated query against the actual ledger and produces the answer
- Every answer cites the entries that produced it — clickable to jump to the entry in the Ledger Editor
- Hallucinated numbers must be structurally impossible (the answer never contains a number that didn't come from the query result)
- Works without a BYO AI Adapter: a manual query builder (account picker, date range, aggregator) provides the same capability for users without AI

### V1.2: Proactive Insights

Ledgerly notices patterns and surfaces them: *"Restaurant spending is 38% higher than the trailing six-month average."* *"This OpenAI charge looks like it might belong in Subscriptions, not Software."* *"You've paid AWS twice this month."*

**Design requirements:**
- Insights surface as a dedicated screen ("Insights" nav item) plus subtle inline indicators on related ledger entries
- Insights are generated only after a workspace has at least 90 days of approved entries (baseline data required)
- Each insight cites the specific entries that triggered it and is dismissible
- Insights never auto-act on the ledger; they are suggestions only
- Founder-Operator can disable categories of insights they find noisy (e.g., "Mute anomaly alerts under $50")
- AI Adapter contract is extended with an `insight` task type that runs against curated workspace summaries

### Paid Sync Service
Optional commercial service. Multi-device sync, encrypted backup, workspace sharing with clients or bookkeepers. Technical users can use git as a free alternative.

### Beancount Import / Migration Wizard
A dedicated flow to import an existing arbitrary Beancount project into a Ledgerly workspace. Handles non-standard include structures, custom account layouts, and missing Ledgerly metadata.

### Invoicing and Customers
Long-term vision. Everything must remain text-file based — no proprietary database records. Open design questions: how to represent receivables in a Beancount-compatible structure, how to link invoice files to journal entries, and how to manage customer metadata as plain text.

### Per-Transaction Document Attachment
V1's Documents screen is folder-based. A future version will link specific documents to specific ledger entries via metadata (`document: "documents/receipts/2026-05-08-aws.pdf"`), with the entry detail view showing inline previews.

### Collaboration
Invite a bookkeeper or accountant to a shared workspace. Review queues, comments on transactions, prepared/reviewed states, month-end close checklist, role-based access. Requires Sync Service as a prerequisite.

### Bank Feeds
Direct bank connections via Plaid, Teller, or equivalent. Cloud-mediated; requires a Ledgerly backend service.

### Linux and Windows
Cross-platform support. Tauri architecture preserves this path. Ship after macOS V1 is validated.

### Universal Binary
Add Intel `x86_64` to the macOS build if real demand surfaces from Intel-Mac users.

### Dark Mode
Light mode only in V1. Dark mode is a clear future addition; the Alabaster-inspired highlighting palette translates cleanly to a dark variant.

---

## Glossary

This PRD uses the canonical terms defined in `CONTEXT.md`. When a term appears capitalized (e.g., Founder-Operator, Suggested Entry, Approval, Staging Area), it has the precise meaning defined there.

Additional terms introduced in V1:

**App Shell**: The two-column sidebar + main-pane structural container that all V1 screens render inside (except the Welcome screen).

**Welcome Screen**: The full-window centered layout shown when no workspace is open, offering New blank, Example, or Open existing workspace options.

**Ledger Editor**: The embedded code editor that displays and allows editing of the workspace's Beancount files. The home screen of V1.

**Predictive Entry Completion**: The editor feature that offers ghost-text completion of a full Beancount transaction entry as the Founder-Operator types, accepting on Tab.

**Workspace Switcher**: The dropdown attached to the workspace name in the sidebar that lists recent workspaces.

**Snapshot**: A timestamped backup of all `.bean` files in the workspace, created automatically before Approvals and on a daily schedule, stored in `.ledgerly/snapshots/`.

**Git Integration**: Optional Ledgerly behavior that detects a git repository in the workspace folder and silently auto-commits changes.

**Command Palette**: A keyboard-activated (`Cmd+K`) fuzzy-search interface for navigating and executing app commands.
