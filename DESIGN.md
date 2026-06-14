---
name: Diurnum Design System
colors:
  bg: "#FEFCF8"
  bg-muted: "#FBF6EC"
  bg-subtle: "#FCF9F2"
  text: "#1C1A17"
  text-muted: "#6B6051"
  text-subtle: "#938775"
  border: "#EDEAE4"
  border-strong: "#E0DBD3"
  accent: "#243B6B"
  accent-bg: "#E4E8F1"
  accent-strong: "#2F4E8C"
  accent-hover: "#1C2F56"
  destructive: "#A03228"
  destructive-strong: "#C94034"
  destructive-bg: "#F2E0DB"
  destructive-hover: "#ECCFC8"
  highlight: "#B68A3E"
  highlight-bg: "#F2E7CD"
  highlight-ink: "#7A5A20"
  editor-string-bg: "#F1E6C7"
  editor-active-block: "#FFFFFF"
  editor-ghost-text: "#A89C88"
  diff-add-bg: "#E7EBF3"
  diff-add-text: "#243B6B"
  diff-del-bg: "#F3E2DD"
  diff-del-text: "#A03228"
typography:
  display-2xl:
    fontFamily: Spectral, Georgia, Iowan Old Style, Times New Roman, serif
    fontSize: 32px
    fontWeight: "500"
    lineHeight: 1.2
  display-xl:
    fontFamily: Spectral, Georgia, Iowan Old Style, Times New Roman, serif
    fontSize: 24px
    fontWeight: "500"
    lineHeight: 1.25
  display-lg:
    fontFamily: Spectral, Georgia, Iowan Old Style, Times New Roman, serif
    fontSize: 20px
    fontWeight: "500"
    lineHeight: 1.35
  body-lg:
    fontFamily: -apple-system, BlinkMacSystemFont, system-ui, sans-serif
    fontSize: 16px
    fontWeight: "400"
    lineHeight: 1.5
  body-md:
    fontFamily: -apple-system, BlinkMacSystemFont, system-ui, sans-serif
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 1.55
  body-base:
    fontFamily: -apple-system, BlinkMacSystemFont, system-ui, sans-serif
    fontSize: 13px
    fontWeight: "400"
    lineHeight: 1.55
  caption:
    fontFamily: -apple-system, BlinkMacSystemFont, system-ui, sans-serif
    fontSize: 12px
    fontWeight: "400"
    lineHeight: 1.45
  label-xs:
    fontFamily: -apple-system, BlinkMacSystemFont, system-ui, sans-serif
    fontSize: 11px
    fontWeight: "600"
    lineHeight: 1.45
    letterSpacing: 0.08em
  mono-base:
    fontFamily: JetBrains Mono, ui-monospace, SF Mono, Menlo, Monaco, Consolas, monospace
    fontSize: 13px
    fontWeight: "400"
    lineHeight: 1.55
rounded:
  sm: 2px
  md: 3px
  lg: 4px
  pill: 9999px
