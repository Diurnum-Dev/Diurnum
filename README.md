# Ledgerly

A local-first, FOSS desktop accounting app for technical operators. Your books are plain Beancount-compatible text files that you own. AI assists; you approve every change.

**Status:** Transitioning from MVP foundation to V1. The core accounting loop (workspace, CSV import, Suggested Entry review, Approval, basic Reports) is implemented. V1 adds the embedded ledger editor, smart CSV import, command palette, git integration, macOS packaging, and more. See [`docs/prd.md`](docs/prd.md) for the authoritative spec and [`docs/v1-roadmap.md`](docs/v1-roadmap.md) for the milestone plan.

## Canonical Specs

| Document | Purpose |
|---|---|
| [`docs/prd.md`](docs/prd.md) | Product Requirements Document — V1 feature specs with acceptance criteria |
| [`docs/design-system.md`](docs/design-system.md) | Visual language, tokens, component patterns |
| [`docs/design-prompt.md`](docs/design-prompt.md) | Claude Design prompt for generating screen mockups |
| [`docs/v1-roadmap.md`](docs/v1-roadmap.md) | Milestone-by-milestone transition plan from MVP to V1 |
| [`CONTEXT.md`](CONTEXT.md) | Domain glossary — canonical terminology for the project |
| [`docs/architecture.md`](docs/architecture.md) | Current codebase architecture |
| [`docs/workspace-layout.md`](docs/workspace-layout.md) | App-Created Workspace file structure |
| [`docs/adr/`](docs/adr/) | Architectural decision records |

When working on this codebase: read the PRD section for the feature you're implementing, then check `CONTEXT.md` for any terminology in capitalized form (Founder-Operator, Suggested Entry, Approval, etc. all have precise meanings). The PRD includes acceptance criteria as checklists — every box should be checked before a feature is considered done.

## Tech Stack

- **Tauri 2.x** — desktop runtime (macOS-first, Apple Silicon for V1)
- **Rust** — workspace core (Beancount reading/writing, validation, approval, reports)
- **React + TypeScript + Vite** — UI layer
- **SQLite** — local staging area, source mappings, categorization rules, AI adapter config

## Development

```bash
npm install
npm run dev
```

Checks before pushing:

```bash
npm run typecheck
npm run test
npm run build
cd src-tauri && cargo test
npm run test:e2e
```

## Workspace Lifecycle

Ledgerly opens a **Workspace** — a local folder containing readable Beancount files plus Ledgerly-managed local data under `.ledgerly/`. No Ledgerly cloud account is required.

Workspace layout: see [`docs/workspace-layout.md`](docs/workspace-layout.md).

## License

GPL v3. See [`LICENSE`](LICENSE). The app is free forever; the optional commercial sync service will ship post-V1.

## Project History

This repository began as `Ledgerly-MVP` — an internal proof-of-concept proving the core accounting loop. The MVP is now the foundation V1 is built on. The `v0.1.0-mvp` git tag marks the state at the end of the MVP phase. See [`docs/v1-roadmap.md`](docs/v1-roadmap.md) for what's changing as V1 lands.
