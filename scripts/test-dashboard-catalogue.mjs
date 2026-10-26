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
  assert.deepEqual(await loadCompleteDashboardCatalogue({ etag: '"unchanged"', cachedCatalogue: metricOnly }), {
    notModified: true, metricsAt: stamp, metricsCursor: { at: stamp, code: '' }, metricsPending: false,
  });

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
  assert.deepEqual(await loadCompleteDashboardCatalogue({ etag: '"unchanged"', cachedCatalogue: collabOnly }), {
    notModified: true, metricsAt: stamp, metricsCursor: { at: stamp, code: '' }, metricsPending: false,
  }, 'Repeated metadata must settle to unchanged');

  // A complete source snapshot must be available before a metric replay that
  // hangs or is cancelled. The published value retains the source projection.
  let publishedSnapshot;
  let metricsStarted;
  const reachedMetrics = new Promise(resolve => { metricsStarted = resolve; });
  const cancelled = new AbortController();
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/manifest')) return Response.json({ revision: 'cold-metrics', sources: sources(1, 1), metricsAvailable: true });
    if (url.pathname.endsWith('/page')) return Response.json({
      revision: 'cold-metrics', posts: [post(url.searchParams.get('source'), 42)], nextCursor: 1, done: true,
    });
    assert.ok(url.pathname.endsWith('/metrics'));
    assert.equal(publishedSnapshot?.posts.length, 2, 'Only the full source catalogue can be published before metric catchup');
    metricsStarted();
    return new Promise((_, reject) => {
      const abort = () => reject(options.signal.reason);
      options.signal.addEventListener('abort', abort, { once: true });
      if (options.signal.aborted) abort();
    });
  };
  const heldMetrics = loadCompleteDashboardCatalogue({ signal: cancelled.signal, onSnapshot: snapshot => { publishedSnapshot = snapshot; } });
  await reachedMetrics;
  assert.deepEqual(ids(publishedSnapshot), ['canonical', 'dashboard']);
  assert.equal(publishedSnapshot.summary['Total likes'], 84);
  assert.ok(publishedSnapshot.posts.every(value => Object.hasOwn(value, 'isCollab') && Array.isArray(value.collaborators)));
  let settled = false;
  void heldMetrics.then(() => { settled = true; }, () => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false, 'The structural snapshot must be available while metric catchup is pending');
  const metricTimeout = new DOMException('Metric replay deadline', 'TimeoutError');
  cancelled.abort(metricTimeout);
  await assert.rejects(heldMetrics, error => error === metricTimeout);
  assert.deepEqual(ids(publishedSnapshot), ['canonical', 'dashboard'], 'Metric cancellation cannot remove the delivered complete catalogue');

  globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/manifest')) return Response.json({ revision: 'no-op-metrics', sources: sources(1, 1), metricsAvailable: true });
    if (url.pathname.endsWith('/page')) return Response.json({
      revision: 'no-op-metrics', posts: [post(url.searchParams.get('source'), 42)], nextCursor: 1, done: true,
    });
    return Response.json({ updates: [], cursor: { at: stamp, code: 'complete' }, hasMore: false });
  };
  const unchangedSnapshot = await loadCompleteDashboardCatalogue({ onSnapshot: snapshot => { publishedSnapshot = snapshot; } });
  assert.equal(unchangedSnapshot.posts, publishedSnapshot.posts, 'A no-op metric batch must retain the rendered post identities');
  assert.equal(unchangedSnapshot.summary, publishedSnapshot.summary, 'A no-op metric batch must not rebuild the complete summary');
  assert.deepEqual(unchangedSnapshot.metricsCursor, { at: stamp, code: '' }, 'Retaining the rendered library must still advance metric progress');

  // Stop each catchup after five pages, then resume using both cursor fields.
  // All observations deliberately share one timestamp to catch dropped tails.
  const boundedCalls = [];
  const metricPosts = [post('checkpoint-5', 10), post('checkpoint-7', 10)];
  globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/manifest')) return new Response(null, { status: 304 });
    assert.ok(url.pathname.endsWith('/metrics'), 'Catchup continuation must never re-download source pages');
    assert.equal(url.searchParams.get('limit'), '1000');
    const previous = Number((url.searchParams.get('after_code') || 'checkpoint-0').split('-')[1]);
    if (previous) assert.equal(url.searchParams.get('after_at'), stamp);
    const next = Math.min(previous + 1, 7);
    boundedCalls.push({ after: previous, next });
    return Response.json({
      updates: next > previous ? [{ shortcode: `checkpoint-${next}`, likes: 10, comments: undefined, likesUpdatedAt: stamp }] : [],
      cursor: { at: stamp, code: `checkpoint-${next}` }, hasMore: next < 7,
    });
  };
  const catchup = await loadCompleteDashboardCatalogue({ etag: '"unchanged"', cachedCatalogue: { ...metricCached, posts: metricPosts } });
  assert.equal(boundedCalls.length, 5, 'A long observation history must yield after five pages');
  assert.equal(catchup.metricsPending, true);
  assert.deepEqual(catchup.metricsCursor, { at: stamp, code: 'checkpoint-5' });
  assert.equal(catchup.posts[0].likesUpdatedAt, stamp, 'Every completed batch must apply its patches before saving the cursor');
  const resumed = await loadCompleteDashboardCatalogue({ etag: '"unchanged"', cachedCatalogue: catchup });
  assert.deepEqual(boundedCalls.slice(5).map(value => value.after), [5, 6], 'Same-timestamp continuation must retain the shortcode cursor');
  assert.equal(resumed.metricsPending, false);
  assert.deepEqual(resumed.metricsCursor, { at: stamp, code: '' }, 'Completed polls must reread timestamp ties to include late commits');
  assert.equal(resumed.posts[1].likesUpdatedAt, stamp);
  const revalidatedTies = await loadCompleteDashboardCatalogue({ etag: '"unchanged"', cachedCatalogue: resumed });
  assert.deepEqual(revalidatedTies, {
    notModified: true, metricsAt: stamp, metricsCursor: { at: stamp, code: 'checkpoint-5' }, metricsPending: true,
  }, 'A completed stream must revalidate timestamp ties while retaining bounded continuation');
  assert.deepEqual(await loadCompleteDashboardCatalogue({ etag: '"unchanged"', cachedCatalogue: { ...resumed, ...revalidatedTies } }), {
    notModified: true, metricsAt: stamp, metricsCursor: { at: stamp, code: '' }, metricsPending: false,
  }, 'Revalidating unchanged ties must settle without restarting source pagination');

  let lateObservation = false;
  globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/manifest')) return new Response(null, { status: 304 });
    const rows = [
      ...(lateObservation ? [{ shortcode: 'early-code', likes: 99, likesUpdatedAt: stamp }] : []),
      { shortcode: 'later-code', likes: 20, likesUpdatedAt: stamp },
    ].filter(value => value.shortcode > url.searchParams.get('after_code'));
    return Response.json({ updates: rows, cursor: { at: stamp, code: rows.at(-1)?.shortcode || url.searchParams.get('after_code') }, hasMore: false });
  };
  const beforeLateCommit = await loadCompleteDashboardCatalogue({
    etag: '"unchanged"', cachedCatalogue: { ...metricCached, posts: [post('early-code'), post('later-code')] },
  });
  lateObservation = true;
  const afterLateCommit = await loadCompleteDashboardCatalogue({ etag: '"unchanged"', cachedCatalogue: beforeLateCommit });
  assert.equal(afterLateCommit.posts[0].likes, 99, 'A lower shortcode committed after completion in the same second must not be skipped');

  globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/manifest')) return new Response(null, { status: 304 });
    const previous = Number(url.searchParams.get('after_code') || 0);
    return Response.json({ updates: [], cursor: { at: stamp, code: String(previous + 1) }, hasMore: true });
  };
  const unchangedPending = await loadCompleteDashboardCatalogue({ etag: '"unchanged"', cachedCatalogue: metricCached });
  assert.deepEqual(unchangedPending, {
    notModified: true, metricsAt: stamp, metricsCursor: { at: stamp, code: '5' }, metricsPending: true,
  }, 'Cursor progress must survive even if none of the observations changes a catalogue card');

  // Each range can eventually exceed JavaScript's function argument limit.
  // Repeated source rows keep this transport-size regression lightweight.
  const largeBound = 540_004;
  const repeatedPost = post('large-source-duplicate');
  globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/manifest')) return Response.json({ revision: 'large', sources: sources(0, largeBound) });
    const after = Number(url.searchParams.get('after_id'));
    const until = Number(url.searchParams.get('until_id'));
    assert.equal(url.searchParams.get('limit'), '2000', 'Historical pages must stay below the slow 12k-row payload size');
    const end = Math.min(until, after + Number(url.searchParams.get('limit')));
    return { ok: true, json: async () => ({ revision: 'large', posts: Array(end - after).fill(repeatedPost), nextCursor: end, done: end === until }) };
  };
  const large = await loadCompleteDashboardCatalogue();
  assert.equal(large.rawTotal, largeBound, 'A large source must retain every transport row without argument overflow');
  assert.equal(large.posts.length, 1, 'Large snapshots must retain account+shortcode deduplication');

  // Each successful page is a private checkpoint, even when a later page
  // times out. A changed manifest must discard the previous partial history.
  for (const changeRevision of [false, true]) {
    const checkpoint = {};
    const retryCalls = [];
    let revision = 'checkpoint-a';
    let failing = true;
    let snapshots = 0;
    globalThis.fetch = async input => {
      const url = new URL(input);
      if (url.pathname.endsWith('/manifest')) return Response.json({ revision, sources: sources(5, 0) });
      const after = Number(url.searchParams.get('after_id'));
      retryCalls.push({ after, revision });
      if (after === 2 && failing) return new Response('', { status: 503 });
      const end = Math.min(after + 2, 5);
      return Response.json({ revision, posts: Array.from({ length: end - after }, (_, index) => post(`${revision}-${after + index + 1}`)), nextCursor: end, done: end === 5 });
    };
    await assert.rejects(loadCompleteDashboardCatalogue({ checkpoint, onSnapshot: () => { snapshots += 1; } }), error => error.status === 503);
    assert.equal(snapshots, 0, 'A failed partial snapshot must never reach the UI');
    assert.equal(checkpoint.current.received, 2, 'Only verified completed pages are retained');
    failing = false;
    if (changeRevision) revision = 'checkpoint-b';
    const resumedSnapshot = await loadCompleteDashboardCatalogue({ checkpoint, onSnapshot: () => { snapshots += 1; } });
    assert.equal(retryCalls[2].after, changeRevision ? 0 : 2, 'Retry resumes its cursor unless the manifest changed');
    assert.deepEqual(ids(resumedSnapshot), [1, 2, 3, 4, 5].map(id => `${revision}-${id}`));
    assert.equal(snapshots, 1);
    assert.equal(checkpoint.current, null, 'A verified complete snapshot releases its private transport checkpoint');
  }

  const racingCheckpoint = {};
  let releaseCancelledBody;
  let releaseRetryBody;
  let retryBodyStarted;
  const retryBodyReady = new Promise(resolve => { retryBodyStarted = resolve; });
  let failedFlight = true;
  globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/manifest')) return Response.json({ revision: 'racing', sources: sources(1, 1) });
    const source = url.searchParams.get('source');
    if (failedFlight && source === 'dashboard') return new Response('', { status: 503 });
    if (failedFlight) return { ok: true, json: () => new Promise(resolve => { releaseCancelledBody = resolve; }) };
    if (source === 'dashboard') return { ok: true, json: () => new Promise(resolve => { releaseRetryBody = resolve; retryBodyStarted(); }) };
    return Response.json({ revision: 'racing', posts: [post('fresh-canonical')], nextCursor: 1, done: true });
  };
  await assert.rejects(loadCompleteDashboardCatalogue({ checkpoint: racingCheckpoint }), error => error.status === 503);
  failedFlight = false;
  const racingRetry = loadCompleteDashboardCatalogue({ checkpoint: racingCheckpoint });
  await retryBodyReady;
  releaseCancelledBody({ revision: 'racing', posts: [post('cancelled-private-row')], nextCursor: 1, done: true });
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
  assert.equal(racingCheckpoint.current.received, 1, 'A late sibling JSON body must not mutate the new flight checkpoint');
  releaseRetryBody({ revision: 'racing', posts: [post('fresh-dashboard')], nextCursor: 1, done: true });
  assert.deepEqual(ids(await racingRetry), ['fresh-canonical', 'fresh-dashboard'], 'Only the active retry may publish retained pages');

  const sparseIds = [...Array.from({ length: 3_500 }, (_, index) => index + 1), 8_001, 32_001, 63_999];
  const sparseCalls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/manifest')) return Response.json({ revision: 'sparse', sources: sources(0, 64_000) });
    const after = Number(url.searchParams.get('after_id'));
    const until = Number(url.searchParams.get('until_id'));
    const limit = Number(url.searchParams.get('limit'));
    sparseCalls.push({ after, until, limit });
    maxInFlight = Math.max(maxInFlight, ++inFlight);
    await new Promise(resolve => setImmediate(resolve));
    inFlight -= 1;
    const rows = sparseIds.filter(id => id > after && id <= until).slice(0, limit);
    const cursor = rows.at(-1) || until;
    return Response.json({ revision: 'sparse', posts: rows.map(id => post(String(id))), nextCursor: cursor, done: rows.length < limit || cursor === until });
  };
  const sparse = await loadCompleteDashboardCatalogue();
  assert.deepEqual(sparse.posts.map(value => Number(value.shortcode)).sort((a, b) => a - b), sparseIds, 'Queued ranges must cover dense and sparse IDs without gaps or duplicate rows');
  assert.equal(new Set(sparseCalls.map(value => value.until)).size, 16, 'Small ID ranges distribute uneven history among available workers');
  assert.equal(maxInFlight, 4, 'Extra queued ranges must never increase the four-request concurrency ceiling');
  assert.ok(sparseCalls.every(value => value.limit === 2_000));

  globalThis.fetch = async (input) => new URL(input).pathname.endsWith('/manifest')
    ? new Response(null, { status: 304 }) : new Response(null, { status: 404 });
  assert.deepEqual(await loadCompleteDashboardCatalogue({ etag: '"unchanged"', cachedCatalogue: metricCached }), { notModified: true });
  console.log('PASS metric deltas: unchanged manifests, bounded pagination, stable repeats, new posts with older metric changes and independent deployment propagation');
  console.log('PASS collaboration metadata: legacy full upgrades despite ETags/growth, projection generation invalidation, account-scoped metadata-only changes, false/null replacements and stable repeats');
  console.log('PASS catalogue: bounded growth, changed revisions, source changes, watermark rollback, cold loads and conditional reads');
  console.log('PASS startup: complete snapshot before stalled metrics, cancellation retention, bounded catchup, exact same-timestamp continuation and large source ranges');
} finally {
  globalThis.fetch = originalFetch;
}
