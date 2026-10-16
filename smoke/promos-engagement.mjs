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
    calculated_at: '2026-10-14T12:00:00Z', cache_expires_at: '2026-10-21T12:00:00Z', from_cache: true,
    followers_captured_at: captured, post_count: 10, engagement_post_count: 10,
    average_engagements: 2500, engagement_rate_pct: 2.5,
    complete_engagement_post_count: 8, average_complete_engagements: 2800,
    metrics: { likes: metric(2400), comments: metric(100), shares: metric(200, 8), saves: metric(100, 8), impressions: unknown(), video_views: metric(50000, 6), video_plays: metric(60000, 6) },
    first_post_at: '2025-01-01T12:00:00Z', last_post_at: '2026-10-15T12:00:00Z', metrics_updated_at: captured,
  },
  {
    // Registered dashboard account outside the Promotions feed and disabled in Promos.
    handle: 'beta', label: 'Beta Studio', group: 'sentient', promos_enabled: false, followers: null,
    calculated_at: '2026-10-16T12:00:00Z', cache_expires_at: '2026-10-23T12:00:00Z', from_cache: false,
    followers_captured_at: null, post_count: 4, engagement_post_count: 4,
    average_engagements: 0, engagement_rate_pct: null,
    complete_engagement_post_count: 0, average_complete_engagements: null,
    metrics: { likes: metric(0, 4), comments: metric(0, 4), shares: unknown(), saves: unknown(), impressions: unknown(), video_views: unknown(), video_plays: unknown() },
    first_post_at: '2026-10-02T12:00:00Z', last_post_at: '2026-10-14T12:00:00Z', metrics_updated_at: captured,
  },
  {
    handle: 'gamma', label: 'Gamma News', group: 'competitors', followers: 250000,
    calculated_at: '2026-10-13T12:00:00Z', cache_expires_at: '2026-10-20T12:00:00Z', from_cache: true,
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
const batchAccounts = [...accounts, ...Array.from({ length: 10 }, (_, index) => ({ ...accounts[0], handle: `batch${String(index).padStart(2, '0')}`, label: `Batch account ${index}`, group: 'leads' }))];
let browser, activePage;

try {
  browser = await chromium.launch({ executablePath, headless: true });
  for (const language of ['en', 'es']) {
    const es = language === 'es';
    const label = (en, spanish) => es ? spanish : en;
    // Sales has no developer/admin privileges and must have the same analysis tab.
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
    const errors = [], engagementRequests = [], rosterRequests = [], mutations = [], remoteRequests = [];
    let failEngagement = false, failRoster = true;
    let largeRoster = false, holdBatches = false, heldBatches = [];
    const batchWaiters = [];
    const waitForBatches = count => heldBatches.length >= count ? Promise.resolve() : new Promise(resolve => batchWaiters.push({ count, resolve }));
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
        else if (url.pathname === '/api/admin/promos/engagement/accounts') {
          rosterRequests.push(request.method());
          if (failRoster) return route.fulfill({ status: 400, json: { detail: 'Available accounts could not be loaded.' } });
          data = { accounts: (largeRoster ? batchAccounts : accounts).map(({ handle, label, group }) => ({ handle, label, group, subcategory: null, has_avatar: false })), generated_at: captured };
        }
        else if (url.pathname === '/api/admin/promos/engagement') {
          const selectedHandles = url.searchParams.getAll('accounts');
          assert.ok(selectedHandles.length, 'Every aggregation request must explicitly select accounts');
          engagementRequests.push({ days: url.searchParams.get('days'), format: url.searchParams.get('format'), accounts: selectedHandles, method: request.method() });
          if (failEngagement) return route.fulfill({ status: 400, json: { detail: 'Stored engagement could not be loaded. Please retry.' } });
          const days = Number(url.searchParams.get('days'));
          const calculatedAccounts = (largeRoster ? batchAccounts : accounts).filter(account => selectedHandles.includes(account.handle)).map(account => ({ ...account, calculation_period: {
            days, from: days === 0 ? null : new Date(Date.parse(account.calculated_at) - days * 86400000).toISOString(), to: account.calculated_at,
          } }));
          data = { accounts: calculatedAccounts, period: { days, from: days === 0 ? null : '2026-09-16T12:00:00Z', to: captured }, format: url.searchParams.get('format') || 'all', generated_at: captured, cache: { ttl_days: 7, cached_count: 2, recalculated_count: 1 } };
          if (holdBatches) return new Promise(resolve => {
            heldBatches.push({ handles: selectedHandles, release: async failed => {
              try { await route.fulfill(failed ? { status: 400, json: { detail: 'Stored batch failed. Please retry.' } } : { json: data }); }
              catch { /* The selected-account request may already have been cancelled. */ }
              finally { resolve(); }
            } });
            batchWaiters.filter(waiter => heldBatches.length >= waiter.count).forEach(waiter => waiter.resolve());
          });
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
    const panel = page.locator('.promo-engagement');
    const picker = panel.locator('.promo-account-picker');
    const pickerToggle = picker.locator('summary');
    const apply = panel.getByRole('button', { name: label('View engagement', 'Ver engagement'), exact: true });
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
    assert.equal(engagementRequests.length, 0, 'Stored account aggregation waits for an explicit selection');
    await engagementTab.click();
    await panel.getByRole('alert').waitFor();
    assert.equal(engagementRequests.length, 0, 'A failed roster request must not start aggregation');
    failRoster = false;
    await panel.getByRole('button', { name: label('Retry accounts', 'Reintentar cuentas'), exact: true }).click();
    await pickerToggle.waitFor();
    assert.deepEqual(rosterRequests, ['GET', 'GET'], 'The account roster retries independently');
    assert.equal(await apply.isDisabled(), true, 'Nothing is selected by default');
    assert.equal(await panel.getByRole('searchbox').count(), 0, 'Accounts are selected by group/dropdown rather than manual search');
    assert.equal(await panel.getByRole('combobox', { name: label('Period', 'Período'), exact: true }).count(), 0, 'Engagement always uses the full stored history');
    assert.equal(await panel.getByRole('combobox', { name: label('Post format', 'Formato de post'), exact: true }).count(), 0, 'The account benchmark includes every post format');
    await panel.getByRole('combobox', { name: label('Account group', 'Grupo de cuentas'), exact: true }).selectOption('competitors');
    await pickerToggle.click();
    assert.equal(await picker.getByRole('checkbox').count(), 2);
    await picker.getByRole('button', { name: label('Select this group', 'Seleccionar este grupo'), exact: true }).click();
    assert.equal(await picker.getByRole('checkbox', { checked: true }).count(), 2, 'A whole group can be selected in one action');
    assert.equal(engagementRequests.length, 0, 'Group selection does not calculate engagement');
    await page.keyboard.press('Escape');
    assert.equal(await picker.getAttribute('open'), null);
    assert.equal(await pickerToggle.evaluate(node => document.activeElement === node), true);
    await panel.getByRole('combobox', { name: label('Account group', 'Grupo de cuentas'), exact: true }).selectOption('');
    await pickerToggle.click();
    await picker.getByRole('checkbox', { name: label('Select @beta', 'Seleccionar @beta'), exact: true }).check();
    assert.equal(await picker.getByRole('checkbox', { checked: true }).count(), 3, 'Dashboard accounts outside Promos can be selected across groups');
    assert.equal(engagementRequests.length, 0, 'Individual selection does not calculate engagement');
    await apply.click();
    await row('alpha').waitFor();
    assert.equal(await engagementTab.getAttribute('aria-selected'), 'true');
    assert.deepEqual(engagementRequests, [{ days: '0', format: 'all', accounts: ['alpha', 'beta', 'gamma'], method: 'GET' }]);
    assert.equal(await page.locator('.promo-engagement [data-engagement-account]').count(), 3);
    assert.match(await row('alpha').textContent(), /2[.,]5\s*%/);
    assert.match(await row('beta').textContent(), /[—–]|(?:Unknown|Desconocido|Sin datos)/);
    assert.match(await row('gamma').textContent(), /[—–]|(?:Unknown|Desconocido|Sin datos)/);
    assert.equal(await row('beta').locator('.promo-engagement-value > span').first().textContent(), '0', 'A measured zero is displayed as zero');
    assert.equal(await row('beta').locator('.promo-engagement-value > span').nth(2).textContent(), '—', 'Missing shares are distinct from measured-zero likes');
    const dateText = value => new Intl.DateTimeFormat(es ? 'es-CR' : 'en-US', { dateStyle: 'medium', timeZone: 'America/Costa_Rica' }).format(new Date(value));
    for (const account of accounts) {
      const calculation = row(account.handle).locator('time[data-calculated-at]');
      assert.equal(await calculation.getAttribute('datetime'), account.calculated_at, 'Each account displays its own stored calculation date');
      assert.equal(await calculation.textContent(), dateText(account.calculated_at));
    }
    assert.notEqual(accounts[0].calculated_at, captured, 'Cached fixture must predate the report generation date');
    assert.ok((await page.locator('.promo-engagement-footnote').textContent()).includes(label('Saved calculations are reused for up to 7 days, then recalculated on the next load.', 'Los cálculos guardados se reutilizan hasta por 7 días; después se recalculan al volver a cargar.')));
    const methodology = page.locator('.promo-engagement-method');
    await methodology.locator('summary').click();
    assert.ok((await methodology.textContent()).includes(label('Refresh reuses valid calculations and recalculates them after they expire.', 'Actualizar reutiliza los cálculos vigentes y los recalcula cuando vencen.')));
    await methodology.locator('summary').click();
    console.log(`PASS Promos ${language}: lightweight roster retry, group/dropdown selection, explicit apply and cached calculation dates`);

    await accountButton('alpha').click();
    await page.getByRole('dialog', { name: label('Post price · @alpha', 'Precio de post · @alpha'), exact: true }).waitFor();
    const price = dialog.getByLabel(label('Price per post', 'Precio por post'), { exact: true });
    const impressions = dialog.getByLabel(label('Expected impressions (optional)', 'Impresiones esperadas (opcional)'), { exact: true });
    assert.equal(await dialog.locator('time[data-calculated-at]').getAttribute('datetime'), accounts[0].calculated_at);
    assert.equal(await dialog.locator('time[data-cache-expires-at]').getAttribute('datetime'), accounts[0].cache_expires_at);
    assert.equal(await dialog.locator('time[data-cache-expires-at]').textContent(), dateText(accounts[0].cache_expires_at));
    assert.equal(await dialog.locator('.promo-price-calculation time:not([data-calculated-at]):not([data-cache-expires-at])').count(), 0, 'Full-history benchmarks have no rolling date cutoff');
    assert.ok((await dialog.locator('.promo-price-history').textContent()).includes(dateText(accounts[0].first_post_at)), 'The historical sample can include posts older than 90 days');
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
    await panel.getByRole('combobox', { name: label('Sort accounts', 'Ordenar cuentas'), exact: true }).selectOption('followers');
    assert.equal(await panel.locator('[data-engagement-account]').first().getAttribute('data-engagement-account'), 'gamma');
    await panel.getByRole('combobox', { name: label('Account group', 'Grupo de cuentas'), exact: true }).selectOption('competitors');
    await pickerToggle.click();
    await picker.getByRole('button', { name: label('Clear selection', 'Limpiar selección'), exact: true }).click();
    assert.equal(await apply.isDisabled(), true);
    await picker.getByRole('button', { name: label('Select this group', 'Seleccionar este grupo'), exact: true }).click();
    assert.equal(await panel.locator('[data-engagement-account]').count(), 0, 'Changed account selections hide previous results');
    assert.ok((await panel.getByRole('status').textContent()).includes(label('Selection changed.', 'La selección cambió.')));
    assert.equal(engagementRequests.length, initialRequests, 'Changing sort, groups or accounts never aggregates automatically');
    await apply.click();
    await row('alpha').waitFor();
    assert.deepEqual(engagementRequests.at(-1), { days: '0', format: 'all', accounts: ['alpha', 'gamma'], method: 'GET' });
    assert.equal(await panel.locator('[data-engagement-account]').count(), 2);
    assert.equal(await row('beta').count(), 0, 'Only the selected accounts are requested and rendered');
    await accountButton('alpha').click();
    await dialog.waitFor();
    assert.equal(await dialog.locator('.promo-price-calculation time:not([data-calculated-at]):not([data-cache-expires-at])').count(), 0, 'Changing accounts keeps the full-history benchmark');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    failEngagement = true;
    assert.equal(engagementRequests.length, initialRequests + 1, 'Full-history refresh waits for View engagement');
    await apply.click();
    await panel.getByRole('alert').waitFor();
    assert.match(await panel.getByRole('alert').textContent(), /Stored engagement could not be loaded/);
    assert.equal(await panel.locator('[data-engagement-account]').count(), 0, 'Failed refresh must not show stale account metrics');
    failEngagement = false;
    await panel.getByRole('button', { name: label('Retry', 'Reintentar'), exact: true }).click();
    await row('alpha').waitFor();
    assert.deepEqual(engagementRequests.at(-1), { days: '0', format: 'all', accounts: ['alpha', 'gamma'], method: 'GET' });
    console.log(`PASS Promos ${language}: local sort, deferred account changes, full-history/all-format requests and safe retries`);

    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await page.screenshot({ path: path.join(output, `promos-engagement-${language}-${theme}.png`), animations: 'disabled' });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await pickerToggle.click();
    assert.equal(await picker.locator('.promo-account-options').evaluate(node => node.getBoundingClientRect().right <= innerWidth + 1), true, 'Account dropdown must fit a 390px viewport');
    await page.screenshot({ path: path.join(output, `promos-account-picker-${language}-mobile.png`), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.screenshot({ path: path.join(output, `promos-engagement-${language}-mobile.png`), animations: 'disabled' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Engagement page must fit a 390px viewport');
    await accountButton('alpha').click();
    await dialog.waitFor();
    assert.ok((await dialog.locator('.promo-price-calculation').textContent()).includes(label(`All stored history through ${dateText(accounts[0].calculated_at)}`, `Todo el historial guardado hasta el ${dateText(accounts[0].calculated_at)}`)), 'Full-history calculations show their saved cutoff date');
    await price.fill('500');
    await impressions.fill('100000');
    await page.screenshot({ path: path.join(output, `promos-price-${language}-mobile.png`), animations: 'disabled' });
    assert.equal(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true, 'Post-price dialog must fit a 390px viewport');
    assert.deepEqual(mutations, []);
    assert.deepEqual(errors, []);
    console.log(`PASS Promos ${language}: dark/light, mobile table and calculator (${remoteRequests.length} external requests intercepted)`);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await page.setViewportSize({ width: 1440, height: 1050 });
    largeRoster = true;
    await page.getByRole('tab', { name: label('Promotions', 'Promociones'), exact: true }).click();
    await engagementTab.click();
    await pickerToggle.waitFor();
    await pickerToggle.click();
    await picker.getByRole('button', { name: label('Select all accounts', 'Seleccionar todas las cuentas'), exact: true }).click();
    assert.equal(await picker.getByRole('checkbox', { checked: true }).count(), 13);
    const beforeBatches = engagementRequests.length;
    assert.equal(await panel.locator('[data-engagement-account]').count(), 0);
    holdBatches = true;
    await apply.click();
    await waitForBatches(2);
    assert.equal(engagementRequests.length, beforeBatches + 2, 'Only two requests may start before a batch completes');
    assert.ok(heldBatches.every(batch => batch.handles.length <= 5));
    assert.equal(await panel.locator('[data-engagement-account]').count(), 0, 'Pending batches cannot publish partial rows');
    await heldBatches[1].release();
    await waitForBatches(3);
    assert.equal(await panel.locator('[data-engagement-account]').count(), 0, 'Completing one batch still cannot publish partial rows');
    await heldBatches[2].release();
    await heldBatches[0].release();
    await row('alpha').waitFor();
    assert.equal(await panel.locator('[data-engagement-account]').count(), 13);
    assert.deepEqual(engagementRequests.slice(beforeBatches).flatMap(batch => batch.accounts).sort(), batchAccounts.map(account => account.handle).sort(), 'The UI batches exactly the selected accounts, without duplicates');
    assert.ok(engagementRequests.slice(beforeBatches).every(batch => batch.days === '0' && batch.format === 'all'));
    assert.equal(await row('alpha').locator('time[data-calculated-at]').getAttribute('datetime'), accounts[0].calculated_at);

    heldBatches = [];
    await apply.click();
    await waitForBatches(2);
    await heldBatches[0].release();
    await waitForBatches(3);
    await heldBatches[2].release(true);
    await panel.getByRole('alert').waitFor();
    assert.match(await panel.getByRole('alert').textContent(), /Stored batch failed/);
    assert.equal(await panel.locator('[data-engagement-account]').count(), 0, 'A later batch failure discards every earlier completed batch');
    await heldBatches[1].release();

    heldBatches = [];
    const beforeCancellation = engagementRequests.length;
    await panel.getByRole('button', { name: label('Retry', 'Reintentar'), exact: true }).click();
    await waitForBatches(2);
    await pickerToggle.click();
    await picker.getByRole('checkbox', { name: label('Select @alpha', 'Seleccionar @alpha'), exact: true }).uncheck();
    await page.keyboard.press('Escape');
    assert.ok((await panel.getByRole('status').textContent()).includes(label('Selection changed.', 'La selección cambió.')));
    await Promise.all(heldBatches.map(batch => batch.release()));
    assert.equal(engagementRequests.length, beforeCancellation + 2, 'Cancelling selection prevents queued batches and automatic reloads');
    assert.equal(await panel.locator('[data-engagement-account]').count(), 0, 'Cancelled batch responses cannot restore stale rows');
    assert.equal(await panel.getByRole('alert').count(), 0, 'A selection cancellation does not show a request failure');
    assert.deepEqual(errors, []);
    console.log(`PASS Promos ${language}: 13 selected accounts, bounded batches, complete results, batch failure and selection cancellation`);
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
