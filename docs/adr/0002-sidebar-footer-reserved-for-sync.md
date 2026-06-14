# Sidebar footer reserved for future remote sync

## Status

Accepted

## Context

The Ledger Editor mockup showed a sidebar footer with a user button (avatar +
name) and a theme toggle. Implementing those faithfully would have meant
introducing a user/account identity and a dark theme — neither of which the
product currently has:

- Diurnum is **local-first** and explicitly markets "no account required." The
  books are stored on disk; there is no sign-in, no remote user. Putting a
  person's name and avatar in the chrome implies an account model we do not
  have, and the closest real data (the local Git author identity) is a
  configuration detail, not a logged-in user.
- The design system is **parchment-only** ("Light / parchment only" in
  `tokens.css`). A theme toggle would be non-functional.

We briefly wired the footer to the Git author identity and kept a "Close
Workspace" button there, but the user identity still read as awkward against
the local-first ethos.

## Decision

Leave the sidebar footer **intentionally empty** for now and reserve that space
for a future **remote sync / web-service surface** (account, sync status,
sign-in) if and when Diurnum gains optional cloud features.

Consequences of removing the previous footer controls:

- **No user/account UI** in the sidebar. This keeps the "no account required"
  promise visible in the chrome itself.
- **No theme toggle** until a second theme actually exists.
- **"Close Workspace"** is no longer a sidebar button. It remains available
  from the native application menu (`close-workspace` in
  `src-tauri/src/menu.rs` → `src/lib/menu.ts` → `handleCloseWorkspace`), so the
  action is not lost.
- The "Recent" ledger-files group above the footer is unaffected.

## Rationale

Reserving the space (rather than collapsing it) keeps the layout stable for the
day we add sync, and avoids shipping decorative/fake account UI in the
meantime. Honest chrome — showing only what the app actually does — is
preferred over matching the mockup pixel-for-pixel where the mockup implied
features that do not exist.

## Revisit when

Diurnum adds an optional remote sync or web service. At that point this footer
is the intended home for account state, sync status, and sign-in.
