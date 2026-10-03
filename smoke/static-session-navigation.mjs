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
w.fetch = async (_url, options) => {
  assert.ok(options.headers.Authorization?.startsWith('Bearer '));
  if (!hold) return reply(viewer);
  const request = deferred(); pending.push(request); return request.promise;
};

try {
  const navigation = fs.readFileSync('public/product-navigation.js', 'utf8').replaceAll('export ', '');
  const staticHeader = fs.readFileSync('public/product-static.js', 'utf8').replace(/^import[^\n]+\n/, '');
  w.eval(navigation + '\n' + staticHeader);
  w.eval(fs.readFileSync('public/role-preview.js', 'utf8'));
  const link = name => w.document.querySelector(`.product-nav a[href="/${name}.html"]`);
  const visible = name => !link(name).hidden && link(name).style.display !== 'none';
  const session = token => { w.__firebaseIdToken = token; w.dispatchEvent(new w.CustomEvent('sentient-auth-changed')); };
  for (const tool of ['vault', 'hooks', 'news', 'insights']) assert.equal(visible(tool), false, `${tool} hidden before viewer verification`);

  session('dev-token'); await tick();
  for (const tool of ['vault', 'hooks', 'news', 'insights']) assert.equal(visible(tool), true, `Dev sees ${tool}`);
  assert.equal(w.document.querySelectorAll('.sentient-role-preview').length, 1);
  assert.equal(w.document.querySelectorAll('.sentient-role-preview select option').length, 6);
  session('dev-token'); await tick();
  assert.equal(w.document.querySelectorAll('.sentient-role-preview').length, 1, 'Repeated ready events must not duplicate the switcher');

  hold = true;
  session('late-dev-token'); await tick();
  assert.equal(pending.length, 2, 'Both shared components have an in-flight viewer read');
  session('');
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
  session('pd-preview-token'); await tick();
  assert.equal(visible('insights'), false, 'PD preview hides coordinator tools');
  assert.equal(visible('tracker'), true, 'Tracker remains available');
  session('');
  assert.equal(w.document.querySelector('.sentient-role-preview'), null);
  console.log('PASS static session navigation: verified role visibility, Dev-only tools, narrow News grant, repeated mounts, stale viewer reads and sign-out cleanup');
} finally { dom.window.close(); }
