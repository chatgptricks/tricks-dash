import assert from 'node:assert/strict';
import { createQueueRefresh } from '../src/queueRefresh.js';

const refresh = createQueueRefresh();
let release;
let reads = 0;
const first = refresh(async () => { reads++; await new Promise(resolve => { release = resolve; }); return 'old'; });
await Promise.resolve();
const second = refresh(async () => { reads++; return 'superseded'; });
const third = refresh(async () => { reads++; return 'current'; });
release();
assert.deepEqual(await Promise.all([first, second, third]), ['current', 'current', 'current']);
assert.equal(reads, 2, 'A burst needs only the running read and one trailing read');
await assert.rejects(refresh(async () => { throw new Error('offline'); }), /offline/);
assert.equal(await refresh(async () => 'recovered'), 'recovered');
console.log('Queue burst coalescing, trailing refresh and failure recovery passed.');
