# Diurnum

Diurnum is a local-first accounting workspace built around a portable Beancount ledger, with reviewable automation layered on top.

## Language

**MVP**:
The first local accounting loop: create or reopen a Diurnum-created workspace, import CSV transactions, review suggestions, approve ledger changes, and view basic reports.
_Avoid_: Sync, collaboration, payroll, invoicing, tax, external-ledger import

**V1**:
The first public Diurnum release: the inherited MVP accounting loop assembled into an App Shell with a Ledger Editor home screen, Smart CSV Import, Documents, Settings, optional Git Integration, Data Integrity guarantees, and macOS packaging.
_Avoid_: Hosted SaaS app, sync service, arbitrary Beancount import, accountant portal, feature grab bag

**Founder-Operator**:
A technically literate solo business owner who runs their own books and wants transparent, local accounting records they can inspect, version, and understand.
_Avoid_: Generic small-business owner, bookkeeper, accountant, firm user

**MVP Business**:
A single cash-basis US service business with one legal entity, no inventory, no sales tax, no payroll, no accounts receivable or accounts payable workflows, and no multi-currency.
_Avoid_: SaaS billing system, ecommerce business, payroll workflow, invoicing workflow, multi-entity books

**Workspace**:
A local folder that contains a business's Beancount ledger plus Diurnum metadata and rebuildable cache data.
_Avoid_: Project, company, file, cloud account

**App-Created Workspace**:
A Workspace created by Diurnum using Diurnum's expected file layout and chart-of-accounts assumptions.
_Avoid_: Imported ledger, arbitrary Beancount project, external workspace

**Statement Row**:
A raw transaction-like row imported from a bank-downloaded CSV statement before Diurnum turns it into accounting data.
_Avoid_: Transaction, ledger transaction, entry

**Source Amount**:
The normalized amount for a Statement Row expressed as the eventual Beancount posting amount for its Source Account.
_Avoid_: Bank display amount, debit column, credit column, balance direction

**Statement Debit/Credit**:
CSV statement direction columns where debit means money out of the statement account and credit means money into the statement account for Diurnum CSV Imports.
_Avoid_: Beancount debit/credit semantics, company-perspective debit/credit, account-type-specific accounting direction

**Entry Preview**:
The user-facing preview of the Beancount entry that Diurnum will write on Approval.
_Avoid_: Category-only review, hidden ledger change

**Journal Detail**:
The low-level accounting view of an entry's debits, credits, and postings.
_Avoid_: Primary review UI, hidden expert mode

**Manual Ledger Edit**:
A direct Founder-Operator edit to the Workspace's Beancount files outside Diurnum's Approval flow, either in the Ledger Editor or in an external text editor.
_Avoid_: Unsupported edit, hidden database edit, Approval

**External Ledger Edit**:
A Manual Ledger Edit made outside Diurnum while the app may be open.
_Avoid_: Ledger Editor autosave, Approval, hidden sync conflict

**Ledger Validation**:
The workspace-level check that the Beancount ledger parses and balances after Diurnum writes or detects file changes.
_Avoid_: Row-level validation, silent failure, cache-only correctness

**Invalid Ledger State**:
A Workspace state where the Beancount ledger fails parsing, balancing, or validation and Diurnum cannot trust derived accounting data.
_Avoid_: Warning-only error, partial report state

**Staging Area**:
Diurnum-managed Workspace data that stores Statement Rows, review state, fingerprints, source metadata, and suggestion details before Approval.
_Avoid_: Ledger, canonical accounting record, Beancount annotations

**Accounted Statement Row**:
A Statement Row retained in the Staging Area after Approval and linked to the approved ledger entry it produced.
_Avoid_: Deleted import row, duplicate review item

**Diurnum Entry Metadata**:
Beancount transaction metadata written by Diurnum to link an approved ledger entry back to its Staging Area provenance, including Diurnum entry id, import fingerprint, source account, and source file name.
_Avoid_: Comment-only provenance, line-number link

**Broken Provenance**:
A state where a valid ledger entry can no longer be reliably linked to its Staging Area record because Diurnum Entry Metadata was edited or removed.
_Avoid_: Invalid ledger, automatic repair

**Beancount V3 Compatibility**:
The requirement that Diurnum-written Workspaces remain valid Beancount V3 projects that can be inspected and validated with standard ecosystem tools.
_Avoid_: Diurnum-only syntax, bundled Beancount fork, proprietary accounting database

**Transfer Entry**:
A Suggested Entry or approved ledger entry that moves value between two Ledger Accounts without income or expense.
_Avoid_: Duplicate payment entries, ignored transfer

**Transfer Match**:
A user-approved link between Statement Rows from different Source Accounts that belong to the same Transfer Entry.
_Avoid_: Automatic transfer approval, duplicate transfer

