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
| `/promos.html` | Promotion reviews, account engagement, and per-post price simulations |
| `/mobile/` | Mobile app and installable PWA |
| `/news.html`, `/hooks.html`, `/vault.html` | Restricted tools; existing access rules apply |

React entry points live in `src/`; Tracker and Insights remain standalone
pages in `public/`. The backend is the separate Cortex project
(`chatgptricks/cortex`), not part of this frontend repository.

Research stacks expose their persisted **Stack ID** in the expanded stack and
each member's details, with a copy button. Pasting that ID into Research search
finds its members; opening the stack includes all members in the loaded catalogue,
even when account, date or other filters match only some versions. The ID stays
the same when sorting or changing filters. Integrations can use it with
`GET /api/v1/research/stacks/{stack_id}/posts`; follow pagination to retrieve all
members allowed by the integration's account permissions.

Tracker refreshes Instagram followers when its page loads: the selected
account on an account URL, or all active accounts on the overview. Desktop
and mobile follow the server job through completion, show progress and
per-account failures, then reload totals, growth and history together.
Repeated requests share an active job; a new refresh after completion
requests a new reading. These refreshes incur the profile scraper's usage.
Refresh buttons show starting, queued and updating states with a spinner and
account progress, and block repeated clicks until the operation finishes.
Account refreshes run independently of full refreshes on the server, and
returning to a sleeping tab checks the job's final status before reporting
a wait timeout.

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

Promos > Engagement lets members select all active dashboard accounts, including
Leads, whether or not they are enabled in Promos or Research, from a group filter
and a multi-account dropdown. Select an entire group
or individual accounts, then choose **View engagement**. Opening the tab loads
only the lightweight account roster; changing selections
never requests engagement until that button is pressed. Pending changes hide
previous results. Calculations always use the account's entire available stored
history across all dates and formats, including posts without a stored date.
After applying a selection, the frontend loads up to five accounts per request,
with at most two requests in parallel and a 90-second timeout per request. It
shows progress and publishes results only when every selected account succeeds;
changing the selection cancels outstanding requests.
The comparable engagement rate is
average (likes + comments) on measured posts divided by the latest stored follower
count. Each counter shows its own sample coverage; shares, saves, impressions,
and video views remain unavailable when they were not recorded.

Full-history Engagement calculations are persisted per account for up to
seven days. Loading or refreshing reuses valid calculations and recalculates
expired ones from stored data. Each row shows its calculation date; the account
calculator also shows the expiry and history cutoff date. All stored history is
included through each account's calculation date, which can differ from today
and from the report generation date. The cached snapshot includes metrics
and followers together so the engagement rate remains consistent.

Click an account to try a price for one post. Prices reset on close and are never
saved as account rates. The calculator shows cost per public interaction, full
engagement when all four counters exist, and separate costs for each counter.
CPM uses stored average impressions or an optional expected-impressions estimate;
cost per thousand video views remains separate. Currency selects the price unit
without exchange-rate conversion. These are historical benchmarks, not promised
results. The tab requires the Cortex `/api/admin/promos/engagement` endpoint and
uses the same member access as Promos, without starting a scrape.

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
Posts and media kit standout posts also include `is_collab` (`true`, `false`,
or `null` when collaboration metadata is unavailable) and `collaborators`,
an array of normalized Instagram handles excluding the queried account.
They use stored coauthor metadata, independently of mentions, tags or Promo.
Unknown measurements remain null.
See the [Spanish integration guide](public/api-guide.md), also available at
`/api-guide.html`, the [English integration guide](public/api-guide.en.md) at
`/api-guide.en.html`, and the [runnable website example](examples/media-kit/README.md).
The guide covers websites, applications, reports and automations. Its hosted
HTML is generated from the Markdown reference by `scripts/build-api-guide.mjs`
during each build. Run `npm run test:website-api` to verify key management and
the example proxy.

## Music in Insights

Open `/insights.html?view=music` or choose Music in Insights. Account, date and
format filters apply to the audio rankings, top posts and coverage counters.
Songs and original audio have separate tabs; Songs opens by default. Searching
and ranking always stay within the selected tab. Untitled audio is counted in
coverage without being presented as a named song.
Music loads its own read-only `/api/insights/music` catalogue on demand, including
canonical historical posts and metadata recovered from stored provider responses.
Opening the view does not run a scrape or refresh Instagram metrics.

Exact Instagram audio IDs identify sounds. Original audio is labelled with its
creator and full ID; missing IDs stay separate by post. Named music without an ID
uses normalized title and artist. Collaborations count once, unknown audio remains
visible in coverage, and unknown likes are excluded from statistics. Rankings
include total, mean and median likes, uses, relative likes and top-decile appearances.
The comparison baseline is the same account, format and selected period, requiring
five measured posts for ratios and ten for the top decile. These are associations,
not causal or age-normalized estimates. `npm run test:insights-music` verifies the
calculations and the browser workflow in English, Spanish and narrow layouts.
