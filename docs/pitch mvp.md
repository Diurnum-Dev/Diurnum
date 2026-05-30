---
belongs_to: "[[Diurnum]]"
type: Pitch
_organized: true
---

# Pitch: Diurnum Local-First Accounting Workspace

## 1. Problem

People who care about accurate books have two bad options.

They can use mainstream accounting software like QuickBooks, which is powerful but often feels slow, opaque, cluttered, and hard to trust.

Or they can use plain-text accounting tools like Beancount, which are transparent and durable but intimidating, manual, and unfriendly for everyday workflows.

Diurnum should bridge that gap:

> A beautiful local-first accounting app that uses Beancount as the source of truth, with AI and rules layered on top to help import, categorize, review, and report on financial data.

The key product risk is trust.

Users should never feel like AI is silently changing their books. The system should feel fast, calm, transparent, and reversible.

---

## 2. Appetite

### First cycle appetite

**6 weeks**

This pitch is for the first shippable local MVP foundation, not the whole product.

The goal is to prove the core loop:

```text
CSV import
  → transaction inbox
  → rule/AI suggestions
  → review
  → Beancount commit
  → report
```

### Out of scope for this cycle

Not included:

- Paid sync
- Collaboration
- Bank feeds
- Hosted AI billing
- Accountant portal
- Full assistant
- Payroll
- Invoicing
- Tax filing
- Mobile
- Windows

The first cycle should prove:

> Can Diurnum feel like a premium local-first accounting app while reliably producing valid Beancount?

---

## 3. Core idea

Diurnum is a document-style macOS app.

The user owns a local project folder:

```text
Acme Studio/
  main.bean
  accounts.bean
  opening-balances.bean
  transactions/
  documents/
  imports/
  .app/
    workspace.json
    app.sqlite
```

Beancount is the canonical accounting record.

SQLite is a fast local cache and workflow store.

AI and rules generate suggestions.

Humans approve.

Approved suggestions become Beancount patches.

Every change is validated, versioned, and reversible.

---

# 4. Black Marker Diagrams

## 4.1 Product shape

```text
┌─────────────────────────────────────────────┐
│                  Diurnum                   │
│                                             │
│  Beautiful local accounting workspace       │
│                                             │
│  ┌──────────┐   ┌──────────┐   ┌─────────┐ │
│  │ Import   │ → │ Review   │ → │ Report  │ │
│  └──────────┘   └──────────┘   └─────────┘ │
│        │              │             │       │
│        ▼              ▼             ▼       │
│    CSV rows     Beancount diff   Ledger     │
│                 human approved   reports    │
│                                             │
└─────────────────────────────────────────────┘
```

The product is not “AI accounting.”

It is:

```text
Local files + reviewable automation + beautiful reports
```

---

## 4.2 Source of truth

```text
              ┌──────────────────┐
              │  Beancount files │
              │  source of truth │
              └────────┬─────────┘
                       │
                       │ parsed / indexed
                       ▼
              ┌──────────────────┐
              │  SQLite cache    │
              │  fast UI reads   │
              └────────┬─────────┘
                       │
                       │ displayed by
                       ▼
              ┌──────────────────┐
              │  React UI        │
              │  snappy screens  │
              └──────────────────┘
```

Important rule:

> SQLite helps Diurnum feel fast. It does not replace the ledger.

---

## 4.3 Review-first AI

```text
Imported transaction
        │
        ▼
Rules / similar history
        │
        ▼
AI suggestion if needed
        │
        ▼
Structured entry
        │
        ▼
Beancount preview
        │
        ▼
Human approval
        │
        ▼
Ledger commit
```

AI does not mutate the books directly.

AI proposes.

Diurnum validates.

The user approves.

---

## 4.4 Responsiveness model

```text
User action
    │
    ▼
Immediate UI update
    │
    ├───────────────┐
    │               ▼
    │        Background job
    │        import / AI / validate / report
    │               │
    ▼               ▼
Cached local UI ← updated result
```

The app should almost never feel like it is waiting.

The UI should respond first. Expensive work catches up.

---

## 4.5 MVP heartbeat

```text
┌─────────────┐
│ CSV Import  │
└──────┬──────┘
       ▼
┌─────────────┐
│ Normalize   │
└──────┬──────┘
       ▼
┌─────────────┐
│ Suggest     │
│ rules + AI  │
└──────┬──────┘
       ▼
┌─────────────┐
│ Review      │
└──────┬──────┘
       ▼
┌─────────────┐
│ Commit      │
│ .bean files │
└──────┬──────┘
       ▼
┌─────────────┐
│ Report      │
└─────────────┘
```

Everything in the first cycle supports this loop.

---

# 5. Breadboards

These are not visual designs. They are interaction structures.

## 5.1 App shell

