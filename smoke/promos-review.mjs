// Promos integration gate: authenticated fixtures only; every remote request is intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const output = fs.mkdtempSync(path.join(os.tmpdir(), 'sentient-promos-review-'));
const server = await createServer({
  logLevel: 'error', cacheDir: path.join(output, 'vite-cache'),
  resolve: { alias: {
    'firebase/auth': path.resolve('smoke/stub-firebase-auth.js'),
    'firebase/app': path.resolve('smoke/stub-firebase-app.js'),
  } },
  server: { host: 'localhost', port: 4182 },
});
await server.listen();
const base = (server.resolvedUrls.local[0]).replace(/\/$/, '');
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.CHROME_PATH || (fs.existsSync(macChrome) ? macChrome : undefined);
let browser;
const key = item => `${item.account}:${item.shortcode}`;
const baseItem = {
  classification: 'likely', review_status: 'new', product: 'Orbit Notes',
  account_group: 'competitors', account_group_label: 'Competitors',
  published_at: '2026-10-02T16:00:00Z', first_detected_at: '2026-10-02T17:00:00Z',
  caption: 'This is not sponsored. I use Orbit Notes for my research. Comment NOTES for the link.',
  permalink: 'https://www.instagram.com/p/ALPHA/',
  evidence: [
    { family: 'explicit', rule: 'Sponsorship wording', source: 'caption', text: 'This is not sponsored.' },
    { family: 'commercial', rule: 'Built with', source: 'caption', text: 'Built with Orbit' },
    { family: 'metadata', rule: 'Partner metadata', source: 'metadata', text: 'Orbit Notes' },
    { family: 'cta', rule: 'Keyword request', source: 'caption', text: 'Comment NOTES' },
  ],
  links: [{ url: 'https://orbit.example/product', source: 'caption' }, { url: 'javascript:alert(1)', source: 'caption' }, { url: 'data:text/html,unsafe', source: 'first_comment' }],
  client_candidates: [{ name: 'Orbit', source: 'mention' }, { name: 'Other', source: 'hashtag' }],
  cta: { keyword: 'NOTES' }, promo_code: 'ORBIT20', stack_id: 'topic-a', stack_size: 2,
};
const alpha = { ...baseItem, account: 'alpha', shortcode: 'ALPHA', client: '', jev_review: {
  recommendation: 'conflicting_evidence', semanticPromo: 0.22, commercialRelationship: 'organic_recommendation',
  deterministicClassification: 'disclosed', guidance: 'Check the denial and any separate offer.',
  contextSource: 'first_comment', contextExcerpt: 'I purchased this myself.', source: 'jev_manual_review', reviewedAt: '2026-10-02T18:00:00Z',
} };
const beta = { ...baseItem, account: 'beta', shortcode: 'BETA', client: 'Orbit', classification: 'needs_review', permalink: 'https://www.instagram.com/p/BETA/', jev_review: null };
const gamma = { ...baseItem, account: 'gamma', shortcode: 'GAMMA', client: 'Orbit', classification: 'disclosed', stack_id: 'topic-b', evidence: [{ family: 'explicit', rule: '#ad', source: 'caption', text: '#ad' }], caption: 'Try Orbit Notes. #ad', jev_review: null };
const stored = new Map([alpha, beta, gamma].map(item => [key(item), structuredClone(item)]));
const writes = [], jevRequests = [], scans = [];
let failPatch = false, holdPatch = false, releasePatch, holdJev = false, releaseJev;
let heldDetail = '', rejectDetail = false, releaseDetail;
let heldReview = null, releaseList, failList = false, jobState = 'done', failJob = false;
const jobRequests = [];
const errors = [];

