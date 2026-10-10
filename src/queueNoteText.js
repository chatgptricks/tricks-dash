// HOT routing uses this field too. Only human observations should light up
// the notes indicator; keep additions even on a system-owned request.
const AUTOMATIC_NOTES = new Set([
  'Available as a temporary HOT Pick candidate.',
  'Automatically added to the Queue because this post exceeded 3× its account HOT threshold.',
  'Picked directly from the temporary HOT testing list.',
]);

export function manualQueueNotes(value) {
  if (typeof value !== 'string') return '';
  return value.split(/\r?\n/).filter((line) => !AUTOMATIC_NOTES.has(line.trim())).join('\n').trim();
}
