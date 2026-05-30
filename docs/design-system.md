---
title: Diurnum Design System
type: DesignSystem
belongs_to: "[[Diurnum]]"
date: 2026-05-30
tags:
  - diurnum
  - design
---

# Diurnum Design System

> [!info] Purpose
> This is the canonical reference for Diurnum's visual language and component patterns. Agents implementing UI features reference this document; the matching `tokens.css` file in the codebase carries the actual values. Both must stay in sync.

## Philosophy

Diurnum's design language is **calm, precise, and confident** — the scholar's desk: composed, unhurried, erudite. Ink on vellum. The interface should feel like reading a well-set page, not flying a spaceship.

Three rules that override every other decision:

1. **Hairlines over shadows.** Use 1px borders to separate surfaces; reserve shadows for floating elements only (modals, popovers).
2. **Weight and background over color.** Reach for color sparingly. Most emphasis comes from font weight or a subtle background tint.
3. **Whitespace is a feature.** Information density is fine; cramped is not. Give every element room to breathe.

---

## Color Tokens

All colors are defined as CSS variables in `tokens.css`. Use semantic tokens in components; do not hardcode hex values.

### Surface colors

| Token               | Hex       | Usage                                                    |
| ------------------- | --------- | -------------------------------------------------------- |
| `--color-bg`        | `#FAF6EE` | Main content backgrounds — warm parchment ground         |
| `--color-bg-muted`  | `#F2EAD8` | Sidebar, row hover, page chrome, subtle backgrounds      |
| `--color-bg-subtle` | `#F7F2E5` | Very subtle backgrounds (active editor block, tab hover) |

### Text colors

| Token                 | Hex       | Usage                                                    |
| --------------------- | --------- | -------------------------------------------------------- |
| `--color-text`        | `#1C1A17` | Default text — iron-gall near-black with warm undertone  |
| `--color-text-muted`  | `#6B6458` | Secondary text, captions, metadata, status bar           |
| `--color-text-subtle` | `#9E9182` | Tertiary text, line numbers, ghost text, disabled states |

### Border colors

| Token                   | Hex       | Usage                                  |
| ----------------------- | --------- | -------------------------------------- |
| `--color-border`        | `#DDD4C0` | Default hairline borders (1px)         |
| `--color-border-strong` | `#C8BEA8` | Slightly stronger borders for emphasis |

### Accent (oxblood)

The single accent color in Diurnum. Use sparingly — only for active states, primary actions, and confirmation indicators.

| Token                   | Hex       | Usage                                                                    |
| ----------------------- | --------- | ------------------------------------------------------------------------ |
| `--color-accent`        | `#7B2D26` | Accent text and icons (active nav, primary button text on parchment)     |
| `--color-accent-bg`     | `#F5E8E7` | Soft accent background (active nav pill, hover states)                   |
| `--color-accent-strong` | `#A83B32` | Indicator dots, active badges                                            |

### Secondary (ochre / gold)

Used for rare decorative highlights only — the gilt-initial accent. Not for UI components or state indicators.

| Token                  | Hex       | Usage                                              |
| ---------------------- | --------- | -------------------------------------------------- |
| `--color-secondary`    | `#B68A3E` | Gilt highlight text, decorative wordmark emphasis  |
| `--color-secondary-bg` | `#F7EDD0` | Soft ochre background for highlighted content      |

### Destructive / error

Used for validation errors and destructive actions. The one place alarm color is justified.

| Token                    | Hex       | Usage                                                      |
| ------------------------ | --------- | ---------------------------------------------------------- |
| `--color-destructive`    | `#8C2318` | Error text, validation underlines, destructive button text |
| `--color-destructive-bg` | `#F2E4E2` | Error background, destructive button background            |

### Editor-specific

These are used inside the Ledger Editor only.

| Token                         | Hex       | Usage                                                              |
| ----------------------------- | --------- | ------------------------------------------------------------------ |
| `--color-editor-string-bg`    | `#F5F0E4` | Subtle parchment tint on Beancount strings (payee/narration)       |
| `--color-editor-active-block` | `#F7F2E5` | Background of the transaction block containing the cursor          |
| `--color-editor-ghost-text`   | `#9E9182` | Predictive entry completion ghost text                             |
| `--color-editor-addition`     | `#243B6B` | Diff addition text (lapis ink-blue)                                |
| `--color-editor-addition-bg`  | `#E4EAF5` | Diff addition background                                           |
| `--color-editor-deletion`     | `#7B2D26` | Diff deletion text (oxblood, matches accent)                       |
| `--color-editor-deletion-bg`  | `#F5E8E7` | Diff deletion background                                           |

---

## Typography

### Font families

| Token            | Stack                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `--font-display` | `"EB Garamond", Garamond, "Times New Roman", serif`                                          |
| `--font-sans`    | `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` |
| `--font-mono`    | `"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace`              |

