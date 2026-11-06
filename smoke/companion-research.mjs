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
  account: 'chatgptricks', shortcode: `STARTUP${index}`, caption: `Independent research fixture ${index}`,
  type: 'Image', postDate: `2026-10-${String(index + 1).padStart(2, '0')}T12:00:00Z`,
  likes: index === 0 ? 5000 : 6000, comments: 1, group: 'sentient', isCollab: null, collaborators: [],
}));
const requests = [];
let _releaseLastPage;
let _releaseMetrics;
let holdLastPage = false;
let holdMetrics = false;
let catchupPage = null;
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
const { React, act, createRoot, App } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
const run = (action) => act(async () => { action(); await settle(); });
const calls = (endpoint) => requests.filter(({ url }) => url.pathname.endsWith(`/${endpoint}`));

history.replaceState(null, '', '/index.html?q=Elon+Musk&scope=caption&likes=5001');
const root = createRoot(document.getElementById('root'));
try {
  await run(() => root.render(React.createElement(App)));
  for (let i = 0; i < 50 && !document.querySelector('.gallery-grid .post-card'); i++) await act(async () => { await settle(); });
  assert.deepEqual([...document.querySelectorAll('.gallery-grid .post-card[data-context-shortcode]')].map(p => p.dataset.contextShortcode), ['STARTUP7']);
  assert.match(document.body.textContent, /Caption only/);
  assert.match(document.body.textContent, /5,001/);
  assert.equal(calls('search').length, 1);
  await run(() => document.querySelector('.search-clear').click());
  assert.equal(document.querySelectorAll('.gallery-grid .post-card[data-context-shortcode]').length, 7, 'Clearing caption scope preserves the independent likes filter');
  await run(() => root.unmount());
  console.log('PASS Companion Research: shared URL drives visible caption-only and exact engagement filters; complete server matches work beyond preview text.');
} finally { dom.window.close(); }
process.exit(0);