```text
App
├── Sidebar
│   ├── Workspace switcher
│   ├── Local + Synced status
│   ├── Overview
│   ├── Inbox
│   ├── Ledger
│   ├── Reports
│   ├── Assistant
│   ├── Documents
│   ├── Rules
│   ├── Sync
│   └── Settings
│
├── Main pane
│   └── Current screen
│
├── Inspector pane
│   └── Contextual details
│
└── Status bar
    ├── Ledger valid / invalid
    ├── Import status
    ├── Items needing review
    └── Sync status placeholder
```

For the first cycle, `Sync` can be present but mostly inactive or marked “coming later.”

---

## 5.2 Workspace creation

```text
New Workspace
├── Name
│   └── “Acme Studio”
│
├── Location
│   └── Choose local folder
│
├── Template
│   ├── Simple Business
│   ├── Freelancer
│   ├── Personal Finance
│   └── Custom
│
├── Base currency
│   └── USD
│
└── Create
    ├── Generate main.bean
    ├── Generate accounts.bean
    ├── Generate opening-balances.bean
    ├── Create .app/app.sqlite
    └── Open workspace
```

This should feel like creating a local document, not signing up for SaaS.

---

## 5.3 Inbox screen

```text
Inbox
├── Header
│   ├── Title: Inbox
│   ├── Account filter
│   ├── Date filter
│   ├── Status filter
│   └── Review Selected
│
├── Summary strip
│   ├── 12 need review
│   ├── 31 matched by rules
│   └── 2 possible duplicates
│
├── Transaction list
│   ├── Date
│   ├── Description
│   ├── Account
│   ├── Amount
│   ├── Suggested category
│   └── Confidence
│
└── Detail inspector
    ├── Imported transaction
    ├── Suggested Beancount entry
    ├── Reasoning
    ├── Similar past transactions
    ├── Attached document
    └── Actions
        ├── Approve
        ├── Edit
        ├── Reject
        └── Create rule
```

The inbox is the heart of the MVP.

This screen must feel unusually good.

---

## 5.4 Transaction review detail

```text
Selected Transaction
├── Imported data
│   ├── Date
│   ├── Description
│   ├── Source account
│   ├── Amount
│   └── Source import
│
├── Suggested entry
│   ├── Payee
│   ├── Narration
│   ├── Postings
│   └── Metadata
│
├── Beancount preview
│   └── rendered text block
│
├── Confidence
│   ├── score
│   ├── source: rule / AI / similar transaction
│   └── explanation
│
├── Evidence
│   ├── similar transactions
│   ├── matching rule
│   └── attached document
│
└── Actions
    ├── Approve
    ├── Edit
    ├── Reject
    └── Always categorize this way
```

The user should understand exactly why the suggestion exists.

---

## 5.5 CSV import

```text
CSV Import
├── Drop file
│
├── Preview rows
│
├── Map columns
│   ├── Date
│   ├── Description
│   ├── Amount
│   ├── Debit
│   ├── Credit
│   ├── Currency
│   └── External ID
│
├── Choose Ledger account
│   └── Assets:Bank:Checking
│
├── Import options
│   ├── Save mapping
│   ├── Detect duplicates
│   └── Do not write to ledger yet
│
└── Import
    ├── Create raw transaction records
    ├── Normalize
    ├── Deduplicate
    └── Send to inbox
```

Important: CSV import does not immediately touch `.bean` files.

It fills the inbox.

---

## 5.6 Ledger commit

```text
Approve transaction
├── Optimistic UI
│   └── Remove row from inbox
│
├── Create operation
│   └── suggestion.approved
│
├── Render Beancount patch
│
├── Append to monthly file
│   └── transactions/2026-05.bean
│
├── Fast validation
│   ├── balances
│   ├── account exists
│   ├── currency valid
│   └── period open
│
├── Full validation
│   └── background
│
└── Update UI
    ├── Ledger valid
    ├── Report cache stale
    └── Undo available
```

Approval should feel immediate.

Validation should be visible but not blocking.

---

## 5.7 Reports

```text
Reports
├── Header
│   ├── Report selector
│   ├── Date range
│   ├── Export
│   └── Ask AI
│
├── Summary cards
│   ├── Revenue
│   ├── Expenses
│   ├── Net income
│   └── Cash balance
│
├── Chart
│   └── Monthly trend
│
├── Report table
│   ├── Revenue
│   ├── Cost of sales
│   ├── Operating expenses
│   └── Net income
│
└── Inspector
    ├── AI commentary placeholder
    ├── Saved views
    └── Drill-down
```

First cycle reports can be basic, but they must be beautiful and fast.

---

# 6. Shaped Scope

## Scope A: Local app foundation

### Build

