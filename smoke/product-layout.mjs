// Actual entrypoints and CSS in Chromium. Firebase, chart rendering and every
// non-local request are fixtures: this test cannot read or mutate live data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const cardsOnly = process.argv.includes('--cards');
const before = process.argv.includes('--before');
const output = path.resolve(cardsOnly ? 'work/product-cards' : 'work/product-layout');
fs.mkdirSync(output, { recursive: true });
const server = await createServer({ logLevel: 'error', server: { host: 'localhost', port: 4196 } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (fs.existsSync(chrome) ? chrome : undefined) });
const requestedTool = process.argv.find(value => value.startsWith('--tool='))?.split('=')[1];
const tools = ['research', 'queue', 'promos', 'tracker', 'insights', 'hooks', 'vault', 'news', 'settings'].filter(tool => (!cardsOnly || ['research', 'promos', 'vault', 'news'].includes(tool)) && (!requestedTool || tool === 'research' || tool === requestedTool));
const navPaths = ['/index.html', '/queue.html', '/tracker.html', '/promos.html', '/vault.html', '/hooks.html', '/news.html', '/insights.html'];
const widths = cardsOnly ? [1920, 1440, 1280, 960, 700, 460, 390] : [1920, 1440, 1280, 390];
const errors = [], violations = [], measurements = [];
const email = 'user03@example.com';
const viewer = { email, is_dev: true, is_admin: true, isDev: true, isAdmin: true, operating_roles: ['admin', 'vc'], operatingRoles: ['admin', 'vc'], queue_role_preview_active: false };
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#22443b"/><text x="40" y="420" fill="white" font-size="35">A useful creative idea</text></svg>';
const imageUrl = 'https://layout-images.test/cover.svg';
const accounts = [{ handle: 'alpha', label: 'Alpha Studio', full_name: 'Alpha Studio', group: 'sentient', followers: 1200, active: 1, is_active: true }, { handle: 'beta', label: 'Beta Studio', full_name: 'Beta Studio', group: 'competitors', followers: 2400, active: 1, is_active: true }];
const posts = Array.from({ length: 6 }, (_, index) => accounts[index % accounts.length]).map((account, index) => ({ id: index + 1, postKey: `${account.handle}:LAYOUT${index}`, shortcode: `LAYOUT${index}`, account: account.handle, caption: 'A useful creative idea for the next project.', postType: 'Carousel', type: 'Carousel', likes: 2000, comments: 20, postDate: new Date().toISOString(), coverUrl: imageUrl, permalink: `https://instagram.com/p/LAYOUT${index}/` }));
const promoBase = { account: 'alpha', shortcode: 'PROMO', client: 'Studio One', product: 'Video editor', classification: 'disclosed', review_status: 'new', published_at: new Date().toISOString(), caption: 'Sponsored by Studio One.', evidence: [{ family: 'explicit', text: 'Sponsored by Studio One.' }], cover_source_url: imageUrl };
const promos = Array.from({ length: 6 }, (_, index) => ({ ...promoBase, shortcode: `PROMO${index}`, client: `Studio ${index}`, cover_source_url: index === 5 ? '' : imageUrl }));
const hooks = [{ id: 'caption:alpha', account: 'alpha', shortcode: 'LAYOUT0', source_kind: 'caption', hook_text: 'These five creative habits save me hours every week.', likes: 2000, categories: [], published_at: new Date().toISOString() }];
const vaultBase = { id: 'layout-link', title: 'A useful creative idea', url: 'https://example.test/idea', priority: 0, discarded: 0, shared_at: new Date().toISOString(), source: 'Creative team', tweet_image: imageUrl, tweet_text: 'A simple example worth keeping for the next project.' };
const vault = Array.from({ length: 6 }, (_, index) => ({ ...vaultBase, id: `link-${index}`, priority: index, title: `Creative idea ${index + 1}`, tweet_image: index === 5 ? '' : index === 4 ? 'https://layout-images.test/broken.svg' : imageUrl }));
const news = Array.from({ length: 6 }, (_, index) => ({ id: `story-${index}`, title: `Research team shares AI discovery ${index + 1}`, description: 'A closer look at the evidence behind a useful new creative workflow, with practical ideas for the next project.', link: `https://example.test/story-${index}`, image: index === 5 ? '' : index === 4 ? 'https://layout-images.test/broken.svg' : imageUrl, published: new Date().toISOString(), publisher: 'Creative Research', source: 'Research news', sourceType: 'news', feedLabel: 'AI research', feedId: 'ow6LmNtmgkH0e876' }));
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(new Date());
const queue = { viewer: { ...viewer, displayName: 'User 03', accounts: ['alpha'] }, date: day, requests: [], pickRequests: [], hotPickRequests: [], planningRequests: [], assignedRequests: [], liveDrafts: [], liveRevision: 0, presence: {}, timeBlocks: [], pendingTicketCount: 0, designers: [{ email, accounts: ['alpha'] }], schedulerUsers: [{ email, displayName: 'User 03', roles: ['vc', 'pd'], isQueueDesigner: true, accounts: ['alpha'] }], accounts, accountOnboarding: { completed: true, selectedAccounts: ['alpha'] }, tags: [], priorities: ['low', 'medium', 'high'], hours: { start: 0, end: 1440 } };
const authSource = fs.readFileSync('smoke/stub-firebase-auth.js', 'utf8').replaceAll('{ email:', "{ uid: 'layout-user', email:");
const appSource = fs.readFileSync('smoke/stub-firebase-app.js', 'utf8');
const chartSource = 'class Chart { static defaults={font:{}}; constructor() {} destroy() {} update() {} }';

