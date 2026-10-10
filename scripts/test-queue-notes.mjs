import assert from 'node:assert/strict';
import { manualQueueNotes } from '../src/queueNoteText.js';

for (const empty of [undefined, null, '', '   \n\t ', false, 0, {}]) {
  assert.equal(manualQueueNotes(empty), '', 'empty or invalid note values cannot signal manual observations');
}

const automaticNotes = [
  'Available as a temporary HOT Pick candidate.',
  'Automatically added to the Queue because this post exceeded 3× its account HOT threshold.',
  'Picked directly from the temporary HOT testing list.',
];
for (const note of automaticNotes) {
  assert.equal(manualQueueNotes(note), '', 'known HOT automation cannot look like a coordinator note');
  assert.equal(manualQueueNotes(`  ${note}  \r\n`), '', 'surrounding whitespace does not turn automated metadata into manual notes');
}
assert.equal(manualQueueNotes(automaticNotes.join('\n')), '', 'combined automated messages do not signal manual observations');

const manual = 'Use the new template.\n\n[Creative reference](https://example.com/brief)';
assert.equal(manualQueueNotes(manual), manual, 'manual instructions and reference links retain their text');
assert.equal(manualQueueNotes(`\n${manual}\n`), manual, 'manual notes can be surrounded by blank lines');
assert.equal(manualQueueNotes(`${automaticNotes[1]}\r\n${manual}`), manual, 'manual additions survive when a generated note occupies its own line');
assert.equal(manualQueueNotes(`${manual}\n${automaticNotes[0]}`), manual, 'manual observations survive even when automated text follows them');

const sameLineAddition = `${automaticNotes[2]} Use a blue cover.`;
assert.equal(manualQueueNotes(sameLineAddition), sameLineAddition, 'a human addition on the same line must never be stripped');
assert.equal(manualQueueNotes('This HOT post needs a stronger hook.'), 'This HOT post needs a stronger hook.', 'mentioning HOT does not make a manual note automatic');

console.log('Queue manual note classification passed.');
