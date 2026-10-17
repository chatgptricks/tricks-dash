import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import * as esbuild from 'esbuild';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://sentientdash.app/mobile/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'history', 'location', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'localStorage', 'sessionStorage']) {
  if (dom.window[key] !== undefined) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
let visibility = 'visible';
Object.defineProperty(document, 'visibilityState', { get: () => visibility, configurable: true });
const intervals = new Map();
let intervalId = 0;
window.setInterval = (callback, delay) => {
  const id = ++intervalId;
  intervals.set(id, { callback, delay });
  return id;
};
window.clearInterval = (id) => intervals.delete(id);

const fixturePost = (id) => ({
  account: 'chatgptricks', shortcode: `POST${id}`, caption: `Useful AI workflow ${id}`,
  type: 'Image', postDate: `2026-10-16T${String(10 + id).padStart(2, '0')}:00:00Z`,
  likes: 100, comments: 1, group: 'sentient', isCollab: null, collaborators: [],
});
const posts = [fixturePost(1)];
const requests = [];
let pendingManifest = false;
let resolveManifest;
let projectionGeneration = 0;
const manifestResponse = (options) => {
  const revision = `mobile-refresh-${posts.length}${projectionGeneration ? `-metadata-${projectionGeneration}` : ''}`;
  return options.headers.get('If-None-Match') === `"${revision}"`
    ? new Response(null, { status: 304 })
    : Response.json({ revision, projectionGeneration, sources: [{ source: 'canonical', upperBound: posts.length }], metricsAvailable: false }, { headers: { ETag: `"${revision}"` } });
};
window.fetch = async (input, options = {}) => {
  const url = new URL(input);
  requests.push({ url, options });
  if (url.pathname.endsWith('/manifest')) {
    if (pendingManifest) return new Promise((resolve) => { resolveManifest = () => resolve(manifestResponse(options)); });
    return manifestResponse(options);
  }
  if (url.pathname.endsWith('/page')) {
    const after = Number(url.searchParams.get('after_id'));
    const upper = Number(url.searchParams.get('until_id'));
    return Response.json({ revision: url.searchParams.get('revision'), posts: posts.slice(after, upper), nextCursor: upper, done: true });
  }
  if (url.pathname.endsWith('/accounts')) return Response.json({ accounts: [{ handle: 'chatgptricks', group: 'sentient' }] });
  throw new Error(`Unexpected request: ${url.pathname}`);
};

