import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('', { url: 'https://sentientdash.app/index.html' });
globalThis.location = dom.window.location;
globalThis.sessionStorage = dom.window.sessionStorage;
const bundle = await build({ entryPoints: ['src/companion/voiceHandoff.js'], bundle: true, format: 'esm', write: false });
const { claimVoiceHandoff, clearVoiceHandoff, voiceHandoffKey } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const now = 100_000;
const expectedDest = 'https://sentientdash.app/index.html?q=Elon+Musk&likes=5001&sort=newest&type=All+posts';
const speech = { version: 1, owner: 'owner-one', id: 'reply-one', text: 'Here are the filtered posts.', question: '/filter Elon Musk over 5000 likes', language: 'en', mode: 'filter', expectedDest, expiresAt: now + 90_000 };
const put = value => sessionStorage.setItem(voiceHandoffKey('owner-one'), JSON.stringify(value));
put(speech);
assert.equal(claimVoiceHandoff('owner-two', expectedDest, now), null, 'Another signed-in user cannot claim private narration');
assert.ok(sessionStorage.getItem(voiceHandoffKey('owner-one')));
const packed = Buffer.from(JSON.stringify({ q: 'Elon Musk', likes: '5001' })).toString('base64url');
assert.deepEqual(claimVoiceHandoff('owner-one', 'https://sentientdash.app/index.html?r=' + packed, now), { id: speech.id, text: speech.text, question: speech.question, language: speech.language, mode: speech.mode }, 'Canonical packed filter URLs match the exact destination filters');
assert.equal(claimVoiceHandoff('owner-one', expectedDest, now), null, 'A continuation is claimed once');
for (const [label, changes, actual] of [
  ['expired', { expiresAt: now }, expectedDest],
  ['unbounded expiry', { expiresAt: now + 90_001 }, expectedDest],
  ['wrong owner', { owner: 'owner-two' }, expectedDest],
  ['different filters', {}, 'https://sentientdash.app/index.html?q=Other'],
  ['different tool', {}, 'https://sentientdash.app/queue.html'],
  ['foreign destination', { expectedDest: 'https://other.test/index.html' }, expectedDest],
  ['invalid mode', { mode: 'delete' }, expectedDest],
]) {
  put({ ...speech, ...changes });
  assert.equal(claimVoiceHandoff('owner-one', actual, now), null, label);
  assert.equal(sessionStorage.getItem(voiceHandoffKey('owner-one')), null, `${label}: invalid continuation is removed`);
}
put(speech); clearVoiceHandoff('owner-one');
assert.equal(claimVoiceHandoff('owner-one', expectedDest, now), null, 'Explicit cancel/logout removes the pending voice');
put(speech);
const originalStorage = globalThis.sessionStorage;
globalThis.sessionStorage = { getItem: key => originalStorage.getItem(key), removeItem() { throw new Error('blocked'); } };
assert.equal(claimVoiceHandoff('owner-one', expectedDest, now), null, 'Read-only storage cannot replay a continuation it cannot consume');
globalThis.sessionStorage = originalStorage;
dom.window.close();
console.log('PASS voice handoff: owner isolation, exact/canonical destination, TTL, one-shot consumption, cancellation and unavailable storage');