**Opening Balance**:
The starting balance for a Ledger Account as of the Workspace books start date.
_Avoid_: Imported transaction, reconciliation adjustment

**MVP Report**:
One of the first supported reports: income statement, expense breakdown, source account balances, or balance sheet.
_Avoid_: Cash flow statement, tax report, runway analysis, variance analysis, AI narrative report

**AI Suggestion**:
An AI-assisted proposal for categorization, payee or narration cleanup, explanation, or entry completion that the Founder-Operator can review before it affects the ledger.
_Avoid_: AI ledger write, AI reconciliation, AI report, autonomous bookkeeping

**Ledger-Grounded AI**:
The rule that AI-produced numbers, categories, completions, insights, and future query answers must be derived from actual ledger or Workspace data, with cited source entries when numbers or claims are surfaced.
_Avoid_: Prompt-only arithmetic, hallucinated accounts, uncited financial claims

**BYO AI Adapter**:
A user-configured local integration that accepts Diurnum's bounded suggestion request and returns structured AI Suggestions.
_Avoid_: Diurnum-hosted AI service, embedded agent harness, arbitrary harness integration, autonomous file editing

**Curated Ledger Context**:
The limited ledger-derived context Diurnum sends to a BYO AI Adapter, such as chart of accounts, Source Account, Statement Row, relevant rules, similar approved entries, and business profile.
_Avoid_: Raw workspace access, direct file access, full ledger dump by default

**AI Context Disclosure**:
The user-visible explanation of what Curated Ledger Context Diurnum sends to the configured BYO AI Adapter.
_Avoid_: Hidden AI data sharing, unclear adapter permissions

**Categorization Rule**:
A user-confirmed rule that proposes a Ledger Account for future Statement Rows matching known patterns, scoped to a Source Account by default.
_Avoid_: Hidden learning, automatic rule creation, global rule by default

**Starter Chart of Accounts**:
The small editable set of Ledger Accounts Diurnum creates for an MVP Business.
_Avoid_: Universal chart of accounts, locked account list

**Local Desktop App**:
The product form for Diurnum: a locally running desktop application that manages Workspace folders. V1 ships for macOS Apple Silicon, while the architecture should preserve a path to Windows and Linux later.
_Avoid_: Hosted SaaS app, browser-first local web app, Mac-only architecture

**Local-First MVP**:
An MVP where all accounting data needed to use Diurnum lives in the Workspace folder and the app can run without a Diurnum cloud account.
_Avoid_: Cloud-stored ledger, hosted auth requirement, server-required bank feed, cloud-only staging data

**Local-First V1**:
A V1 release where accounting data, Staging Area data, mappings, rules, documents, snapshots, reports, and validation all work without a Diurnum cloud account.
_Avoid_: Hosted auth requirement, cloud-stored books, server-required import or reporting

**Golden Path**:
The canonical MVP workflow from Workspace creation through CSV import, review, Approval, Ledger Validation, and MVP Reports.
_Avoid_: Edge-case workflow, full accounting suite, onboarding wizard for every business type

**MVP Validation**:
The proof that a Founder-Operator can trust Diurnum to turn bank CSV rows into valid, inspectable Beancount and basic reports without hiding the accounting mechanics.
_Avoid_: Feature checklist, demo-only flow, opaque AI bookkeeping

**Suggested Entry**:
Diurnum's proposed Beancount transaction for one or more Statement Rows before the Founder-Operator approves it.
_Avoid_: Suggested transaction, AI transaction, draft ledger entry

**Approval**:
The action that writes a Suggested Entry into the Beancount ledger and marks its source Statement Rows as accounted for.
_Avoid_: Accept category, stage, save draft

**Split Entry**:
A future non-MVP ledger entry where one Statement Row is allocated across multiple accounting categories.
_Avoid_: MVP split, payout decomposition

**Monthly Transaction File**:
A Diurnum-owned Beancount file that stores approved entries for one calendar month.
_Avoid_: Import batch file, arbitrary ledger file

**Ledger Account**:
A Beancount account in the Workspace chart of accounts.
_Avoid_: Bank account, user account

**Source Account**:
The Ledger Account selected by the Founder-Operator as the account represented by a CSV import.
_Avoid_: Inferred account, per-row account

**CSV Import**:
The act of bringing Statement Rows from one bank-downloaded CSV file into a Workspace for one Source Account.
_Avoid_: Bank feed, ledger import, statement sync, spreadsheet import

**Import Fingerprint**:
A stable identity for a Statement Row within a Source Account, derived from normalized CSV fields to prevent repeated imports from creating duplicate review items.
_Avoid_: Ledger duplicate check, global transaction id

