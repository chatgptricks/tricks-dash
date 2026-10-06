# Local release validation

Run the complete frontend release gate before marking a candidate ready:

```bash
npm ci                             # first setup, or after dependencies change
npx playwright install chromium    # when Chrome is not installed
npm run check:release
```

`check:release` runs lint, the regression suite, a production build including
static pages and PWA assets, then the Chromium workflow checks. It does not
deploy, push, or write to the live backend. GitHub Actions runs this same gate
with Playwright Chromium and then audits production dependencies.

## Focused checks

| Command | Coverage |
| --- | --- |
| `npm test` | All unit and jsdom checks below, plus static pages, Tracker, Insights, and sign-in policy |
| `npm run test:product` | Topic grouping, stack operations, real Research cards, account filters, menus, and cover recovery |
| `npm run test:stacks` | Exact stack-member selection, bounded batch operations, partial failures, and membership updates |
| `npm run test:queue` | Queue planner rules plus coalesced refreshes, trailing reads, and failure recovery |
| `npm run test:queue-refresh` | Concurrent Queue refresh regression in isolation |
| `npm run test:resilience` | Retry rules, session changes, idempotent requests, catalogue refreshes and cache isolation |
| `npm run test:catalogue` | Bounded append reads, source changes, rolled-back watermarks and updated revisions |
| `npm run test:auth-cache` | Account-owned snapshots, denied access, account switches, sign-out races, access timeout and retry |
| `npm run test:users` | User-management payloads and role rules |
| `npm run smoke:recovery` | Render/effect crash recovery, cleanup, safe diagnostics, EN/ES copy, and retained drafts/preferences |
| `npm run smoke:research` | Full Research rendering, filters, list editing, caption generation, media actions, and preferences |
| `npm run smoke:queue` | Queue rendering, rejected/partial mutations, and nested stack keyboard interactions |
| `node smoke/queue-suggestions.mjs` | External/Research suggestions, managed accounts, safe links, pending receipts and retries, VC approval/rejection, confirmed Queue placements, and legacy suggestion review |
| `npm run smoke:queue-reuse` | Create fresh Pool work from known sources, preserve prior assignments, retry safely, ignore stale source previews, and retain normal Research Send to Pool behavior |
| `npm run smoke:settings` | Settings rendering and account-management interactions |
| `npm run smoke:mobile` | Mobile routing, touch workflows, and role-aware controls |
| `npm run smoke:roles` | Shared navigation, role previews, and access controls |
| `npm run smoke:hooks` | Private Hooks workflow and restricted-role rejection |
| `npm run smoke:vault` | Vault load/add/priority/discard/restore, failed mutations, and restricted-role rejection |
| `npm run smoke:visual` | Research and Queue workflows in a real browser |

The jsdom runners render actual React components with Firebase and fetch
stubbed. They catch runtime crashes that a successful Vite build cannot.
Keep both `globalThis.fetch` and `window.fetch` mocked: shared API calls use
`window.fetch`.

## Browser gate

`smoke:layout` compares the real Research, Queue, Promos, Tracker, Insights,
Hooks, Vault, News and Settings entrypoints at 1920, 1440, 1280 and 390px in
dark and light preferences. It checks shared header geometry, page gutters,
navigation permissions, account-menu behavior and document overflow. Firebase,
CDNs and every backend request are mocked; screenshots and measurements are
saved under `work/product-layout/`.

`smoke:visual` starts and stops its own local Vite server. It uses installed
Chrome (or `CHROME_PATH`) when available, otherwise Playwright Chromium.
Firebase and backend responses are mocked. Coverage includes nested dialogs,
Research stack selection, caption-generation errors, Queue detail and clipboard
actions, cover retries, scroll locking, dark/light panels, and narrow layouts.
It also deliberately crashes a page with an inert background to verify recovery
focus, retained browser storage, and a successful user-triggered reload.

These local checks validate frontend behavior against fixtures. Real Firebase
sign-in, backend compatibility, and deployment propagation still require a
separately authorized release verification.
