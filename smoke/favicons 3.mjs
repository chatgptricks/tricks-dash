import { JSDOM } from 'jsdom';
const SECTION_ICONS = { hot:'🔥', sentient:'🧠', competitors:'👀', all:'📦', admin:'👤' };
const SUB = { hot:'hot', sentient:'sentient', competitors:'competitors', archive:'all', users:'admin' };
for (const [sub, section] of Object.entries(SUB)) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: `https://${sub}.sentientdash.app/` });
  const emoji = SECTION_ICONS[section];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="54" font-size="84" text-anchor="middle" dominant-baseline="central">${emoji}</text></svg>`;
  const href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  const back = decodeURIComponent(href.replace('data:image/svg+xml,',''));
  const ok = back.includes(emoji) && back.startsWith('<svg') && /viewBox="0 0 100 100"/.test(back);
  console.log(`${ok?'PASS':'FAIL'}  ${sub}.sentientdash.app -> ${emoji}  (${section})`);
}
// tracker/insights are static pages; check the literal href in the HTML decodes to the right emoji
import fs from 'node:fs';
for (const [file, want] of [['public/tracker.html','📈'],['public/insights.html','📊']]) {
  const m = fs.readFileSync(file,'utf8').match(/rel="icon"[^>]*href="data:image\/svg\+xml,([^"]+)"/);
  const decoded = m ? decodeURIComponent(m[1]) : '';
  console.log(`${decoded.includes(want)?'PASS':'FAIL'}  ${file} -> ${want}`);
}
