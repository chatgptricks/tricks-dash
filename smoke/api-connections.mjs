import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const directory = path.resolve('work/api-connections');
await mkdir(directory, { recursive: true });
// Keep this auth fixture local to this smoke. Existing page smokes need the
// shared fixture's simpler behavior, while API secrets need session checks.
const authFixture = path.join(directory, 'firebase-auth.js');
await writeFile(authFixture, `
const owner = { email: 'owner@sentientagency.io', getIdToken: () => Promise.resolve('tok') };
const auth = { currentUser: owner };
const observers = new Set();
window.__apiSmokeSetUser = (email, token = 'tok') => {
  auth.currentUser = email ? { email, getIdToken: () => Promise.resolve(token) } : null;
  observers.forEach(callback => callback(auth.currentUser));
};
export function getAuth() { return auth; }
export class GoogleAuthProvider { setCustomParameters() {} }
export const browserPopupRedirectResolver = {};
export const browserLocalPersistence = {};
export function setPersistence() { return Promise.resolve(); }
export function onAuthStateChanged(_auth, callback) {
  observers.add(callback); callback(auth.currentUser);
  return () => observers.delete(callback);
}
export function signInWithPopup() {
  window.__apiSmokeSetUser('owner@sentientagency.io'); return Promise.resolve();
}
export function signInWithRedirect() { return signInWithPopup(); }
export function signOut() { window.__apiSmokeSetUser(null); return Promise.resolve(); }
`);
await build({
  entryPoints: ['src/apiConnections.jsx'],
  bundle: true,
  outdir: directory,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  define: {
    'import.meta.env.VITE_API_BASE': '"https://api.test"',
    'import.meta.env.BASE_URL': '"/"',
    'import.meta.env.MODE': '"test"',
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
  },
  alias: {
    'firebase/app': path.resolve('smoke/stub-firebase-app.js'),
    'firebase/auth': authFixture,
  },
});
const server = createServer(async (request, response) => {
  try {
    if (request.url === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/apiConnections.css"></head><body><div id="root"></div><script type="module" src="/apiConnections.js"></script></body></html>');
    } else {
      response.setHeader('Content-Type', request.url.endsWith('.css') ? 'text/css' : 'application/javascript');
      response.end(await readFile(path.join(directory, request.url.slice(1))));
    }
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (existsSync(chrome) ? chrome : undefined) });

try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, timezoneId: 'America/Costa_Rica' });
    page.setDefaultTimeout(10000);
    const errors = [], consoleMessages = [], requests = [], secrets = [], connections = [];
    const accounts = [
      { handle: 'creator', public_name: 'Creator — public profile' },
      { handle: 'creator_studio', public_name: 'Creator Studio' },
      { handle: 'unselected_brand', public_name: 'Unselected account' },
      { handle: 'long_account_handle_for_layout_validation', public_name: 'A long account name that must wrap safely on a narrow phone display' },
    ];
    let failCreate = true, failRevoke = false, canCreate = true, creationCount = 0;
    let holdNextCreate = false, releaseCreate, heldCreate;
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => consoleMessages.push(message.text()));
    page.on('request', request => requests.push(JSON.stringify({ url: request.url(), headers: request.headers(), body: request.postData() })));
    await page.route('https://api.test/**', async route => {
      const request = route.request();
      assert.equal(new URL(request.url()).pathname.startsWith('/api/dashboard/me/api-keys'), true);
      const token = request.headers().authorization;
      assert.equal(['Bearer tok', 'Bearer tok-two'].includes(token), true);
      assert.equal(request.headers()['x-sentient-time-zone'], 'America/Costa_Rica');
      if (request.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ keys: token === 'Bearer tok' ? connections : [], available_accounts: accounts, can_create: canCreate }) });
      } else if (request.method() === 'POST') {
        assert.equal(token, 'Bearer tok');
        assert.equal(request.headers()['content-type'], 'application/json');
        assert.deepEqual(request.postDataJSON(), { name: 'Website integration', account_handles: ['creator', 'creator_studio'], expires_in_days: 30 });
        if (failCreate) {
          await route.fulfill({ status: 403, contentType: 'application/json', body: '{"detail":"Creation denied"}' });
          return;
        }
        creationCount += 1;
        const key = `sad_api_test_${creationCount}_${'x'.repeat(43)}`; // Fabricated, never a production credential.
        secrets.push(key);
        const connection = {
          id: `test-${creationCount}`, name: 'Website integration', key_prefix: key.slice(0, 16),
          account_handles: ['creator', 'creator_studio'], expires_at: '2099-01-01T00:00:00Z',
          created_at: '2026-10-09T12:00:00Z', revoked_at: null, last_used_at: null,
        };
        connections.unshift(connection);
        if (holdNextCreate) {
          holdNextCreate = false;
          heldCreate = connection;
          await new Promise(resolve => { releaseCreate = resolve; });
        }
        // A session change deliberately aborts the last pending request.
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ key, connection }) }).catch(error => {
          if (!error.message.includes('intercepted') && !error.message.includes('closed')) throw error;
        });
      } else if (request.method() === 'DELETE') {
        assert.equal(token, 'Bearer tok');
        assert.equal(request.postData(), null);
        const id = decodeURIComponent(new URL(request.url()).pathname.split('/').at(-1));
        const connection = connections.find(item => item.id === id);
        assert.ok(connection);
        if (failRevoke) {
          await route.fulfill({ status: 403, contentType: 'application/json', body: '{"detail":"Revoke denied"}' });
        } else {
          connection.revoked_at = '2026-10-09T13:00:00Z';
          await route.fulfill({ status: 200, contentType: 'application/json', body: '{"revoked":true}' });
        }
      } else assert.fail(`Unexpected method: ${request.method()}`);
    });
    const createButton = page.getByRole('button', { name: 'Generate API key', exact: true });
    const prepareCreation = async () => {
      await page.getByLabel('Connection name').fill('  Website integration  ');
      await page.getByLabel('Expires in').selectOption('30');
      await page.getByLabel('Search accounts').fill('');
      await page.getByRole('checkbox', { name: '@creator Creator — public profile', exact: true }).check();
      await page.getByRole('checkbox', { name: '@creator_studio Creator Studio', exact: true }).check();
    };
    const assertNoLeaks = async () => {
      const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
      for (const secret of secrets) {
        assert.equal(storage.includes(secret), false);
        assert.equal(requests.some(request => request.includes(secret)), false);
        assert.equal(consoleMessages.some(message => message.includes(secret)), false);
        assert.equal(page.url().includes(secret), false);
      }
    };
    const assertFits = async () => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('input, textarea, select, button, fieldset')].filter(element => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && (box.left < 0 || box.right > innerWidth + 1);
      }).map(element => element.outerHTML)), []);
    };

    await page.goto(origin);
    await page.getByText('No API connections yet.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Read the API guide', exact: true }).getAttribute('href'), '/api-guide.html');
    assert.equal(await page.getByLabel('Connection name').getAttribute('placeholder'), 'Company website');
    assert.equal(await createButton.isDisabled(), true);
    await page.getByLabel('Connection name').fill('  Website integration  ');
    assert.equal(await createButton.isDisabled(), true);
    await page.getByRole('checkbox', { name: '@creator Creator — public profile', exact: true }).check();
    assert.equal(await createButton.isEnabled(), true);
    await page.getByLabel('Search accounts').fill('studio');
    assert.equal(await page.getByRole('checkbox').count(), 1);
    await page.getByRole('checkbox', { name: '@creator_studio Creator Studio', exact: true }).check();
    await page.getByText('2 accounts selected', { exact: true }).waitFor();
    await page.getByLabel('Search accounts').fill('no-match');
    await page.getByText('No matching accounts.', { exact: true }).waitFor();
    assert.equal(await page.getByText('2 accounts selected', { exact: true }).count(), 1);
    await page.getByLabel('Search accounts').fill('');
    assert.equal(await page.getByRole('checkbox', { name: '@creator Creator — public profile', exact: true }).isChecked(), true);
    assert.equal(await page.getByRole('checkbox', { name: '@creator_studio Creator Studio', exact: true }).isChecked(), true);
    assert.equal(await page.getByRole('checkbox', { name: '@unselected_brand Unselected account', exact: true }).isChecked(), false);
    await page.getByLabel('Expires in').selectOption('30');
    await assertFits();
    await page.screenshot({ path: path.join(directory, `api-selection-${width}.png`), fullPage: true });

    await createButton.click();
    await page.getByRole('alert').filter({ hasText: 'Creation denied' }).waitFor();
    assert.equal(await page.getByLabel('Connection name').inputValue(), '  Website integration  ');
    assert.equal(await page.getByLabel('Expires in').inputValue(), '30');
    assert.equal(await page.getByText('2 accounts selected', { exact: true }).count(), 1);
    assert.equal(await page.getByLabel('API key', { exact: true }).count(), 0);
    assert.equal(requests.filter(request => request.includes('"body":"')).length, 1);
    failCreate = false;
    await createButton.click();
    await page.getByRole('heading', { name: 'Your API key', exact: true }).waitFor();
    assert.equal(await page.getByLabel('API key', { exact: true }).inputValue(), secrets[0]);
    assert.equal(await page.getByLabel('Connection name').inputValue(), '');
    assert.equal(await page.getByText('0 accounts selected', { exact: true }).count(), 1);
    assert.equal(await createButton.isDisabled(), true);
    await assertNoLeaks();
    await assertFits();
    await page.screenshot({ path: path.join(directory, `api-issued-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'I saved the key', exact: true }).click();
    assert.equal(await page.getByLabel('API key', { exact: true }).count(), 0);
    await page.reload();
    await page.getByText('Read only · Active', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('API key', { exact: true }).count(), 0);
    assert.equal((await page.locator('body').innerText()).includes(secrets[0]), false);

    await prepareCreation();
    await createButton.click();
    await page.getByRole('heading', { name: 'Your API key', exact: true }).waitFor();
    assert.equal(await page.getByLabel('API key', { exact: true }).inputValue(), secrets[1]);
    const newest = page.locator('li').filter({ hasText: connections[0].key_prefix });
    await newest.getByRole('button', { name: 'Revoke', exact: true }).click();
    failRevoke = true;
    await newest.getByRole('button', { name: 'Confirm revoke', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Revoke denied' }).waitFor();
    assert.equal(await newest.getByText('Read only · Active', { exact: true }).count(), 1);
    assert.equal(await page.getByLabel('API key', { exact: true }).inputValue(), secrets[1]);
    failRevoke = false;
    await newest.getByRole('button', { name: 'Confirm revoke', exact: true }).click();
    await newest.getByText('Read only · Revoked', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('API key', { exact: true }).count(), 0);
    assert.equal(await newest.getByRole('button', { name: 'Revoke', exact: true }).count(), 0);

    await prepareCreation();
    await createButton.click();
    await page.getByRole('heading', { name: 'Your API key', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('heading', { name: 'Sign in to manage API connections', exact: true }).waitFor();
    assert.equal(await page.getByLabel('API key', { exact: true }).count(), 0);
    assert.equal((await page.locator('body').innerText()).includes(secrets[2]), false);
    await page.getByRole('button', { name: 'Sign in with Google', exact: true }).click();
    await page.getByRole('heading', { name: 'Connect an integration', exact: true }).waitFor();
    assert.equal(await page.getByLabel('API key', { exact: true }).count(), 0);

    await prepareCreation();
    holdNextCreate = true;
    await createButton.click();
    await page.waitForFunction(() => document.querySelector('form button')?.disabled);
    const holdDeadline = Date.now() + 10000;
    while (!releaseCreate && Date.now() < holdDeadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(releaseCreate, 'The pending create request reached the server.');
    await page.evaluate(() => window.__apiSmokeSetUser('second@sentientagency.io', 'tok-two'));
    await page.getByText('API keys belong to second@sentientagency.io.', { exact: true }).waitFor();
    await page.getByText('No API connections yet.', { exact: true }).waitFor();
    releaseCreate();
    await page.getByLabel('Connection name').fill('Session changed');
    assert.equal(await page.getByLabel('API key', { exact: true }).count(), 0);
    assert.equal((await page.locator('body').innerText()).includes(secrets[3]), false);
    assert.equal(await page.getByText('0 accounts selected', { exact: true }).count(), 1);

    canCreate = false;
    await page.evaluate(() => window.__apiSmokeSetUser('owner@sentientagency.io'));
    await page.getByRole('heading', { name: 'API access', exact: true }).waitFor();
    assert.equal(await createButton.count(), 0);
    assert.equal(await page.getByLabel('Connection name').count(), 0);
    const pending = page.locator('li').filter({ hasText: heldCreate.key_prefix });
    await pending.getByText('Read only · Active', { exact: true }).waitFor();
    await pending.getByRole('button', { name: 'Revoke', exact: true }).click();
    await pending.getByRole('button', { name: 'Confirm revoke', exact: true }).click();
    await pending.getByText('Read only · Revoked', { exact: true }).waitFor();
    await assertNoLeaks();
    await assertFits();
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`API connections ${width}px: selection, payload, one-time key, failure recovery, revoke and session checks passed.`);
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
