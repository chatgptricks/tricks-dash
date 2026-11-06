import assert from 'node:assert/strict';
import './companion-end-of-speech.mjs';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://sentientdash.app/companion.html', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MessageEvent', 'localStorage', 'sessionStorage', 'location']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
const hostMessages = [];
globalThis.parent = { postMessage(value) { hostMessages.push(value); } };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const streams = [], recorders = [], players = [], revoked = [], contexts = [];
let micLevel = 0.035;
window.AudioContext = class {
  constructor() { this.state = 'running'; this.nodes = []; contexts.push(this); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  node() { const node = { connected: false, disconnected: false, frequency: { value: 0 }, connect() { this.connected = true; }, disconnect() { this.disconnected = true; }, getFloatTimeDomainData(samples) { this.frames = (this.frames || 0) + 1; samples.fill(micLevel * (this.frames % 3 === 0 ? 0.55 : 1)); } }; this.nodes.push(node); return node; }
  createMediaStreamSource() { return this.node(); }
  createBiquadFilter() { return this.node(); }
  createAnalyser() { return this.node(); }
};
let permission = 'ok', resolvePermission, blockPlayback = false, blobNumber = 0;
const stream = () => { const tracks = [{ stopped: false, stop() { this.stopped = true; } }]; const value = { getTracks: () => tracks }; streams.push(value); return value; };
Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
  if (permission === 'deny') throw new DOMException('Denied', 'NotAllowedError');
  if (permission === 'pending') return new Promise(resolve => { resolvePermission = resolve; });
  return stream();
} } });
globalThis.MediaRecorder = class {
  static isTypeSupported(type) { return type === 'audio/webm;codecs=opus'; }
  constructor(media, options) { this.stream = media; this.mimeType = options?.mimeType || 'audio/mp4'; this.state = 'inactive'; recorders.push(this); }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(['recorded words'], { type: this.mimeType }) }); this.onstop?.(); }); }
};
globalThis.Audio = class {
  constructor() { this.src = ''; this.paused = true; this.played = []; players.push(this); }
  async play() {
    this.played.push(this.src);
    if (this.src.startsWith('blob:') && blockPlayback) { blockPlayback = false; throw new DOMException('Gesture required', 'NotAllowedError'); }
    this.paused = false; this.onplay?.();
  }
  pause() { this.paused = true; this.onpause?.(); }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
};
const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
URL.createObjectURL = () => `blob:voice-${++blobNumber}`;
URL.revokeObjectURL = value => revoked.push(value);
const bundle = await build({ stdin: { contents: `import {act} from 'react'; import {createRoot} from 'react-dom/client'; import {Companion} from './src/companion/Companion.jsx'; import {setLaunchSuppressed} from './src/companion/launch.js';
export {act,setLaunchSuppressed}; let root; const Avatar=({reaction})=><span data-reaction={reaction}/>;
export function mount(props){root=createRoot(document.getElementById('root'));root.render(<Companion {...props} Avatar={Avatar}/>)}
export function unmount(){root.unmount()}`, loader: 'jsx', resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', target: 'es2022', loader: { '.css': 'empty' } });
const app = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const button = label => [...document.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label);
const run = action => app.act(async () => { action(); await new Promise(resolve => setTimeout(resolve, 5)); });
const click = label => run(() => { const node = typeof label === 'string' ? button(label) : label; assert.ok(node, `Missing control: ${label}`); assert.equal(node.disabled, false); node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const type = value => run(() => { const node = document.querySelector('textarea'); Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); });
const calls = [];
let transcript = 'most liked reel', holdTranscription = false, releaseTranscription, holdChat = false, releaseChat;
let answer = { answer: '[View post](https://sentientdash.app/index.html?post=test%3AVOICE) · 500 likes', sources: [], language: 'en' };
const request = async (url, options) => {
  calls.push({ url, options, body: options.body instanceof FormData ? options.body : JSON.parse(options.body) });
  if (url.endsWith('/transcribe')) return holdTranscription ? new Promise(resolve => { releaseTranscription = () => resolve(Response.json({ text: transcript })); }) : Response.json({ text: transcript });
  if (url.endsWith('/speech')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/wav' } });
  return holdChat ? new Promise(resolve => { releaseChat = () => resolve(Response.json(answer)); }) : Response.json(answer);
};
const callsTo = name => calls.filter(call => call.url.endsWith('/' + name));
const allStopped = () => {
  assert.ok(streams.every(value => value.getTracks().every(track => track.stopped)), 'Every acquired microphone track is stopped');
  assert.ok(contexts.every(context => context.state === 'closed' && context.nodes.every(node => node.disconnected)), 'Every analyser and audio context is released');
};
try {
  app.setLaunchSuppressed('voice', true);
  await run(() => app.mount({ session: { uid: 'voice', configured: true }, request, apiBase: 'https://api.test' }));
  assert.equal(streams.length, 0, 'Mounting never acquires the microphone');
  assert.equal(players.length, 0, 'Mounting never autoplays audio');
  await click('Hablar con Sentient');
  permission = 'deny'; await click('Hablar por voz');
  assert.match(document.querySelector('[role="alert"]').textContent, /Permití el micrófono/);
  assert.equal(calls.length, 0, 'Permission denial sends nothing');
  permission = 'pending'; await click('Hablar por voz');
  await click('Cancelar audio');
  await run(() => resolvePermission(stream())); allStopped();
  assert.equal(recorders.length, 0, 'A late permission grant cannot restart a cancelled recording');
  permission = 'ok'; await click('Hablar por voz');
  assert.equal(document.querySelector('[data-reaction]').dataset.reaction, 'attentive');
  await click('Cancelar audio'); allStopped();
  assert.equal(callsTo('transcribe').length, 0, 'Cancelled recordings are never uploaded');

  await click('Usar /research');
  await click('Hablar por voz'); await click('Terminar y enviar audio');
  assert.equal(callsTo('transcribe').at(-1).body.has('language'), false, 'The dashboard language never biases transcription');
  assert.equal(callsTo('transcribe').at(-1).body.get('file').name, 'voice.webm');
  assert.equal(callsTo('chat').at(-1).body.mode, 'research');
  assert.equal(callsTo('chat').at(-1).body.message, '/research most liked reel');
  assert.equal(callsTo('speech').at(-1).body.question, '/research most liked reel');
  assert.equal(callsTo('speech').at(-1).body.text, answer.answer, 'Speech receives the same answer displayed in chat');
  assert.equal(callsTo('speech').at(-1).body.mode, 'research');
  assert.equal(callsTo('speech').at(-1).body.language, 'en', 'The English spoken query receives an English answer even with the Spanish dashboard');
  assert.equal(document.querySelectorAll('.from-assistant .pet-result-pill').length, 1, 'Voice preserves the same inline post pills');
  assert.equal(document.querySelector('[data-reaction]').dataset.reaction, 'greeting');
  assert.ok(players.at(-1).played[0].startsWith('data:audio/wav'), 'User click unlocks the reusable audio element before the API round trips');
  allStopped();
  await click('Detener audio'); assert.ok(players.at(-1).paused); assert.ok(revoked.length);
  await click('Escuchar respuesta');
  await type('another question'); await click('Enviar pregunta');
  assert.ok(players.at(-1).paused, 'A new text question stops the previous audio');
  assert.equal(callsTo('speech').length, 2, 'Text replies stay silent by default');
  await click('Leer respuestas de texto en voz alta');
  await type('read this'); await click('Enviar pregunta');
  assert.equal(callsTo('speech').length, 3, 'The text read-aloud toggle enables speech for new replies');
  await click('Leer respuestas de texto en voz alta');

  await click('Nueva conversación');
  await run(() => window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: parent, data: { source: 'sentient-host', type: 'context', language: 'en', theme: 'light', page: '/index.html' } })));
  answer = { answer: 'For which account?', pending_next: { post_format: 'reel', target_account: null } };
  await type('/next reel'); await click('Send question');
  answer = { answer: '[Recrear este](https://sentientdash.app/index.html?post=rival%3ANEXT) · 8,000 likes', language: 'es' };
  transcript = 'chatgptricks'; blockPlayback = true;
  await click('Ask by voice'); await click('Finish and send audio');
  assert.equal(callsTo('chat').at(-1).body.message, 'chatgptricks', 'A pending /next reply is not rewritten into a fresh slash command');
  assert.equal(callsTo('chat').at(-1).body.mode, 'next');
  assert.deepEqual(callsTo('chat').at(-1).body.next_context, { post_format: 'reel', target_account: null });
  assert.equal(callsTo('chat').at(-1).body.history.at(-1).content, 'For which account?');
  assert.equal(callsTo('transcribe').at(-1).body.has('language'), false);
  assert.equal(callsTo('speech').at(-1).body.language, 'es', 'The answer language also overrides an English dashboard');
  assert.match(document.querySelector('.chat-transcript').textContent, /Tap to listen/);
  const beforeReplay = callsTo('speech').length;
  await click(document.querySelectorAll('.chat-audio-reply button')[1]);
  assert.equal(callsTo('speech').length, beforeReplay, 'Blocked autoplay retries its downloaded audio on a user click');
  assert.equal(document.querySelector('[data-reaction]').dataset.reaction, 'greeting');
  await run(() => players.at(-1).onended());
  assert.notEqual(document.querySelector('[data-reaction]').dataset.reaction, 'greeting');

  await click('New conversation'); holdTranscription = true;
  await click('Ask by voice'); await click('Finish and send audio');
  const transcriptionRequest = callsTo('transcribe').at(-1), chatCount = callsTo('chat').length;
  assert.equal(document.querySelector('[data-reaction]').dataset.reaction, 'working');
  await click('Minimize chat');
  assert.ok(transcriptionRequest.options.signal.aborted);
  await run(() => releaseTranscription());
  assert.equal(callsTo('chat').length, chatCount, 'A late transcription cannot submit after the chat closes'); allStopped();
  holdTranscription = false; await click('Chat with Sentient');
  await click('Ask by voice'); await click('New conversation'); allStopped();

  // A response already in flight may still complete after minimizing, but it
  // must not unexpectedly resume audio after the user closes the chat.
  holdChat = true;
  await click('Ask by voice'); await click('Finish and send audio');
  await click('Minimize chat');
  const beforeClosedReply = callsTo('speech').length;
  await run(() => releaseChat());
  assert.equal(callsTo('speech').length, beforeClosedReply);
  holdChat = false; await click('Chat with Sentient');
  await click('New conversation');
  const beforeLarge = callsTo('transcribe').length;
  await click('Ask by voice');
  await run(() => recorders.at(-1).ondataavailable({ data: { size: 10 * 1024 * 1024 + 1 } }));
  assert.equal(callsTo('transcribe').length, beforeLarge, 'Oversized recordings are stopped before any upload');
  assert.match(document.querySelector('[role="alert"]').textContent, /exceeds 10 MB/); allStopped();
  // Exercise the actual automatic stop with the recording clock advanced.
  const originalNow = Date.now;
  await click('Ask by voice');
  await app.act(async () => { await new Promise(resolve => setTimeout(resolve, 360)); });
  Date.now = () => originalNow() + 61_000;
  try { await app.act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); }); }
  finally { Date.now = originalNow; }
  assert.equal(callsTo('transcribe').length, beforeLarge + 1, 'The one-minute cap automatically stops and sends once'); allStopped();
  await click('New conversation');
  await click('Ask by voice');
  await run(() => app.unmount()); allStopped();
  const beforeMount = callsTo('speech').length;
  await run(() => app.mount({ session: { uid: 'voice', configured: true }, request, apiBase: 'https://api.test' }));
  assert.equal(callsTo('speech').length, beforeMount, 'Loading persisted text history never autoplays replies');
  MediaRecorder.isTypeSupported = type => type === 'audio/mp4';
  await click('Hablar por voz'); await click('Terminar y enviar audio');
  assert.equal(callsTo('transcribe').at(-1).body.get('file').name, 'voice.m4a', 'Safari MP4 recordings use an accepted filename and MIME type');
  assert.equal(callsTo('transcribe').at(-1).body.get('file').type, 'audio/mp4'); allStopped();
  // Exercise the real hook's timer and one-shot upload without waiting out a turn.
  await click('Nueva conversación');
  const beforeAutomatic = callsTo('transcribe').length;
  micLevel = 0.035; await click('Hablar por voz');
  await app.act(async () => { await new Promise(resolve => setTimeout(resolve, 360)); });
  micLevel = 0;
  Date.now = () => originalNow() + 1500;
  try { await app.act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); }); }
  finally { Date.now = originalNow; }
  assert.equal(callsTo('transcribe').length, beforeAutomatic + 1, 'A completed spoken turn automatically uploads once');
  allStopped();
  await click('Nueva conversación');
  const beforeSilence = callsTo('transcribe').length;
  await click('Hablar por voz');
  Date.now = () => originalNow() + 12_100;
  try { await app.act(async () => { await new Promise(resolve => setTimeout(resolve, 80)); }); }
  finally { Date.now = originalNow; }
  assert.equal(callsTo('transcribe').length, beforeSilence, 'An empty recording times out without uploading silence');
  assert.match(document.querySelector('[role="alert"]').textContent, /No detecté palabras/);
  allStopped(); micLevel = 0.035;
  await click('Nueva conversación');
  await run(() => window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: parent, data: { source: 'sentient-host', type: 'context', language: 'en', theme: 'light', page: '/queue.html', pageUrl: 'https://sentientdash.app/queue.html' } })));
  const filters = { query: 'Elon Musk', min_likes: 5001, min_comments: null, accounts: [], from_date: null, to_date: null, sort: 'newest', post_type: 'All posts', promos_only: false, collabs_only: false };
  answer = { answer: 'Here are the matching posts.', ui_actions: [{ type: 'research_filters', filters }] };
  transcript = 'Elon Musk over 5000 likes';
  await click('Use /filter');
  const speechBeforeNavigation = callsTo('speech').length;
  await click('Ask by voice'); await click('Finish and send audio');
  const navigation = hostMessages.findLast(message => message.type === 'research_filters');
  assert.equal(navigation.voiceHandoff.owner, 'voice');
  assert.equal(navigation.voiceHandoff.text, answer.answer);
  assert.equal(navigation.voiceHandoff.mode, 'filter');
  assert.equal(callsTo('speech').length, speechBeforeNavigation, 'Cross-page filters hand narration to the destination instead of starting audio that navigation would interrupt');
  assert.equal(document.querySelector('.companion-chat'), null);
  await run(() => app.unmount());
  // The host writes this only when it actually navigates (covered separately).
  sessionStorage.setItem('sentient.pet.pendingVoice.voice', JSON.stringify({ ...navigation.voiceHandoff, version: 1, expiresAt: Date.now() + 90_000, expectedDest: 'https://sentientdash.app/index.html?q=Elon+Musk&likes=5001&sort=newest&type=All+posts' }));
  blockPlayback = true;
  await run(() => app.mount({ session: { uid: 'voice', configured: true }, request, apiBase: 'https://api.test' }));
  assert.equal(callsTo('speech').length, speechBeforeNavigation, 'Authentication alone does not claim a voice continuation before destination context arrives');
  await run(() => window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: parent, data: { source: 'sentient-host', type: 'context', language: 'en', theme: 'light', page: '/index.html', pageUrl: 'https://sentientdash.app/index.html?q=Elon+Musk&likes=5001' } })));
  assert.equal(callsTo('speech').length, speechBeforeNavigation + 1);
  assert.equal(sessionStorage.getItem('sentient.pet.pendingVoice.voice'), null, 'The destination consumes the one-shot continuation');
  assert.equal(document.querySelector('.companion-chat'), null, 'Voice continuation keeps the chat minimized');
  assert.ok(document.querySelector('.pet-voice-playback'), 'Blocked destination playback exposes a small Listen button beside the bot');
  localStorage.setItem('sentient.pet.voice-choice.voice', JSON.stringify({ voice: null, style: 'Calm and clear.' })); blockPlayback = true;
  await click('Listen to reply');
  assert.equal(callsTo('speech').length, speechBeforeNavigation + 2, 'The floating Listen button rechecks saved style before resuming an old clip');
  assert.equal(callsTo('speech').at(-1).body.style, 'Calm and clear.');
  assert.equal(Object.hasOwn(callsTo('speech').at(-1).body, 'voice'), false, 'A delivery style may accompany the server default voice');
  await click('Listen to reply');
  assert.equal(callsTo('speech').length, speechBeforeNavigation + 2, 'Unchanged voice and style reuse the downloaded floating audio');
  await click('Stop audio');
  assert.equal(document.querySelector('.pet-voice-playback'), null, 'The compact audio control disappears after stopping');
  localStorage.removeItem('sentient.pet.voice-choice.voice');
  await click('Chat with Sentient');
  localStorage.setItem('sentient.pet.voice-choice.voice', 'cedar'); blockPlayback = true;
  await click('Listen to reply');
  assert.equal(callsTo('speech').at(-1).body.voice, 'cedar', 'The bot reads the current owner’s saved voice on its next speech request');
  const beforeChangedVoice = callsTo('speech').length;
  localStorage.setItem('sentient.pet.voice-choice.voice', 'ash');
  await click('Listen to reply');
  assert.equal(callsTo('speech').length, beforeChangedVoice + 1, 'Changing the preference cannot resume a blocked clip generated with the old voice');
  assert.equal(callsTo('speech').at(-1).body.voice, 'ash');
  await click('Stop audio');
  localStorage.setItem('sentient.pet.voice-choice.voice', JSON.stringify({ voice: 'ash', style: 'Warm and lively.' })); blockPlayback = true;
  await click('Listen to reply');
  assert.equal(callsTo('speech').at(-1).body.style, 'Warm and lively.', 'The bot sends the saved style with the selected voice');
  assert.equal(callsTo('speech').at(-1).body.voice, 'ash');
  const beforeChangedStyle = callsTo('speech').length;
  localStorage.setItem('sentient.pet.voice-choice.voice', JSON.stringify({ voice: 'ash', style: 'Slow and calm.' }));
  await click('Listen to reply');
  assert.equal(callsTo('speech').length, beforeChangedStyle + 1, 'A style-only change cannot resume the previous blocked audio');
  assert.equal(callsTo('speech').at(-1).body.style, 'Slow and calm.');
  await click('Stop audio');
  localStorage.removeItem('sentient.pet.voice-choice.voice');
  localStorage.setItem('sentient.pet.voice-choice.someone-else', 'cedar');
  await click('Listen to reply');
  assert.equal(Object.hasOwn(callsTo('speech').at(-1).body, 'voice'), false, 'Reset delegates to the server default without inheriting another owner’s choice');
  assert.equal(Object.hasOwn(callsTo('speech').at(-1).body, 'style'), false, 'Reset omits custom style as well');
  await run(() => app.unmount());
  console.log('PASS companion voice: permissions, cancellation, delayed grants, shared chat/pills, pending /next, localization, audio toggles, autoplay fallback, minimized replies, history and teardown');
} finally {
  URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
  dom.window.close();
}
process.exit(0);