**Source Mapping**:
The saved CSV column mapping used to import Statement Rows for a Source Account.
_Avoid_: Global CSV schema, bundled bank preset, per-row Source Account inference

**Smart CSV Import**:
The V1 CSV Import flow that infers column mappings from generic header and content patterns, previews normalized Statement Rows, flags likely duplicates before import, and saves per-Source-Account Source Mappings.
_Avoid_: Bank-specific importer preset, hidden import mutation, arbitrary spreadsheet ingestion

**Pending At Import**:
A Statement Row flag preserved from a CSV status column when the bank marks the row pending, later surfaced in the Inbox and written as valid metadata if approved.
_Avoid_: Skipped pending row, approved pending status, ledger validity error

**App Shell**:
The V1 two-column sidebar and main-pane container that hosts Workspace screens, navigation, and the status bar after a Workspace is open.
_Avoid_: Standalone panel collection, welcome screen, marketing shell

**Welcome Screen**:
The no-Workspace app state that lets the Founder-Operator create a blank Workspace, create an example Workspace, open an App-Created Workspace, or choose a recent Workspace.
_Avoid_: General Beancount import, onboarding maze, hosted signup

**Ledger Editor**:
The V1 embedded editor for Workspace `.bean` files and the default landing screen after opening a Workspace.
_Avoid_: Separate canonical store, opaque form-only ledger, autonomous file rewrite

**Predictive Entry Completion**:
The Ledger Editor feature that proposes a full Beancount entry as ghost text from Categorization Rules, approved entry history, or the BYO AI Adapter.
_Avoid_: Fabricated amount, hallucinated account, automatic ledger write

**Workspace Switcher**:
The App Shell dropdown that lists recent Workspaces by stored display name and path and opens only App-Created Workspaces.
_Avoid_: Multi-tenant account switcher, arbitrary Beancount import

**Settings**:
The V1 configuration surface for app preferences and Workspace configuration, including AI Adapter, update checks, Workspace metadata, Source Accounts, Categorization Rules, Git Identity, Snapshots, and Privacy.
_Avoid_: Hosted account settings, hidden config file requirement, unrelated business setup wizard

**Documents Folder**:
The Workspace `documents/` tree for source-account statements and general business files, including original CSVs copied during import.
_Avoid_: Canonical accounting ledger, per-transaction attachment system, hidden cloud storage

**Snapshot**:
A timestamped backup of Workspace `.bean` files, created before Approvals and on a daily schedule, stored under `.Diurnum/snapshots/` for restore and crash recovery.
_Avoid_: Canonical ledger, git commit, long-term archive

**Data Integrity Layer**:
The V1 guarantee that ledger file mutations use atomic writes, backup snapshots, restore safety, and crash recovery prompts before Diurnum trusts derived data.
_Avoid_: Best-effort save, partial write tolerance, silent corruption

**Git Integration**:
Optional V1 behavior activated only when a Workspace is inside a git repository, with status display, silent auto-commits, history, and manual custom commits.
_Avoid_: Required git setup, automatic repo initialization, push/pull/merge management

**Git Identity**:
The git `user.name` and `user.email` Diurnum uses for local auto-commits and manual custom commits in a git-backed Workspace.
_Avoid_: Diurnum cloud identity, Workspace owner, tax identity

**Command Palette**:
The V1 `Cmd+K` fuzzy command surface for navigating screens and triggering Workspace actions without the mouse.
_Avoid_: Chat command box, natural-language accounting query, hidden-only navigation

**Performance Budget**:
A product-level response-time target for common app interactions, used to keep the local desktop workflow fast and predictable.
_Avoid_: Nice-to-have benchmark, cloud latency excuse, blocking UI

**Privacy Boundary**:
The V1 rule that Diurnum does not transmit accounting data, with outbound network behavior limited to configurable update checks, opt-in crash reports without Workspace data, and user-controlled BYO AI Adapter calls.
_Avoid_: Anonymous usage analytics, hidden telemetry, server-side bookkeeping

## Relationships

