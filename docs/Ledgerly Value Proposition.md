---
type: Note
belongs_to: "[[Ledgerly]]"
---
# Ledgerly Value Proposition

Collaboration and cross-device access might be a value proposition - think Obsidian Sync - the app might be free or very inexpensive (like Obsidian), with a paid sync service that would allow users to access their data from multiple devices and users. Technical users could do it with Git, everyone else could pay to push the easy button.

I think that’s a **much stronger business model** than “accounting SaaS,” and it fits the product philosophy well.

The model becomes:

> **Free or inexpensive local-first accounting app. Paid sync, sharing, backup, and collaboration.**

That is a very credible path.

The analogy to Obsidian is especially apt because the local file is the product’s trust anchor, while paid sync is the convenience layer.

## The core model

I’d structure it like this:

```text
Local app:
  Free or inexpensive
  User owns the ledger files
  Works offline
  Supports Beancount export/import
  Supports Git for technical users

Paid sync:
  Multi-device access
  End-to-end encrypted backup
  User/team sharing
  Collaboration
  Version history
  Conflict resolution
  Device management
  Optional web access later
```

That lets you say:

> “You can always use the app locally. Pay us when you want effortless sync and collaboration.”

That is a much friendlier trust posture than forcing financial data into your cloud from day one.

## Why this is a good fit

This solves a few positioning problems at once.

First, it lowers adoption friction. Someone can try the app with a CSV and a local Beancount file without committing to cloud accounting software.

Second, it preserves the “you own your books” promise. If the user stops paying, they do not lose their ledger.

Third, it creates a clean upgrade path. As soon as they want to use a laptop and desktop, invite a bookkeeper, share with a spouse, or keep encrypted backup, sync becomes valuable.

Fourth, it avoids competing head-on with QuickBooks at the beginning. You are closer to:

> **Obsidian for financial records**  
> **GitHub for your books, but usable by nontechnical people**  
> **Cursor-like AI on top of a local accounting ledger**

That is a distinctive category.

## Free app vs paid app

I would probably make the local app **free for personal/local use**, at least at first.

The free tier could include:

- Local Beancount projects
- CSV import
- Manual transaction entry
- Ledger editor
- Validation
- Local reports
- Basic rules
- Git integration
- Export
- Limited local AI or user-supplied API key

Then paid plans unlock:
- Hosted AI usage
- Sync
- Encrypted backup
- Multiple devices
- Shared workspaces
- Bookkeeper/client collaboration
- Cloud bank-feed connector
- Web viewer
- Advanced automation

This creates a nice “generosity gradient”: the app is useful for free, but the paid service solves real pain.

## Pricing shape

I’d think in terms of three paid products.

### 1. Sync plan

For individuals, founders, freelancers, households.

Maybe:

```text
$8–$12/month
```

Includes:

- Encrypted sync
- Multiple device
- Backup and restore
- Version history
- Maybe basic AI credits

This is the Obsidian Sync analogue.

### 2. Pro / business plan

For small businesses.

Maybe:

```text
$20–$40/month per workspace
```

Includes:

- Sync
- Hosted AI categorization
- More transaction volume
- More projects/entities
- Document sync
- Reconciliation workflows
- Bank-feed add-on eligibility

### 3. Collaboration / firm plan

For bookkeepers, fractional CFOs, and advisors.

Maybe:

```text
$50–$150/month base
+ per-client workspace pricing
```

Includes:
- Client workspaces
- Shared review queues
- Comments
- Prepared/reviewed states
- Month-end close workflow
- Role-based permission
- Client invites
- Export packages

The big revenue likely comes from the firm/collaboration layer, not from solo users.

## What technical users get with Git

This is important: **do not punish technical users for using Git**. Make it a feature.

For technical users:

```text
~/Finance/AcmeCo/
  main.bean
  transactions/
  documents/
  .git/
```

The app can:

- Detect Git repo
- Show commit history    
- Commit approved changes
- Show diff
- Create branches for imports
- Support pull/rebase workflows
- Warn about conflicts
- Let advanced users sync through GitHub, GitLab, iCloud Drive, Dropbox, Syncthing, etc.

That will build credibility with the early adopter community.

But Git should be optional. For everyone else, paid sync is the “easy button.”

## Product positioning

I would avoid saying:

> “Use our cloud accounting platform.”

Instead:

> **Local-first accounting with effortless sync when you need it.**

Or:

> **Own your books. Sync them securely. Share them with your accountant.**

Or:

> **A private accounting workspace that works like files, with AI built in.**

The emotional promise is:

> “You are never locked in, never stuck, and never guessing what changed.”

## Sync as a product, not infrastructure

The important thing is to treat sync as a user-facing product, not just a backend feature.

Users should see:

