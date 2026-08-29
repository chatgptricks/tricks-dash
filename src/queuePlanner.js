export const QUEUE_DAY_START = 8 * 60;
export const QUEUE_DAY_END = 20 * 60;
export const QUEUE_CALENDAR_END = 24 * 60;
export const QUEUE_BUFFER_MINUTES = 10;

const movable = (task) => task.status === 'scheduled' || task.status === 'pool';

export function intervalsConflict(start, duration, otherStart, otherDuration, buffer = QUEUE_BUFFER_MINUTES) {
  return start < otherStart + otherDuration + buffer && start + duration + buffer > otherStart;
}

export function finishesBeforeDeadline(task, scheduledDate, startMinutes) {
  if (!task.deadlineAt) return true;
  const deadline = new Date(task.deadlineAt).getTime();
  const localStart = new Date(`${scheduledDate}T00:00:00-06:00`).getTime() + startMinutes * 60000;
  return Number.isFinite(deadline) && localStart + (task.durationMinutes || 10) * 60000 <= deadline;
}

function candidateStarts(preferred, minimum, maximum) {
  const rounded = Math.round(preferred / 10) * 10;
  const results = [];
  for (let distance = 0; distance <= QUEUE_CALENDAR_END; distance += 10) {
    const earlier = rounded - distance;
    const later = rounded + distance;
    if (earlier >= minimum && earlier <= maximum) results.push(earlier);
    if (distance && later >= minimum && later <= maximum) results.push(later);
  }
  return [...new Set(results)];
}

function findSlot(task, preferred, occupied, scheduledDate, notBefore) {
  const duration = task.durationMinutes || Math.max(10, Number(task.productionPoints || 1) * 10);
  const maximum = QUEUE_CALENDAR_END - duration;
  for (const start of candidateStarts(preferred, Math.max(QUEUE_DAY_START, notBefore), maximum)) {
    if (!finishesBeforeDeadline(task, scheduledDate, start)) continue;
    if (!occupied.some((item) => intervalsConflict(start, duration, item.start, item.duration))) return start;
  }
  return null;
}

/** Plans the complete designer/day row, reflowing movable work around fixed work. */
export function planQueueDrop({ tasks, target, designerEmail, scheduledDate, desiredStart, notBefore = QUEUE_DAY_START }) {
  if (!target || target.status === 'in_progress') return { ok: false, error: 'This request cannot be moved.' };
  const row = tasks.filter((task) => task.designerEmail === designerEmail && task.scheduledDate === scheduledDate && task.id !== target.id);
  const fixed = row.filter((task) => !movable(task)).map((task) => ({ id: task.id, start: Number(task.scheduledStartMinutes), duration: task.durationMinutes || 10 }));
  const targetStart = findSlot(target, desiredStart, fixed, scheduledDate, notBefore);
  if (targetStart === null) return { ok: false, error: 'There is no valid space before this request’s deadline.' };

  const placed = [...fixed, { id: target.id, start: targetStart, duration: target.durationMinutes || 10 }];
  const planned = [{ ...target, designerEmail, scheduledDate, scheduledStartMinutes: targetStart, status: 'scheduled' }];
  const pending = row.filter(movable).sort((a, b) => (a.scheduledStartMinutes ?? QUEUE_DAY_START) - (b.scheduledStartMinutes ?? QUEUE_DAY_START));
  for (const task of pending) {
    const start = findSlot(task, task.scheduledStartMinutes ?? QUEUE_DAY_START, placed, scheduledDate, notBefore);
    if (start === null) return { ok: false, error: `Moving this request leaves no valid space for @${task.post?.account || 'another post'}.` };
    placed.push({ id: task.id, start, duration: task.durationMinutes || 10 });
    planned.push({ ...task, scheduledStartMinutes: start });
  }
  return { ok: true, tasks: planned, target: planned[0] };
}

export function isDeadlineRisk(task, now = new Date()) {
  if (!task?.deadlineAt || ['closed', 'cancelled'].includes(task.status)) return '';
  const deadline = new Date(task.deadlineAt).getTime();
  if (!Number.isFinite(deadline)) return '';
  if (deadline < now.getTime()) return 'overdue';
  const scheduledFinish = task.scheduledDate && task.scheduledStartMinutes != null
    ? new Date(`${task.scheduledDate}T00:00:00-06:00`).getTime() + (task.scheduledStartMinutes + task.durationMinutes) * 60000
    : null;
  if (scheduledFinish && deadline - scheduledFinish <= 60 * 60000) return 'at-risk';
  if (!scheduledFinish && deadline - now.getTime() <= 2 * 60 * 60000) return 'at-risk';
  return '';
}
