// Exercise the real Queue/Research suggestion flow with Firebase and every
// remote request mocked. No suggestions, schedules, or metadata are written live.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sentient-queue-suggestions-'));
const output = path.resolve('work/queue-suggestions');
fs.mkdirSync(output, { recursive: true });
const viewerEmail = 'designer@sentientagency.io';
const server = await createServer({
  logLevel: 'error', cacheDir: path.join(temporary, 'vite-cache'),
  resolve: { alias: {
    'firebase/auth': path.resolve('smoke/stub-firebase-auth.js'),
    'firebase/app': path.resolve('smoke/stub-firebase-app.js'),
  } },
  plugins: [{
    name: 'suggestion-pd-auth',
    transform(code, id) {
      if (id.endsWith('/smoke/stub-firebase-auth.js')) return code.replaceAll('user03@example.com', viewerEmail);
      return null;
    },
  }],
  server: { host: 'localhost', port: 4202 },
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(new Date());
const tomorrow = new Date(`${today}T12:00:00Z`);
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
const scheduledDate = tomorrow.toISOString().slice(0, 10);
const accounts = [
  { handle: 'alpha.studio', label: 'Alpha Studio', group: 'sentient', is_active: true },
  { handle: 'beta.studio', label: 'Beta Studio', group: 'sentient', is_active: true },
  { handle: 'inactive.studio', label: 'Inactive Studio', group: 'sentient', is_active: false },
  { handle: 'unmanaged.studio', label: 'Unmanaged Studio', group: 'sentient', is_active: true },
  { handle: 'competitor.studio', label: 'Competitor Studio', group: 'competitors', is_active: true },
];
const viewer = {
  email: viewerEmail, displayName: 'User 03 Current', isAdmin: false, isDev: false,
  operatingRoles: ['pd'], canSelfAssign: false,
};
const managedAccounts = ['alpha.studio', 'beta.studio', 'inactive.studio'];
const researchPost = {
  id: 1, postKey: 'competitor.studio:RESEARCH1', shortcode: 'RESEARCH1', account: 'competitor.studio',
  caption: 'A useful research example worth adapting for our audience.',
  type: 'Carousel', postType: 'Carousel', postDate: `${today}T13:00:00Z`,
  likes: 1200, comments: 40, permalink: 'https://www.instagram.com/p/RESEARCH1/',
  coverUrl: 'https://suggestion-fixtures.test/cover.svg',
};
const queue = {
  viewer, date: today, requests: [], pickRequests: [], hotPickRequests: [],
  planningRequests: [], assignedRequests: [], liveDrafts: [], liveRevision: 0,
  presence: {}, timeBlocks: [], pendingTicketCount: 0,
  designers: [{ ...viewer, roles: ['pd'], isQueueDesigner: true, accounts: managedAccounts }],
  schedulerUsers: [{ ...viewer, roles: ['pd'], isQueueDesigner: true, accounts: managedAccounts }],
  accounts, accountOnboarding: { completed: true, selectedAccounts: managedAccounts },
  tags: [], priorities: ['low', 'medium', 'high', 'urgent'], hours: { start: 0, end: 1440 },
};
const requests = [], errors = [], unexpected = [];
let pendingSuggestion = null, holdSuggestion = false;
let nextFailure = null, returnUnconfirmedSuccess = false;
let lastRequest = null, browser;

const scheduledTask = body => ({
  id: 701, status: 'scheduled', designerEmail: viewerEmail, coordinatorEmail: viewerEmail,
  scheduledDate, scheduledStartMinutes: 620, productionPoints: 3, minutesPerPP: 10,
  durationMinutes: 30, priority: 'normal', tags: [], notes: '', brief: body.reason,
  references: [body.source_url], attachments: [], recommendedAccounts: [body.account],
  post: {
    account: body.source_account || body.account,
    shortcode: body.source_shortcode || 'MANUAL701',
    caption: body.title || 'External suggestion fixture', type: body.post_type,
    permalink: body.source_url, coverUrl: '',
  },
});
const suggestionResult = body => {
  lastRequest = scheduledTask(body);
  queue.requests = [lastRequest];
  queue.planningRequests = [lastRequest];
  queue.assignedRequests = [lastRequest];
  return {
    ok: true, request: lastRequest, alreadyScheduled: false,
    ticket: { id: 702, type: 'post_suggestion', status: 'approved', requesterEmail: viewerEmail,
      requestId: lastRequest.id, title: body.source_url, reason: body.reason, createdAt: new Date().toISOString() },
  };
};
const fulfillSuggestion = async (route, body) => {
  if (nextFailure) {
    const failure = nextFailure;
    nextFailure = null;
    return route.fulfill({ status: 409, json: { detail: failure } });
  }
  if (returnUnconfirmedSuccess) {
    returnUnconfirmedSuccess = false;
    return route.fulfill({ json: { ok: true, ticket: { id: 702, status: 'pending' } } });
  }
  return route.fulfill({ json: suggestionResult(body) });
};

try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (fs.existsSync(chrome) ? chrome : undefined) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, reducedMotion: 'reduce', timezoneId: 'America/Costa_Rica' });
  await context.addInitScript(() => {
    localStorage.setItem('sentient.lang', 'en');
    localStorage.setItem('sentient.theme', 'dark');
    localStorage.setItem('sentient.effects', 'off');
    localStorage.setItem('sentient.queueGuide.v1', 'completed');
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const pathname = url.pathname;
    if (pathname.startsWith('/api/')) {
      if (pathname === '/api/dashboard/me' || pathname === '/api/admin/me') return route.fulfill({ json: {
        role: 'user', email: viewerEmail, display_name: viewer.displayName,
        is_admin: false, is_dev: false, operating_roles: ['pd'], can_self_assign: viewer.canSelfAssign,
      } });
      if (pathname.endsWith('/me/preferences')) return route.fulfill({ json: { preferences: { language: 'en', theme: 'dark', queueGuideCompleted: true } } });
      if (pathname === '/api/dashboard/queue/v2/tickets/post-suggestion') {
        assert.equal(request.method(), 'POST');
        const body = Object.fromEntries(new URLSearchParams(request.postData()));
        requests.push(body);
        if (holdSuggestion) { pendingSuggestion = { route, body }; return; }
        return fulfillSuggestion(route, body);
      }
      if (pathname === '/api/dashboard/queue/v2') return route.fulfill({ json: { ...queue, date: url.searchParams.get('date') || today } });
      if (pathname === '/api/dashboard/queue/v2/presence') return route.fulfill({ json: { presence: {} } });
      if (pathname === '/api/dashboard/queue/v2/live') return route.fulfill({ status: 403, json: { detail: 'Live stream disabled in fixture.' } });
      if (pathname === '/api/dashboard/queue/v2/tickets') return route.fulfill({ json: { tickets: [] } });
      if (pathname === '/api/dashboard/queue/v2/summary') return route.fulfill({ json: { pending: 0 } });
      if (pathname.startsWith('/api/dashboard/avatar/')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#244238"/></svg>' });
      if (pathname.startsWith('/api/dashboard/stacks/')) return route.fulfill({ json: { posts: [] } });
      if (/\/queue\/v2\/requests\/\d+\/history$/.test(pathname)) return route.fulfill({ json: { events: [] } });
      if (/\/queue\/v2\/requests\/\d+$/.test(pathname)) return route.fulfill({ json: { request: lastRequest } });
      if (pathname === '/api/dashboard/queue/v2/source-preview') return route.fulfill({ json: {
        sourceUrl: Object.fromEntries(new URLSearchParams(request.postData())).source_url,
        title: 'External suggestion fixture', platform: 'Web', description: 'Fixture metadata',
      } });
      if (pathname.endsWith('/posts/manifest')) return route.fulfill({ json: { revision: 'suggestion-fixture', sources: [{ source: 'canonical', upperBound: 1 }, { source: 'dashboard', upperBound: 0 }] } });
      if (pathname.endsWith('/posts/page')) return route.fulfill({ json: { source: 'canonical', afterId: 0, nextCursor: 1, done: true, upperBound: 1, revision: 'suggestion-fixture', posts: [researchPost] } });
      if (pathname.endsWith('/posts')) return route.fulfill({ json: { posts: [researchPost], summary: {}, ranges: {} } });
      if (pathname.endsWith('/accounts')) return route.fulfill({ json: { accounts } });
      if (pathname.endsWith('/lists')) return route.fulfill({ json: { lists: [] } });
      if (pathname.endsWith('/posts/media')) return route.fulfill({ json: { items: [] } });
      if (pathname.endsWith('/golden-nuggets')) return route.fulfill({ json: { items: [] } });
      if (pathname.endsWith('/sso/exchange')) return route.fulfill({ json: {} });
      unexpected.push(`${request.method()} ${pathname}`);
      return route.fulfill({ status: 404, json: { detail: 'Unmocked API endpoint.' } });
    }
    if (url.origin === base) return route.continue();
    if (request.resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#244238"/></svg>' });
    return route.fulfill({ status: 404, body: '' });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const modal = page.locator('.queue-suggestion-modal');
  const form = modal.locator('form');
  const source = modal.getByLabel(/^Source link/i);
  const account = modal.getByLabel(/^Account/i);
  const title = modal.getByLabel(/^Title/i);
  const reason = modal.getByLabel(/^Why would this work/i);
  const submit = modal.getByRole('button', { name: 'Suggest and schedule', exact: true });
  const waitForRequest = count => page.waitForFunction(expected => window.__suggestionRequestCount >= expected, count);
  await page.addInitScript(() => {
    window.__suggestionRequestCount = 0;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (url, options = {}) => {
      if (String(url).includes('/tickets/post-suggestion')) window.__suggestionRequestCount += 1;
      return nativeFetch(url, options);
    };
  });
  const openQueue = async () => {
    await page.goto(`${base}/queue.html?desktop=1`);
    await page.getByRole('button', { name: 'Suggest post', exact: true }).click();
    await modal.waitFor();
  };
  const waitForBody = async count => {
    await waitForRequest(count);
    await new Promise((resolve, reject) => {
      const until = Date.now() + 3000;
      const check = () => requests.length >= count ? resolve() : Date.now() > until ? reject(new Error('Suggestion request was not intercepted.')) : setTimeout(check, 10);
      check();
    });
  };
  await openQueue();
  assert.equal(await submit.isDisabled(), true, 'An empty suggestion cannot be submitted.');
  assert.deepEqual(await account.locator('option').evaluateAll(options => options.map(option => option.value).filter(Boolean)), ['alpha.studio', 'beta.studio'], 'Only active accounts managed by the suggester are offered.');
  assert.equal(requests.length, 0, 'Opening the suggestion flow does not create work.');
  await source.fill('https://independent-journal.example/stories/a-new-idea?ref=reader');
  await reason.fill('Explain the useful technique in a visual carousel for our audience.');
  assert.equal(await submit.isDisabled(), true, 'A valid link still requires choosing the destination account.');
  await account.selectOption('beta.studio');
  await title.fill('A practical technique for creators');
  for (const unsafe of ['javascript:alert(1)', 'ftp://example.org/post', 'https://user:password@example.org/post']) {
    await source.fill(unsafe);
    await form.evaluate(element => element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await modal.getByRole('alert').waitFor();
    assert.equal(requests.length, 0, 'Unsafe URL protocols never reach the suggestion API.');
  }
  const externalUrl = 'https://independent-journal.example/stories/a-new-idea?ref=reader';
  await source.fill(externalUrl);
  holdSuggestion = true;
  await form.evaluate(element => {
    element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await waitForBody(1);
  assert.equal(requests.length, 1, 'Rapid duplicate submission produces exactly one mutation.');
  assert.equal(await source.isDisabled(), true, 'Source is locked while scheduling.');
  assert.equal(await account.isDisabled(), true, 'Destination is locked while scheduling.');
  assert.equal(await reason.isDisabled(), true, 'Draft is locked while scheduling.');
  assert.equal(await modal.getByRole('button', { name: 'Close', exact: true }).isDisabled(), true);
  await page.keyboard.press('Escape');
  assert.equal(await modal.count(), 1, 'Escape cannot discard a pending schedule.');
  assert.equal(await modal.getByText('Added to your Queue', { exact: true }).count(), 0, 'No success is announced before the API confirms placement.');
  assert.equal(requests[0].source_url, externalUrl);
  assert.equal(requests[0].account, 'beta.studio');
  assert.equal(requests[0].reason, 'Explain the useful technique in a visual carousel for our audience.');
  assert.ok(requests[0].idempotency_key, 'Each suggestion has an idempotency key.');
  assert.equal(Object.hasOwn(requests[0], 'designer_email'), false, 'The caller never chooses an assignee.');
  console.log('PASS External URLs, required managed account, unsafe protocol rejection, immutable pending draft, and double-submit guard.');

  nextFailure = 'There is no available slot right now. Please retry.';
  holdSuggestion = false;
  await fulfillSuggestion(pendingSuggestion.route, pendingSuggestion.body);
  pendingSuggestion = null;
  await modal.getByRole('alert').waitFor();
  assert.match(await modal.getByRole('alert').innerText(), /no available slot/i);
  assert.equal(await source.inputValue(), externalUrl);
  assert.equal(await account.inputValue(), 'beta.studio');
  assert.equal(await title.inputValue(), 'A practical technique for creators');
  assert.equal(await reason.inputValue(), requests[0].reason);
  returnUnconfirmedSuccess = true;
  await submit.click();
  await modal.getByRole('alert').waitFor();
  assert.match(await modal.getByRole('alert').innerText(), /could not be confirmed/i);
  assert.equal(await modal.getByText('Added to your Queue', { exact: true }).count(), 0, 'An old review-only or malformed success never claims an assignment.');
  assert.equal(await source.inputValue(), externalUrl);
  await submit.click();
  await modal.getByText('Added to your Queue', { exact: true }).waitFor();
  assert.equal(requests.length, 3);
  assert.equal(requests[1].idempotency_key, requests[0].idempotency_key, 'Retrying a failed attempt reuses its idempotency key.');
  assert.equal(requests[2].idempotency_key, requests[0].idempotency_key, 'Unconfirmed success recovery also reuses its idempotency key.');
  const receipt = await modal.innerText();
  assert.match(receipt, /beta\.studio/);
  assert.match(receipt, /10:20/);
  assert.match(receipt, /30/);
  assert.equal(await page.locator('.queue-ticket-panel').count(), 0, 'An automatically scheduled suggestion does not open a review inbox.');
  await page.screenshot({ path: path.join(output, 'scheduled-desktop.png') });
  await modal.getByRole('button', { name: 'Open in Queue', exact: true }).click();
  await modal.waitFor({ state: 'detached' });
  await page.locator('.queue-request-rail').waitFor();
  assert.equal(await page.locator('.scheduler-date-picker input').inputValue(), scheduledDate, 'Opening the scheduled request selects the server-confirmed day.');
  assert.match(await page.locator('.queue-request-rail').innerText(), /User 03 Current/);
  console.log('PASS Failed drafts survive, retries are idempotent, and success opens the actual returned assignment/date.');

  await page.goto(`${base}/index.html?desktop=1`);
  const suggestionLink = page.locator('.gallery-grid .post-card').getByRole('link', { name: 'Suggest post', exact: true });
  await suggestionLink.waitFor();
  const researchSuggestionUrl = new URL(await suggestionLink.getAttribute('href'), base).href;
  await suggestionLink.click();
  await modal.waitFor();
  assert.equal(await source.inputValue(), researchPost.permalink, 'Research suggestions preserve the selected source URL.');
  assert.equal(requests.length, 3, 'Following a Research suggestion link never schedules without confirmation.');
  await account.selectOption('alpha.studio');
  await reason.fill('Adapt this Research idea for Alpha.');
  await submit.click();
  await modal.getByText('Added to your Queue', { exact: true }).waitFor();
  assert.equal(requests[3].source_account, researchPost.account);
  assert.equal(requests[3].source_shortcode, researchPost.shortcode);
  assert.equal(requests[3].account, 'alpha.studio');
  assert.notEqual(requests[3].idempotency_key, requests[0].idempotency_key);
  console.log('PASS Research card navigation uses the same scheduling flow and preserves exact source identity.');

  await page.setViewportSize({ width: 390, height: 844 });
  const narrowSuggestionUrl = new URL(researchSuggestionUrl);
  narrowSuggestionUrl.searchParams.set('desktop', '1');
  await page.goto(narrowSuggestionUrl.href);
  await modal.waitFor();
  await source.fill('https://another-publication.example/a-post');
  await account.selectOption('alpha.studio');
  await reason.fill('A mobile suggestion with enough context to produce the post.');
  const bounds = await modal.evaluate(element => ({ overflow: element.scrollWidth - element.clientWidth, box: element.getBoundingClientRect().toJSON(), viewport: innerWidth }));
  assert.ok(bounds.overflow <= 1 && bounds.box.left >= 0 && bounds.box.right <= bounds.viewport, 'Suggestion controls fit narrow screens without horizontal overflow.');
  await page.screenshot({ path: path.join(output, 'suggestion-mobile.png') });
  await submit.click();
  await modal.getByText('Added to your Queue', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'scheduled-mobile.png') });
  assert.equal(requests[4].source_url, 'https://another-publication.example/a-post');
  assert.equal(Object.hasOwn(requests[4], 'source_account'), false, 'Editing a Research URL clears its former source identity.');
  assert.equal(Object.hasOwn(requests[4], 'source_shortcode'), false);

  queue.schedulerUsers[0].accounts = [];
  queue.designers[0].accounts = [];
  await openQueue();
  await source.fill('https://independent-journal.example/second-story');
  await reason.fill('This draft must wait for account access.');
  assert.equal(await account.locator('option').evaluateAll(options => options.filter(option => option.value).length), 0);
  assert.equal(await submit.isDisabled(), true, 'Users with no eligible destination cannot create unassigned work.');
  assert.equal(requests.length, 5);

  viewer.canSelfAssign = true;
  queue.schedulerUsers[0].accounts = managedAccounts;
  queue.designers[0].accounts = managedAccounts;
  await openQueue();
  assert.equal(await account.locator('option[value="alpha.studio"]').count(), 1, 'Self-assign PD users retain the direct suggestion workflow.');
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto(`${base}/index.html?desktop=1`);
  const selfAssignCard = page.locator('.gallery-grid .post-card').first();
  await selfAssignCard.getByRole('button', { name: 'Send to Pool', exact: true }).waitFor();
  await selfAssignCard.getByRole('button', { name: 'Post menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Suggest post', exact: true }).click();
  await modal.waitFor();
  assert.equal(await source.inputValue(), researchPost.permalink);
  assert.equal(requests.length, 5, 'Self-assign Research navigation does not create work before submission.');
  assert.deepEqual(errors, [], 'No browser runtime errors.');
  assert.deepEqual(unexpected, [], 'Every API request is intentionally mocked.');
  console.log(`PASS Narrow layout, empty-account guard, self-assign PD entrypoints, and isolated browser requests. Screenshots: ${output}`);
} catch (error) {
  console.error(error);
  const failedPage = browser?.contexts()[0]?.pages()[0];
  if (failedPage) {
    await failedPage.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    await failedPage.locator('body').innerText().then(body => fs.writeFileSync(path.join(output, 'failure.txt'), body)).catch(() => {});
  }
  if (errors.length) console.error('Browser errors:', errors);
  if (unexpected.length) console.error('Unexpected API requests:', unexpected);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
