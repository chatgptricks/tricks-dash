import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { createMediaKitServer } from './server.mjs';

const KEY = 'sad_api_test_secret_server_only';
const fixture = {
  schema_version: '1.0',
  generated_at: '2026-10-09T14:00:00Z',
  data_updated_at: { profile: '2026-10-08T12:00:00Z', engagement: null },
  data: { account: { handle: 'test_account', followers: null }, summary: { all_time: { post_count: 0 } } },
};

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

async function setup(t, handler, options = {}) {
  const calls = [];
  const upstream = createServer((request, response) => {
    calls.push({ path: request.url, auth: request.headers.authorization });
    if (handler) return handler(request, response);
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(fixture));
  });
  const upstreamBase = await listen(upstream);
  const website = createMediaKitServer({ apiKey: KEY, account: 'test_account', baseUrl: `${upstreamBase}/api/v1`, ...options });
  const url = await listen(website);
  t.after(() => {
    website.closeAllConnections();
    upstream.closeAllConnections();
    return Promise.all([new Promise((done) => website.close(done)), new Promise((done) => upstream.close(done))]);
  });
  return { url, calls };
}

test('key stays on the server and static files cannot disclose .env or source', async (t) => {
  const { url, calls } = await setup(t);
  for (const path of ['/', '/client.js', '/styles.css']) {
    const response = await fetch(`${url}${path}`);
    assert.equal(response.status, 200);
    assert.ok(!(await response.text()).includes(KEY));
  }
  for (const path of ['/.env', '/.env.example', '/server.mjs', '/server.test.mjs']) {
    assert.equal((await fetch(`${url}${path}`)).status, 404);
  }
  const response = await fetch(`${url}/api/media-kit`);
  assert.deepEqual(await response.json(), fixture);
  assert.deepEqual(calls, [{ path: '/api/v1/accounts/test_account/media-kit', auth: `Bearer ${KEY}` }]);
});

test('canonical pagination, cache expiry, and shared concurrent requests', async (t) => {
  let now = 0;
  const { url, calls } = await setup(t, null, { now: () => now });
  const first = await fetch(`${url}/api/posts?to=2026-10-09&offset=0&limit=20&from=2026-10-01`);
  assert.equal(first.headers.get('x-data-cache'), 'MISS');
  const second = await fetch(`${url}/api/posts?from=2026-10-01&to=2026-10-09`);
  assert.equal(second.headers.get('x-data-cache'), 'HIT');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/v1/accounts/test_account/posts?limit=20&offset=0&from=2026-10-01&to=2026-10-09');
  now = 300001;
  await Promise.all(Array.from({ length: 5 }, () => fetch(`${url}/api/posts?from=2026-10-01&to=2026-10-09`)));
  assert.equal(calls.length, 2);
});

test('visitor parameters cannot change the upstream, account, dates or bounds', async (t) => {
  const { url, calls } = await setup(t);
  for (const query of [
    'url=https://example.com', 'account=another', 'limit=101', 'limit=0', 'limit=2.5',
    'offset=100001', 'limit=1&limit=2', 'from=2026-02-30', 'from=2026-10-09&to=2026-10-01', 'to=',
  ]) {
    assert.equal((await fetch(`${url}/api/posts?${query}`)).status, 422, query);
  }
  assert.equal((await fetch(`${url}/api/media-kit?limit=20`)).status, 422);
  assert.equal((await fetch(`${url}/api/another`)).status, 404);
  assert.equal((await fetch(`${url}/api/posts`, { method: 'POST' })).status, 405);
  assert.equal(calls.length, 0);
});

