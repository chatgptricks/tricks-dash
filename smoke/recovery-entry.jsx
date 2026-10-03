import assert from 'node:assert/strict';
import { act, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { mountApp } from '../src/mountApp';
import { version } from '../package.json';

const privateMessage = 'PRIVATE_TOKEN_AND_RESPONSE_MUST_NOT_APPEAR';
localStorage.setItem('sentient.lang', 'es');
localStorage.setItem('draft', 'Keep this unsent draft');
sessionStorage.setItem('role-preview', 'pd');
const before = [localStorage.getItem('draft'), sessionStorage.getItem('role-preview')];
const consoleErrors = [];
const originalError = console.error;
console.error = (...args) => { consoleErrors.push(args.join(' ')); };
let root;
const unmount = async () => { if (root) { await act(async () => root.unmount()); root = null; } };
function verifyRecovery(language, homePath = '/') {
  const recovery = document.querySelector('.app-recovery');
  assert.ok(recovery, 'A crash must leave a usable recovery page');
  assert.equal(recovery.lang, language);
  assert.equal(document.activeElement, recovery.querySelector('h1'), 'Recovery announces itself by focusing the heading');
  assert.match(recovery.textContent, new RegExp(`v${version.replaceAll('.', '\\.')}`));
  assert.equal(recovery.textContent.includes(privateMessage), false);
  assert.equal(recovery.querySelector('a').getAttribute('href'), homePath);
  assert.equal(recovery.querySelector('button').type, 'button');
  assert.deepEqual([localStorage.getItem('draft'), sessionStorage.getItem('role-preview')], before);
}
function RenderCrash() { throw new Error(privateMessage); }
function EffectCrash() {
  useEffect(() => { throw new Error(privateMessage); }, []);
  return <p>This partial page must disappear</p>;
}
let cleanupCount = 0;
let liveEvents = 0;
function WorkingPage() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const handle = () => liveEvents++;
    window.addEventListener('recovery-probe', handle);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.getElementById('root').inert = true;
    return () => {
      cleanupCount++;
      window.removeEventListener('recovery-probe', handle);
      document.body.style.overflow = previous;
      document.getElementById('root').inert = false;
    };
  }, []);
  return <><button onClick={() => setFailed(true)}>Trigger render failure</button>
    {createPortal(<aside data-recovery-portal>Open dialog</aside>, document.body)}
    {failed && <RenderCrash />}</>;
}
try {
  await act(async () => { root = mountApp(<WorkingPage />); });
  assert.equal(document.querySelector('.app-recovery'), null);
  window.dispatchEvent(new Event('recovery-probe'));
  assert.equal(liveEvents, 1);
  await act(async () => document.querySelector('#root button').click());
  verifyRecovery('es');
  assert.equal(cleanupCount, 1, 'Unmount must clean up the crashed page');
  assert.equal(document.querySelector('[data-recovery-portal]'), null);
  assert.equal(document.body.style.overflow, '');
  assert.equal(document.getElementById('root').inert, false);
  window.dispatchEvent(new Event('recovery-probe'));
  assert.equal(liveEvents, 1, 'Crashed page must not retain its event listener');
  await unmount();

  await act(async () => { root = mountApp(<RenderCrash />, { lang: 'en' }); });
  verifyRecovery('en');
  assert.match(document.body.textContent, /This page couldn’t load/);
  assert.match(document.body.textContent, /Unsaved changes may need to be entered again/);
  await unmount();

  window.history.replaceState(null, '', '/mobile/');
  await act(async () => { root = mountApp(<EffectCrash />); });
  verifyRecovery('es', '/mobile/');
  assert.equal(document.body.textContent.includes('This partial page'), false);
  await unmount();

  window.history.replaceState(null, '', '/');

  // A broken preference API cannot prevent the fallback from rendering.
  const getItem = window.Storage.prototype.getItem;
  const languageDescriptor = Object.getOwnPropertyDescriptor(navigator, 'language');
  try {
    window.Storage.prototype.getItem = () => { throw new Error('Storage unavailable'); };
    Object.defineProperty(navigator, 'language', { configurable: true, get() { throw new Error('Language unavailable'); } });
    await act(async () => { root = mountApp(<RenderCrash />); });
    assert.equal(document.querySelector('.app-recovery')?.lang, 'en');
  } finally {
    window.Storage.prototype.getItem = getItem;
    if (languageDescriptor) Object.defineProperty(navigator, 'language', languageDescriptor);
    else delete navigator.language;
  }
  verifyRecovery('en');
  assert.ok(consoleErrors.length >= 4, 'Crashes should record a safe diagnostic');
  assert.ok(consoleErrors.every(message => !message.includes(privateMessage)), 'Raw errors must not reach recovery diagnostics');
  console.log('PASS recovery: render/effect failures, focused EN/ES fallback, portal/effect cleanup, retained storage, safe diagnostics and blocked preferences');
} finally {
  await unmount();
  console.error = originalError;
}
