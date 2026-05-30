# Diurnum Homepage — Claude Code Prompt

**Purpose:** Paste the prompt below directly into Claude Code to generate `docs/index.html` from scratch.

---

## Prompt

Build a complete marketing homepage for Diurnum as a single self-contained HTML file at `docs/index.html`. All CSS in a `<style>` block. No external frameworks or JS libraries. Vanilla JS only where needed. Responsive down to 375px.

---

### Product

**Diurnum** (dy-UR-num) is a local-first, double-entry accounting desktop workspace for macOS. It records everything as plain Beancount text the user owns outright — readable in Fava, validatable with `bean-check`, version-controllable with git. Free and open source under GPL v3.

AI proposes entries; the user approves; the day-book records the result. The core promise is a durable, portable accounting record that outlasts any vendor.

**Status:** Pre-launch. Collecting waitlist emails. GitHub repo is live at `https://github.com/Diurnum-Dev/Diurnum`.

**Primary audience:** The Founder-Operator — a technically literate solo business owner on macOS who keeps their own books, lives in the terminal, version-controls everything, and resents software that won't show its work.

---

### Design system

#### Palette

```css
--color-bg:            #FBF6EC;   /* warm parchment — the ground */
--color-bg-muted:      #F3EAD7;
--color-bg-subtle:     #F7EFDF;
--color-bg-raised:     #F8F5EE;
--color-text:          #1C1A17;   /* iron-gall ink */
--color-text-muted:    #6B6051;
--color-text-subtle:   #938775;
--color-text-ghost:    #A89C88;
--color-border:        #E3D8C2;
--color-border-strong: #D0C2A6;
--color-accent:        #243B6B;   /* lapis — the primary accent */
--color-accent-bg:     #E4E8F1;
--color-accent-strong: #2F4E8C;
--color-accent-hover:  #1C2F56;
--color-destructive:   #7B2D26;   /* oxblood */
--color-destructive-bg:#F2E0DB;
--color-highlight:     #B68A3E;   /* ochre — use sparingly */
--color-highlight-bg:  #F2E7CD;
--color-highlight-ink: #7A5A20;
--diff-add-bg:         #E7EBF3;
--diff-add-text:       #1B3560;
--diff-del-bg:         #F3E2DD;
--diff-del-text:       #5C1F1A;
--diff-ctx-text:       #7B6A52;
```

No dark mode.

#### Typography

Load from Google Fonts:
```
Spectral: ital,wght@0,400;0,500;0,600;0,700;1,400;1,500
Source Sans 3: wght@400;500;600
JetBrains Mono: wght@400;500
```

Usage:
- **Spectral** (serif): hero headline, section headings, etymology, taglines, pillar titles. This is the brand register — the "ancient practice" half of the visual thesis.
- **Source Sans 3** (sans): body copy, nav links, buttons, meta text, table content.
- **JetBrains Mono** (mono): all code, diffs, the pronunciation badge, editor/ledger surfaces. The "modern tool" half of the visual thesis.

The contrast between serif chrome and monospace ledger content is intentional and central to the brand.

#### Spacing

4px base unit. Key stops: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96px.

#### Radii

2–4px only. No pill shapes. No `border-radius` above 4px.

#### Shadows

Subtle only: `0 1px 2px rgba(28,26,23,0.05), 0 2px 8px rgba(28,26,23,0.05)`.

---

### Page sections

#### 1. Nav

Full-width sticky header. Hairline border-bottom (`--color-border`). Parchment background. Max-width 1200px inner container, horizontal padding 24px, flex row, space-between, align-items center.

Left: brand mark — a serif "D" in lapis (Spectral, 28px, bold) immediately followed by the wordmark "Diurnum" (Spectral, 16px, medium, letter-spacing 0.04em, ink color). Wrap in an `<a href="#">` with no text-decoration.

Right: nav links in a `<ul>` (flex, gap 24px, no bullets) — **Why** (href `#why`) · **Diff** (href `#diff`) · **Compare** (href `#compare`) · **GitHub** (href `https://github.com/Diurnum-Dev/Diurnum`, opens in new tab). Source Sans 3, 12px, medium weight, muted ink, hover to full ink. Hide the link list below 768px.

Far right (after nav links): a primary button "Join the waitlist" (small size: 32px height, 14px padding horizontal, 12px font) that scrolls to `#waitlist`. Keep it even on mobile.

