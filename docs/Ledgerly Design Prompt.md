---
title: Diurnum Design Prompt
type: Note
belongs_to: "[[Diurnum]]"
date: 2026-05-26
tags:
  - diurnum
  - design
---

# Diurnum Claude Design Prompt

Comprehensive prompt for generating screen mockups of all V1 screens. Paste into Claude Design to generate a full set of mockups covering every surface agents will be building.

---

Design a complete set of screens for **Diurnum** — a local-first desktop accounting app for technical founders. Files are plain Beancount text. AI assists but never writes to the ledger without human approval. The app prioritizes calm, precise, keyboard-driven interaction.

---

## Design System (apply to every screen)

**Layout shell:**
Two-column split. Narrow sidebar (~200px, `#F4F4F5` background) on the left; main content area (`#FFFFFF`) on the right. Hairline border (`#E4E4E7`) separates them. A thin status bar runs across the bottom of the main pane.

**Sidebar:**

- Top: workspace name ("Acme Studio") with a small `⌄` chevron for switching workspaces
- Nav items with small monoline icons, vertically stacked: Ledger, Inbox (with badge count), Reports, Documents, Import, Git (conditional — only shown when a git repo is detected), Settings
- Active item: soft sage green pill highlight (`#E6F4EA` background, `#2D6A4F` text/icon)
- Bottom: settings gear icon

**Typography:**

- UI chrome: Inter or system sans-serif, 13–14px
- Ledger/code content: JetBrains Mono or SF Mono, 13px
- Section labels: 12px caps in `#71717A`; primary text in `#18181B`

**Color palette:**

- Background: `#FFFFFF` (main), `#F4F4F5` (sidebar, rows, page chrome)
- Borders: `#E4E4E7` hairlines only — no shadows
- Accent: sage green — `#2D6A4F` (text/icon), `#E6F4EA` (background), `#4ADE80` (badges/indicators)
- Destructive/error: `#FEE2E2` background, `#DC2626` text
- Muted: `#71717A`

**Tone:** Precise, calm, confident. Think Linear meets VS Code meets a well-designed terminal app. No gradients. No heavy shadows. Dense-but-breathable information layout.

---

## Screen 1: Ledger Editor (home screen)

The default screen when a workspace opens. The most important surface.

- Sidebar nav: **Ledger** is active. Inbox shows badge `(4)`
- Top of main area: a tab bar showing open files — `main.bean` (active), `transactions/2026-05.bean`, `accounts.bean`. Each tab has a close `×`. Active tab has a subtle bottom border in sage green.
- Full-height code editor below the tab bar:
  - Line numbers in `#A1A1AA` gutter
  - 5–6 Beancount transactions rendered with **Alabaster-inspired minimal syntax highlighting**:
    - **Default text color for almost everything**: `#18181B` (near-black) — dates, directive keywords, account names, currency codes, operators
    - **Comments** (`; ...`): default color, normal weight — **prominent, not muted** (opposite of typical themes)
    - **Amounts** (`1,842.17`): default color, **medium font weight** for visual emphasis
    - **Strings** (`"OpenAI"`, `"ChatGPT subscription"`): default color with a subtle warm background tint `#FEF8E1` (like a highlighter)
    - **No color shifts on tokens** — emphasis comes from weight and subtle background, not foreground color
  - Amounts are decimal-aligned within each transaction block
  - The transaction block containing the cursor has a very subtle background tint `#FAFAFA`
  - One entry has a **red gutter dot + red underline** on an offending account name — the one place alarm color is justified, since validation errors must be impossible to miss. Soft inline tooltip: `"Account 'Expenses:Meals' is not open"`
  - At the bottom of the editor, show **predictive entry completion** in action: the user has typed `2026-05-08 ` (normal text color, the cursor is at the end). Immediately following the cursor, render ghost text in `#A1A1AA` (muted gray) showing a complete predicted transaction (`* "Stripe" "Payout"` on the first line, then two indented postings: `Assets:Bank:Chase  1,842.17 USD` and `Income:Sales  -1,842.17 USD`). At the end of the ghost-text block, a small pill-shaped hint badge: `Tab to accept` in muted text on a `#F4F4F5` background.
- Status bar at very bottom: `main.bean  ·  Ln 42, Col 1  ·  ✓ Valid` on the left, `● 3 uncommitted` on the right (when applicable) — all in `#71717A`, 12px

**The look should feel like reading prose, not code.** The eye should land on amounts, comments, and the gentle yellow-tinted payee strings — everything else recedes. The ghost-text completion should feel like the editor is gently offering, not demanding.

---

## Screen 2: Inbox

Transaction review queue — the second most-used screen.

