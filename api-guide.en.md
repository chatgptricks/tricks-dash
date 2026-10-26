# Sentient Dash API guide

Connect dashboard data to websites, media kits, applications, reports and automated processes. This guide supports any authorized integration and explains which data you can read, how to authenticate and how to interpret each response, regardless of your programming language or hosting provider.

The API provides **read access to stored product data**, from public account profiles and HOT posts to Research, Tracker, Insights, Queue, Promos, News, Hooks, Vault and readable Settings. Each area requires an explicit scope and the owner’s current product permissions. Each connection has its own key, expiration and scope. Your application calls the API from its server; if it has a public interface, that server sends visitors the data you choose to display.

| Reference | Value |
| --- | --- |
| Production base | `https://cortex-api-db2e.onrender.com/api/v1` |
| Authentication | Header `Authorization: Bearer YOUR_KEY` |
| Method | `GET` for every data endpoint; no writes |
| Format | JSON, `schema_version: "1.0"` |
| Rate limit | 60 requests per minute per key |
| Connection settings | [API connections](https://sentientdash.app/api.html) |

## 1 Choose the data and integration pattern

| What you want to build | Data and request pattern |
| --- | --- |
| Media kit or creator page | `/media-kit` for profile, followers, performance and standout posts |
| Brand website or account directory | `/accounts` to discover the scope, and `/accounts/{handle}` for each account profile |
| Post gallery or catalog | `/accounts/{handle}/posts` for public account posts (`accounts`); `/posts` for the fuller cross-account Research catalog (`research`) |
| Audience growth chart | `/followers/history`, with stored daily samples |
| Recurring report or analytics tool | Requests from a script or service; save the capture date and the range used |
| Static website | A server function as a proxy, or a task that generates static content from the API |
| Application with several accounts | A key authorizing those accounts, a separate cache per account and requests within the key's shared rate limit |

The exposed profiles currently belong to Instagram. The API reads the dashboard database: a request does not start scraping, request new captures or speed up metric updates. Data changes when the dashboard saves new observations. With explicit scopes it also exposes stored internal product data. It does not edit records, change settings, run paid analysis or reveal credentials for other services. Webhooks are not included: to keep your integration current, query periodically or when its cache expires.

## 2 Create and manage a connection

1. Sign in to [sentientdash.app](https://sentientdash.app) with your Admin or Dev account.
2. Open the gear menu and choose **API connections**, or open [the connections screen](https://sentientdash.app/api.html).
3. Under **Connect an integration**, enter a recognizable name in **Connection name**, such as `Brand website`, `Monthly report` or `Analytics app`.
4. Select the expiration in **Expires in**: 30, 90 or 365 days.
5. Under **Allowed accounts**, select the accounts your integration can query. Use **Search accounts** to find them. The key keeps this selection; it does not automatically receive new accounts you add to the dashboard.
6. In **Available data (read only)**, keep **Public account data only** for a media kit, or select the areas your integration needs. Choose **All available data (read-only)** only when that integration should read every available area.
7. Click **Generate API key**. Under **Your API key**, use **Copy API key** and save it as a private server secret. Then click **I saved the key**. The key starts with `sad_api_` and is shown only once.

Create one key per integration or environment so you can identify and revoke each separately. You can authorize up to 1,000 active accounts per key and keep up to 20 active keys per owner. The limit of 60 requests per minute is shared across all endpoints and accounts queried with the same key.

Under **Your API keys** (or **Workspace API keys** for a Dev), you can see scope, expiration and last use. To block a connection, click **Revoke**, then **Confirm revoke**. If you lose a key or need to change its authorized accounts, create a new one and revoke the old one. To rotate a key without interrupting your application, configure the new key on your server first, verify a request and then revoke the previous key.

Only Admin or Dev can create keys. If the owner loses that permission or their dashboard access is removed, their keys stop reading data. Revocation and expiration block future reads; data your integration already received may remain in its cache or storage. To remove published data immediately, also remove it from your application.

Devs can also see **Workspace API keys**: all their own keys and every other owner’s active connection, with the owner identified on each row. A Dev can revoke any of those connections using **Revoke → Confirm revoke**. Admins see and revoke their own keys. Revoking a foreign connection does not transfer ownership: only its owner can edit its data scopes, and the full secret remains unavailable after issuance. Expired or revoked foreign keys are excluded from the shared active list.

### Data areas and existing keys

A key has two separate boundaries: `account_handles` selects accounts and `data_scopes` selects product areas. Select **All accounts**, **Sentient** or **Others** to add accounts in bulk; search results can be added without losing earlier selections. **All available data (read-only)** selects every area currently offered to your user. Review the selected areas before generating the key.

| Scope | Data authorized |
| --- | --- |
| `accounts` | Public profiles, media kits, public posts, follower history and HOT |
| `research` | Stored Research catalog, source metadata, post details and topic stacks |
| `tracker` | Stored follower tracking and account history |
| `insights` | Stored post analytics and summaries |
| `queue` | Production requests, history, drafts, tickets and schedules within the owner's visibility |
| `promos` | Stored promotions, related posts and reviews |
| `news` | Workspace news, sources, briefs and stored reviews |
| `hooks` | Stored hook library, saved hooks and the owner's drafts, respecting source permissions |
| `vault` | Saved workspace resources |
| `settings` | Readable product configuration and safe account/user information |

Existing keys remain `accounts` only. They do not automatically receive Research, Queue or other internal areas. In **Your API keys** or **Workspace API keys**, choose **Edit data access** for a key you own, select the areas, and **Save data access**. The same key works immediately with its new scopes; its accounts and expiration stay the same. Scope changes do not reveal or rotate the secret. Create a new key if its allowed accounts must change.

Workspace areas can contain shared internal data that does not belong to one Instagram account, especially News, Vault and Settings. Their explicit scope is required, and the API still enforces the owner's current product permissions. Selected accounts constrain account-linked records. A scope grants no access beyond that owner; losing access can make previously readable routes unavailable. Keep internal data behind your application's own authentication.

## 3 Authentication and server configuration

These routes require a `sad_api_` integration key: a dashboard Firebase session or an MCP key cannot authenticate to `/api/v1`. Send the key only to the API origin, in this header:

```http
Authorization: Bearer sad_api_REPLACE_WITH_YOUR_KEY
```

Store it in private environment variables or your hosting provider's secret manager. The examples in this guide use:

```dotenv
SENTIENT_DASH_API_KEY=sad_api_REPLACE_WITH_YOUR_KEY
SENTIENT_DASH_ACCOUNT=your_account
```

`SENTIENT_DASH_ACCOUNT` is a convenience variable for single-account examples, not a protocol requirement. Its value is the Instagram username without `@`. For several accounts, discover handles through `/accounts` and query each one from your server.

The key must never appear in HTML, browser JavaScript, a distributed mobile app, repositories, URLs, analytics or public variables such as `VITE_*` or `NEXT_PUBLIC_*`. Do not log the key or the header. Visitors and end users do not need a dashboard key.

```text
Website or app → your server or function → Sentient Dash API
              ← data to display         ← authorized account JSON
                                          private key in Authorization

Report or automation → Sentient Dash API
                       private key in the process environment
```

| Your platform | Where to execute the request |
| --- | --- |
| React, Vue or another browser interface | In your backend or server function; the interface calls your own route |
| Next.js or another server framework | In a route or process that runs only on the server |
| PHP or WordPress | In server code; keep the secret outside public files |
| Static HTML | In a server function or during site generation |
| Mobile app | In the app's backend; do not include the key in the installed package |
| Python, Node or other automation | In the process that runs the report, with the secret in its environment |

A key covering several accounts gives your server access to all of them. If you expose a route for end users, decide who may see each account and validate allowed handles. Avoid a proxy that accepts an arbitrary URL from the browser. The dashboard key does not replace your application's authentication.

## 4 First request and endpoint reference

With `SENTIENT_DASH_API_KEY` loaded in a server terminal, discover the enabled routes and authorized accounts:

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/capabilities"
```

All the following endpoints use `GET`. Append each path to the `/api/v1` base. Use handles from `account_handles`, without `@`; with the `accounts` scope, `/accounts` also returns their public profiles. Choose operations marked `available` for this key.

### Complete versioned endpoint inventory

Every row below is `GET`. A missing scope returns `403`; account-linked data remains within the key’s selected accounts, and inaccessible objects return `404`. An agent should first read `/capabilities`, then `/openapi.json`: these runtime documents are authoritative for the deployed paths, parameter types/defaults, documented response envelopes and current availability. A route’s presence in OpenAPI does not grant its permission. Never infer new routes from internal dashboard URLs.

| Endpoint | Required scope | Stored response | Query parameters |
| --- | --- | --- | --- |
| `/capabilities` | Any valid key | Routes, scopes, current account bounds and availability for this key | — |
| `/openapi.json` | Any valid key | Machine-readable versioned GET contract and parameter schemas | — |
| `/accounts` | `accounts` | Active selected public accounts | — |
| `/accounts/{handle}` | `accounts` | Public account profile | — |
| `/accounts/{handle}/media-kit` | `accounts` | Profile, performance, growth and standout posts | — |
| `/accounts/{handle}/posts` | `accounts` | Public post catalog | `limit, offset, from, to, is_promo` |
| `/accounts/{handle}/posts/{shortcode}` | `accounts` | One public post and authenticated cover URL | — |
| `/posts/{shortcode}` | `accounts` | One public post found across selected accounts | — |
| `/accounts/{handle}/posts/{shortcode}/cover` | `accounts` | 307 redirect to an already stored cover; 404 if absent | — |
| `/accounts/{handle}/followers/history` | `accounts` | Daily stored follower samples | `limit, offset, from, to` |
| `/hot` | `accounts` or `research` | The stored HOT selection and detection criteria | `account, from, to, history, limit, offset` |
| `/posts` | `research` | Cross-account stored Research catalog | `account, from, to, q, is_promo, is_collab, is_hot, include_hidden, include_deleted, sort, limit, offset` |
| `/research/posts/{account}/{shortcode}` | `research` | Stored Research post details and source metadata | — |
| `/research/posts/{account}/{shortcode}/media` | `research` | List available stored images/video and authenticated download URLs | — |
| `/research/posts/{account}/{shortcode}/media/{index}` | `research` | Stream one stored asset, not JSON | — |
| `/research/stacks` | `research` | Stored topic stacks within selected accounts | `account, from, to, limit, offset` |
| `/research/stacks/{stack_id}/posts` | `research` | Stored posts in one topic stack | `account, from, to, limit, offset` |
| `/research/lists` | `research` | The owner’s and shared account lists, with granted members only | `account, q, limit, offset` |
| `/research/golden-nuggets` | `research` | Persisted confirmed Golden Nugget classifications and reviews | `account, min_score, target_account, limit, offset` |
| `/tracker/accounts` | `tracker` | Follower tracking for selected accounts | `account, limit, offset` |
| `/tracker/overview` | `tracker` | Alias of the account tracking overview | `account, limit, offset` |
| `/tracker/accounts/{handle}/monthly` | `tracker` | Stored monthly follower summary | `from, to, limit, offset` |
| `/tracker/accounts/{handle}/history` | `tracker` | Account follower history | `from, to, limit, offset` |
| `/insights/posts` | `insights` | Stored analytics posts across selected accounts | `account, from, to, q, is_promo, is_collab, is_hot, include_hidden, include_deleted, sort, limit, offset` |
| `/insights/top-posts` | `insights` | Ranked stored posts; default sort likes | `account, from, to, sort, limit, offset` |
| `/insights/music` | `insights` | Stored song/audio metadata and post engagement | `account, from, to, sort, limit, offset` |
| `/tracker/accounts/{handle}/engagement` | `tracker` | Daily or monthly post engagement observations | `granularity, from, to, limit, offset` |
| `/insights/follower-growth` | `insights` | Evidence-bound follower-growth events and candidate posts | `account, lookback_days` |
| `/insights/summary` | `insights` | Stored analytics summary for the selected range | `account, from, to` |
| `/queue/requests` | `queue` | Visible production requests | `account, status, date, limit, offset` |
| `/queue/requests/{request_id}` | `queue` | One visible request | — |
| `/queue/requests/{request_id}/history` | `queue` | Stored request events | `limit, offset` |
| `/queue/drafts` | `queue` | Visible production drafts | `account, limit, offset` |
| `/queue/tickets` | `queue` | Visible production tickets | `status, limit, offset` |
| `/queue/tickets/{ticket_id}` | `queue` | One visible ticket | — |
| `/queue/schedule` | `queue` | Visible production schedule | `account, status, date, limit, offset` |
| `/queue/summary` | `queue` | Stored request totals by status and production points | `account` |
| `/queue/report` | `queue` | Production totals, priorities, designer productivity and assigned posts | `account, limit, offset, assigned_limit, assigned_offset` |
| `/queue/team` | `queue` | Visible team roster with permitted managed accounts | `limit, offset` |
| `/queue/assignments` | `queue` | Visible production assignments | `account, assignee, status, limit, offset` |
| `/queue/assignments/{assignment_id}` | `queue` | One visible assignment | — |
| `/queue/assignments/{assignment_id}/history` | `queue` | Stored assignment events | `limit, offset` |
| `/queue/drafts/{request_id}` | `queue` | One visible production draft | — |
| `/queue/requests/{request_id}/attachments` | `queue` | Stored attachment metadata | — |
| `/queue/requests/{request_id}/attachments/{attachment_id}/content` | `queue` | Stream an authorized stored attachment, not JSON | — |
| `/queue/time-blocks` | `queue` | Shared team availability blocks visible to the owner | `date, requester, status, limit, offset` |
| `/queue/preferences` | `queue` | The owner’s saved Queue display preferences | — |
| `/promos` | `promos` | Stored promotion classification and related posts | `account, classification, review_status, q, limit, offset` |
| `/promos/{account}/{shortcode}` | `promos` | Stored promotion details | — |
| `/promos/{account}/{shortcode}/review` | `promos` | Existing stored review; never starts AI analysis | — |
| `/news` | `news` | Stored workspace news | `saved, q, source_type, limit, offset` |
| `/news/briefs` | `news` | Stored news briefs | `saved, q, source_type, limit, offset` |
| `/news/story` | `news` | Stored story details by URL-encoded id | `id` |
| `/hooks` | `hooks` | Stored hook library within source permissions | `account, q, topic, limit, offset` |
| `/hooks/saved` | `hooks` | The owner’s saved hooks | `account, q, topic, limit, offset` |
| `/hooks/drafts` | `hooks` | The owner’s stored hook drafts | `limit, offset` |
| `/hooks/drafts/{draft_id}` | `hooks` | One stored draft owned by the key owner | — |
| `/hooks/{hook_id}` | `hooks` | One stored hook and available analysis | — |
| `/vault` | `vault` | Saved workspace content | `discarded, done, q, limit, offset` |
| `/vault/{link_id}` | `vault` | One saved workspace resource | — |
| `/settings/preferences` | `settings` | The owner’s saved product preferences | — |
| `/settings/accounts` | `settings` | Readable account registry settings | `account, limit, offset` |
| `/settings/usage` | `settings` | Safe usage summary by user and period | `days, limit, offset` |
| `/settings/users` | `settings` | Safe user directory visible to the owner | `q, limit, offset` |
| `/settings/users/{email}` | `settings` | Safe readable user information | — |

### Discover access before choosing a tool

```bash
curl --fail-with-body -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/capabilities"
curl --fail-with-body -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/openapi.json"
```

`/capabilities` returns `schema_version`, `base_url`, `read_only: true`, `methods: ["GET"]`, `account_handles`, `data_scopes`, `available_scopes`, `rate_limit_per_minute` and `operations`. Each operation declares `method`, `path`, `required_scopes`, `available` and `summary`. OpenAPI includes only versioned read routes, with `WebsiteAPIKey` Bearer authentication and `x-required-scopes` / `x-available` per operation. Agents can turn the available operations into read tools; keep the key in the agent runner’s private secrets.

### HOT and stored Research

```bash
curl --fail-with-body -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/hot?account=example_account&limit=20"
curl --fail-with-body -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/posts?account=example_account,other_account&is_collab=true&limit=100"
```

`/hot` reads persisted HOT classifications rather than guessing from current likes. Its default `history=false` follows the tab’s recent 30-hour window; `history=true` reads stored history. Posts include the account, shortcode, permalink, caption, date, likes, comments, views and a `hot` object: `is_hot`, `score`, `multiplier`, `criterion: "persisted_first_hour_pace"`, `observed_at`, `account_threshold`, `likes_at_first_check` and `score_unit: "multiple_of_account_hourly_like_threshold"`. The envelope’s `criteria` explains the persisted flag, 30-hour publication window and score source. Missing evidence remains `null`. The stored score describes detection relative to an account’s hourly likes threshold; it is not a universal ranking across accounts. The account’s current threshold may have changed after detection.

Research and Insights queries accept `account` as one handle or a comma-separated subset of the authorized handles. Dates `from` and `to` are inclusive Costa Rica calendar dates. Their post filters include `q`, `is_promo`, `is_collab`, `is_hot`, `include_hidden=false` and `include_deleted=false`. Public account endpoints retain their public exclusions; the Research scope is required to read internal source metadata. `sort` accepts `date`, `likes`, `comments`, `views` or `hot`. A true collab requires stored confirmation; mentions or tagged users alone do not qualify.

### Account lists, Golden Nuggets and performance fields

`/research/lists` returns your own and shared stored lists, with `id`, `name`, `handles`, `owner_email`, `is_shared`, `created_at` and `updated_at`. It filters membership to the key’s granted accounts before pagination. `account` narrows to one permitted member and `q` searches the list name. Private lists owned by another user are unavailable.

`/research/golden-nuggets` reads existing confirmed classifications, never generating or re-scoring a candidate. Its optional `min_score` is from 0 to 1; `account` and `target_account` narrow stored results. Rows include `account`, `shortcode`, `label`, `target_account` or `null`, `score`, `reviewed_by`, `reviewed_at` and a safe stored `review`. Account-linked results and referenced targets respect the key’s boundaries.

Research and Insights post objects include a `metrics` map for available stored performance facts, such as shares, saves, reach, impressions, measured checkpoints and model scores. The exact keys depend on source coverage. Preserve a missing/`null` measurement as unknown and keep model scores distinct from observed audience counts. `hashtags` and `mentions` are normalized arrays; audio and paid-partnership flags may be `null`. `transcript_available` and `alt_text_available` describe stored availability; the detail endpoint returns the text when it exists. Public account and HOT-only projections do not expose internal model or private performance measurements.

### Post music

`GET /api/v1/insights/music?account=chatgptricks&sort=likes&limit=20` returns
stored music metadata alongside post metrics. It requires the `insights`
scope and respects the connection's authorized accounts.

Each item includes `song`, `artist`, `audio_id`, `is_original_audio` and
`audio_url`, together with `account`, `accounts`, `shortcode`, `published_at`,
`permalink`, `likes`, `comments`, `views` and `metrics_updated_at`. Preserve
`audio_id` as a string to avoid losing precision. Nulls mean unavailable
metadata; ID `0` does not identify a song. Distinguish original audio by its
artist and exact ID; without an ID, retain the post shortcode rather than
merging all original audio into one sound.

Filters accept `account` as one handle or a comma-separated subset, inclusive
`from`/`to` dates, `sort=date|likes|comments|views|hot`, `limit` from 1 to 100
(default 20), and `offset` starting at 0. Follow `pagination.next_offset`
while `has_more` is true. The endpoint recovers music only for the selected
page and never starts a scrape or refreshes Instagram metrics. `coverage`
describes that page only. A collaborative post can appear once per account;
deduplicate by `shortcode` when aggregating across accounts.

Pagination ordering uses stored index metrics. Returned metrics can include
newer observations for those posts, so a later page may contain a higher like
count. For an exact ranking of returned values, collect the pages, deduplicate
and sort again. Preserve `ordering` and `metrics_updated_at` in reports.

Agents use the `get_insights_music_page` MCP tool. Sessions and agent codes
can read `/api/insights/music/page`; API connection keys use the versioned
`/api/v1/insights/music` route.

### Tracker and Insights coverage

Tracker overview rows include `following_count`, account label/group, `rank_by_followers`, `rank_by_growth_7d`, `avg_likes_30d`, `posts_30d`, `engagement_trend_pct` and `delta_1d` / `delta_7d` / `delta_30d`, alongside the existing `deltas` map. Each delta is an object with `delta`, `percent` and `baseline_captured_at`, or `null` without a usable baseline. Rankings are computed before pagination across the accounts available to this key, not the entire workspace; preserve `rankings_scope`. Thirty-day averages use stored posts in the rolling period, and the trend compares `avg_likes_30d` with `avg_likes_previous_30d` from the preceding 30 days. `likes_known_30d` and `likes_known_previous_30d` report usable like-count coverage; `posts_30d` counts posts whether or not likes are known. Preserve the returned `engagement_methodology` and do not treat unknown/negative source counts as zero.

Tracker history exposes stored follower observations and available `following_count`; monthly rows include opening/closing follower counts, observation counts, capture dates, `net_followers`, `growth_pct` and `within_month_change`. Monthly net growth compares observed month-end counts, while within-month change compares the first and last usable observations of that month. Missing observations are not invented. `/engagement` accepts `granularity=day` or `month` (default `month`) and returns period, post count, known likes count and available metric averages.

`/insights/follower-growth` requires one `account` and accepts `lookback_days` from 35 to 365 (default 120). It returns stored growth events and time-aligned candidate posts, with coverage limits and truncation flags. Candidates indicate a temporal relationship; they do not establish that a post caused a follower increase. The read uses at most 1,000 snapshots and 5,000 stored posts, and limits candidate lists to 100 per event. Preserve the methodology and coverage alongside the result.

Research media lists return up to 100 available assets and references, plus coverage. Items with `stored: true` include `index`, `kind`, `role`, `content_type`, `expires_possible: false` and a relative authenticated `download_url`; follow that content URL from your server to read stored bytes. Saved public HTTPS references have `stored: false`, `source_url`, an optional `poster_url`/`observed_at` and `expires_possible: true`. They may expire and have no authenticated download URL. Never send the API key to a `source_url` or poster origin. A saved cover does not guarantee full carousel slides or the original video; preserve `coverage.includes_all_carousel_slides: false`. No read fetches missing media from Instagram or starts Apify work. Missing stored assets return `404`; unavailable media storage can return `503`.

### Workspace data and stored-only reads

`/queue/summary` returns `total_requests` and `statuses: [{status, count, production_points}]`. `/queue/report` returns an object with `totals` by status, `priorities` for normal/urgent work, `designers` and `assignedPosts`. Each total/priority includes `count` and `points`. Designer rows include `email`, `activeRequests`, `productionPoints`, `closedRequests`, `urgentRequests` and `averageActualMinutes`; the latter averages recorded start-to-completion minutes for closed requests and is `null` without usable timestamps. Assigned posts include stored draft overrides and `is_draft`. Report `activeRequests`, `productionPoints` and `urgentRequests` use scheduled, in-progress and completed work; `closedRequests` uses closed work. Zero-work current designers remain visible. Totals/priorities use committed records within granted accounts before pagination; `assignedPosts` can include closed/cancelled assigned work and effective draft scheduling overrides. Designer paging uses `limit`/`offset`, and assigned-post paging uses `assigned_limit`/`assigned_offset` (defaults 50/0, maximum limit 100); follow `pagination.designers` and `pagination.assigned_posts` independently. The team roster exposes safe identity, operating roles, time zone, minutes per production point and the managed accounts within the key’s scope. Request attachments return stored `id`, `name`, `size`, `content_type` and `uploaded_at` and a relative `download_url`. The metadata route does not download a file; follow its authenticated content URL from your server to receive `200` bytes, the stored MIME type and an attachment filename. This read streams only the already stored object; missing attachments or storage objects return `404`, and it never downloads an arbitrary external URL. Queue object details, drafts and history obey the same visibility as their parent request or assignment.

Promo reviews, News briefs and story details, Hooks analyses and Vault records are existing saved content. No read creates a review, invokes an AI model, refreshes a source or marks something read. Hooks respects OCR-only and source restrictions; saved hooks and drafts belong to the key owner. Settings user projections exclude provider secrets and private connection credentials. `/settings/usage` accepts `days` from 1 to 90 (default 30) and returns safe `email`, `request_count` and `last_seen_at` rows plus `period: {days, since}`; it excludes raw operational request paths. URL-encode path values such as handles, shortcodes and emails, and encode the News `id` query value with a URL builder.

### Shared availability and your saved preferences

`/queue/time-blocks` exposes shared team availability independently of Instagram account selection, so enable `queue` only for integrations allowed to read that operational context. Optional filters are `date` in `YYYY-MM-DD`, `requester` email and `status` (`pending`, `approved` or `rejected`). Omitting status reads pending and approved blocks. It excludes post-linked tickets and account-change, move, post-suggestion and new-account requests. Rows include block identity/type, requester, status/category/title, schedule/duration, reason, reviewer note and creation/review/update dates.

`/queue/preferences` returns only the key owner’s `hidden_users`, `row_order` and `updated_at`; it does not read another user’s personal layout. `/settings/preferences` returns that owner’s saved `preferences` and `updated_at`: readable fields include language, theme, accent, custom accent, effects, Queue guide/designer scope and Tracker favorites. `trackerFavorites` is restricted to granted accounts. Preferences are read-only snapshots: neither route saves or changes them, and both detail responses omit pagination.

### Main object fields for agent integrations

These are useful field groups, not a replacement for the route-specific response envelope. Objects can add fields and optional source values can be `null` or absent.

| Object | Fields and interpretation |
| --- | --- |
| Research / Insights post | `account`, `shortcode`, `permalink`, `caption`, `published_at`, `format`, `likes`, `comments`, `views`, `video_views`, `video_plays`, `metrics_updated_at`, `is_promo`, `is_hot`, `is_collab`, `collaborators`, `hot`; internal post projections add `title`, `ocr_text`, `hidden`, `is_deleted`, duration/slides, hashtags, mentions, audio, paid partnership, dimensions and stored metric `checkpoints`; `transcript_available` / `alt_text_available` indicate stored text coverage. The `metrics` map carries additional stored measurements and model scores |
| Research post detail | Post fields plus available stored `transcript`, `alt_text`, `analysis_summary`, `llm_report`, `tags`, `coauthors` and `tagged_users`; a detail read does not create missing analysis |
| Queue request | Identity/source post, title/caption, `post_type`, production points, priority, tags, brief, notes, reference links, `status`, designer/coordinator, recommended accounts, schedule, completion dates, final permalinks, cancellation reason, attachment metadata and capture/update dates |
| Promo | `account`, `shortcode`, effective `classification`, `client`, `product`, `is_promo`, `review_status`, detection/analysis dates, detector classification/version, signals, evidence, client candidates, links, CTA/promo code and stored `review`; a review override can replace the effective classification |
| News story | `id`, title/description, published/source/publisher/author, feed metadata, `link`, image, saved state, brief, coverage feeds, related stories, capture/review dates and stored `review`; review includes available scores, evidence, strengths/weaknesses, dimensions, novelty, `classification_gates` and account-scoped `existing_candidates` |
| Hook / hook draft | Hooks include `id`, source kind, account/shortcode/permalink, publication/likes, `hook_text`, `context_text`, topic, categories/scores and dates; drafts include `id`, topic, text, source hook IDs and creation/update dates |
| Vault item | `id`, `url`, `title`, source/share date, priority, `discarded`, `done`, original source text, author, image/avatar, media type, text status and safe `slack_url` |
| Settings | Accounts include registry categories/groups, thresholds, scrape mode, feature flags and dates; users include safe identity, roles, admin flag, time zone, minutes per production point and dates |

### Pagination and response differences

Post, stack, Tracker and Insights page requests use `limit` from 1 to 100, default 20, and `offset` from 0. Workspace collections use default 50 and maximum 100; their offsets are capped at 100,000. Detail routes return an object; collections return an array in `data`, with `schema_version`, `generated_at` and `pagination` where supported. Scope-specific projections differ: use the documented fields and each operation’s response envelope, and tolerate additional fields. Some domain objects in OpenAPI remain flexible objects rather than exhaustive schemas for every nested field.

Always follow `pagination.has_more` and `pagination.next_offset`. Do not compute the next page from the number of returned rows. Filtered Research scans can return fewer than `limit` matches and `pagination.total: null`; `offset`/`next_offset` then refer to evaluated candidates. Such responses identify `offset_type: "candidate"`, `scanned_count`, `candidate_total` and `scan_limit: 500`. An empty filtered page is not the end when `has_more` remains true. Deduplicate account-linked posts by `account` plus `shortcode`.

Stored attachments, stored Research media and covers are exceptions to JSON: attachments and stored media stream authenticated bytes; the authenticated cover route returns `307` to an already stored image or `404` when none exists. Request it from your server, validate the `Location` as HTTPS, and fetch the target without forwarding the API’s Authorization header. Public visitors must not receive the private key.

Collection responses use an array for `data`; profile and media kit responses use an object. Endpoints do not all have the same metadata: `/accounts` includes `schema_version` and `data`; profile and media kit also include `generated_at` and `data_updated_at`; posts and history include `generated_at`, `pagination` and dates for each row. History also includes `timezone`.

The following JSON examples are fictional and show the structure, not real account data. An optional field may be absent and an unknown measurement may be `null`. Preserve that distinction in your application.

### Authorized accounts

```json
{
  "schema_version": "1.0",
  "data": [
    {
      "handle": "example_account",
      "public_name": "Example account",
      "profile_url": "https://www.instagram.com/example_account/"
    }
  ]
}
```

The list contains accounts selected for that key that remain active. An account outside its scope or inactive cannot be queried: it returns `404`. Authorization does not guarantee metrics are already available.

### Public profile

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/accounts/$SENTIENT_DASH_ACCOUNT"
```

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-10-09T18:00:00+00:00",
  "data_updated_at": {
    "profile": "2026-10-09T12:00:00+00:00",
    "engagement": "2026-10-09T15:00:00+00:00"
  },
  "data": {
    "handle": "example_account",
    "public_name": "Example account",
    "public_bio": "Example public description",
    "platform": "Instagram",
    "profile_url": "https://www.instagram.com/example_account/",
    "followers": 10000,
    "profile_posts": 120,
    "verified": false
  }
}
```

| Profile field | Meaning |
| --- | --- |
| `handle`, `public_name` | Account username and public name |
| `public_bio` | Public biography, optional |
| `platform`, `profile_url` | Platform and profile link |
| `followers` | Followers from the latest available capture with that measurement; may be `null` |
| `profile_posts` | Number of posts reported by the profile; may be `null` |
| `verified` | Stored verification status |

## 5 Performance summary and media kit

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/accounts/$SENTIENT_DASH_ACCOUNT/media-kit"
```

The response includes profile and engagement freshness metadata. Inside `data`:

| Field | Contents |
| --- | --- |
| `generated_at`, `timezone` | Summary generation time and reference time zone |
| `account` | The public profile fields described above |
| `summary.all_time` | Summary of the stored public catalog included in the analysis |
| `summary.last_30_days` | Summary of posts published within the rolling 30-day window, when sufficient coverage is available |
| `best_posts.all_time` | Up to three standout posts from the public catalog |
| `best_posts.last_30_days` | Up to three standout posts from that window, when available |
| `follower_growth.30d.pct` | Percentage follower growth when samples support an exact 30-day span; optional |

Each `summary` object uses this structure; the example represents two fictional posts:

```json
{
  "post_count": 2,
  "metrics": {
    "likes": { "total": 1000, "average": 500 },
    "comments": { "total": 100, "average": 50 },
    "video_views": { "total": null, "average": null },
    "video_plays": { "total": null, "average": null }
  },
  "engagements": { "total": 1100, "average": 550 },
  "engagement_rate_pct": 5.5
}
```

| Summary field | How to interpret it |
| --- | --- |
| `post_count` | Number of stored public posts included in that summary |
| `metrics.likes`, `metrics.comments` | Likes and comments, with `total` and `average` |
| `metrics.video_views`, `metrics.video_plays` | Available views and plays, with `total` and `average` |
| `engagements.total`, `engagements.average` | Interactions calculated from known likes and comments |
| `engagement_rate_pct` | Average interactions per post divided by followers, expressed as a percentage |

`all_time` refers to the catalog available in the dashboard, not necessarily every historical Instagram post. `profile_posts` and `post_count` measure different things: posts reported by the profile versus stored posts included in the analysis.

Counters are cumulative measurements for each post. `last_30_days` selects posts by publication time within the last 30 × 24 hours; it does not represent interactions gained only during that period. Averages use available measurements. A 30-day total may be `null` when coverage for that metric is incomplete, even when an observed average is available.

`follower_growth.30d.pct` compares usable captures exactly 30 days apart; it may be negative and does not necessarily end on the current day.

Do not add the averages for likes and comments to reconstruct `engagements.average`: they may cover different measured populations. Do not multiply `engagement_rate_pct` or `follower_growth.30d.pct` by 100: they are already percentages. Views and plays do not represent unique people or unique reach.

Each standout post includes `shortcode`, `permalink`, `public_caption`, `format`, `published_at`, `is_promo`, `is_collab`, `collaborators`, `metrics: { likes, comments, video_views, video_plays }`, `engagements` and `engagement_rate_pct`. Use `public_caption` as text and `permalink` as a link. `is_promo`, `is_collab` and `collaborators` are described in the next section. `/media-kit` keeps its aggregate summaries and does not accept the `is_promo` filter or split summaries by Promo status. Media kit JSON does not embed image files, videos or internal storage paths. Use authenticated stored-asset routes where an endpoint supplies them.

If `last_30_days` or `follower_growth` is absent, hide that block or explain that there is insufficient data. For a private account, the public catalog and standout posts are empty. Hidden or deleted posts, posts without a usable date and posts dated in the future are excluded from the public export.

## 6 Post catalog and follower history

This section covers the public `/accounts/{handle}/posts` and `/accounts/{handle}/followers/history` endpoints. The separate cross-account Research `/posts` endpoint is described in section 4. Both public endpoints accept these parameters:

| Parameter | Value |
| --- | --- |
| `limit` | Integer from 1 to 100; default 20 |
| `offset` | Integer starting at 0; default 0 |
| `from` | Inclusive start date, `YYYY-MM-DD`, optional |
| `to` | Inclusive end date, `YYYY-MM-DD`, optional |

Dates are interpreted as calendar days in `America/Costa_Rica`. You can use either end of the range or both; `from` must be earlier than or equal to `to`. Do not send dates or times in another format. Post filters apply to the publication date; history filters apply to the capture day.

### Posts

In addition to the shared parameters, `/accounts/{handle}/posts` accepts this optional filter:

| Parameter | Value |
| --- | --- |
| `is_promo` | `true` returns Promo posts; `false` returns the other posts; omitting it returns all posts |

Each post returns `is_promo` as a JSON boolean. It is `true` when the manual Promo flag is set or its caption matches `/#aitoolsentient\b/i`, case-insensitively. This is the same rule used by Research. The filter applies before pagination: `pagination.total` counts posts that match both the requested Promo status and date filters. Do not send `is_promo` to follower history.

For example, to request only Promo posts:

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/accounts/$SENTIENT_DASH_ACCOUNT/posts?is_promo=true&limit=20&offset=0"
```

Use `is_promo=false` to request posts that are not Promo. The following query omits the filter and includes all statuses:

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/accounts/$SENTIENT_DASH_ACCOUNT/posts?limit=20&offset=0&from=2026-10-01&to=2026-10-09"
```

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-10-09T18:00:00+00:00",
  "data": [
    {
      "shortcode": "ExamplePost01",
      "caption": "Example public text",
      "published_at": "2026-10-08T16:00:00+00:00",
      "permalink": "https://www.instagram.com/p/ExamplePost01/",
      "format": "Image",
      "is_promo": false,
      "is_collab": null,
      "collaborators": [],
      "likes": 500,
      "comments": 50,
      "video_views": null,
      "video_plays": null,
      "metrics_updated_at": "2026-10-09T15:00:00+00:00"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 1,
    "has_more": false,
    "next_offset": null
  }
}
```

Posts are ordered from newest to oldest and deduplicated per publication. `shortcode` identifies the post; `published_at` is its publication time, and `metrics_updated_at` indicates the available metric update time. `caption` may be `null`. `format` describes the stored format: `Image`, `Carousel`, `Video` or `Reel`; also handle unknown values in your interface. Here metrics are flat fields; in `/media-kit` standout posts they are nested inside `metrics`, and the text is named `public_caption`.

### Collaborations

Catalog posts from `/posts` and standout posts in `best_posts.all_time` and `best_posts.last_30_days` from `/media-kit` include these fields:

| Field | Meaning |
| --- | --- |
| `is_collab` | `true`, `false` or `null`, depending on stored coauthor evidence |
| `collaborators` | An array of valid lowercase handles, without `@` or duplicates; excludes the requested account |

`is_collab` is `true` when explicit coauthor data confirms at least one other participant. It is `false` only when there is a valid explicit empty list, or when the list contains only the requested account and the confirmed owner is that same account. It is `null` when there is insufficient valid evidence: for example, usable metadata is missing or only the requested account appears without a confirmed owner. When another valid participant is present, it remains `true` even if other metadata entries are unusable.

The list contains the available valid handles of other participants relative to the requested account; it may be incomplete when handles are missing or entries are unusable. When explicit coauthor data confirms that account's participation, the list may also include the known post owner. A different owner on its own, without explicit coauthor evidence, does not confirm a collaboration.

These examples show only the collaboration fields of three fictional posts:

```json
[
  { "is_collab": true, "collaborators": ["collaborating_account"] },
  { "is_collab": false, "collaborators": [] },
  { "is_collab": null, "collaborators": [] }
]
```

Preserve `null` as “Unknown”; do not convert it to `false`. An empty `collaborators` list does not independently confirm that a post is not a collaboration. Use `is_collab === true`, `is_collab === false` and `is_collab === null` to distinguish the states.

Coauthor information comes from explicit stored metadata. Caption mentions, tagged users and the Promo flag do not confirm a collaboration; these fields are independent of `is_promo`. The public `/accounts/{handle}/posts` path has no `is_collab` query parameter; the separate Research `/posts` path supports it. Media kit summaries and the `/posts` Promo filter keep their existing behavior.

### Follower history

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/accounts/$SENTIENT_DASH_ACCOUNT/followers/history?limit=100&from=2026-10-01&to=2026-10-09"
```

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-10-09T18:00:00+00:00",
  "timezone": "America/Costa_Rica",
  "data": [
    { "date": "2026-10-08", "captured_at": "2026-10-09T02:00:00+00:00", "followers": 9900 },
    { "date": "2026-10-09", "captured_at": "2026-10-09T12:00:00+00:00", "followers": 10000 }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 2,
    "has_more": false,
    "next_offset": null
  }
}
```

History returns the last stored capture for each Costa Rica day, ordered from the oldest day to the newest. `date` is that local day and `captured_at` is the capture date and time. `followers` may be `null` if the last capture of the day does not contain that measurement. A day without a capture does not appear: it is neither filled in automatically nor converted to zero. Use only known measurements to calculate growth and preserve the actual dates.

### Iterate through pages

`pagination.total` is the number of rows that match the filter. `next_offset` indicates where the next page starts and is `null` at the end. A `200` with `data: []` may mean there are no records for the range or the offset is beyond the end; it does not mean an authentication error.

This server helper gathers a range, with its own limit of ten pages to prevent an accidentally large download:

```js
async function readPages(resource, from, to, isPromo) {
  const base = 'https://cortex-api-db2e.onrender.com/api/v1';
  const handle = process.env.SENTIENT_DASH_ACCOUNT;
  const key = process.env.SENTIENT_DASH_API_KEY;
  if (!handle || !key) throw new Error('Missing private configuration');
  if (!['posts', 'followers/history'].includes(resource)) {
    throw new Error('Resource not allowed');
  }
  if (isPromo !== undefined && (resource !== 'posts' || typeof isPromo !== 'boolean')) {
    throw new Error('isPromo must be a boolean and is only supported for posts');
  }
  const rows = [];
  let offset = 0;
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: '100', offset: String(offset) });
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    if (isPromo !== undefined) query.set('is_promo', String(isPromo));
    const response = await fetch(
      `${base}/accounts/${encodeURIComponent(handle)}/${resource}?${query}`,
      {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      },
    );
    if (!response.ok) throw new Error(`API HTTP ${response.status}`);
    const payload = await response.json();
    rows.push(...payload.data);
    if (!payload.pagination.has_more) return rows;
    const next = payload.pagination.next_offset;
    if (!Number.isInteger(next) || next <= offset) throw new Error('Invalid pagination');
    offset = next;
  }
  throw new Error('The range exceeds ten pages; use a shorter period');
}
```

The helper's fourth argument is optional: use `true` or `false` to filter posts by Promo status and omit it to get all posts. For example, `readPages('posts', '2026-10-01', '2026-10-09', false)` gathers posts that are not Promo within that range.

Query a stable range for a report and avoid traversing the entire catalog on each visit. Pagination uses offsets and does not freeze a snapshot: when new posts arrive between pages, the order may shift. If you store post results, deduplicate by `shortcode`; for history, by `date`.

## 7 Server examples and downloadable project

### Server JavaScript

This example first queries the scope, then the first account's summary. It requires Node.js 22 or later and the key in the private process environment.

```js
const base = 'https://cortex-api-db2e.onrender.com/api/v1';
const key = process.env.SENTIENT_DASH_API_KEY;
if (!key) throw new Error('Missing SENTIENT_DASH_API_KEY');