#### 2. Hero

Center-aligned. Top padding 32px, bottom padding 64px.

```
eyebrow
  Source Sans 3, 11px, semibold, letter-spacing 0.1em, uppercase
  color: --color-highlight
  margin-bottom: 20px
  "Desktop accounting workspace · macOS · GPL v3"

H1
  Spectral, 64px desktop / 48px ≤768px / 32px ≤480px
  font-weight: 500
  line-height: 1.1
  letter-spacing: -0.02em
  color: --color-text
  margin-bottom: 16px
  "The day-book, restored."

tagline
  Spectral, 20px, italic, weight 400
  color: --color-text-muted
  line-height: 1.4
  margin-bottom: 32px
  "Own your books. Let AI help."

body
  Source Sans 3, 16px
  color: --color-text-muted
  line-height: 1.65
  max-width: 620px, centered
  margin-bottom: 32px
  "For the founder-operator who keeps their own books: a desktop
   accounting workspace that records everything as portable,
   double-entry Beancount text — a day-book you write, own,
   and can read a decade from now."

actions
  flex, gap 12px, justify-content center, flex-wrap wrap
  Primary button: "Join the waitlist" — lapis fill, links to #waitlist (smooth scroll)
  Ghost button: "View on GitHub" — border style, links to GitHub (new tab)
    Include a GitHub SVG icon (16×16) before the text

meta
  Source Sans 3, 12px, --color-text-subtle
  margin-top: 24px
  "Apple Silicon · Free forever · No account required"
```

Buttons: 40px height, 20px horizontal padding, 14px font, Source Sans 3 medium, 2px border-radius. Primary: lapis bg, parchment text, hover to `--color-accent-hover`. Ghost: transparent bg, `--color-border` border, ink text, hover to `--color-bg-muted` bg and `--color-border-strong` border. Both buttons get `:focus` outline 2px lapis, offset 2px.

#### 3. Hero screenshot

Section below hero, centered, padding 0 24px 64px.

Display the Ledger Editor screenshot inside a simulated macOS window frame. The image path from `docs/index.html` is `screenshots/Ledger Editor.png`. URL-encode the space: `screenshots/Ledger%20Editor.png`.

Frame structure:
```html
<div class="app-frame">
  <div class="app-titlebar">
    <span class="dot dot-red"></span>
    <span class="dot dot-yellow"></span>
    <span class="dot dot-green"></span>
    <span class="app-filename">main.beancount — Diurnum</span>
  </div>
  <div class="app-body">
    <img src="screenshots/Ledger%20Editor.png" alt="Diurnum Ledger Editor — beancount plain text accounting" />
  </div>
</div>
```

Frame styles:
- Max-width: 960px, centered (margin 0 auto)
- Border: 1px solid `--color-border`
- Border-radius: 8px
- Box-shadow: `0 4px 6px rgba(28,26,23,0.04), 0 12px 32px rgba(28,26,23,0.10)`
- Overflow: hidden

Title bar:
- Background: `#2C2C2E`
- Height: 36px
- Padding: 0 12px
- Display: flex, align-items center
- Traffic-light dots: 12px diameter circles, gap 6px — red `#FF5F57`, yellow `#FEBC2E`, green `#28C840`
- Filename label: JetBrains Mono, 11px, `#8E8E93`, centered via flex margin (margin-left auto + margin-right auto or absolute center)

App body: img is display block, width 100%.

#### 4. Etymology

Centered section, max-width 560px, margin 0 auto, padding 48px 24px.

Text in Spectral, 18px, italic, `--color-text-muted`, line-height 1.65.

Bold terms (`<strong>`) inside the italic body: `font-style: normal; font-weight: 600; color: --color-text`.

Paragraph 1:
> **Diurnum** (dy-UR-num) is a Latin noun meaning **account-book, day-book** — attested in Juvenal, used in Rome for the running record of daily transactions. Late Latin *diurnum* became Old French *journal*; the sense "a daily record of transactions" is first recorded in 1565.

Paragraph 2 (margin-top 16px):
> The journal entry — the atom of double-entry bookkeeping — is, etymologically, a *diurnum* entry. The name is not a metaphor for the product. It **is** the product, in its oldest form.

Pronunciation badge (display: inline-block, margin-top 20px, JetBrains Mono, 12px, `--color-text-subtle`, `--color-bg-muted` background, 1px `--color-border` border, 2px border-radius, padding 6px 16px):
```
dy · UR · num
```

