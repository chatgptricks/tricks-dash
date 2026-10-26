import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const reply = viewer => ({ ok: true, json: async () => viewer });
const dom = new JSDOM('<div class="wrap"><div class="top"><div class="settings-menu"></div><span id="scope"></span><button id="shareBtn"></button></div></div>', { runScripts: 'outside-only', url: 'http://localhost:4175/tracker.html' });
const w = dom.window;
await tick();
w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
const intervals = new Map(); let timerId = 0;
w.setInterval = fn => { intervals.set(++timerId, fn); return timerId; };
w.clearInterval = id => intervals.delete(id);
w.__firebaseIdToken = '';
const pending = [];
let viewer = { is_dev: true, operating_roles: ['admin'] };
let hold = false;
let calls = 0, failure = null;
w.fetch = async (_url, options) => {
  calls += 1;
  assert.ok(options.headers.Authorization?.startsWith('Bearer '));
  assert.equal(options.headers['X-Queue-Role-Preview'] || '', w.sessionStorage.getItem('sentient.queueRolePreview') || '');
  if (failure instanceof Error) throw failure;
  if (failure) return { ok: false, status: failure };
  if (!hold) return reply(viewer);
  const request = { ...deferred(), signal: options.signal }; pending.push(request); return request.promise;
};

try {
  const navigation = fs.readFileSync('public/product-navigation.js', 'utf8').replaceAll('export ', '');
  const staticHeader = fs.readFileSync('public/product-static.js', 'utf8').replace(/^import[^\n]+\n/, '');
  w.eval(fs.readFileSync('public/viewer-access.js', 'utf8'));
  w.eval(navigation + '\n' + staticHeader);
  w.eval(fs.readFileSync('public/role-preview.js', 'utf8'));
  const link = name => w.document.querySelector(`.product-nav a[href="/${name}.html"]`);
  const visible = name => !link(name).hidden && link(name).style.display !== 'none';
  const session = token => { w.__firebaseIdToken = token; w.dispatchEvent(new w.CustomEvent('sentient-auth-changed')); };
  for (const tool of ['vault', 'hooks', 'news', 'insights']) assert.equal(visible(tool), false, `${tool} hidden before viewer verification`);

  session('dev-token'); await tick();
  assert.equal(calls, 1, 'Navigation and role switcher share one verified viewer read');
  assert.equal(intervals.size, 1, 'Auth-ready stops the startup fallback poll; only role navigation remains');
  for (const tool of ['vault', 'hooks', 'news', 'insights']) assert.equal(visible(tool), true, `Dev sees ${tool}`);
  assert.equal(w.document.querySelectorAll('.sentient-role-preview').length, 1);
  assert.equal(w.document.querySelectorAll('.sentient-role-preview select option').length, 6);
  session('dev-token'); await tick();
  assert.equal(w.document.querySelectorAll('.sentient-role-preview').length, 1, 'Repeated ready events must not duplicate the switcher');

  hold = true;
  session('late-dev-token'); await tick();
  session('late-dev-token'); await tick();
  assert.equal(pending.length, 1, 'Repeated ready events share the in-flight viewer read');
  session('');
  assert.equal(pending[0].signal.aborted, true, 'Sign-out cancels the shared transport');
  assert.equal(w.document.querySelector('.sentient-role-preview'), null);
  for (const tool of ['vault', 'hooks', 'news', 'insights']) assert.equal(visible(tool), false);
  for (const request of pending) request.resolve(reply({ is_dev: true, operating_roles: ['admin'] }));
  await tick();
  assert.equal(w.document.querySelector('.sentient-role-preview'), null, 'Late Dev read cannot recreate the old switcher');
  assert.equal(visible('hooks'), false, 'Late Dev read cannot reveal old links');
  hold = false; viewer = { is_dev: false, is_admin: false, operating_roles: ['pd'] };
  session('ordinary-token'); await tick();
  assert.equal(w.document.querySelector('.sentient-role-preview'), null);
  for (const tool of ['vault', 'hooks', 'news', 'insights']) assert.equal(visible(tool), false, `Ordinary user cannot see ${tool}`);

  for (const rejected of [503, 403, new Error('Network unavailable')]) {
    failure = rejected;
    session('recovery-token'); await tick();
    assert.equal(visible('insights'), false, 'Failed reads never reveal coordinator navigation');
    assert.equal(w.document.querySelector('.sentient-role-preview'), null, 'Failed reads never grant role switching');
    failure = null; viewer = { is_dev: true, operating_roles: ['admin'] };
    session('recovery-token'); await tick();
    assert.equal(visible('insights'), true, 'A failed read is evicted so the same session can recover');
  }

  hold = true;
  session('outgoing-dev-token'); await tick();
  const outgoing = pending.at(-1);
  session('incoming-pd-token'); await tick();
  const incoming = pending.at(-1);
  assert.notEqual(outgoing, incoming, 'An account change creates its own verified read');
  assert.equal(outgoing.signal.aborted, true);
  incoming.resolve(reply({ is_dev: false, operating_roles: ['pd'] })); await tick();
  outgoing.resolve(reply({ is_dev: true, operating_roles: ['admin'] })); await tick();
  assert.equal(visible('insights'), false, 'A late old account response cannot grant coordinator access');
  assert.equal(w.document.querySelector('.sentient-role-preview'), null);
  hold = false; viewer = { is_dev: false, is_admin: false, operating_roles: ['pd'] };

  viewer = { ...viewer, can_access_news: true };
  session('news-only-token'); await tick();
  assert.equal(visible('news'), true, 'News-only grant is retained');
  assert.equal(visible('vault'), false); assert.equal(visible('hooks'), false); assert.equal(visible('insights'), false);

  viewer = { is_dev: false, can_role_switch: true, available_operating_roles: ['vc', 'pd'], operating_roles: ['vc'] };
  session('coordinator-token'); await tick();
  assert.equal(visible('insights'), true);
  assert.equal(visible('hooks'), false);
  assert.equal(w.document.querySelectorAll('.sentient-role-preview select option').length, 3, 'Non-Dev sees only their granted switch roles');
  w.sessionStorage.setItem('sentient.queueRolePreview', 'pd');
  session('coordinator-token'); await tick();
  assert.equal(visible('insights'), false, 'PD preview hides coordinator tools');
  assert.equal(visible('tracker'), true, 'Tracker remains available');
  session('');
  assert.equal(w.document.querySelector('.sentient-role-preview'), null);
  console.log('PASS static session navigation: shared viewer reads, failure recovery, role isolation, repeated events, account changes and sign-out cleanup');
} finally { dom.window.close(); }