- Sidebar nav: **Inbox** is active, badge shows `4`
- Main area header: "Inbox" (H1) + subtitle "4 pending · 31 matched by rules · 1 possible transfer"
- Filter row: Account dropdown (`Chase Checking ▾`), Date range, Status tabs: All / Pending / Matched / Transfers
- Transaction list — each row contains:
  - Date (`May 8`), Description (`OPENAI *CHATGPT`), Amount (`−$20.00`)
  - Suggested category chip: `Expenses:Software` in sage green pill
  - Source indicator: small icon for "rule" or "AI" or blank for unmatched
  - One row is selected/highlighted in `#F4F4F5`
- Right panel (detail inspector for selected row): see Screen 3

---

## Screen 3: Transaction Detail (Inbox inspector panel)

The right-side inspector shown when a transaction is selected in the Inbox. Render as the right ~380px of the Inbox screen.

- **Imported data** section: Date, Description, Amount, Source: Chase Checking
- **Suggested entry** section — rendered as a Beancount preview block using the same Alabaster-inspired highlighting from Screen 1 (default text near-black, amounts medium weight, strings with `#FEF8E1` background tint, no color shifts):
  ```
  2026-05-08 * "OpenAI" "ChatGPT subscription"
    Assets:Bank:Chase         -20.00 USD
    Expenses:Software          20.00 USD
  ```
- **Confidence** row: `AI · 91%` with a small explanation: "Matched 6 similar past entries"
- **Actions** row at bottom: `Approve` (sage green filled button), `Edit` (outline), `Reject` (ghost), `+ Create rule` (text link)
- Small `Journal Detail` toggle at bottom of Beancount preview (collapsed by default)

---

## Screen 4: Reports

Financial reports view for the selected period.

- Sidebar nav: **Reports** is active
- Header: "Reports" + period selector: `Jan – May 2026 ▾` + `Export` button (outline)
- Four summary cards in a row: Revenue `$84,200`, Expenses `$31,450`, Net Income `$52,750`, Cash Balance `$67,320` — values in large type, labels in muted small caps
- Monthly trend bar chart below cards — 5 months of bars, revenue vs. expenses, sage green / light gray
- Below chart: Income Statement table
  - Section headers: REVENUE, COST OF SALES, OPERATING EXPENSES, NET INCOME
  - Account rows with amounts right-aligned
  - Subtotal rows in slightly bolder weight
  - Drill-down chevron `›` on each account row

---

## Screen 5: CSV Import

The column-mapping step of the CSV import flow.

- Sidebar nav: **Import** is active
- Header: "Import CSV" with step indicator: `1 Upload  →  2 Map Columns  →  3 Review` (step 2 is active)
- Source Account selector at top: `Chase Checking ▾`
- Column mapping table: left column shows CSV column headers (`Date`, `Description`, `Amount`, `Balance`); right column shows Diurnum field dropdowns (`Posted Date ▾`, `Description ▾`, `Signed Amount ▾`, `Ignore ▾`)
- Preview of first 3 rows below the mapping table — rendered as normalized Statement Rows
- Option row: `☑ Save mapping for Chase Checking`, `☑ Detect duplicates`, `☑ Auto-file CSV in documents/chase-checking/`
- Bottom bar: `Cancel` (ghost), `Import 47 rows →` (sage green filled)

---

## Screen 6: Documents

A file browser for the workspace's `documents/` folder. Hybrid passive browser + light attachment system.

- Sidebar nav: **Documents** is active
- Two-pane layout inside the main area:
  - Left pane (~240px): folder tree
    - `📁 chase-checking` (active, 12 files)
    - `📁 amex-platinum` (8 files)
    - `📁 stripe` (4 files)
    - `📁 receipts` (23 files)
    - `📁 contracts` (2 files)
    - `+ New folder` action at bottom
  - Right pane: file list for the selected folder
    - Table rows: file icon, name (`2026-05-08_chase_statement.csv`, `2026-04-30_chase_statement.pdf`, etc.), modified date, size
    - Right-click menu indicated by a small `⋯` on each row hover
- Below the file list: a preview panel for the selected file (PDF/image inline preview; text/CSV in monospace)
- Top of main area: drop zone hint when dragging a file over: "Drop to add to chase-checking"

---

## Screen 7: Settings

Configuration surface. Multiple subsections, left sub-nav within the main pane.

- Sidebar nav: **Settings** is active
- Main area uses an internal two-pane layout:
  - Left sub-nav (~180px) inside the main pane lists Settings sections:
    - AI Adapter (active)
    - Updates
    - Workspace
    - Source Accounts
    - Categorization Rules
    - Git Identity (conditional)
    - Snapshots
    - Privacy
  - Right pane shows the active section's content
