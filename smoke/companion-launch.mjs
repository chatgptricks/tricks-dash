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

const checkbox = () => document.querySelector('.sentient-launch-dialog input[type="checkbox"]');
const escape = () => app.act(async () => dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
const replay = async () => {
  await app.act(async () => document.querySelector('.pet-launcher').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })));
  await click(button('Meet Sentient Bot'));
};

try {
  // The checkbox participates in the focus trap and does not close the dialog.
  let starts = 0, dismisses = 0, preference;
  await app.act(async () => app.splash({ locale: 'en', dontShowAgain: false, onDontShowAgainChange: value => { preference = value; }, onStart: () => starts++, onDismiss: () => dismisses++ }));
  assert.match(document.querySelector('h1').textContent, /Meet Sentient Bot\./);
  assert.equal(dialog().getAttribute('aria-modal'), 'true');
  assert.equal(document.activeElement, button('Try Sentient Bot'));
  assert.equal(checkbox().checked, false);
  assert.match(checkbox().closest('label').textContent, /Don.t show again/);
  await click(checkbox()); assert.equal(preference, true);
  assert.equal(dismisses, 0, 'Changing the preference does not dismiss the splash');
  await click(button('Try Sentient Bot')); assert.equal(starts, 1);
  await app.act(async () => {
    checkbox().focus();
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  });
  assert.equal(document.activeElement, button('Close introduction'), 'Tab wraps from the checkbox to the first control');
  await app.act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
  assert.equal(document.activeElement, checkbox(), 'Reverse Tab includes the checkbox');
  await escape(); assert.equal(dismisses, 1);
  await click(document.querySelector('.sentient-launch-overlay')); assert.equal(dismisses, 2);
  await unmount();

  await mount(null); await context(); assert.equal(dialog(), null, 'Signed-out visitors do not receive the product launch'); await unmount();
  await mount('launch-one');
  assert.equal(dialog(), null, 'Wait for the selected dashboard locale/theme before showing');
  await context();
  assert.ok(dialog());
  assert.equal(sent.findLast(item => item.type === 'layout').state, 'launch');
  assert.equal(document.querySelectorAll('[data-launch-test-avatar]').length, 1, 'Only one character renders at a time');
  assert.equal(localStorage.getItem(app.launchStorageKey('launch-one')), null);
  await click(button('Not now'));
  assert.equal(dialog(), null);
  assert.equal(app.isLaunchSuppressed('launch-one'), false, 'A normal dismissal does not opt out');
  assert.equal(localStorage.getItem(app.launchStorageKey('launch-one')), null);
  assert.equal(sent.findLast(item => item.type === 'layout').state, 'closed');
  await unmount();

  for (const dismiss of [() => click(button('Close introduction')), escape, () => click(document.querySelector('.sentient-launch-overlay'))]) {
    await mount('launch-one'); await context();
    assert.ok(dialog(), 'The splash returns on the next open or reload until explicitly suppressed');
    await dismiss(); assert.equal(dialog(), null);
    assert.equal(app.isLaunchSuppressed('launch-one'), false);
    await unmount();
  }

  await mount('launch-two'); await context('es'); assert.ok(dialog(), 'A different user receives their own launch');
  assert.match(document.querySelector('h1').textContent, /Conocé a Sentient Bot\./);
  assert.match(checkbox().closest('label').textContent, /No mostrar más/);
  await click(button('Probar Sentient Bot'));
  assert.equal(dialog(), null);
  assert.equal(app.isLaunchSuppressed('launch-two'), false, 'Trying the bot does not silently suppress future launches');
  assert.ok(document.querySelector('.companion-chat'), 'The primary action opens the actual chat');
  assert.equal(localStorage.getItem('sentient.pet.enabled.launch-two'), 'true');
  assert.equal(sent.findLast(item => item.type === 'layout').state, 'open');
  await unmount();
  await mount('launch-two'); await context('es'); assert.ok(dialog(), 'The launch returns after using the CTA without opting out'); await unmount();

  await mount('launch-optout'); await context();
  await click(checkbox());
  assert.equal(checkbox().checked, true);
  assert.ok(dialog(), 'Opting out saves the preference without closing the current introduction');
  assert.equal(app.isLaunchSuppressed('launch-optout'), true);
  assert.equal(localStorage.getItem(app.launchStorageKey('launch-optout')), 'hidden');
  await click(button('Not now')); await unmount();
  await mount('launch-optout'); await context(); assert.equal(dialog(), null, 'The explicit checkbox preference survives a reload');
  await replay();
  assert.ok(dialog(), 'The menu still reopens an opted-out introduction');
  assert.equal(checkbox().checked, true, 'A manually reopened introduction shows the saved preference');
  await click(checkbox());
  assert.equal(app.isLaunchSuppressed('launch-optout'), false);
  assert.equal(localStorage.getItem(app.launchStorageKey('launch-optout')), null);
  await click(button('Close introduction')); await unmount();
  await mount('launch-optout'); await context(); assert.ok(dialog(), 'Unchecking restores launches on future opens'); await unmount();

  localStorage.setItem(app.launchStorageKey('launch-legacy'), 'seen');
  await mount('launch-legacy'); await context(); assert.ok(dialog(), 'Legacy automatic acknowledgments are not explicit opt-outs'); await unmount();

  localStorage.setItem('sentient.pet.enabled.launch-compact', 'false');
  await mount('launch-compact'); await context(); assert.ok(dialog());
  await click(button('Not now'));
  assert.equal(localStorage.getItem('sentient.pet.enabled.launch-compact'), 'false');
  assert.equal(sent.findLast(item => item.type === 'layout').state, 'compact', 'Dismiss respects a previously closed companion');
  await unmount();

  await mount('launch-shared'); await context(); assert.ok(dialog());
  localStorage.setItem(app.launchStorageKey('different-account'), 'hidden');
  await app.act(async () => window.dispatchEvent(new StorageEvent('storage', { key: app.launchStorageKey('different-account'), newValue: 'hidden', storageArea: localStorage })));
  assert.ok(dialog(), 'Another account preference does not dismiss this user’s introduction');
  localStorage.setItem(app.launchStorageKey('launch-shared'), 'hidden');
  await app.act(async () => window.dispatchEvent(new StorageEvent('storage', { key: app.launchStorageKey('launch-shared'), newValue: 'hidden', storageArea: localStorage })));
  assert.equal(dialog(), null, 'Opt-out in another tool tab dismisses this introduction');
  await replay(); assert.equal(checkbox().checked, true, 'Cross-tab opt-out also updates the visible checkbox state');
  await unmount();

  await app.act(async () => app.mount({ session: { uid: 'launch-unavailable', configured: false }, request: () => {}, apiBase: '' }));
  await context(); assert.equal(dialog(), null, 'Do not announce an unavailable chat feature');
  await unmount();

  assert.equal(app.isLaunchSuppressed(null), true);
  assert.equal(app.launchStorageKey('launch-one').includes(app.LAUNCH_VERSION), true);
  const storageMethods = Object.fromEntries(['getItem', 'setItem', 'removeItem'].map(key => [key, dom.window.Storage.prototype[key]]));
  try {
    for (const key of Object.keys(storageMethods)) dom.window.Storage.prototype[key] = () => { throw new Error('Storage denied'); };
    app.setLaunchSuppressed('storage-blocked', true);
    assert.equal(app.isLaunchSuppressed('storage-blocked'), true, 'Blocked storage still honors opt-out during this visit');
    app.setLaunchSuppressed('storage-blocked', false);
    assert.equal(app.isLaunchSuppressed('storage-blocked'), false, 'Blocked storage still honors unchecking during this visit');
  } finally { Object.assign(dom.window.Storage.prototype, storageMethods); }
  console.log('PASS Companion launch: repeated opens until checkbox opt-out, preference restoration, legacy migration, account isolation, localization, focus trap and single-character lifecycle.');
} catch (error) { console.error(error.stack); process.exitCode = 1; }
finally { dom.window.close(); }
process.exit(process.exitCode || 0);
