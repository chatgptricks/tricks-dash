import assert from 'node:assert/strict';
import { runDashboardRead } from '../src/dashboardRead.js';

let readSignal;
await assert.rejects(runDashboardRead(signal => {
  readSignal = signal;
  // Simulate a token refresh or stalled body that ignores cancellation.
  return new Promise(() => {});
}, { timeoutMs: 10 }), { name: 'TimeoutError' });
assert.equal(readSignal.aborted, true, 'Timeout must cancel the underlying network work');
assert.equal(await runDashboardRead(async () => 'fresh catalogue'), 'fresh catalogue', 'A stalled read must not prevent the next read');

const owner = new AbortController();
let cancelRead;
const pending = runDashboardRead(signal => {
  cancelRead = signal;
  return new Promise(() => {});
}, { signal: owner.signal });
await Promise.resolve();
owner.abort();
await assert.rejects(pending, { name: 'AbortError' });
assert.equal(cancelRead.aborted, true, 'Leaving the view must cancel its in-flight read');

let invoked = false;
await assert.rejects(runDashboardRead(() => { invoked = true; }, { signal: owner.signal }), { name: 'AbortError' });
assert.equal(invoked, false, 'A cancelled view must not start more requests');

const failure = new Error('Roster unavailable');
await assert.rejects(runDashboardRead(() => { throw failure; }), error => error === failure);
console.log('PASS dashboard read: hung request deadline, subsequent recovery, parent cancellation, pre-cancelled reads and synchronous failures');
