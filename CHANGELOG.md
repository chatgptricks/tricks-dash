# Changelog

## 1.0.0 — local release candidate (2026-10-03)

This release focuses on trustworthy core workflows across Research, Queue, Promos,
Tracker, Insights, Vault and Hooks. It has not
been published or tagged; production still runs the existing release.

### Reliability

- Research snapshots belong to the signed-in account and are restored only
  after access is verified. Switching accounts resets the displayed library.
- Requests do not cross Firebase session changes, and optional role-preview
  storage cannot prevent authenticated API requests when browser storage is blocked.
- Catalogue source changes and watermark rollbacks trigger a full refresh.
- React pages provide an accessible recovery screen after a rendering error,
  with an explicit reload action and the application version.
- Override Firebase Firestore's Node gRPC transport with `@grpc/grpc-js`
  1.14.5, which addresses the upstream
  [certificate-authentication advisory](https://github.com/advisories/GHSA-m9gg-hp2v-232j)
  and [error-disclosure advisory](https://github.com/advisories/GHSA-f596-whhp-79r4).
  Firebase itself is unchanged. Remove the scoped override when Firestore's
  dependency range includes a patched version.

### Core workflows

- Failed Queue picks and batch-close requests retain the previous schedule.
- List deletion has confirmation, pending state and a visible failure message.
- Nested Queue stack dialogs can be closed with the keyboard and return focus
  to the underlying inspector.

### Promos and individual tools

- Preserve the original Promos cards and automatic stacks. Group loaded posts by
  known brand and topic without changing their individual classifications.
- Review exact evidence, compare related posts, correct brand/product/classification,
  and save a decision before advancing. Failed saves retain the draft.
- Reconnect to scans after a reload; keep pagination and filtered results consistent
  across delayed requests, account changes and completed scans.
- Tracker rejects stale account navigation and resets user data on session changes.
- Insights preserves empty account selections, distinguishes access errors, offers
  retry recovery, and safely rebuilds charts when sorting the account table.
- Static tool navigation refreshes role visibility when the signed-in user changes.
- Tracker tables and Insights heatmaps scroll within their own containers on mobile,
  rather than widening the page.
- Hooks updates saved drafts instead of duplicating them, retains selected sources
  across searches, and protects current edits from delayed generation responses.
- Vault and Hooks reject stale session updates and enforce DEV/preview access.
- Related detector changes are committed locally in the Cortex/Predict checkout:
  fewer editorial/negation false positives, better sponsor extraction, conservative
  same-brand corroboration, and preserved human corrections during rescans.
  The configured remote API still uses its deployed detector until separately released.

### Visual polish and motion

- HOT foil derives surface normals from the loaded cover's brightness and edges,
  replacing rainbow gradients and scan lines with image-shaped specular highlights.
  Only the hovered card's light moves; cover retries, physical card transfers,
  reduced motion and Effects Off retain their existing behavior.
- Refine Research search, tab typography, active filters and caption details in
  dark and light themes while preserving card sizes, stacks and HOT/gold treatments.
- Keep Research filter panels inside narrow or short windows, with upward
  placement and scrolling when needed; retain keyboard focus and Escape behavior.
- Align caption Copy with its heading, improve metric readability and keep
  expanded DEV tools within the inspector's layout.
- Add fixture-only Research visual checks for both themes, viewport bounds,
  search, sorting, caption copying and inspector cleanup.
- Add shared spring easing, responsive press feedback, keyboard focus rings and
  short menu/form arrivals while preserving existing layouts and Promos grouping.
- Keep stack choreography bounded even for large groups, speed up card travel,
  and cancel stale animation work when a view closes or reopens.
- Animate Promos review entrances, exits and previous/next content transitions;
  retain focus and background locks until the exit completes.
- Coalesce card tilt into one update per animation frame and clear it over controls.
- Honor reduced motion and Effects Off during active animations; avoid sticky
  hover lifts on touch devices and improve Tracker's selected light-mode contrast.
- Add fixture-only motion checks for interruption, repeated opening, touch,
  reduced motion, effects preferences and desktop/mobile tool geometry.

### Release validation

- `npm run check:release` combines lint, regression tests, the full build and
  browser workflow and motion checks. CI runs the same command.
- Queue refresh, stack operations and Vault access tests are included in the
  standard suite, alongside the new failure and recovery regressions.
- Research has a dedicated browser visual gate; motion checks wait for animation
  completion before asserting visibility, avoiding fixed-delay timing failures.
- Local verification on 2026-10-03: `npm run check:release` passed (lint:
  zero errors, 47 existing warnings; regression tests; full production build;
  Chromium desktop/mobile checks, including Promos and individual-tool fixtures). `npm audit --omit=dev --audit-level=high`
  reported zero vulnerabilities. The local backend detector/review suite passed
  64 tests using isolated synthetic records; live PostgreSQL was not exercised.

### Before publishing

- Verify the candidate with the intended accounts against the live backend,
  including mobile sign-in and role-specific Research/Queue workflows.
- Confirm backend catalogue revisions change when existing posts are edited
  or removed. Frontend validation cannot detect changes that the backend
  omits from its manifest revision.
- Publish only after local review and explicit production authorization.
