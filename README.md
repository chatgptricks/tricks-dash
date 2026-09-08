# Sentient Dash (frontend)

Instagram analytics + content-queue dashboard for Sentient Agency, served at
`sentientdash.app`. React 19 + Vite, single-file-heavy (`src/App.jsx`,
`src/styles.css`) rather than component-per-file — grep is your friend here.

For the full picture (feature set, deploy workflow, backend relationship,
gotchas, backlog) see **`FOR_CODEX.md`** at the repo root. This README only
covers local setup.

## Setup

```bash
pnpm install
pnpm dev
```

React/Vite pages: `index.html` (main dashboard), `queue.html` (Queue board),
and `settings.html` (Admin/Dev command center). Tracker and Insights remain
standalone pages under `public/`. All surfaces read
live data from the `cortex` backend (`chatgptricks/cortex`, deployed on
Render) via `GET /api/dashboard/*`, `/api/tracker/*`, `/api/insights/*`.
Set `VITE_API_BASE` to point at a different backend for local dev.

## Build

```bash
pnpm build
```

Deploying is a two-step, two-branch process (source on `main`, static output
on a separate `gh-pages` branch) — see `FOR_CODEX.md` for the exact commands.

## Smoke test

```bash
node smoke/run.mjs
npm run smoke:queue
npm run smoke:settings
```

Renders the real `<App />` in jsdom with Firebase and `fetch` stubbed, and
asserts the header/filters/favicons actually work. Exists because a past
change shipped a blank page (a TDZ error) that built cleanly and only broke
at render — `vite build` alone doesn't catch that. See `smoke/README.md`
for what it covers.

Accounts are now managed through Settings and imported through the backend's
durable Apify queue. Posts, covers, avatars, and Queue attachments are read
from the live API; the frontend does not bundle a second account dataset or
local cover archive.