Use `--font-display` for the wordmark, page titles, and prominent headings — this is the brand's classical voice. Use `--font-sans` for all UI chrome and prose. Use `--font-mono` for ledger content (editor, Beancount previews, file paths, hashes, code). The contrast between serif chrome and monospace ledger is the visual thesis: an ancient practice, a modern tool.

### Type scale

| Token         | Size   | Line height | Usage                                                       |
| ------------- | ------ | ----------- | ----------------------------------------------------------- |
| `--text-xs`   | `11px` | `1.4`       | Badges, tiny meta, count indicators                         |
| `--text-sm`   | `12px` | `1.4`       | Status bar, captions, table cells                           |
| `--text-base` | `13px` | `1.5`       | Default body text, nav items, table content, editor content |
| `--text-md`   | `14px` | `1.5`       | Default UI text (buttons, inputs, labels)                   |
| `--text-lg`   | `16px` | `1.4`       | Input fields, prominent labels                              |
| `--text-xl`   | `20px` | `1.3`       | Section headers                                             |
| `--text-2xl`  | `24px` | `1.25`      | Page titles (Inbox, Reports)                                |
| `--text-3xl`  | `32px` | `1.2`       | Summary card values, dashboard numbers                      |

### Weights

| Token               | Value | Usage                                                                 |
| ------------------- | ----- | --------------------------------------------------------------------- |
| `--weight-normal`   | `400` | Default body text, comments in the editor                             |
| `--weight-medium`   | `500` | Amounts in the editor, navigation items, table headers, button labels |
| `--weight-semibold` | `600` | Section headers, important labels                                     |

### Special-case treatments

- **Caps labels** (used for section headers like `REVENUE`, `RECENT`): `--text-xs`, `--weight-medium`, `color: var(--color-text-muted)`, `text-transform: uppercase`, `letter-spacing: 0.06em`
- **Inline code / paths**: `--font-mono`, `--text-sm`, subtle background tint with `--color-bg-muted`, 2px horizontal padding

---

## Spacing Scale

4px base unit. Use the named tokens; avoid arbitrary pixel values.

| Token        | Pixels | Common use                            |
| ------------ | ------ | ------------------------------------- |
| `--space-0`  | `0`    | —                                     |
| `--space-1`  | `4px`  | Tight gaps (between icon and label)   |
| `--space-2`  | `8px`  | Default inter-element gap             |
| `--space-3`  | `12px` | Padding inside inputs, buttons        |
| `--space-4`  | `16px` | Default card padding, section padding |
| `--space-5`  | `20px` | Generous padding                      |
| `--space-6`  | `24px` | Section gaps                          |
| `--space-8`  | `32px` | Major section gaps                    |
| `--space-10` | `40px` | Page-level padding                    |
| `--space-12` | `48px` | Headline gaps                         |
| `--space-16` | `64px` | Vertical centering on Welcome screen  |

---

## Borders, Radii, and Shadows

### Border widths

| Token            | Value | Usage                                                 |
| ---------------- | ----- | ----------------------------------------------------- |
| `--border-width` | `1px` | All borders. There is no "thicker" border in Diurnum. |

### Radii

| Token           | Value    | Usage                                       |
| --------------- | -------- | ------------------------------------------- |
| `--radius-sm`   | `4px`    | Buttons, chips, small badges                |
| `--radius-md`   | `6px`    | Cards, inputs, dropdowns                    |
| `--radius-lg`   | `8px`    | Modals, large panels                        |
| `--radius-pill` | `9999px` | Active sidebar nav background, count badges |

### Shadows

Used sparingly — only for floating elements.

| Token             | Value                                                       | Usage                     |
| ----------------- | ----------------------------------------------------------- | ------------------------- |
| `--shadow-none`   | `none`                                                      | Default for cards, panels |
| `--shadow-subtle` | `0 1px 2px rgba(0,0,0,0.04), 0 1px 4px rgba(0,0,0,0.06)`    | Dropdowns, popovers       |
| `--shadow-modal`  | `0 4px 12px rgba(0,0,0,0.08), 0 12px 32px rgba(0,0,0,0.08)` | Modals, command palette   |

---

## Layout Tokens

| Token                       | Value   | Usage                                    |
| --------------------------- | ------- | ---------------------------------------- |
| `--shell-sidebar-width`     | `200px` | App shell sidebar                        |
| `--shell-status-bar-height` | `28px`  | Bottom status bar                        |
| `--shell-tab-bar-height`    | `36px`  | Editor tab bar                           |
| `--shell-header-height`     | `48px`  | Per-screen header (Inbox, Reports, etc.) |
| `--modal-width-sm`          | `420px` | Small dialogs                            |
| `--modal-width-md`          | `520px` | New Workspace form                       |
| `--modal-width-lg`          | `640px` | Command palette, larger dialogs          |
| `--welcome-card-width`      | `280px` | Welcome screen option cards              |
| `--inspector-width`         | `380px` | Inbox right-side inspector               |