- The **MVP** proves the local accounting loop before adding cloud or collaboration workflows.
- **V1** is the first public release and inherits the MVP loop while adding the App Shell, Ledger Editor, Smart CSV Import, Documents, Settings, Git Integration, Data Integrity Layer, and macOS packaging.
- The **Founder-Operator** is the primary user of both the **MVP** and **V1**.
- Diurnum is designed around an **MVP Business** for both the MVP and V1.
- A **Founder-Operator** creates or opens one **Workspace** for an **MVP Business**.
- V1 supports **App-Created Workspaces** only; arbitrary external Beancount import remains post-V1.
- The **Welcome Screen** opens only **App-Created Workspaces**, starts a new App-Created Workspace, or offers an example App-Created Workspace.
- The **App Shell** hosts all open-Workspace V1 screens except the Welcome Screen.
- The **Ledger Editor** is the V1 home screen after a Workspace opens.
- The **Workspace Switcher** uses app-level recents keyed by absolute Workspace path, not Workspace ledger data.
- **Settings** is the configuration surface for both app-level preferences and Workspace-level configuration.
- **Beancount V3 Compatibility** is Diurnum's exit promise: readable `.bean` files remain the canonical accounting source of truth.
- Diurnum writes only valid Beancount V3 directives and must not introduce Diurnum-only ledger syntax.
- Diurnum may decline to import arbitrary external Beancount projects while still tolerating valid included `.bean` files without corrupting the Workspace.
- Diurnum imports **Statement Rows** from bank-downloaded CSV files.
- Diurnum creates **Suggested Entries** from **Statement Rows**.
- An **Approval** turns a **Suggested Entry** into canonical ledger data.
- In the **MVP**, each non-transfer **Statement Row** maps to exactly one **Suggested Entry**.
- A **Transfer Entry** may link two **Statement Rows** from different **Source Accounts** to one **Suggested Entry**.
- Diurnum may suggest a **Transfer Match** by date, amount, and description, but the Founder-Operator approves it.
- **Split Entries** are outside V1.
- Workspace setup records **Opening Balances** for Source Accounts when the Founder-Operator knows them.
- **MVP Reports** are unavailable during **Invalid Ledger State**.
- **AI Suggestions** can help create **Suggested Entries**, but **Approval** remains required.
- **AI Suggestions** come from a **BYO AI Adapter** in the MVP and V1 when an adapter is configured.
- A **BYO AI Adapter** receives **Curated Ledger Context**, not required direct Workspace file access.
- **Curated Ledger Context** may include full details for relevant prior entries, and Diurnum provides **AI Context Disclosure**.
- The core accounting loop works without a configured **BYO AI Adapter**.
- **Ledger-Grounded AI** applies to Categorization Rules, AI Suggestions, Predictive Entry Completion, and future query or insight features.
- AI may propose accounts, completions, explanations, or future query translations, but Diurnum computes numbers from Workspace data and cites source entries when surfacing them.
- **Predictive Entry Completion** can insert text into the Ledger Editor buffer only; autosave and validation handle persistence.
- Predictive Entry Completion may reuse amounts from approved history but must not fabricate amounts or hallucinate Ledger Accounts.
- A **Categorization Rule** can be created from an Approval only when the Founder-Operator confirms it.
- Diurnum creates a **Starter Chart of Accounts** that the Founder-Operator can edit through Beancount files.
- Diurnum is a **Local Desktop App**. V1 packaging targets macOS Apple Silicon, but the architecture should not foreclose Windows and Linux later.
- The **MVP** is a **Local-First MVP**: ledger, staging data, mappings, rules, reports, and validation live locally.
- **Local-First V1** extends that rule to Documents, snapshots, git-backed reversibility, settings, and update/crash-report preferences.
- The **Golden Path** is the primary acceptance path for MVP scope.
- **MVP Validation** requires readable ledger files, Beancount validation, retained provenance, import deduplication, transfer handling, invalid-ledger blocking, optional AI, and reports that agree with the ledger.
- An **Approval** immediately writes the approved entry to the **Monthly Transaction File** for the entry date.
- Each **CSV Import** has exactly one **Source Account**.
- Each **Suggested Entry** includes a posting to the **Source Account**.
- A **Statement Row** is deduplicated by its **Import Fingerprint** within a **Source Account**.
- A **Source Account** may have one saved **Source Mapping** for repeated CSV Imports.
- **Smart CSV Import** infers a Source Mapping from generic header and content patterns, not from bundled bank-specific presets.
- Smart CSV Import previews normalized Statement Rows and flags likely duplicates before import without writing to Beancount.
- A successful Smart CSV Import may save the Source Mapping for the selected Source Account.
- A normalized **Statement Row** requires posted date, description, and amount, with optional supporting fields.
- A **Statement Row** amount is normalized as a **Source Amount** before Diurnum creates a Suggested Entry.
- A **Source Mapping** may map one signed amount column, **Statement Debit/Credit** columns, or an amount plus type indicator that normalizes to one **Source Amount**.
- For CSV Imports, **Statement Debit/Credit** means debit is money out and credit is money in, regardless of whether the **Source Account** is a bank or credit-card account.
- **Pending At Import** is preserved on the Statement Row and surfaced in the Inbox; it does not by itself make the ledger invalid.
- V1 is USD-only and blocks detected non-USD CSV amounts rather than silently converting them.
- A **Suggested Entry** is reviewed through an **Entry Preview**, with **Journal Detail** available when needed.
- A **Manual Ledger Edit** is allowed because the Beancount ledger is the source of truth.
- The MVP supports **External Ledger Edits**; V1 additionally supports Manual Ledger Edits through the **Ledger Editor**.
- **Ledger Validation** alerts the Founder-Operator when a **Manual Ledger Edit**, External Ledger Edit, Ledger Editor autosave, restore, or Approval leaves the ledger invalid.
- An **Invalid Ledger State** blocks Approval and reports while still allowing the Founder-Operator to view validation errors and edit ledger files.
- The Ledger Editor must not silently overwrite an **External Ledger Edit** detected while the app is open.
- The **Data Integrity Layer** applies to every `.bean` file mutation Diurnum performs.
- Diurnum creates a **Snapshot** before Approval and on a daily schedule; restoring a Snapshot creates a pre-restore Snapshot and runs Ledger Validation.
- A Snapshot is recovery support, not the canonical ledger and not a substitute for git history.
- The **Staging Area** stores **Statement Rows** and review state outside the Beancount ledger.
- **Approval** writes accounting data to the ledger while preserving import provenance in the **Staging Area**.
- An **Approval** turns each source **Statement Row** into an **Accounted Statement Row**.
- Diurnum writes **Diurnum Entry Metadata** on approved entries so the ledger can be linked back to the **Staging Area**.
- **Broken Provenance** does not make the ledger invalid when Beancount validation still passes.
- The **Documents Folder** stores copied CSVs, statement PDFs, receipts, contracts, and other user files as local Workspace files.
- Documents are committable Workspace files; `.Diurnum/snapshots/` is excluded from git.
- V1 Documents are folder-based; per-transaction document attachment is post-V1.
- **Git Integration** activates only when a Workspace is inside an existing git repository.
- **Git Identity** comes from git config, can be overridden locally, and exists only to support local commits.
- Git Integration may auto-commit local file changes but must not initialize a repository, push, pull, create branches, or resolve merge conflicts.
- Git commit failures are non-blocking notices and never block accounting operations.
- The **Command Palette** is a keyboard navigation and command surface, not a natural-language ledger query surface.
- **Performance Budgets** are product constraints for app responsiveness; expensive validation, import, AI, snapshot, and git work should not block the primary UI.
- The **Privacy Boundary** forbids hidden telemetry and server-side bookkeeping.
- V1 outbound network behavior is limited to configurable update checks, opt-in crash reports without Workspace data, and user-controlled BYO AI Adapter calls.

