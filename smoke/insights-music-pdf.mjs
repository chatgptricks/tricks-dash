// Exercise the actual exporter with a local jsPDF recorder. No CDN, auth,
// production data, PDF downloads, or external requests are involved.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync(new URL('../public/insights.html', import.meta.url), 'utf8');
const start = source.indexOf('async function exportPdf(){');
const end = source.indexOf("document.getElementById('pdfBtn')?.addEventListener('click', exportPdf);", start);
assert.ok(start >= 0 && end > start);
const exporter = source.slice(start, end);

const headers = ['Song / audio', 'Posts', 'Accounts', 'Measured likes', 'Total likes', 'Average likes', 'Median likes', 'Relative performance', 'Top posts', 'Best post'];
const longId = '178900000000000012345678901234567890';
const creator = 'creator_with_a_long_but_exact_handle';
const artist = 'Artist with a deliberately long exact display name';
const original = `Original audio · @${creator} · #${longId}`;
function reportHtml(kind) {
  const isOriginal = kind === 'original';
  const firstLabel = isOriginal ? original : 'Song 1';
  const firstSub = isOriginal ? 'Open audio' : artist;
  const rows = Array.from({ length: 27 }, (_, index) => [
    isOriginal ? index === 0 ? original : `Original audio · @creator_${index + 1} · #${longId}${index + 1}` : `Song ${index + 1} · ${artist}`,
    '10', '3', '8 / 10', '200000', '25000', '15000', '2.3×', '3', '50000',
  ]);
  // An unusually long identity must span pages without dropping its tail or
  // making pagination stall. Normal Instagram labels use much less room.
  const tallTitle = `${isOriginal ? 'Original audio · @' : 'Very long title '}${'retained-word '.repeat(650)}TAIL-EXACT-${longId}`;
  rows.push([tallTitle, '1', '1', '1 / 1', '90', '90', '90', '—', '—', '90']);
  const table = `<table><thead><tr>${headers.map(value=>`<th>${value}</th>`).join('')}</tr></thead><tbody>${rows.map((cells,rowIndex)=>`<tr>${cells.map((value,columnIndex)=>`<td>${rowIndex === 0 && columnIndex === 0 ? `<button>${firstLabel}</button><small>${firstSub}</small>` : value}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return `<button id="pdfBtn">Export PDF</button><div id="scope">28 posts · 3 accounts</div>
  <div class="filters"><div class="f"><label>Music order</label><input value="total"></div><div class="f" hidden><label>HIDDEN METRIC</label><input value="DO NOT EXPORT"></div></div>
  <div id="accChips"><button class="chip on">@selected</button></div>
  <div id="musicKinds"><button data-kind="named" aria-pressed="${!isOriginal}">Songs</button><button data-kind="original" aria-pressed="${isOriginal}">Original audio</button><button data-kind="identified" aria-pressed="false">Untitled audio</button></div>
  <section><h2 id="musicRankingTitle">${isOriginal ? 'Original audio' : 'Songs'}</h2><p class="sub">Selected sounds</p>${table}</section>
  <section hidden><h2>HIDDEN DETAIL</h2><table><thead><tr><th>Secret</th></tr></thead><tbody><tr><td>HIDDEN POST</td></tr></tbody></table></section>
  <div style="display:none"><section><h2>CSS HIDDEN SECTION</h2>${table}</section></div>`;
}

async function run(view, kind = 'original') {
  const dom = new JSDOM(reportHtml(kind), { runScripts: 'outside-only', url: 'https://sentientdash.app/insights.html' });
  let result;
  const errors = [];
  class PdfRecorder {
    constructor(options) {
      this.options = options; this.page = 1; this.calls = []; this.fontSize = 7; this.fontStyle = 'normal';
      this.width = options.orientation === 'landscape' ? 842 : 595;
      this.height = options.orientation === 'landscape' ? 595 : 842;
      this.internal = { pageSize: { getWidth: () => this.width, getHeight: () => this.height } };
      result = this;
    }
    setFont(_family, style) { this.fontStyle = style; }
    setFontSize(size) { this.fontSize = size; }
    setTextColor() {}
    splitTextToSize(value, width) {
      assert.ok(width > 0);
      const size = Math.max(1, Math.floor(width / (this.fontSize * 0.52)));
      // Keep every character, including long unbroken IDs, while emulating a
      // font-width-limited multiline response from jsPDF.
      const text = String(value);
      return text.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g')) || [''];
    }
    text(value, x, y, options = {}) {
      const lines = Array.isArray(value) ? [...value] : [String(value)];
      this.calls.push({ lines, x, y, page: this.page, size: this.fontSize, style: this.fontStyle, lineHeight: this.fontSize * (options.lineHeightFactor || 1.15) });
    }
    addPage() { this.page += 1; }
    save(name) { this.saved = name; }
  }
  Object.assign(dom.window, {
    VIEW: view, loadJsPdf: async () => PdfRecorder, toolLocale: () => 'en-US', toolText: value => value,
    setTimeout: () => 0, console: { error: (...args) => errors.push(args) },
  });
  dom.window.eval(exporter);
  await dom.window.exportPdf();
  assert.deepEqual(errors, []);
  assert.match(result.saved, /^sentient-insights-\d{4}-\d{2}-\d{2}\.pdf$/);
  assert.equal(dom.window.document.querySelector('#pdfBtn').disabled, false);
  dom.window.close();
  return result;
}

const music = await run('music');
assert.equal(music.options.orientation, 'landscape');
assert.ok(music.page > 2, 'Long labels and rows exercise multiple real page breaks');
const text = music.calls.map(call=>call.lines.join('')).join('\n');
assert.ok(text.includes(original), 'The full original-audio label preserves creator and exact long ID');
assert.ok(text.includes(`${original} Open audio`), 'Adjacent title and secondary blocks remain separated in PDF text');
assert.ok(text.includes('Original audio · @creator_27'), 'Music exports every rendered row, including beyond the Overview cap of 20');
assert.ok(!text.includes('Song 27') && !text.includes(artist), 'An original-audio report contains no song-list rows');
assert.ok(text.includes(`TAIL-EXACT-${longId}`), 'A row taller than a page preserves its final line');
assert.ok(!text.includes('HIDDEN'), 'Hidden filters, sections and ancestor-hidden content are excluded');
const relativeHeaders = music.calls.filter(call=>call.style === 'bold' && call.lines.join('') === 'Relative performance');
assert.ok(relativeHeaders.length > 1, 'Column headers repeat after table page breaks');
assert.ok(relativeHeaders.every(call=>call.lines.length > 1), 'The complete long header wraps instead of truncating');
for (const call of music.calls) {
  assert.ok(call.y >= 40, `Text starts inside the top margin on page ${call.page}`);
  assert.ok(call.y + (call.lines.length - 1) * call.lineHeight <= music.height - 40, `All wrapped lines fit above the page bottom on page ${call.page}`);
  assert.ok(call.x >= 40 && call.x < music.width - 40, 'Column begins inside the printable page');
}
const firstBody = music.calls.find(call=>call.lines.join('').includes(original));
const nextMetric = music.calls.find(call=>call.page === firstBody.page && call.y === firstBody.y && call.x > firstBody.x);
assert.ok(nextMetric.x - firstBody.x > (music.width - 80) / headers.length * 2, 'Audio gets a wider first column');

const named = await run('music', 'named');
const namedText = named.calls.map(call=>call.lines.join('')).join('\n');
assert.ok(namedText.includes('Songs'), 'The report identifies its selected category');
assert.ok(namedText.includes(`Song 1 ${artist}`), 'Named songs retain their artist as a separate text block');
assert.ok(namedText.includes('Song 27'), 'The songs report exports every rendered song');
assert.ok(!namedText.includes(original), 'A song report contains no original-audio identities');

const overview = await run('overview', 'named');
assert.equal(overview.options.orientation, undefined, 'Overview retains the existing portrait constructor');
const overviewText = overview.calls.map(call=>call.lines.join('')).join('\n');
assert.ok(!overviewText.includes('Song 27'), 'Overview retains its existing 20-row limit');
assert.ok(!overviewText.includes('HIDDEN'), 'Hidden content is excluded from either view');
console.log('PASS Music PDF: separate song/original-audio reports, landscape, full audio identity, wrapped cells/headers, multi-page rows, visibility and unchanged Overview path');