spacing:
  unit: 4px
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 20px
  6: 24px
  8: 32px
  10: 40px
  12: 48px
  16: 64px
  sidebar-width: 200px
  status-bar-height: 28px
  tab-bar-height: 36px
  header-height: 48px
  inspector-width: 380px
  modal-sm: 420px
  modal-md: 520px
  modal-lg: 640px
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg}"
    typography: "{typography.body-md}"
    fontWeight: "500"
    rounded: "{rounded.sm}"
    height: 32px
    padding: 16px
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    borderColor: "{colors.border}"
    typography: "{typography.body-md}"
    fontWeight: "500"
    rounded: "{rounded.sm}"
    height: 32px
    padding: 16px
  button-secondary-hover:
    backgroundColor: "{colors.bg-muted}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.text}"
    typography: "{typography.body-md}"
    fontWeight: "500"
    rounded: "{rounded.sm}"
    height: 32px
    padding: 16px
  button-ghost-hover:
    backgroundColor: "{colors.bg-muted}"
  button-destructive:
    backgroundColor: "{colors.destructive-bg}"
    textColor: "{colors.destructive}"
    typography: "{typography.body-md}"
    fontWeight: "500"
    rounded: "{rounded.sm}"
    height: 32px
    padding: 16px
  button-destructive-hover:
    backgroundColor: "{colors.destructive-hover}"
  input-md:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    borderColor: "{colors.border}"
    placeholderColor: "{colors.text-subtle}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    height: 32px
    padding: 12px
  input-focus:
    borderColor: "{colors.accent}"
  input-invalid:
    borderColor: "{colors.destructive}"
  badge-default:
    backgroundColor: "{colors.bg-muted}"
    textColor: "{colors.text}"
    typography: "{typography.label-xs}"
    rounded: "{rounded.sm}"
    padding: 4px 8px
  badge-accent:
    backgroundColor: "{colors.accent-bg}"
    textColor: "{colors.accent}"
    typography: "{typography.label-xs}"
    rounded: "{rounded.sm}"
    padding: 4px 8px
  badge-destructive:
    backgroundColor: "{colors.destructive-bg}"
    textColor: "{colors.destructive}"
    typography: "{typography.label-xs}"
    rounded: "{rounded.sm}"
    padding: 4px 8px
  card:
    backgroundColor: "{colors.bg}"
    borderColor: "{colors.border}"
    rounded: "{rounded.md}"
    padding: 16px
  nav-item-inactive:
    backgroundColor: transparent
    textColor: "{colors.text}"
    typography: "{typography.body-base}"
    fontWeight: "500"
    rounded: "{rounded.sm}"
    height: 32px
    padding: 8px 12px
  nav-item-hover:
    backgroundColor: "{colors.bg-subtle}"
  nav-item-active:
    backgroundColor: "{colors.accent-bg}"
    textColor: "{colors.accent}"
  tab-inactive:
    textColor: "{colors.text-muted}"
    height: 36px
    padding: 12px
  tab-active:
    textColor: "{colors.text}"
    borderBottomColor: "{colors.accent}"
    borderBottomWidth: 2px
  tab-hover:
    backgroundColor: "{colors.bg-subtle}"
  modal:
    backgroundColor: "{colors.bg}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
    padding: 24px
    width: "{spacing.modal-md}"
  status-bar:
    backgroundColor: "{colors.bg-muted}"
    borderTopColor: "{colors.border}"
    textColor: "{colors.text-muted}"
    typography: "{typography.caption}"
    height: 28px
    padding: 8px 12px
  editor-block-active:
    backgroundColor: "{colors.editor-active-block}"
  editor-string:
    backgroundColor: "{colors.editor-string-bg}"
  editor-ghost-text:
    textColor: "{colors.editor-ghost-text}"
---

## Brand & Style

Diurnum's design language is **calm, precise, and confident** — the scholar's desk: composed, unhurried, erudite. The visual philosophy evokes ink on vellum: a well-set page, not a cockpit. The interface serves a single purpose — helping the user work with their financial ledger — and every visual decision defers to that goal.

Three rules override every other decision: hairlines over shadows (1px borders separate surfaces; shadows are reserved for floating elements only), weight and background over color (emphasis comes from font weight or subtle background tints, not hue), and whitespace as a feature (information density is welcome; cramped is not).

The palette is warm parchment and iron-gall ink, with a lapis/ink-blue accent for interactive states and oxblood reserved for errors and destructive actions. The wordmark and page titles speak in Spectral; all UI chrome in the system font (SF Pro); ledger content in JetBrains Mono. That contrast — classical serif for brand, humanist sans for chrome, monospace for data — is the visual thesis: an ancient practice, a modern tool.

## Colors

The palette is rooted in warm neutrals with a lapis accent and oxblood for errors.

- **Background (`#FEFCF8`):** Warm parchment — the primary content surface.
- **Background Muted (`#FBF6EC`):** Slightly deeper parchment for sidebar, row hover, and page chrome.
- **Background Subtle (`#FCF9F2`):** A barely-there tint for active editor blocks and tab hover states.
- **Text (`#1C1A17`):** Iron-gall near-black with a warm undertone — default for all body copy and UI labels.
- **Text Muted (`#6B6051`):** Secondary text, captions, metadata, status bar content.
- **Text Subtle (`#938775`):** Tertiary text, line numbers, ghost text, and disabled states.
- **Border (`#EDEAE4`):** Default hairline border. One pixel. The only border weight in Diurnum.
- **Border Strong (`#E0DBD3`):** Slightly darker for emphasis dividers.
- **Accent (`#243B6B`):** Lapis / ink-blue. The single interactive accent — active nav, primary buttons, focus rings. Use with restraint.
- **Accent Background (`#E4E8F1`):** Soft tint for active nav pills, hover backgrounds, and focus rings.
- **Accent Strong (`#2F4E8C`):** Used for indicator dots and active badges only.
- **Destructive (`#A03228`):** Oxblood. Error text, validation underlines, destructive action labels, diff deletions.
- **Destructive Strong (`#C94034`):** Brighter red for small indicator dots — prevents the oxblood from reading as brown at small sizes.
- **Highlight (`#B68A3E`):** Gilt ochre — decorative use only. The wordmark accent and pull-quote emphasis. Not for UI state.

The diff colors (lapis for additions, oxblood for deletions) reinforce the same two-color semantic logic as the accent/destructive pair.

## Typography

Diurnum uses three typefaces, each with a defined domain.