// Exercise the actual view and transport without mounting the full auth shell.
const build = await esbuild.build({
  stdin: {
    contents: "export { default as React, act } from 'react'; export { createRoot } from 'react-dom/client'; export { DashboardView, Prefs } from '../src/mobile/main.jsx';",
    resolveDir: path.resolve('smoke'), loader: 'jsx',
  },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', target: 'es2022',
  loader: { '.jpg': 'dataurl', '.png': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
  define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.VITE_API_BASE': '"https://api.test"', 'import.meta.env.MODE': '"test"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
  alias: { 'firebase/app': path.resolve('smoke/stub-firebase-app.js'), 'firebase/auth': path.resolve('smoke/stub-firebase-auth.js') },
  plugins: [{ name: 'mobile-view-exports', setup(build) {
    build.onLoad({ filter: /src\/mobile\/main\.jsx$/ }, async ({ path: sourcePath }) => ({
      contents: (await fs.readFile(sourcePath, 'utf8')).replace(/mountApp\(<React\.StrictMode>[\s\S]*?\);\s*$/, 'export { DashboardView, Prefs };'),
      loader: 'jsx', resolveDir: path.dirname(sourcePath),
    }));
  } }],
});
const { React, act, createRoot, DashboardView, Prefs } = await import(`data:text/javascript;base64,${Buffer.from(build.outputFiles[0].text).toString('base64')}`);
const root = createRoot(document.getElementById('root'));
const settle = async () => { await new Promise((resolve) => setTimeout(resolve, 20)); };
const run = async (action) => act(async () => { action(); await settle(); });
const manifestCalls = () => requests.filter(({ url }) => url.pathname.endsWith('/manifest'));
const pageCalls = () => requests.filter(({ url }) => url.pathname.endsWith('/page'));
const cards = () => [...document.querySelectorAll('.m-post-card')].map((node) => node.dataset.contextShortcode);
const poll = () => {
  const timer = [...intervals.values()].find(({ delay }) => delay === 180_000);
  assert.ok(timer, 'Research installs a three-minute refresh');
  timer.callback();
};
const emit = (name) => (name === 'visibilitychange' ? document : window).dispatchEvent(new window.Event(name));

await run(() => root.render(React.createElement(Prefs.Provider, { value: { t: (key) => key } }, React.createElement(DashboardView, { viewer: {} }))));
assert.deepEqual(cards(), ['POST1']);
const originalPages = pageCalls().length;
await run(poll);
assert.equal(manifestCalls().at(-1).options.headers.get('If-None-Match'), '"mobile-refresh-1"');
assert.equal(pageCalls().length, originalPages, 'An unchanged poll does not download historical posts');

visibility = 'hidden';
const beforeHidden = manifestCalls().length;
await run(() => { poll(); emit('visibilitychange'); emit('online'); });
assert.equal(manifestCalls().length, beforeHidden, 'A hidden mobile view does not poll');
posts.push(fixturePost(2));
visibility = 'visible';
await run(() => emit('visibilitychange'));
assert.deepEqual(cards(), ['POST2', 'POST1'], 'Returning to Research inserts the new post first');
assert.equal(pageCalls().at(-1).url.searchParams.get('after_id'), '1', 'Refresh fetches only new source IDs');

pendingManifest = true;
const beforeFlight = manifestCalls().length;
await run(poll);
await run(() => { poll(); emit('online'); emit('visibilitychange'); });
assert.equal(manifestCalls().length, beforeFlight + 1, 'Refresh triggers share one in-flight catalogue read');
await run(() => resolveManifest());
pendingManifest = false;
await run(() => document.querySelector('[data-context-shortcode="POST1"]').click());
assert.match(document.querySelector('.m-post-detail .m-detail-metrics').textContent, /100/);
posts.push(fixturePost(3));
posts[0] = { ...posts[0], likes: 999 };
projectionGeneration += 1;
await run(() => emit('online'));
assert.deepEqual(cards(), ['POST3', 'POST2', 'POST1'], 'Reconnect updates an open Research view');
assert.match(document.querySelector('.m-post-detail p').textContent, /workflow 1/, 'Refresh preserves the selected post');
assert.match(document.querySelector('.m-post-detail .m-detail-metrics').textContent, /999/, 'The open inspector receives refreshed metrics');
posts.shift();
projectionGeneration += 1;
await run(() => emit('online'));
assert.deepEqual(cards(), ['POST3', 'POST2']);
assert.match(document.querySelector('.m-post-detail p').textContent, /workflow 1/, 'An absent catalogue match does not close the open inspector');

pendingManifest = true;
await run(poll);
const pending = manifestCalls().at(-1);
await run(() => root.unmount());
assert.equal(pending.options.signal.aborted, true, 'Leaving Research aborts the current read');
const beforeUnmounted = manifestCalls().length;
await run(() => { emit('online'); emit('visibilitychange'); resolveManifest(); });
assert.equal(manifestCalls().length, beforeUnmounted, 'Unmounted Research removes refresh listeners');
assert.equal(intervals.size, 0, 'Unmounted Research clears its polling timer');
assert.equal(document.getElementById('root').children.length, 0, 'Late responses cannot restore an unmounted Research view');
console.log('PASS mobile Research refresh: conditional polling, bounded deltas, visibility, reconnect, single-flight and unmount cancellation');
dom.window.close();
process.exit(0);
