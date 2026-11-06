import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<html lang="en" data-theme="light"><body></body></html>', { url: 'https://sentientdash.app/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
Object.defineProperty(w, 'innerWidth', { value: 1280, configurable: true });
Object.defineProperty(w, 'innerHeight', { value: 900, configurable: true });
let navigation;
w.__navigate = url => { navigation = url; };
w.eval((await fs.readFile('public/sentient-companion.js', 'utf8')).replace("location.assign('/index.html?' + params.toString())", "window.__navigate('/index.html?' + params.toString())"));
const frame = w.document.getElementById('sentient-companion-frame');
const messages = [];
frame.contentWindow.postMessage = message => messages.push(message);
function send(data, source = frame.contentWindow, origin = w.location.origin) { w.dispatchEvent(new w.MessageEvent('message', { origin, source, data: { source: 'sentient-companion', ...data } })); }
const geometry = () => messages.findLast(m => m.type === 'geometry');
const corners = ['top-left', 'middle-left', 'bottom-left', 'top-right', 'middle-right', 'bottom-right'];
for (const dock of corners) {
  send({ type: 'ready', dock }); send({ type: 'layout', state: 'closed' });
  assert.equal(w.document.getElementById('sentient-companion-backdrop').style.display, 'none');
  const before = geometry();
  const ax = parseFloat(frame.style.left) + before.avatar.x, ay = parseFloat(frame.style.top) + before.avatar.y;
  send({ type: 'layout', state: 'open' });
  assert.equal(w.document.getElementById('sentient-companion-backdrop').style.display, 'block');
  const after = geometry();
  assert.deepEqual([after.avatar.w, after.avatar.h], [136, 146]);
  assert.equal(parseFloat(frame.style.left) + after.avatar.x, ax);
  assert.equal(parseFloat(frame.style.top) + after.avatar.y, ay);
  assert.ok(parseFloat(frame.style.left) >= 0 && parseFloat(frame.style.top) >= 0);
  assert.ok(parseFloat(frame.style.left) + parseFloat(frame.style.width) <= 1280);
  assert.ok(parseFloat(frame.style.top) + parseFloat(frame.style.height) <= 900);
  send({ type: 'layout', state: 'compact' }); assert.equal(geometry().avatar.w, 64);
}
send({ type: 'ready', dock: 'bottom-left' }); send({ type: 'layout', state: 'closed' });
send({ type: 'drag-start' }); send({ type: 'drag-end', dx: 1100, dy: -700 });
assert.equal(frame.dataset.dock, 'top-right');
assert.equal(frame.style.zIndex, '2147483647');
assert.equal(frame.style.colorScheme, 'light');
send({ type: 'research_filters', filters: { query: 'Elon Musk', text_scope: 'caption', min_likes: 5001, accounts: [], sort: 'newest' } }, w);
assert.equal(navigation, undefined, 'Untrusted frames cannot navigate the dashboard');
send({ type: 'research_filters', filters: { query: 'Elon Musk', text_scope: 'caption', min_likes: 5001, accounts: [], sort: 'newest' } });
const url = new URL(navigation, w.location.origin);
assert.equal(url.pathname, '/index.html'); assert.equal(url.searchParams.get('likes'), '5001'); assert.equal(url.searchParams.get('scope'), 'caption'); assert.equal(url.searchParams.get('q'), 'Elon Musk');
Object.defineProperty(w, 'innerWidth', { value: 390 }); Object.defineProperty(w, 'innerHeight', { value: 844 });
for (const dock of corners) { send({ type: 'ready', dock }); send({ type: 'layout', state: 'open' }); assert.ok(parseFloat(frame.style.left) >= 0 && parseFloat(frame.style.left) + parseFloat(frame.style.width) <= 390); }
dom.window.close();
console.log('PASS Companion host: six positions, constant size, viewport bounds, dragging, theme, foreground, and validated visible filters.');
