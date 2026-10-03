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
const post = (shortcode, likes = 10) => ({ account: 'test', shortcode, likes });
const sources = (canonical, dashboard = 3) => [{ source: 'canonical', upperBound: canonical }, { source: 'dashboard', upperBound: dashboard }];
const cachedCatalogue = {
  posts: [post('old-canonical'), post('old-dashboard')],
  sources: sources(5),
};
const calls = [];
function serve(manifestSources, pages) {
  calls.length = 0;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ path: url.pathname, params: url.searchParams, headers: options.headers });
    if (url.pathname.endsWith('/manifest')) {
      return Response.json({ revision: 'new-revision', sources: manifestSources }, { headers: { ETag: '"new-revision"' } });
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
  console.log('PASS catalogue: bounded growth, changed revisions, source changes, watermark rollback, cold loads and conditional reads');
} finally {
  globalThis.fetch = originalFetch;
}
