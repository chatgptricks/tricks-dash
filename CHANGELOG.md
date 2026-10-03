# Changelog

## 1.0.0 — local release candidate (2026-10-03)

This release focuses on trustworthy Research and Queue workflows. It has not
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

### Release validation

- `npm run check:release` combines lint, regression tests, the full build and
  browser workflow checks. CI runs the same command.
- Queue refresh, stack operations and Vault access tests are included in the
  standard suite, alongside the new failure and recovery regressions.
- Local verification on 2026-10-03: `npm run check:release` passed (lint:
  zero errors, 50 existing warnings; regression tests; full production build;
  Chromium desktop/mobile checks). `npm audit --omit=dev --audit-level=high`
  reported zero vulnerabilities.

### Before publishing

- Verify the candidate with the intended accounts against the live backend,
  including mobile sign-in and role-specific Research/Queue workflows.
- Confirm backend catalogue revisions change when existing posts are edited
  or removed. Frontend validation cannot detect changes that the backend
  omits from its manifest revision.
- Publish only after local review and explicit production authorization.