- Which devices have access
- Last synced time
- Pending changes
- Version history
- Restore points
- Who changed what
- Conflict resolution
- Shared workspace members
- Access permissions
- Encrypted backup status

For financial software, sync cannot be magical and invisible. It needs to be **transparent**.

## Suggested sync architecture

I would design the app around a local project model.

Each project has:

```text
Ledger files:
  main.bean
  accounts.bean
  transactions/*.bean

App metadata:
  rules
  import history
  suggestions
  review states
  document links
  sync state
```

Then sync both:

1. The Beancount ledger files.
2. App metadata needed for review workflows.

A local SQLite database is convenient, but you should not make it the only copy of critical accounting data. For syncability, I’d consider using an append-only operation log.

## Operation log model

Instead of syncing “current database state” only, sync operations:

```json
{
  "op_id": "op_123",
  "workspace_id": "ws_456",
  "actor_id": "user_789",
  "device_id": "macbook_pro",
  "created_at": "2026-05-08T14:31:22Z",
  "type": "approve_transaction_suggestion",
  "payload": {
    "raw_transaction_id": "txn_abc",
    "ledger_patch": "...",
    "suggestion_id": "sug_def"
  },
  "base_ledger_hash": "sha256:..."
}
```

Then the local app applies operations to reconstruct state.

This gives you:

- Audit trail
- Version history
- Sync replay
- Conflict detection
- Offline edits
- Easier collaboration

For the MVP, you can simplify this, but long-term I would lean heavily into operation/event sourcing.

## Sync conflict strategy

Accounting sync conflicts are not like note-taking conflicts. You need to be conservative.

Conflicts should occur when:

- Two devices edit the same ledger file from the same base version.
- Two users approve different categorizations for the same imported transaction
- A transaction is edited after a period was locked elsewhere.
- Account names are changed concurrently.
- One user deletes or rewrites a file another user edited.

Conflict UX should be explicit:

```text
Conflict detected:
  Ryan categorized OPENAI as Expenses:Software.
  Alex categorized it as Expenses:Subscriptions.

Choose:
  Keep Ryan's version
  Keep Alex's version
  Edit manually
```

For ledger file conflicts, show Beancount diffs.

This is another reason Beancount is useful: the sync conflict can be represented as text diffs plus semantic validation.

## Collaboration model

I’d define roles early, even if the first version is simple.

```text
Owner:
  Manage billing, members, sync, delete workspace

Bookkeeper:
  Import, categorize, reconcile, prepare reports

Reviewer:
  Approve changes, lock periods, comment

Viewer:
  View reports and ledger only
```

For personal/family finances, roles can map to:

```text
Owner
Editor
Viewer
```

For accounting firms:

```text
Firm admin
Staff
Client owner
Client reviewer
```

## Collaboration workflows worth charging for

The paid collaboration plan should not merely be “multiple users.” It should have workflows that save time.

Examples:

### Client review queue

Bookkeeper prepares entries. Client sees:

```text
Please review:
  3 uncategorized expenses
  2 transactions needing receipts
  1 possible duplicate
```

### Month-end close

```text
April 2026 close checklist:
  ✓ Bank imported
  ✓ Credit card imported
  ✓ 4 exceptions resolved
  ✓ Reconciled through Apr 30
  ☐ Owner review
  ☐ Lock period
```

### Comments on transactions

> “Was this meal with a client?”

Client replies, attaches receipt, bookkeeper approves.

### Report sharing

Share a read-only P&L link or synced report view.

### Accountant package

Export:

```text
ledger.zip
  main.bean
  transactions/
  trial-balance.csv
  p-and-l.pdf
  balance-sheet.pdf
  receipts/
  audit-log.json
```

This is where the product becomes valuable to professionals.

## How AI fits into this model

AI can be part of the local app, but hosted AI can be a paid service.

Free/local options:
- Bring your own API key
- Local-only rules
- Maybe lightweight local model later
- Limited trial credits

Paid options:
- Hosted AI categorization
- AI report explanations
- AI anomaly detection
- AI receipt extraction
- AI-assisted reconciliation
- AI query assistant
- AI rule recommendations

But keep the same trust model:

> AI proposes. Humans approve. Ledger records the result.

## Data ownership promise

I would make this a headline promise:

```text
Your accounting data is stored in open Beancount files.
You can export your complete ledger at any time.
Sync is optional.
If you cancel sync, your local books keep working.
```

This is especially powerful compared with traditional accounting SaaS.

## Sync security model

For a finance product, I would seriously consider **end-to-end encryption** for sync.

A possible design:

```text
Local app encrypts workspace data
  ↓
Cloud stores encrypted blobs / operations
  ↓
Other authorized devices decrypt locally
```

Your server handles:
- Identity
- Billing
- Device registration
- Encrypted blob storage
- Sync coordination
- Sharing invitations

