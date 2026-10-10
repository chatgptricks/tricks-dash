// Real Research entrypoints, with every API/auth/image request intercepted.
// The smoke never uses production credentials or mutates production data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sentient-research-collabs-'));
const output = path.resolve('work/research-collabs');
fs.mkdirSync(output, { recursive: true });
const server = await createServer({
  mode: 'test', logLevel: 'error', cacheDir: path.join(temporary, 'vite-cache'),
  resolve: { alias: {
    'firebase/auth': path.resolve('smoke/stub-firebase-auth.js'),
    'firebase/app': path.resolve('smoke/stub-firebase-app.js'),
  } },
  server: { host: 'localhost', port: 0 },
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const email = 'user03@example.com';
const viewer = { email, is_dev: true, is_admin: true, operating_roles: ['admin', 'vc'] };
const accounts = [{ handle: 'chatgptricks', label: 'ChatGPTricks', group: 'sentient', active: 1, is_active: true }];
const sample = {
  account: 'chatgptricks', group: 'sentient', caption: 'Original fixture caption.',
  type: 'Image', postType: 'Image', likes: 2000, comments: 20,
  coverUrl: 'https://fixture.test/cover.svg', hidden: false, isHot: false,
};
const rows = [
  // The newer stack member is unknown. A filter must use the matching member
  // as its cover instead of leaking the newest unfiltered catalogue member.
  { shortcode: 'STACKCOLLAB', type: 'Carousel', postType: 'Carousel', isCollab: true, collaborators: ['openai'], isPromo: true, stackId: 'mixed-stack', stackSize: 2 },
  { shortcode: 'STACKUNKNOWN', isCollab: null, collaborators: [], stackId: 'mixed-stack', stackSize: 2 },
  { shortcode: 'COLLABONLY', isCollab: true, collaborators: ['openai'], isPromo: false },
  { shortcode: 'COLLABVIDEO', type: 'Video', postType: 'Video', isCollab: true, collaborators: ['openai', 'trends'], isPromo: true, caption: 'A confirmed promotion #aitoolsentient' },
  { shortcode: 'PROMOONLY', isCollab: false, collaborators: [], isPromo: true },
  { shortcode: 'MENTIONUNKNOWN', isCollab: null, collaborators: ['openai'], caption: 'Thanks @openai for the useful tools.', tagged_users: ['openai'], mentions: ['openai'] },
  { shortcode: 'LEGACYUNKNOWN', caption: 'Legacy post without collaboration metadata.' },
  { shortcode: 'MENTIONFALSE', isCollab: false, collaborators: [], caption: 'A mention of @openai.', tagged_users: ['openai'] },
  { shortcode: 'HIDDENCOLLAB', isCollab: true, collaborators: ['openai'], hidden: true },
];
const posts = rows.map((row, index) => ({
  ...sample, ...row, id: index + 1, postKey: `chatgptricks:${row.shortcode}`,
  postDate: new Date(Date.UTC(2026, 9, 10, 12, index)).toISOString(),
  permalink: `https://instagram.com/p/${row.shortcode}/`,
}));
const cases = [
  { name: 'desktop', width: 1280, height: 900, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
  { name: 'landscape', width: 844, height: 390, mobile: true },
];

function routeState(url) {
  const params = new URL(url).searchParams;
  const encoded = params.get('r');
  return encoded ? JSON.parse(Buffer.from(encoded, 'base64url').toString()) : Object.fromEntries(params);
}

async function expectCards(page, selector, shortcodes, label) {
  await page.waitForFunction(({ selector, expected }) => {
    const actual = [...document.querySelectorAll(selector)].filter(node => !node.closest('[inert]')).map(node => node.dataset.contextShortcode).sort();
    return JSON.stringify(actual) === JSON.stringify(expected);
  }, { selector, expected: [...shortcodes].sort() }, { timeout: 20000 }).catch(async error => {
    await page.screenshot({ path: path.join(output, 'failure.png') });
    const actual = await page.locator(selector).evaluateAll(nodes => nodes.filter(node => !node.closest('[inert]')).map(node => node.dataset.contextShortcode));
    const details = await page.evaluate(() => ({ url: location.href, body: document.body.innerText.slice(0, 500), scripts: [...document.scripts].map(node => node.src) }));
    throw new Error(`${label}: expected ${shortcodes.join(',')}; got ${actual.join(',')}. ${JSON.stringify(details)}. ${error.message}`);
  });
  assert.deepEqual((await page.locator(selector).evaluateAll(nodes => nodes.filter(node => !node.closest('[inert]')).map(node => node.dataset.contextShortcode))).sort(), [...shortcodes].sort(), label);
}

async function geometry(page, panel, label) {
  await page.evaluate(() => document.fonts.ready);
  await panel.evaluate(node => Promise.allSettled(node.getAnimations().map(animation => animation.finished)));
  const bounds = await panel.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      overflow: node.scrollWidth - node.clientWidth, width: innerWidth, height: innerHeight,
      documentWidth: document.documentElement.scrollWidth };
  });
  assert.ok(bounds.left >= -1 && bounds.right <= bounds.width + 1 && bounds.top >= -1 && bounds.bottom <= bounds.height + 1, `${label}: filter fits viewport ${JSON.stringify(bounds)}`);
  assert.ok(bounds.overflow <= 1 && bounds.documentWidth <= bounds.width + 1, `${label}: no horizontal overflow`);
}

