import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dom = new JSDOM(fs.readFileSync('public/tracker.html','utf8'), {
  runScripts: 'dangerously',
  url: 'https://sentientdash.app/tracker.html',
  beforeParse(window) {
    window.Chart = Object.assign(function Chart() {}, { defaults: { font: {} } });
  },
});
const { window } = dom;
await new Promise(r => setTimeout(r, 250));
const d = window.document;
// avFail must exist and turn a broken img into a visible initial
const ok = {};
ok['avFail defined'] = typeof window.avFail === 'function';
const img = d.createElement('img');
img.className = 'side-avatar';
d.body.appendChild(img);
window.avFail(img, 'chatgptricks');
const span = d.querySelector('.avatar-fallback');
ok['img replaced by fallback'] = Boolean(span);
ok['keeps the avatar class'] = span?.classList.contains('side-avatar');
ok['shows the initial'] = span?.textContent === 'C';
ok['handles a leading @'] = (() => { const i2=d.createElement('img'); i2.className='acct-avatar'; d.body.appendChild(i2);
  window.avFail(i2,'@eluna.ai'); return [...d.querySelectorAll('.avatar-fallback')].pop().textContent === 'E'; })();
ok['no visibility:hidden left'] = !fs.readFileSync('public/tracker.html','utf8').includes("visibility='hidden'");
for (const [k,v] of Object.entries(ok)) console.log(`${v?'PASS':'FAIL'}  ${k}`);
process.exit(Object.values(ok).every(Boolean) ? 0 : 1);
