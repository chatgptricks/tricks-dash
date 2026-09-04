import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { retryDelay, waitForRetry } from '../src/retry.js';

globalThis.window = globalThis;
const controller = new AbortController();
for (let iteration = 0; iteration < 50; iteration += 1) {
  await waitForRetry(0, controller.signal);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
}
const pending = waitForRetry(60000, controller.signal);
controller.abort();
await assert.rejects(pending, { name: 'AbortError' });
await assert.rejects(waitForRetry(60000, controller.signal), { name: 'AbortError' });
assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
for (let attempt = 0; attempt < 100; attempt += 1) {
  const delay = retryDelay(attempt, 1200, 30000);
  const ceiling = Math.min(30000, 1200 * (2 ** Math.min(attempt, 10)));
  assert.ok(delay >= ceiling * 0.75 && delay <= ceiling);
}
console.log('Retry cancellation, listener cleanup, jitter and backoff checks passed.');
