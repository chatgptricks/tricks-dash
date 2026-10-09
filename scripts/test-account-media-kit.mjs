import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const bundle = await build({
  entryPoints: ['src/accountMediaKit.js'], bundle: true, write: false, format: 'esm',
  plugins: [{
    name: 'isolated-media-kit-api',
    setup(builder) {
      builder.onLoad({ filter: /\/src\/api\.js$/ }, () => ({
        contents: 'export const API_BASE = "https://api.test"; export const apiFetch = (...args) => globalThis.__mediaKitFetch(...args);', loader: 'js',
      }));
    },
  }],
});
const { downloadAccountMediaKit } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://sentientdash.app/settings.html' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const requests = [], downloads = [], blobs = [], revoked = [], scheduled = [];
const pdfBytes = Buffer.from('%PDF-1.7\nMedia kit fixture: 123456 followers, 9876 average likes\n%%EOF\n');
URL.createObjectURL = (blob) => { blobs.push(blob); return `blob:media-kit-${blobs.length}`; };
URL.revokeObjectURL = (value) => revoked.push(value);
dom.window.URL.createObjectURL = URL.createObjectURL;
dom.window.URL.revokeObjectURL = URL.revokeObjectURL;
dom.window.setTimeout = (callback) => { scheduled.push(callback); return scheduled.length; };
dom.window.HTMLAnchorElement.prototype.click = function () {
  downloads.push({ filename: this.download, href: this.href, connected: this.isConnected });
};
let response = () => new Response(pdfBytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="chatgptricks-media-kit-2026-10-09.pdf"' } });
globalThis.__mediaKitFetch = async (url, options) => { requests.push({ url, options }); return response(); };

const download = await downloadAccountMediaKit('chatgptricks');
assert.equal(download.filename, 'chatgptricks-media-kit-2026-10-09.pdf');
assert.equal(downloads.length, 1);
assert.equal(downloads[0].filename, download.filename);
assert.equal(requests[0].url, 'https://api.test/api/admin/accounts/chatgptricks/media-kit.pdf');
assert.equal(requests[0].options.cache, 'no-store', 'Each click must generate a fresh server report');
assert.equal(String(requests[0].options.method || 'GET').toUpperCase(), 'GET');
assert.deepEqual(Buffer.from(await blobs[0].arrayBuffer()), pdfBytes, 'The original PDF bytes must reach the browser download');
assert.equal(document.querySelectorAll('a[download]').length, 0, 'Temporary download anchors must be removed');
while (scheduled.length) scheduled.shift()();
assert.ok(revoked.includes(downloads[0].href), 'The download object URL must eventually be released');

response = () => new Response(pdfBytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': "attachment; filename*=UTF-8''sales%20kit.pdf" } });
await downloadAccountMediaKit('fixture.account');
assert.equal(requests.at(-1).url, 'https://api.test/api/admin/accounts/fixture.account/media-kit.pdf');
assert.equal(downloads.at(-1).filename, 'sales kit.pdf', 'UTF-8 attachment names must be decoded');

response = () => new Response(pdfBytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="../../unsafe.pdf"' } });
await downloadAccountMediaKit('fixture.account');
assert.doesNotMatch(downloads.at(-1).filename, /[\\/]|^\./, 'Attachment filenames must not retain path segments');
assert.match(downloads.at(-1).filename, /\.pdf$/i);

response = () => new Response(pdfBytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="report.html"' } });
await downloadAccountMediaKit('fixture.account');
assert.equal(downloads.at(-1).filename, 'fixture.account-media-kit.pdf', 'An invalid filename extension must use a PDF fallback');

response = () => new Response(pdfBytes, { headers: { 'Content-Type': 'application/pdf' } });
await downloadAccountMediaKit('account/name');
assert.equal(requests.at(-1).url, 'https://api.test/api/admin/accounts/account%2Fname/media-kit.pdf', 'Handles must be encoded as one path segment');
const beforeRepeat = requests.length;
await downloadAccountMediaKit('chatgptricks');
await downloadAccountMediaKit('chatgptricks');
assert.equal(requests.length, beforeRepeat + 2, 'Repeated clicks must make separate fresh report requests');

const beforeFailure = downloads.length;
for (const [label, makeResponse, expected] of [
  ['denied account', () => new Response(JSON.stringify({ detail: 'Media kits require Settings access.' }), { status: 403, headers: { 'Content-Type': 'application/json' } }), /Settings access/],
  ['missing account', () => new Response(JSON.stringify({ detail: 'Account not found.' }), { status: 404, headers: { 'Content-Type': 'application/json' } }), /Account not found/],
  ['non-PDF response', () => new Response('<html>Login</html>', { headers: { 'Content-Type': 'text/html' } }), /PDF/i],
  ['invalid PDF body', () => new Response('not a PDF', { headers: { 'Content-Type': 'application/pdf' } }), /PDF/i],
  ['empty PDF', () => new Response('', { headers: { 'Content-Type': 'application/pdf' } }), /PDF/i],
  ['network failure', () => { throw new Error('Network unavailable'); }, /Network unavailable/],
]) {
  response = makeResponse;
  await assert.rejects(downloadAccountMediaKit('chatgptricks'), expected, label);
  assert.equal(downloads.length, beforeFailure, `${label} must not start an invalid download`);
}
response = () => new Response(pdfBytes, { headers: { 'Content-Type': 'application/pdf' } });
await downloadAccountMediaKit('chatgptricks');
assert.equal(downloads.length, beforeFailure + 1, 'A failed report request must remain retryable');
const beforeAbort = downloads.length;
const controller = new AbortController();
response = () => { controller.abort(); return new Response(pdfBytes, { headers: { 'Content-Type': 'application/pdf' } }); };
await assert.rejects(downloadAccountMediaKit('chatgptricks', { signal: controller.signal }), { name: 'AbortError' });
assert.equal(requests.at(-1).options.signal, controller.signal, 'Account report requests must carry the cancellation signal');
assert.equal(downloads.length, beforeAbort, 'A report cancelled during generation must not start a late browser download');
while (scheduled.length) scheduled.shift()();
console.log('PASS Account media kit uses fresh encoded API requests, preserves PDF bytes, sanitizes filenames, releases downloads, and recovers from invalid/error responses.');
