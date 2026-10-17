import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import * as esbuild from 'esbuild';

const route = Buffer.from(JSON.stringify({ tab: 'tracker', acc: 'alpha' })).toString('base64url');
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: `https://sentientdash.app/mobile/?r=${route}`, pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'history', 'location', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'localStorage', 'sessionStorage']) {
  if (dom.window[key] !== undefined) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const pending = deferred(), staleDetail = deferred();
let summaries = 0, details = 0, posts = 0, cancelledSignal;
const counts = (followers, growth) => ({ accounts: [{ handle: 'alpha', group: 'sentient', followers, delta_1d: { delta: growth } }] });
const detail = followers => ({ handle: 'alpha', followers_history: [{ date: '2026-10-16', followers: 100 }, { date: '2026-10-18T01:00:00Z', followers, followers_gained: followers - 100 }], engagement_weekly: [] });
let mode = 'initial';
window.fetch = async (input, options = {}) => {
  const url = new URL(input);
  if (options.method === 'POST') {
    posts++;
    if (mode === 'initial') assert.equal(url.pathname, '/api/tracker/accounts/alpha/refresh', 'Reload with an account selected only refreshes that account');
    return Response.json({ job_id: `refresh-${posts}`, status: 'queued' });
  }
  if (url.pathname.endsWith('/summary')) return Response.json(++summaries === 1 ? counts(101, 1) : counts(125, 25));
  if (url.pathname.includes('/refresh-jobs/')) {
    if (mode === 'initial') return pending.promise;
    if (mode === 'partial') return Response.json({ status: 'done', result: { snapshotted: ['alpha'], failed: { beta: 'Unavailable' } } });
    cancelledSignal = options.signal;
    return new Promise(() => {});
  }
  if (url.pathname.endsWith('/accounts/alpha')) return ++details === 1 ? staleDetail.promise : Response.json(detail(125));
  throw new Error(`Unexpected request: ${url.pathname}`);
};
const build = await esbuild.build({
  stdin: { contents: "export { default as React, act } from 'react'; export { createRoot } from 'react-dom/client'; export { TrackerView, Prefs } from '../src/mobile/main.jsx';", resolveDir: path.resolve('smoke'), loader: 'jsx' },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', target: 'es2022',
  loader: { '.jpg': 'dataurl', '.png': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
  define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.VITE_API_BASE': '"https://api.test"', 'import.meta.env.MODE': '"test"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
  alias: { 'firebase/app': path.resolve('smoke/stub-firebase-app.js'), 'firebase/auth': path.resolve('smoke/stub-firebase-auth.js') },
  plugins: [{ name: 'mobile-tracker-exports', setup(build) { build.onLoad({ filter: /src\/mobile\/main\.jsx$/ }, async ({ path: sourcePath }) => ({ contents: (await fs.readFile(sourcePath, 'utf8')).replace(/mountApp\(<React\.StrictMode>[\s\S]*?\);\s*$/, 'export { TrackerView, Prefs };'), loader: 'jsx', resolveDir: path.dirname(sourcePath) })); } }],
});
const { React, act, createRoot, TrackerView, Prefs } = await import(`data:text/javascript;base64,${Buffer.from(build.outputFiles[0].text).toString('base64')}`);
const root = createRoot(document.getElementById('root'));
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 20)); };
const run = async action => act(async () => { action(); await settle(); });
const realWait = window.SentientTrackerRefresh.wait;
window.SentientTrackerRefresh.wait = (job, options) => realWait(job, { ...options, delay: async () => {} });
await run(() => root.render(React.createElement(Prefs.Provider, { value: { t: key => key, language: 'en' } }, React.createElement(TrackerView))));
assert.equal(posts, 1);
assert.equal(summaries, 1, 'Mobile retains saved data until job actually finishes');
assert.equal(document.querySelector('.m-tracker-refresh button').disabled, true);
assert.match(document.querySelector('.m-tracker-refresh').textContent, /Checking followers/);
await run(() => document.querySelector('.m-tracker-refresh button').click());
assert.equal(posts, 1, 'Repeated tap does not enqueue another job');
await run(() => pending.resolve(Response.json({ status: 'done', result: { handle: 'alpha', followers_count: 125 } })));
assert.equal(summaries, 2);
assert.match(document.querySelector('.m-tracker-open strong').textContent, /125\+25/, 'Mobile reloads growth together with followers');
assert.match(document.querySelector('.m-detail-account').textContent, /125/);
assert.match(document.querySelector('.m-history-list').textContent, /Oct 17, 2026/, 'UTC evening reading stays on the Costa Rica calendar day');
await run(() => staleDetail.resolve(Response.json(detail(101))));
assert.match(document.querySelector('.m-detail-account').textContent, /125/, 'Late initial account read cannot overwrite the fresh detail');
assert.doesNotMatch(document.querySelector('.m-detail-account').textContent, /101/);
assert.match(document.querySelector('.m-tracker-refresh').textContent, /Followers for @alpha updated/);
assert.equal(document.querySelector('.m-detail-account button').disabled, false);
mode = 'partial';
await run(() => document.querySelector('.m-tracker-refresh button').click());
assert.match(document.querySelector('.m-tracker-refresh [role="alert"]').textContent, /@beta/);
assert.ok([...document.querySelectorAll('.m-tracker-refresh button')].some(button => button.textContent === 'retry'));
mode = 'unmount';
await run(() => document.querySelector('.m-tracker-refresh button').click());
assert.ok(cancelledSignal);
await run(() => root.unmount());
assert.equal(cancelledSignal.aborted, true, 'Unmount cancels pending polling/read and leaves server refresh running');
dom.window.close();
console.log('PASS Mobile Tracker refresh: queued job, selected reload, progress, fresh growth/history, stale detail races, Costa Rica dates, partial failure, single-flight and unmount cancellation');
process.exit(0);