test('Promo filters preserve booleans and filtered pagination with separate canonical caches', async (t) => {
  const rows = [
    { shortcode: 'ManualPromo', caption: 'Original manual Promo text', is_promo: true },
    { shortcode: 'TaggedPromo', caption: '#AIToolSentient original text', is_promo: true },
    { shortcode: 'RegularPost', caption: 'Original public text', is_promo: false },
  ];
  const { url, calls } = await setup(t, (request, response) => {
    const query = new URL(request.url, 'http://fake-upstream.local').searchParams;
    const filter = query.get('is_promo');
    const matching = filter === null ? rows : rows.filter((row) => row.is_promo === (filter === 'true'));
    const limit = Number(query.get('limit'));
    const offset = Number(query.get('offset'));
    const data = matching.slice(offset, offset + limit);
    const hasMore = offset + limit < matching.length;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      schema_version: '1.0',
      data,
      pagination: { limit, offset, total: matching.length, has_more: hasMore, next_offset: hasMore ? offset + limit : null },
    }));
  });

  for (const [suffix, expected] of [['', rows], ['&is_promo=true', rows.slice(0, 2)], ['&is_promo=false', rows.slice(2)]]) {
    const response = await fetch(`${url}/api/posts?limit=1${suffix}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-data-cache'), 'MISS');
    const payload = await response.json();
    assert.deepEqual(payload.data, expected.slice(0, 1));
    assert.deepEqual(payload.pagination, { limit: 1, offset: 0, total: expected.length, has_more: expected.length > 1, next_offset: expected.length > 1 ? 1 : null });
    assert.ok(!JSON.stringify(payload).includes(KEY));
  }
  assert.deepEqual(calls.map((call) => call.path), [
    '/api/v1/accounts/test_account/posts?limit=1&offset=0',
    '/api/v1/accounts/test_account/posts?limit=1&offset=0&is_promo=true',
    '/api/v1/accounts/test_account/posts?limit=1&offset=0&is_promo=false',
  ]);
  for (const filter of ['true', 'false']) {
    const cached = await fetch(`${url}/api/posts?is_promo=${filter}&offset=00&limit=01`);
    assert.equal(cached.headers.get('x-data-cache'), 'HIT');
  }
  assert.equal(calls.length, 3);
  const nextPage = await fetch(`${url}/api/posts?is_promo=true&offset=1&limit=1`);
  assert.deepEqual((await nextPage.json()).data, [rows[1]]);
  assert.equal(calls.length, 4);
});

test('invalid or misplaced Promo filters are rejected before an upstream request', async (t) => {
  const { url, calls } = await setup(t);
  for (const path of [
    '/api/posts?is_promo=', '/api/posts?is_promo=True', '/api/posts?is_promo=1',
    '/api/posts?is_promo=no', '/api/posts?is_promo=null', '/api/posts?is_promo=false%20',
    '/api/posts?is_promo=true&is_promo=false', '/api/posts?is_promo=false&is_promo=false',
    '/api/media-kit?is_promo=true', '/api/followers?is_promo=false',
  ]) {
    assert.equal((await fetch(`${url}${path}`)).status, 422, path);
  }
  assert.equal(calls.length, 0);
});

test('collaboration metadata passes through catalog and standout responses without coercing unknown state', async (t) => {
  const states = [
    { shortcode: 'CollabPost', caption: 'Original coauthored text', is_promo: false, is_collab: true, collaborators: ['coauthor_one'] },
    { shortcode: 'SoloPromo', caption: '#aitoolsentient original text', is_promo: true, is_collab: false, collaborators: [] },
    { shortcode: 'UnknownPost', caption: '@mentioned_user original text', is_promo: false, is_collab: null, collaborators: [] },
  ];
  const posts = { schema_version: '1.0', data: states, pagination: { limit: 20, offset: 0, total: 3, has_more: false, next_offset: null } };
  const report = {
    ...fixture,
    data: {
      ...fixture.data,
      best_posts: {
        all_time: states.map(({ caption, ...post }) => ({ ...post, public_caption: caption, metrics: { likes: null, comments: null, video_views: null, video_plays: null } })),
      },
    },
  };
  const { url, calls } = await setup(t, (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(request.url.includes('/media-kit') ? report : posts));
  });

  for (const [path, expected] of [['/api/posts', posts], ['/api/media-kit', report]]) {
    const response = await fetch(`${url}${path}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expected);
    const cached = await fetch(`${url}${path}`);
    assert.equal(cached.headers.get('x-data-cache'), 'HIT');
    const payload = await cached.json();
    assert.deepEqual(payload, expected);
    const rows = path === '/api/posts' ? payload.data : payload.data.best_posts.all_time;
    assert.deepEqual(rows.map(({ is_collab, collaborators }) => [is_collab, collaborators]), [[true, ['coauthor_one']], [false, []], [null, []]]);
    assert.ok(!JSON.stringify(payload).includes(KEY));
  }
  for (const path of ['/api/posts?is_collab=true', '/api/posts?is_collab=false', '/api/media-kit?is_collab=true']) {
    assert.equal((await fetch(`${url}${path}`)).status, 422, path);
  }
  assert.equal(calls.length, 2);
});

test('upstream key errors keep their status, hide bodies, and are cached briefly', async (t) => {
  let now = 0;
  const { url, calls } = await setup(t, (_request, response) => {
    response.writeHead(401);
    response.end(`Sensitive upstream diagnostics: ${KEY}`);
  }, { now: () => now });
  const response = await fetch(`${url}/api/media-kit`);
  assert.equal(response.status, 401);
  assert.ok(!(await response.text()).includes(KEY));
  const cached = await fetch(`${url}/api/media-kit`);
  assert.equal(cached.headers.get('x-data-cache'), 'HIT');
  assert.equal(calls.length, 1);
  now = 10001;
  assert.equal((await fetch(`${url}/api/media-kit`)).status, 401);
  assert.equal(calls.length, 2);
});

test('upstream 429 preserves Retry-After without exposing diagnostics', async (t) => {
  const { url } = await setup(t, (_request, response) => {
    response.writeHead(429, { 'Retry-After': '37' });
    response.end('Limited');
  });
  const response = await fetch(`${url}/api/followers`);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '37');
  assert.match((await response.json()).error.message, /límite/);
});

test('public proxy has an upstream request budget of its own', async (t) => {
  const { url, calls } = await setup(t, null, { upstreamBudget: 2 });
  assert.equal((await fetch(`${url}/api/posts?offset=0`)).status, 200);
  assert.equal((await fetch(`${url}/api/posts?offset=1`)).status, 200);
  const limited = await fetch(`${url}/api/posts?offset=2`);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal(calls.length, 2);
});

test('slow upstream ends with 504 and malformed successful response with 502', async (t) => {
  const slow = await setup(t, () => {}, { timeoutMs: 20 });
  assert.equal((await fetch(`${slow.url}/api/media-kit`)).status, 504);
  const malformed = await setup(t, (_request, response) => response.end('{broken'));
  assert.equal((await fetch(`${malformed.url}/api/media-kit`)).status, 502);
});

test('invalid startup configuration is rejected before serving requests', () => {
  assert.throws(() => createMediaKitServer({ apiKey: '', account: 'test' }), /API_KEY/);
  assert.throws(() => createMediaKitServer({ apiKey: KEY, account: '@test' }), /ACCOUNT/);
  assert.throws(() => createMediaKitServer({ apiKey: KEY, account: 'test', baseUrl: 'http://external.example/api/v1' }), /HTTPS/);
});
