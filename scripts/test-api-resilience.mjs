import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: "export { apiFetch } from './src/api.js'; export { followQueueLive } from './src/queueLive.js'; export { firebaseAuth } from './src/firebase.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  define: { 'import.meta.env': '{}' },
  plugins: [{
    name: 'isolated-auth',
    setup(builder) {
      builder.onLoad({ filter: /\/src\/firebase\.js$/ }, () => ({
        contents: 'export const firebaseAuth = { currentUser: null };', loader: 'js',
      }));
    },
  }],
});
const { apiFetch, followQueueLive, firebaseAuth } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const delays = [];
globalThis.window = {
  sessionStorage: { getItem: () => null },
  setTimeout(callback, milliseconds) {
    delays.push(milliseconds);
    return setTimeout(callback, 0);
  },
  clearTimeout,
};

let calls = 0;
window.fetch = async () => new Response('', { status: ++calls < 3 ? 503 : 200 });
assert.equal((await apiFetch('https://api.test/read')).status, 200);
assert.equal(calls, 3);

Object.defineProperty(window, 'sessionStorage', {
  configurable: true,
  get() { throw new DOMException('Storage denied.', 'SecurityError'); },
});
calls = 0;
window.fetch = async () => { calls += 1; return new Response(''); };
assert.equal((await apiFetch('https://api.test/read')).status, 200);
assert.equal(calls, 1, 'blocked preference storage must not prevent API requests');
Object.defineProperty(window, 'sessionStorage', { configurable: true, value: { getItem: () => null } });

const tokenNetworkError = Object.assign(new Error('Google is temporarily unreachable.'), { code: 'auth/network-request-failed' });
firebaseAuth.currentUser = { getIdToken: async () => { throw tokenNetworkError; } };
calls = 0;
window.fetch = async () => { calls += 1; return new Response('', { status: 401 }); };
await assert.rejects(apiFetch('https://api.test/read'), (error) => error === tokenNetworkError);
assert.equal(calls, 0, 'a token connection failure must not become an unauthenticated 401 that clears the catalogue');

for (const method of ['GET', 'HEAD']) {
  const tokenCalls = [];
  firebaseAuth.currentUser = { getIdToken: async (force) => {
    tokenCalls.push(force);
    return force ? 'fresh-token' : 'stale-token';
  } };
  const sentTokens = [];
  window.fetch = async (_url, options) => {
    sentTokens.push(options.headers.get('Authorization'));
    return new Response(null, { status: sentTokens.length === 1 ? 401 : 200 });
  };
  assert.equal((await apiFetch('https://api.test/read', { method })).status, 200);
  assert.deepEqual(tokenCalls, [false, true]);
  assert.deepEqual(sentTokens, ['Bearer stale-token', 'Bearer fresh-token'], 'safe reads retry a 401 with a fresh token');
}

let tokenCalls = [];
firebaseAuth.currentUser = { getIdToken: async (force) => { tokenCalls.push(force); return 'token'; } };
calls = 0;
window.fetch = async () => { calls += 1; return new Response('', { status: 401 }); };
assert.equal((await apiFetch('https://api.test/read')).status, 401);
assert.equal(calls, 2, 'a confirmed 401 must reach the access gate after one refresh');
assert.deepEqual(tokenCalls, [false, true]);

tokenCalls = [];
firebaseAuth.currentUser = { getIdToken: async (force) => { tokenCalls.push(force); return 'token'; } };
calls = 0;
window.fetch = async () => new Response('', { status: [401, 503, 401][calls++] });
assert.equal((await apiFetch('https://api.test/read')).status, 401);
assert.equal(calls, 3);
assert.deepEqual(tokenCalls, [false, true], 'gateway recovery must not reset the single authentication retry');

tokenCalls = [];
firebaseAuth.currentUser = { getIdToken: async (force) => {
  tokenCalls.push(force);
  if (force) throw tokenNetworkError;
  return 'stale-token';
} };
calls = 0;
window.fetch = async () => { calls += 1; return new Response('', { status: 401 }); };
await assert.rejects(apiFetch('https://api.test/read'), (error) => error === tokenNetworkError);
assert.equal(calls, 1, 'a failed refresh must preserve the connection error, without replaying a stale token');
assert.deepEqual(tokenCalls, [false, true]);

