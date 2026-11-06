import assert from 'node:assert/strict';
import { audioRootMeanSquare, createEndOfSpeechDetector } from '../src/companion/endOfSpeech.js';

const runSequence = (detector, frames) => frames.map(([rms, now]) => detector.observe(rms, now)).filter(Boolean);
const frames = (from, to, level) => Array.from({ length: Math.floor((to - from) / 40) + 1 }, (_, index) => [typeof level === 'function' ? level(index) : level, from + index * 40]);
const voiced = index => index % 3 === 0 ? 0.022 : 0.04;
{
  const detector = createEndOfSpeechDetector();
  assert.deepEqual(runSequence(detector, frames(40, 11_960, 0)), []);
  assert.equal(detector.observe(0, 12_000), 'empty', 'Pure silence cancels without uploading');
  assert.equal(detector.heardSpeech, false);
  assert.equal(detector.observe(0.08, 12_040), null, 'Finished detectors cannot submit later audio');
}
{
  const detector = createEndOfSpeechDetector();
  assert.deepEqual(runSequence(detector, frames(40, 12_000, 0.012)), ['empty'], 'Steady background energy does not count as a voice onset');
  assert.equal(detector.heardSpeech, false);
}
{
  const detector = createEndOfSpeechDetector();
  const noise = frames(40, 12_000, 0.002).map(([level, now]) => [now % 1000 === 0 ? 0.09 : level, now]);
  assert.deepEqual(runSequence(detector, noise), ['empty'], 'Brief clicks and background hiss do not become a spoken turn');
}
{
  const detector = createEndOfSpeechDetector();
  assert.deepEqual(runSequence(detector, frames(40, 800, voiced)), []);
  assert.equal(detector.heardSpeech, true);
  assert.deepEqual(runSequence(detector, frames(840, 2000, 0.002)), [], 'A 1.2-second thought pause is tolerated');
  assert.deepEqual(runSequence(detector, frames(2040, 2600, voiced)), []);
  assert.deepEqual(runSequence(detector, frames(2640, 3960, 0.002)), []);
  assert.equal(detector.observe(0.002, 4000), 'send', 'The final pause sends after 1.4 seconds');
  assert.equal(detector.observe(0, 4040), null, 'A finished turn sends exactly once');
}
{
  const detector = createEndOfSpeechDetector();
  runSequence(detector, frames(40, 400, voiced));
  detector.cancel();
  assert.equal(detector.observe(0, 5000), null, 'Cancellation cannot be undone by a late silence tick');
}
{
  const detector = createEndOfSpeechDetector();
  assert.equal(detector.observe(0.04, 9000), null);
  assert.equal(detector.heardSpeech, false, 'A throttled timer does not count its long gap as speech');
}
assert.equal(audioRootMeanSquare(new Float32Array()), 0);
assert.equal(audioRootMeanSquare(new Float32Array([0.25, -0.25])), 0.25);
console.log('PASS end of speech: brief pauses, resumed speech, silence, isolated noise, one-shot send, cancellation and throttling');
