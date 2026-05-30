# Diurnum

Diurnum is an accounting app made for nerds.

Built on the Beancount file format, Diurnum is centered around text files.

Everything is a text file - ledgers, account balances, reports, customer records, settings.

Text files are stored on your local computer. They're completely portable and fully compatible with Beancount (https://github.com/beancount/beancount/). You can spin up Fava (https://github.com/beancount/fava) and load your files.

Diurnum is an open-source product. Anyone can download it and use it for free. Available for MacOS, Linux, Windows, and eventually Android and iOS.

We will offer a paid sync service (similar to Obsidian) that will securely store your workspace files and sync them between devices. A user can sync their own workspaces, and they can also provide client access. The pro version (higher pricing tier) will offer client access with secure credentials, and a web-only report viewer.

## Concepts

- Workspace: a self-contained vault of workspace files for a company, individual, or other entity. Workspaces are completely separate. User can switch between workspaces by clicking on the workspace menu.
- Ledger: One or more Beancount ledger files
- Entry:
- Report:

## Main Screen

Diurnum centers around the ledger, so the main screen displays your ledger by default. It's a text file, so it opens in a text editor.

The screen is split into a main section with a narrow sidebar navigation on the left.

The user can navigate different sections by clicking on the navigation.

```
+-------------+---------------------------+
| wksp. name  |                           |
|             |                           |
| Sidebar     | Ledger                    |
| Navigation  |                           |
|             |                           |
+-------------+---------------------------+
```

## Navigation

- Ledger
- Reports
- Documents
- Customers
- Invoices
- Import - statements & bank connections

## Design Principles

The design is open and clean with lots of whitespace.

Dark mode compatible.

Colors: minimal, with pastel colors to communicate meaning and direct attention to important functions.

Clear typography, well-defined hierarchy.

The Ledger screen will display the raw ledger file, so it must act like an IDE. Inside the ledger editor: monospace font, auto-alignment of ledger entries, inline validation with error hints and auto-correction.

### Design inspiration

https://dribbble.com/shots/20540402-Invoices-Accounting-Web-App

![[Pasted image 20260526002926.png]]

![[Pasted image 20260526004957.png]]
![[Pasted image 20260526005116.png]]
![[Pasted image 20260526005156.png]]

> Design a desktop app screen for **Diurnum**, an accounting app for power users built on plain text files. This is the main **Ledger Editor** — the first thing users see when they open the app.
>
> **Layout:** Two-column split. Narrow sidebar (~200px) on the left, wide main editor on the right.
>
> **Sidebar:**
>
> - Top: workspace name (e.g. "Personal Finances") with a small chevron for switching workspaces
> - Navigation with small monoline icons, vertically stacked: Ledger (active), Reports, Documents, Customers, Invoices, Import
> - Active item highlighted with a soft pastel accent background pill
> - Bottom: settings gear icon
>
> **Main editor area:**
>
> - Thin breadcrumb / file bar at top: "main.beancount"
> - Full-height code editor — monospace font, line numbers in left gutter
> - Beancount-format ledger content with syntax highlighting: dates (muted blue), account names (dark teal), amounts (near-black), comments (gray)
> - Show 5–6 realistic transactions, auto-aligned decimal columns
> - One entry has a subtle inline error indicator (soft red underline + small margin dot) with a compact inline hint message
> - Thin status bar at the very bottom: filename, cursor position (line:col), and a small "✓ Valid" badge
>
> **Visual style:**
>
> - Very clean, minimal — generous whitespace throughout
> - Light mode: white editor area, very light gray (#F7F7F8) sidebar, hairline borders
> - Sans-serif UI chrome (Inter or similar); monospace editor font (JetBrains Mono or SF Mono)
> - One accent color used sparingly: soft sage green or slate blue — only for active nav item, primary action, and status badges
> - No gradients. Subtle borders instead of shadows. High contrast for editor text.
>
> **Tone:** This is a tool for people who care about their tools — precise, calm, confident. Think Linear meets VS Code meets a well-designed terminal app.
