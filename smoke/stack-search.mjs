// Actual Research entrypoints with fixture-only auth/data. No production reads or writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const originalId = 'b72ba3c7-9810-433f-a436-dd88d10ca65a';
const replacementId = 'ca59c450-e15d-4529-b1df-bd626af6d671';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sentient-stack-search-'));
const output = path.resolve('work/stack-identity');
fs.mkdirSync(output, { recursive: true });
const server = await createServer({
  mode: 'test', logLevel: 'error', cacheDir: path.join(temporary, 'vite-cache'),
  resolve: { alias: { 'firebase/auth': path.resolve('smoke/stub-firebase-auth.js'), 'firebase/app': path.resolve('smoke/stub-firebase-app.js') } },
  server: { host: 'localhost', port: 0 },
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const expectedKeys = ['STACKOLDER', 'STACKMIDDLE', 'STACKNEWEST'];
const viewer = { email: 'developer@example.test', is_dev: true, is_admin: true, operating_roles: ['admin', 'vc'] };
const account = { handle: 'chatgptricks', label: 'ChatGPTricks', group: 'sentient', active: 1, is_active: true };
const posts = [...expectedKeys, 'UNRELATED'].map((shortcode, index) => ({
  id: index + 1, postKey: `chatgptricks:${shortcode}`, account: 'chatgptricks', group: 'sentient', shortcode,
  caption: index === 3 ? 'Unrelated travel story' : `Shared story version ${index + 1}`,
  type: 'Image', postType: 'Image', likes: 1200 + index * 100, comments: 20,
  postDate: new Date(Date.UTC(2026, 9, 28, 12, index)).toISOString(),
  coverUrl: 'https://fixture.test/cover.svg', permalink: `https://instagram.com/p/${shortcode}/`,
  hidden: false, isHot: false, ...(index < 3 ? { stackId: originalId, stackSize: 3 } : {}),
}));
const cover = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#284e40"/><text x="36" y="96" fill="white" font-family="sans-serif" font-size="32">Shared story fixture</text></svg>';
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (fs.existsSync(chrome) ? chrome : undefined) });
  for (const mobile of [false, true]) {
    const label = mobile ? 'mobile' : 'desktop';
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      reducedMotion: 'reduce', serviceWorkers: 'block',
      ...(mobile ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' } : {}) });
    await context.addInitScript(() => {
      localStorage.setItem('sentient.language', 'en');
      localStorage.setItem('sentient.lang', 'en');
      localStorage.setItem('sentient.theme', 'dark');
      localStorage.setItem('sentient.effects', 'off');
    });
    const errors = [];
    let currentId = originalId;
    let mutations = 0;
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) {
        if (request.resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: cover });
        assert.equal(request.headers().authorization, 'Bearer tok', 'Only fixture authentication may reach the fixture API');
        const rows = posts.map(post => post.stackId ? { ...post, stackId: currentId } : post);
        let data = {};
        if (url.pathname.endsWith('/me/preferences')) data = { preferences: { language: 'en', theme: 'dark', effects: 'off' } };
        else if (url.pathname.endsWith('/stacks/find-similar')) {
          assert.equal(request.method(), 'POST');
          assert.ok(expectedKeys.some(shortcode => request.postData()?.includes(shortcode)), 'Mutation must identify one real stack member');
          mutations += 1;
          currentId = replacementId;
          data = { stackId: currentId, stackSize: 3, matchedCount: 2, postKeys: posts.slice(0, 3).map(post => post.postKey) };
        } else {
          assert.equal(request.method(), 'GET', `${label}: no other content mutation is allowed`);
          if (url.pathname === '/api/dashboard/me' || url.pathname === '/api/admin/me') data = viewer;
          else if (url.pathname.endsWith('/posts/manifest')) data = { revision: currentId, sources: [{ source: 'canonical', upperBound: rows.length }, { source: 'dashboard', upperBound: 0 }] };
          else if (url.pathname.endsWith('/posts/page')) data = { source: 'canonical', nextCursor: rows.length, done: true, upperBound: rows.length, revision: currentId, posts: rows };
          else if (url.pathname.endsWith('/posts')) data = { posts: rows, summary: {}, ranges: {} };
          else if (url.pathname.endsWith('/accounts')) data = { accounts: [account] };
          else if (url.pathname.endsWith('/lists')) data = { lists: [] };
          else if (url.pathname.endsWith('/golden-nuggets')) data = { items: [] };
        }
        return route.fulfill({ json: data });
      }
      if (url.origin === base) return route.continue();
      if (request.resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: cover });
      return route.fulfill({ status: 204, body: '' });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const cards = mobile ? '.m-post-grid .m-post-card[data-context-shortcode]' : '.gallery-grid .post-card[data-context-shortcode]';
    const search = mobile ? '.m-search-row input' : '.topbar-search input';
    const expectCoverKeys = async expected => {
      await page.waitForFunction(({ cards, expected }) => {
        const actual = [...document.querySelectorAll(cards)].filter(node => !node.closest('[inert]')).map(node => node.dataset.contextShortcode).sort();
        return JSON.stringify(actual) === JSON.stringify(expected);
      }, { cards, expected: [...expected].sort() });
    };
    await page.goto(`${base}/${mobile ? 'mobile/' : 'index.html?desktop=1'}`);
    await expectCoverKeys(['STACKNEWEST', 'UNRELATED']);
    // Populate desktop's lazy caption/OCR cache before checking a persisted ID.
    await page.locator(search).fill('Shared');
    await expectCoverKeys(['STACKNEWEST']);
    await page.locator(search).fill(originalId.toUpperCase());
    await expectCoverKeys(['STACKNEWEST']);
    assert.equal(await page.locator('.post-stack-trigger').innerText(), '+3', `${label}: exact stack ID includes every member`);
    await page.locator('.post-stack-trigger').click();
    const modal = page.getByRole('dialog', { name: 'Posts in this stack', exact: true });
    await modal.waitFor();
    assert.equal(await modal.getAttribute('data-stack-id'), originalId);
    assert.equal(await modal.locator('.stack-identity code').innerText(), originalId, `${label}: full persisted UUID remains visible`);
    assert.deepEqual((await modal.locator(mobile ? '.m-post-card' : '.post-card').evaluateAll(nodes => nodes.map(node => node.dataset.contextShortcode))).sort(), [...expectedKeys].sort(), `${label}: ID opens the entire stack`);
    await page.screenshot({ path: path.join(output, `${label}-expanded.png`) });
    if (!mobile) {
      // The mutation changes membership without rebuilding cached caption text.
      await modal.getByRole('button', { name: 'Post menu', exact: true }).first().click();
      await modal.getByRole('menuitem', { name: 'Find similar', exact: true }).click();
      await expectCoverKeys([]);
      assert.equal(mutations, 1, 'Only the user-requested fixture mutation runs');
      await page.locator(search).fill(replacementId);
      await expectCoverKeys(['STACKNEWEST']);
      assert.equal(await page.locator('.post-stack').getAttribute('data-stack-id'), replacementId, 'New ID must match current membership despite cached caption search');
      await page.locator(search).fill(`Shared -${originalId}`);
      await expectCoverKeys(['STACKNEWEST']);
      await page.locator(search).fill(`Shared -${replacementId}`);
      await expectCoverKeys([]);
      console.log('PASS desktop: new stack ID becomes searchable immediately; old ID and exclusions use current membership');
    } else {
      await modal.getByRole('button', { name: 'Close stack', exact: true }).click();
      await page.locator(search).fill(`-${originalId}`);
      await expectCoverKeys(['UNRELATED']);
      assert.equal(mutations, 0, 'Mobile search reads stored posts only');
    }
    assert.deepEqual(errors, [], `${label}: no uncaught browser errors`);
    console.log(`PASS ${label}: uppercase UUID search returns one complete stack, unrelated posts excluded`);
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
