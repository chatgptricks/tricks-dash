# Sentient Dash

Instagram analytics + content-queue dashboard for Sentient Agency, served at
`sentientdash.app`. React 19 + Vite, single-file-heavy (`src/App.jsx`,
`src/styles.css`) rather than component-per-file — grep is your friend here.

The frontend is preparing for **1.0.0**. See [CHANGELOG.md](CHANGELOG.md) for
the release scope and remaining live verification. The current work is local;
a passing release check does not publish the app.

Use npm (`package-lock.json` is the single lockfile; CI runs `npm ci`).

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

Production publishing is a separate two-branch workflow: source on `main`,
static output on `gh-pages`. The ignored local `FOR_CODEX.md` contains the
operational handover and deployment steps. Frontend checks do not validate
the live backend, Firebase login redirects, or ingestion jobs.
