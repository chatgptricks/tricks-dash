# Sentient Dash

Instagram analytics + content-queue dashboard for Sentient Agency, served at
`sentientdash.app`. React 19 + Vite, single-file-heavy (`src/App.jsx`,
`src/styles.css`) rather than component-per-file — grep is your friend here.

The frontend is **1.0.0**. See [CHANGELOG.md](CHANGELOG.md) for the release
scope and validation. A passing release check does not publish the app;
production publishing uses the separate workflow below.

Use npm (`package-lock.json` is the single lockfile; CI runs `npm ci`).

## Languages

Every interface, help page and generated export must support English and Spanish.
Use the shared per-user language preference and keep a visible language selector
on sign-in and standalone help pages. Translate interface copy, dates and numbers;
preserve source posts, account names and stable API fields. Add both languages
when introducing or changing a product surface.

## Setup

```bash
npm ci
npm run dev
```

Open `http://localhost:4175`. Use `localhost`, not `127.0.0.1`: Firebase's
authorized domains treat them as different hosts. To point at a local Cortex backend, set
`VITE_API_BASE` in `.env.local` before starting Vite. Without that setting,
the app uses the live Cortex API: running the frontend locally does not
make its data or mutations local. The automated checks below mock authentication
and backend responses.

| Page | Purpose |
| --- | --- |
| `/index.html` | Research, post library, filters and lists |
| `/queue.html` | Production planning and assignments |
| `/settings.html` | Admin/Dev account and user management |
| `/tracker.html`, `/insights.html` | Follower and post analytics |
| `/mobile/` | Mobile app and installable PWA |
| `/news.html`, `/hooks.html`, `/vault.html` | Restricted tools; existing access rules apply |

React entry points live in `src/`; Tracker and Insights remain standalone
pages in `public/`. The backend is the separate Cortex project
(`chatgptricks/cortex`), not part of this frontend repository.

## Build

```bash
npm run build
```

The output is `dist/`, including the standalone pages and PWA assets.
Use `npm run preview` to inspect that build locally. Building does not deploy.

## Release checks

```bash
npm run check:release
```

This runs lint, the regression and rendered-app tests, a production build,
and the Research/Queue browser checks. CI runs the same command. The browser
checks use installed Chrome (or `CHROME_PATH`); otherwise install Chromium
once with `npx playwright install chromium`.

Use `npm test` for the faster local suite or `npm run smoke:visual` for the
browser checks alone. See [smoke/README.md](smoke/README.md) for coverage.
A successful build alone is insufficient: runtime rendering, permissions,
failed mutations and keyboard interactions need the regression checks too.

Accounts are now managed through Settings and imported through the backend's
durable Apify queue. Posts, covers, avatars, and Queue attachments are read
from the live API; the frontend does not bundle a second account dataset or
local cover archive.

Settings > Accounts includes a Media kit column. Each Download PDF click
generates an authenticated, client-shareable sales overview: public profile,
audience size, selected public performance highlights, and standout historical
and recent posts. The two-page PDF excludes internal labels, tracking metrics,
model signals, contact information, and granular appendices. Values use at
most two decimals, and the PDF follows the user's current theme and accent.
Downloads read the latest available data without starting a refresh or scrape.
Performance figures describe analyzed public posts; unavailable measurements
are never replaced with zero.

Production publishing is a separate two-branch workflow: source on `main`,
static output on `gh-pages`. The ignored local `FOR_CODEX.md` contains the
operational handover and deployment steps. Frontend checks do not validate
the live backend, Firebase login redirects, or ingestion jobs.

## Agent access (MCP)

The [Sentient Dash MCP server](mcp/README.md) exposes typed Cortex tools over
stdio or authenticated Streamable HTTP, including product discovery,
Research, Queue, analytics, and restricted subtools. Follow its connection
guide for Muse, Dots, or another MCP host.

## External data API

Open **API connections** from the account menu or `/api.html` to create a
read-only integration key with an explicit account selection and expiry. Admin
and Dev users can issue keys; every request checks the owner's current access.
Keys can be revoked and are only shown once. Keep them in server secrets.

The versioned Cortex `/api/v1/accounts` API provides public profiles, media
kit metrics, paginated posts, and daily follower history. Public posts and
media kit standout posts include `is_promo`, recognizing the manual Research
mark or the `#aitoolsentient` caption hashtag. The posts endpoint accepts the
optional `is_promo=true|false` filter before pagination; omitting it returns
both kinds. It reads stored dashboard data without starting a refresh.
Unknown measurements remain null.
See the [Spanish integration guide](public/api-guide.md), also available at
`/api-guide.html`, the [English integration guide](public/api-guide.en.md) at
`/api-guide.en.html`, and the [runnable website example](examples/media-kit/README.md).
The guide covers websites, applications, reports and automations. Its hosted
HTML is generated from the Markdown reference by `scripts/build-api-guide.mjs`
during each build. Run `npm run test:website-api` to verify key management and
the example proxy.
