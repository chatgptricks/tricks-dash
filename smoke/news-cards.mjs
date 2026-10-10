// Real News entrypoint and shared Research cards; all API/auth/external traffic
// stays inside fixtures, including explicit JEV clicks and publisher links.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sentient-news-cards-'));
const output = path.resolve('work/news-cards');
fs.mkdirSync(output, { recursive: true });
const server = await createServer({
  logLevel: 'error', cacheDir: path.join(temporary, 'vite-cache'),
  resolve: { alias: {
    'firebase/auth': path.resolve('smoke/stub-firebase-auth.js'),
    'firebase/app': path.resolve('smoke/stub-firebase-app.js'),
  } },
  server: { host: 'localhost', port: 4198 },
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#254c44"/><circle cx="300" cy="305" r="154" fill="#8ecdbb"/><path d="M100 800V625a200 200 0 0 1 400 0v175" fill="#679e9b"/><text x="45" y="730" font-family="sans-serif" font-size="36" fill="white">Research card fixture</text></svg>';
const titles = ['Robots learn a useful new skill from video', 'A better way to compare AI results', 'What the new AI safety report found', 'How researchers test a smaller model', 'A visual guide to reliable AI tools', 'An important story without a preview'];
const items = titles.map((title, index) => ({
  id: `story-${index}`, title, publisher: index === 1 ? 'Research Journal' : 'Technology Review', source: 'Technology Review', sourceType: index === 4 ? 'x' : 'news',
  published: new Date(Date.now() - index * 3600000).toISOString(), image: index === 5 ? '' : index === 3 ? 'https://news-fixture.test/broken.jpg' : `https://news-fixture.test/cover-${index}.svg`,
  link: `https://publisher-fixture.test/story-${index}`, feedLabel: 'AI & robotics', feedGroup: 'Ticker',
  description: 'Researchers show how a useful idea can be tested, compared, and explained clearly. Read the original source to verify the evidence before developing a post.',
  coverageCount: index === 1 ? 3 : 1, coverageFeeds: ['Technology', 'Artificial intelligence'],
  relatedStories: index === 1 ? [{ title: 'Independent coverage of this AI result', source: 'Another Publisher', link: 'https://publisher-fixture.test/related' }] : [],
  socialSignal: index === 4 ? 'Feed eligibility is not a verified engagement count for this individual story.' : '',
}));
const reviewed = { label: 'potential', score: .78, viralPotential: .71, evidenceQuality: .83, dimensions: { timeliness: { score: .92 } }, strengths: ['useful_takeaway', 'clear_evidence'], weaknesses: ['needs_context'], editorialAngle: 'visual_explainer', postFormat: 'carousel', targetAccount: 'creative', evidenceSource: 'article' };
const reviews = { 'story-1': reviewed };
const saved = {};
const writes = [], paid = [], errors = [], publisherRequests = [];
let releaseReview, failReview = true;
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (fs.existsSync(chrome) ? chrome : undefined) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    localStorage.setItem('sentient.theme', 'light');
    localStorage.setItem('sentient.accent', 'lime');
    localStorage.setItem('sentient.effects', 'off');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copiedBrief = value; } } });
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) {
      let data = {};
      if (url.pathname === '/api/dashboard/me') data = { email: 'developer@example.test', is_admin: true, is_dev: true };
      else if (url.pathname.endsWith('/me/preferences')) data = { preferences: { theme: 'light', accent: 'lime', effects: 'off' } };
      else if (url.pathname === '/api/dashboard/news') data = { items, reviews, saved };
      else if (url.pathname === '/api/dashboard/news/save') {
        const payload = request.postDataJSON(); writes.push(payload);
        if (payload.saved) saved[payload.id] = { item: items.find(item => item.id === payload.id), brief: payload.brief };
        else delete saved[payload.id];
      } else if (url.pathname === '/api/dashboard/news/review') {
        paid.push(request.postDataJSON());
        await new Promise(resolve => { releaseReview = resolve; });
        if (failReview) return route.fulfill({ status: 400, json: { detail: 'Fixture review unavailable. Please retry.' } });
        data = reviewed; reviews[request.postDataJSON().id] = reviewed;
      } else if (request.method() !== 'GET') {
        errors.push(`Unexpected mutation: ${request.method()} ${url.pathname}`);
        return route.fulfill({ status: 405, json: { detail: 'Unexpected fixture mutation' } });
      }
      return route.fulfill({ json: data });
    }
    if (url.origin === base) return route.continue();
    if (url.hostname === 'news-fixture.test' && url.pathname.includes('broken')) return route.fulfill({ status: 404, body: '' });
    if (request.resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: image });
    if (url.hostname === 'publisher-fixture.test') {
      publisherRequests.push(url.href);
      return route.fulfill({ contentType: 'text/html', body: '<title>Publisher fixture</title><p>Mock original source</p>' });
    }
    return route.fulfill({ status: 204, body: '' });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/news.html?desktop=1`);
  await page.locator('.news-story').first().waitFor();
  assert.equal(await page.locator('.news-story.product-card').count(), 6);
  assert.equal(paid.length, 0, 'Loading stories does not start paid JEV actions');
  assert.equal(writes.length, 0, 'Loading stories does not save or modify data');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'News keeps the fixed shared News theme');
  const card = index => page.locator('.news-story').filter({ has: page.getByRole('heading', { name: titles[index], exact: true }) });
  const first = card(0), assessed = card(1);
  await card(3).getByRole('img', { name: 'No story preview' }).waitFor();
  assert.equal(await card(5).getByRole('img', { name: 'No story preview' }).count(), 1);
  assert.equal(await first.locator('img.product-card-image').evaluate(node => getComputedStyle(node).objectFit), 'contain');
  assert.equal(await first.locator('img.product-card-image').evaluate(node => getComputedStyle(node).filter), 'none');
  assert.equal(await first.getByRole('link', { name: titles[0], exact: true }).getAttribute('href'), items[0].link);
  for (const [width, columns] of [[1440, 6], [1280, 4], [900, 3], [600, 2], [390, 1]]) {
    await page.setViewportSize({ width, height: 1100 });
    const layout = await page.locator('.news-results').evaluate(node => ({ columns: getComputedStyle(node).gridTemplateColumns.split(' ').length, scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert.equal(layout.columns, columns, `${width}px uses ${columns} columns`);
    assert.ok(layout.scrollWidth <= layout.viewport + 1, `${width}px does not overflow horizontally`);
    const media = await first.locator('.product-card-media').boundingBox();
    assert.ok(Math.abs(media.width / media.height - .75) < .005, `${width}px retains Research 3:4 media`);
  }
  await page.screenshot({ path: path.join(output, 'news-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(output, 'news-desktop.png') });
  console.log('PASS News uses shared Research cards, six-column desktop, responsive geometry, fixed theme and image fallbacks');

  await first.getByRole('button', { name: 'Save', exact: true }).click();
  await first.getByRole('button', { name: 'Saved', exact: true }).waitFor();
  assert.equal(await first.getByRole('button', { name: 'Saved', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.deepEqual(writes.at(-1), { id: 'story-0', saved: true });
  await first.getByRole('button', { name: 'Saved', exact: true }).click();
  await first.getByRole('button', { name: 'Save', exact: true }).waitFor();
  assert.deepEqual(writes.at(-1), { id: 'story-0', saved: false });
  await first.getByRole('button', { name: 'Draft', exact: true }).click();
  const brief = page.getByRole('textbox', { name: 'Post brief' });
  await brief.waitFor();
  assert.match(await brief.inputValue(), /Robots learn a useful new skill/);
  await brief.fill('An edited post brief with original reporting.');
  await page.getByRole('button', { name: 'Save brief', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.news-story .product-card-actions [aria-pressed="true"]'));
  assert.deepEqual(writes.at(-1), { id: 'story-0', saved: true, brief: 'An edited post brief with original reporting.' });
  await page.getByRole('button', { name: 'Copy brief', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__copiedBrief), 'An edited post brief with original reporting.');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const popupPromise = context.waitForEvent('page');
  await first.getByRole('link', { name: `Open original story: ${titles[0]}` }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  assert.equal(popup.url(), items[0].link);
  assert.deepEqual(publisherRequests, [items[0].link]);
  await popup.close();
  assert.equal(paid.length, 0, 'Save, draft, copy and source actions do not invoke JEV');
  console.log('PASS News Save/unsave, draft edit/save/copy and original source actions');

  await assessed.locator('summary').filter({ hasText: 'Why JEV ranked this story' }).click();
  assert.equal(await assessed.locator('details').first().getAttribute('open'), '');
  assert.match(await assessed.locator('details').first().innerText(), /Strongest signals: useful takeaway/);
  assert.match(await assessed.locator('details').first().innerText(), /article text extracted from the publisher/);
  assert.equal(await assessed.locator('details p').first().evaluate(node => getComputedStyle(node).webkitLineClamp), 'none', 'Expanded evidence is not line-clamped');
  await assessed.locator('summary').filter({ hasText: 'Other coverage' }).click();
  assert.equal(await assessed.getByRole('link', { name: /Independent coverage/ }).isVisible(), true);
  assert.equal(await assessed.locator('meter').count(), 3);

  const pendingReview = page.waitForRequest(request => request.url().endsWith('/api/dashboard/news/review'));
  await first.getByRole('button', { name: 'Review with JEV', exact: true }).click();
  await pendingReview;
  await page.waitForFunction(() => [...document.querySelectorAll('.news-story .editorial-primary')].every(button => button.disabled));
  assert.deepEqual(paid, [{ id: 'story-0' }]);
  assert.equal(await assessed.getByRole('button', { name: 'Recheck with JEV', exact: true }).isDisabled(), true);
  releaseReview();
  await first.getByRole('status').waitFor();
  assert.match(await first.getByRole('status').innerText(), /Fixture review unavailable/);
  assert.equal(await first.getByRole('button', { name: 'Review with JEV', exact: true }).isEnabled(), true);
  failReview = false;
  const retry = page.waitForRequest(request => request.url().endsWith('/api/dashboard/news/review'));
  await first.getByRole('button', { name: 'Review with JEV', exact: true }).click();
  await retry;
  releaseReview();
  await first.getByRole('button', { name: 'Recheck with JEV', exact: true }).waitFor();
  assert.match(await first.locator('.news-review-badge').innerText(), /Potential/);
  assert.equal(await first.getByRole('status').count(), 0);
  assert.equal(paid.length, 2, 'Exactly two explicitly requested JEV calls were made');
  assert.deepEqual(errors, []);
  console.log('PASS News evidence and coverage expansion; explicit JEV review locks, recoverable errors and retry');
  console.log(`News screenshots: ${output}`);
} finally {
  releaseReview?.();
  await browser?.close();
  await server.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
