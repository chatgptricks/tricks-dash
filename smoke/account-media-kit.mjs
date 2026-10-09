// Real Settings, CSS and native PDF downloads in Chromium. All remote requests
// and authentication use fixtures; this cannot read or mutate production data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sentient-account-kit-'));
const output = path.resolve('work/account-media-kit');
fs.mkdirSync(output, { recursive: true });
const server = await createServer({
  logLevel: 'error', cacheDir: path.join(temporary, 'vite-cache'),
  resolve: { alias: {
    'firebase/auth': path.resolve('smoke/stub-firebase-auth.js'),
    'firebase/app': path.resolve('smoke/stub-firebase-app.js'),
  } },
  server: { host: 'localhost', port: 4201 },
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const email = 'user03@example.com';
const viewer = { email, is_admin: true, is_dev: true };
const preferences = { theme: 'dark', accent: 'coral', language: 'en', effects: 'off' };
const accounts = [
  { handle: 'chatgptricks', label: 'ChatGPTricks', group: 'sentient', subcategory: 'ai_automation', followers: 1438276, total_posts: 2490, avg_likes: 12834, hot_threshold: 13000, scrape_mode: 'posts', is_active: true },
  { handle: 'fixture.account', label: 'Fixture account', group: 'sentient', subcategory: 'ai_automation', followers: 328417, total_posts: 892, avg_likes: 3219, hot_threshold: 3300, scrape_mode: 'reels', is_active: true },
  { handle: 'fixture.both', label: 'Both fixture', group: 'sentient', subcategory: 'ai_automation', followers: 45678, total_posts: 120, avg_likes: 789, hot_threshold: 800, scrape_mode: 'both', is_active: true },
];
const pdf = Buffer.from('%PDF-1.7\nAccount media kit native download fixture\n%%EOF\n');
const filename = 'chatgptricks-media-kit-2026-10-09.pdf';
const requests = [], errors = [];
let mode = 'pending', releaseReport = null, browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (fs.existsSync(chrome) ? chrome : undefined) });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    localStorage.setItem('sentient.lang', 'en');
    localStorage.setItem('sentient.theme', 'dark');
    localStorage.setItem('sentient.accent', 'coral');
    localStorage.setItem('sentient.effects', 'off');
  });
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (/\/api\/admin\/accounts\/[^/]+\/media-kit\.pdf$/.test(url.pathname)) {
      requests.push({ path: url.pathname, headers: request.headers(), theme: url.searchParams.get('theme'), accent: url.searchParams.get('accent') });
      assert.equal(url.hash, '', 'Accent colors must be query encoded, not URL fragments');
      assert.match(url.searchParams.get('accent'), /^#[0-9a-f]{6}$/i);
      assert.equal(request.method(), 'GET');
      assert.equal(request.headers().authorization, 'Bearer tok');
      assert.equal(request.headers().accept, 'application/pdf');
      if (mode === 'pending') await new Promise((resolve) => { releaseReport = resolve; });
      if (mode === 'error') return route.fulfill({ status: 400, headers: { 'Access-Control-Allow-Origin': '*' }, json: { detail: 'Media kit generation failed. Please retry.' } });
      return route.fulfill({ contentType: 'application/pdf', headers: { 'Access-Control-Allow-Origin': '*', 'Content-Disposition': `attachment; filename*=UTF-8''${filename}`, 'Access-Control-Expose-Headers': 'Content-Disposition', 'Cache-Control': 'private, no-store' }, body: pdf });
    }
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname.endsWith('/me/preferences')) {
        if (request.method() === 'POST') Object.assign(preferences, request.postDataJSON()?.preferences || {});
        return route.fulfill({ json: { preferences }, headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      assert.equal(request.method(), 'GET', `Settings fixture forbids mutations: ${url.pathname}`);
      let body = {};
      if (url.pathname.endsWith('/me')) body = viewer;
      else if (url.pathname.endsWith('/accounts/backfill-status')) body = { running: false, queue: [], tasks: [] };
      else if (url.pathname.endsWith('/accounts')) body = { accounts };
      else if (url.pathname.endsWith('/users')) body = { users: [{ email, display_name: 'User 03', role: 'admin', is_admin: true }] };
      else if (url.pathname.endsWith('/designer-accounts')) body = { designers: [] };
      else if (url.pathname.endsWith('/disk-status')) body = { pct_used: 22, used_mb: 220, total_mb: 1000, free_mb: 780 };
      else if (url.pathname.endsWith('/slack-status')) body = { configured: true };
      else if (url.pathname.endsWith('/ocr/status')) body = { running: false };
      else if (url.pathname.endsWith('/admin-report')) body = { totals: {}, priorities: {}, designers: [], assignedPosts: [] };
      else if (url.pathname.endsWith('/apify/runs')) body = { runs: [] };
      return route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (url.origin === base) return route.continue();
    return route.fulfill({ status: 204, body: '' });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/settings.html?settingsTab=accounts`);
  await page.getByRole('tab', { name: 'Accounts', exact: true }).click();
  const button = page.getByRole('button', { name: 'Download media kit for chatgptricks', exact: true });
  const setAppearance = async (theme, accent) => {
    await page.locator('.settings-menu-trigger').click();
    const menu = page.locator('.settings-menu-panel');
    await menu.getByRole('button', { name: theme === 'light' ? 'Light' : 'Dark', exact: true }).click();
    if (accent.startsWith('#')) {
      await menu.locator('input[type="color"]').evaluate((input, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, accent);
    } else await menu.getByRole('button', { name: `${accent} accent`, exact: true }).click();
    await page.locator('.settings-menu-trigger').click();
    await page.waitForFunction((value) => document.documentElement.dataset.theme === value, theme);
  };
  await button.waitFor();
  assert.deepEqual(await page.locator('.account-extraction-badge').allTextContents(), ['Posts', 'Reels', 'Both']);
  await page.getByRole('columnheader', { name: 'Extraction', exact: true }).click();
  assert.deepEqual(await page.locator('.account-extraction-badge').allTextContents(), ['Both', 'Posts', 'Reels'], 'Extraction column sorts by the actual mode');
  await page.getByRole('columnheader', { name: 'Account', exact: true }).click();
  assert.equal(requests.length, 0, 'Opening Accounts must not generate reports');
  await page.screenshot({ path: path.join(output, 'accounts-desktop.png'), fullPage: true });
  await button.click();
  await page.getByRole('button', { name: 'Download media kit for chatgptricks', disabled: true }).waitFor();
  assert.equal(await button.isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Download media kit for fixture.account', exact: true }).isDisabled(), false);
  assert.equal(await page.locator('.accounts-detail-row').count(), 0);
  assert.match(await button.innerText(), /Generating/i);
  await page.screenshot({ path: path.join(output, 'accounts-generating.png'), fullPage: true });
  const firstDownload = page.waitForEvent('download');
  mode = 'success';
  releaseReport();
  const verifyDownload = async (download) => {
    assert.equal(download.suggestedFilename(), filename);
    assert.equal(await download.failure(), null);
    assert.deepEqual(fs.readFileSync(await download.path()), pdf, 'Native PDF download must preserve server bytes');
    await button.waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('[aria-label="Download media kit for chatgptricks"]').disabled);
  };
  await verifyDownload(await firstDownload);
  assert.deepEqual({ theme: requests[0].theme, accent: requests[0].accent }, { theme: 'dark', accent: '#fb7185' });
  await setAppearance('light', 'blue');
  mode = 'error';
  await button.click();
  await page.locator('.account-media-kit-error').waitFor();
  assert.match(await page.locator('.account-media-kit-error').innerText(), /generation failed/);
  assert.equal(await button.isDisabled(), false);
  assert.equal(await page.locator('.accounts-detail-row').count(), 0);
  await page.screenshot({ path: path.join(output, 'accounts-error.png'), fullPage: true });
  assert.deepEqual({ theme: requests[1].theme, accent: requests[1].accent }, { theme: 'light', accent: '#60a5fa' }, 'Changed shared preferences must be used for the next request');
  await setAppearance('light', '#123abc');
  mode = 'success';
  await verifyDownload(await Promise.all([page.waitForEvent('download'), button.click()]).then(([download]) => download));
  assert.equal(await page.locator('.account-media-kit-error').count(), 0);
  assert.deepEqual({ theme: requests[2].theme, accent: requests[2].accent }, { theme: 'light', accent: '#123abc' }, 'A custom accent must reach the fresh retried download');
  await setAppearance('dark', '#123abc');
  await verifyDownload(await Promise.all([page.waitForEvent('download'), button.click()]).then(([download]) => download));
  assert.equal(requests.length, 4, 'Successful repeat and failed/retried downloads must each fetch a fresh report');
  assert.ok(requests.every((request) => request.path === '/api/admin/accounts/chatgptricks/media-kit.pdf'));
  assert.deepEqual({ theme: requests[3].theme, accent: requests[3].accent }, { theme: 'dark', accent: '#123abc' }, 'Theme changes must not retain the first request appearance');
  await page.locator('.accounts-row[data-context-handle="chatgptricks"]').click();
  assert.equal(await page.locator('.accounts-detail-row td').getAttribute('colspan'), '10');
  await page.locator('.accounts-row[data-context-handle="chatgptricks"]').click();
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; document.body.dataset.theme = value; }, theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1050 });
      await page.screenshot({ path: path.join(output, `accounts-${theme}-${width}.png`), fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, `Settings must not overflow the document at ${width}px`);
      assert.equal(await page.locator('.account-extraction-badge:visible').count(), accounts.length, 'Every responsive row displays its extraction mode');
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    if (location.pathname.startsWith('/mobile')) Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' });
  });
  await page.goto(`${base}/mobile/?tab=settings`);
  await page.locator('.m-tab-scroll').getByRole('button', { name: 'Accounts', exact: true }).click();
  await page.locator('.m-account-extraction').first().waitFor();
  assert.deepEqual(await page.locator('.m-account-extraction strong').allTextContents(), ['Posts', 'Reels', 'Both']);
  assert.equal(await page.locator('.m-account-edit-head').count(), 0, 'Modes display without opening the mobile editor');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Mobile Settings must not overflow');
  await page.screenshot({ path: path.join(output, 'accounts-extraction-mobile.png'), fullPage: true });
  preferences.language = 'es';
  await page.addInitScript(() => { localStorage.setItem('sentient.lang', 'es'); localStorage.setItem('sentient.language', 'es'); });
  await page.reload();
  await page.locator('.m-tab-scroll').getByRole('button', { name: 'Cuentas', exact: true }).click();
  await page.locator('.m-account-extraction').first().waitFor();
  assert.deepEqual(await page.locator('.m-account-extraction').allTextContents(), ['Extracción: Posts', 'Extracción: Reels', 'Extracción: Ambos']);
  await page.screenshot({ path: path.join(output, 'accounts-extraction-mobile-es.png'), fullPage: true });
  await page.goto(`${base}/settings.html?settingsTab=accounts&desktop=1`);
  await page.getByRole('tab', { name: 'Cuentas', exact: true }).click();
  await page.locator('.accounts-table th').filter({ hasText: /^Extracción$/ }).waitFor({ state: 'attached' });
  assert.deepEqual(await page.locator('.account-extraction-badge').allTextContents(), ['Posts', 'Reels', 'Ambos']);
  await page.screenshot({ path: path.join(output, 'accounts-extraction-responsive-es.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`PASS Native Settings media kit download, fresh authenticated current theme/accent, pending isolation, error/retry, PDF bytes/name, table spans and 1440/390px layout. Screenshots: ${output}`);
} finally {
  releaseReport?.();
  await browser?.close();
  await server.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
