import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://sentientdash.app/companion.html', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MessageEvent', 'StorageEvent', 'localStorage', 'sessionStorage', 'location']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const sent = [];
globalThis.parent = { postMessage: value => sent.push(value) };
const bundle = await build({
  stdin: { contents: `import {act} from 'react'; import {createRoot} from 'react-dom/client'; import {Companion} from './src/companion/Companion.jsx'; import {LaunchSplash} from './src/companion/LaunchSplash.jsx'; export * from './src/companion/launch.js';
export {act}; let root; const Avatar=()=> <span data-launch-test-avatar="true"/>;
export function mount(props){root=createRoot(document.getElementById('root'));root.render(<Companion {...props} Avatar={Avatar}/>)}
export function splash(props){root=createRoot(document.getElementById('root'));root.render(<LaunchSplash {...props} Avatar={Avatar}/>)}
export function unmount(){root.unmount()}`, loader: 'jsx', resolveDir: process.cwd() },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', target: 'es2022', loader: { '.css': 'empty' },
});
const app = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const button = label => [...document.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label || node.textContent.trim() === label);
const click = node => app.act(async () => { assert.ok(node, 'Expected button exists'); node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const context = (language = 'en') => app.act(async () => window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: parent, data: { source: 'sentient-host', type: 'context', language, theme: 'dark', page: '/' } })));
const mount = uid => app.act(async () => app.mount({ session: uid ? { uid, configured: true } : null, request: () => { throw new Error('Launch must not query chat'); }, apiBase: '' }));
const unmount = () => app.act(async () => app.unmount());
const dialog = () => document.querySelector('.sentient-launch-dialog');

try {
  // Component keyboard/outside-click behavior does not depend on the host.
  let starts = 0, dismisses = 0;
  await app.act(async () => app.splash({ locale: 'en', onStart: () => starts++, onDismiss: () => dismisses++ }));
  assert.match(document.querySelector('h1').textContent, /Meet Sentient Bot\./);
  assert.equal(dialog().getAttribute('aria-modal'), 'true');
  assert.equal(document.activeElement, button('Try Sentient Bot'));
  await click(button('Try Sentient Bot')); assert.equal(starts, 1);
  await app.act(async () => {
    button('Not now').focus();
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  });
  assert.equal(document.activeElement, button('Close introduction'), 'Tab wraps inside the introduction');
  await app.act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
  assert.equal(document.activeElement, button('Not now'));
  await app.act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  assert.equal(dismisses, 1);
  await click(document.querySelector('.sentient-launch-overlay')); assert.equal(dismisses, 2);
  await unmount();

  await mount(null); await context(); assert.equal(dialog(), null, 'Signed-out visitors do not receive the product launch'); await unmount();
  await mount('launch-one');
  assert.equal(dialog(), null, 'Wait for the selected dashboard locale/theme before showing');
  await context();
  assert.ok(dialog());
  assert.equal(sent.findLast(item => item.type === 'layout').state, 'launch');
  assert.equal(document.querySelectorAll('[data-launch-test-avatar]').length, 1, 'Only one character renders at a time');
  assert.equal(localStorage.getItem(app.launchStorageKey('launch-one')), null, 'Appearance alone is not acknowledgment');
  await click(button('Not now'));
  assert.equal(dialog(), null);
  assert.equal(app.isLaunchSeen('launch-one'), true);
  assert.equal(sent.findLast(item => item.type === 'layout').state, 'closed');
  await unmount();

  await mount('launch-one'); await context(); assert.equal(dialog(), null, 'A reload retains the launch acknowledgment'); await unmount();
  await mount('launch-two'); await context('es'); assert.ok(dialog(), 'A different user receives their own launch');
  assert.match(document.querySelector('h1').textContent, /Conocé a Sentient Bot\./);
  await click(button('Probar Sentient Bot'));
  assert.equal(dialog(), null);
  assert.equal(app.isLaunchSeen('launch-two'), true);
  assert.ok(document.querySelector('.companion-chat'), 'The primary action opens the actual chat');
  assert.equal(localStorage.getItem('sentient.pet.enabled.launch-two'), 'true');
  assert.equal(sent.findLast(item => item.type === 'layout').state, 'open');
  await unmount();

  localStorage.setItem('sentient.pet.enabled.launch-compact', 'false');
  await mount('launch-compact'); await context(); assert.ok(dialog());
  await click(button('Not now'));
  assert.equal(localStorage.getItem('sentient.pet.enabled.launch-compact'), 'false');
  assert.equal(sent.findLast(item => item.type === 'layout').state, 'compact', 'Dismiss respects a previously closed companion');
  await unmount();

  await mount('launch-shared'); await context(); assert.ok(dialog());
  localStorage.setItem(app.launchStorageKey('different-account'), 'seen');
  await app.act(async () => window.dispatchEvent(new StorageEvent('storage', { key: app.launchStorageKey('different-account'), newValue: 'seen', storageArea: localStorage })));
  assert.ok(dialog(), 'Another account acknowledgment does not dismiss this user’s introduction');
  localStorage.setItem(app.launchStorageKey('launch-shared'), 'seen');
  await app.act(async () => window.dispatchEvent(new StorageEvent('storage', { key: app.launchStorageKey('launch-shared'), newValue: 'seen', storageArea: localStorage })));
  assert.equal(dialog(), null, 'Acknowledgment in another tool tab also dismisses this introduction');
  await unmount();

  await app.act(async () => app.mount({ session: { uid: 'launch-unavailable', configured: false }, request: () => {}, apiBase: '' }));
  await context(); assert.equal(dialog(), null, 'Do not announce an unavailable chat feature');
  await unmount();

  assert.equal(app.isLaunchSeen(null), true);
  assert.equal(app.launchStorageKey('launch-one').includes(app.LAUNCH_VERSION), true);
  const originalSet = dom.window.Storage.prototype.setItem;
  dom.window.Storage.prototype.setItem = () => { throw new Error('Storage denied'); };
  app.markLaunchSeen('storage-blocked');
  assert.equal(app.isLaunchSeen('storage-blocked'), true, 'Blocked storage still dismisses for this visit');
  dom.window.Storage.prototype.setItem = originalSet;
  console.log('PASS Companion launch: authentication, locale, one-time account acknowledgment, CTA, compact preference, focus trap, dismissal and single-character lifecycle.');
} catch (error) { console.error(error.stack); process.exitCode = 1; }
finally { dom.window.close(); }
process.exit(process.exitCode || 0);
