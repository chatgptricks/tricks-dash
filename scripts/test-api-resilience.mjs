import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: "export { apiFetch } from './src/api.js'; export { followQueueLive } from './src/queueLive.js';",
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
const { apiFetch, followQueueLive } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
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
console.log('API safe retries, mutation protection, cancellation and stream recovery checks passed.');