**Spectral** is the brand voice — used for the wordmark, page titles, and prominent display headings. Its classical proportions and screen-optimized ink traps lend authority and calm to the most prominent moments in the UI.

**The system font (SF Pro)** is the workhorse — all UI chrome, navigation, labels, captions, form elements, and body copy in the application shell. Using the native macOS system font keeps the chrome unmistakably mac-native while Spectral carries the brand voice.

**JetBrains Mono** is the ledger voice — used exclusively for editor content, Beancount previews, file paths, hashes, and inline code. The deliberate contrast between serif chrome and monospace ledger is the design's core visual statement.

The type scale uses a 13px base. All weights stay within 400–600 for body and UI; 700 is reserved for Spectral display headings only. Section headers use `label-xs` in all-caps with `0.08em` letter spacing — the inscriptional caps treatment.

## Layout

The shell is a fixed-width sidebar layout: a 200px left nav, a full-height content area, and a 28px status bar pinned to the bottom. Tab bars are 36px tall; per-screen headers are 48px. These are fixed values — never fluid.

Spacing uses a 4px base unit. Most gaps are 8px (inter-element) or 16px (card padding). Give every element room to breathe — cramped layouts contradict the parchment aesthetic.

The right-side inspector panel (Inbox) is 380px wide, separated by a single 1px border. Modals: 420px small, 520px default, 640px large (command palette).

The window has no title bar: traffic lights float over a full-height translucent sidebar (vibrancy material), and the sidebar's top 52px is a window drag region. The content pane is opaque parchment.

## Elevation & Depth

Diurnum is almost entirely flat. Surfaces are separated by hairline borders, not shadow.

- **Base surfaces:** No shadow. `border: 1px solid var(--color-border)` defines all edges.
- **Dropdowns / popovers:** `--shadow-subtle` — a warm-toned whisper to establish float.
- **Modals / command palette:** `--shadow-modal` — clear but restrained lift.

Shadows use warm-toned rgba values (`rgba(28,26,23,…)`) matching the ink color, not cool black.

## Shapes

Corner radii are minimal — the printed page, not a mobile app.

- `2px` — buttons, chips, inputs
- `3px` — cards, dropdowns
- `4px` — modals, large panels
- `9999px` — active sidebar nav pills and count badges only

## Components

### Buttons

Four variants, three sizes (sm: 24px, md: 32px, lg: 40px). All share `rounded.sm`, `font-weight: 500`, and a 2px lapis focus ring.

**Primary** — lapis background, parchment text. One per view, for the single most important action. **Secondary** — bordered, default background. **Ghost** — no border or background, for icon-adjacent and low-hierarchy controls. **Destructive** — oxblood wash background, oxblood text; use only in destructive confirmation dialogs.

### Inputs

32px tall (md), 40px (lg), 12px horizontal padding. Focus: lapis border + 2px lapis-bg ring. Invalid: oxblood border.

### Cards

Parchment background, 1px border, 3px radius, 16px padding. No shadow.

### Navigation Items

32px tall, 2px radius. Active: `accent-bg` fill with lapis text. Hover: `bg-subtle`. The active state is the only full-bleed lapis use outside primary buttons.

### Tabs

36px tall, 12px padding per tab. Active: 2px lapis bottom border, default text. Inactive: muted text. Hover: `bg-subtle` background.

### Badges

Three variants: default (muted bg), accent (lapis wash, lapis text), destructive (oxblood wash). All use `label-xs` (11px, semibold, uppercase, 0.08em tracking), 4px/8px padding. Count badges are full-pill, 18px diameter, lapis wash.

### Status Bar

28px tall, `bg-muted` background, 1px top border. 12px caption type in muted ink.

### Modals

Backdrop: `rgba(0,0,0,0.3)`. Container: parchment, border, 4px radius, modal shadow. Default width 520px. Internal sections separated by 20px gaps.

### Ledger Editor

JetBrains Mono, 13px. String tokens: `editor-string-bg` tint. Active block: `editor-active-block` (bright white — the clearest point on the parchment). Ghost completion: `editor-ghost-text`.

## Do's and Don'ts

**Do** use a single 1px border to separate adjacent surfaces. **Don't** add shadows to inline elements — shadows are for floating layers only.

**Do** use lapis for the primary interactive accent. **Don't** use it decoratively or for non-interactive labels.

**Do** use oxblood for errors and destructive actions exclusively. **Don't** make it the primary accent — lapis owns that role.

**Do** use Spectral for the wordmark, page titles, and prominent headings. **Don't** use it for UI chrome — that register belongs to the system font.

**Do** use `label-xs` all-caps for section headers and metadata labels. **Don't** mix serif and sans within the same table cell or editor line.

**Do** use the ochre highlight sparingly for decorative wordmark emphasis. **Don't** use it in any interactive or state-indicating context.