## Example dialogue

> **Dev:** "Should the MVP include shared workspaces?"
> **Domain expert:** "No. The MVP proves that one user can turn imported transactions into a trustworthy local ledger and basic reports."
>
> **Dev:** "Should we optimize setup for a bookkeeping firm managing many clients?"
> **Domain expert:** "No. The first user is a Founder-Operator doing their own books."
>
> **Dev:** "Do we need payroll, invoices, or sales tax in the first ledger model?"
> **Domain expert:** "No. The MVP Business is a simple cash-basis service business."
>
> **Dev:** "Is the app opening a company record or a file?"
> **Domain expert:** "It opens a Workspace: a local folder containing the ledger and Diurnum's supporting data."
>
> **Dev:** "Can users import any existing Beancount project into the MVP?"
> **Domain expert:** "No. The MVP only supports App-Created Workspaces."
>
> **Dev:** "Is an imported CSV line already a ledger transaction?"
> **Domain expert:** "No. It is a Statement Row until Diurnum creates and approves accounting data from it."
>
> **Dev:** "What does the user approve in the review queue?"
> **Domain expert:** "They approve a Suggested Entry, which is Diurnum's proposed accounting treatment for the Statement Row."
>
> **Dev:** "Does approval merely accept the suggested category?"
> **Domain expert:** "No. Approval writes the Suggested Entry into the ledger and marks the source Statement Row as accounted for."
>
> **Dev:** "Can one imported Amazon row be split across office supplies and meals in the MVP?"
> **Domain expert:** "No. Split Entries are needed later, but the MVP keeps non-transfer Statement Rows mapped to one Suggested Entry."
>
> **Dev:** "Should a checking payment row and credit-card payment row create two ledger entries?"
> **Domain expert:** "No. They should be linked to one Transfer Entry when both sides are present."
>
> **Dev:** "Can Diurnum automatically approve a transfer because two amounts match?"
> **Domain expert:** "No. Diurnum can suggest a Transfer Match, but the Founder-Operator approves it."
>
> **Dev:** "Can the Workspace show trustworthy balances without a starting point?"
> **Domain expert:** "No. Source Accounts need Opening Balances when available."
>
> **Dev:** "Should MVP reporting include cash flow and tax reports?"
> **Domain expert:** "No. MVP Reports are income statement, expense breakdown, source account balances, and balance sheet."
>
> **Dev:** "Can AI write directly to the ledger?"
> **Domain expert:** "No. AI can help produce a Suggested Entry, but Approval writes to the ledger."
>
> **Dev:** "Does the MVP call a Diurnum-hosted AI service?"
> **Domain expert:** "No. The MVP uses a BYO AI Adapter with a bounded local integration contract."
>
> **Dev:** "Can the user complete bookkeeping if no AI adapter is configured?"
> **Domain expert:** "Yes. AI is optional; manual review, rules, and deterministic matching still work."
>
> **Dev:** "Does the AI adapter need direct access to the ledger folder?"
> **Domain expert:** "No. Diurnum sends Curated Ledger Context for the suggestion task."
>
> **Dev:** "Can AI receive prior entry descriptions and amounts?"
> **Domain expert:** "Yes, for relevant prior entries, with AI Context Disclosure in settings."
>
> **Dev:** "Should every approval silently train future categorization?"
> **Domain expert:** "No. Diurnum can offer a Categorization Rule, but the Founder-Operator confirms it."
>
> **Dev:** "Is the chart of accounts locked behind app UI?"
> **Domain expert:** "No. Diurnum creates a Starter Chart of Accounts that can be edited in the Beancount files."
>
> **Dev:** "Is it okay if the MVP architecture only works on macOS?"
> **Domain expert:** "No. The first build can target macOS, but the Local Desktop App architecture should preserve a cross-platform V1.0 path."
>
> **Dev:** "Does the MVP require a Diurnum cloud account to use the books?"
> **Domain expert:** "No. The Local-First MVP keeps required accounting data in the Workspace folder."
>
> **Dev:** "How do we know whether a feature belongs in the MVP?"
> **Domain expert:** "It should support the Golden Path from Workspace creation to approved entries and MVP Reports."
>
> **Dev:** "What does success look like after the MVP is built?"
> **Domain expert:** "MVP Validation proves that CSV rows become valid, inspectable Beancount and trustworthy reports without hiding the accounting mechanics."
>
> **Dev:** "If a February statement row is imported in May, where does approval write it?"
> **Domain expert:** "Approval writes immediately to the February Monthly Transaction File."
>
> **Dev:** "Should Diurnum infer a different bank or credit-card account for each imported row?"
> **Domain expert:** "No. The Founder-Operator selects one Source Account for the CSV Import."
>
> **Dev:** "Should importing the same Chase CSV twice create duplicate review items?"
> **Domain expert:** "No. Diurnum should use Import Fingerprints to recognize repeated Statement Rows for the same Source Account."
>
> **Dev:** "Does every CSV need a global bank-format detector?"
> **Domain expert:** "No. The MVP uses a Source Mapping saved for each Source Account."
>
> **Dev:** "What fields must a mapped CSV row provide?"
> **Domain expert:** "A Statement Row needs posted date, description, and amount; other fields are optional support."
>
> **Dev:** "For a credit-card charge, should the imported amount be positive because the card balance went up?"
> **Domain expert:** "No. The Source Amount is the Beancount posting amount for the Source Account, so the liability posting is negative."
>
> **Dev:** "When a bank CSV has separate debit and credit columns, should Diurnum use accounting debit/credit rules by account type?"
> **Domain expert:** "No. In MVP CSV statements, debit means money out and credit means money in. Diurnum normalizes those statement labels into one Source Amount."
>
> **Dev:** "Should review show only a suggested category?"
> **Domain expert:** "No. The primary surface is an Entry Preview, with Journal Detail available for debit and credit inspection."
>
> **Dev:** "What happens if the user edits a .bean file and creates an unbalanced entry?"
> **Domain expert:** "Diurnum should run Ledger Validation and alert them that the Workspace ledger is invalid."
>
> **Dev:** "Does Diurnum need an embedded Beancount editor in the MVP?"
> **Domain expert:** "No. MVP users edit ledger files externally, and Diurnum surfaces validation errors in the app."
>
> **Dev:** "Can the user keep approving imports while the ledger is out of balance?"
> **Domain expert:** "No. Invalid Ledger State blocks Approval and reports until the ledger is fixed."
>
> **Dev:** "Should raw imported bank rows be written into Beancount before approval?"
> **Domain expert:** "No. Statement Rows and review state live in the Staging Area until Approval writes accounting entries to the ledger."
>
> **Dev:** "Should Diurnum delete the imported row after approval?"
> **Domain expert:** "No. Diurnum keeps it as an Accounted Statement Row for provenance and deduplication."
>
> **Dev:** "Should Diurnum provenance be written as Beancount comments?"
> **Domain expert:** "No. Diurnum writes valid Beancount metadata on approved entries."
>
> **Dev:** "If the user deletes Diurnum_id from a valid entry, should the ledger be blocked?"
> **Domain expert:** "No. The ledger remains valid, but Diurnum treats the entry as Broken Provenance."

