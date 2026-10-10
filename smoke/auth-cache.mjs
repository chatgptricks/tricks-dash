import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://sentientdash.app/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'localStorage']) {
  globalThis[key] = dom.window[key];
}
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
globalThis.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const makeUser = (email) => ({ uid: email, email, getIdToken: async () => email });
globalThis.__authCacheTest = { auth: { currentUser: makeUser('denied@example.test') }, listeners: new Set(), failSignOut: false };
const authStub = `
export function getAuth() { return globalThis.__authCacheTest.auth; }
export class GoogleAuthProvider { setCustomParameters() {} }
export const browserPopupRedirectResolver = {};
export const browserLocalPersistence = {};
export function setPersistence() { return Promise.resolve(); }
export function getRedirectResult() { return Promise.resolve(null); }
export function onAuthStateChanged(auth, callback) {
  globalThis.__authCacheTest.listeners.add(callback);
  callback(auth.currentUser);
  return () => globalThis.__authCacheTest.listeners.delete(callback);
}
export function signInWithPopup() { return Promise.resolve(); }
export function signInWithRedirect() { return Promise.resolve(); }
export async function signOut(auth) {
  if (globalThis.__authCacheTest.failSignOut) throw new Error('Sign-out unavailable.');
  auth.currentUser = null;
  for (const callback of globalThis.__authCacheTest.listeners) callback(null);
}
`;

