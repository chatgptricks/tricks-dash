// Promos engagement integration gate: fixture every API/auth/external request.
// Price scenarios must stay local; only stored post metrics feed the estimates.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const output = fs.mkdtempSync(path.join(os.tmpdir(), 'sentient-promos-engagement-'));
const server = await createServer({
  logLevel: 'error', cacheDir: path.join(output, 'vite-cache'),
  resolve: { alias: {
    'firebase/auth': path.resolve('smoke/stub-firebase-auth.js'),
    'firebase/app': path.resolve('smoke/stub-firebase-app.js'),
  } },
  server: { host: 'localhost', port: 0 },
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.CHROME_PATH || (fs.existsSync(macChrome) ? macChrome : undefined);
const metric = (average, count = 10) => ({ count, total: average === null ? null : average * count, average });
const unknown = () => metric(null, 0);
const captured = '2026-10-16T12:00:00Z';
const accounts = [
  {
    handle: 'alpha', label: 'Alpha Research', group: 'competitors', followers: 100000,
    followers_captured_at: captured, post_count: 10, engagement_post_count: 10,
    average_engagements: 2500, engagement_rate_pct: 2.5,
    complete_engagement_post_count: 8, average_complete_engagements: 2800,
    metrics: { likes: metric(2400), comments: metric(100), shares: metric(200, 8), saves: metric(100, 8), impressions: unknown(), video_views: metric(50000, 6), video_plays: metric(60000, 6) },
    first_post_at: '2026-10-01T12:00:00Z', last_post_at: '2026-10-15T12:00:00Z', metrics_updated_at: captured,
  },
  {
    handle: 'beta', label: 'Beta Studio', group: 'sentient', followers: null,
    followers_captured_at: null, post_count: 4, engagement_post_count: 4,
    average_engagements: 0, engagement_rate_pct: null,
    complete_engagement_post_count: 0, average_complete_engagements: null,
    metrics: { likes: metric(0, 4), comments: metric(0, 4), shares: unknown(), saves: unknown(), impressions: unknown(), video_views: unknown(), video_plays: unknown() },
    first_post_at: '2026-10-02T12:00:00Z', last_post_at: '2026-10-14T12:00:00Z', metrics_updated_at: captured,
  },
  {
    handle: 'gamma', label: 'Gamma News', group: 'competitors', followers: 250000,
    followers_captured_at: captured, post_count: 20, engagement_post_count: 0,
    average_engagements: null, engagement_rate_pct: null,
    complete_engagement_post_count: 0, average_complete_engagements: null,
    metrics: { likes: unknown(), comments: unknown(), shares: unknown(), saves: unknown(), impressions: metric(100000, 3), video_views: unknown(), video_plays: unknown() },
    first_post_at: '2026-10-03T12:00:00Z', last_post_at: '2026-10-13T12:00:00Z', metrics_updated_at: captured,
  },
];
const promotion = {
  account: 'alpha', shortcode: 'ALPHA', classification: 'disclosed', review_status: 'new',
  account_group: 'competitors', account_group_label: 'Competitors', client: 'Orbit', product: 'Orbit Notes',
  published_at: '2026-10-15T12:00:00Z', first_detected_at: '2026-10-15T13:00:00Z',
  caption: 'Try Orbit Notes. #ad', permalink: 'https://www.instagram.com/p/ALPHA/',
  evidence: [{ family: 'explicit', rule: '#ad', source: 'caption', text: '#ad' }],
};
let browser, activePage;

try {
  browser = await chromium.launch({ executablePath, headless: true });
  for (const language of ['en', 'es']) {
    const es = language === 'es';
    const label = (en, spanish) => es ? spanish : en;
    // Sales has no developer/admin privileges and must have the same analysis tab.
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
    const errors = [], engagementRequests = [], mutations = [], remoteRequests = [];
    let failEngagement = false;
    await context.addInitScript(initial => {
      localStorage.setItem('sentient.lang', initial);
      localStorage.setItem('sentient.language', initial);
      localStorage.setItem('sentient.theme', 'dark');
      localStorage.setItem('sentient.effects', 'off');
    }, language);
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) {
        assert.equal(request.headers().authorization, 'Bearer tok');
        if (request.method() !== 'GET' && !url.pathname.endsWith('/me/preferences')) {
          mutations.push({ method: request.method(), path: url.pathname, body: request.postData() });
          return route.fulfill({ status: 405, json: { detail: 'The engagement calculator must not write account rates.' } });
        }
        let data = {};
        if (url.pathname === '/api/dashboard/me') data = { email: 'developer@example.test', role: 'sales', is_admin: false, is_dev: false };
        else if (url.pathname.endsWith('/me/preferences')) data = { preferences: { language } };
        else if (url.pathname === '/api/admin/promos') data = { items: [promotion], next_cursor: null };
        else if (url.pathname === '/api/admin/promos/engagement') {
          engagementRequests.push({ days: url.searchParams.get('days'), format: url.searchParams.get('format'), method: request.method() });
          if (failEngagement) return route.fulfill({ status: 400, json: { detail: 'Stored engagement could not be loaded. Please retry.' } });
          data = { accounts, period: { days: Number(url.searchParams.get('days')), from: url.searchParams.get('days') === '0' ? null : '2026-09-16T12:00:00Z', to: captured }, format: url.searchParams.get('format') || 'all', generated_at: captured };
        }
        return route.fulfill({ json: data });
      }
      if (url.origin === new URL(base).origin) return route.continue();
      remoteRequests.push(url.origin);
      return route.fulfill({ status: 204, body: '' });
    });
    const page = await context.newPage();
    activePage = page;
    page.on('pageerror', issue => errors.push(issue.message));
    const row = handle => page.locator(`[data-engagement-account="${handle}"]`);
    const accountButton = handle => page.getByRole('button', { name: label(`Calculate post price for @${handle}`, `Calcular precio de post para @${handle}`), exact: true });
    const engagementTab = page.getByRole('tab', { name: 'Engagement', exact: true });
    const dialog = page.getByRole('dialog');
    const result = key => dialog.locator(`[data-cost="${key}"]`);
    const numberIn = async locator => {
      const value = await locator.getAttribute('data-value');
      assert.notEqual(value, '', 'Expected a numeric cost result');
      return Number(value);
    };

    await page.goto(`${base}/promos.html?desktop=1`);
    await page.locator('.promo-card').waitFor();
    assert.equal(await page.getByRole('tab', { name: label('Promotions', 'Promociones'), exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(engagementRequests.length, 0, 'Stored account aggregation is fetched only when the tab opens');
    await engagementTab.click();
    await row('alpha').waitFor();
    assert.equal(await engagementTab.getAttribute('aria-selected'), 'true');
    assert.deepEqual(engagementRequests, [{ days: '30', format: 'all', method: 'GET' }]);
    assert.equal(await page.locator('.promo-engagement [data-engagement-account]').count(), 3);
    assert.match(await row('alpha').textContent(), /2[.,]5\s*%/);
    assert.match(await row('beta').textContent(), /[—–]|(?:Unknown|Desconocido|Sin datos)/);
    assert.match(await row('gamma').textContent(), /[—–]|(?:Unknown|Desconocido|Sin datos)/);
    assert.equal(await row('beta').locator('.promo-engagement-value > span').first().textContent(), '0', 'A measured zero is displayed as zero');
    assert.equal(await row('beta').locator('.promo-engagement-value > span').nth(2).textContent(), '—', 'Missing shares are distinct from measured-zero likes');
    console.log(`PASS Promos ${language}: Sales access, lazy aggregation, measured rate and incomplete accounts`);

    await accountButton('alpha').click();
    await page.getByRole('dialog', { name: label('Post price · @alpha', 'Precio de post · @alpha'), exact: true }).waitFor();
    const price = dialog.getByLabel(label('Price per post', 'Precio por post'), { exact: true });
    const impressions = dialog.getByLabel(label('Expected impressions (optional)', 'Impresiones esperadas (opcional)'), { exact: true });
    assert.equal(await price.inputValue(), '', 'Each account opens with an empty scenario price');
    await price.fill('500');
    assert.equal(await numberIn(result('cpe')), 0.2, 'CPE uses the account’s likes + comments average');
    assert.equal(await numberIn(result('completeCpe')), 500 / 2800, 'Full CPE uses only the fully measured post cohort');
    assert.ok(Math.abs(await numberIn(result('costPerLike')) - 500 / 2400) < 0.01);
    assert.equal(await numberIn(result('costPerComment')), 5);
    assert.equal(await numberIn(result('costPerShare')), 2.5);
    assert.equal(await numberIn(result('costPerSave')), 5);
    assert.match(await result('cpm').textContent(), /[—–]|(?:Unknown|Desconocido|Sin datos)/, 'CPM cannot infer impressions from video views');
    await impressions.fill('100000');
    assert.equal(await numberIn(result('cpm')), 5);
    assert.equal(await numberIn(result('costPerThousandViews')), 10, 'Video-view cost has a separate denominator');
    await price.fill('1000');
    assert.equal(await numberIn(result('cpe')), 0.4);
    assert.equal(await numberIn(result('cpm')), 10);
    await dialog.getByRole('combobox', { name: label('Currency', 'Moneda'), exact: true }).selectOption('EUR');
    assert.match(await result('cpe').textContent(), /€|EUR/);
    assert.equal(await numberIn(result('cpe')), 0.4, 'Currency changes the scenario unit without invented exchange rates');
    await price.fill('-1');
    assert.match(await result('cpe').textContent(), /[—–]|(?:Unknown|Desconocido|Sin datos)/);
    await price.fill('500');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await accountButton('alpha').evaluate(node => document.activeElement === node), true);
    await accountButton('alpha').click();
    await dialog.waitFor();
    assert.equal(await price.inputValue(), '', 'Closing a scenario discards its price rather than saving a fixed account rate');
    assert.equal(await impressions.inputValue(), '');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await accountButton('beta').click();
    await dialog.waitFor();
    await price.fill('500');
    for (const key of ['cpe', 'cpm', 'costPerLike', 'costPerThousandViews']) {
      assert.match(await result(key).textContent(), /[—–]|(?:Unknown|Desconocido|Sin datos)/, `${key} must not divide by missing or measured-zero metrics`);
    }
    assert.doesNotMatch(await dialog.textContent(), /Infinity|NaN/);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual(mutations, [], 'Scenario inputs do not trigger API mutations');
    console.log(`PASS Promos ${language}: variable price, CPE/CPM, currency, missing metrics and discarded scenarios`);

    const initialRequests = engagementRequests.length;
    const panel = page.locator('.promo-engagement');
    await panel.getByLabel(label('Search accounts', 'Buscar cuentas'), { exact: true }).fill('Beta Studio');
    assert.equal(await panel.locator('[data-engagement-account]').count(), 1);
    assert.equal(await row('beta').count(), 1);
    await panel.getByLabel(label('Search accounts', 'Buscar cuentas'), { exact: true }).fill('');
    await panel.getByRole('combobox', { name: label('Account group', 'Grupo de cuentas'), exact: true }).selectOption('competitors');
    assert.equal(await panel.locator('[data-engagement-account]').count(), 2);
    assert.equal(await row('beta').count(), 0);
    await panel.getByRole('combobox', { name: label('Account group', 'Grupo de cuentas'), exact: true }).selectOption('');
    await panel.getByRole('combobox', { name: label('Sort accounts', 'Ordenar cuentas'), exact: true }).selectOption('followers');
    assert.equal(await panel.locator('[data-engagement-account]').first().getAttribute('data-engagement-account'), 'gamma');
    assert.equal(engagementRequests.length, initialRequests, 'Search, groups and sort use the loaded account snapshot');

    const periodResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/admin/promos/engagement' && url.searchParams.get('days') === '90';
    });
    await panel.getByRole('combobox', { name: label('Period', 'Período'), exact: true }).selectOption('90');
    await periodResponse;
    await row('alpha').waitFor();
    assert.equal(engagementRequests.at(-1).days, '90');
    const formatResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/admin/promos/engagement' && url.searchParams.get('format') === 'reel';
    });
    await panel.getByRole('combobox', { name: label('Post format', 'Formato de post'), exact: true }).selectOption('reel');
    await formatResponse;
    await row('alpha').waitFor();
    assert.deepEqual(engagementRequests.at(-1), { days: '90', format: 'reel', method: 'GET' });
    failEngagement = true;
    await panel.getByRole('combobox', { name: label('Period', 'Período'), exact: true }).selectOption('0');
    await panel.getByRole('alert').waitFor();
    assert.match(await panel.getByRole('alert').textContent(), /Stored engagement could not be loaded/);
    assert.equal(await panel.locator('[data-engagement-account]').count(), 0, 'Failed refresh must not show stale account metrics for a new period');
    failEngagement = false;
    await panel.getByRole('button', { name: label('Retry', 'Reintentar'), exact: true }).click();
    await row('alpha').waitFor();
    assert.deepEqual(engagementRequests.at(-1), { days: '0', format: 'reel', method: 'GET' });
    console.log(`PASS Promos ${language}: local filters, period/format requests, failed-refresh clearing and retry`);

    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await page.screenshot({ path: path.join(output, `promos-engagement-${language}-${theme}.png`), animations: 'disabled' });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, `promos-engagement-${language}-mobile.png`), animations: 'disabled' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Engagement page must fit a 390px viewport');
    await accountButton('alpha').click();
    await dialog.waitFor();
    await price.fill('500');
    await impressions.fill('100000');
    await page.screenshot({ path: path.join(output, `promos-price-${language}-mobile.png`), animations: 'disabled' });
    assert.equal(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true, 'Post-price dialog must fit a 390px viewport');
    assert.deepEqual(mutations, []);
    assert.deepEqual(errors, []);
    console.log(`PASS Promos ${language}: dark/light, mobile table and calculator (${remoteRequests.length} external requests intercepted)`);
    await context.close();
  }
  console.log(`PASS Promos engagement browser smoke; screenshots: ${output}`);
} catch (issue) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: path.join(output, 'failure.png'), animations: 'disabled' });
    console.error(`Promos engagement failure screenshot: ${output}/failure.png`);
    console.error(await activePage.locator('body').ariaSnapshot());
  }
  throw issue;
} finally {
  await browser?.close();
  await server.close();
}