> **Dev:** "Is V1 just the MVP with a new coat of paint?"
> **Domain expert:** "No. V1 inherits the MVP accounting loop, but adds the App Shell, Ledger Editor, Smart CSV Import, Documents, Git Integration, Data Integrity Layer, and packaged macOS distribution."
>
> **Dev:** "Can V1 open any Beancount project because it writes Beancount-compatible files?"
> **Domain expert:** "No. V1's compatibility promise is about exit and interoperability. Opening arbitrary external Beancount projects is post-V1."
>
> **Dev:** "Does V1 still require users to edit `.bean` files outside Diurnum?"
> **Domain expert:** "No. V1 adds the Ledger Editor as the home screen, while External Ledger Edits remain supported."
>
> **Dev:** "Can the Ledger Editor silently overwrite a file that changed in another editor?"
> **Domain expert:** "No. External Ledger Edits are detected and require an explicit reload decision before Diurnum writes over them."
>
> **Dev:** "Can Smart CSV Import ship a Chase-specific importer?"
> **Domain expert:** "No. V1 uses generic column inference and saved Source Mappings, not bundled bank presets."
>
> **Dev:** "Should pending bank rows be dropped during import?"
> **Domain expert:** "No. V1 preserves Pending At Import on the Statement Row, shows it in the Inbox, and writes valid metadata if approved."
>
> **Dev:** "Can AI answer a financial question by doing arithmetic in the prompt?"
> **Domain expert:** "No. Ledger-Grounded AI means Diurnum computes from Workspace data and cites the entries behind numbers."
>
> **Dev:** "Does Predictive Entry Completion get to invent amounts if history is sparse?"
> **Domain expert:** "No. It can reuse approved history, rules, or adapter output, but it must not fabricate amounts or accounts."
>
> **Dev:** "Are Snapshots the new source of truth?"
> **Domain expert:** "No. Snapshots are recovery support. The readable Beancount ledger remains canonical."
>
> **Dev:** "Should Diurnum create a git repository for every Workspace?"
> **Domain expert:** "No. Git Integration activates only when an existing repository is detected."
>
> **Dev:** "Can auto-commit failures block bookkeeping?"
> **Domain expert:** "No. Git failures are surfaced as non-blocking notices."
>
> **Dev:** "Can V1 include anonymous usage analytics because no account data is sent?"
> **Domain expert:** "No. V1 has no anonymous usage statistics. Network behavior is limited to update checks, opt-in crash reports without Workspace data, and user-controlled BYO AI Adapter calls."

