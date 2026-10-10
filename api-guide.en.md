# Sentient Dash API guide

Connect dashboard data to websites, media kits, applications, reports and automated processes. This guide supports any authorized integration and explains which data you can read, how to authenticate and how to interpret each response, regardless of your programming language or hosting provider.

The API provides **read access to stored public data for selected accounts**: profile, followers, post performance, post catalog and follower history. Each connection has its own key, expiration and scope. Your application calls the API from its server; if it has a public interface, that server sends visitors the data you choose to display.

| Reference | Value |
| --- | --- |
| Production base | `https://cortex-api-db2e.onrender.com/api/v1` |
| Authentication | Header `Authorization: Bearer YOUR_KEY` |
| Method | `GET` for all five endpoints in this guide |
| Format | JSON, `schema_version: "1.0"` |
| Rate limit | 60 requests per minute per key |
| Connection settings | [API connections](https://sentientdash.app/api.html) |

## 1 Choose the data and integration pattern

| What you want to build | Data and request pattern |
| --- | --- |
| Media kit or creator page | `/media-kit` for profile, followers, performance and standout posts |
| Brand website or account directory | `/accounts` to discover the scope, and `/accounts/{handle}` for each account profile |
| Post gallery or catalog | `/posts`, paginated and filtered by dates or Promo status |
| Audience growth chart | `/followers/history`, with stored daily samples |
| Recurring report or analytics tool | Requests from a script or service; save the capture date and the range used |
| Static website | A server function as a proxy, or a task that generates static content from the API |
| Application with several accounts | A key authorizing those accounts, a separate cache per account and requests within the key's shared rate limit |

The exposed profiles currently belong to Instagram. The API reads the dashboard database: a request does not start scraping, request new captures or speed up metric updates. Data changes when the dashboard saves new observations. It does not let you edit data, manage users or Queue, or access contacts, internal analyses or credentials for other services. Webhooks are not included: to keep your integration current, query periodically or when its cache expires.

## 2 Create and manage a connection

1. Sign in to [sentientdash.app](https://sentientdash.app) with your Admin or Dev account.
2. Open the gear menu and choose **API connections**, or open [the connections screen](https://sentientdash.app/api.html).
3. Under **Connect an integration**, enter a recognizable name in **Connection name**, such as `Brand website`, `Monthly report` or `Analytics app`.
4. Select the expiration in **Expires in**: 30, 90 or 365 days.
5. Under **Allowed accounts**, select the accounts your integration can query. Use **Search accounts** to find them. The key keeps this selection; it does not automatically receive new accounts you add to the dashboard.
6. Click **Generate API key**. Under **Your API key**, use **Copy API key** and save it as a private server secret. Then click **I saved the key**. The key starts with `sad_api_` and is shown only once.

Create one key per integration or environment so you can identify and revoke each separately. You can authorize up to 100 active accounts per key and keep up to 20 active keys per owner. The limit of 60 requests per minute is shared across all endpoints and accounts queried with the same key.

Under **Your API keys**, you can see scope, expiration and last use. To block a connection, click **Revoke**, then **Confirm revoke**. If you lose a key or need to change its authorized accounts, create a new one and revoke the old one. To rotate a key without interrupting your application, configure the new key on your server first, verify a request and then revoke the previous key.

Only Admin or Dev can create keys. If the owner loses that permission or their dashboard access is removed, their keys stop reading data. Revocation and expiration block future reads; data your integration already received may remain in its cache or storage. To remove published data immediately, also remove it from your application.

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

With `SENTIENT_DASH_API_KEY` loaded in a server terminal, discover the authorized accounts:

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/accounts"
```

All the following endpoints use `GET`. Append each path to the `/api/v1` base. Use the handle returned by `/accounts`, without `@`.

| Endpoint | Contents of `data` | Query parameters |
| --- | --- | --- |
| `/accounts` | List of active authorized accounts | None |
| `/accounts/{handle}` | Public profile of one account | None |
| `/accounts/{handle}/media-kit` | Profile, performance summary, standout posts and available growth | None |
| `/accounts/{handle}/posts` | Paginated list of stored public posts | `limit`, `offset`, `from`, `to`, `is_promo` |
| `/accounts/{handle}/followers/history` | Paginated list of daily follower samples | `limit`, `offset`, `from`, `to` |

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

Each standout post includes `shortcode`, `permalink`, `public_caption`, `format`, `published_at`, `is_promo`, `metrics: { likes, comments, video_views, video_plays }`, `engagements` and `engagement_rate_pct`. Use `public_caption` as text and `permalink` as a link. `is_promo` is the Promo boolean described in the next section. `/media-kit` keeps its aggregate summaries and does not accept the `is_promo` filter or split summaries by Promo status. The JSON API does not return image files, videos or internal storage paths.

If `last_30_days` or `follower_growth` is absent, hide that block or explain that there is insufficient data. For a private account, the public catalog and standout posts are empty. Hidden or deleted posts, posts without a usable date and posts dated in the future are excluded from the public export.

## 6 Post catalog and follower history

Both endpoints accept the following parameters:

| Parameter | Value |
| --- | --- |
| `limit` | Integer from 1 to 100; default 20 |
| `offset` | Integer starting at 0; default 0 |
| `from` | Inclusive start date, `YYYY-MM-DD`, optional |
| `to` | Inclusive end date, `YYYY-MM-DD`, optional |

Dates are interpreted as calendar days in `America/Costa_Rica`. You can use either end of the range or both; `from` must be earlier than or equal to `to`. Do not send dates or times in another format. Post filters apply to the publication date; history filters apply to the capture day.

### Posts

In addition to the shared parameters, only `/posts` accepts this optional filter:

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

The proxy accepts `/api/posts?is_promo=true` and `/api/posts?is_promo=false`; omitting the parameter requests all statuses. It forwards the filter to the backend before pagination and preserves `is_promo` and `pagination.total` in the response. Cache entries are separate for each resource and query parameters, including the Promo filter. The filter is not accepted on `/api/media-kit` or `/api/followers`.

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

Do not automatically retry `401`, `403`, `404` or `422` errors without correcting their cause. For `429`, respect `Retry-After`; for temporary failures, avoid all instances retrying at once. Consolidate simultaneous requests for the same resource and reduce requests when data is already cached.

The downloadable project's proxy preserves useful API statuses and the `Retry-After` header. It uses `502` for connection failures or invalid responses and `504` for timeouts, without returning backend error bodies to the browser.

## 10 Versioning and integration checks

The current public route is `/api/v1`, and responses declare `schema_version: "1.0"`. Read the fields your application needs, tolerate additional fields and check optional objects before using them. Do not call internal dashboard or MCP routes with an integration key.

The `is_promo` field and its optional filter are compatible additions that retain `schema_version: "1.0"`. The field appears in the `/posts` catalog and `/media-kit` standout posts; the filter belongs only to `/posts`.

Before publishing, verify these points:

- The key exists only on the server or in the process's private environment.
- `/accounts` contains exactly the accounts your integration needs.
- All five endpoints are interpreted with their respective structures and dates.
- Empty lists, optional fields and `null` are displayed correctly.
- Pagination uses `next_offset`, reports preserve the range and posts are deduplicated by `shortcode`.
- There is caching, a timeout and `429` handling with `Retry-After`.
- The application protects its own users' access where needed.
- The displayed date represents data capture rather than just response time.
- There is a way to replace or revoke the key and clear published data from the application.

Return to [API connections](https://sentientdash.app/api.html) to create and manage keys, [download this guide](https://sentientdash.app/api-guide.en.md) or [download the reference project](https://sentientdash.app/media-kit-example.zip).
