export const QUEUE_DAY_START = 8 * 60;
export const QUEUE_DAY_END = 20 * 60;
export const QUEUE_CALENDAR_END = 24 * 60;
export const QUEUE_BUFFER_MINUTES = 10;
const LAST_START_SLOT = QUEUE_CALENDAR_END - 10;

const movable = (task) => task.status === 'scheduled' || task.status === 'pool';

export function intervalsConflict(start, duration, otherStart, otherDuration, buffer = QUEUE_BUFFER_MINUTES) {
  return start < otherStart + otherDuration + buffer && start + duration + buffer > otherStart;
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

function findSlot(task, preferred, occupied, notBefore) {
  const duration = task.durationMinutes || Math.max(10, Number(task.productionPoints || 1) * 10);
  for (const start of candidateStarts(preferred, Math.max(QUEUE_DAY_START, notBefore), LAST_START_SLOT)) {
    if (!occupied.some((item) => intervalsConflict(start, duration, item.start, item.duration))) return start;
  }
  return null;
}

function fallbackStart(preferred, notBefore) {
  const rounded = Math.round(preferred / 10) * 10;
  return Math.min(LAST_START_SLOT, Math.max(QUEUE_DAY_START, notBefore, rounded));
}

/** Plans the complete designer/day row, reflowing movable work around fixed work. */
export function planQueueDrop({ tasks, target, designerEmail, scheduledDate, desiredStart, notBefore = QUEUE_DAY_START }) {
  if (!target || target.status === 'in_progress') return { ok: false, error: 'This request cannot be moved.' };
  const row = tasks.filter((task) => task.designerEmail === designerEmail && task.scheduledDate === scheduledDate && task.id !== target.id);
  const fixed = row.filter((task) => !movable(task)).map((task) => ({ id: task.id, start: Number(task.scheduledStartMinutes), duration: task.durationMinutes || 10 }));
  // Capacity must never block an assignment. Prefer a free slot, including a
  // start late enough for the block to run past midnight; if the row is fully
  // occupied, keep the requested position and allow visual overlap.
  const targetStart = findSlot(target, desiredStart, fixed, notBefore) ?? fallbackStart(desiredStart, notBefore);

  const placed = [...fixed, { id: target.id, start: targetStart, duration: target.durationMinutes || 10 }];
  const planned = [{ ...target, designerEmail, scheduledDate, scheduledStartMinutes: targetStart, status: 'scheduled' }];
  const pending = row.filter(movable).sort((a, b) => (a.scheduledStartMinutes ?? QUEUE_DAY_START) - (b.scheduledStartMinutes ?? QUEUE_DAY_START));
  for (const task of pending) {
    const preferred = task.scheduledStartMinutes ?? QUEUE_DAY_START;
    const start = findSlot(task, preferred, placed, notBefore) ?? fallbackStart(preferred, notBefore);
    placed.push({ id: task.id, start, duration: task.durationMinutes || 10 });
    planned.push({ ...task, scheduledStartMinutes: start });
  }
  return { ok: true, tasks: planned, target: planned[0] };
}