let browser;
try {
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH || (fs.existsSync(chrome) ? chrome : undefined) });
  for (const language of ['en', 'es']) for (const scenario of cases) {
    const { mobile, width, height, name } = scenario;
    const label = `${language}-${name}`;
    const t = (en, es) => language === 'es' ? es : en;
    const errors = [];
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', serviceWorkers: 'block',
      ...(mobile ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' } : {}) });
    await context.addInitScript(language => {
      localStorage.setItem('sentient.language', language);
      localStorage.setItem('sentient.lang', language);
      localStorage.setItem('sentient.theme', 'dark');
      localStorage.setItem('sentient.accent', 'lime');
      localStorage.setItem('sentient.effects', 'off');
    }, language);
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) {
        if (request.resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#284e40"/></svg>' });
        assert.equal(request.headers().authorization, 'Bearer tok', 'Fixture API uses the stubbed session only');
        let data = {};
        if (url.pathname.endsWith('/me/preferences')) {
          data = { preferences: { language, theme: 'dark', accent: 'lime', effects: 'off' } };
        } else {
          assert.equal(request.method(), 'GET', `${label}: content mutations are forbidden`);
          if (url.pathname === '/api/dashboard/me' || url.pathname === '/api/admin/me') data = viewer;
          else if (url.pathname.endsWith('/posts/manifest')) data = { revision: 'collabs-smoke', sources: [{ source: 'canonical', upperBound: posts.length }, { source: 'dashboard', upperBound: 0 }] };
          else if (url.pathname.endsWith('/posts/page')) data = { source: 'canonical', nextCursor: posts.length, done: true, upperBound: posts.length, revision: 'collabs-smoke', posts };
          else if (url.pathname.endsWith('/posts')) data = { posts, summary: {}, ranges: {} };
          else if (url.pathname.endsWith('/accounts')) data = { accounts };
          else if (url.pathname.endsWith('/lists')) data = { lists: [] };
          else if (url.pathname.endsWith('/golden-nuggets')) data = { items: [] };
        }
        return route.fulfill({ json: data });
      }
      if (url.origin === base) return route.continue();
      if (request.resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#284e40"/><text x="36" y="96" fill="white" font-size="32">Collaboration fixture</text></svg>' });
      return route.fulfill({ status: 204, body: '' });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') console.error(`${label}: ${message.text()}`); });
    page.on('requestfailed', request => console.error(`${label}: ${request.url()}: ${request.failure()?.errorText}`));
    const cards = mobile ? '.m-post-grid .m-post-card[data-context-shortcode]' : '.gallery-grid .post-card[data-context-shortcode]';
    const baseline = ['STACKUNKNOWN', 'COLLABONLY', 'COLLABVIDEO', 'PROMOONLY', 'MENTIONUNKNOWN', 'LEGACYUNKNOWN', 'MENTIONFALSE'];
    const onlyCollabs = ['STACKCOLLAB', 'COLLABONLY', 'COLLABVIDEO'];
    const promoCollabs = ['STACKCOLLAB', 'COLLABVIDEO'];
    const openType = async () => {
      if (mobile) {
        await page.locator('.m-search-row > button').click();
        await page.locator('.m-sheet').waitFor();
        return page.locator('.m-sheet');
      }
      await page.locator('.filter-trigger').filter({
        has: page.locator('.filter-trigger-label', { hasText: new RegExp(`^${t('Type', 'Tipo')}$`) }),
      }).click();
      await page.locator('#filter-popover-type').waitFor();
      return page.locator('#filter-popover-type');
    };
    const closeType = async () => {
      if (mobile) await page.locator('.m-sheet > header button').click();
      else await page.keyboard.press('Escape');
    };
    const collabControl = panel => mobile
      ? panel.getByRole('checkbox', { name: t('Collabs only', 'Solo colaboraciones'), exact: true })
      : panel.getByRole('button', { name: t('Collabs', 'Colaboraciones'), exact: true });
    const promoControl = panel => mobile
      ? panel.getByRole('checkbox', { name: t('Promos only', 'Solo promos'), exact: true })
      : panel.getByRole('button', { name: 'Promo', exact: true });
    await page.goto(`${base}/${mobile ? 'mobile/' : 'index.html?desktop=1'}`);
    await expectCards(page, cards, baseline, `${label}: baseline excludes hidden posts and uses newest stack cover`);
    let panel = await openType();
    await collabControl(panel).click();
    await expectCards(page, cards, onlyCollabs, `${label}: Collabs toggle applies before selected-state checks`);
    if (!mobile) {
      assert.equal(await collabControl(panel).getAttribute('aria-pressed'), 'true');
      assert.equal(await collabControl(panel).getAttribute('title'), t('Show only confirmed collaborations', 'Mostrar solo colaboraciones confirmadas'));
    } else assert.equal(await collabControl(panel).isChecked(), true);
    await geometry(page, panel, label);
    if (mobile) await collabControl(panel).evaluate(node => node.closest('label').scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(output, `${label}.png`) });
    await closeType();
    await expectCards(page, cards, onlyCollabs, `${label}: confirmed only, no unknown/false/mentions or hidden posts`);
    await page.waitForFunction(() => new URL(location.href).searchParams.has('r'));
    assert.equal(routeState(page.url()).collab, '1', `${label}: route persists collab=1`);
    await page.reload();
    await expectCards(page, cards, onlyCollabs, `${label}: reload restores Collabs`);
    panel = await openType();
    if (mobile) assert.equal(await collabControl(panel).isChecked(), true);
    else assert.equal(await collabControl(panel).getAttribute('aria-pressed'), 'true');
    await promoControl(panel).click();
    await closeType();
    await expectCards(page, cards, promoCollabs, `${label}: Promo and Collabs combine with AND`);
    panel = await openType();
    if (mobile) await panel.getByLabel(new RegExp(`^${t('Format', 'Formato')}`)).selectOption('carousel');
    else await panel.getByRole('button', { name: /^Carousel/ }).click();
    await closeType();
    await expectCards(page, cards, ['STACKCOLLAB'], `${label}: format composes with Promo and Collabs`);
    const reset = mobile ? page.locator('.m-result-count button') : page.locator('.filter-clear-pill');
    await reset.click();
    await expectCards(page, cards, baseline, `${label}: reset restores default results`);
    assert.notEqual(routeState(page.url()).collab, '1', `${label}: reset removes collab route state`);
    panel = await openType();
    if (mobile) assert.equal(await collabControl(panel).isChecked(), false);
    else assert.equal(await collabControl(panel).getAttribute('aria-pressed'), 'false');
    await collabControl(panel).click();
    await expectCards(page, cards, onlyCollabs, `${label}: Collabs can be enabled again after reset`);
    await collabControl(panel).click();
    await expectCards(page, cards, baseline, `${label}: disabling the toggle restores unknown/false posts`);
    await closeType();
    assert.notEqual(routeState(page.url()).collab, '1', `${label}: disabling the toggle removes collab route state`);
    assert.deepEqual(errors, [], `${label}: no rendering or interaction errors`);
    console.log(`PASS Research Collabs ${label}: confirmed metadata, matching stack cover, Promo/format AND, URL/reload/reset and responsive filter`);
    await context.close();
  }
  console.log(`Collabs screenshots: ${output}`);
} finally {
  await browser?.close();
  await server.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