async function readAPI(path) {
  const response = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`API HTTP ${response.status}`);
  return response.json();
}

const accounts = await readAPI('/accounts');
const handle = accounts.data[0]?.handle;
if (!handle) throw new Error('The key has no active accounts available');
const result = await readAPI(`/accounts/${encodeURIComponent(handle)}/media-kit`);
// Use result.data in your report or public response; never send the key.
const followers = result.data.account.followers;
console.log(followers === null ? 'Not available' : followers);
```

### Python for a report or automation

This example uses the standard library, the same private key and a timeout. The account can come from your configuration or `/accounts`.

```python
import json
import os
from urllib.parse import quote
from urllib.request import HTTPRedirectHandler, Request, build_opener

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

base = 'https://cortex-api-db2e.onrender.com/api/v1'
key = os.environ['SENTIENT_DASH_API_KEY']
handle = quote(os.environ['SENTIENT_DASH_ACCOUNT'], safe='')
request = Request(
    f'{base}/accounts/{handle}',
    headers={'Authorization': f'Bearer {key}'},
)
with build_opener(NoRedirect).open(request, timeout=10) as response:
    payload = json.load(response)

followers = payload['data']['followers']
print('Not available' if followers is None else followers)
```

### Complete example website

The [downloadable project](https://sentientdash.app/media-kit-example.zip) is a reference media kit implementation, one possible use of the API. It includes a website and Node.js 22 or later server, with no additional dependencies. You can adapt its design, use its proxy in another interface or use it as the basis for your own integration.

Extract the ZIP and open a terminal in the folder containing `server.mjs` and `.env.example`:

```bash
cp .env.example .env
```

Edit `.env` with your key and one authorized account. Then run:

```bash
node --env-file=.env server.mjs
```

Open [http://localhost:3000](http://localhost:3000). The command uses the [official Node `--env-file` option](https://nodejs.org/download/release/latest-v22.x/docs/api/cli.html#--env-filefile), and requests use [built-in `fetch`](https://nodejs.org/download/release/latest-v22.x/docs/api/globals.html#fetch).

The example exposes `/api/media-kit`, `/api/posts` and `/api/followers` on your website server. The account is fixed in its private configuration. It keeps a five-minute cache, ten-second timeout, brief failure cache and a budget of 50 dashboard requests per minute per process. It validates parameters and applies its own maximum of `offset=100000`. These are example implementation decisions, not changes to the API contract.

The proxy accepts `/api/posts?is_promo=true` and `/api/posts?is_promo=false`; omitting the parameter requests all statuses. It forwards the filter to the backend before pagination and preserves `is_promo`, `is_collab`, `collaborators` and `pagination.total` in the response, without converting `null` to `false`. Cache entries are separate for each resource and query parameters, including the Promo filter. The filter is not accepted on `/api/media-kit` or `/api/followers`.

To deploy it, configure private variables in your hosting provider and use `node server.mjs` as the start command. Hosting supplies `PORT`. Serve the domain over HTTPS. For deployments with multiple instances, use a shared cache and hosting limits: the example cache lives in one process's memory. The `node --test server.test.mjs` tests use a fake backend and do not need a real key.

## 8 Updates, caching and data quality

| Time field | What it represents |
| --- | --- |
| `generated_at` | When the response was generated; it is not a new capture |
| `data_updated_at.profile` | Available capture date used for profile and followers |
| `data_updated_at.engagement` | Latest available update date for the metrics set; it does not guarantee equal freshness for all posts |
| A post's `metrics_updated_at` | Available metric update date |
| History's `captured_at` | Capture time for that row |

Timestamps use ISO 8601. The `from`/`to` range and history days use Costa Rica as their reference. An update date may be `null` if no evidence was stored. In a profile, different fields may come from the latest available observations for each measurement.

Keep a valid response in your server cache for about five minutes, per account, resource and query parameters, so several visits can reuse it. Keep separate entries for `is_promo=true`, `is_promo=false` and the omitted filter, as well as dates and pagination. Dashboard responses are sent as `private, no-store`; avoid a public cache of authenticated requests and store only the data your integration needs. If you share a cache between connections, separate their scopes so one key cannot receive another key's data.

For reports or static generation, run requests at the frequency your product needs and that makes sense for dashboard updates. Reading every second does not produce newer data. Across multiple instances, share the cache or coordinate the request budget because all consume the same key's rate limit.

Recent posts can have `likes: null` because the stored source has not supplied that measurement or the post has no usable metric observation yet. Reading again does not refresh Instagram; do not substitute views, zero or another account’s likes.

Show `—` or “Not available” for `null`, and `0` only when the value is actually zero. Do not plot a missing history day as zero or invent a recent summary when it is absent. If you keep an earlier response during an incident, display its capture date and indicate that stored data is being used. Treat names and captions as text; do not execute HTML received in those fields.

## 9 Errors, limits and retries

Check the HTTP status before processing `data`. API JSON errors use a `detail` field; it may be text or a list of validation errors. A gateway incident or `5xx` error may also return text or HTML, so do not assume all errors are JSON. Use the HTTP status to decide what to do and avoid depending on exact error wording.

| Status | Common cause and action |
| --- | --- |
| `200` | Successful request; an empty list or a `null` metric is also a valid response |
| `401` | Missing, invalid, expired or revoked key; check the secret and Bearer header |
| `403` | The owner lost Admin/Dev permission, or the key was used outside allowed routes and methods; check access and endpoint |
| `404` | Account outside scope, inactive account or incorrect handle; check `/accounts` |
| `422` | Invalid parameters, bounds or dates; correct the request before retrying |
| `429` | Limit of 60 requests per minute per key; wait the seconds indicated in `Retry-After` |
| `5xx` or timeout | Temporary incident; retry with increasing delay and a bounded number of attempts |

For transient `502`, `503`, `504`, network failures or timeouts, retry at most three times with increasing delays and random jitter (for example around 1, 2 and 4 seconds). Respect `Retry-After` on `429` or `503`, with a bounded overall deadline; if it exceeds your job budget, reschedule the job rather than looping. Limit concurrent requests, preferably one or two, and keep successful account results if another account fails. The key shares one 60-request-per-minute limit across every account and route.

Admitted reads include `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (the next reset as Unix seconds). Use the remaining budget across all accounts and routes. A temporary storage-busy response can return `503` with `Retry-After: 2`; infrastructure gateways may still return `502` or other transient failures, so keep the bounded retry strategy.

