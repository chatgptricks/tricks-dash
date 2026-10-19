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
const fixtureNow = Date.parse('2026-10-19T18:00:00.000Z');
const publicationDates = [-10 * 60000, -3600000, -24 * 3600000, -24 * 3600000 - 1, 3600000].map(offset => new Date(fixtureNow + offset).toISOString());
publicationDates.push('unknown-publication-date');
const titles = ['Robots learn a useful new skill from video', 'A better way to compare AI results', 'What the new AI safety report found', 'How researchers test a smaller model', 'A visual guide to reliable AI tools', 'An important story without a preview'];
const items = titles.map((title, index) => ({
  id: `story-${index}`, title, publisher: index === 1 ? 'Research Journal' : 'Technology Review', source: 'Technology Review', sourceType: index === 4 ? 'x' : 'news',
  published: publicationDates[index], image: index === 5 ? '' : index === 3 ? 'https://news-fixture.test/broken.jpg' : `https://news-fixture.test/cover-${index}.svg`,
  link: `https://publisher-fixture.test/story-${index}`, feedLabel: 'AI & robotics', feedGroup: 'Ticker',
  description: 'Researchers show how a useful idea can be tested, compared, and explained clearly. Read the original source to verify the evidence before developing a post.',
  coverageCount: index === 1 ? 3 : 1, coverageFeeds: ['Technology', 'Artificial intelligence'],
  relatedStories: index === 1 ? [{ title: 'Independent coverage of this AI result', source: 'Another Publisher', link: 'https://publisher-fixture.test/related' }] : [],
  socialSignal: index === 4 ? 'Feed eligibility is not a verified engagement count for this individual story.' : '',
}));
const reviewed = { label: 'potential', score: .78, viralPotential: .71, evidenceQuality: .83, dimensions: { timeliness: { score: .92 } }, strengths: ['useful_takeaway', 'clear_evidence'], weaknesses: ['needs_context'], editorialAngle: 'visual_explainer', postFormat: 'carousel', targetAccount: 'creative', evidenceSource: 'article' };
const reviews = { 'story-1': reviewed };
const saved = {};
const statuses = {};
const omittedFeedStories = new Set();
const writes = [], statusWrites = [], paid = [], errors = [], publisherRequests = [];
let releaseReview, failReview = true, releaseStatus, failStatus = true, holdStatus = true, releaseLoad, holdLoad = false, failLoad = false;
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (fs.existsSync(chrome) ? chrome : undefined) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'no-preference' });
  const initialize = () => {
    localStorage.setItem('sentient.theme', 'light');
    localStorage.setItem('sentient.accent', 'lime');
    localStorage.setItem('sentient.effects', 'on');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copiedBrief = value; } } });
  };
  await context.addInitScript(initialize);
  const intercept = async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) {
      let data = {};
      if (url.pathname === '/api/dashboard/me') data = { email: 'developer@example.test', is_admin: true, is_dev: true };
      else if (url.pathname.endsWith('/me/preferences')) data = { preferences: { theme: 'light', accent: 'lime', effects: 'on' } };
      else if (url.pathname === '/api/dashboard/news') {
        data = JSON.parse(JSON.stringify({ items: items.filter(item => !omittedFeedStories.has(item.id)), reviews, saved, statuses }));
        if (holdLoad) await new Promise(resolve => { releaseLoad = resolve; });
        if (failLoad) return route.fulfill({ status: 400, json: { detail: 'Fixture feed refresh unavailable.' } });
      }
      else if (url.pathname === '/api/dashboard/news/save') {
        const payload = request.postDataJSON(); writes.push(payload);
        if (payload.saved) saved[payload.id] = { item: items.find(item => item.id === payload.id), brief: payload.brief };
        else delete saved[payload.id];
      } else if (url.pathname === '/api/dashboard/news/status') {
        const payload = request.postDataJSON(); statusWrites.push(payload);
        if (holdStatus) await new Promise(resolve => { releaseStatus = resolve; });
        if (failStatus) return route.fulfill({ status: 503, json: { detail: 'Fixture status unavailable. Please retry.' } });
        statuses[payload.id] = { status: payload.status, item: items.find(item => item.id === payload.id) };
        data = { ok: true, id: payload.id, status: payload.status };
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
  };
  await context.route('**/*', intercept);
  const page = await context.newPage();
  await page.clock.setFixedTime(fixtureNow);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/news.html?desktop=1`);
  await page.locator('.news-story').first().waitFor();
  assert.equal(await page.locator('.news-story.product-card').count(), 6);
  assert.equal(paid.length, 0, 'Loading stories does not start paid JEV actions');
  assert.equal(writes.length, 0, 'Loading stories does not save or modify data');
  assert.equal(statusWrites.length, 0, 'Loading stories does not change editorial status');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'News keeps the fixed shared News theme');
  const card = index => page.locator('.news-story').filter({ has: page.getByRole('heading', { name: titles[index], exact: true }) });
  const first = card(0), assessed = card(1);
  const lastChecked = page.locator('.news-last-checked time');
  await lastChecked.waitFor();
  assert.equal(await lastChecked.getAttribute('datetime'), new Date(fixtureNow).toISOString(), 'Last checked reports the last successful client fetch');
  assert.match(await page.locator('.news-last-checked').textContent(), /Last checked/);
  assert.equal(await page.getByRole('button', { name: 'Refresh stories', exact: true }).locator('svg').count(), 1, 'The visible refresh control includes its icon');
  for (const index of [0, 1, 2]) {
    assert.equal(await card(index).locator('.news-recent-badge').textContent(), 'Last 24h');
    assert.equal(await card(index).locator('.news-recent-badge').getAttribute('title'), 'Published in the last 24 hours');
  }
  for (const index of [3, 4, 5]) assert.equal(await card(index).locator('.news-recent-badge').count(), 0, 'Old, future and unknown publication dates do not receive a recent badge');
  const recentTab = page.getByRole('tab', { name: /^Last 24h/ });
  assert.equal(await recentTab.locator('b').textContent(), '3', 'The exact 24h boundary is included');
  await recentTab.click();
  assert.deepEqual(await page.locator('.news-story h2').allTextContents(), titles.slice(0, 3), 'The recent view contains only past publication dates within 24h, newest first');
  assert.equal(await page.getByRole('combobox', { name: 'Sort stories', exact: true }).inputValue(), 'newest');
  await page.getByRole('tab', { name: 'Recommended', exact: true }).click();
  await page.getByRole('combobox', { name: 'Sort stories', exact: true }).selectOption('recommended');
  await card(3).getByRole('img', { name: 'No story preview' }).waitFor();
  assert.equal(await card(5).getByRole('img', { name: 'No story preview' }).count(), 1);
  assert.equal(await first.locator('img.product-card-image').evaluate(node => getComputedStyle(node).objectFit), 'contain');
  assert.equal(await first.locator('img.product-card-image').evaluate(node => getComputedStyle(node).filter), 'none');
  assert.equal(await first.getByRole('link', { name: titles[0], exact: true }).getAttribute('href'), items[0].link);
  const assertCalm = async (story, label) => {
    const effects = await story.evaluate(node => {
      const style = getComputedStyle(node), media = node.querySelector('.product-card-image'), glare = node.querySelector('.obs-soft-glare');
      return { transform: style.transform, shadow: style.boxShadow, imageTransform: media ? getComputedStyle(media).transform : 'none', glareVisible: Boolean(glare && getComputedStyle(glare).display !== 'none' && getComputedStyle(glare).visibility !== 'hidden' && Number(getComputedStyle(glare).opacity) > 0) };
    });
    assert.deepEqual(effects, { transform: 'none', shadow: 'none', imageTransform: 'none', glareVisible: false }, `${label} cards stay still without shadows, glare or image zoom, even with effects enabled`);
    assert.equal(await story.evaluate(node => node.classList.contains('obs-card')), false, `${label} cards do not attach pointer tilt effects`);
  };
  await assertCalm(first, 'Resting');
  await first.hover();
  await page.mouse.move((await first.boundingBox()).x + 25, (await first.boundingBox()).y + 25);
  await page.waitForTimeout(350);
  await assertCalm(first, 'Hovered');
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
  console.log('PASS News uses calm shared Research cards, six-column desktop, responsive geometry, fixed theme and image fallbacks');

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
  console.log('PASS News evidence and coverage expansion; explicit JEV review locks, recoverable errors and retry');

  const statusFilter = page.getByRole('combobox', { name: 'Filter stories by status', exact: true });
  assert.equal(await statusFilter.inputValue(), 'pending', 'News opens on pending stories');
  assert.deepEqual(await statusFilter.locator('option').allTextContents(), ['Pending', 'Done', 'Rejected', 'All statuses']);
  assert.equal(await first.getByRole('button', { name: 'Mark as done', exact: true }).isEnabled(), true);
  assert.equal(await first.getByRole('button', { name: 'Reject story', exact: true }).isEnabled(), true);
  const pendingStatus = page.waitForRequest(request => request.url().endsWith('/api/dashboard/news/status'));
  await first.getByRole('button', { name: 'Mark as done', exact: true }).click();
  await pendingStatus;
  await page.waitForFunction(() => [...document.querySelectorAll('.news-story')].find(node => node.querySelector('h2')?.textContent === 'Robots learn a useful new skill from video')?.querySelector('[aria-label="Reject story"]')?.disabled);
  assert.equal(await first.getByRole('button', { name: 'Mark as done', exact: true }).isDisabled(), true);
  assert.equal(await first.isVisible(), true, 'The pending story stays in view until its status is saved');
  assert.equal(await assessed.getByRole('button', { name: 'Mark as done', exact: true }).isEnabled(), true, 'A status write only locks its own story');
  assert.deepEqual(statusWrites, [{ id: 'story-0', status: 'done' }]);
  releaseStatus();
  await first.locator('.news-status-error').waitFor();
  assert.match(await first.locator('.news-status-error').innerText(), /Fixture status unavailable/);
  assert.equal(await first.getByRole('button', { name: 'Mark as done', exact: true }).isEnabled(), true, 'A failed status write can be retried');
  assert.equal(await first.getByRole('button', { name: 'Reject story', exact: true }).isEnabled(), true);
  assert.equal(statuses['story-0'], undefined, 'A failed status write does not alter persisted status');

  holdLoad = true;
  const staleLoad = page.waitForRequest(request => new URL(request.url()).pathname === '/api/dashboard/news');
  await page.getByRole('button', { name: 'Refresh stories', exact: true }).click();
  await staleLoad;
  failStatus = false; holdStatus = false;
  await first.getByRole('button', { name: 'Mark as done', exact: true }).click();
  await first.waitFor({ state: 'hidden' });
  assert.equal(statuses['story-0'].status, 'done');
  holdLoad = false;
  releaseLoad();
  await page.getByRole('button', { name: 'Refresh stories', exact: true }).waitFor();
  assert.equal(await first.count(), 0, 'A feed response started before the status mutation cannot restore an old status');
  await statusFilter.selectOption({ label: 'Done' });
  await first.locator('.news-status-badge').waitFor();
  assert.equal(await first.locator('.news-status-badge').textContent(), 'Done');
  assert.equal(await first.getByRole('button', { name: 'Reopen story', exact: true }).isEnabled(), true);
  assert.equal(await first.locator('.news-status-error').count(), 0, 'Successful retry clears the status error');
  assert.equal(await page.locator('.news-story').count(), 1);
  await statusFilter.selectOption({ label: 'Pending' });
  const rejected = card(2);
  await rejected.getByRole('button', { name: 'Reject story', exact: true }).click();
  await rejected.waitFor({ state: 'hidden' });
  assert.deepEqual(statusWrites.at(-1), { id: 'story-2', status: 'rejected' });
  assert.equal(await page.locator('.news-story').count(), 4);
  await statusFilter.selectOption({ label: 'Rejected' });
  await rejected.locator('.news-status-badge').waitFor();
  assert.equal(await rejected.locator('.news-status-badge').textContent(), 'Rejected');
  assert.equal(await page.locator('.news-story').count(), 1);

  omittedFeedStories.add('story-0'); omittedFeedStories.add('story-2');
  await page.reload();
  await page.locator('.news-story').first().waitFor();
  assert.equal(await statusFilter.inputValue(), 'pending');
  assert.equal(await first.count(), 0, 'Done stories remain outside Pending after reload');
  assert.equal(await rejected.count(), 0, 'Rejected stories remain outside Pending after reload');
  await statusFilter.selectOption({ label: 'All statuses' });
  assert.equal(await page.locator('.news-story').count(), 6, 'Processed story snapshots remain available after they leave the live feed');
  assert.equal(await first.locator('.news-status-badge').textContent(), 'Done');
  assert.equal(await rejected.locator('.news-status-badge').textContent(), 'Rejected');
  await page.getByRole('tab', { name: /^Saved/ }).click();
  assert.equal(await page.locator('.news-story').count(), 1, 'Status filtering composes with existing category tabs');
  assert.equal(await first.isVisible(), true, 'Completing a story preserves its saved brief');
  await page.getByRole('tab', { name: 'Recommended', exact: true }).click();
  await statusFilter.selectOption({ label: 'Done' });
  await first.getByRole('button', { name: 'Reopen story', exact: true }).click();
  await first.waitFor({ state: 'hidden' });
  assert.deepEqual(statusWrites.at(-1), { id: 'story-0', status: 'pending' });
  await statusFilter.selectOption({ label: 'Rejected' });
  await rejected.getByRole('button', { name: 'Reopen story', exact: true }).click();
  await rejected.waitFor({ state: 'hidden' });
  assert.deepEqual(statusWrites.at(-1), { id: 'story-2', status: 'pending' });
  await page.reload();
  await first.waitFor();
  assert.equal(await page.locator('.news-story').count(), 6, 'Reopened stories remain Pending after reload even after leaving the live feed');
  assert.equal(await first.locator('.news-status-badge').count(), 0);
  assert.equal(statuses['story-0'].status, 'pending');
  assert.equal(statuses['story-2'].status, 'pending');
  omittedFeedStories.clear();
  assert.equal(paid.length, 2, 'Editorial status actions do not invoke JEV');
  console.log('PASS News Done/Reject/Reopen, composable status views, shared reload persistence and retry-safe per-story locks');

  await first.getByRole('button', { name: 'Mark as done', exact: true }).click();
  await first.waitFor({ state: 'hidden' });
  await statusFilter.selectOption({ label: 'Done' });
  await recentTab.click();
  const search = page.getByRole('textbox', { name: 'Search stories', exact: true });
  const topicFilter = page.getByRole('combobox', { name: 'Filter stories by topic', exact: true });
  const sortFilter = page.getByRole('combobox', { name: 'Sort stories', exact: true });
  await search.fill('Robots');
  await topicFilter.selectOption('Ticker');
  const assertRefreshView = async () => {
    assert.equal(await recentTab.getAttribute('aria-selected'), 'true');
    assert.equal(await statusFilter.inputValue(), 'done');
    assert.equal(await topicFilter.inputValue(), 'Ticker');
    assert.equal(await sortFilter.inputValue(), 'newest');
    assert.equal(await search.inputValue(), 'Robots');
    assert.equal(await page.locator('.news-story').count(), 1);
    assert.equal(await first.locator('.news-status-badge').textContent(), 'Done');
  };
  await assertRefreshView();
  const previousCheck = await lastChecked.getAttribute('datetime');
  const mutationsBeforeRefresh = { saves: writes.length, statuses: statusWrites.length, reviews: paid.length };
  const refreshButton = page.locator('.news-refresh');
  await page.clock.setFixedTime(fixtureNow + 2 * 60000);
  holdLoad = true;
  const refreshRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/api/dashboard/news');
  await refreshButton.click();
  await refreshRequest;
  assert.equal(await refreshButton.isDisabled(), true, 'The refresh button is disabled while checking stories');
  assert.match(await refreshButton.textContent(), /Refreshing/);
  assert.equal(await lastChecked.getAttribute('datetime'), previousCheck, 'An in-flight refresh retains the last successful check time');
  holdLoad = false; releaseLoad();
  await page.getByRole('button', { name: 'Refresh stories', exact: true }).waitFor();
  const successfulCheck = await lastChecked.getAttribute('datetime');
  assert.equal(successfulCheck, new Date(fixtureNow + 2 * 60000).toISOString(), 'Successful refresh advances the last checked time');
  await assertRefreshView();

  await page.clock.setFixedTime(fixtureNow + 4 * 60000);
  failLoad = true; holdLoad = true;
  const failedRefresh = page.waitForRequest(request => new URL(request.url()).pathname === '/api/dashboard/news');
  await refreshButton.click();
  await failedRefresh;
  assert.equal(await refreshButton.isDisabled(), true);
  holdLoad = false; releaseLoad();
  await page.locator('.news-alert').filter({ hasText: 'News returned 400' }).waitFor();
  assert.equal(await refreshButton.isEnabled(), true, 'A failed refresh leaves the refresh control actionable');
  assert.equal(await lastChecked.getAttribute('datetime'), successfulCheck, 'A failed refresh does not claim a new successful check time');
  await assertRefreshView();
  assert.deepEqual({ saves: writes.length, statuses: statusWrites.length, reviews: paid.length }, mutationsBeforeRefresh, 'Refreshing reads stories without saving, changing status or invoking JEV');

  failLoad = false;
  await refreshButton.click();
  await page.waitForFunction(expected => document.querySelector('.news-last-checked time')?.getAttribute('datetime') === expected, new Date(fixtureNow + 4 * 60000).toISOString());
  assert.equal(await page.locator('.news-alert').count(), 0, 'Successful refresh clears the previous refresh error');
  await assertRefreshView();
  await statusFilter.selectOption({ label: 'All statuses' });
  await search.fill('');
  await topicFilter.selectOption('all');
  assert.deepEqual(await page.locator('.news-story h2').allTextContents(), titles.slice(0, 2), 'Refreshing reevaluates the rolling 24h boundary');
  assert.equal(await recentTab.locator('b').textContent(), '2');
  await page.screenshot({ path: path.join(output, 'news-freshness-desktop.png') });
  await page.getByRole('tab', { name: 'Recommended', exact: true }).click();
  assert.equal(await card(2).locator('.news-recent-badge').count(), 0, 'A story that ages beyond 24h loses its recent badge');
  await first.getByRole('button', { name: 'Reopen story', exact: true }).click();
  await first.getByRole('button', { name: 'Mark as done', exact: true }).waitFor();
  await statusFilter.selectOption({ label: 'Pending' });
  await sortFilter.selectOption('recommended');
  assert.equal(await page.locator('.news-story').count(), 6);
  console.log('PASS News recent date boundaries, newest-first view and refresh loading/success/failure feedback preserve filters and editorial status');

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
  await mobileContext.addInitScript(initialize);
  await mobileContext.route('**/*', intercept);
  const mobile = await mobileContext.newPage();
  await mobile.clock.setFixedTime(fixtureNow);
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto(`${base}/news.html?desktop=1`);
  const mobileCard = index => mobile.locator('.news-story').filter({ has: mobile.getByRole('heading', { name: titles[index], exact: true }) });
  const mobileFirst = mobileCard(0), mobileRejected = mobileCard(2);
  await mobileFirst.waitFor();
  assert.equal(await mobile.locator('.news-last-checked time').getAttribute('datetime'), new Date(fixtureNow).toISOString());
  await mobile.getByRole('tab', { name: /^Last 24h/ }).tap();
  assert.deepEqual(await mobile.locator('.news-story h2').allTextContents(), titles.slice(0, 3), 'The recent view is usable through touch');
  await mobile.screenshot({ path: path.join(output, 'news-freshness-mobile.png') });
  await mobile.getByRole('tab', { name: 'Recommended', exact: true }).tap();
  await mobile.getByRole('combobox', { name: 'Sort stories', exact: true }).selectOption('recommended');
  const mobileFilter = mobile.getByRole('combobox', { name: 'Filter stories by status', exact: true });
  const mobileBounds = await mobileFirst.locator('.news-disposition-actions').evaluate(node => ({ left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, width: innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(mobileBounds.left >= 0 && mobileBounds.right <= mobileBounds.width + 1 && mobileBounds.document <= mobileBounds.width + 1, 'Touch actions stay within the mobile viewport');
  await assertCalm(mobileFirst, 'Mobile');
  await mobileFirst.getByRole('button', { name: 'Mark as done', exact: true }).tap();
  await mobileFirst.waitFor({ state: 'hidden' });
  await mobileRejected.getByRole('button', { name: 'Reject story', exact: true }).tap();
  await mobileRejected.waitFor({ state: 'hidden' });
  await mobileFilter.selectOption({ label: 'Done' });
  assert.equal(await mobileFirst.locator('.news-status-badge').textContent(), 'Done');
  await mobileFirst.getByRole('button', { name: 'Reopen story', exact: true }).tap();
  await mobileFirst.waitFor({ state: 'hidden' });
  await mobileFilter.selectOption({ label: 'Rejected' });
  assert.equal(await mobileRejected.locator('.news-status-badge').textContent(), 'Rejected');
  await mobileRejected.getByRole('button', { name: 'Reopen story', exact: true }).tap();
  await mobileRejected.waitFor({ state: 'hidden' });
  await mobileFilter.selectOption({ label: 'Pending' });
  await mobileFirst.waitFor();
  await mobile.screenshot({ path: path.join(output, 'news-status-mobile.png') });
  assert.deepEqual(errors, []);
  await mobileContext.close();
  console.log('PASS News mobile touch disposition actions and status views stay within the viewport');
  console.log(`News screenshots: ${output}`);
} finally {
  releaseReview?.();
  releaseStatus?.();
  releaseLoad?.();
  await browser?.close();
  await server.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
