import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const directory = path.resolve('work/oauth-connections');
await mkdir(directory, { recursive: true });
const authFixture = path.join(directory, 'firebase-auth.js');
await writeFile(authFixture, `
const makeUser = email => email ? { email, getIdToken: () => Promise.resolve('fixture-firebase-token') } : null;
const auth = { currentUser: makeUser(window.__oauthSignedOut && !localStorage.getItem('fixture.signedIn') ? null : 'staff-10@example.test') };
const observers = new Set();
window.__oauthSetUser = email => { auth.currentUser = makeUser(email); observers.forEach(callback => callback(auth.currentUser)); };
export function getAuth() { return auth; }
export class GoogleAuthProvider { setCustomParameters() {} }
export const browserPopupRedirectResolver = {};
export const browserLocalPersistence = {};
export function setPersistence() { return Promise.resolve(); }
export function onAuthStateChanged(_auth, callback) { observers.add(callback); callback(auth.currentUser); return () => observers.delete(callback); }
export function signInWithPopup() { localStorage.setItem('fixture.signedIn', 'yes'); window.__oauthSetUser('staff-10@example.test'); return Promise.resolve(); }
export function signInWithRedirect() { return signInWithPopup(); }
export function getRedirectResult() { window.__oauthRedirectChecked = true; return Promise.resolve(null); }
export function signOut() { localStorage.removeItem('fixture.signedIn'); window.__oauthSetUser(null); return Promise.resolve(); }
`);
await build({
  entryPoints: ['src/oauth.jsx', 'src/agents.jsx'], bundle: true, outdir: directory,
  format: 'esm', platform: 'browser', jsx: 'automatic',
  define: {
    'import.meta.env.VITE_API_BASE': '"https://api.test"', 'import.meta.env.BASE_URL': '"/"',
    'import.meta.env.MODE': '"test"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true',
  },
  alias: { 'firebase/app': path.resolve('smoke/stub-firebase-app.js'), 'firebase/auth': authFixture },
});
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/oauth.html' || pathname === '/agents.html') {
      const entry = pathname === '/oauth.html' ? 'oauth' : 'agents';
      res.setHeader('Content-Type', 'text/html');
      res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/${entry}.css"></head><body><div id="root"></div><script type="module" src="/${entry}.js"></script></body></html>`);
    } else {
      res.setHeader('Content-Type', pathname.endsWith('.css') ? 'text/css' : 'application/javascript');
      res.end(await readFile(path.join(directory, pathname.slice(1))));
    }
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (existsSync(chrome) ? chrome : undefined) });
const transaction = 'fixture_' + 'x'.repeat(43);
const ES = {
  'Authorize a connection': 'Autorizar una conexión', 'Authorize connection': 'Autorizar conexión',
  'Read and perform actions': 'Leer y realizar acciones', 'Cancel': 'Cancelar',
  'OAuth connections': 'Conexiones OAuth', 'Revoke': 'Revocar', 'Confirm revoke': 'Confirmar revocación',
  'OAuth connection revoked.': 'Conexión OAuth revocada.', 'Sign in with Google': 'Iniciar sesión con Google',
  'Sign in to authorize this connection': 'Inicia sesión para autorizar esta conexión', 'Read only': 'Solo lectura',
};
async function fixture({ language = 'en', width = 390, signedOut = false, scopes = ['sentient:read', 'sentient:write'], callback, authorizationStatus = 200, grants = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, timezoneId: 'America/Costa_Rica' });
  const errors = [], decisions = [], management = [];
  let loads = 0, grantRevoked = false, failGrantRevoke = false;
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ language, signedOut }) => {
    localStorage.setItem('sentient.language', language);
    sessionStorage.setItem('sentient.queueRolePreview', 'admin');
    window.__oauthSignedOut = signedOut;
  }, { language, signedOut });
  await page.route('https://chatgpt.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>OAuth callback fixture</p>' }));
  await page.route('https://api.test/**', async route => {
    const request = route.request(), url = new URL(request.url());
    assert.equal(request.headers().authorization, 'Bearer fixture-firebase-token');
    if (url.pathname === '/api/dashboard/me/preferences') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ preferences: { language } }) });
      return;
    }
    if (url.pathname.startsWith('/api/dashboard/me/oauth')) {
      assert.equal(request.headers()['x-queue-role-preview'], undefined);
      assert.equal(request.headers().cookie, undefined);
    }
    if (url.pathname === '/api/dashboard/me/oauth/authorization') {
      if (request.method() === 'GET') {
        loads += 1; assert.equal(url.searchParams.get('transaction'), transaction);
        await route.fulfill({ status: authorizationStatus, contentType: 'application/json', body: JSON.stringify(authorizationStatus === 200 ? {
          client_name: 'ChatGPT', scopes, resource: 'https://api.test/mcp', expires_at: '2099-01-01T00:00:00Z', email: 'staff-10@example.test',
        } : { detail: 'Authorization expired' }) });
      } else {
        const payload = request.postDataJSON(); decisions.push(payload);
        assert.deepEqual(Object.keys(payload).sort(), ['approve', 'transaction']);
        assert.equal(payload.transaction, transaction);
        const redirect_url = callback || `https://chatgpt.com/connector_platform_oauth_redirect?${payload.approve ? 'code=fixture-code' : 'error=access_denied'}&state=fixture-state&iss=https%3A%2F%2Fapi.test`;
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ redirect_url }) });
      }
      return;
    }
    if (url.pathname.startsWith('/api/dashboard/me/oauth-connections')) {
      management.push({ method: request.method(), path: url.pathname });
      if (request.method() === 'DELETE') {
        assert.equal(url.pathname, '/api/dashboard/me/oauth-connections/oauth-grant');
        if (failGrantRevoke) await route.fulfill({ status: 403, contentType: 'application/json', body: '{"detail":"Revoke denied"}' });
        else { grantRevoked = true; await route.fulfill({ contentType: 'application/json', body: '{"revoked":true,"id":"oauth-grant"}' }); }
      } else await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ connections: grants ? [{
        id: 'oauth-grant', client_name: 'ChatGPT', scopes, access_mode: 'full',
        created_at: '2026-10-09T00:00:00Z', expires_at: '2099-01-01T00:00:00Z',
        revoked_at: grantRevoked ? '2026-10-09T00:00:00Z' : null, last_used_at: null,
      }] : [] }) });
      return;
    }
    assert.equal(url.pathname, '/api/dashboard/me/agent-connections');
    assert.equal(request.method(), 'GET');
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ connections: [{
      id: 'legacy-code', name: 'My existing agent', access_mode: 'read', expires_at: '2099-01-01T00:00:00Z', revoked_at: null, last_used_at: null,
    }] }) });
  });
  return { page, errors, decisions, management, t: text => language === 'es' ? ES[text] ?? text : text,
    loads: () => loads, failRevoke: value => { failGrantRevoke = value; } };
}
try {
  for (const [language, width] of [['en', 1280], ['en', 390], ['es', 1280], ['es', 390]]) {
    const f = await fixture({ language, width });
    await f.page.goto(`${origin}/oauth.html?transaction=${transaction}`);
    await f.page.getByRole('button', { name: f.t('Authorize connection'), exact: true }).waitFor();
    assert.equal(await f.page.title(), `${f.t('Authorize a connection')} · Sentient Dash`);
    assert.equal(await f.page.getByText(f.t('Read and perform actions'), { exact: true }).count(), 1);
    assert.equal(f.decisions.length, 0);
    assert.equal(await f.page.evaluate(() => window.__oauthRedirectChecked), true);
    assert.equal(await f.page.evaluate(() => sessionStorage.getItem('sentient.oauthTransaction')), transaction);
    assert.equal(await f.page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }).includes('fixture-firebase-token')), false);
    assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await f.page.screenshot({ path: path.join(directory, `consent-${language}-${width}.png`), fullPage: true });
    await f.page.getByRole('button', { name: f.t('Authorize connection'), exact: true }).click();
    await f.page.waitForURL('https://chatgpt.com/connector_platform_oauth_redirect?**');
    assert.deepEqual(f.decisions, [{ transaction, approve: true }]);
    assert.deepEqual(f.errors, []);
    await f.page.close();
  }
  const denial = await fixture({ scopes: ['sentient:read'], callback: 'https://chatgpt.com/connector/oauth/fixture-client?error=access_denied&state=fixture-state' });
  await denial.page.goto(`${origin}/oauth.html?transaction=${transaction}`);
  await denial.page.getByText('Read only', { exact: true }).waitFor();
  assert.equal(await denial.page.getByText('Perform requested actions using your current SentientDash permissions.').count(), 0);
  await denial.page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await denial.page.waitForURL('https://chatgpt.com/connector/oauth/fixture-client?**');
  assert.deepEqual(denial.decisions, [{ transaction, approve: false }]);
  await denial.page.close();

  const signedOut = await fixture({ signedOut: true, language: 'es' });
  await signedOut.page.goto(`${origin}/oauth.html?transaction=${transaction}`);
  await signedOut.page.getByRole('heading', { name: signedOut.t('Sign in to authorize this connection') }).waitFor();
  assert.equal(signedOut.loads(), 0);
  await signedOut.page.getByRole('button', { name: signedOut.t('Sign in with Google') }).click();
  await signedOut.page.getByRole('button', { name: signedOut.t('Authorize connection'), exact: true }).waitFor();
  await signedOut.page.goto(`${origin}/oauth.html`);
  await signedOut.page.getByRole('button', { name: signedOut.t('Authorize connection'), exact: true }).waitFor();
  assert.equal(signedOut.loads(), 2);
  await signedOut.page.close();

  const changedAccount = await fixture();
  let releaseDecision;
  const release = new Promise(resolve => { releaseDecision = resolve; });
  await changedAccount.page.route('https://api.test/api/dashboard/me/oauth/authorization', async route => {
    if (route.request().method() !== 'POST') { await route.fallback(); return; }
    await release;
    await route.fulfill({ contentType: 'application/json', body: '{"redirect_url":"https://chatgpt.com/connector_platform_oauth_redirect?code=stale"}' });
  });
  await changedAccount.page.goto(`${origin}/oauth.html?transaction=${transaction}`);
  const startedDecision = changedAccount.page.waitForRequest(request => request.url().endsWith('/oauth/authorization') && request.method() === 'POST');
  await changedAccount.page.getByRole('button', { name: 'Authorize connection', exact: true }).click();
  await startedDecision;
  await changedAccount.page.evaluate(() => window.__oauthSetUser(null));
  await changedAccount.page.getByRole('heading', { name: 'Sign in to authorize this connection' }).waitFor();
  const endedDecision = changedAccount.page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/oauth/authorization'));
  releaseDecision(); await endedDecision;
  assert.equal(new URL(changedAccount.page.url()).origin, origin);
  assert.deepEqual(changedAccount.errors, []);
  await changedAccount.page.close();

  for (const suffix of ['', '?transaction=bad']) {
    const missing = await fixture();
    await missing.page.goto(`${origin}/oauth.html${suffix}`);
    await missing.page.getByRole('heading', { name: 'Start from ChatGPT' }).waitFor();
    assert.equal(missing.loads(), 0); assert.equal(missing.decisions.length, 0);
    await missing.page.close();
  }
  const expired = await fixture({ authorizationStatus: 400 });
  await expired.page.goto(`${origin}/oauth.html?transaction=${transaction}`);
  await expired.page.getByRole('alert').filter({ hasText: 'expired or is no longer valid' }).waitFor();
  assert.equal(await expired.page.getByRole('button', { name: 'Authorize connection', exact: true }).count(), 0);
  await expired.page.close();
  const invalidScope = await fixture({ scopes: ['sentient:read', 'unknown:admin'] });
  await invalidScope.page.goto(`${origin}/oauth.html?transaction=${transaction}`);
  await invalidScope.page.getByRole('alert').filter({ hasText: 'could not be verified' }).waitFor();
  assert.equal(await invalidScope.page.getByRole('button', { name: 'Authorize connection', exact: true }).count(), 0);
  await invalidScope.page.close();

  for (const callback of ['https://evil.example/connector_platform_oauth_redirect', 'https://chatgpt.com.evil.example/connector_platform_oauth_redirect', 'https://chatgpt.com/connector/oauth/client/extra', 'http://chatgpt.com/connector_platform_oauth_redirect', 'https://user@chatgpt.com/connector_platform_oauth_redirect', 'javascript:alert(1)', 'https://chatgpt.com/connector_platform_oauth_redirect#token']) {
    const invalid = await fixture({ callback });
    await invalid.page.goto(`${origin}/oauth.html?transaction=${transaction}`);
    await invalid.page.getByRole('button', { name: 'Authorize connection', exact: true }).click();
    await invalid.page.getByRole('alert').filter({ hasText: 'return address could not be verified' }).waitFor();
    assert.equal(new URL(invalid.page.url()).origin, origin);
    assert.equal(invalid.decisions.length, 1);
    assert.deepEqual(invalid.errors, []);
    await invalid.page.close();
  }

  for (const language of ['en', 'es']) {
    const f = await fixture({ grants: true, language });
    await f.page.goto(`${origin}/agents.html`);
    const grants = f.page.getByRole('region', { name: f.t('OAuth connections') });
    await grants.getByRole('heading', { name: 'ChatGPT' }).waitFor();
    await f.page.getByRole('heading', { name: 'My existing agent' }).waitFor();
    f.failRevoke(true);
    await grants.getByRole('button', { name: f.t('Revoke'), exact: true }).click();
    await grants.getByRole('button', { name: f.t('Confirm revoke') }).click();
    await grants.getByRole('alert').waitFor();
    assert.equal(await grants.getByRole('button', { name: f.t('Confirm revoke') }).count(), 1);
    f.failRevoke(false);
    await grants.getByRole('button', { name: f.t('Confirm revoke') }).click();
    await f.page.getByRole('status').filter({ hasText: f.t('OAuth connection revoked.') }).waitFor();
    assert.equal(await grants.getByRole('button', { name: f.t('Revoke'), exact: true }).count(), 0);
    assert.equal(await f.page.locator('li').filter({ hasText: 'My existing agent' }).getByRole('button', { name: f.t('Revoke'), exact: true }).count(), 1);
    assert.deepEqual(f.management, [
      { method: 'GET', path: '/api/dashboard/me/oauth-connections' },
      { method: 'DELETE', path: '/api/dashboard/me/oauth-connections/oauth-grant' },
      { method: 'DELETE', path: '/api/dashboard/me/oauth-connections/oauth-grant' },
    ], 'OAuth revocation uses its own routes while the existing agent code remains active');
    assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await f.page.screenshot({ path: path.join(directory, `grants-${language}-390.png`), fullPage: true });
    assert.deepEqual(f.errors, []);
    await f.page.close();
  }
  // The legacy plugin directory is a local package, not a checkout artifact.
  // Existing agent compatibility is covered by the routed UI fixture above.
  const oauth = JSON.parse(await readFile('plugins/sentient-dash-chatgpt/mcp.json', 'utf8'));
  const oauthServer = oauth.mcpServers['sentient-dash'];
  assert.equal(oauthServer.type, 'streamable-http');
  assert.equal(oauthServer.url, 'https://cortex-api-db2e.onrender.com/mcp');
  assert.deepEqual(oauthServer.extensions['com.openai'].auth, {
    type: 'oauth', client: { mode: 'dcr' }, resource: 'https://cortex-api-db2e.onrender.com/mcp',
    baseScopes: ['sentient:read'], defaultScopes: ['sentient:read', 'sentient:write'],
  });
  const manifest = JSON.parse(await readFile('plugins/sentient-dash-chatgpt/plugin.json', 'utf8'));
  assert.equal(manifest.name, 'sentient-dash-chatgpt');
  assert.ok(manifest.extensions['com.openai'].interface.shortDescription.length <= 30);
  console.log('OAuth consent, callbacks, scopes, account sign-in, isolated revocation, ES/EN, legacy agent coexistence and tracked OAuth package passed.');
} finally { await browser.close(); server.close(); }