Wrap both paragraphs and badge in a `<div class="etymology-inner">` centered via text-align.

Hairline rules (`<hr>`) above and below this section.

#### 5. Messaging pillars

Section id `why`. Padding 64px 0.

Section label above grid (Source Sans 3, 11px, semibold, uppercase, letter-spacing 0.08em, `--color-text-muted`, padding-bottom 12px, border-bottom 1px `--color-border`, display block, margin-bottom 24px, text-align center):
```
Why Diurnum
```

2×2 grid. The grid itself has `background: --color-border` (so gap lines show through), 1px gap, border 1px `--color-border`, border-radius 3px, overflow hidden. Collapse to 1 column below 768px.

Each pillar cell: `background: --color-bg`, padding 24px.

Cell contents:
```
number    Spectral, 32px, weight 400, --color-border-strong, line-height 1, margin-bottom 12px
title     Spectral, 16px, medium, --color-text, margin-bottom 8px, line-height 1.3
body      Source Sans 3, 14px, --color-text-muted, line-height 1.6
```

Pillars (in order, left-to-right, top-to-bottom):

1. **The day-book, restored**
   Double-entry accounting in its oldest, most durable form. Real P&L and balance sheet — not budget bars. Books, not budgets.

2. **Written in your own hand**
   Plain Beancount text you own outright. Opens in Fava, validates with `bean-check`, leaves with you to any plain-text tool.

3. **Every line, accountable**
   Each figure traces to the entry — and the day — that produced it. AI suggestions are grounded in your ledger and cite their sources.

4. **Built to endure**
   Local-first, private, version-controlled. A record designed to outlast the software that wrote it. Free and open source, forever.

#### 6. Diff showcase

Section id `diff`. Padding 64px 0.

Section label (centered, same style as pillar label):
```
The record proves itself
```

Heading (Spectral, 24px, weight 500, centered, margin-bottom 12px):
```
Every entry, in your own hand
```

Subtext (Source Sans 3, 16px, `--color-text-muted`, centered, max-width 560px, margin 0 auto 32px, line-height 1.6):
```
Plain Beancount text. Open in Fava. Validate with bean-check. Leave any time.
```

Diff frame (max-width 720px, centered, border 1px `--color-border`, border-radius 4px, overflow hidden, `--color-bg-raised` background):

Header bar (`--color-bg-muted` bg, border-bottom 1px `--color-border`, padding 8px 20px, JetBrains Mono 11px, `--color-text-subtle`):
```
2026-05 · main.bean · before / after approval
```

Body (padding 16px 0, overflow-x auto):

Lines use JetBrains Mono, 12px, line-height 1.8, padding `1px 20px`, white-space pre.

The `+` / ` ` marker is `display: inline-block; width: 16px; text-align: center; user-select: none; margin-right: 8px`.

```
  ; Stripe payout — 8 May 2026          ← context: no bg, color --diff-ctx-text
+ 2026-05-08 * "Stripe" "Payout"        ← add: bg --diff-add-bg, color --diff-add-text
+   Assets:Bank:Checking      1842.17 USD
+   Expenses:Fees:Stripe        57.83 USD
+   Income:Sales             -1900.00 USD
```

#### 7. Competitive table

Section id `compare`. Padding 64px 0.

Section label (centered, ochre):
```
Competitive frame
```

Heading (Spectral, 24px, weight 500, centered, margin-bottom 24px):
```
Where Diurnum fits
```

Table wrapper: overflow-x auto, border 1px `--color-border`, border-radius 3px.

Table: width 100%, border-collapse collapse, Source Sans 3, 12px, min-width 600px.

Header row: `--color-bg-muted` background, border-bottom, 10px font, semibold, uppercase, letter-spacing 0.06em, `--color-text-muted`. Left-align, padding 12px 16px. The **Diurnum** column header: `--color-accent-bg` background, `--color-accent` text.

Data cells: padding 12px 16px, border-bottom 1px `--color-border`, `--color-text-muted`, line-height 1.5, vertical-align top. Last row has no border-bottom.

First column (feature label): 10px, semibold, uppercase, letter-spacing 0.06em, `--color-text-subtle`, white-space nowrap.

**Diurnum** data column: `#F5F7FB` background, `--diff-add-text` color, medium weight.

