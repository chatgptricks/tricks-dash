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
let beforeCacheRead;
window.caches = {
  async match(key) { await beforeCacheRead?.(); const value = stored.get(key); return value ? new Response(value) : undefined; },
  async open() { return { async put(key, response) { stored.set(key, await response.text()); }, async delete(key) { return stored.delete(key); } }; },
};

const posts = Array.from({ length: 8 }, (_, index) => ({
  account: 'chatgptricks', shortcode: `STARTUP${index}`, caption: `Independent research fixture ${index}`,
  type: 'Image', postDate: `2026-10-${String(index + 1).padStart(2, '0')}T12:00:00Z`,
  likes: index + 10, comments: 1, group: 'sentient', isCollab: null, collaborators: [],
}));
const requests = [];
let releaseLastPage;
let releaseMetrics;
let holdLastPage = true;
let holdMetrics = true;
let catchupPage = null;
const response = (body) => Response.json(body);
window.fetch = globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  requests.push({ url, options });
  if (url.pathname.endsWith('/manifest')) return new Headers(options.headers).get('If-None-Match') === '"research-startup"'
    ? new Response(null, { status: 304 })
    : response({ revision: 'research-startup', sources: [{ source: 'canonical', upperBound: 4 }, { source: 'dashboard', upperBound: 4 }], metricsAvailable: true });
  if (url.pathname.endsWith('/page')) {
    const body = { revision: 'research-startup', posts: url.searchParams.get('source') === 'canonical' ? posts.slice(0, 4) : posts.slice(4), nextCursor: 4, done: true };
    if (holdLastPage && url.searchParams.get('source') === 'dashboard') return new Promise((resolve) => { releaseLastPage = () => resolve(response(body)); });
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
    const body = { updates: [{ shortcode: 'STARTUP0', likes: 777, comments: 2, likesUpdatedAt: '2026-10-19T12:00:00Z' }], cursor: { at: '2026-10-19T12:00:00Z', code: 'STARTUP0' }, hasMore: false };
    if (holdMetrics) return new Promise((resolve) => { releaseMetrics = () => resolve(response(body)); });
    return response(body);
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
let expireRead;
let continueMetrics;
let continueWithoutCache;
const originalTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback, delay, ...args) => {
  if (delay === 120_000) { expireRead = callback; return undefined; }
  if (delay === 3_000) { continueMetrics = callback; return undefined; }
  if (delay === 250) { continueWithoutCache = callback; return undefined; }
  return originalTimeout(callback, delay, ...args);
};

try {
  for (const mobile of [false, true]) {
    requests.length = 0;
    holdLastPage = true;
    holdMetrics = true;
    catchupPage = null;
    continueMetrics = null;
    let releaseCacheRead;
    if (!mobile) beforeCacheRead = () => new Promise((resolve) => { releaseCacheRead = resolve; });
    const root = createRoot(document.getElementById('root'));
    const cardSelector = mobile ? '.m-post-card' : '.gallery-grid .post-card[data-context-shortcode]';
    await run(() => root.render(mobile
      ? React.createElement(Prefs.Provider, { value: { t: (value) => value } }, React.createElement(DashboardView, { viewer: {} }))
      : React.createElement(App)));
    if (!mobile) {
      assert.equal(calls('manifest').length, 0, 'Fast storage gets a brief head start');
      assert.equal(typeof continueWithoutCache, 'function', 'Slow storage must yield to the network after only 250 ms');
      await run(() => continueWithoutCache());
      assert.equal(calls('manifest').length, 1, 'A stalled cache must not delay the live catalogue by seconds');
      beforeCacheRead = null;
      await run(() => releaseCacheRead());
    }
    assert.equal(calls('page').length, 2, 'Both bounded sources begin loading');
    assert.equal(document.querySelectorAll(cardSelector).length, 0, 'An incomplete historical snapshot cannot appear as a complete library');
    const cancelledPage = releaseLastPage;
    await run(() => expireRead());
    assert.equal(document.querySelectorAll(cardSelector).length, 0, 'A timeout must not publish a partial catalogue');
    await run(() => window.dispatchEvent(new Event('online')));
    assert.equal(calls('page').filter(({ url }) => url.searchParams.get('source') === 'canonical').length, 1, 'Recovery must retain a completed source instead of downloading it again');
    assert.equal(calls('page').length, 3, 'Only the unfinished source retries');
    holdLastPage = false;
    await run(() => releaseLastPage());
    assert.equal(calls('metrics').length, 1, 'Metric replay starts after structural verification');
    assert.equal(document.querySelectorAll(cardSelector).length, posts.length, 'Every post is usable while metric replay is still pending');
    await run(() => cancelledPage());
    assert.equal(document.querySelectorAll(cardSelector).length, posts.length, 'A late cancelled source cannot append duplicate rows to the recovered catalogue');
    if (!mobile) {
      assert.equal(document.querySelector('.topbar-search input').disabled, false, 'The complete library enables search before metrics finish');
      assert.equal([...stored.values()].map((value) => JSON.parse(value)).at(-1).posts.length, posts.length, 'The verified complete snapshot is persisted before metric replay finishes');
    }
    const historicalPages = calls('page').length;
    await run(() => expireRead());
    assert.equal(document.querySelectorAll(cardSelector).length, posts.length, 'A metric timeout retains every verified post');
    holdMetrics = false;
    await run(() => window.dispatchEvent(new Event('online')));
    assert.equal(calls('page').length, historicalPages, 'Recovery reuses the verified snapshot without downloading history again');
    assert.equal(calls('manifest').at(-1).options.headers.get('If-None-Match'), '"research-startup"', 'Recovery conditionally verifies the saved complete revision');
    assert.match(document.querySelector(`${cardSelector}[data-context-shortcode="STARTUP0"]`).textContent, /777/, 'Recovery applies the pending metric update');
    await run(() => releaseMetrics());
    assert.equal(document.querySelectorAll(cardSelector).length, posts.length, 'A cancelled metric response cannot replace the recovered library');
    catchupPage = 0;
    await run(() => window.dispatchEvent(new Event('online')));
    assert.equal(catchupPage, 5, 'One refresh handles a bounded five-page metric batch');
    assert.equal(typeof continueMetrics, 'function', 'A pending metric batch schedules a short continuation');
    assert.equal(document.querySelectorAll(cardSelector).length, posts.length, 'Metric continuation retains the complete library');
    if (!mobile) assert.equal([...stored.values()].map((value) => JSON.parse(value)).at(-1).metricsCursor.code, 'SAME_TIMESTAMP_5', 'Reloads retain the exact metric cursor after an unchanged batch');
    await run(() => continueMetrics());
    assert.equal(catchupPage, 6, 'The short continuation completes the pending metric stream');
    assert.equal(calls('metrics').at(-1).url.searchParams.get('after_code'), 'SAME_TIMESTAMP_5', 'A conditional unchanged batch retains the exact code cursor within the same timestamp');
    assert.equal(calls('page').length, historicalPages, 'Metric catchup never restarts historical pagination');
    assert.match(document.querySelector(`${cardSelector}[data-context-shortcode="STARTUP0"]`).textContent, /888/, 'The continuation applies its final metric update');
    await run(() => root.unmount());
  }
  console.log('PASS Research startup (desktop and mobile): complete snapshot before metrics, no partial library, durable cache, retained posts after timeout and conditional recovery without historical restart');
} finally {
  globalThis.setTimeout = originalTimeout;
  dom.window.close();
}
process.exit(0);