## Flagged ambiguities

- "MVP" was used near broader product ideas such as sync, collaboration, payroll, invoicing, tax, and external-ledger import; resolved: those are outside the MVP.
- "V1" could be mistaken for every roadmap idea after the MVP; resolved: V1 is the first public local desktop release and excludes sync, arbitrary Beancount import, collaboration, bank feeds, multi-currency, natural-language reports, and per-transaction document attachment.
- "User" could mean a founder, bookkeeper, accountant, or firm member; resolved: the MVP user is a **Founder-Operator**.
- "Business" could imply many accounting shapes; resolved: the MVP assumes an **MVP Business**.
- "Project", "company", and "file" could all describe what the app opens; resolved: the canonical term is **Workspace**.
- "Open existing" could mean importing any Beancount ledger; resolved: V1 opens existing **App-Created Workspaces** only.
- "Transaction" could mean a raw bank CSV row or a Beancount transaction; resolved: imported raw data is a **Statement Row**.
- "Suggestion" could mean a category, rule, or complete ledger change; resolved: the review unit is a **Suggested Entry**.
- "Approve" could mean accepting only a categorization; resolved: **Approval** commits a Suggested Entry to the ledger.
- Split transactions are needed after V1; resolved: **Split Entries** are outside V1, while **Transfer Entries** and approved **Transfer Matches** are the exception to the one-row default.
- Account balances need a starting point; resolved: Workspace setup supports **Opening Balances**.
- Reporting scope could expand into cash flow, tax, variance, runway, or AI narratives; resolved: **MVP Reports** are limited to income statement, expense breakdown, source account balances, and balance sheet.
- AI could be framed as autonomous accounting; resolved: **AI Suggestions** are bounded suggestion assistance behind Approval.
- AI integration could mean hosted AI, embedded harness, or generic agent support; resolved: the MVP uses a **BYO AI Adapter**.
- AI could be required for the accounting loop; resolved: the **BYO AI Adapter** is optional for the MVP.
- AI context could mean direct ledger access or a full ledger dump; resolved: the MVP sends **Curated Ledger Context**.
- AI data sharing could be hidden or over-sanitized; resolved: relevant prior-entry details may be sent with **AI Context Disclosure**.
- AI could be allowed to reason out numbers from prompt context; resolved: **Ledger-Grounded AI** requires computation from Workspace data and source-entry citations for surfaced numbers.
- Predictive completion could feel like autonomous bookkeeping; resolved: **Predictive Entry Completion** only inserts editable text into the Ledger Editor buffer and never writes directly to the canonical ledger outside save and validation.
- Categorization could be hidden learning or explicit rules; resolved: the MVP uses user-confirmed **Categorization Rules**.
- The chart of accounts could be universal or locked; resolved: Diurnum creates an editable **Starter Chart of Accounts** for the MVP Business.
- The app target could drift toward hosted web or Mac-only native; resolved: Diurnum is a **Local Desktop App**. V1 ships on macOS Apple Silicon, while the architecture preserves a cross-platform path.
- "Local-first" could still hide cloud dependencies; resolved: the **Local-First MVP** and **Local-First V1** require no Diurnum cloud account for accounting data.
- MVP scope could sprawl into adjacent accounting workflows; resolved: use the **Golden Path** as the acceptance path.
- MVP success could be measured as a feature checklist; resolved: use **MVP Validation** as the trust-oriented success statement.
- Beancount compatibility could mean Diurnum must ingest every existing Beancount project; resolved: V1's compatibility is primarily an exit/interoperability promise, while arbitrary import is post-V1.
- Approved entries could be grouped by import batch or by accounting month; resolved: the MVP writes to **Monthly Transaction Files** by entry date.
- "Account" could mean a Beancount account, bank account, workspace account, or user account; resolved: accounting accounts are **Ledger Accounts**, and imports choose one **Source Account**.
- Deduplication could mean repeated CSV rows or duplicate ledger detection; resolved: the MVP deduplicates **Statement Rows** by **Import Fingerprint** within a **Source Account**.
- CSV mapping could be global, bank-specific, automatic, or per account; resolved: V1 uses generic inference plus per-**Source Account** **Source Mapping**, not bundled bank presets.
- "Pending" could mean a row is ignored until the bank posts it; resolved: **Pending At Import** is preserved and visible, not silently dropped.
- CSV amount signs could follow bank UI conventions or Beancount posting signs; resolved: the MVP normalizes to **Source Amount**.
- CSV debit/credit columns could mean accounting debit/credit or statement direction; resolved: **Statement Debit/Credit** means debit is money out and credit is money in.
- Debit and credit language is useful for low-level accounting but not the default review surface; resolved: use **Entry Preview** first and expose **Journal Detail** one click away.
- Manual edits could be blocked, ignored, or treated as authoritative; resolved: **Manual Ledger Edits** are essential and supported, while **Ledger Validation** reports ledger-level problems.
- Embedded ledger editing is outside the MVP but required for V1; resolved: the MVP supports **External Ledger Edits**, while V1 adds the **Ledger Editor** without making it a separate source of truth.
- External file changes could be overwritten by autosave; resolved: the **Ledger Editor** must detect **External Ledger Edits** and prompt before reload or overwrite.
- Statement Rows could be stored in Beancount metadata or outside the ledger; resolved: they live in the **Staging Area** until Approval.
- Approved import rows could be deleted or retained; resolved: retain them as **Accounted Statement Rows**.
- Approved entries could be linked by file line number, comments, or metadata; resolved: use **Diurnum Entry Metadata**.
- Manual metadata edits can break Diurnum's link to Staging Area records; resolved: this creates **Broken Provenance**, not an invalid ledger.
- Documents could become hidden attachments in a database; resolved: **Documents Folder** files live in the Workspace filesystem and are committable.
- Document support could imply per-transaction attachments; resolved: V1 Documents are folder-based, and per-entry links are post-V1.
- Snapshots could be confused with the canonical ledger or git history; resolved: **Snapshots** are recovery support around readable Beancount files.
- Git could become mandatory or remote-aware; resolved: **Git Integration** is optional, local-only, and does not initialize repos, push, pull, branch, or resolve conflicts.
- Auto-commit UX could interrupt Approval; resolved: Git auto-commits are silent, and failures are non-blocking notices.
- Privacy could be weakened by harmless-seeming analytics; resolved: V1 has a strict **Privacy Boundary** and no anonymous usage statistics.
- Performance could be treated as an implementation afterthought; resolved: **Performance Budgets** are product constraints.