- Tauri + React + TypeScript shell.
- Rust command layer.
- Python Beancount sidecar.
- Local SQLite database.
- Project folder creation.
- Workspace open/create flow.
- File watcher.
- Basic ledger health status.

### User value

User can create a local Diurnum workspace that contains real Beancount files.

### Risks

- Sidecar startup could feel slow.
- File watching may be tricky.
- Bundling Python/Beancount cleanly in a macOS app may take work.

### Circuit breaker

If Python sidecar bundling is too costly, start with a development-only sidecar and defer packaging polish.

---

## Scope B: Ledger indexing and validation

### Build

- Parse workspace.
- Cache accounts and transactions.
- Show validation errors.
- Show ledger health.
- Basic Monaco editor.
- Background validation.

### User value

User can trust that Diurnum is reading and validating Beancount correctly.

### Risks

- Formatting preservation.
- Large ledger performance.
- Incremental parsing complexity.

### Circuit breaker

Do not attempt perfect formatting preservation in cycle one.

Support app-generated ledgers best.

---

## Scope C: CSV import and inbox

### Build

- CSV drag/drop.
- Mapping UI.
- Import preview.
- Normalization.
- Duplicate detection.
- Inbox list.
- Transaction detail panel.

### User value

User can bring real bank data into Diurnum without editing Beancount manually.

### Risks

- CSV formats vary wildly.
- Import mapping UX can balloon.
- Duplicate detection is subtle.

### Circuit breaker

Support a simple, explicit mapping flow first. Avoid trying to automatically understand every CSV format.

---

## Scope D: Suggestions and review

### Build

- Rule-based categorization.
- Similar transaction matching.
- AI fallback for ambiguous transactions.
- Suggested Beancount entry.
- Confidence and reasoning.
- Approve/edit/reject.
- Commit approved entries to monthly `.bean` files.
- Undo approval.

### User value

This is the magic moment:

> “Diurnum turned my CSV into clean, reviewable Beancount entries.”

### Risks

- AI hallucination.
- Incorrect categories.
- Ledger commit errors.
- Review UI complexity.

### Circuit breaker

AI is optional in the first build. Rules and manual review can carry the core loop.

---

## Scope E: Reports

### Build

- Income statement.
- Balance sheet.
- Expense breakdown.
- Monthly trend.
- Drill-down to ledger entries.
- Cached reports.

### User value

User gets immediate payoff after import/review: useful financial visibility.

### Risks

- Accurate reports depend on correct ledger modeling.
- Beancount report APIs may require adapter work.
- Report UI can expand endlessly.

### Circuit breaker

Start with income statement and expense breakdown only if balance sheet integration takes too long.

---

# 7. No-Gos

Do not build in the first cycle:

```text
Sync
Collaboration
Bank feeds
Payroll
Invoicing
Tax filing
Inventory
Mobile app
Windows app
Plugin marketplace
Cloud ledger storage
Full accountant portal
```

Do not let these sneak in as “small” features.

They are future product lines, not MVP details.

---

# 8. Rabbit Holes

## Rabbit Hole: Perfect Beancount editing

Trying to preserve every formatting choice, comment location, include style, and manually edited file structure could consume the whole cycle.

### Avoidance

Optimize for app-generated ledgers first.

Raw editing can exist, but the core path should use generated monthly transaction files.

---

## Rabbit Hole: Full AI bookkeeper

AI should not reconcile, classify, rewrite, and explain everything in cycle one.

### Avoidance

AI only suggests categorization for imported transactions. Everything else stays deterministic.

---

## Rabbit Hole: Bank feed integration

Bank feeds sound essential, but they introduce provider selection, OAuth, token storage, backend services, and compliance concerns.

### Avoidance

Start with CSV.

A great CSV flow is enough to prove the product.

---

## Rabbit Hole: Sync architecture too early

Sync is a major future value proposition, but building it before the local loop works risks premature platform work.

### Avoidance

Design for sync with operation logs and stable IDs, but do not implement paid sync in the first cycle.

---

## Rabbit Hole: Generic accounting SaaS

It would be easy to drift into invoices, bills, payroll, sales tax, users, subscriptions, and dashboards.

### Avoidance

Keep the product local-first and review-first.

The first customer is someone who wants clean books, not a full ERP.

---

# 9. Risks

## Risk: The app feels slow

### Mitigation

- Cache local data in SQLite.
- Keep Python sidecar warm.
- Use background jobs.
- Use virtualized lists.
- Show stale data while refreshing.
- Never parse full ledgers in React.

---

## Risk: AI suggestions are wrong

### Mitigation

- Human approval required.
- Show confidence and reasoning.
- Validate all suggestions.
- Keep deterministic rules primary.
- Let users create rules from approvals.

---

## Risk: Beancount integration is harder than expected

### Mitigation

