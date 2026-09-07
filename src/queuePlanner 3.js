export const QUEUE_DAY_START = 0;
export const QUEUE_DAY_END = 24 * 60;
export const QUEUE_CALENDAR_END = 24 * 60;
export const QUEUE_BUFFER_MINUTES = 0;

const DAY_MS = 24 * 60 * 60 * 1000;
const scheduled = (task) => task.status === 'scheduled' && task.designerEmail && task.scheduledDate;
const fixed = (task) => ['in_progress', 'completed', 'closed'].includes(task.status) && task.designerEmail && task.scheduledDate;
export const minutesPerPPOf = (task) => Math.max(1, Number(task?.minutesPerPP || 10));
const durationOf = (task) => {
  const minutesPerPP = minutesPerPPOf(task);
  return Math.max(minutesPerPP, Number(task.durationMinutes || Number(task.productionPoints || 1) * minutesPerPP));
};

function dateValue(value) {
  return Math.floor(Date.parse(`${value}T00:00:00Z`) / DAY_MS);
}

function shiftDate(value, amount) {
  return new Date((dateValue(value) + amount) * DAY_MS).toISOString().slice(0, 10);
}

function absoluteStart(task, anchorDate) {
  return (dateValue(task.scheduledDate) - dateValue(anchorDate)) * QUEUE_CALENDAR_END + Number(task.scheduledStartMinutes || 0);
}

function splitAbsolute(anchorDate, absolute) {
  const dayOffset = Math.floor(absolute / QUEUE_CALENDAR_END);
  return {
    scheduledDate: shiftDate(anchorDate, dayOffset),
    scheduledStartMinutes: absolute - dayOffset * QUEUE_CALENDAR_END,
  };
}

function nextFreeStart(preferred, duration, occupied) {
  let candidate = Math.max(0, Math.round(preferred / 10) * 10);
  while (true) {
    const conflicts = occupied.filter((item) => intervalsConflict(candidate, duration, item.start, item.duration));
    if (!conflicts.length) return candidate;
    candidate = Math.max(...conflicts.map((item) => item.start + item.duration));
    candidate = Math.ceil(candidate / 10) * 10;
  }
}

export function intervalsConflict(start, duration, otherStart, otherDuration, buffer = QUEUE_BUFFER_MINUTES) {
  return start < otherStart + otherDuration + buffer && start + duration + buffer > otherStart;
}

/**
 * Plans the final drop position on an unbounded sequence of 24-hour days.
 * Existing work owns its slot; the dropped request advances to the first
 * collision-free position, including the following day when necessary.
 */
export function planQueueDrop({ tasks, target, designerEmail, scheduledDate, desiredStart, minutesPerPP }) {
  if (!target || target.status === 'in_progress') return { ok: false, error: 'This request cannot be moved.' };
  const targetMinutesPerPP = Math.max(1, Number(minutesPerPP || target.minutesPerPP || 10));
  const assignedTarget = minutesPerPP ? {
    ...target,
    minutesPerPP: targetMinutesPerPP,
    durationMinutes: Number(target.productionPoints || 1) * targetMinutesPerPP,
  } : target;
  const row = tasks.filter((task) => task.id !== target.id && task.designerEmail === designerEmail && (scheduled(task) || fixed(task)));
  const occupied = row.map((task) => ({
    id: task.id,
    start: absoluteStart(task, scheduledDate),
    duration: durationOf(task),
  }));
  const duration = durationOf(assignedTarget);
  const start = nextFreeStart(desiredStart, duration, occupied);
  const position = splitAbsolute(scheduledDate, start);
  const plannedTarget = {
    ...assignedTarget,
    ...position,
    designerEmail,
    durationMinutes: duration,
    status: 'scheduled',
  };
  return { ok: true, tasks: [plannedTarget], target: plannedTarget };
}
