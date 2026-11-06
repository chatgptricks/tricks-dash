import { validResearchFilters, RESEARCH_POST_TYPES } from '../src/researchFilterOptions.js';
import { decodeRouteState } from '../src/urlCodec.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://sentientdash.app/index.html?desktop=1', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'history', 'location', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'localStorage', 'sessionStorage']) {
  if (dom.window[key] !== undefined) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
globalThis.matchMedia = window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
localStorage.setItem('sentient.lang', 'en');
const stored = new Map();
const beforeCacheRead = null;
window.caches = {
  async match(key) { await beforeCacheRead?.(); const value = stored.get(key); return value ? new Response(value) : undefined; },
  async open() { return { async put(key, response) { stored.set(key, await response.text()); }, async delete(key) { return stored.delete(key); } }; },
};

const posts = Array.from({ length: 8 }, (_, index) => ({
  account: 'chatgptricks', shortcode: `STARTUP${index}`, caption: index === 0 || index === 7 ? 'Elon Musk research fixture' : `Independent research fixture ${index}`,
  type: 'Image', postDate: `2026-10-${String(index + 1).padStart(2, '0')}T12:00:00Z`,
  likes: index === 0 ? 5000 : 6000, comments: 1, group: 'sentient', isCollab: null, collaborators: [],
}));
const requests = [];
let _releaseLastPage;
let _releaseMetrics;
let holdLastPage = false;
let holdMetrics = false;
let catchupPage = null;
let releaseSecondPoster;
const response = (body) => Response.json(body);
window.fetch = globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  requests.push({ url, options });
  if (url.pathname.endsWith('/search')) { assert.equal(url.searchParams.get('text_scope'), 'caption'); return response({ matching_post_keys: ['chatgptricks:STARTUP0', 'chatgptricks:STARTUP7'] }); }
  if (url.pathname.endsWith('/manifest')) return new Headers(options.headers).get('If-None-Match') === '"research-startup"'
    ? new Response(null, { status: 304 })
    : response({ revision: 'research-startup', sources: [{ source: 'canonical', upperBound: 4 }, { source: 'dashboard', upperBound: 4 }], metricsAvailable: true });
  if (url.pathname.endsWith('/page')) {
    const body = { revision: 'research-startup', posts: url.searchParams.get('source') === 'canonical' ? posts.slice(0, 4) : posts.slice(4), nextCursor: 4, done: true };
    if (holdLastPage && url.searchParams.get('source') === 'dashboard') return new Promise((resolve) => { _releaseLastPage = () => resolve(response(body)); });
    return response(body);
  }
  if (url.pathname.endsWith('/metrics')) {
    if (catchupPage !== null) {
      catchupPage += 1;
      return response({
        updates: catchupPage === 6 ? [{ shortcode: 'STARTUP0', likes: 888, comments: 2, likesUpdatedAt: '2026-10-19T12:00:00Z' }] : [],
        cursor: { at: '2026-10-19T12:00:00Z', code: `SAME_TIMESTAMP_${catchupPage}` }, hasMore: catchupPage < 6,
      });
    }
    const body = { updates: [{ shortcode: 'STARTUP0', likes: 5000, comments: 2, likesUpdatedAt: '2026-10-19T12:00:00Z' }], cursor: { at: '2026-10-19T12:00:00Z', code: 'STARTUP0' }, hasMore: false };
    if (holdMetrics) return new Promise((resolve) => { _releaseMetrics = () => resolve(response(body)); });
    return response(body);
  }
  if (url.pathname.endsWith('/media')) {
    const code = url.searchParams.get('shortcode');
    const result = { items: [{ poster: `https://fixture.test/${code}.jpg` }] };
    if (code === 'STARTUP4') return new Promise(resolve => { releaseSecondPoster = () => resolve(response(result)); });
    return response(result);
  }
  if (url.pathname.endsWith('/accounts')) return response({ accounts: [{ handle: 'chatgptricks', label: 'ChatGPTricks', group: 'sentient', active: true }] });
  if (url.pathname.endsWith('/me')) return response({ is_admin: true, is_dev: true, operating_roles: ['vc', 'pd'] });
  if (url.pathname.endsWith('/lists')) return response({ lists: [] });
  return response({});
};