for (const status of [400, 403, 404]) {
  tokenCalls = [];
  firebaseAuth.currentUser = { getIdToken: async (force) => { tokenCalls.push(force); return 'token'; } };
  calls = 0;
  window.fetch = async () => { calls += 1; return new Response('', { status }); };
  assert.equal((await apiFetch('https://api.test/read')).status, status);
  assert.equal(calls, 1, 'other client errors must not trigger authentication recovery');
  assert.deepEqual(tokenCalls, [false]);
}

for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
  tokenCalls = [];
  firebaseAuth.currentUser = { getIdToken: async (force) => { tokenCalls.push(force); return 'token'; } };
  calls = 0;
  window.fetch = async () => { calls += 1; return new Response('', { status: 401 }); };
  assert.equal((await apiFetch('https://api.test/assign', { method })).status, 401);
  assert.equal(calls, 1, 'authentication recovery must not replay writes');
  assert.deepEqual(tokenCalls, [false]);
}

firebaseAuth.currentUser = null;
calls = 0;
window.fetch = async () => { calls += 1; return new Response('', { status: 401 }); };
assert.equal((await apiFetch('https://api.test/read')).status, 401);
assert.equal(calls, 1, 'a signed-out request must still reach the existing unauthorized gate');

let resolveToken;
firebaseAuth.currentUser = { getIdToken: () => new Promise((resolve) => { resolveToken = resolve; }) };
window.__firebaseIdToken = null;
calls = 0;
const oldTokenRequest = apiFetch('https://api.test/read');
firebaseAuth.currentUser = null;
resolveToken('previous-user-token');
await assert.rejects(oldTokenRequest, { name: 'AbortError' });
assert.equal(calls, 0, 'sign-out during token acquisition must stop the request');
assert.equal(window.__firebaseIdToken, null, 'a late token must not restore the signed-out session');

firebaseAuth.currentUser = { getIdToken: async () => 'first-user-token' };
window.fetch = async () => {
  firebaseAuth.currentUser = { getIdToken: async () => 'second-user-token' };
  return new Response('{}');
};
await assert.rejects(apiFetch('https://api.test/read'), { name: 'AbortError' }, 'late responses must not cross accounts');
firebaseAuth.currentUser = null;

for (const method of ['POST', 'PATCH', 'DELETE']) {
  calls = 0;
  window.fetch = async () => { calls += 1; return new Response('', { status: 503 }); };
  assert.equal((await apiFetch('https://api.test/assign', { method })).status, 503);
  assert.equal(calls, 1, 'mutations must never be replayed');
}

const cancelled = new AbortController();
cancelled.abort();
calls = 0;
await assert.rejects(apiFetch('https://api.test/read', { signal: cancelled.signal }), { name: 'AbortError' });
assert.equal(calls, 0);

for (const status of [401, 403]) {
  calls = 0;
  window.fetch = async () => { calls += 1; return new Response('', { status }); };
  await followQueueLive({ signal: new AbortController().signal });
  assert.equal(calls, 1, 'denied streams must not reconnect indefinitely');
}

calls = 0;
delays.length = 0;
const streamController = new AbortController();
const events = [];
window.fetch = async () => {
  calls += 1;
  if (calls <= 3) return new Response('');
  return new Response('data: {"revision":7,"type":"request_updated"}\n\n');
};
await followQueueLive({
  signal: streamController.signal,
  onEvent(event) { events.push(event); streamController.abort(); },
});
assert.equal(calls, 4);
assert.equal(events[0].revision, 7);
assert.equal(delays.length, 3);
assert.ok(delays[1] > delays[0] && delays[2] > delays[1], 'empty streams must back off');
console.log('API auth recovery, safe retries, mutation protection, cancellation and stream recovery checks passed.');
