import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://sentientdash.app/companion.html', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MessageEvent', 'localStorage', 'sessionStorage', 'location', 'parent']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const bundle = await build({ stdin: { contents: `import {act} from 'react'; import {createRoot} from 'react-dom/client'; import {Companion} from './src/companion/Companion.jsx';
export {act}; let root; const Avatar=({reaction,unread})=><span data-reaction={reaction} data-unread={unread}/>;
export function mount(props){root=createRoot(document.getElementById('root'));root.render(<Companion {...props} Avatar={Avatar}/>)}
export function unmount(){root.unmount()}`, loader: 'jsx', resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', target: 'es2022' });
const app = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const button = label => [...document.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label || node.textContent.includes(label));
const click = node => app.act(async () => node.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const flush = () => app.act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
let pending, calls = [];
const request = (_url, options) => new Promise((resolve, reject) => {
  calls.push(JSON.parse(options.body)); pending = resolve;
  options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
});
try {
  await app.act(async () => app.mount({ session: { uid: 'one', configured: true }, request, apiBase: 'https://api.example.test' }));
  assert.ok(button('Hablar con Sentient'));
  await click(button('Hablar con Sentient'));
  await click(button('¿Qué tengo pendiente hoy?'));
  assert.equal(calls.length, 1); assert.equal(calls[0].language, 'es');
  assert.equal(document.querySelector('[data-reaction]').dataset.reaction, 'thinking');
  await click(button('Minimizar chat'));
  await app.act(async () => pending(new Response(JSON.stringify({ answer: '<script>bad()</script> Tres tareas pendientes.', sources: [{ label: 'Queue', endpoint: '/api/queue/requests', url: 'https://sentientdash.app/queue.html' }, { label: 'unsafe', url: 'javascript:alert(1)' }] }), { headers: { 'Content-Type': 'application/json' } })));
  assert.equal(document.querySelector('[data-unread]').dataset.unread, '1');
  await click(button('Hablar con Sentient'));
  assert.equal(document.querySelectorAll('.chat-transcript script').length, 0);
  assert.match(document.querySelector('.chat-transcript').textContent, /<script>bad/);
  assert.equal(document.querySelectorAll('.chat-sources a').length, 1);
  assert.equal(document.querySelector('[data-unread]').dataset.unread, '0');
  await click(button('Ocultar mascota'));
  assert.equal(localStorage.getItem('sentient.pet.enabled.one'), 'false');
  await click(button('Mostrar mascota'));
  await click(button('Nueva conversación'));
  await click(button('¿Cómo uso esta pantalla?'));
  await click(button('Detener respuesta'));
  assert.match(document.querySelector('[role="alert"]').textContent, /detenida/);
  await click(button('Nueva conversación'));
  await app.act(async () => window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: parent, data: { source: 'sentient-host', type: 'context', language: 'en', theme: 'light', page: '/tracker.html' } })));
  assert.ok(button('How do I use this screen?'));
  await click(button('How do I use this screen?'));
  assert.equal(calls.at(-1).page, '/tracker.html');
  await app.act(async () => pending(new Response('{}', { status: 503 })));
  assert.match(document.querySelector('[role="alert"]').textContent, /couldn’t finish/);
  await app.act(async () => app.unmount());
  await app.act(async () => app.mount({ session: { uid: 'two', configured: true }, request, apiBase: 'https://api.example.test' }));
  assert.equal(document.querySelectorAll('.chat-message').length, 0);
  await app.act(async () => app.unmount());
  await app.act(async () => app.mount({ session: null, request, apiBase: '' }));
  assert.equal(document.querySelector('.companion'), null);
  await app.act(async () => app.unmount()); await flush();
  console.log('Companion: chat, safe text, sources, unread count, hide/show, abort, i18n and session isolation passed.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { dom.window.close(); }
process.exit(process.exitCode || 0);
