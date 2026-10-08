// Exercise the actual shared Research/Queue picker in Chromium. Every API and
// external request stays inside fixtures; inspect native downloads, not anchors.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sentient-media-download-'));
const harness = '/media-download-fixture.js';
const server = await createServer({
  logLevel: 'error', cacheDir: path.join(temporary, 'vite-cache'),
  resolve: { alias: {
    'firebase/auth': path.resolve('smoke/stub-firebase-auth.js'),
    'firebase/app': path.resolve('smoke/stub-firebase-app.js'),
  } },
  plugins: [{
    name: 'media-download-fixture',
    resolveId(id) { if (id === harness) return id; },
    load(id) {
      if (id !== harness) return null;
      return `import { createElement } from 'react';
        import { createRoot } from 'react-dom/client';
        import { SlideDownload } from '/src/postDetail.jsx';
        import '/src/styles.css';
        const shortcode = new URL(location.href).searchParams.get('post');
        const post = { account: 'fixture.account', shortcode, postKey: 'fixture.account:' + shortcode };
        createRoot(document.getElementById('root')).render(createElement(SlideDownload, { post }));`;
    },
  }],
  server: { host: 'localhost', port: 4199 },
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==', 'base64');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9V8AAAAASUVORK5CYII=', 'base64');
const mp4 = Buffer.from('000000206674797069736f6d0000020069736f6d69736f32617663316d703431', 'hex');
const media = {
  photo: [{ index: 1, kind: 'image', filename: 'photo.jpg', type: 'image/jpeg', bytes: jpeg, disposition: 'attachment; filename="original-photo.jpg"' }],
  reel: [{ index: 1, kind: 'video', filename: 'reel.mp4', type: 'video/mp4', bytes: mp4 }],
  carousel: [
    { index: 1, kind: 'image', filename: '01.jpg', type: 'image/jpeg', bytes: jpeg },
    { index: 2, kind: 'video', filename: '02.mp4', type: 'video/mp4', bytes: mp4 },
    // No filename is supplied by either list or response. MIME must determine
    // a useful extension, with no conversion of the original bytes.
    { index: 3, kind: 'image', type: 'image/png', bytes: png },
  ],
  archive: [{ index: 1, kind: 'image', filename: 'original.jpg', type: 'application/zip', bytes: Buffer.from('504b03040000', 'hex') }],
  failure: [
    { index: 1, kind: 'image', filename: '01.jpg', type: 'image/jpeg', bytes: jpeg },
    { index: 2, kind: 'video', filename: '02.mp4', type: 'video/mp4', bytes: mp4 },
  ],
};
const requests = [], errors = [];
let failSecond = true, browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (fs.existsSync(chrome) ? chrome : undefined) });
  const context = await browser.newContext({ acceptDownloads: true });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/media-download-fixture.html') {
      const html = `<html><head><title>Media download fixture</title></head><body><div id="root"></div><script type="module" src="${harness}"></script></body></html>`;
      return route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml(url.pathname, html) });
    }
    if (url.pathname === '/api/dashboard/posts/media') {
      const shortcode = url.searchParams.get('shortcode'), items = media[shortcode];
      assert.ok(items, `Known fixture ${shortcode}`);
      assert.equal(request.method(), 'GET');
      assert.equal(url.searchParams.get('account'), 'fixture.account');
      if (url.searchParams.get('list') === '1') return route.fulfill({ json: { source: 'instagram', items: items.map(({ bytes: _bytes, type: _type, disposition: _disposition, ...item }) => item) } });
      const only = url.searchParams.get('only');
      requests.push({ shortcode, only });
      if (/^\d+(,\d+)+$/.test(only || '')) {
        const selected = items.filter(item => only.split(',').includes(String(item.index)));
        if (shortcode === 'failure' && failSecond) selected.pop();
        const archive = execFileSync('python3', ['-c', `import io,json,sys,zipfile,base64
items=json.load(sys.stdin)
buffer=io.BytesIO()
with zipfile.ZipFile(buffer,'w',zipfile.ZIP_DEFLATED) as archive:
 for item in items: archive.writestr(item['name'],base64.b64decode(item['bytes']))
sys.stdout.buffer.write(buffer.getvalue())`], { input: JSON.stringify(selected.map(item => ({ name: String(item.index).padStart(2, '0') + (item.type === 'video/mp4' ? '.mp4' : item.type === 'image/png' ? '.png' : '.jpg'), bytes: item.bytes.toString('base64') }))) });
        return route.fulfill({ contentType: 'application/zip', headers: { 'X-Slide-Count': String(selected.length), 'Access-Control-Expose-Headers': 'X-Slide-Count' }, body: archive });
      }
      if (!/^\d+$/.test(only || '')) {
        errors.push(`Archive endpoint requested: ${url.href}`);
        return route.fulfill({ contentType: 'application/zip', body: 'PK: unexpected archive' });
      }
      const item = items.find(item => item.index === Number(only));
      assert.ok(item, `Known media index ${only}`);
      if (shortcode === 'failure' && only === '2' && failSecond) return route.fulfill({ status: 400, json: { detail: 'Fixture media is temporarily unavailable. Please retry.' } });
      return route.fulfill({ contentType: item.type, headers: item.disposition ? { 'Content-Disposition': item.disposition, 'Access-Control-Expose-Headers': 'Content-Disposition' } : {}, body: item.bytes });
    }
    if (url.pathname.startsWith('/api/')) {
      errors.push(`Unexpected API request: ${url.href}`);
      return route.fulfill({ status: 404, json: { detail: 'Unmocked API' } });
    }
    if (url.origin === base) return route.continue();
    return route.fulfill({ status: 204, body: '' });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const downloads = [];
  page.on('download', download => downloads.push(download));
  const openPicker = async shortcode => {
    await page.goto(`${base}/media-download-fixture.html?post=${shortcode}`);
    await page.getByRole('button', { name: 'Download media', exact: true }).click();
    await page.locator('.media-cell').first().waitFor();
    requests.length = 0;
  };
  const clickAndCollect = async (button, count) => {
    const start = downloads.length;
    await button.click();
    const deadline = Date.now() + 10000;
    while (downloads.length < start + count && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(downloads.length, start + count, `${count} native download(s) started`);
    await page.locator('.media-modal-actions .primary-button:not([disabled])').waitFor();
    return downloads.slice(start);
  };
  const verifyFile = async (download, expected) => {
    const name = download.suggestedFilename();
    assert.doesNotMatch(name, /\.zip$/i, 'Media files are never renamed to ZIP');
    assert.match(name, expected.type === 'video/mp4' ? /\.mp4$/i : expected.type === 'image/png' ? /\.png$/i : /\.jpe?g$/i);
    assert.equal(await download.failure(), null);
    assert.deepEqual(fs.readFileSync(await download.path()), expected.bytes, 'The downloaded bytes remain the original media');
  };

  await openPicker('photo');
  const [photo] = await clickAndCollect(page.getByRole('button', { name: 'Download all', exact: true }), 1);
  await verifyFile(photo, media.photo[0]);
  assert.equal(photo.suggestedFilename(), 'original-photo.jpg');
  assert.deepEqual(requests, [{ shortcode: 'photo', only: '1' }]);
  await openPicker('reel');
  const [reel] = await clickAndCollect(page.getByRole('button', { name: 'Download selected (1)', exact: true }), 1);
  await verifyFile(reel, media.reel[0]);
  assert.equal(reel.suggestedFilename(), 'fixture.account-reel-01.mp4', 'Dots in account handles must not strip the post ID or slide number');
  assert.deepEqual(requests, [{ shortcode: 'reel', only: '1' }]);
  console.log('PASS Photo and Reel retain original bytes, native extensions, and attachment names without ZIP');

  const verifyZip = async (download, expected) => {
    assert.equal(download.suggestedFilename(), 'fixture.account-carousel.zip');
    assert.equal(await download.failure(), null);
    const entries = JSON.parse(execFileSync('python3', ['-c', `import zipfile,json,sys,base64
with zipfile.ZipFile(sys.argv[1]) as archive:
 assert archive.testzip() is None
 print(json.dumps({name:base64.b64encode(archive.read(name)).decode() for name in archive.namelist()}))`, await download.path()], { encoding: 'utf8' }));
    assert.deepEqual(Object.values(entries).map(value => Buffer.from(value, 'base64')), expected.map(item => item.bytes));
    assert.deepEqual(Object.keys(entries), expected.map(item => String(item.index).padStart(2, '0') + (item.type === 'video/mp4' ? '.mp4' : item.type === 'image/png' ? '.png' : '.jpg')));
  };
  await openPicker('carousel');
  await page.locator('.media-cell-select').nth(1).click();
  const [selected] = await clickAndCollect(page.getByRole('button', { name: 'Download selected (2)', exact: true }), 1);
  await verifyZip(selected, [media.carousel[0], media.carousel[2]]);
  assert.deepEqual(requests.map(request => request.only), ['1,3']);
  requests.length = 0;
  const [video] = await clickAndCollect(page.locator('.media-cell').nth(1).locator('button.media-cell-action').first(), 1);
  await verifyFile(video, media.carousel[1]);
  assert.deepEqual(requests.map(request => request.only), ['2']);
  requests.length = 0;
  const [all] = await clickAndCollect(page.getByRole('button', { name: 'Download all', exact: true }), 1);
  await verifyZip(all, media.carousel);
  assert.deepEqual(requests.map(request => request.only), ['1,2,3']);
  console.log('PASS Multiple selections and Download all produce one valid ZIP with exact original media; individual files stay native');

  await openPicker('archive');
  const beforeArchive = downloads.length;
  await page.getByRole('button', { name: 'Download all', exact: true }).click();
  await page.locator('.slide-download-note.is-error').waitFor();
  assert.equal(downloads.length, beforeArchive, 'An unexpected archive is rejected rather than renamed as an image');
  assert.deepEqual(requests.map(request => request.only), ['1']);
  console.log('PASS Unexpected ZIP response is rejected instead of saving an invalid image');

  await openPicker('failure');
  const beforeFailure = downloads.length;
  await page.getByRole('button', { name: 'Download all', exact: true }).click();
  await page.locator('.slide-download-note.is-error').waitFor();
  assert.equal(downloads.length, beforeFailure, 'An incomplete ZIP is not silently saved');
  assert.match(await page.locator('.slide-download-note.is-error').innerText(), /could not be downloaded/i);
  assert.deepEqual(requests.map(request => request.only), ['1,2']);
  failSecond = false;
  requests.length = 0;
  const [retried] = await clickAndCollect(page.locator('.media-cell').nth(1).locator('button.media-cell-action').first(), 1);
  await verifyFile(retried, media.failure[1]);
  assert.deepEqual(requests.map(request => request.only), ['2']);
  assert.equal(await page.locator('.slide-download-note.is-error').count(), 0);
  const [repeated] = await clickAndCollect(page.locator('.media-cell').nth(1).locator('button.media-cell-action').first(), 1);
  await verifyFile(repeated, media.failure[1]);
  assert.deepEqual(errors, []);
  console.log('PASS Partial failures stay recoverable; individual retry and repeat downloads work');
} finally {
  await browser?.close();
  await server.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