- Spike first.
- Use sample ledgers of increasing size.
- Restrict MVP ledger structure.
- Avoid full external-ledger compatibility in cycle one.

---

## Risk: CSV import is messy

### Mitigation

- Explicit mapping UI.
- Save mappings.
- Support common date/amount formats.
- Detect duplicates conservatively.
- Keep imports reversible.

---

## Risk: Product is too technical

### Mitigation

- Hide raw Beancount unless needed.
- Use friendly terminology in the UI.
- Show Beancount as preview/diff, not as mandatory workflow.
- Make reports and inbox feel polished.

---

# 10. Hill Chart

```text
Unknowns / uphill                         Execution / downhill
────────────────────────────────────────────────────────────────

Tauri + Python sidecar        ●───────────────
Beancount parse/cache          ●──────────────
CSV import mapping                  ●─────────
Suggestion rendering                     ●────
Review inbox UX                         ●────
Ledger commit/validation              ●──────
Basic reports                              ●──
Polish/performance                           ●
```

At the start, the biggest unknowns are:

1. App architecture.
2. Beancount parsing/caching.
3. Ledger commit correctness.

The rest is product execution once those are solved.

---

# 11. Core technical decisions

## Frontend

```text
Tauri + React + TypeScript + Vite
```

Use:

```text
TanStack Query
TanStack Table
TanStack Virtual
Monaco Editor
Radix primitives or custom component primitives
Zustand or Jotai
```

## Local core

```text
Rust command layer
SQLite app database
File watcher
Operation log
Keychain integration later
```

## Accounting engine

```text
Python sidecar
Beancount parser
Validation service
Report generation
Ledger rendering helpers
```

## Data architecture

```text
Beancount files = source of truth
SQLite = cache and workflow state
Operation log = audit trail and future sync primitive
```

---

# 12. Performance requirements

Diurnum must feel snappy.

## Initial budgets

```text
App shell visible:            < 500ms
Workspace sidebar visible:    < 300ms from cache
Inbox cached render:          < 200ms
Report cached render:         < 300ms
Simple search:                < 150ms
Approval UI response:         < 100ms
Full validation:              background
AI classification:            background
CSV import processing:        background
```

## UX rules

Use:

```text
optimistic UI
cached reads
background jobs
virtualized tables
stale-while-refresh reports
inline progress
subtle status indicators
```

Avoid:

```text
blocking spinners
waiting on AI before showing rows
waiting on full validation before UI update
frontend ledger parsing
rendering thousands of DOM rows
```

---

# 13. First cycle deliverable

At the end of the first cycle, a user should be able to:

1. Create a Diurnum workspace.
2. See generated Beancount files.
3. Import a CSV.
4. Map columns.
5. See transactions in an inbox.
6. Get rule-based or AI-assisted suggestions.
7. Review a Beancount preview.
8. Approve transactions.
9. Commit them to `.bean` files.
10. See validation status.
11. View a basic report.

The demo should be:

```text
Create workspace
Import Chase CSV
Review OpenAI / AWS / Stripe / Adobe transactions
Approve suggestions
Generate valid Beancount
Show income statement
```

That is enough to prove the product’s foundation.

---

# 14. Nice-to-haves if time allows

Only after the core loop works:

```text
Command palette
Keyboard shortcuts
Git repo detection
Version timeline
Basic AI explanation
Expense trend chart
Report export
Receipt attachment
Saved CSV mapping presets
```

Do not trade the core loop for these.

---

# 15. Later pitches

These should become separate Shape Up pitches later.

## Paid Sync

```text
Local-first encrypted sync
Multi-device access
Backup and restore
Conflict detection
```

## Collaboration

```text
Invite bookkeeper
Review requests
Comments
Month-end close checklist
Role-based access
```

## Bank Feeds

```text
Cloud-mediated bank connector
Normalized transactions
Background refresh
Reconciliation hints
```

## Assistant

```text
Ledger-grounded natural language reporting
Variance explanation
Source-backed answers
Generated mini reports
```

The current pitch should not attempt to ship all of those.

---

# 16. Final pitch summary

## Problem

Accounting software is either opaque and frustrating, or transparent but too technical.

## Appetite

6 weeks for a first local MVP.

## Solution

A macOS-first local accounting workspace built on Beancount, with a fast cached UI, CSV imports, reviewable suggestions, validated ledger commits, and basic reports.

## Betting table

```text
Bet:
  Prove the local-first accounting loop.

Core loop:
  CSV → Inbox → Suggest → Review → Commit → Report

Must feel:
  Beautiful, fast, calm, trustworthy.

Must avoid:
  Sync, bank feeds, collaboration, payroll, invoicing, tax.
```

## Success

Diurnum feels like a premium productivity app for accounting, not a slow accounting system with AI bolted on.