function check(condition, message) { if (!condition) violations.push(message); }
function near(actual, expected, message, tolerance = 1) { check(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`); }

async function fixturePage(theme, profile = 'dev') {
  const roleViewer = profile === 'dev' ? viewer : { email: 'layout@example.test', is_dev: false, is_admin: false, isDev: false, isAdmin: false, operating_roles: [profile === 'vc' ? 'vc' : 'pd'], operatingRoles: [profile === 'vc' ? 'vc' : 'pd'], can_access_news: profile === 'news', queue_role_preview_active: false };
  const roleAuth = authSource.replaceAll(email, roleViewer.email);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1000 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await page.addInitScript(value => {
    localStorage.setItem('sentient.lang', 'en');
    localStorage.setItem('sentient.theme', value);
    localStorage.setItem('sentient.accent', 'lime');
    localStorage.setItem('sentient.effects', 'off');
    localStorage.setItem('sentient.queueGuide.v1', 'completed');
  }, theme);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const filename = url.pathname;
    if (filename.endsWith('/broken.svg')) return route.fulfill({ status: 404, body: '' });
    if (filename.includes('PROMO5') && route.request().resourceType() === 'image') return route.fulfill({ status: 404, body: '' });
    if (filename.startsWith('/api/')) {
      const method = route.request().method();
      if (method !== 'GET' && !filename.endsWith('/me/preferences') && !filename.endsWith('/presence')) {
        errors.push(`Unexpected mutation: ${method} ${filename}`);
        return route.fulfill({ status: 405, json: { detail: 'Layout fixtures forbid content mutations.' } });
      }
      let data = {};
      if (filename === '/api/dashboard/me' || filename === '/api/admin/me') data = roleViewer;
      else if (filename.endsWith('/me/preferences')) data = { preferences: { theme, language: 'en', accent: 'lime', effects: 'off', queueGuideCompleted: true } };
      else if (filename.endsWith('/posts/manifest')) data = { revision: 'product-layout', sources: [{ source: 'canonical', upperBound: posts.length }, { source: 'dashboard', upperBound: 0 }] };
      else if (filename.endsWith('/posts/page')) data = { source: 'canonical', nextCursor: posts.length, done: true, upperBound: posts.length, revision: 'product-layout', posts };
      else if (filename.endsWith('/posts/media')) data = { items: [] };
      else if (filename === '/api/insights/posts') data = { accounts, posts: posts.map((post, index) => ({ a: post.account, d: post.postDate, l: post.likes, c: post.comments, v: 3000, t: 'Image', pt: 'image', ocr: post.caption, h: 'creativity', u: post.permalink, id: index })) };
      else if (filename.endsWith('/posts')) data = { posts, summary: {}, ranges: {} };
      else if (filename.endsWith('/accounts')) data = { accounts };
      else if (filename.endsWith('/lists')) data = { lists: [] };
      else if (filename.endsWith('/golden-nuggets')) data = { items: [] };
      else if (filename === '/api/dashboard/queue/v2/live') return route.fulfill({ status: 403, body: '' });
      else if (filename.startsWith('/api/dashboard/queue/v2')) data = { ...queue, viewer: { ...queue.viewer, ...roleViewer } };
      else if (filename === '/api/admin/promos') data = { items: promos, next_cursor: null };
      else if (filename === '/api/dashboard/hooks') data = { results: hooks, status: { total: 1, captions: 1, ocr: 0, categorized: 0, pending: 1, drafts: 0 } };
      else if (filename === '/api/dashboard/hooks/drafts') data = { drafts: [] };
      else if (filename === '/api/dashboard/vault') data = { items: vault };
      else if (filename === '/api/dashboard/news') data = { items: news, reviews: {}, saved: {} };
      else if (filename === '/api/tracker/summary') data = { accounts, tracking_since: '2026-09-01' };
      else if (filename.endsWith('/follower-growth')) data = { accounts: [], peaks: [] };
      else if (filename.endsWith('/refresh-allowance')) data = { unlimited: true };
      else if (filename.endsWith('/users')) data = { users: [] };
      else if (filename.endsWith('/runs')) data = { runs: [] };
      else if (filename.endsWith('/disk-status')) data = { pct_used: 20, free_mb: 8000, used_mb: 2000, total_mb: 10000 };
      if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: image });
      return route.fulfill({ json: data });
    }
    if (filename.includes('/.vite/deps/firebase_auth.js') || /\/firebase-auth\.js$/.test(filename)) return route.fulfill({ contentType: 'text/javascript', body: roleAuth });
    if (filename.includes('/.vite/deps/firebase_app.js') || /\/firebase-app\.js$/.test(filename)) return route.fulfill({ contentType: 'text/javascript', body: appSource });
    if (/chart\.js/.test(url.href)) return route.fulfill({ contentType: 'text/javascript', body: chartSource });
    if (url.origin === base) return route.continue();
    if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: image });
    return route.fulfill({ status: 404, body: '' });
  });
  return page;
}

async function readGeometry(page) {
  return page.evaluate(() => {
    const header = document.querySelector('.product-header');
    const rect = element => element && ({ ...element.getBoundingClientRect().toJSON() });
    const css = (element, properties) => Object.fromEntries(properties.map(key => [key, getComputedStyle(element)[key]]));
    const links = [...header.querySelectorAll('.product-nav a')].filter(element => element.getClientRects().length && getComputedStyle(element).display !== 'none');
    const brand = header.querySelector('.product-brand');
    const avatar = header.querySelector('.settings-menu-trigger, .queue-settings-trigger');
    return {
      viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      header: rect(header), headerCss: css(header, ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderRadius', 'columnGap', 'rowGap']),
      brand: rect(brand), brandCss: css(brand, ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing']),
      nav: rect(header.querySelector('.product-nav')),
      links: links.map(link => ({ path: new URL(link.href).pathname, label: link.textContent.trim(), current: link.getAttribute('aria-current'), box: rect(link), css: css(link, ['fontSize', 'fontWeight', 'lineHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderRadius']) })),
      avatar: rect(avatar), avatarCss: avatar ? css(avatar, ['borderRadius', 'paddingTop', 'paddingLeft']) : null,
      overflowElements: document.documentElement.scrollWidth <= innerWidth + 1 ? [] : [...document.querySelectorAll('body *')].filter(element => {
        if (element.getBoundingClientRect().right <= innerWidth + 1) return false;
        for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(parent).overflowX) && parent.getBoundingClientRect().right <= innerWidth + 1) return false;
        }
        return true;
      }).slice(0, 20).map(element => ({ tag: element.tagName, id: element.id, class: element.className, box: rect(element), minWidth: getComputedStyle(element).minWidth })),
    };
  });
}

async function readCards(page) {
  return page.evaluate(() => {
    const grid = document.querySelector('.gallery-grid, .product-card-grid');
    if (!grid) return null;
    const cards = [...grid.querySelectorAll('.post-card')];
    const box = element => element.getBoundingClientRect().toJSON();
    const css = (element, properties) => Object.fromEntries(properties.map(key => [key, getComputedStyle(element)[key]]));
    return {
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      gap: getComputedStyle(grid).gap,
      cards: cards.map(card => {
        const media = card.querySelector('.post-media');
        return { box: box(card), media: box(media), radius: getComputedStyle(card).borderRadius,
          header: css(card.querySelector('.post-header'), ['padding', 'gap']),
          avatar: box(card.querySelector('.post-avatar')),
          source: css(card.querySelector('.post-user-copy strong'), ['fontSize', 'fontWeight', 'lineHeight']),
          body: css(card.querySelector('.post-copy'), ['padding']),
          actions: css(card.querySelector('.post-editorial-actions'), ['padding', 'gap']),
          overflow: card.scrollWidth - card.clientWidth,
          images: [...media.querySelectorAll('img')].map(image => ({ complete: image.complete, loaded: image.naturalWidth > 0, fit: getComputedStyle(image).objectFit, filter: getComputedStyle(image).filter })),
        };
      }),
      placeholders: grid.querySelectorAll('.product-card-placeholder').length,
    };
  });
}

async function checkMenu(page, label, baseline) {
  const trigger = page.locator('.product-account .settings-menu-trigger, .product-account .queue-settings-trigger').first();
  if (!await trigger.count()) { check(false, `${label}: header must expose the account menu`); return null; }
  await trigger.click();
  const panel = page.locator('.settings-menu-panel:visible, .queue-settings-panel:visible').first();
  try { await panel.waitFor({ state: 'visible', timeout: 2000 }); }
  catch { check(false, `${label}: account menu must open`); return null; }
  // Standalone tools verify administrator access when the menu first opens.
  if (await page.locator('#settingsAdmin').count()) await page.locator('#settingsAdmin.is-visible').waitFor({ state: 'attached', timeout: 5000 });
  const result = await panel.evaluate(element => {
    const style = getComputedStyle(element), box = element.getBoundingClientRect();
    return { x: box.x, right: box.right, top: box.top, bottom: box.bottom, width: box.width, radius: style.borderRadius, padding: style.padding, position: style.position, overflow: element.scrollWidth - element.clientWidth };
  });
  check(result.x >= 0 && result.right <= await page.evaluate(() => innerWidth) + 1, `${label}: account menu must fit horizontally`);
  check(result.top >= 0 && result.bottom <= await page.evaluate(() => innerHeight) + 1, `${label}: account menu must fit vertically`);
  check(result.overflow <= 1, `${label}: account menu must not clip its controls`);
  if (baseline) {
    near(result.width, baseline.width, `${label}: account menu width matches Research`);
    check(result.radius === baseline.radius, `${label}: account menu radius matches Research (${result.radius} vs ${baseline.radius})`);
    check(result.padding === baseline.padding, `${label}: account menu padding matches Research (${result.padding} vs ${baseline.padding})`);
    check(result.position === baseline.position, `${label}: responsive account menu placement matches Research`);
  }
  await page.keyboard.press('Escape');
  try { await panel.waitFor({ state: 'hidden', timeout: 2000 }); }
  catch { check(false, `${label}: Escape must close the account menu`); await trigger.click(); }
  check(await trigger.getAttribute('aria-expanded') === 'false', `${label}: account trigger reflects the closed state`);
  check(await trigger.evaluate(element => element === document.activeElement), `${label}: Escape returns keyboard focus to the account trigger`);
  return result;
}

try {
  for (const theme of ['dark', 'light']) {
    const reference = new Map();
    const page = await fixturePage(theme);
    for (const tool of tools) {
      await page.setViewportSize({ width: 1920, height: 1000 });
      await page.goto(`${base}/${tool === 'research' ? 'index' : tool}.html?desktop=1`);
      await page.locator('.product-header').waitFor({ timeout: 20000 });
      if (['tracker', 'insights'].includes(tool)) await page.locator('#authGate.hidden').waitFor({ state: 'attached' });
      // Role preview can reveal Insights before the static shell resolves
      // DEV access. Measure only after every authorized link has settled.
      await page.waitForFunction(paths => paths.every(path => {
        const link = document.querySelector(`.product-nav a[href="${path}"]`);
        return link && !link.hidden && getComputedStyle(link).display !== 'none' && link.getClientRects().length > 0;
      }), navPaths);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(200);
      check(await page.locator('.app-recovery').count() === 0, `${tool}/${theme}: real workspace renders without recovery`);
      for (const width of widths) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        // ResizeObserver and responsive style updates settle on the next frame.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const label = `${tool}/${theme}/${width}`;
        const geometry = await readGeometry(page);
        const expected = reference.get(width);
        const gutter = width <= 700 ? 12 : 24;
        near(geometry.header.x, gutter, `${label}: left page gutter`);
        near(geometry.header.width, width - gutter * 2, `${label}: full page width`);
        check(geometry.scrollWidth <= width + 1, `${label}: document overflow (${geometry.scrollWidth - width}px)`);
        check(JSON.stringify(geometry.links.map(link => link.path)) === JSON.stringify(navPaths), `${label}: Dev navigation must use the same links and order (${geometry.links.map(link => link.label).join(', ')})`);
        check(geometry.links.filter(link => link.current === 'page').length === (tool === 'settings' ? 0 : 1), `${label}: exactly the current tool is marked active`);
        check(geometry.avatar !== null, `${label}: avatar trigger exists`);
        const selectedLink = geometry.links.find(link => link.current === 'page');
        if (selectedLink) check(selectedLink.box.x >= geometry.nav.x - 1 && selectedLink.box.right <= geometry.nav.right + 1, `${label}: current tool remains visible inside the scrolling navigation`);
        if (expected) {
          near(geometry.header.height, expected.geometry.header.height, `${label}: header height matches Research`);
          check(JSON.stringify(geometry.headerCss) === JSON.stringify(expected.geometry.headerCss), `${label}: header padding, radius and gaps match Research (${JSON.stringify(geometry.headerCss)})`);
          check(JSON.stringify(geometry.brandCss) === JSON.stringify(expected.geometry.brandCss), `${label}: brand typography matches Research`);
          for (const key of ['width', 'height']) near(geometry.brand[key], expected.geometry.brand[key], `${label}: brand ${key}`);
          for (const key of ['x', 'width', 'height']) near(geometry.nav[key], expected.geometry.nav[key], `${label}: navigation ${key}`);
          near(geometry.nav.y - geometry.header.y, expected.geometry.nav.y - expected.geometry.header.y, `${label}: navigation row alignment`);
          if (geometry.avatar && expected.geometry.avatar) {
            for (const key of ['x', 'width', 'height']) near(geometry.avatar[key], expected.geometry.avatar[key], `${label}: avatar ${key}`);
            near(geometry.avatar.y - geometry.header.y, expected.geometry.avatar.y - expected.geometry.header.y, `${label}: avatar row alignment`);
            check(JSON.stringify(geometry.avatarCss) === JSON.stringify(expected.geometry.avatarCss), `${label}: avatar shape matches Research`);
          }
          geometry.links.forEach((link, index) => {
            const referenceLink = expected.geometry.links[index];
            if (!referenceLink || referenceLink.path !== link.path) return;
            check(JSON.stringify(link.css) === JSON.stringify(referenceLink.css), `${label}: ${link.label} navigation typography and padding match Research`);
            near(link.box.height, referenceLink.box.height, `${label}: ${link.label} navigation height`);
          });
        } else {
          check(geometry.headerCss.borderRadius === '16px', `${label}: Research header retains its 16px radius`);
          check(geometry.headerCss.paddingTop === '10px' && geometry.headerCss.paddingRight === '16px', `${label}: Research header retains compact 10px / 16px padding`);
        }
        let cards;
        if (cardsOnly) {
          await page.locator('.gallery-grid .post-card, .product-card-grid .post-card').first().waitFor();
          cards = await readCards(page);
          const columns = width <= 460 ? 1 : width <= 700 ? 2 : width <= 960 ? 3 : width <= 1280 ? 4 : 6;
          check(cards?.columns === columns, `${label}: expected ${columns} columns, got ${cards?.columns}`);
          check(cards?.cards.length === 6, `${label}: all six fixture cards must remain visible`);
          check(cards?.gap === '20px', `${label}: Research grid gap`);
          const cardReference = expected?.cards?.cards[0];
          for (const card of cards?.cards || []) {
            near(card.media.width / card.media.height, .75, `${label}: portrait media ratio`, .005);
            check(card.overflow <= 1, `${label}: card controls and copy must fit`);
            if (cardReference) {
              near(card.box.width, cardReference.box.width, `${label}: card width matches Research`);
              near(card.avatar.width, cardReference.avatar.width, `${label}: avatar width matches Research`);
              check(card.radius === cardReference.radius, `${label}: card radius matches Research`);
              for (const part of ['header', 'source', 'body', 'actions']) check(JSON.stringify(card[part]) === JSON.stringify(cardReference[part]), `${label}: ${part} matches Research (${JSON.stringify(card[part])} vs ${JSON.stringify(cardReference[part])})`);
            }
            if (tool !== 'research') for (const image of card.images) check(image.fit === 'contain' && image.filter === 'none', `${label}: source media stays complete and unfiltered`);
          }
          if (width === 390 && tool !== 'research') {
            await page.locator('.product-card').last().scrollIntoViewIfNeeded();
            await page.waitForFunction(() => document.querySelector('.product-card-grid .product-card-placeholder'));
            check((await readCards(page)).placeholders >= 1, `${label}: missing media keeps a useful card placeholder`);
            await page.evaluate(() => scrollTo(0, 0));
          }
        }
        const menu = await checkMenu(page, label, expected?.menu);
        measurements.push({ tool, theme, width, geometry, menu, cards });
        if (tool === 'research') reference.set(width, { geometry, menu, cards });
        if (width === 1440 || width === 390) await page.screenshot({ path: path.join(output, `${tool}-${theme}-${width}.png`) });
      }
      console.log(`Checked ${tool}: ${theme}, ${widths.join('/')}px`);
    }
    await page.close();
  }
  // Identical chrome must not accidentally broaden navigation permissions.
  // Every accessible workspace uses the same links for the same viewer.
  for (const profile of requestedTool || cardsOnly ? [] : ['pd', 'vc', 'news']) {
    const page = await fixturePage('dark', profile);
    const allowed = navPaths.filter(value => !['/vault.html', '/hooks.html', '/news.html', '/insights.html'].includes(value)
      || (profile === 'vc' && value === '/insights.html') || (profile === 'news' && value === '/news.html'));
    const roleTools = ['research', 'queue', 'promos', 'tracker', ...(profile === 'vc' ? ['insights'] : []), ...(profile === 'news' ? ['news'] : [])];
    for (const tool of roleTools) {
      await page.goto(`${base}/${tool === 'research' ? 'index' : tool}.html?desktop=1`);
      await page.locator('.product-header').waitFor({ timeout: 20000 });
      if (['tracker', 'insights'].includes(tool)) await page.locator('#authGate.hidden').waitFor({ state: 'attached' });
      if (profile !== 'pd') await page.waitForFunction(target => {
        const link = document.querySelector(`.product-nav a[href="/${target}.html"]`);
        return link && getComputedStyle(link).display !== 'none' && link.getClientRects().length > 0;
      }, profile === 'vc' ? 'insights' : 'news');
      await page.waitForTimeout(200);
      const geometry = await readGeometry(page);
      check(JSON.stringify(geometry.links.map(link => link.path)) === JSON.stringify(allowed), `${tool}/${profile}: visible navigation matches the viewer permissions (${geometry.links.map(link => link.label).join(', ')})`);
      const trigger = page.locator('.product-account .settings-menu-trigger, .product-account .queue-settings-trigger').first();
      await trigger.click();
      const settingsLink = page.locator('.product-account a[href$="settings.html"]:visible');
      check(await settingsLink.count() === 0, `${tool}/${profile}: administrator Settings link remains restricted`);
      await page.keyboard.press('Escape');
    }
    await page.close();
    console.log(`Checked shared navigation permissions: ${profile}`);
  }
  fs.writeFileSync(path.join(output, 'measurements.json'), JSON.stringify({ errors, violations, measurements }, null, 2));
  if (violations.length) console.error(violations.join('\n'));
  assert.deepEqual(errors, [], 'All nine workspaces must load without JavaScript errors or content mutations');
  if (!before) assert.deepEqual(violations, [], 'Product layouts must match the Research shell');
  console.log(`${before ? 'BASELINE' : 'PASS'} product layout: ${tools.length} real workspaces, ${measurements.length} theme/width combinations, shared header/navigation/avatar/menu geometry, Escape/focus and no horizontal overflow. All external traffic mocked.`);
} finally {
  fs.writeFileSync(path.join(output, 'measurements.json'), JSON.stringify({ errors, violations, measurements }, null, 2));
  await browser.close();
  await server.close();
}