const stored = new Map();
let cacheReads = 0;
window.caches = {
  async match(key, { cacheName }) { cacheReads += 1; const raw = stored.get(`${cacheName}:${key}`); return raw ? new Response(raw) : undefined; },
  async open(name) { return {
    async put(key, response) { stored.set(`${name}:${key}`, await response.text()); },
    async delete(key) { return stored.delete(`${name}:${key}`); },
  }; },
};
let accessTimeout;
const originalTimeout = window.setTimeout.bind(window);
window.setTimeout = (callback, delay, ...args) => {
  if (delay === 30_000) accessTimeout = callback;
  return originalTimeout(callback, delay === 30_000 ? delay : Math.min(delay, 10), ...args);
};
const accessRoutes = new Map();
const requestCounts = new Map();
let latePageResponse;
const ok = (body) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
window.fetch = globalThis.fetch = async (url, options = {}) => {
  const endpoint = new URL(url).pathname;
  const email = new Headers(options.headers).get('Authorization')?.replace('Bearer ', '') || '';
  requestCounts.set(endpoint, (requestCounts.get(endpoint) || 0) + 1);
  if (endpoint === '/api/dashboard/me') return accessRoutes.get(email)?.() || ok({ operating_role: 'sales' });
  if (endpoint === '/api/dashboard/posts/manifest') return email === 'late@example.test'
    ? ok({ revision: 'late-page', sources: [{ source: 'canonical', upperBound: 1 }] })
    : new Response(null, { status: 304 });
  if (endpoint === '/api/dashboard/posts/page' && email === 'late@example.test') return { ok: true, status: 200, json: () => latePageResponse };
  if (endpoint === '/api/dashboard/accounts') return ok({ accounts: [{ handle: 'ours', label: 'Ours', group: 'sentient', active: true }] });
  if (endpoint === '/api/dashboard/lists') return ok({ lists: [] });
  return ok({});
};
const bundle = await build({
  stdin: {
    contents: `import { act } from 'react'; import { createRoot } from 'react-dom/client'; import App from './src/App.jsx';
      export { act }; export { writeDashboardSnapshot, readDashboardSnapshot } from './src/dashboardCache.js';
      let root; export function mount() { root = createRoot(document.getElementById('root')); root.render(<App />); }
      export function unmount() { root.unmount(); }`,
    resolveDir: process.cwd(), loader: 'jsx',
  },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', target: 'es2022',
  loader: { '.jpg': 'dataurl', '.png': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
  define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.VITE_API_BASE': '"https://api.test"', 'import.meta.env.MODE': '"test"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
  alias: { 'firebase/app': path.resolve('smoke/stub-firebase-app.js') },
  plugins: [{ name: 'controlled-auth', setup(builder) {
    builder.onResolve({ filter: /^firebase\/auth$/ }, () => ({ path: 'firebase/auth', namespace: 'controlled-auth' }));
    builder.onLoad({ filter: /.*/, namespace: 'controlled-auth' }, () => ({ contents: authStub, loader: 'js' }));
  } }],
});
const app = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const snapshot = (shortcode) => ({
  catalogueComplete: true, catalogueRevision: 'auth-cache-test', catalogueSources: [{ source: 'canonical', upperBound: 1 }],
  accounts: [{ handle: 'ours', label: 'Ours', group: 'sentient', active: true }], summary: {},
  posts: [{ account: 'ours', shortcode, caption: 'Private cached content', excerpt: 'Private cached content', likes: 10, comments: 1, postDate: '2026-09-20T12:00:00Z', type: 'Image' }],
});
for (const [email, shortcode] of [['denied@example.test', 'DENIED_PRIVATE'], ['a@example.test', 'A_PRIVATE'], ['b@example.test', 'B_PRIVATE'], ['retry@example.test', 'RETRY_PRIVATE']]) {
  stored.set(`sentient-complete-library-v2:/__sentient_complete_library_v2__/${encodeURIComponent(email)}`, JSON.stringify({ ...snapshot(shortcode), owner: email }));
}
const view = document.getElementById('root');
const card = (shortcode) => view.querySelector(`[data-context-shortcode="${shortcode}"]`);
const flush = () => app.act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
const switchTo = (email) => app.act(async () => {
  const user = email ? makeUser(email) : null;
  globalThis.__authCacheTest.auth.currentUser = user;
  for (const callback of globalThis.__authCacheTest.listeners) callback(user);
});
const button = (label) => [...view.querySelectorAll('button')].find((node) => node.textContent === label);
const click = (node) => app.act(async () => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
const deferAccess = (email) => {
  let resolve;
  const response = new Promise((done) => { resolve = done; });
  accessRoutes.set(email, () => response);
  return async (status = 200) => {
    accessRoutes.set(email, () => status === 200 ? ok({ operating_role: 'sales' }) : new Response('', { status }));
    await app.act(async () => resolve(status === 200 ? ok({ operating_role: 'sales' }) : new Response('', { status })));
    await flush();
  };
};

try {
  const deny = deferAccess('denied@example.test');
  await app.act(async () => app.mount());
  assert.match(view.textContent, /Checking workspace access/);
  assert.equal(cacheReads, 0, 'private storage must not be read before server authorization');
  await deny(403);
  assert.match(view.textContent, /isn’t authorized/);
  assert.equal(card('DENIED_PRIVATE'), null);
  assert.equal(cacheReads, 0, 'denied access must never fall back to cache');

  const allowA = deferAccess('a@example.test');
  await switchTo('a@example.test');
  assert.equal(view.querySelector('.product-header'), null, 'account changes must remove prior workspace UI immediately');
  await allowA();
  assert.ok(card('A_PRIVATE'), 'authorized account restores its own snapshot');
  assert.equal(requestCounts.get('/api/dashboard/posts/page') || 0, 0, 'authorized cache restoration must retain its fast 304 path');

  const allowB = deferAccess('b@example.test');
  await switchTo('b@example.test');
  assert.equal(card('A_PRIVATE'), null, 'the prior account must disappear while a new account is checked');
  assert.equal(view.querySelector('.product-header'), null);
  await click(button('Sign out'));
  await allowB();
  assert.match(view.textContent, /Sign in with Google/);
  assert.equal(card('B_PRIVATE'), null, 'late authorization cannot reopen Research after sign-out');
  assert.equal(await app.readDashboardSnapshot('a@example.test'), null, 'switching accounts clears the prior cache');

  const allowRetry = deferAccess('retry@example.test');
  await switchTo('retry@example.test');
  await app.act(async () => accessTimeout());
  assert.match(view.textContent, /timed out/);
  assert.ok(button('Try again'), 'a hung authorization request must have a retry path');
  await allowRetry();
  assert.equal(card('RETRY_PRIVATE'), null, 'timed-out responses cannot authorize the workspace later');
  await click(button('Try again'));
  await flush();
  assert.ok(card('RETRY_PRIVATE'), 'retry recovers with the current user’s cache');

  const signOutFailure = deferAccess('other@example.test');
  await switchTo('other@example.test');
  globalThis.__authCacheTest.failSignOut = true;
  await click(button('Sign out'));
  assert.match(view.textContent, /Could not sign out/);
  assert.ok(button('Try again'), 'failed sign-out must not strand the user in a checking screen');
  await signOutFailure(403);
  assert.match(view.textContent, /Could not sign out/, 'a superseded access response must not replace the sign-out failure');
  globalThis.__authCacheTest.failSignOut = false;
  await click(button('Sign out'));
  assert.match(view.textContent, /Sign in with Google/);

  await app.writeDashboardSnapshot(snapshot('ERROR_PRIVATE'), 'error@example.test');
  accessRoutes.set('error@example.test', () => new Response('', { status: 503 }));
  await switchTo('error@example.test');
  await app.act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
  assert.match(view.textContent, /could not connect/);
  assert.equal(card('ERROR_PRIVATE'), null, 'a failed access check must not restore private data');
  accessRoutes.set('error@example.test', () => ok({ operating_role: 'sales' }));
  await click(button('Try again'));
  await flush();
  assert.ok(card('ERROR_PRIVATE'), 'a transient access failure recovers on retry');

  const capabilityEmail = 'capabilities@example.test';
  const deniedCapabilities = { is_dev: false, is_admin: false, can_role_switch: false, operating_role: 'sales', operating_roles: ['sales'] };
  accessRoutes.set(capabilityEmail, () => ok(deniedCapabilities));
  window.sessionStorage.setItem('sentient.queueRolePreview', 'admin');
  await switchTo(capabilityEmail);
  await flush();
  assert.equal(view.querySelector('.dev-role-preview'), null, 'identity alone must not grant developer or role-switching controls');
  assert.equal(view.querySelector('.product-nav a[href="/insights.html"]'), null, 'an unassigned stored role must not elevate the workspace UI');
  window.sessionStorage.removeItem('sentient.queueRolePreview');
  accessRoutes.set(capabilityEmail, () => ok({ ...deniedCapabilities, is_dev: true }));
  await switchTo(capabilityEmail);
  await flush();
  await click(view.querySelector('.dev-role-preview > button'));
  assert.deepEqual([...view.querySelectorAll('.dev-role-preview select option')].map((option) => option.value), ['', 'sales', 'pd', 'vc', 'trainee', 'admin'], 'server-granted developer access permits all operating-role previews');
  accessRoutes.set(capabilityEmail, () => ok({ ...deniedCapabilities, can_role_switch: true, available_operating_roles: ['pd', 'vc'] }));
  await switchTo(capabilityEmail);
  await flush();
  await click(view.querySelector('.dev-role-preview > button'));
  assert.deepEqual([...view.querySelectorAll('.dev-role-preview select option')].map((option) => option.value), ['', 'pd', 'vc'], 'non-developers can preview only their server-assigned roles');
  accessRoutes.set(capabilityEmail, () => ok(deniedCapabilities));
  await switchTo(capabilityEmail);
  await flush();
  assert.equal(view.querySelector('.dev-role-preview'), null, 'revoked server capabilities must not persist for the same identity');

  let finishLatePage;
  latePageResponse = new Promise((resolve) => { finishLatePage = resolve; });
  await switchTo('late@example.test');
  await flush();
  assert.ok(requestCounts.get('/api/dashboard/posts/page'), 'the cold catalogue response is waiting on JSON parsing');
  await app.act(async () => {
    globalThis.__authCacheTest.auth.currentUser = null;
    for (const callback of globalThis.__authCacheTest.listeners) callback(null);
    finishLatePage({ revision: 'late-page', posts: snapshot('LATE_PRIVATE').posts, done: true, nextCursor: 1 });
    // Resolve the JSON/catalogue chain before React flushes passive unmount
    // effects: the synchronous session guard must already reject this write.
    for (let index = 0; index < 20; index += 1) await Promise.resolve();
  });
  assert.equal(await app.readDashboardSnapshot('late@example.test'), null, 'late JSON must not recreate a signed-out cache before React cleanup');
  assert.equal(card('LATE_PRIVATE'), null);
  console.log('Research authorization, denied cache, account switching, server capabilities, timeout retry, sign-out and late-response checks passed.');
} finally {
  await app.act(async () => app.unmount());
  dom.window.close();
}

process.exit(0);