---

## Motion

| Token               | Value                          | Usage                               |
| ------------------- | ------------------------------ | ----------------------------------- |
| `--duration-fast`   | `100ms`                        | Hover, focus, link transitions      |
| `--duration-medium` | `200ms`                        | Most state changes                  |
| `--duration-slow`   | `300ms`                        | Modal open/close, panel transitions |
| `--easing`          | `cubic-bezier(0.4, 0, 0.2, 1)` | Default easing for all transitions  |

**Guidelines:**

- Animate `opacity`, `transform`, `background-color`, `border-color`, and `color` only
- Never animate `width` or `height` (use `transform: scale()` or `max-height` workarounds)
- Reduce motion for `prefers-reduced-motion: reduce`

---

## Iconography

**Library:** [Lucide](https://lucide.dev) (`lucide-react` package). Clean monoline icons, MIT-licensed, very React-friendly.

**Sizing:**

| Context                       | Size   |
| ----------------------------- | ------ |
| Sidebar nav icons             | `20px` |
| Inline button icons           | `16px` |
| Dense UI icons (tabs, inputs) | `14px` |
| Status bar / micro icons      | `12px` |

**Stroke width:** `1.5px` (Lucide default). Do not mix stroke widths.

**Color:** icons inherit `color` from their parent text; never colored individually unless they're a state indicator (e.g., a small green dot).

---

## Components

Component specs describe visual properties, not React API. Agents implementing components reference both the visual spec and the matching tokens.

### Button

**Sizes:**

| Size           | Height | Padding (horizontal) | Font                           |
| -------------- | ------ | -------------------- | ------------------------------ |
| `sm`           | `24px` | `--space-3`          | `--text-sm`, `--weight-medium` |
| `md` (default) | `32px` | `--space-4`          | `--text-md`, `--weight-medium` |
| `lg`           | `40px` | `--space-5`          | `--text-md`, `--weight-medium` |

**Variants:**

- **Primary** — `background: var(--color-accent)`, `color: var(--color-bg)`, `border: none`, `border-radius: var(--radius-sm)`. Hover: slight darken (~6%). Disabled: `opacity: 0.5`.
- **Secondary** — `background: var(--color-bg)`, `color: var(--color-text)`, `border: 1px solid var(--color-border)`. Hover: `background: var(--color-bg-muted)`.
- **Ghost** — no background, no border, `color: var(--color-text)`. Hover: `background: var(--color-bg-muted)`.
- **Destructive** — `background: var(--color-destructive-bg)`, `color: var(--color-destructive)`, no border. Use only for destructive confirmations.

All buttons have a focus ring: `outline: 2px solid var(--color-accent)`, `outline-offset: 2px`.

### Input

- Height: `32px` (md) / `40px` (lg)
- Padding: `--space-3` horizontal
- Border: `1px solid var(--color-border)`, `border-radius: var(--radius-sm)`
- Font: `--text-md`, `--weight-normal`, `color: var(--color-text)`
- Placeholder: `color: var(--color-text-subtle)`
- Focus: `border-color: var(--color-accent)`, ring: `0 0 0 2px var(--color-accent-bg)`
- Invalid: `border-color: var(--color-destructive)`

### Select, Checkbox, Radio

- Select: same as input, with chevron-down icon on right (using Lucide)
- Checkbox: `16px` square, `1px solid var(--color-border)`, `--radius-sm`. Checked: `background: var(--color-accent)` with white check icon
- Radio: `16px` circle, same border. Checked: `4px` solid center dot in `--color-accent`

### Badge / Chip

| Variant     | Background               | Text                  | Use                                          |
| ----------- | ------------------------ | --------------------- | -------------------------------------------- |
| Default     | `--color-bg-muted`       | `--color-text`        | Filters, counts, neutral tags                |
| Accent      | `--color-accent-bg`      | `--color-accent`      | Selected categories, status (Paid, Approved) |
| Destructive | `--color-destructive-bg` | `--color-destructive` | Errors, overdue                              |

Padding: `4px 8px`, radius: `--radius-sm`, font: `--text-xs`, `--weight-medium`.

**Count badge** (used on nav items like Inbox `4`): circle (radius `--radius-pill`), `18px` diameter, `--text-xs`, `--weight-medium`, `--color-accent-bg` background, `--color-accent` text.

### Card

- Background: `--color-bg`
- Border: `1px solid var(--color-border)`
- Border radius: `--radius-md`
- Padding: `--space-4` (default), `--space-5` for prominent cards
- No shadow

### Tabs (file tabs in editor, or tabbed views)

- Height: `--shell-tab-bar-height` (36px)
- Per-tab padding: `--space-3` horizontal
- Active: `--color-text` text, `--color-accent` 2px bottom border
- Inactive: `--color-text-muted` text, no border
- Hover (inactive): `background: var(--color-bg-subtle)`
- Close affordance: `14px` X icon, shown on hover or active

### Sidebar nav item

- Height: `32px`
- Padding: `--space-2 --space-3`
- Border radius: `--radius-sm`
- Icon: `20px`, `--space-2` gap to label
- Font: `--text-base`, `--weight-medium`
- Inactive: `color: var(--color-text)`, no background
- Hover: `background: var(--color-bg-subtle)`
- Active: `background: var(--color-accent-bg)`, `color: var(--color-accent)`

### Status bar

- Height: `--shell-status-bar-height` (28px)
- Background: `--color-bg-muted`
- Border-top: `1px solid var(--color-border)`
- Font: `--text-sm`, `--color-text-muted`
- Padding: `--space-2 --space-3`
- Layout: flex, space-between (left context, right indicators)

### Modal

- Backdrop: `rgba(0, 0, 0, 0.3)` overlay
- Container: `--color-bg`, `--radius-lg`, `--shadow-modal`
- Border: `1px solid var(--color-border)` (subtle, in case shadow renders poorly)
- Default width: `--modal-width-md`
- Padding: `--space-6`
- Header / body / footer sections separated by `--space-5` gaps
- Close button (top-right): ghost button with X icon

### Command Palette (specialized modal)

- Width: `--modal-width-lg`
- No padding around content (input + list fill the modal)
- Input: `--text-md`, no border, full-width, padding `--space-4`
- Bottom border `1px solid var(--color-border)` separates input from list
- List items: `40px` tall, padding `--space-3 --space-4`, hover/keyboard-focus background `--color-bg-muted`

### Tooltip

- Background: `--color-text` (`#18181B`)
- Text: `--color-bg` (white), `--text-xs`
- Padding: `--space-2 --space-3`
- Radius: `--radius-sm`
- Shadow: `--shadow-subtle`
- Max width: `240px`
- Show on hover with `300ms` delay

### Table

- Row height: `40px` (default), `32px` (compact, for lists with many rows)
- Header row: `--text-xs` caps, `--color-text-muted`, height `32px`
- Cell padding: `--space-3` horizontal
- Row hover: `background: var(--color-bg-muted)`
- Selected row: `background: var(--color-accent-bg)`
- Row separator: `1px solid var(--color-border)` (top of each row except first)
- Numeric columns right-aligned

### Inspector panel (used in Inbox)

- Width: `--inspector-width` (380px)
- Background: `--color-bg`
- Left border: `1px solid var(--color-border)`
- Padding: `--space-5`
- Internal sections separated by `--space-5` gaps

---

## Accessibility

- **Color contrast:** All text-on-background combinations meet WCAG AA (4.5:1 for body text, 3:1 for large text)
- **Focus rings:** Every interactive element has a visible focus ring (`outline: 2px solid var(--color-accent); outline-offset: 2px`)
- **Keyboard navigation:** Every action reachable by mouse must be reachable by keyboard
- **Reduced motion:** Respect `prefers-reduced-motion: reduce` — disable transitions, use opacity-only fades
- **Screen readers:** Use semantic HTML (`<button>` for buttons, `<nav>` for navigation). ARIA only when no semantic element fits.
- **Touch targets:** Minimum 32px tall on interactive elements (we're macOS-first so this is generous, but still important)

---

## File Organization

In the codebase:

```
src/
├── styles/
│   ├── tokens.css       ← All design tokens as CSS variables (this is the source of truth)
│   ├── globals.css      ← Resets, base typography, body styles (uses tokens)
│   └── components/      ← Per-component styles (each uses tokens, never hardcoded values)
└── components/
    └── ui/              ← Primitive components (Button, Input, Badge, etc.)
```

**Rules:**

1. Components must reference tokens via `var(--token-name)` only. No hardcoded hex, no hardcoded pixel values for spacing.
2. If a component needs a value that isn't in `tokens.css`, propose adding the token first.
3. Per-component CSS lives in `src/styles/components/<name>.css` or co-located with the component file.

---

## Open Questions

These should be resolved as the design system is implemented:

| Question                                           | Resolution path                                                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Whether to switch to Tailwind v4 later             | Tokens are framework-agnostic CSS variables, so Tailwind v4 (which uses CSS variables natively) integrates cleanly if you switch  |
| Dark mode token strategy                           | Light mode only in V1. The palette has an obvious candlelit dark variant (ink-dark ground, parchment text) — define a `[data-theme="dark"]` block with overridden variables when ready |
| Component library choice (Radix, custom, headless) | Open. Most Diurnum UI is custom, but consider Radix primitives for accessibility-heavy components (Dialog, DropdownMenu, Tooltip) |
