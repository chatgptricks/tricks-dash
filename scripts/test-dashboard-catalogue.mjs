import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/dashboardCatalogue.js'], bundle: true, write: false, format: 'esm',
  plugins: [{
    name: 'mock-catalogue-transport',
    setup(builder) {
      builder.onLoad({ filter: /\/src\/api\.js$/ }, () => ({
        contents: "export const API_BASE = 'https://api.test'; export const apiFetch = (...args) => globalThis.fetch(...args);",
        loader: 'js',
      }));
    },
  }],
});
const { loadCompleteDashboardCatalogue } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const post = (shortcode, likes = 10) => ({ account: 'test', shortcode, likes, isCollab: null, collaborators: [] });
const sources = (canonical, dashboard = 3) => [{ source: 'canonical', upperBound: canonical }, { source: 'dashboard', upperBound: dashboard }];
const cachedCatalogue = {
  posts: [post('old-canonical'), post('old-dashboard')],
  sources: sources(5),
};
const calls = [];
function serve(manifestSources, pages, projectionGeneration) {
  calls.length = 0;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ path: url.pathname, params: url.searchParams, headers: options.headers });
    if (url.pathname.endsWith('/manifest')) {
      return Response.json({ revision: 'new-revision', sources: manifestSources, projectionGeneration }, { headers: { ETag: '"new-revision"' } });
    }
    assert.ok(url.pathname.endsWith('/page'), `Unexpected network request: ${url}`);
    const source = url.searchParams.get('source');
    const after = Number(url.searchParams.get('after_id'));
    const until = Number(url.searchParams.get('until_id'));
    const rows = pages[source] || [];
    return Response.json({
      revision: 'new-revision', done: true, nextCursor: until,
      posts: rows.filter(({ id }) => id > after && id <= until).map(({ value }) => value),
    });
  };
}
const pageCalls = () => calls.filter(call => call.path.endsWith('/page'));
const ids = result => result.posts.map(item => item.shortcode).sort();
const refreshed = {
  canonical: [{ id: 1, value: post('updated-canonical', 30) }],
  dashboard: [{ id: 1, value: post('updated-dashboard', 40) }],
};
const originalFetch = globalThis.fetch;
try {
  serve(sources(6), { canonical: [{ id: 6, value: post('new-post') }] });
  const appended = await loadCompleteDashboardCatalogue({ cachedCatalogue });
  assert.equal(appended.delta, true);
  assert.deepEqual(ids(appended), ['new-post', 'old-canonical', 'old-dashboard']);
  assert.equal(pageCalls().length, 1);
  assert.equal(pageCalls()[0].params.get('after_id'), '5', 'Pure growth should keep the bounded delta path');

  // A cached catalogue from before collaboration metadata shipped cannot use
  // an unchanged ETag or a growing watermark to skip older source records.
  for (const [label, legacyPosts] of [
    ['missing both fields', cachedCatalogue.posts.map(({ isCollab: _isCollab, collaborators: _collaborators, ...value }) => value)],
    ['missing state', cachedCatalogue.posts.map(({ isCollab: _isCollab, ...value }) => value)],
    ['missing collaborators', cachedCatalogue.posts.map(({ collaborators: _collaborators, ...value }) => value)],
  ]) {
    for (const upperBound of [5, 6]) {
      serve(sources(upperBound), refreshed);
      const upgraded = await loadCompleteDashboardCatalogue({ etag: '"legacy-unchanged"', cachedCatalogue: { ...cachedCatalogue, posts: legacyPosts } });
      assert.notEqual(upgraded.delta, true, `${label}/${upperBound}: upgrade must refetch the full snapshot`);
      assert.deepEqual(ids(upgraded), ['updated-canonical', 'updated-dashboard']);
      assert.ok(pageCalls().every(call => call.params.get('after_id') === '0'), `${label}/${upperBound}: older rows must be fetched`);
      assert.equal(calls.find(call => call.path.endsWith('/manifest')).headers?.['If-None-Match'], undefined, `${label}/${upperBound}: legacy ETag must be ignored`);
      assert.ok(upgraded.posts.every(value => Object.hasOwn(value, 'isCollab') && Array.isArray(value.collaborators)));
    }
  }

  serve(sources(6), refreshed, 2);
  const changedProjection = await loadCompleteDashboardCatalogue({ cachedCatalogue: { ...cachedCatalogue, projectionGeneration: 1 } });
  assert.notEqual(changedProjection.delta, true, 'A new metadata projection generation must refresh historical IDs even while source bounds grow');
  assert.deepEqual(ids(changedProjection), ['updated-canonical', 'updated-dashboard']);
  assert.ok(pageCalls().every(call => call.params.get('after_id') === '0'));
  assert.equal(changedProjection.projectionGeneration, 2);
  serve(sources(6), { canonical: [{ id: 6, value: post('new-post') }] }, 2);
  const stableProjection = await loadCompleteDashboardCatalogue({ cachedCatalogue: { ...cachedCatalogue, projectionGeneration: 2 } });
  assert.equal(stableProjection.delta, true, 'Matching projection generations retain the efficient growth path');
  assert.deepEqual(ids(stableProjection), ['new-post', 'old-canonical', 'old-dashboard']);
  assert.equal(pageCalls().length, 1);
  assert.equal(pageCalls()[0].params.get('after_id'), '5');
  assert.equal(stableProjection.projectionGeneration, 2);

  for (const [label, manifestSources, expected] of [
    ['same bounds with a new revision', sources(5), ['updated-canonical', 'updated-dashboard']],
    ['regressed watermark', sources(3), ['updated-canonical', 'updated-dashboard']],
    ['removed source', [{ source: 'canonical', upperBound: 5 }], ['updated-canonical']],
    ['added source', [...sources(5), { source: 'archive', upperBound: 1 }], ['updated-canonical', 'updated-dashboard']],
  ]) {
    serve(manifestSources, refreshed);
    const result = await loadCompleteDashboardCatalogue({ cachedCatalogue });
    assert.notEqual(result.delta, true, `${label} must revalidate the complete library`);
    assert.deepEqual(ids(result), expected, `${label} must discard stale cached rows`);
    assert.ok(pageCalls().every(call => call.params.get('after_id') === '0'));
  }

  serve(sources(5), refreshed);
  const cold = await loadCompleteDashboardCatalogue({ cachedCatalogue: { ...cachedCatalogue, posts: [] } });
  assert.deepEqual(ids(cold), ['updated-canonical', 'updated-dashboard']);
  assert.equal(cold.summary['Total likes'], 70);

  let conditionalCalls = 0;
  globalThis.fetch = async (input, options) => {
    conditionalCalls++;
    assert.ok(input.endsWith('/manifest'));
    assert.equal(options.headers['If-None-Match'], '"unchanged"');
    return new Response(null, { status: 304 });
  };
  assert.deepEqual(await loadCompleteDashboardCatalogue({ etag: '"unchanged"', cachedCatalogue }), { notModified: true });
  assert.equal(conditionalCalls, 1, 'An unchanged manifest must not download pages');
  const stamp = '2026-10-06T15:11:40+00:00';
  const metricCached = { ...cachedCatalogue, revision: 'unchanged', metricsAvailable: true, metricsAt: '' };
  const metricCalls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    metricCalls.push(url.pathname);
    if (url.pathname.endsWith('/manifest')) return new Response(null, { status: 304 });
    assert.ok(url.pathname.endsWith('/metrics'), 'Metric changes must not download the historical catalogue');
    const second = Boolean(url.searchParams.get('after_code'));
    return Response.json({
      updates: [{ shortcode: second ? 'old-dashboard' : 'old-canonical', likes: second ? 50 : 40, comments: 3, likesUpdatedAt: stamp }],
      cursor: { at: stamp, code: second ? 'old-dashboard' : 'old-canonical' }, hasMore: !second,
    });
  };
  const metricOnly = await loadCompleteDashboardCatalogue({ etag: '"unchanged"', cachedCatalogue: metricCached });
  assert.deepEqual(metricOnly.posts.map(p => p.likes), [40, 50]);
  assert.equal(metricOnly.metricsAt, stamp);
  assert.equal(metricOnly.posts[0].likesUpdatedAt, stamp);
  assert.equal(metricOnly.summary['Total likes'], 90);
  assert.equal(metricCalls.filter(path => path.endsWith('/page')).length, 0);
  assert.deepEqual(await loadCompleteDashboardCatalogue({ etag: '"unchanged"', cachedCatalogue: metricOnly }), { notModified: true, metricsAt: stamp });

  const appendCalls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    appendCalls.push(url.pathname);
    if (url.pathname.endsWith('/manifest')) return Response.json({ revision: 'appended', sources: sources(6), metricsAvailable: true });
    if (url.pathname.endsWith('/page')) return Response.json({ revision: 'appended', posts: [post('new-post')], nextCursor: 6, done: true });
    assert.ok(url.pathname.endsWith('/metrics'));
    return Response.json({ updates: [{ shortcode: 'old-canonical', likes: 77, comments: null, likesUpdatedAt: stamp }], cursor: { at: stamp, code: 'old-canonical' }, hasMore: false });
  };
  const appendedWithMetrics = await loadCompleteDashboardCatalogue({ cachedCatalogue: metricCached });
  assert.equal(appendedWithMetrics.delta, true);
  assert.equal(appendedWithMetrics.posts.find(p => p.shortcode === 'old-canonical').likes, 77);
  assert.equal(appendCalls.filter(path => path.endsWith('/page')).length, 1);

  const collabCached = {
    ...metricCached,
    posts: [
      { ...post('shared-code'), account: 'chatgptricks', isCollab: true, collaborators: ['openai'] },
      { ...post('shared-code'), account: 'openai', isCollab: true, collaborators: ['chatgptricks'] },
      post('old-canonical'),
      { ...post('old-dashboard'), isCollab: true, collaborators: ['previous-partner'] },
    ],
  };
  const collabCalls = [];
  globalThis.fetch = async input => {
    const url = new URL(input);
    collabCalls.push(url.pathname);
    if (url.pathname.endsWith('/manifest')) return new Response(null, { status: 304 });
    assert.ok(url.pathname.endsWith('/metrics'), 'Metadata-only changes must not download historical pages');
    return Response.json({
      updates: [],
      collaborationUpdates: [
        { account: 'chatgptricks', shortcode: 'shared-code', isCollab: false, collaborators: [] },
        { account: 'test', shortcode: 'old-canonical', isCollab: true, collaborators: ['openai'] },
        { account: 'test', shortcode: 'old-dashboard', isCollab: null, collaborators: [] },
        { account: 'unknown', shortcode: 'shared-code', isCollab: false, collaborators: [] },
      ],
      cursor: { at: stamp, code: 'shared-code' }, hasMore: false,
    });
  };
  const collabOnly = await loadCompleteDashboardCatalogue({ etag: '"unchanged"', cachedCatalogue: collabCached });
  assert.notEqual(collabOnly.notModified, true, 'Collaboration-only updates must produce fresh catalogue rows');
  assert.equal(collabOnly.posts[0].isCollab, false, 'Reliable empty metadata removes a previous collab flag');
  assert.deepEqual(collabOnly.posts[0].collaborators, []);
  assert.equal(collabOnly.posts[1].isCollab, true, 'The same shortcode on another account must retain its own state');
  assert.deepEqual(collabOnly.posts[1].collaborators, ['chatgptricks']);
  assert.equal(collabOnly.posts[2].isCollab, true);
  assert.deepEqual(collabOnly.posts[2].collaborators, ['openai']);
  assert.equal(collabOnly.posts[3].isCollab, null, 'Unknown metadata must replace an earlier flag without converting to false');
  assert.deepEqual(collabOnly.posts[3].collaborators, []);
  assert.deepEqual(collabOnly.posts.map(value => value.likes), [10, 10, 10, 10], 'Metadata-only updates preserve engagement');
  assert.equal(collabOnly.summary['Total likes'], 40);
  assert.equal(collabCalls.filter(value => value.endsWith('/page')).length, 0);
  assert.deepEqual(await loadCompleteDashboardCatalogue({ etag: '"unchanged"', cachedCatalogue: collabOnly }), { notModified: true, metricsAt: stamp }, 'Repeated metadata must settle to unchanged');

  globalThis.fetch = async (input) => new URL(input).pathname.endsWith('/manifest')
    ? new Response(null, { status: 304 }) : new Response(null, { status: 404 });
  assert.deepEqual(await loadCompleteDashboardCatalogue({ etag: '"unchanged"', cachedCatalogue: metricCached }), { notModified: true });
  console.log('PASS metric deltas: unchanged manifests, bounded pagination, stable repeats, new posts with older metric changes and independent deployment propagation');
  console.log('PASS collaboration metadata: legacy full upgrades despite ETags/growth, projection generation invalidation, account-scoped metadata-only changes, false/null replacements and stable repeats');
  console.log('PASS catalogue: bounded growth, changed revisions, source changes, watermark rollback, cold loads and conditional reads');
} finally {
  globalThis.fetch = originalFetch;
}