const bundle = await build({
  stdin: { contents: "export { default as React, act } from 'react'; export { createRoot } from 'react-dom/client'; export { default as App } from './src/App.jsx'; export { DashboardView, Prefs } from './src/mobile/main.jsx';", resolveDir: process.cwd(), loader: 'jsx' },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', target: 'es2022',
  loader: { '.jpg': 'dataurl', '.png': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
  define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.VITE_API_BASE': '"https://api.test"', 'import.meta.env.MODE': '"test"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
  alias: { 'firebase/app': path.resolve('smoke/stub-firebase-app.js'), 'firebase/auth': path.resolve('smoke/stub-firebase-auth.js') },
  plugins: [{ name: 'mobile-view-exports', setup(builder) {
    builder.onLoad({ filter: /src\/mobile\/main\.jsx$/ }, async ({ path: sourcePath }) => ({
      contents: (await fs.readFile(sourcePath, 'utf8')).replace(/mountApp\(<React\.StrictMode>[\s\S]*?\);\s*$/, 'export { DashboardView, Prefs };'),
      loader: 'jsx', resolveDir: path.dirname(sourcePath),
    }));
  } }],
});
const { React, act, createRoot, App, DashboardView, Prefs } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
const run = (action) => act(async () => { action(); await settle(); });
const calls = (endpoint) => requests.filter(({ url }) => url.pathname.endsWith(`/${endpoint}`));

history.replaceState(null, '', '/index.html?q=Elon+Musk&likes=5001');
const root = createRoot(document.getElementById('root'));
try {
  holdLastPage = true;
  await run(() => root.render(React.createElement(App)));
  for (let i = 0; i < 50 && !_releaseLastPage; i++) await act(async () => { await settle(); });
  assert.ok(_releaseLastPage);
  const pendingPost = new window.CustomEvent('sentient:open-post', { cancelable: true, detail: { postKey: 'chatgptricks:STARTUP0' } });
  await run(() => window.dispatchEvent(pendingPost));
  assert.ok(pendingPost.defaultPrevented, 'Opening a result during initial loading preserves catalogue progress');
  holdLastPage = false;
  await run(() => _releaseLastPage());
  for (let i = 0; i < 50 && !document.querySelector('.gallery-grid .post-card'); i++) await act(async () => { await settle(); });
  assert.deepEqual([...document.querySelectorAll('.gallery-grid .post-card[data-context-shortcode]')].map(p => p.dataset.contextShortcode), ['STARTUP7']);
  assert.equal(calls('search').length, 0, 'Use the existing general search, not an invented caption-only control');
  await run(() => [...document.querySelectorAll('button')].find(b => b.textContent.startsWith('Engagement')).click());
  assert.equal(document.querySelector('input[type=number][aria-label="Minimum likes"]').value, '5001', 'The exact threshold exists in a real numeric control');
  const filters = { query: 'Elon Musk', min_likes: 5001, min_comments: null, accounts: [], from_date: null, to_date: null, sort: 'newest', post_type: 'Carousel', promos_only: false, collabs_only: false };
  assert.ok(validResearchFilters(filters));
  assert.ok(RESEARCH_POST_TYPES.includes(filters.post_type));
  for (const extra of [{ text_scope: 'caption' }, { media: 'static' }, { post_type: 'Reel' }, { sort: 'most-views' }, { audio_id: '1234' }]) assert.equal(validResearchFilters({ ...filters, ...extra }), false);
  const pageReads = calls('page').length;
  const manifestReads = calls('manifest').length;
  const mountedLibrary = document.querySelector('.research-dashboard');
  const pageContexts = [window.location.href];
  window.addEventListener('sentient:page-context', () => pageContexts.push(window.location.href));
  for (const code of ['STARTUP0', 'STARTUP4']) {
    const postKey = `chatgptricks:${code}`;
    const openPost = new window.CustomEvent('sentient:open-post', { cancelable: true, detail: { postKey } });
    await run(() => window.dispatchEvent(openPost));
    assert.ok(openPost.defaultPrevented, 'Loaded post results are handled without document navigation');
    assert.equal(document.querySelectorAll('.obs-inspector.is-open').length, 1, 'Switching results reuses one inspector');
    assert.equal(document.querySelector('.obs-inspector.is-open [data-context-shortcode]').dataset.contextShortcode, code, 'The selected result replaces the previous post even outside the visible filters');
    assert.equal(document.querySelector('.research-dashboard'), mountedLibrary, 'The mounted post library is retained');
    assert.equal(document.querySelector('.database-loading-overlay'), null, 'Result switching never restarts the full-library loading screen');
    assert.deepEqual([...document.querySelectorAll('.gallery-grid .post-card[data-context-shortcode]')].map(p => p.dataset.contextShortcode), ['STARTUP7'], 'Current page filters remain intact');
    const route = decodeRouteState(new URL(window.location.href).searchParams.get('r'));
    assert.equal(route.post, postKey);
    assert.equal(route.q, 'Elon Musk');
    assert.equal(String(route.likes), '5001');
    assert.equal(pageContexts.at(-1), window.location.href, 'The host receives the canonical post URL after it changes');
  }
  for (const postKey of ['missing:UNKNOWN', '', {}, null]) {
    const unsupported = new window.CustomEvent('sentient:open-post', { cancelable: true, detail: { postKey } });
    await run(() => window.dispatchEvent(unsupported));
    assert.equal(unsupported.defaultPrevented, false, 'Unavailable or malformed post identities retain the host fallback');
  }
  assert.equal(document.querySelector('.obs-inspector.is-open [data-context-shortcode]').dataset.contextShortcode, 'STARTUP4');
  assert.equal(calls('page').length, pageReads, 'Switching result posts reuses the loaded catalogue');
  assert.equal(calls('manifest').length, manifestReads, 'Switching result posts does not restart catalogue synchronization');
  const action = new window.CustomEvent('sentient:research-filters', { cancelable: true, detail: { ...filters, query: '', min_likes: 6001, post_type: 'All posts' } });
  await run(() => window.dispatchEvent(action));
  assert.ok(action.defaultPrevented, 'The mounted page acknowledges supported filter actions');
  assert.equal(document.querySelectorAll('.gallery-grid .post-card[data-context-shortcode]').length, 0);
  assert.equal(calls('page').length, pageReads, 'Changing filters reuses the loaded catalogue');
  await run(() => window.dispatchEvent(new window.CustomEvent('sentient:research-filters', { cancelable: true, detail: { ...filters, post_type: 'All posts' } })));
  await run(() => document.querySelector('.search-clear').click());
  assert.equal(document.querySelectorAll('.gallery-grid .post-card[data-context-shortcode]').length, 7, 'Clearing search preserves the independent likes filter');
  await run(() => root.unmount());
  posts[0].type = 'Video'; posts[4].type = 'Video';
  history.replaceState(null, '', '/mobile/?collab=1');
  const mobile = createRoot(document.getElementById('root'));
  await run(() => mobile.render(React.createElement(Prefs.Provider, { value: { t: value => value, language: 'en' } }, React.createElement(DashboardView, { viewer: {} }))));
  for (let i = 0; i < 50 && !document.querySelector('.m-search-row'); i++) await act(async () => { await settle(); });
  const mobilePageReads = calls('page').length;
  const mobileLibrary = document.querySelector('.m-post-grid');
  assert.ok(mobileLibrary);
  let postSheet;
  for (const code of ['STARTUP0', 'STARTUP4']) {
    const openPost = new window.CustomEvent('sentient:open-post', { cancelable: true, detail: { postKey: `chatgptricks:${code}` } });
    await run(() => window.dispatchEvent(openPost));
    assert.ok(openPost.defaultPrevented, 'Mobile results are handled by the mounted Research view');
    assert.equal(document.querySelectorAll('.m-post-detail').length, 1, 'Mobile switches results in its existing post sheet');
    if (!postSheet) postSheet = document.querySelector('.m-sheet');
    else assert.equal(document.querySelector('.m-sheet'), postSheet, 'The post sheet stays mounted while its contents change');
    if (code === 'STARTUP0') assert.equal(document.querySelector('.m-post-detail img')?.getAttribute('src'), 'https://fixture.test/STARTUP0.jpg');
    else {
      assert.ok(releaseSecondPoster);
      assert.equal(document.querySelector('.m-post-detail img'), null, 'The prior video poster never carries over while the new poster is loading');
      await run(() => releaseSecondPoster());
      assert.equal(document.querySelector('.m-post-detail img')?.getAttribute('src'), 'https://fixture.test/STARTUP4.jpg');
    }
    assert.equal(document.querySelector('.m-post-detail p').textContent, posts.find(post => post.shortcode === code).caption);
    assert.equal(document.querySelector('.m-post-grid'), mobileLibrary);
    assert.equal(document.querySelectorAll('.m-post-grid .m-post-card').length, 0, 'Mobile preserves its active collaboration filter');
    const route = decodeRouteState(new URL(window.location.href).searchParams.get('r'));
    assert.equal(route.post, `chatgptricks:${code}`);
    assert.equal(route.collab, '1');
    assert.equal(pageContexts.at(-1), window.location.href);
  }
  assert.equal(calls('page').length, mobilePageReads, 'Mobile result switching never reloads the catalogue');
  await run(() => mobile.unmount());
  console.log('PASS Companion Research: in-place post switching preserves the loaded catalogue and filters, updates canonical URLs, and real filter actions use available controls.');
} finally { dom.window.close(); }
process.exit(0);
