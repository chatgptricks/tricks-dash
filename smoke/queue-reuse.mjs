// Real Create Post/Research UI with all authentication and remote requests mocked.
// Explicitly reusing a source creates independent Pool work; Research's normal
// Send to Pool path remains unchanged. This never writes to the live Queue.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sentient-queue-reuse-'));
const output = path.resolve('work/queue-reuse');
fs.mkdirSync(output, { recursive: true });
const viewerEmail = 'coordinator@sentientagency.io';
const server = await createServer({
  logLevel: 'error', cacheDir: path.join(temporary, 'vite-cache'),
  resolve: { alias: {
    'firebase/auth': path.resolve('smoke/stub-firebase-auth.js'),
    'firebase/app': path.resolve('smoke/stub-firebase-app.js'),
  } },
  plugins: [{ name: 'reuse-vc-auth', transform(code, id) {
    return id.endsWith('/smoke/stub-firebase-auth.js') ? code.replaceAll('user03@example.com', viewerEmail) : null;
  } }],
  server: { host: 'localhost', port: 4203 },
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(new Date());
const sourceUrl = 'https://www.instagram.com/p/REUSE1/';
const viewer = { email: viewerEmail, displayName: 'Fixture Coordinator', isAdmin: false, isDev: false, operatingRoles: ['vc'], canSelfAssign: false };
const researchPost = {
  id: 1, postKey: 'source.studio:REUSE1', account: 'source.studio', shortcode: 'REUSE1',
  caption: 'A strong idea to adapt for another audience.', type: 'Carousel', postType: 'Carousel',
  permalink: sourceUrl, postDate: `${today}T13:00:00Z`, likes: 2100, comments: 52,
  coverUrl: 'https://reuse-fixtures.test/cover.svg',
};
const oldTask = {
  id: 400, status: 'closed', designerEmail: 'original@sentientagency.io', coordinatorEmail: viewerEmail,
  scheduledDate: '2026-09-21', scheduledStartMinutes: 540, durationMinutes: 30, minutesPerPP: 10,
  productionPoints: 3, priority: 'normal', tags: ['content'], brief: 'Original brief', notes: 'Original notes',
  references: [sourceUrl], attachments: [], recommendedAccounts: ['alpha.studio'], post: researchPost,
};
const original = structuredClone(oldTask);
const accounts = [
  { handle: 'alpha.studio', label: 'Alpha Studio', group: 'sentient', is_active: true },
  { handle: 'source.studio', label: 'Source Studio', group: 'competitors', is_active: true },
];
const queue = {
  viewer, date: today, requests: [oldTask], pickRequests: [], hotPickRequests: [], planningRequests: [],
  assignedRequests: [], liveDrafts: [], liveRevision: 0, presence: {}, timeBlocks: [], pendingTicketCount: 0,
  designers: [{ email: 'original@sentientagency.io', displayName: 'Original Designer', roles: ['pd'], isQueueDesigner: true, accounts: ['alpha.studio'] }],
  schedulerUsers: [{ email: 'original@sentientagency.io', displayName: 'Original Designer', roles: ['pd'], isQueueDesigner: true, accounts: ['alpha.studio'] }],
  accounts, accountOnboarding: { completed: true, selectedAccounts: [] }, tags: ['content'],
  priorities: ['normal', 'urgent'], hours: { start: 0, end: 1440 },
};
const mutations = [], createBodies = [], poolBodies = [], errors = [], unexpected = [], pendingPreviews = [];
const ledger = new Map();
let browser, pendingCreate = null, holdCreate = false, loseCreateResponse = false, heldPreviewUrl = '', failAttachment = false;
let nextId = 500, attachmentCount = 0;

const readBody = async request => Object.fromEntries(await new Request(request.url(), {
  method: request.method(), headers: request.headers(), body: request.postDataBuffer(),
}).formData());
const previewFor = url => url === sourceUrl ? {
  sourceUrl: url, title: 'A strong idea to reuse', description: 'Existing source caption', platform: 'Instagram', postType: 'Carousel',
  imageUrl: researchPost.coverUrl, dashboardPost: { account: researchPost.account, shortcode: researchPost.shortcode },
  queueHistory: { count: 1, latestRequestId: oldTask.id, latestStatus: oldTask.status, lastUsedAt: '2026-09-21T16:00:00Z' },
} : { sourceUrl: url, title: url.includes('new-source') ? 'New source metadata' : 'Old source metadata', description: 'External source description', platform: 'Web', postType: 'Video', imageUrl: '' };
const createResult = body => {
  let request = ledger.get(body.idempotency_key);
  if (!request) {
    request = {
      ...oldTask, id: nextId++, status: 'pool', designerEmail: null, scheduledDate: null, scheduledStartMinutes: null,
      brief: body.brief, notes: body.notes, references: JSON.parse(body.references || '[]'), attachments: [], recommendedAccounts: [],
      post: { account: 'queue', shortcode: `MANUAL${nextId}`, title: body.title, caption: body.title, type: body.post_type, permalink: body.source_url, coverUrl: body.source_image_url },
    };
    ledger.set(body.idempotency_key, request);
    queue.requests = [request, ...queue.requests];
    queue.pickRequests = [request, ...queue.pickRequests];
  }
  return { ok: true, request };
};
const fulfillCreate = async (route, body) => {
  const result = createResult(body);
  if (loseCreateResponse) {
    loseCreateResponse = false;
    return route.fulfill({ status: 503, json: { detail: 'Connection interrupted after saving. Retry to recover the post.' } });
  }
  return route.fulfill({ json: result });
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
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname;
    if (pathname.startsWith('/api/')) {
      if (request.method() !== 'GET') mutations.push(`${request.method()} ${pathname}`);
      if (pathname === '/api/dashboard/me' || pathname === '/api/admin/me') return route.fulfill({ json: { role: 'user', email: viewerEmail, display_name: viewer.displayName, is_admin: false, is_dev: false, operating_roles: ['vc'], can_self_assign: false } });
      if (pathname.endsWith('/me/preferences')) return route.fulfill({ json: { preferences: { language: 'en', theme: 'dark', queueGuideCompleted: true } } });
      if (pathname === '/api/dashboard/queue/v2/create') {
        const body = await readBody(request);
        createBodies.push(body);
        if (holdCreate) { pendingCreate = { route, body }; return; }
        return fulfillCreate(route, body);
      }
      if (pathname === '/api/dashboard/queue/v2/pool') {
        poolBodies.push(await readBody(request));
        return route.fulfill({ json: { ok: true, request: oldTask, alreadyInQueue: true } });
      }
      if (pathname === '/api/dashboard/queue/v2/source-preview') {
        const body = await readBody(request);
        if (body.source_url === heldPreviewUrl) { pendingPreviews.push({ route, url: body.source_url }); return; }
        return route.fulfill({ json: { preview: previewFor(body.source_url) } });
      }
      if (/\/queue\/v2\/requests\/\d+\/attachments$/.test(pathname)) {
        attachmentCount += 1;
        if (failAttachment) { failAttachment = false; return route.fulfill({ status: 503, json: { detail: 'Upload interrupted.' } }); }
        const id = Number(pathname.match(/requests\/(\d+)/)[1]);
        return route.fulfill({ json: { ok: true, request: queue.requests.find(task => task.id === id) } });
      }
      if (pathname === '/api/dashboard/queue/v2') return route.fulfill({ json: { ...queue, date: url.searchParams.get('date') || today } });
      if (pathname === '/api/dashboard/queue/v2/presence') return route.fulfill({ json: { presence: {} } });
      if (pathname === '/api/dashboard/queue/v2/live') return route.fulfill({ status: 403, json: { detail: 'Live stream disabled in fixture.' } });
      if (pathname === '/api/dashboard/queue/v2/tickets') return route.fulfill({ json: { tickets: [] } });
      if (pathname === '/api/dashboard/queue/v2/summary') return route.fulfill({ json: { pending: 0 } });
      if (/\/queue\/v2\/requests\/\d+\/history$/.test(pathname)) return route.fulfill({ json: { events: [] } });
      if (pathname.startsWith('/api/dashboard/avatar/')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#244238"/></svg>' });
      if (pathname.startsWith('/api/dashboard/stacks/')) return route.fulfill({ json: { posts: [] } });
      if (pathname.endsWith('/posts/manifest')) return route.fulfill({ json: { revision: 'reuse-fixture', sources: [{ source: 'canonical', upperBound: 1 }, { source: 'dashboard', upperBound: 0 }] } });
      if (pathname.endsWith('/posts/page')) return route.fulfill({ json: { source: 'canonical', afterId: 0, nextCursor: 1, done: true, upperBound: 1, revision: 'reuse-fixture', posts: [researchPost] } });
      if (pathname.endsWith('/posts')) return route.fulfill({ json: { posts: [researchPost], summary: {}, ranges: {} } });
      if (pathname.endsWith('/accounts')) return route.fulfill({ json: { accounts } });
      if (pathname.endsWith('/lists')) return route.fulfill({ json: { lists: [] } });
      if (pathname.endsWith('/posts/media')) return route.fulfill({ json: { items: [] } });
      if (pathname.endsWith('/golden-nuggets')) return route.fulfill({ json: { items: [] } });
      if (pathname.endsWith('/sso/exchange')) return route.fulfill({ json: {} });
      unexpected.push(`${request.method()} ${pathname}`);
      return route.fulfill({ status: 404, json: { detail: 'Unmocked API endpoint.' } });
    }
    if (url.origin === 'https://x.com') return route.fulfill({ contentType: 'text/html', body: '<title>X note reference</title>' });
    if (url.origin === base) return route.continue();
    if (request.resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#244238"/></svg>' });
    return route.fulfill({ status: 404, body: '' });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const modal = page.locator('.queue-create-modal');
  const source = modal.locator('input[type="url"]');
  const title = modal.getByLabel(/^Post title/i);
  const brief = modal.getByLabel(/^Brief/i);
  const postType = modal.getByLabel(/^Post type/i);
  const references = modal.getByLabel(/^Reference links/i);
  const submit = modal.getByRole('button', { name: 'Create Post', exact: true });
  const waitUntil = async predicate => {
    const limit = Date.now() + 5000;
    while (!predicate()) {
      if (Date.now() >= limit) throw new Error('Expected fixture request was not intercepted.');
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  };
  const openCreate = async () => {
    await page.goto(`${base}/queue.html?desktop=1`);
    await page.getByRole('button', { name: 'Create Post', exact: true }).click();
    await modal.waitFor();
  };
  const fillSource = async url => {
    await source.fill(url);
    await source.press('Tab');
    await modal.locator('.queue-source-preview').waitFor();
  };

  await openCreate();
  await fillSource(sourceUrl);
  await modal.getByText('Previously used in Queue', { exact: true }).waitFor();
  assert.match(await modal.locator('.queue-source-preview').innerText(), /previous assignments|history.*unchanged/i);
  await title.fill('Reuse this idea for a new audience');
  const linkedNotes = 'Ver https://x.com/example/status/123?s=20.\n[Fuente](https://example.com/article) y www.example.org/path, x.com/example/status/456.\njavascript:alert(1) <script>alert(1)</script>';
  await modal.getByLabel(/^Notes/i).fill(linkedNotes);
  holdCreate = true;
  await modal.evaluate(element => {
    element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await waitUntil(() => pendingCreate);
  assert.equal(createBodies.length, 1, 'Two synchronous submits create one request.');
  assert.equal(poolBodies.length, 0, 'Known Research/Queue sources use explicit fresh creation, not the existing Pool path.');
  assert.equal(createBodies[0].source_url, sourceUrl);
  assert.equal(createBodies[0].post_type, 'Carousel', 'Recognized source format pre-fills the new task.');
  assert.ok(createBodies[0].idempotency_key, 'Creation has a retry-safe idempotency key.');
  assert.equal(await source.isDisabled(), true, 'A pending creation locks its source.');
  await page.keyboard.press('Escape');
  assert.equal(await modal.count(), 1, 'A pending creation cannot be dismissed by Escape.');
  holdCreate = false;
  loseCreateResponse = true;
  await fulfillCreate(pendingCreate.route, pendingCreate.body);
  pendingCreate = null;
  await modal.getByRole('alert').waitFor();
  assert.equal(await source.inputValue(), sourceUrl);
  assert.equal(await title.inputValue(), 'Reuse this idea for a new audience');
  await submit.click();
  await modal.waitFor({ state: 'detached' });
  assert.equal(createBodies.length, 2);
  assert.equal(createBodies[1].idempotency_key, createBodies[0].idempotency_key, 'Ambiguous-result retries recover the same task.');
  assert.equal(ledger.size, 1);
  assert.deepEqual(oldTask, original, 'The prior closed assignment remains unchanged.');
  assert.ok(queue.requests.some(task => task.id !== oldTask.id && task.status === 'pool'));
  assert.equal(createBodies[0].notes.replaceAll('\r\n', '\n'), linkedNotes, 'Notes are saved without rewriting links.');
  await page.locator('.queue-pool-card').filter({ hasText: 'Reuse this idea for a new audience' }).getByRole('button').click();
  const linked = page.locator('.queue-linked-notes');
  await linked.waitFor();
  assert.deepEqual(await linked.locator('a').evaluateAll(links => links.map(link => link.getAttribute('href'))), [
    'https://x.com/example/status/123?s=20', 'https://example.com/article', 'https://www.example.org/path', 'https://x.com/example/status/456',
  ]);
  assert.equal(await linked.locator('a').evaluateAll(links => links.every(link => link.target === '_blank' && link.rel.includes('noopener'))), true);
  assert.equal(await linked.locator('script').count(), 0);
  assert.match(await linked.innerText(), /javascript:alert\(1\) <script>/);
  assert.equal(await linked.locator('a').first().evaluate(link => getComputedStyle(link).display), 'inline');
  const notesPanel = page.locator('.queue-coordinator-notes');
  const notesIcon = page.locator('.queue-inspector-notes-button');
  assert.equal(await notesPanel.count(), 1, 'Manual notes have one dedicated block.');
  assert.equal(await page.locator('.queue-notes-notice').count(), 0, 'Manual notes do not add a superior notes notice.');
  assert.equal(await notesPanel.evaluate(element => element.parentElement.firstElementChild === element), true, 'Highlighted notes are the first information block.');
  assert.equal(await notesIcon.count(), 1, 'Manual notes get a floating comment icon.');
  assert.equal(await page.locator('.queue-pool-card').filter({ hasText: 'Reuse this idea for a new audience' }).locator('.queue-notes-badge.is-floating').count(), 1);
  await notesIcon.click();
  assert.equal(await notesPanel.evaluate(element => element === document.activeElement), true, 'The floating comment icon takes keyboard focus to the notes.');
  const assertAccent = async () => {
    const colors = await page.evaluate(() => {
      const expected = document.createElement('span');
      expected.style.color = 'var(--accent-text)';
      document.body.append(expected);
      const accent = getComputedStyle(expected).color;
      expected.remove();
      return { accent, heading: getComputedStyle(document.querySelector('.queue-coordinator-notes h3')).color };
    });
    assert.equal(colors.heading, colors.accent, 'Notes use the accessible current accent.');
  };
  await assertAccent();
  await page.screenshot({ path: path.join(output, 'linked-notes-desktop.png') });
  await page.evaluate(async () => { const { applyAccent, applyTheme } = await import('/src/prefs.js'); applyTheme('light'); applyAccent('blue'); });
  await assertAccent();
  await page.screenshot({ path: path.join(output, 'coordinator-notes-light-blue.png') });
  await page.evaluate(async () => { const { applyAccent, applyTheme } = await import('/src/prefs.js'); applyTheme('dark'); applyAccent('coral'); });
  await assertAccent();
  await page.screenshot({ path: path.join(output, 'coordinator-notes-dark-coral.png') });
  const [noteLinkTab] = await Promise.all([page.waitForEvent('popup'), linked.locator('a').first().click()]);
  await noteLinkTab.waitForLoadState();
  assert.equal(noteLinkTab.url(), 'https://x.com/example/status/123?s=20');
  await noteLinkTab.close();
  await page.keyboard.press('Escape');
  console.log('PASS Existing source recognition, independent Pool creation, locked double-submit protection, and retry recovery.');

  await openCreate();
  await fillSource(sourceUrl);
  await title.fill('Use the same source again next week');
  await submit.click();
  await modal.waitFor({ state: 'detached' });
  assert.equal(ledger.size, 2, 'A new intentional Create Post submission can reuse the same source again.');
  assert.notEqual(createBodies[2].idempotency_key, createBodies[0].idempotency_key);
  await page.screenshot({ path: path.join(output, 'reused-pool-desktop.png') });

  await openCreate();
  heldPreviewUrl = 'https://publication.example/old-source';
  await source.fill(heldPreviewUrl);
  await source.press('Tab');
  await waitUntil(() => pendingPreviews.length > 0);
  const newUrl = 'https://publication.example/new-source?edition=2';
  await source.fill(newUrl);
  await title.fill('My edited title survives preview changes');
  await modal.getByRole('button', { name: 'Get details', exact: true }).click();
  await modal.getByText('New source metadata', { exact: true }).waitFor();
  for (const pending of pendingPreviews.splice(0)) await pending.route.fulfill({ json: { preview: previewFor(pending.url) } }).catch(() => {});
  await source.focus();
  assert.equal(await source.inputValue(), newUrl, 'A stale preview never restores a discarded URL.');
  assert.equal(await title.inputValue(), 'My edited title survives preview changes', 'Source metadata preserves an edited title.');
  await submit.click();
  await modal.waitFor({ state: 'detached' });
  assert.equal(createBodies[3].source_url, newUrl);
  assert.equal(createBodies[3].source_title, 'New source metadata');
  assert.equal(createBodies[3].title, 'My edited title survives preview changes');
  assert.equal(JSON.parse(createBodies[3].references).includes(heldPreviewUrl), false, 'Stale previews do not add discarded sources to references.');
  console.log('PASS Intentional reuse receives a fresh key; stale metadata cannot replace the current source or edited fields.');

  await openCreate();
  await fillSource(sourceUrl);
  assert.equal(await title.inputValue(), 'A strong idea to reuse');
  assert.equal(await brief.inputValue(), 'Existing source caption');
  assert.equal(await postType.inputValue(), 'Carousel');
  assert.equal(await references.inputValue(), sourceUrl);
  await source.fill(newUrl);
  assert.equal(await title.inputValue(), '', 'Replacing a loaded source removes its untouched auto-title.');
  assert.equal(await brief.inputValue(), '', 'Replacing a loaded source removes its untouched auto-brief.');
  assert.equal(await postType.inputValue(), 'Image', 'Replacing a loaded source resets the untouched auto-format.');
  assert.equal(await references.inputValue(), '', 'Replacing a loaded source removes its auto-added reference.');
  await source.press('Tab');
  await modal.getByText('New source metadata', { exact: true }).waitFor();
  assert.equal(await postType.inputValue(), 'Reel', 'Video metadata maps to the supported Reel format.');
  await title.fill('Keep my title');
  await brief.fill('Keep my editorial brief');
  await postType.selectOption('Story');
  const manualReferences = 'https://production.example/brief\nhttps://production.example/style-guide';
  await references.fill(manualReferences);
  await fillSource(sourceUrl);
  assert.equal(await title.inputValue(), 'Keep my title', 'A loaded-source replacement preserves edited titles.');
  assert.equal(await brief.inputValue(), 'Keep my editorial brief', 'A loaded-source replacement preserves edited briefs.');
  assert.equal(await postType.inputValue(), 'Story', 'Detected format never replaces an explicit format choice.');
  assert.ok((await references.inputValue()).includes(manualReferences), 'Edited reference links survive source changes.');
  assert.equal(createBodies.length, 4, 'Changing source metadata does not create a task.');
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await modal.waitFor({ state: 'detached' });
  console.log('PASS Loaded-source replacement clears only auto-filled fields, maps Video to Reel, and preserves manual format/editorial choices.');

  await page.setViewportSize({ width: 390, height: 844 });
  await openCreate();
  await fillSource(sourceUrl);
  await title.fill('Reuse with production reference');
  await modal.locator('input[type="file"]').setInputFiles({ name: 'reference.txt', mimeType: 'text/plain', buffer: Buffer.from('Production reference fixture') });
  const bounds = await modal.evaluate(element => ({ overflow: element.scrollWidth - element.clientWidth, box: element.getBoundingClientRect().toJSON(), viewport: innerWidth }));
  assert.ok(bounds.overflow <= 1 && bounds.box.left >= 0 && bounds.box.right <= bounds.viewport, 'Create Post fits a narrow viewport.');
  await page.screenshot({ path: path.join(output, 'reuse-create-mobile.png') });
  failAttachment = true;
  await submit.click();
  await modal.getByRole('alert').waitFor();
  assert.match(await modal.getByRole('alert').innerText(), /already in the Pool/i);
  const createdBeforeAttachmentRetry = createBodies.length;
  await submit.click();
  await modal.waitFor({ state: 'detached' });
  assert.equal(createBodies.length, createdBeforeAttachmentRetry, 'Retrying an attachment does not create another Pool task.');
  assert.equal(attachmentCount, 2);
  assert.match(await page.locator('.scheduler-pool').innerText(), /Reuse with production reference/);
  assert.deepEqual(oldTask, original);

  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto(`${base}/index.html?desktop=1`);
  const card = page.locator('.gallery-grid .post-card').first();
  await card.getByRole('button', { name: 'Send to Pool', exact: true }).click();
  const assignment = page.locator('.queue-assign-modal');
  await assignment.waitFor();
  await assignment.getByRole('button', { name: 'Send to Pool', exact: true }).click();
  await assignment.waitFor({ state: 'detached' });
  assert.equal(poolBodies.length, 1, 'Normal Research Send to Pool keeps its existing endpoint and semantics.');
  assert.equal(poolBodies[0].account, researchPost.account);
  assert.equal(poolBodies[0].shortcode, researchPost.shortcode);
  assert.equal(createBodies.length, createdBeforeAttachmentRetry);
  assert.equal(mutations.some(value => /requests\/400\//.test(value)), false, 'Reuse never modifies the original assignment.');
  assert.deepEqual(errors, [], 'No browser runtime errors.');
  assert.deepEqual(unexpected, [], 'All API requests are isolated fixtures.');
  console.log(`PASS Attachment-only retries, narrow layout, old assignment preservation, and unchanged Research Send to Pool. Screenshots: ${output}`);
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
