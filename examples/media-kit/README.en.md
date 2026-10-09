# Media kit example connected to Sentient Dash

[Instrucciones en español](README.md)

A single-account website with profile, audience, performance, posts, and follower history. The server keeps the API key private and calls the dashboard; the browser receives public data through this website's own `/api/media-kit`, `/api/posts`, and `/api/followers` routes. Requires Node.js 22 or later with no additional dependencies.

## English and Spanish interface

The **EN / ES** selector updates headings, metrics, dates, loading states, empty states, and errors without making new API requests. Its preference is saved in both `sentient.lang` and `sentient.language`, compatible with the dashboard. With no saved preference, the browser language determines the initial choice. Dates keep the Costa Rica time zone. Account names, biographies, and captions remain the original account content and are displayed as text, never executed as HTML.

Use this example for a creator or brand page, a post catalogue, a report, or an application interface. The media kit design is one possible use; preserve the separation between interface and server when adapting it.

## Run locally

1. Get an API key in [API connections](https://sentientdash.app/api.html), under **Connect an integration**. Select only the accounts you need and save the key when it appears; it is shown only once.
2. Download the complete folder and open a terminal inside it.
3. Copy `.env.example` to `.env`. On macOS or Linux, run `cp .env.example .env`.
4. Edit `.env`: set `SENTIENT_DASH_API_KEY` to your key and `SENTIENT_DASH_ACCOUNT` to the authorized Instagram handle without `@`.
5. Run:

```bash
node --env-file=.env server.mjs
```

Open [localhost on port 3000](http://localhost:3000). `.env` is excluded from Git and cannot be downloaded through this server. Environment loading uses the [official Node `--env-file` option](https://nodejs.org/download/release/latest-v22.x/docs/api/cli.html#--env-filefile); API requests use [Node's built-in `fetch`](https://nodejs.org/download/release/latest-v22.x/docs/api/globals.html#fetch).

## Deploy and adapt

On a Node hosting service, upload these files and configure `SENTIENT_DASH_API_KEY` and `SENTIENT_DASH_ACCOUNT` as private server environment variables. Start with `node server.mjs`; the hosting service supplies the environment and usually assigns `PORT`. Use HTTPS for the public domain. Give this integration its own key and request budget.

Adapt `client.js` and `styles.css` to your website. Keep requests directed to your own server. For React, Next.js, PHP, WordPress, or another platform, use the same structure: a server endpoint with the private key, caching, input validation, and a fixed account; the interface calls that endpoint. For static hosting, add a server function or backend proxy. Never place the key in HTML, public JavaScript, `VITE_*`, `NEXT_PUBLIC_*`, URLs, analytics, or repositories.

The default data origin is the production API. Only when an administrator needs another trusted backend should they configure `SENTIENT_DASH_API_BASE` on the server; browser visitors cannot override it. Adapt the handler for serverless request/response APIs and use shared caching when running multiple instances.

## Behavior of this example

- Five-minute in-memory data cache; simultaneous requests to the same URL share one upstream request.
- Ten-second failure cache, ten-second timeout, and a budget of 50 upstream requests per minute per process.
- Three endpoints for one fixed account, with date, parameter, and pagination validation. The proxy accepts `limit` from 1 to 100 and `offset` from 0 to 100000; visitors cannot choose another account or data origin.
- Preserves useful 401, 403, 404, 422, and 429 statuses and `Retry-After`. Connection errors or invalid responses become 502; timeouts become 504. Upstream diagnostic bodies are hidden. The interface maps these statuses to the selected language.
- Unknown metrics display `—`; the 30-day block is hidden when unavailable. Capture dates come from `data_updated_at`; names and captions use `textContent`.

The in-memory cache is lost on restart and is not shared between processes. Revocation blocks the next upstream read; public results already cached can remain visible for up to five minutes. Use a shared cache and hosting request limits for higher traffic.

Follower history contains dashboard observations, not the complete history of Instagram. Likes, comments, views, and plays are public measurements; views do not represent unique reach. Reading the API never starts scraping or accelerates data updates.

## Verify without real data

```bash
node --test server.test.mjs
```

The tests start a local fake backend. They verify that the key is sent only upstream, that `.env` and server source cannot be downloaded, caching and request consolidation, query validation, errors and `Retry-After`, budgets, and timeouts. No real API key, Instagram access, or production API request is needed.

The [complete integration guide](https://sentientdash.app/api-guide.html) covers endpoints, fields, pagination, and troubleshooting.
