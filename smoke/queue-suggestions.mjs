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
const coordinatorEmail = 'coordinator@sentientagency.io';
const server = await createServer({
  logLevel: 'error', cacheDir: path.join(temporary, 'vite-cache'),
  optimizeDeps: { exclude: ['firebase/auth', 'firebase/app'] },
  resolve: { alias: {
    'firebase/auth': path.resolve('smoke/stub-firebase-auth.js'),
    'firebase/app': path.resolve('smoke/stub-firebase-app.js'),
  } },
  plugins: [{
    name: 'suggestion-pd-auth', enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('/smoke/stub-firebase-auth.js')) return code.replaceAll("'user03@example.com'", "(globalThis.__suggestionUserEmail || 'designer@sentientagency.io')");
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
const requests = [], reviews = [], tickets = [], errors = [], unexpected = [];
const submitted = new Map(), ticketBodies = new Map();
let pendingSuggestion = null, holdSuggestion = false;
let nextFailure = null, returnUnconfirmedSuccess = false;
let lastRequest = null, browser;
let pendingReview = null, holdReview = false, nextReviewFailure = null;
let failReviewRefresh = false, queueReadFailures = 0, ticketReadFailures = 0;

const scheduledTask = body => ({
  id: 701 + queue.requests.length, status: 'scheduled', designerEmail: viewerEmail, coordinatorEmail,
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
  const previous = submitted.get(body.idempotency_key);
  if (previous) return { ok: true, request: previous.request || null, ticket: previous, alreadySubmitted: true, alreadyScheduled: Boolean(previous.requestId) };
  const ticket = {
    id: 702 + tickets.length, type: 'post_suggestion', status: 'pending', requesterEmail: viewerEmail,
    requestId: null, request: null, title: body.source_url, reason: body.reason,
    createdAt: new Date().toISOString(), requestedAccounts: [body.account],
    scheduledDate: null, scheduledStartMinutes: null, durationMinutes: null,
    suggestion: { sourceUrl: body.source_url, account: body.account, title: body.title,
      postType: body.post_type, sourceAccount: body.source_account || '', sourceShortcode: body.source_shortcode || '' },
  };
  tickets.push(ticket);
  submitted.set(body.idempotency_key, ticket);
  ticketBodies.set(ticket.id, body);
  queue.pendingTicketCount = tickets.filter(item => item.status === 'pending').length;
  return { ok: true, request: null, ticket, alreadySubmitted: false, alreadyScheduled: false };
};
const fulfillSuggestion = async (route, body) => {
  if (nextFailure) {
    const failure = nextFailure;
    nextFailure = null;
    return route.fulfill({ status: 409, json: { detail: failure } });
  }
  if (returnUnconfirmedSuccess) {
    returnUnconfirmedSuccess = false;
    suggestionResult(body); // Server accepted it, but the response lost the durable receipt.
    return route.fulfill({ json: { ok: true } });
  }
  return route.fulfill({ json: suggestionResult(body) });
};
const fulfillReview = async (route, id, body) => {
  if (nextReviewFailure) {
    const failure = nextReviewFailure;
    nextReviewFailure = null;
    return route.fulfill({ status: 409, json: { detail: failure } });
  }
  const ticket = tickets.find(item => item.id === id);
  assert.ok(ticket, 'The review targets a real proposal.');
  if (body.account) {
    ticket.suggestion.account = body.account;
    ticket.requestedAccounts = [body.account];
  }
  ticket.status = body.action === 'approve' ? 'approved' : 'rejected';
  ticket.reviewerEmail = coordinatorEmail;
  ticket.reviewedAt = new Date().toISOString();
  if (body.action === 'approve') {
    lastRequest = scheduledTask({ ...ticketBodies.get(id), account: ticket.suggestion.account });
    ticket.requestId = lastRequest.id;
    ticket.request = lastRequest;
    ticket.scheduledDate = lastRequest.scheduledDate;
    ticket.scheduledStartMinutes = lastRequest.scheduledStartMinutes;
    ticket.durationMinutes = lastRequest.durationMinutes;
    queue.requests.push(lastRequest);
    queue.planningRequests.push(lastRequest);
    // This is the VC's Queue payload; approval does not assign work to the reviewer.
    queue.assignedRequests = [];
  }
  queue.pendingTicketCount = tickets.filter(item => item.status === 'pending').length;
  if (failReviewRefresh) {
    failReviewRefresh = false;
    queueReadFailures += 1; ticketReadFailures += 1;
  }
  return route.fulfill({ json: { ok: true, ticket, request: ticket.request || null } });
};

try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (fs.existsSync(chrome) ? chrome : undefined) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, reducedMotion: 'reduce', timezoneId: 'America/Costa_Rica' });
  await context.addInitScript(() => {
    localStorage.setItem('sentient.lang', 'en');
    localStorage.setItem('sentient.theme', 'dark');
    localStorage.setItem('sentient.effects', 'off');
    localStorage.setItem('sentient.queueGuide.v1', 'completed');
    window.__suggestionUserEmail = localStorage.getItem('fixture.suggestionUser') || 'designer@sentientagency.io';
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const pathname = url.pathname;
    if (pathname.startsWith('/api/')) {
      if (pathname === '/api/dashboard/me' || pathname === '/api/admin/me') return route.fulfill({ json: {
        role: 'user', email: queue.viewer.email, display_name: queue.viewer.displayName,
        is_admin: false, is_dev: false, operating_roles: queue.viewer.operatingRoles, can_self_assign: queue.viewer.canSelfAssign,
      } });
      if (pathname.endsWith('/me/preferences')) return route.fulfill({ json: { preferences: { language: 'en', theme: 'dark', queueGuideCompleted: true } } });
      if (pathname === '/api/dashboard/queue/v2/tickets/post-suggestion') {
        assert.equal(request.method(), 'POST');
        const body = Object.fromEntries(new URLSearchParams(request.postData()));
        requests.push(body);
        if (holdSuggestion) { pendingSuggestion = { route, body }; return; }
        return fulfillSuggestion(route, body);
      }
      if (pathname === '/api/dashboard/queue/v2') {
        if (queueReadFailures) { queueReadFailures -= 1; return route.fulfill({ status: 503, json: { detail: 'Queue refresh temporarily unavailable.' } }); }
        return route.fulfill({ json: { ...queue, date: url.searchParams.get('date') || today } });
      }
      if (pathname === '/api/dashboard/queue/v2/presence') return route.fulfill({ json: { presence: {} } });
      if (pathname === '/api/dashboard/queue/v2/live') return route.fulfill({ status: 403, json: { detail: 'Live stream disabled in fixture.' } });
      if (/\/queue\/v2\/tickets\/\d+\/review$/.test(pathname)) {
        assert.equal(request.method(), 'POST');
        const id = Number(pathname.split('/').at(-2));
        const body = Object.fromEntries(new URLSearchParams(request.postData()));
        reviews.push({ id, ...body });
        if (holdReview) { pendingReview = { route, id, body }; return; }
        return fulfillReview(route, id, body);
      }
      if (pathname === '/api/dashboard/queue/v2/tickets') {
        if (ticketReadFailures) { ticketReadFailures -= 1; return route.fulfill({ status: 503, json: { detail: 'Inbox refresh temporarily unavailable.' } }); }
        return route.fulfill({ json: { tickets } });
      }
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
  const submit = modal.getByRole('button', { name: 'Send for approval', exact: true });
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
  assert.equal(await source.isDisabled(), true, 'Source is locked while submitting.');
  assert.equal(await account.isDisabled(), true, 'Destination is locked while submitting.');
  assert.equal(await reason.isDisabled(), true, 'Draft is locked while submitting.');
  assert.equal(await modal.getByRole('button', { name: 'Close', exact: true }).isDisabled(), true);
  await page.keyboard.press('Escape');
  assert.equal(await modal.count(), 1, 'Escape cannot discard an in-flight suggestion.');
  assert.equal(await modal.getByText('Sent for approval', { exact: true }).count(), 0, 'No success is announced before the API confirms receipt.');
  assert.equal(requests[0].source_url, externalUrl);
  assert.equal(requests[0].account, 'beta.studio');
  assert.equal(requests[0].reason, 'Explain the useful technique in a visual carousel for our audience.');
  assert.ok(requests[0].idempotency_key, 'Each suggestion has an idempotency key.');
  assert.equal(Object.hasOwn(requests[0], 'designer_email'), false, 'The caller never chooses an assignee.');
  console.log('PASS External URLs, required managed account, unsafe protocol rejection, immutable pending draft, and double-submit guard.');

  nextFailure = 'Could not submit the request right now. Please retry.';
  holdSuggestion = false;
  await fulfillSuggestion(pendingSuggestion.route, pendingSuggestion.body);
  pendingSuggestion = null;
  await modal.getByRole('alert').waitFor();
  assert.match(await modal.getByRole('alert').innerText(), /could not submit/i);
  assert.equal(await source.inputValue(), externalUrl);
  assert.equal(await account.inputValue(), 'beta.studio');
  assert.equal(await title.inputValue(), 'A practical technique for creators');
  assert.equal(await reason.inputValue(), requests[0].reason);
  returnUnconfirmedSuccess = true;
  await submit.click();
  await modal.getByRole('alert').waitFor();
  assert.match(await modal.getByRole('alert').innerText(), /could not be confirmed/i);
  assert.equal(await modal.getByText('Sent for approval', { exact: true }).count(), 0, 'A malformed success never claims the suggestion was received.');
  assert.equal(await source.inputValue(), externalUrl);
  await submit.click();
  await modal.getByText('Already awaiting approval', { exact: true }).waitFor();
  assert.equal(requests.length, 3);
  assert.equal(tickets.length, 1, 'Recovering an accepted response reuses the same pending ticket.');
  assert.equal(requests[1].idempotency_key, requests[0].idempotency_key, 'Retrying a failed attempt reuses its idempotency key.');
  assert.equal(requests[2].idempotency_key, requests[0].idempotency_key, 'Unconfirmed success recovery also reuses its idempotency key.');
  const receipt = await modal.innerText();
  assert.match(receipt, /beta\.studio/);
  assert.match(receipt, /approval/i);
  assert.doesNotMatch(receipt, /10:20|Scheduled|Production time/);
  assert.equal(queue.requests.length, 0, 'Submitting a proposal must not create or reserve a Queue task.');
  assert.equal(queue.assignedRequests.length, 0, 'Pending proposals never appear as assigned work.');
  assert.equal(await modal.getByRole('button', { name: 'Open in Queue', exact: true }).count(), 0);
  await page.screenshot({ path: path.join(output, 'pending-desktop.png') });
  await modal.getByRole('button', { name: 'View request', exact: true }).click();
  await modal.waitFor({ state: 'detached' });
  const inbox = page.locator('.queue-ticket-panel');
  await inbox.waitFor();
  assert.match(await inbox.innerText(), /My requests/);
  assert.match(await inbox.innerText(), /beta\.studio/);
  assert.match(await inbox.innerText(), /pending|approval/i);
  assert.equal(await inbox.getByRole('button', { name: 'Approve', exact: true }).count(), 0, 'A PD cannot approve their own proposal.');
  assert.equal(await inbox.getByRole('button', { name: 'Reject', exact: true }).count(), 0);
  assert.equal(await page.locator('.queue-request-rail').count(), 0, 'Pending receipt opens Requests rather than a nonexistent task.');
  console.log('PASS Failed drafts survive, retries are idempotent, and pending success opens My requests without creating assigned work.');

  await page.goto(`${base}/index.html?desktop=1`);
  const suggestionLink = page.locator('.gallery-grid .post-card').getByRole('link', { name: 'Suggest post', exact: true });
  await suggestionLink.waitFor();
  const researchSuggestionUrl = new URL(await suggestionLink.getAttribute('href'), base).href;
  await suggestionLink.click();
  await modal.waitFor();
  assert.equal(await source.inputValue(), researchPost.permalink, 'Research suggestions preserve the selected source URL.');
  assert.equal(requests.length, 3, 'Following a Research suggestion link never submits without confirmation.');
  await account.selectOption('alpha.studio');
  await reason.fill('Adapt this Research idea for Alpha.');
  await submit.click();
  await modal.getByText('Sent for approval', { exact: true }).waitFor();
  assert.equal(requests[3].source_account, researchPost.account);
  assert.equal(requests[3].source_shortcode, researchPost.shortcode);
  assert.equal(requests[3].account, 'alpha.studio');
  assert.notEqual(requests[3].idempotency_key, requests[0].idempotency_key);
  console.log('PASS Research card navigation uses the same approval flow and preserves exact source identity.');

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
  await modal.getByText('Sent for approval', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'pending-mobile.png') });
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
  assert.equal(await account.locator('option[value="alpha.studio"]').count(), 1, 'Self-assign PD users retain the approval-based suggestion workflow.');
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto(`${base}/index.html?desktop=1`);
  const selfAssignCard = page.locator('.gallery-grid .post-card').first();
  await selfAssignCard.getByRole('button', { name: 'Send to Pool', exact: true }).waitFor();
  await selfAssignCard.getByRole('button', { name: 'Post menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Suggest post', exact: true }).click();
  await modal.waitFor();
  assert.equal(await source.inputValue(), researchPost.permalink);
  assert.equal(requests.length, 5, 'Self-assign Research navigation does not create work before submission.');
  // A coordinator sees the same proposals without turning the original PD into
  // a privileged reviewer or changing the eventual task owner.
  queue.viewer = { email: coordinatorEmail, displayName: 'Fixture Coordinator', isAdmin: false, isDev: false,
    operatingRoles: ['vc'], canSelfAssign: false };
  await page.evaluate(email => localStorage.setItem('fixture.suggestionUser', email), coordinatorEmail);
  await page.goto(`${base}/queue.html?desktop=1`);
  await page.locator('.queue-ticket-button').click();
  await inbox.waitFor();
  assert.match(await inbox.innerText(), /Approval inbox/);
  const externalTicket = inbox.locator('.ticket-post_suggestion').filter({ hasText: 'A practical technique for creators' });
  await externalTicket.waitFor();
  assert.equal(await externalTicket.getByRole('link').getAttribute('href'), externalUrl, 'The VC can review the original source before approving.');
  assert.match(await externalTicket.innerText(), /beta\.studio/);
  assert.match(await externalTicket.innerText(), /User 03 Current/);
  assert.match(await externalTicket.innerText(), /Image/);
  assert.match(await externalTicket.innerText(), /next available/i);
  assert.match(await externalTicket.innerText(), /Explain the useful technique/);
  assert.equal(queue.requests.length, 0, 'Loading the approval inbox never creates a task.');

  holdReview = true;
  await externalTicket.getByRole('button', { name: 'Approve', exact: true }).evaluate(button => { button.click(); button.click(); });
  await page.waitForFunction(() => document.querySelector('.queue-ticket-panel .is-approve:disabled'));
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(reviews.length, 1, 'Rapid approval clicks produce only one review mutation.');
  assert.equal(reviews[0].id, 702);
  assert.equal(reviews[0].action, 'approve');
  assert.equal(await externalTicket.getByRole('button', { name: 'Reject', exact: true }).isDisabled(), true, 'A conflicting rejection cannot be sent during approval.');
  assert.equal(queue.requests.length, 0, 'The client does not fabricate an assignment while approval is in flight.');
  nextReviewFailure = 'The selected account is no longer managed by this user.';
  holdReview = false;
  await fulfillReview(pendingReview.route, pendingReview.id, pendingReview.body);
  pendingReview = null;
  await inbox.getByText(nextReviewFailure || 'The selected account is no longer managed by this user.', { exact: true }).waitFor();
  assert.equal(tickets[0].status, 'pending', 'A failed approval leaves the proposal pending.');
  assert.equal(queue.requests.length, 0);
  failReviewRefresh = true;
  await externalTicket.getByRole('button', { name: 'Approve', exact: true }).click();
  await inbox.getByRole('tab', { name: /^Approved/ }).click();
  await externalTicket.getByRole('button', { name: 'Open in Queue', exact: true }).waitFor();
  assert.equal(reviews.length, 2);
  assert.equal(queue.requests.length, 1);
  assert.equal(await inbox.getByText('The selected account is no longer managed by this user.', { exact: true }).count(), 0, 'A successful retry clears the old approval error.');
  assert.equal(queueReadFailures, 0);
  assert.equal(ticketReadFailures, 0, 'Post-commit refresh failures cannot undo the authoritative approved receipt.');
  assert.equal(lastRequest.designerEmail, viewerEmail, 'Approval assigns the task to the original suggester.');
  assert.notEqual(lastRequest.designerEmail, queue.viewer.email, 'The VC reviewing the suggestion does not become its owner.');
  assert.deepEqual(lastRequest.recommendedAccounts, ['beta.studio']);
  assert.equal(await externalTicket.getByRole('button', { name: 'Create post', exact: true }).count(), 0, 'An approved linked suggestion never asks the VC to manually create another post.');
  assert.match(await externalTicket.innerText(), /10:20/);
  await page.screenshot({ path: path.join(output, 'approved-desktop.png') });
  await externalTicket.getByRole('button', { name: 'Open in Queue', exact: true }).click();
  await page.locator('.queue-request-rail').waitFor();
  assert.equal(await page.locator('.scheduler-date-picker input').inputValue(), scheduledDate, 'Opening approved work selects the actual server-confirmed day.');
  assert.match(await page.locator('.queue-request-rail').innerText(), /User 03 Current/);
  console.log('PASS VC review shows the proposal, requires successful approval, and schedules the original PD/account only after approval.');

  await page.goto(`${base}/queue.html?desktop=1`);
  await page.locator('.queue-ticket-button').click();
  await inbox.waitFor();
  const rejectedTicket = inbox.locator('.ticket-post_suggestion').filter({ hasText: 'A mobile suggestion with enough context' });
  await rejectedTicket.getByRole('button', { name: 'Reject', exact: true }).click();
  await inbox.getByRole('tab', { name: /^Rejected/ }).click();
  await rejectedTicket.waitFor();
  assert.equal(tickets.find(ticket => ticket.id === 704).status, 'rejected');
  assert.equal(queue.requests.length, 1, 'Rejecting a suggestion creates no task or scheduled slot.');
  assert.equal(await rejectedTicket.getByRole('button', { name: 'Open in Queue', exact: true }).count(), 0);
  assert.equal(await rejectedTicket.getByRole('button', { name: 'Create post', exact: true }).count(), 0);
  console.log('PASS Rejection retains the proposal history and creates no Queue work.');

  // Old suggestions had no destination account. Review must collect one from
  // the original requester's managed accounts before automatic scheduling.
  const legacyBody = { source_url: 'https://legacy-source.example/post', reason: 'Legacy idea awaiting account selection', title: 'Legacy source suggestion', post_type: 'Carousel' };
  tickets.push({ id: 800, type: 'post_suggestion', status: 'pending', requesterEmail: viewerEmail,
    requestId: null, request: null, title: legacyBody.source_url, reason: legacyBody.reason,
    createdAt: new Date().toISOString(), requestedAccounts: [],
    suggestion: { sourceUrl: legacyBody.source_url, account: '', title: legacyBody.title, postType: 'Carousel', sourceAccount: '', sourceShortcode: '' } });
  ticketBodies.set(800, legacyBody);
  tickets.push({ id: 801, type: 'post_suggestion', status: 'approved', requesterEmail: viewerEmail,
    requestId: null, request: null, title: 'https://legacy-source.example/already-approved', reason: 'Previously approved legacy suggestion',
    createdAt: new Date().toISOString(), reviewedAt: new Date().toISOString(), reviewerEmail: coordinatorEmail,
    requestedAccounts: [], suggestion: { sourceUrl: 'https://legacy-source.example/already-approved', account: '', title: '', postType: 'Image' } });
  await page.goto(`${base}/queue.html?desktop=1`);
  await page.locator('.queue-ticket-button').click();
  await inbox.waitFor();
  const legacyTicket = inbox.locator('.ticket-post_suggestion').filter({ hasText: 'Legacy source suggestion' });
  const legacyAccount = legacyTicket.getByRole('combobox');
  await legacyAccount.waitFor();
  assert.equal(await legacyTicket.getByRole('button', { name: 'Approve', exact: true }).isDisabled(), true, 'Legacy proposals cannot be approved without a target account.');
  assert.deepEqual(await legacyAccount.locator('option').evaluateAll(options => options.map(option => option.value).filter(Boolean)), ['alpha.studio', 'beta.studio'], 'Legacy approval offers the suggester’s managed active accounts, not the VC’s accounts.');
  await legacyAccount.selectOption('alpha.studio');
  await legacyTicket.getByRole('button', { name: 'Approve', exact: true }).click();
  await inbox.getByRole('tab', { name: /^Approved/ }).click();
  await legacyTicket.getByRole('button', { name: 'Open in Queue', exact: true }).waitFor();
  assert.equal(reviews.at(-1).account, 'alpha.studio');
  assert.equal(queue.requests.length, 2);
  assert.deepEqual(lastRequest.recommendedAccounts, ['alpha.studio']);
  assert.equal(lastRequest.designerEmail, viewerEmail);
  const alreadyApprovedLegacy = inbox.locator('.ticket-post_suggestion').filter({ hasText: 'Previously approved legacy suggestion' });
  assert.equal(await alreadyApprovedLegacy.getByRole('button', { name: 'Create post', exact: true }).count(), 1, 'Existing approved legacy tickets without a linked task retain their one-time manual continuation.');
  console.log('PASS Legacy pending proposals require a managed destination; only historical unlinked approvals retain manual continuation.');
  queue.viewer = viewer;
  queue.assignedRequests = queue.requests.filter(task => task.designerEmail === viewerEmail);
  tickets.find(ticket => ticket.id === 703).suggestion.title = 'A'.repeat(160);
  tickets.push({ id: 900, type: 'post_suggestion', status: 'pending', requesterEmail: 'another@sentientagency.io', title: 'https://another-user.example/private-suggestion', reason: 'Another person’s suggestion must not appear here.', createdAt: new Date().toISOString(), requestedAccounts: ['beta.studio'], suggestion: { title: 'Other user private suggestion', account: 'beta.studio' } });
  await page.evaluate(email => localStorage.setItem('fixture.suggestionUser', email), viewerEmail);
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/mobile/?tab=queue&mobile=1`);
  await page.getByRole('button', { name: 'My suggestions', exact: true }).click();
  const mobileSheet = page.locator('.m-sheet');
  await mobileSheet.waitFor();
  await mobileSheet.getByText('Previously approved legacy suggestion', { exact: true }).waitFor();
  assert.match(await mobileSheet.innerText(), /pending/i);
  assert.match(await mobileSheet.innerText(), /approved/i);
  assert.match(await mobileSheet.innerText(), /rejected/i);
  assert.equal(await mobileSheet.getByText('Other user private suggestion', { exact: true }).count(), 0, 'Mobile shows only the current user’s suggestions.');
  const sheetBounds = await mobileSheet.evaluate(element => ({ overflow: element.scrollWidth - element.clientWidth, box: element.getBoundingClientRect().toJSON(), viewport: innerWidth }));
  assert.ok(sheetBounds.overflow <= 1 && sheetBounds.box.left >= 0 && sheetBounds.box.right <= sheetBounds.viewport, 'The mobile tracking sheet fits 390px screens without overflowing, including a long title.');
  await page.screenshot({ path: path.join(output, 'my-suggestions-mobile.png') });
  assert.equal(await mobileSheet.getByRole('button', { name: 'Approve', exact: true }).count(), 0, 'Mobile tracking does not grant review controls to the suggester.');
  console.log('PASS Mobile My suggestions shows only the viewer’s proposal statuses without horizontal overflow.');
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
