import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs';
const vc = new VirtualConsole();
const dom = new JSDOM(fs.readFileSync('public/insights.html','utf8'), {
  runScripts:'dangerously', url:'https://sentientdash.app/insights.html', virtualConsole: vc });
const { window } = dom;
await new Promise(r => setTimeout(r, 300));
const d = window.document;
const ok = {};
ok['Export PDF button exists'] = Boolean(d.getElementById('pdfBtn'));
ok['button is labelled'] = /Export PDF/.test(d.getElementById('pdfBtn')?.textContent || '');

// buildChips is internal; drive it the way the page does
window.ACCOUNTS = [{handle:'a',group:'sentient'},{handle:'b',group:'competitors'}];
window.SEL = new Set(['a','b']);
ok['exportPdf defined'] = typeof window.exportPdf === 'function';
ok['canvasOnPanel defined'] = typeof window.canvasOnPanel === 'function';
ok['jsPDF loaded lazily'] = !/<script[^>]+jspdf/i.test(fs.readFileSync('public/insights.html','utf8'));
ok['Clear chip in source'] = /mk\('Clear'/.test(fs.readFileSync('public/insights.html','utf8'));
ok['Clear empties the set'] = /SEL=new Set\(\);buildChips\(\);render\(\)/.test(fs.readFileSync('public/insights.html','utf8'));
for (const [k,v] of Object.entries(ok)) console.log(`${v?'PASS':'FAIL'}  ${k}`);
process.exit(Object.values(ok).every(Boolean)?0:1);
