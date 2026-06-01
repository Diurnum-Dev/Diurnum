# Homepage Persuasion — Design Spec

**Date:** 2026-06-01  
**File:** `docs/index.html`  
**Scope:** Approach A — problem-first hero + new workflow section + targeted tweaks

---

## Problem

The current homepage has two weaknesses:

1. **Too abstract** — talks about Beancount and plain text without showing what the app actually does
2. **Weak value prop** — leads with product features ("local-first, double-entry, AI") rather than the felt pain a visitor arrives with

## Goal

Make the page more persuasive for four visitor types — founder-operator, technical tinkerer, privacy-first user, and plain-text accounting user — by leading with a problem they all feel, then showing concretely how Diurnum solves it.

---

## Changes by Section

### 1. Hero — Full Rewrite

**Current headline:** "The day-book, restored."  
**New headline:** "Your books should belong to you."

**Current tagline:** "Own your ledger. Let AI help."  
**New tagline:** "Not your software vendor. Not their cloud."

**Body copy** — rewrite to state the problem before naming the solution:

> Most accounting software keeps your books in their database. You pay monthly to access your own numbers — and if you leave, you lose your history. Diurnum records everything as plain Beancount text on your machine. AI helps you work faster. You stay in control of every entry.

Hero actions, meta line ("Apple Silicon · Free forever · No account required"), and layout are unchanged.

---

### 2. App Screenshot — Keep

No changes. The Ledger Editor screenshot remains the first visual.

---

### 3. Etymology — Keep

No changes.

---

### 4. "How it works" — New Section

Insert between Etymology and the Pillars section.

**Section label:** "How it works"  
**Heading:** "From import to ledger in four steps"  
**Subhead:** "A workflow you can see, review, and trust at every stage."

Four steps, displayed as a horizontal strip (2×2 grid on mobile). Each step has:
- A small screenshot (cropped/thumbnailed from existing assets)
- A step number
- A short title
- One-line description

| Step | Screenshot | Title | Description |
|------|-----------|-------|-------------|
| 1 | `Import.png` | Import your transactions | Drag in a CSV or connect a bank feed. Diurnum reads it instantly. |
| 2 | `Inbox.png` | Review AI suggestions | Every categorization is a suggestion — you see the reasoning, approve or edit. |
| 3 | `Transaction Detail.png` | Every entry, in your hand | Each transaction becomes a Beancount entry. Portable, auditable, yours. |
| 4 | `Reports.png` | Real P&L and balance sheet | Not budget bars. Actual double-entry accounting reports, always up to date. |

Screenshots live at `docs/screenshots/`. Reference them as relative paths.

---

### 5. Pillars (Why Diurnum) — Copy Tweaks

Structure, layout, and section label unchanged. Rewrite each pillar body to open with the pain it resolves before stating the solution.

**Pillar 1 — "The day-book, restored"**  
> Most accounting tools give you budget bars. Diurnum does real double-entry bookkeeping — P&L, balance sheet, the works — recorded as a day-book you can read and audit forever.

**Pillar 2 — "Written in your own hand"**  
> Your books live in your files, not a vendor's database. Plain Beancount text that opens in Fava, validates with `bean-check`, and leaves with you to any plain-text tool.

**Pillar 3 — "Every line, accountable"**  
> AI suggestions are grounded in your ledger and cite their sources. Every figure traces to the entry — and the day — that produced it. No black boxes.

**Pillar 4 — "Built to endure"**  
> Local-first, private, version-controlled. A record designed to outlast the software that wrote it. Free and open source, forever.

---

### 6. Diff Showcase — Keep

No changes. It's specific and concrete — exactly what the page needs more of.

---

### 7. Comparison Table — Minor Tweaks

Two changes only:

1. **Fix column label:** "Privacy budgeting apps" → "Local budgeting apps"
2. **Add Price row:**

| | Local budgeting apps | Cloud SaaS (QBO, Xero) | Raw Beancount + Fava | Diurnum |
|---|---|---|---|---|
| Price | Free / $15/mo | $30–$90/mo | Free (DIY) | Free forever (local) |

---

### 8. Waitlist — Keep

No changes.

---

## What This Achieves

- **Fixes "too abstract":** The "How it works" section gives every visitor type a concrete workflow to follow — not just claims about plain text.
- **Fixes weak value prop:** The hero now opens on the felt pain (data ownership) shared by all four audience types before naming the product.
- **Low risk:** Page structure, visual design, and brand voice are preserved. Only copy and one new section change.

---

## Assets Used

All screenshots already exist at `docs/screenshots/`:
- `Import.png`
- `Inbox.png`
- `Transaction Detail.png`
- `Reports.png`
