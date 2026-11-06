import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://sentientdash.app/voice-lab.html', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'localStorage', 'sessionStorage', 'location']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const players = [], revoked = [], created = [];
let block = false;
globalThis.Audio = class {
  constructor() { this.src = ''; this.paused = true; players.push(this); }
  async play() { if (block && this.src.startsWith('blob:')) { block = false; throw new DOMException('Blocked', 'NotAllowedError'); } this.paused = false; this.onplay?.(); }
  pause() { this.paused = true; this.onpause?.(); }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
};
const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
URL.createObjectURL = blob => { const url = 'blob:preview-' + created.length; created.push(blob); return url; };
URL.revokeObjectURL = url => revoked.push(url);
const bundle = await build({ stdin: { contents: `import {act} from 'react'; import {createRoot} from 'react-dom/client'; import {VoiceLab} from './src/voice-lab/VoiceLab.jsx';
export {act}; export * from './src/companion/voicePreference.js'; export {createPreviewPlayer} from './src/voice-lab/previewPlayer.js';
let root; export function render(props){root ||= createRoot(document.getElementById('root'));root.render(<VoiceLab key={props.user?.uid || 'signed-out'} {...props}/>)} export function unmount(){root.unmount();root=null;}`, loader: 'jsx', resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', target: 'es2022' });
const app = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const run = action => app.act(async () => { action(); await new Promise(resolve => setTimeout(resolve, 5)); });
const button = label => [...document.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label || node.textContent === label);
const click = label => run(() => { const node = button(label); assert.ok(node, 'Missing control: ' + label); assert.equal(node.disabled, false); node.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const samples = { results: { en: 'Exact English results demonstration.', es: 'Muestra exacta de resultados en español.' }, next: { en: 'Exact English next-post demonstration.', es: 'Muestra exacta del siguiente post en español.' } };
const catalogue = { voices: app.BOT_VOICES.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1) })), default_voice: 'marin', samples };
const requests = [];
let hold = false, release;
const wav = () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/wav' } });
const request = async (url, options) => {
  requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
  if (url.endsWith('/voices')) return Response.json(catalogue);
  if (hold) return new Promise(resolve => { release = () => resolve(wav()); });
  return wav();
};
const previews = () => requests.filter(item => item.url.endsWith('/voice-preview'));
let props = { user: { uid: 'one' }, request, apiBase: 'https://api.test', language: 'en', onLanguageChange() {}, onSignOut() {} };
try {
  assert.equal(app.writeVoicePreference('', 'cedar'), false);
  assert.equal(app.writeVoicePreference('one', 'invalid'), false);
  assert.equal(app.writeVoicePreference('two', 'cedar'), true);
  assert.equal(app.readVoicePreference('one'), null, 'Voice preferences are owner-scoped');
  localStorage.setItem(app.voicePreferenceKey('one'), 'untrusted-voice');
  assert.equal(app.readVoicePreference('one'), null, 'Unknown persisted voices are ignored');
  await run(() => app.render(props));
  assert.equal(document.querySelectorAll('.voice-card').length, 10);
  assert.match(document.querySelector('.voice-current').textContent, /Marin.*Default/);
  assert.equal(document.querySelector('.voice-sample-text').textContent, '“' + samples.results.en + '”');
  assert.equal(previews().length, 0, 'Opening the lab does not generate previews');
  hold = true;
  await click('Listen Alloy');
  assert.ok(button('Listen Ash').disabled, 'Only one preview can be generated at a time');
  const cancelled = previews().at(-1);
  await click('Stop Alloy');
  assert.ok(cancelled.options.signal.aborted);
  const beforeLate = created.length;
  await run(() => release());
  assert.equal(created.length, beforeLate, 'A cancelled late response cannot create or play audio');
  hold = false; block = true;
  await click('Listen Ash');
  assert.match(document.querySelector('.voice-card:nth-child(2)').textContent, /Tap to play/);
  const requested = previews().length;
  await click('Listen Ash');
  assert.equal(previews().length, requested, 'Autoplay retry reuses the downloaded preview');
  await click('Use this voice: Cedar');
  assert.equal(app.readVoicePreference('one'), 'cedar');
  assert.equal(previews().length, requested, 'Choosing a voice never autoplays or generates audio');
  assert.match(document.querySelector('.voice-choice-notice').textContent, /this browser/);
  await click('Use default voice');
  assert.equal(app.readVoicePreference('one'), null);
  assert.equal(app.readVoicePreference('two'), 'cedar', 'Reset does not affect another account');
  await click('Next post');
  assert.ok(players.at(-1).paused, 'Changing the sample stops the previous preview');
  assert.equal(document.querySelector('.voice-sample-text').textContent, '“' + samples.next.en + '”');
  props = { ...props, language: 'es' }; await run(() => app.render(props));
  assert.equal(document.querySelector('.voice-sample-text').textContent, '“' + samples.next.es + '”');
  await click('Escuchar Cedar');
  assert.deepEqual(previews().at(-1).body, { voice: 'cedar', language: 'es', sample: 'next' });
  const beforeCached = previews().length;
  await click('Detener Cedar'); await click('Escuchar Cedar');
  assert.equal(previews().length, beforeCached, 'Identical voice/language/sample previews reuse their RAM blob');
  props = { ...props, user: { uid: 'two' } }; await run(() => app.render(props));
  assert.ok(players.at(-1).paused, 'Switching accounts stops and disposes the previous player');
  assert.match(document.querySelector('.voice-current').textContent, /Cedar/);
  await click('Escuchar Cedar');
  assert.equal(previews().length, beforeCached + 1, 'Preview cache cannot cross account lifetimes');
  hold = true; await click('Escuchar Alloy');
  const signingOut = previews().at(-1);
  props = { ...props, user: null }; await run(() => app.render(props));
  assert.ok(signingOut.options.signal.aborted);
  assert.equal(document.querySelectorAll('.voice-card').length, 0);
  await run(() => release());
  assert.ok(players.at(-1).paused, 'A response arriving after logout remains silent');
  await run(() => app.unmount());

  // Player-level race: even when a transport ignores abort, switching an
  // in-flight request cannot cache or play the first voice when it arrives.
  const pending = [], states = [];
  const player = app.createPreviewPlayer({ apiBase: 'https://api.test', onChange: value => states.push(value), request: (_url, options) => new Promise(resolve => pending.push({ options, resolve })) });
  const first = player.play({ voice: 'ash', language: 'en', sample: 'results' });
  const second = player.play({ voice: 'cedar', language: 'en', sample: 'results' });
  assert.ok(pending[0].options.signal.aborted);
  pending[1].resolve(wav()); await second;
  const afterWinner = created.length;
  pending[0].resolve(wav()); await first;
  assert.equal(created.length, afterWinner);
  assert.equal(states.at(-1).key, 'cedar:en:results');
  player.dispose(); assert.ok(players.at(-1).paused);
  let retries = 0;
  const recovery = app.createPreviewPlayer({ apiBase: 'https://api.test', onChange() {}, request: async () => { retries++; return retries === 1 ? new Response(null, { status: 429 }) : wav(); } });
  await recovery.play({ voice: 'marin', language: 'en', sample: 'next' });
  assert.equal(retries, 2, 'A briefly busy slot retries once after cancellation'); recovery.dispose();
  assert.ok(revoked.length > 0);
  console.log('PASS Voice Lab: ten API voices, exact bilingual scripts, no background generation, owner choice/reset, preview cache, cancellation/logout, stale races, autoplay recovery and bounded busy retry');
} finally {
  URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
  dom.window.close();
}
process.exit(0);