- Show the **AI Adapter** section as the active example:
  - Header: "AI Adapter"
  - Subtitle: "Diurnum auto-detects available agent harnesses on your machine."
  - Detected adapters list as cards/rows:
    - **Claude Code CLI** — `/usr/local/bin/claude` — `Available` (sage green dot), `◉ Default` radio
    - **OpenAI Codex CLI** — `/usr/local/bin/codex` — `Available`, `○` radio
    - **OpenCode** — `Not found` (muted), greyed out
  - "Use a custom adapter command…" — collapsible row with a code-style text input
  - `Test adapter` button (outline)
  - Below: collapsible **AI Context Disclosure** section — "Diurnum sends only the following data to your adapter:" with a short bulleted list

---

## Screen 8: Welcome Screen

The first thing the user sees when launching Diurnum with no workspace open. No sidebar, no app shell — a full-window centered layout.

- Page background: `#F4F4F5`
- Diurnum wordmark/logo at the top center, with a small tagline beneath: _Own your books. Let AI help._
- Below: three large equal-width cards in a row (~280px each), each with an icon, title, and one-line description:
  1. **New blank workspace** — "Start fresh with an empty ledger"
  2. **Example workspace** — "Try Diurnum with sample accounts and transactions"
  3. **Open existing workspace** — "Open a folder you previously created in Diurnum"
- Cards have hairline borders, white backgrounds, no shadows. Hover state: very subtle background tint.
- Below the cards: a small "Recent workspaces" section with up to 5 clickable entries — workspace name + truncated path, in a quiet style
- Footnote at the very bottom in muted text: "Your books are stored locally. No account required."

---

## Screen 9: New Workspace

The workspace creation form, reached after clicking "New blank workspace" or "Example workspace" on the Welcome screen.

- Centered card (~520px wide) on the same `#F4F4F5` page background
- Back arrow (`←`) in the top-left to return to Welcome
- Form fields:
  - Workspace name: `Acme Studio`
  - Location: a file-path field: `/Users/ryan/Finance/AcmeStudio` with a `Browse…` button
  - Template: segmented control or card selector — `Simple Business` (selected), `Freelancer`, `Personal Finance`
  - Base currency: `USD ▾`
- `Create Workspace` button (sage green, full-width)
- Small footnote: "Your books are stored locally. No account required."

---

## Screen 10: Command Palette

Overlay shown on top of the Ledger Editor (use Screen 1 as the background, dimmed slightly).

- Centered modal (~560px wide), floating with subtle border and very light drop shadow
- Search input at top: placeholder "Search commands…" with `⌘K` badge on the right
- List of commands below input:
  - Section label: RECENT
  - `Go to Inbox` — `Inbox`
  - Section label: NAVIGATION
  - `Go to Ledger` — `Ledger` (with keyboard shortcut hint `⌘1` on right)
  - `Go to Reports` — `Reports`
  - `Open file…` — `Ledger`
  - Section label: ACTIONS
  - `Import CSV…`
  - `Run Ledger Validation`
  - `Commit with message…`
  - `New entry`
- One row is highlighted (keyboard focus) in `#F4F4F5`

---

## Screen 11: Git Panel

Accessed from sidebar when a git repo is detected in the workspace folder. In Diurnum V1, commits happen **silently and automatically** — both on Approval and on a debounced timer for manual edits. This panel is for visibility and one-off custom commits, not for triggering the routine flow.

- Sidebar nav: Git icon active (Git item appears between Import and Settings only when a repo is detected)
- Header: "Git" + branch name chip: `main` + small status text: `auto-committing`
- **Recent commits** list — each row: short hash (`a3f2c1`), message, date
  - Mix of auto-commit messages:
    - `diurnum: approve 5 entries (2026-04)` (May 6)
    - `workspace backup 2026-05-08T14:31:22Z` (May 8)
    - `workspace backup 2026-05-08T09:12:05Z` (May 8)
    - `diurnum: approve 3 entries (2026-05)` (May 8)
  - Each row is clickable to show the diff
- **Working tree** section (only shown if there are uncommitted changes — rare since auto-commit runs continuously): shows modified file paths in muted monospace
- **"Commit with custom message…"** action button at the top-right of the recent commits section — when clicked, expands a small form with file checkboxes and message input
- **Diff viewer** (when a commit is selected): monospace, +/- prefix, sage green and soft red row backgrounds, narrow gutter

---

**Visual consistency notes:**
All screens share the same sidebar, status bar pattern, and color system. No screen should feel like a different app. The Ledger Editor is the anchor — every other screen should feel like it belongs in the same shell. The Welcome and New Workspace screens are the only exceptions (no sidebar, centered layout) because no workspace is open yet.