try {
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('sentient.lang', 'en');
    localStorage.setItem('sentient.theme', 'dark');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__reviewBrief = value; } } });
  });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) {
      let data = {};
      if (url.pathname === '/api/dashboard/me') data = { is_admin: true, is_dev: true, email: 'developer@example.test' };
      else if (url.pathname.endsWith('/me/preferences')) data = { preferences: {} };
      else if (url.pathname === '/api/admin/promos') {
        let items = [...stored.values()].filter(item => (!url.searchParams.get('review') || item.review_status === url.searchParams.get('review')) && (!url.searchParams.get('classification') || item.classification === url.searchParams.get('classification')));
        const cursor = url.searchParams.get('cursor');
        data = { items: cursor ? items.slice(2) : items.slice(0, 2), next_cursor: !cursor && items.length > 2 ? 'page-2' : null };
        if (heldReview !== null && url.searchParams.get('review') === heldReview) await new Promise(resolve => { releaseList = resolve; });
        if (failList) return route.fulfill({ status: 400, json: { detail: 'This review queue could not be loaded.' } });
      } else if (['/api/admin/promos/backfill', '/api/admin/promos/jev-scan'].includes(url.pathname)) {
        scans.push({ path: url.pathname, payload: request.postDataJSON() });
        data = { job_id: 'fixture-job' };
      } else if (url.pathname.startsWith('/api/admin/promos/jobs/')) {
        jobRequests.push(url.pathname);
        if (failJob) return route.fulfill({ status: 400, json: { detail: 'Fixture status connection interrupted.' } });
        data = { status: jobState, processed: jobState === 'done' ? 5 : 2, total: 5, found: 1 };
      }
      else if (url.pathname.startsWith('/api/admin/promos/')) {
        const [, , , , account, shortcode, action] = url.pathname.split('/');
        const id = `${account}:${shortcode}`;
        const item = stored.get(id);
        if (!item) return route.fulfill({ status: 404, json: { detail: 'Fixture not found.' } });
        if (request.method() === 'GET' && heldDetail === id) {
          await new Promise(resolve => { releaseDetail = resolve; });
          if (rejectDetail) return route.fulfill({ status: 400, json: { detail: 'The next signal could not be loaded.' } });
        }
        if (request.method() === 'PATCH') {
          const payload = request.postDataJSON(); writes.push({ id, payload });
          if (holdPatch) await new Promise(resolve => { releasePatch = resolve; });
          if (failPatch) return route.fulfill({ status: 409, json: { detail: 'Review save rejected. Please retry.' } });
          Object.assign(item, payload, { overrides: { ...item.overrides, ...payload } });
        } else if (action === 'jev-review') {
          jevRequests.push(id);
          if (holdJev) await new Promise(resolve => { releaseJev = resolve; });
          item.jev_review = { recommendation: 'human_review', semanticPromo: 0.64, commercialRelationship: 'affiliate_offer', deterministicClassification: item.classification, guidance: 'Compare the offer with the visible disclosure.', contextSource: 'caption', contextExcerpt: item.caption, source: 'jev_manual_review' };
        }
        data = item;
      }
      return route.fulfill({ json: data });
    }
    if (url.origin === new URL(base).origin) return route.continue();
    // Covers, external fonts, Google/Firebase and original-post URLs never reach the network.
    return route.fulfill({ status: 204, body: '' });
  });
  await page.goto(`${base}/promos.html?desktop=1`);
  await page.locator('.promo-card').first().waitFor();
  assert.equal(await page.locator('.promo-results-heading strong').textContent(), '2 posts');
  assert.equal(jevRequests.length, 0); assert.equal(scans.length, 0);
  assert.match(await page.locator('.promo-scope-note').textContent(), /2 loaded.*Grouped automatically/);
  assert.equal(await page.locator('.promo-metrics').count(), 0);
  assert.equal(await page.locator('.post-stack-trigger').count(), 1);
  await page.locator('.post-stack-trigger').click();
  assert.equal(await page.locator('.post-stack-modal .promo-card').count(), 2);
  await page.getByRole('button', { name: 'Close stack', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.post-stack-modal'));
  await page.locator('.post-stack-trigger').click();
  await page.locator('.post-stack-modal [data-promo-key="alpha:ALPHA"]').click();
  await page.getByRole('heading', { name: 'Review @alpha', exact: true }).waitFor();
  assert.equal(await page.locator('.post-stack-modal').count(), 0, 'Selecting a grouped post hands off to the inspector');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#root').evaluate(node => node.inert), false);
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  console.log('PASS original Promos cards and automatic topic grouping without metric panels');
  const alphaCard = page.locator('[data-promo-key="alpha:ALPHA"]');
  await alphaCard.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close promotion review');
  assert.equal(await page.locator('#root').evaluate(node => node.inert), true);
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
  assert.deepEqual(await dialog.locator('.promo-caption mark').allTextContents(), ['This is not sponsored.', 'Comment NOTES']);
  assert.match(await dialog.locator('.promo-caption').textContent(), /Orbit Notes for my research/);
  assert.equal(await dialog.locator('a[href^="javascript:"],a[href^="data:"]').count(), 0);
  assert.match(await dialog.locator('.promo-jev-result').textContent(), /22% semantic support/);
  assert.match(await dialog.locator('.promo-jev-result').textContent(), /not a payment probability/);
  assert.match(await dialog.locator('.promo-jev-result').textContent(), /Rules result at JEV review/);
  assert.equal(await dialog.locator('.promo-related-list button').count(), 1);
  const firstFocusable = dialog.locator('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled])').first();
  const lastFocusable = dialog.locator('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled])').last();
  await firstFocusable.focus(); await page.keyboard.press('Shift+Tab');
  assert.equal(await lastFocusable.evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await firstFocusable.evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(), 0);
  assert.equal(await alphaCard.evaluate(node => node === document.activeElement), true);
  await alphaCard.click();
  heldDetail = 'beta:BETA'; rejectDetail = true;
  await dialog.locator('.promo-related-list button').click();
  await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.getAttribute('aria-busy') === 'true');
  assert.equal(await dialog.getByRole('button', { name: 'Mark reviewed & next' }).isDisabled(), true);
  assert.equal(await dialog.getByRole('button', { name: 'Close promotion review' }).isDisabled(), true);
  await page.waitForTimeout(30); releaseDetail();
  await dialog.getByRole('alert').waitFor();
  assert.match(await dialog.getByRole('alert').textContent(), /next signal could not be loaded/);
  assert.equal(await page.getByRole('heading', { name: 'Review @alpha', exact: true }).count(), 1);
  heldDetail = ''; rejectDetail = false;
  await dialog.locator('.promo-related-list button').click();
  await page.getByRole('heading', { name: 'Review @beta', exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Previous signal' }).click();
  await page.getByRole('heading', { name: 'Review @alpha', exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Copy review brief', exact: true }).click();
  assert.match(await page.evaluate(() => window.__reviewBrief), /PROMOS REVIEW BRIEF/);
  assert.equal(jevRequests.length, 0);
  console.log('PASS Promos evidence sources, exact caption highlights, related comparison, clipboard, focus trap and restore');

  await dialog.getByLabel('Classification', { exact: true }).selectOption('not_promo');
  await dialog.getByLabel('Client / brand', { exact: true }).fill('Orbit');
  await dialog.getByLabel('Product', { exact: true }).fill('Orbit Research');
  await page.keyboard.press('Escape');
  assert.equal(await dialog.locator('.promo-unsaved-confirmation').count(), 1);
  await dialog.getByRole('button', { name: 'Keep editing', exact: true }).click();
  assert.equal(await dialog.getByLabel('Product', { exact: true }).inputValue(), 'Orbit Research');
  failPatch = true; holdPatch = true;
  await dialog.getByRole('button', { name: 'Save corrections', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.getAttribute('aria-busy') === 'true');
  assert.equal(await dialog.getByRole('button', { name: 'Close promotion review' }).isDisabled(), true);
  assert.equal(await dialog.getByRole('button', { name: 'Next signal' }).isDisabled(), true);
  await page.keyboard.press('Escape'); assert.equal(await dialog.count(), 1);
  await page.waitForTimeout(30); assert.equal(writes.length, 1);
  releasePatch(); holdPatch = false;
  await dialog.getByRole('alert').waitFor();
  assert.match(await dialog.getByRole('alert').textContent(), /Review save rejected/);
  assert.equal(await dialog.getByLabel('Product', { exact: true }).inputValue(), 'Orbit Research');
  assert.equal(stored.get('alpha:ALPHA').classification, 'likely');
  failPatch = false;
  await dialog.getByRole('button', { name: 'Save corrections', exact: true }).click();
  await dialog.getByText('Corrections saved.', { exact: true }).waitFor();
  assert.deepEqual(writes.at(-1).payload, { classification: 'not_promo', client: 'Orbit', product: 'Orbit Research' });
  assert.match(await dialog.locator('.promo-review-summary').textContent(), /Not a promotion/);
  assert.equal(stored.get('alpha:ALPHA').review_status, 'new');
  await dialog.getByRole('button', { name: 'Mark reviewed & next', exact: true }).click();
  await page.getByRole('heading', { name: 'Review @beta', exact: true }).waitFor();
  assert.equal(stored.get('alpha:ALPHA').review_status, 'reviewed');
  assert.equal(await page.locator('[data-promo-key="alpha:ALPHA"]').count(), 0);
  assert.equal(jevRequests.length, 0);
  console.log('PASS Promos failed-save retention, pending controls, exact PATCH corrections and reviewed-next flow');

  await dialog.getByLabel('Product', { exact: true }).fill('Beta correction');
  holdJev = true;
  await dialog.getByRole('button', { name: 'Review with JEV', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.getAttribute('aria-busy') === 'true');
  await page.waitForTimeout(30); assert.deepEqual(jevRequests, ['beta:BETA']);
  assert.equal(await dialog.getByRole('button', { name: 'Dismiss & next', exact: true }).isDisabled(), true);
  releaseJev(); holdJev = false;
  await dialog.getByText('64% semantic support', { exact: true }).waitFor();
  assert.equal(await dialog.getByLabel('Product', { exact: true }).inputValue(), 'Beta correction');
  await dialog.getByRole('button', { name: 'Dismiss & next', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.equal(stored.get('beta:BETA').review_status, 'dismissed');
  await page.getByLabel('Review status', { exact: true }).selectOption('dismissed');
  await page.locator('[data-promo-key="beta:BETA"]').click();
  await dialog.getByRole('button', { name: 'Restore to new', exact: true }).click();
  await dialog.getByText('Review saved.', { exact: true }).waitFor();
  assert.equal(stored.get('beta:BETA').review_status, 'new');
  await page.keyboard.press('Escape');
  await page.getByLabel('Review status', { exact: true }).selectOption('');
  await page.getByRole('button', { name: /Load more posts/ }).click();
  await page.locator('.promo-results-heading strong').getByText('3 posts', { exact: true }).waitFor();
  assert.equal(await page.locator('.promo-results-heading strong').textContent(), '3 posts');
  await page.getByLabel('Search loaded posts', { exact: true }).fill('ORBIT20');
  assert.equal(await page.locator('.promo-results-heading strong').textContent(), '3 posts');
  await page.getByLabel('Search loaded posts', { exact: true }).fill('I purchased this myself');
  assert.equal(await page.locator('.promo-card').count(), 1);
  await page.getByLabel('Search loaded posts', { exact: true }).fill('');
  console.log('PASS explicit JEV action, dismiss/restore, pagination, and full evidence search');

  await page.getByLabel('Account · loaded', { exact: true }).selectOption('alpha');
  await page.locator('[data-promo-key="alpha:ALPHA"]').click();
  await page.getByRole('heading', { name: 'Review @alpha', exact: true }).waitFor();
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await dialog.evaluate(node => { node.scrollTop = 0; });
    await page.screenshot({ path: path.join(output, `promos-review-${theme}.png`), animations: 'disabled' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.evaluate(node => { node.scrollTop = 0; });
  await page.screenshot({ path: path.join(output, 'promos-review-mobile.png'), animations: 'disabled' });
  assert.equal(await dialog.evaluate(node => node.scrollWidth - node.clientWidth <= 1), true, 'Inspector must fit a mobile viewport');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.body.scrollWidth - window.innerWidth <= 1), true, 'Promos queue must fit a mobile viewport');

  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByLabel('Account · loaded', { exact: true }).selectOption('');
  heldReview = 'reviewed';
  await page.getByLabel('Review status', { exact: true }).selectOption('reviewed');
  await page.waitForTimeout(50);
  assert.equal(await page.locator('.promo-card').count(), 0, 'Changing server filters clears stale cards');
  assert.equal(typeof releaseList, 'function');
  await page.getByLabel('Review status', { exact: true }).selectOption('new');
  await page.locator('[data-promo-key="beta:BETA"]').first().waitFor();
  heldReview = null; releaseList();
  await page.waitForTimeout(50);
  assert.equal(await page.locator('[data-promo-key="alpha:ALPHA"]').count(), 0, 'Late reviewed response must not replace new queue');
  failList = true;
  await page.getByLabel('Review status', { exact: true }).selectOption('dismissed');
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').textContent(), /queue could not be loaded/);
  assert.equal(await page.locator('.promo-card').count(), 0);
  failList = false;
  await page.getByRole('button', { name: 'Reload queue', exact: true }).click();
  await page.getByText('No posts in this review queue.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('alert').count(), 0);
  await page.getByLabel('Review status', { exact: true }).selectOption('');
  await page.locator('.promo-card').first().waitFor();
  await page.screenshot({ path: path.join(output, 'promos-original-cards.png'), animations: 'disabled' });

  await page.locator('.promo-detection-tools summary').click();
  jobState = 'running';
  await page.getByRole('button', { name: 'Scan with rules', exact: true }).click();
  await page.getByText('2 / 5 posts checked · 1 candidates found', { exact: true }).waitFor();
  assert.equal(scans.length, 1);
  assert.equal(await page.getByRole('button', { name: 'Scan with rules', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Find missed promos with JEV', exact: true }).isDisabled(), true);
  assert.deepEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem('sentient.promos.job:developer@example.test'))), { id: 'fixture-job', kind: 'rules' });
  failJob = true;
  await page.getByRole('button', { name: 'Reconnect to this scan', exact: true }).waitFor();
  assert.match(await page.locator('.promo-job').textContent(), /scan may still be running/);
  assert.equal(scans.length, 1);
  await page.reload();
  await page.locator('.promo-detection-tools summary').click();
  await page.getByRole('button', { name: 'Reconnect to this scan', exact: true }).waitFor();
  assert.equal(scans.length, 1, 'Reload resumes the saved job instead of starting another scan');
  await page.getByLabel('Review status', { exact: true }).selectOption('reviewed');
  await page.locator('[data-promo-key="alpha:ALPHA"]').waitFor();
  failJob = false; jobState = 'done';
  const refreshedReviewedQueue = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/admin/promos' && url.searchParams.get('review') === 'reviewed';
  });
  await page.getByRole('button', { name: 'Reconnect to this scan', exact: true }).click();
  await page.getByText('Rule scan · Complete', { exact: true }).waitFor();
  await refreshedReviewedQueue;
  await page.waitForFunction(() => document.querySelector('.promo-results-heading button')?.textContent === 'Refresh');
  assert.equal(await page.locator('[data-promo-key="alpha:ALPHA"]').count(), 1);
  assert.equal(await page.locator('[data-promo-key="beta:BETA"]').count(), 0, 'Scan completion refreshes the current review filter');
  assert.equal(scans.length, 1);
  assert.equal(await page.getByRole('button', { name: 'Scan with rules', exact: true }).isDisabled(), false);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('sentient.promos.job:developer@example.test')), null);
  assert.ok(jobRequests.length >= 4);
  console.log('PASS stale server filter response, failed queue retry, running scan lock, persisted job, reconnect and current-filter refresh');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    document.documentElement.dataset.effects = 'on';
    document.documentElement.style.setProperty('--motion-enter', '600ms');
    document.documentElement.style.setProperty('--motion-exit', '400ms');
  });
  await page.locator('[data-promo-key="alpha:ALPHA"]').click();
  await page.waitForFunction(() => document.querySelector('.promo-review-dialog')?.getAnimations().some(animation => animation.playState === 'running'));
  await page.evaluate(() => document.querySelector('[aria-label="Close promotion review"]').click());
  await page.waitForFunction(() => document.querySelector('.promo-review-modal')?.dataset.state === 'closing');
  assert.equal(await page.locator('#root').evaluate(node => node.inert), true, 'Background stays inert through the exit');
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
  assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true, 'Focus stays within the exiting inspector');
  assert.equal(await dialog.getByRole('button', { name: 'Mark reviewed & next', exact: true }).isDisabled(), true);
  // A new parent selection can arrive during an exit; its canceled completion must not remove the reopened detail.
  await page.evaluate(() => document.querySelector('[data-promo-key="alpha:ALPHA"]').click());
  await page.waitForFunction(() => document.querySelector('.promo-review-modal')?.dataset.state === 'open');
  await page.waitForTimeout(450);
  assert.equal(await dialog.count(), 1, 'Reopening cancels the previous exit completion');
  await page.evaluate(() => document.querySelector('[aria-label="Close promotion review"]').click());
  await page.waitForFunction(() => document.querySelector('.promo-review-modal')?.dataset.state === 'closing');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await page.locator('#root').evaluate(node => node.inert), false);
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  assert.equal(await page.locator('[data-promo-key="alpha:ALPHA"]').evaluate(node => node === document.activeElement), true);

  await page.getByLabel('Review status', { exact: true }).selectOption('');
  await page.locator('.promo-results-heading strong').getByText('2 posts', { exact: true }).waitFor();
  await page.getByLabel('Account · loaded', { exact: true }).selectOption('alpha');
  await page.locator('[data-promo-key="alpha:ALPHA"]').click();
  await page.waitForFunction(() => document.querySelector('.promo-review-dialog')?.getAnimations().some(animation => animation.playState === 'running'));
  await page.evaluate(() => { document.documentElement.dataset.effects = 'off'; });
  await page.waitForFunction(() => !document.querySelector('.promo-review-modal')?.getAnimations({ subtree: true }).some(animation => animation.playState === 'running'));
  assert.equal(await dialog.evaluate(node => getComputedStyle(node).transform), 'none');
  await dialog.locator('.promo-related-list button').filter({ hasText: '@beta' }).click();
  await page.getByRole('heading', { name: 'Review @beta', exact: true }).waitFor();
  assert.equal(await dialog.getByText('Outside current filtered view', { exact: true }).count(), 1);
  assert.equal(await dialog.evaluate(node => node.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length), 0);
  await page.evaluate(() => {
    document.documentElement.dataset.effects = 'on';
    document.documentElement.style.setProperty('--motion-base', '600ms');
  });
  await dialog.locator('.promo-related-list button').filter({ hasText: '@alpha' }).click();
  await page.getByRole('heading', { name: 'Review @alpha', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('.promo-review-layout')?.getAnimations().some(animation => animation.playState === 'running'));
  assert.equal(await page.locator('.promo-review-modal').evaluate(node => node.getAnimations().length), 0, 'Changing posts animates content without flashing the backdrop');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => !document.querySelector('.promo-review-modal')?.getAnimations({ subtree: true }).some(animation => animation.playState === 'running'));
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(), 0, 'Reduced motion closes without an animation delay');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('[data-promo-key="alpha:ALPHA"]').click();
  await page.getByRole('heading', { name: 'Review @alpha', exact: true }).waitFor();
  await page.evaluate(() => document.querySelector('[aria-label="Close promotion review"]').click());
  await page.waitForFunction(() => document.querySelector('.promo-review-modal')?.dataset.state === 'closing');
  await page.evaluate(() => { document.documentElement.dataset.effects = 'off'; });
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await page.locator('#root').evaluate(node => node.inert), false, 'Disabling effects mid-exit completes cleanup');
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  console.log('PASS interruptible inspector enter/exit, retained focus/locks, content navigation and live motion preferences');
  assert.deepEqual(errors, []);
  console.log(`PASS Promos browser smoke; screenshots: ${output}`);
} finally {
  releasePatch?.(); releaseJev?.(); releaseDetail?.(); releaseList?.();
  await browser?.close(); await server.close();
}
