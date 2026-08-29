import assert from 'node:assert/strict';
import { intervalsConflict, planQueueDrop } from '../src/queuePlanner.js';

assert.equal(intervalsConflict(480, 30, 510, 20), false, 'adjacent blocks must be allowed');
assert.equal(intervalsConflict(480, 31, 510, 20), true, 'one shared minute must conflict');

const base = { post: { account: 'chatgptricks' }, durationMinutes: 30, priority: 'medium' };
const active = { ...base, id: 1, status: 'in_progress', designerEmail: 'pd@example.com', scheduledDate: '2026-09-01', scheduledStartMinutes: 540 };
const scheduled = { ...base, id: 2, status: 'scheduled', designerEmail: 'pd@example.com', scheduledDate: '2026-09-01', scheduledStartMinutes: 570 };
const target = { ...base, id: 3, status: 'pool' };

const afterActive = planQueueDrop({ tasks: [active], target, designerEmail: 'pd@example.com', scheduledDate: '2026-09-01', desiredStart: 550 });
assert.equal(afterActive.ok, true);
assert.equal(afterActive.target.scheduledStartMinutes, 570, 'a new block must move after in-progress work');

const afterChain = planQueueDrop({ tasks: [active, scheduled], target, designerEmail: 'pd@example.com', scheduledDate: '2026-09-01', desiredStart: 550 });
assert.equal(afterChain.ok, true);
assert.equal(afterChain.target.scheduledStartMinutes, 600, 'the dropped block must advance past every collision');

const overnight = planQueueDrop({
  tasks: [{ ...active, scheduledStartMinutes: 1430, durationMinutes: 30 }],
  target,
  designerEmail: 'pd@example.com',
  scheduledDate: '2026-09-01',
  desiredStart: 1430,
});
assert.equal(overnight.ok, true, 'the next day must always remain available');
assert.equal(overnight.target.scheduledDate, '2026-09-02');
assert.equal(overnight.target.scheduledStartMinutes, 20);

const nextDayOccupied = planQueueDrop({
  tasks: [
    { ...active, scheduledStartMinutes: 1430, durationMinutes: 30 },
    { ...scheduled, scheduledDate: '2026-09-02', scheduledStartMinutes: 20 },
  ],
  target,
  designerEmail: 'pd@example.com',
  scheduledDate: '2026-09-01',
  desiredStart: 1430,
});
assert.equal(nextDayOccupied.target.scheduledDate, '2026-09-02');
assert.equal(nextDayOccupied.target.scheduledStartMinutes, 50, 'cross-day collisions must also advance');

console.log('Queue planner rules passed.');
