import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs';

for (const [file, esProbe] of [['public/tracker.html', 'Copiar link'], ['public/insights.html', 'Copiar link']]) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', (e) => { if (!/Cannot find module|Failed to parse|not implemented/i.test(e.message||'')) errs.push(e.message); });
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://sentientdash.app/' + file.split('/').pop(),
    virtualConsole: vc,
  });
  const { window } = dom;
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener(){}, removeEventListener(){} }));
  await new Promise(r => setTimeout(r, 300));
  const d = window.document;
  const out = {};
  out['theme attr set'] = ['dark','light'].includes(d.documentElement.getAttribute('data-theme'));
  out['ENG/ES present'] = [...d.querySelectorAll('.lang-option')].map(b=>b.textContent).join('/') === 'ENG/ES';
  const themeBtn = d.getElementById('themeBtn');
  out['sun in dark'] = /☀/.test(themeBtn?.textContent || '');
  themeBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 120));
  out['flips to light'] = d.documentElement.getAttribute('data-theme') === 'light';
  out['moon in light'] = /🌙/.test(d.getElementById('themeBtn')?.textContent || '');
  const es = [...d.querySelectorAll('.lang-option')].find(b => b.dataset.lang === 'es');
  es?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  out['lang=es on html'] = d.documentElement.getAttribute('lang') === 'es';
  const vis1 = [...d.querySelectorAll('body *:not(script):not(style)')]
    .map(n => n.childNodes.length === 1 && n.firstChild.nodeType === 3 ? n.textContent : '').join(' | ');
  out['translates to ES'] = vis1.includes(esProbe);
  const en = [...d.querySelectorAll('.lang-option')].find(b => b.dataset.lang === 'en');
  en?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 250));
  // Visible text only -- body.innerHTML also contains the inline script, whose
  // source literally holds the Spanish dictionary.
  const visible = () => [...d.querySelectorAll('body *:not(script):not(style)')]
    .map(n => n.childNodes.length === 1 && n.firstChild.nodeType === 3 ? n.textContent : '').join(' | ');
  out['restores English exactly'] = visible().includes('Copy link') && !visible().includes(esProbe);
  if (!out['restores English exactly']) {
    const idx = d.body.innerHTML.indexOf(esProbe);
    console.log('   still-ES context:', JSON.stringify(d.body.innerHTML.slice(Math.max(0, idx-120), idx+60)));
    console.log('   has Copy link  :', d.body.innerHTML.includes('Copy link'));
  }
  out['no script errors'] = errs.filter(e => !/Chart is not defined/.test(String(e))).length === 0;
  console.log('\n=== ' + file + ' ===');
  for (const [k, v] of Object.entries(out)) console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
  if (errs.length) errs.slice(0,3).forEach(e => console.log('   err:', String(e).slice(0,160)));
  dom.window.close();
}
process.exit(0);