Do not automatically retry `401`, `403`, `404` or `422` errors without correcting their cause. For `429`, respect `Retry-After`; for temporary failures, avoid all instances retrying at once. Consolidate simultaneous requests for the same resource and reduce requests when data is already cached.

The downloadable project's proxy preserves useful API statuses and the `Retry-After` header. It uses `502` for connection failures or invalid responses and `504` for timeouts, without returning backend error bodies to the browser.

## 10 Versioning and integration checks

The current public route is `/api/v1`, and responses declare `schema_version: "1.0"`. Read the fields your application needs, tolerate additional fields and check optional objects before using them. Do not call internal dashboard or MCP routes with an integration key.

The `is_promo`, `is_collab` and `collaborators` fields, along with the optional Promo filter, are compatible additions that retain `schema_version: "1.0"`. The fields appear in the public `/accounts/{handle}/posts` catalog and `/accounts/{handle}/media-kit` standout posts; the `is_promo` filter belongs only to `/posts` the Research `/posts` catalog additionally accepts `is_collab`, `is_hot` and account filters. These are distinct paths.

### What an agent can and cannot do

| Allowed with the required scope and owner permissions | Not available through an integration key |
| --- | --- |
| Discover the versioned read contract, account bounds and enabled areas | Call internal `/api/dashboard`, `/api/admin` or MCP routes |
| Read existing stored records and analyses in the endpoint inventory | Create, edit, delete, assign, schedule, approve or refresh anything |
| Query selected account data and explicitly authorized shared workspace areas | Read accounts outside the key or bypass current product permissions |
| Read already stored reviews, OCR or generated content where available | Start scraping, paid AI analysis, generation or new OCR work |
| Read safe product configuration and user directory fields | Retrieve provider tokens, connection secrets, service keys or unrestricted raw database tables |

Every data operation is `GET`; integration-key attempts to write are denied. This interface does not require an MCP key. Readable product data is exposed through the versioned routes above; operational actions remain outside this read-only API. Missing stored content can produce an empty result or `404` rather than triggering work.

Before publishing, verify these points:

- The key exists only on the server or in the process's private environment.
- `/accounts` contains exactly the accounts your integration needs.
- Every operation your integration uses is available in `/capabilities` and interpreted using `/openapi.json`.
- Empty lists, optional fields and `null` are displayed correctly.
- Pagination uses `next_offset`, reports preserve the range and posts are deduplicated by account plus `shortcode`.
- There is caching, a timeout and `429` handling with `Retry-After`.
- The application protects its own users' access where needed.
- The displayed date represents data capture rather than just response time.
- There is a way to replace or revoke the key and clear published data from the application.

Return to [API connections](https://sentientdash.app/api.html) to create and manage keys, [download this guide](https://sentientdash.app/api-guide.en.md) or [download the reference project](https://sentientdash.app/media-kit-example.zip).