But cannot read ledger contents by default.

This is great for trust, but it complicates server-side AI and web access.

So you may need two modes.

### Private sync mode

- End-to-end encrypted
- Server cannot read books
- AI runs locally or with explicit selected-data sharing
- No server-side web reports

### Cloud-assisted mode

- Data available to your backend under strict controls
- Enables web reports, hosted AI, bank feeds, collaboration features
- Easier UX
- Less privacy-pure

I would not hide this distinction. Make it a product choice.

## Practical MVP sync design

For the first paid sync version, I would not overbuild full CRDT-style collaboration.

Start with:
- One active editor at a time per workspace, or optimistic locking.
- Append-only version history.
- Whole-file or patch-based sync.
- Clear conflict detection.
- Manual conflict resolution.
- Device list.
- Restore previous version.

Initial sync primitives:

```text
Workspace
Device
User
LedgerVersion
FileBlob
Operation
Invitation
Conflict
```

Sync process:

```text
Local device has base version 12
User approves 10 transactions
App creates version 13 locally
App uploads encrypted patch/version
Server stores version 13
Second device pulls version 13
Second device applies patch
Local Beancount validates
```

If second device also created version 13 from base version 12:

```text
Conflict:
  local version 13A
  remote version 13B
```

Then require merge.

## Native + sync architecture

```text
macOS App
  ├─ Local Beancount files
  ├─ Local SQLite metadata
  ├─ Local operation log
  ├─ Local validation/reporting
  ├─ Git integration for technical users
  │
  └─ Optional Sync Service
       ├─ Auth
       ├─ Billing
       ├─ Device registry
       ├─ Encrypted workspace storage
       ├─ Version history
       ├─ Invitations
       └─ Conflict coordination
```

This keeps the app useful without the service, while making the service valuable.

## What becomes free vs paid

Here’s how I’d draw the line.

|Feature|Free local app|Paid sync|
|---|--:|--:|
|Local Beancount files|Yes|Yes|
|CSV import|Yes|Yes|
|Ledger editor|Yes|Yes|
|Local reports|Yes|Yes|
|Rules|Yes|Yes|
|Git integration|Yes|Yes|
|Manual export|Yes|Yes|
|Multi-device sync|No|Yes|
|Encrypted backup|No|Yes|
|Shared workspaces|No|Yes|
|Client review queues|No|Yes|
|Device management|No|Yes|
|Hosted AI credits|Limited / BYO|Included|
|Bank feed connector|Add-on|Add-on|
|Web read-only access|No|Possibly|
|Accountant collaboration|No|Yes|

This is a clean model.

## How this affects MVP priorities

If sync is the business model, you should design for it early, even if you do not ship it immediately.

That means from day one:

- Use stable IDs for transactions, suggestions, accounts, rules.
- Store an operation log.
- Track device identity.
- Keep ledger version hashes.
- Make commits atomic.
- Avoid hidden app state that cannot be synced.
- Separate canonical ledger from UI cache.
- Make conflict detection possible.

Even the local-only MVP should behave like a single-device sync client.

## Recommended build sequence

### Phase 1: Local app

- Open/create Beancount workspace
- CSV import
- AI/rule categorization
- Reviewable diffs
- Reports
- Local version history

### Phase 2: Git-friendly mode

- Detect Git repo
- Commit approved ledger changes
- Show Git diff/history
- Pull/push helper, maybe later

This earns trust with technical users.

### Phase 3: Paid sync beta

- Account login
- Device registration
- Workspace sync
- Encrypted backup
- Multi-device restore
- Basic conflict detection

### Phase 4: Collaboration

- Shared workspace invitations
- Roles
- Comments
- Review queues
- Prepared/reviewed states
- Month-end close checklist

### Phase 5: Cloud conveniences

- Bank feeds
- Web viewer
- Hosted AI automation
- Accountant portal

This sequence lets you validate the app before betting everything on infrastructure.

## Strategic advantage

This model gives you a rare combination:

- Local-first trust
- Open file format
- Optional cloud convenience
- AI-assisted workflows
- Professional collaboration
- Git for power users
- Paid sync for everyone else

That is a much sharper wedge than “QuickBooks alternative.”

It also gives users an emotionally satisfying reason to adopt:

> “I finally have accounting software that respects my data.”

## My updated product concept

I’d now describe the product as:

> **A local-first accounting workspace built on Beancount, with AI assistance and optional encrypted sync for teams and devices.**

Or more marketable:

> **Own your books. Let AI help. Sync when you want.**

That feels like a strong product direction.

My recommendation: design the local MVP as though sync will exist later, but don’t force sync into v1. Ship a great local Mac app first, then monetize the pain that appears naturally: “I want this on my other Mac,” “I want my bookkeeper to see this,” “I want a safe backup,” and “I want my accountant to review this.”