| | Privacy budgeting apps | Cloud SaaS (QBO, Xero) | Raw Beancount + Fava | **Diurnum** |
|---|---|---|---|---|
| Job | Track spending | Full accounting | Full accounting, DIY | Full accounting, kept to last |
| Data | Bespoke local file | Vendor database | Standard text files | Beancount standard |
| Audience | Privacy-minded consumers | SMBs + accountants | Technical tinkerers | Technical operators |
| AI | Categorize / import | Black-box automation | None | Grounded, cited, approved |
| Trust | "Local, trust us" | "Trust us" | "Do it yourself" | "The record proves itself" |

#### 8. Waitlist CTA

Section id `waitlist`. Background `--color-bg-muted`, border-top and border-bottom 1px `--color-border`. Padding 80px 24px.

Center everything. Max-width 480px, margin 0 auto.

```
eyebrow (ochre, caps, 11px, tracking):
  Early access

heading (Spectral, 32px, weight 500, margin-bottom 12px):
  Be among the first.

body (Source Sans 3, 16px, muted, line-height 1.6, margin-bottom 32px):
  Diurnum is coming to macOS. Join the waitlist and we'll let
  you know when it's ready.

form
  flex row on desktop (gap 8px), stacked on ≤480px
  
  input[type="email"]
    flex: 1
    height: 40px
    padding: 0 16px
    font: Source Sans 3, 13px
    background: --color-bg
    border: 1px solid --color-border
    border-radius: 2px
    color: --color-text
    placeholder color: --color-text-ghost
    :focus outline: 2px solid --color-accent, outline-offset 2px
  
  button[type="submit"] "Notify me"
    primary button style (same as hero CTA)
    flex-shrink: 0

privacy note (Source Sans 3, 12px, --color-text-subtle, margin-top 12px):
  No account required. Local-first. Free forever.
```

For the form action, use: `<form action="https://formspree.io/f/REPLACE_WITH_FORM_ID" method="POST">` with a comment `<!-- Replace REPLACE_WITH_FORM_ID with your Formspree endpoint -->`.

#### 9. Footer

Border-top 1px `--color-border`. Padding 40px 24px 48px. Center-aligned.

```
pronunciation (JetBrains Mono, 12px, --color-text-subtle, margin-bottom 16px):
  dy · UR · num

tagline (Spectral, 20px, italic, --color-text-muted, margin-bottom 24px):
  A record that endures.

links (flex, justify-content center, gap 20px, list-style none, margin-bottom 24px):
  GitHub → https://github.com/Diurnum-Dev/Diurnum (new tab)
  License (GPL v3)
  Documentation
  Privacy
  All: Source Sans 3, 13px, medium, --color-text-muted, no underline, hover to --color-text

copyright (Source Sans 3, 12px, --color-text-subtle):
  Diurnum · The day-book, restored · Free and open source forever
```

---

### Voice and copy constraints

- Short, measured sentences. One thought per sentence.
- No exclamation points in headings or subheadings.
- No AI superlatives ("supercharge", "revolutionize", "cutting-edge automation"). AI is assistance, not the marque.
- Technical terms (Beancount, Fava, `bean-check`, Beancount V3) are used plainly without apology. Render command names in monospace.
- Classical register through proportion, whitespace, and typography — not ornament. One well-placed archival note does the work; never fussy.
- Inline code snippets (`` `bean-check` ``, `` `bean-check` ``) render in JetBrains Mono with `--color-bg-muted` background tint and a subtle border.

---

### Technical requirements

- Output: `docs/index.html` — a single file, all CSS inline.
- No JavaScript frameworks. If JS is needed (smooth scroll polyfill, form UX), write it inline in a `<script>` block.
- `scroll-behavior: smooth` on the `html` element.
- `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
- `::selection`: background `--color-accent-bg`, color `--color-accent`.
- Screenshot path: `screenshots/Ledger%20Editor.png` (relative to `docs/index.html`, space URL-encoded).
- Responsive breakpoints: 768px (hide nav links, collapse form to column, stack pillars) and 480px (reduce type scale: hero H1 to 32px, tagline to 16px).
- `<title>`: Diurnum — The day-book, restored
- `<meta name="description">`: A local-first, double-entry accounting workspace built on plain Beancount text. Own your books. Free and open source for macOS.
- Preconnect to `https://fonts.googleapis.com` and `https://fonts.gstatic.com`.
