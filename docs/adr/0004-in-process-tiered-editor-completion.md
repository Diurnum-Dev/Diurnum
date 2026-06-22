# Ledger Editor completion is in-process and tiered, not an LSP sidecar

## Status

Accepted

## Context

The Ledger Editor should help the Founder-Operator write Beancount entries by
hand: completing account names from `accounts.bean`, suggesting previously-used
payees and narrations, and inferring whole entries via the configured AI
adapter. This is the second, secondary way entries enter the ledger; the primary
way remains CSV Import plus Inbox triage (see ADR-0003). Manual entry still has
to feel first-class because it is the escape hatch when import does not fit.

The obvious-looking path is a Beancount **Language Server** (e.g.
`trim21/beancount-lsp`) bridged to CodeMirror over LSP. We evaluated it and
rejected it for V1:

- That project is distributed as a **Python package** whose diagnostics run the
  Python Beancount loader. Adopting it drags a Python runtime, a sidecar
  process lifecycle, and an LSP protocol bridge into a Tauri app that today ships
  a single Rust binary.
- LSP is a **transport**, not a feature. The "magical" inline-ghost +
  arrow-navigable dropdown UX (the Zed/VS Code reference) is a CodeMirror
  frontend capability (`@codemirror/autocomplete`), available with or without a
  language server.
- The features an LSP would uniquely buy us — go-to-definition, hover, rename,
  cross-file semantic diagnostics — are **not** in scope for this work.
- The hard part already exists **in-process**. `workspace::ledger_editor`
  already parses the chart of accounts and produces context-aware completions
  from Categorization Rules, history, and the AI adapter. Our Tauri command set
  is, in effect, already the "language server" — minus the protocol ceremony.

The completion contexts also have very different latencies: account and payee
completion must feel instant; AI whole-entry inference spawns a subprocess and
is slow. A single uniform mechanism would make the fast path wait on the slow
path's plumbing.

## Decision

Editor completion is implemented **in-process** (Tauri commands + Rust) and
presented through **`@codemirror/autocomplete`** plus the existing inline ghost.
It is split into **two latency tiers**:

- **Instant tier** — account and payee/narration completion filter an in-memory
  list already held by the frontend (`knownAccounts`, plus a ledger-derived
  payee/narration list). No per-keystroke IPC. Context ranking (description →
  account, debit/credit aware) is fetched **once per transaction block** from
  Rules + history and cached, never gating per-keystroke filtering.
- **Deferred tier** — AI whole-entry inference stays a debounced async Tauri
  call on the date header line, populating the inline ghost, exactly as today.

No LSP sidecar, no Python runtime, no LSP protocol bridge.

## Consequences

- We keep a single Rust binary and add no new runtime dependency.
- The instant tier stays snappy because it never blocks on the AI subprocess.
- Context ranking is "good enough" rather than full semantic analysis: it leans
  on Rules and history already in the Staging Area, not on a Beancount type
  model.
- We own the completion logic. There is no upstream language server to track,
  but also no community feature stream to inherit.
- Freshness is bounded by save cadence (see the PRD's Phase 0 auto-save fix),
  not by live language-server reparsing.

## Rationale

Ledger Is The Product: the point is a clean, trustworthy ledger written quickly.
The in-process tiered approach delivers the autocomplete experience the PRD
describes with the least new surface area, reusing logic Diurnum already has,
and keeps the slow AI path from degrading the fast typing path. An LSP would add
operational weight to buy features we are not building.

## Revisit when

The editor genuinely needs the full IDE suite — go-to-definition on an account
to its `open` directive, hover docs, cross-file rename, or richer semantic
diagnostics than Ledger Validation already gives — or if maintaining the
in-process ranking logic outgrows what a maintained language server would cost.
