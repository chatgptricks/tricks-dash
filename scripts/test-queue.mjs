import assert from 'node:assert/strict';
import { intervalsConflict, planQueueDrop } from '../src/queuePlanner.js';

assert.equal(intervalsConflict(480, 30, 520, 20), false, 'a 10-minute buffer must fit');
assert.equal(intervalsConflict(480, 30, 519, 20), true, 'a 9-minute buffer must conflict');
const base = { post: { account: 'chatgptricks' }, durationMinutes: 30, priority: 'medium' };
const fixed = { ...base, id: 1, status: 'in_progress', designerEmail: 'pd@example.com', scheduledDate: '2026-09-01', scheduledStartMinutes: 540 };
const movable = { ...base, id: 2, status: 'scheduled', designerEmail: 'pd@example.com', scheduledDate: '2026-09-01', scheduledStartMinutes: 580 };
const target = { ...base, id: 3, status: 'pool' };
const planned = planQueueDrop({ tasks: [fixed, movable], target, designerEmail: 'pd@example.com', scheduledDate: '2026-09-01', desiredStart: 580, notBefore: 480 });
assert.equal(planned.ok, true);
assert.equal(planned.target.scheduledStartMinutes, 580);
assert.equal(planned.tasks.find((task) => task.id === 2).scheduledStartMinutes, 620, 'movable work should reflow after the dropped request');
const impossible = planQueueDrop({ tasks: [], target: { ...target, durationMinutes: 960 }, designerEmail: 'pd@example.com', scheduledDate: '2026-09-01', desiredStart: 500, notBefore: 500 });
assert.equal(impossible.ok, false, 'work that cannot fit in the calendar day must be rejected');
console.log('Queue planner rules passed.');
