import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const directory = path.resolve("work/agent-connections");
await mkdir(directory, { recursive: true });
const authFixture = path.join(directory, 'firebase-auth.js');
await writeFile(authFixture, `
const auth = { currentUser: { email: 'user03@example.com', getIdToken: () => Promise.resolve('tok') } };
const observers = new Set();
const setUser = email => {
  auth.currentUser = email ? { email, getIdToken: () => Promise.resolve('tok') } : null;
  observers.forEach(callback => callback(auth.currentUser));
};
export function getAuth() { return auth; }
export class GoogleAuthProvider { setCustomParameters() {} }
export const browserPopupRedirectResolver = {};
export const browserLocalPersistence = {};
export function setPersistence() { return Promise.resolve(); }
export function onAuthStateChanged(_auth, callback) { observers.add(callback); callback(auth.currentUser); return () => observers.delete(callback); }
export function signInWithPopup() { setUser('user03@example.com'); return Promise.resolve(); }
export function signInWithRedirect() { return signInWithPopup(); }
export function signOut() { setUser(null); return Promise.resolve(); }
`);
await build({
  entryPoints: ["src/agents.jsx"],
  bundle: true,
  outdir: directory,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  define: {
    "import.meta.env.VITE_API_BASE": '"https://api.test"',
    "import.meta.env.BASE_URL": '"/"',
    "import.meta.env.MODE": '"test"',
    "import.meta.env.DEV": "false",
    "import.meta.env.PROD": "true",
  },
  alias: {
    "firebase/app": path.resolve("smoke/stub-firebase-app.js"),
    "firebase/auth": authFixture,
  },
});
const http = createServer(async (req, res) => {
  try {
    if (req.url === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/agents.css"></head><body><div id="root"></div><script type="module" src="/agents.js"></script></body></html>',
      );
    } else {
      res.setHeader(
        "Content-Type",
        req.url.endsWith(".css") ? "text/css" : "application/javascript",
      );
      res.end(await readFile(path.join(directory, req.url.slice(1))));
    }
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => http.listen(0, "127.0.0.1", r));
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || (existsSync(chrome) ? chrome : undefined)});
try {
  for (const [width, language] of [[1280, 'en'], [390, 'en'], [1280, 'es'], [390, 'es']]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, timezoneId: 'America/Costa_Rica' }),
      errors = [];
    page.setDefaultTimeout(10000);
    await page.addInitScript(language => {
      if (!localStorage.getItem('sentient.lang') && !localStorage.getItem('sentient.language')) localStorage.setItem('sentient.language', language);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async value => { window.__copiedText = value; } } });
    }, language);
    const preferenceWrites = [];
    let storedLanguage = language;
    const ES = {
      'Agent connections': 'Conexiones de agentes', 'No agents connected yet.': 'Todavía no hay agentes conectados.',
      'Agent name': 'Nombre del agente', 'Generate connection code': 'Generar código de conexión',
      'Your connection code': 'Tu código de conexión', 'Connection code': 'Código de conexión',
      'I saved the code': 'Ya guardé el código', 'Copy code': 'Copiar código', 'Copied.': 'Copiado.',
      'Revoke': 'Revocar', 'Confirm revoke': 'Confirmar revocación',
      'Full account access · Active': 'Acceso completo a la cuenta · Activa',
      'Full account access · Revoked': 'Acceso completo a la cuenta · Revocada',
      'This action is not allowed for your current account.': 'Tu cuenta no tiene permiso para realizar esta acción.',
      'Sign out': 'Cerrar sesión', 'Sign in to connect an agent': 'Inicia sesión para conectar un agente',
      'Sign in with Google': 'Iniciar sesión con Google', 'Connection revoked.': 'Conexión revocada.',
    };
    const t = text => language === 'es' ? ES[text] ?? text : text;
    page.on("console", (m) => {
      if (m.type() === "error") console.error(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    let saved = null,
      failRevoke = false;
    const key = "sad_agent_" + "x".repeat(43); // Fabricated test value, never a production credential.
    await page.route("https://api.test/**", async (route) => {
      const req = route.request();
      assert.equal(req.headers().authorization, "Bearer tok");
      if (new URL(req.url()).pathname === '/api/dashboard/me/preferences') {
        if (req.method() === 'POST') {
          const payload = req.postDataJSON();
          assert.deepEqual(Object.keys(payload), ['preferences']);
          if (payload.preferences.language) { storedLanguage = payload.preferences.language; preferenceWrites.push(storedLanguage); }
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ preferences: { language: storedLanguage } }) });
        return;
      }
      if (new URL(req.url()).pathname === '/api/dashboard/me/oauth-connections') {
        assert.equal(req.headers()['x-queue-role-preview'], undefined);
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"connections":[]}' });
        return;
      }
      assert.equal(new URL(req.url()).pathname.startsWith('/api/dashboard/me/agent-connections'), true);
      if (req.method() === "POST") {
        const payload = req.postDataJSON();
        assert.equal(payload.name, "My Dots");
        saved = {
          id: "test-id",
          name: payload.name,
          access_mode: payload.access_mode,
          expires_at: "2099-01-01T00:00:00Z",
          revoked_at: null,
          last_used_at: '2026-10-09T14:30:00Z',
        };
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ key, connection: saved }),
        });
      } else if (req.method() === "DELETE") {
        if (failRevoke)
          await route.fulfill({
            status: 403,
            contentType: "application/json",
            body: '{"detail":"Revoke denied"}',
          });
        else {
          saved.revoked_at = new Date().toISOString();
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: '{"revoked":true}',
          });
        }
      } else
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ connections: saved ? [saved] : [] }),
        });
    });
    await page.goto(`http://127.0.0.1:${http.address().port}`);
    console.log("Loaded agent page", language, width);
    await page.getByText(t("No agents connected yet.")).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.lang), language);
    assert.equal(await page.title(), `${t('Agent connections')} · Sentient Dash`);
    const otherLanguage = language === 'es' ? 'en' : 'es';
    await page.getByRole('button', { name: otherLanguage === 'es' ? 'ES' : 'EN', exact: true }).click();
    await page.waitForFunction(lang => document.documentElement.lang === lang, otherLanguage);
    assert.deepEqual(await page.evaluate(() => [localStorage.getItem('sentient.lang'), localStorage.getItem('sentient.language')]), [otherLanguage, otherLanguage]);
    const saveDeadline = Date.now() + 10000;
    while (!preferenceWrites.includes(otherLanguage) && Date.now() < saveDeadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(preferenceWrites.includes(otherLanguage), true);
    await page.reload();
    await page.waitForFunction(lang => document.documentElement.lang === lang, otherLanguage);
    assert.equal(await page.getByRole('button', { name: otherLanguage === 'es' ? 'ES' : 'EN', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: language === 'es' ? 'ES' : 'EN', exact: true }).click();
    await page.waitForFunction(lang => document.documentElement.lang === lang, language);
    await page.getByText(t('No agents connected yet.')).waitFor();
    await page.getByLabel(t("Agent name")).fill("My Dots");
    await page
      .getByRole("button", { name: t("Generate connection code") })
      .click();
    await page
      .getByRole("heading", { name: t("Your connection code"), exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel(t("Connection code"), { exact: true }).inputValue(),
      key,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: path.join(directory, `agents-${language}-${width}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: t('Copy code'), exact: true }).click();
    await page.getByRole('status').filter({ hasText: t('Copied.') }).waitFor();
    assert.equal(await page.evaluate(() => window.__copiedText), key);
    const expectedDate = await page.evaluate(lang => new Intl.DateTimeFormat(lang === 'es' ? 'es-CR' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date('2099-01-01T00:00:00Z')), language);
    assert.equal((await page.locator('li').innerText()).includes(expectedDate), true);
    const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
    assert.equal(storage.includes(key), false);
    await page.getByRole("button", { name: t("I saved the code") }).click();
    assert.equal(
      await page.getByLabel(t("Connection code"), { exact: true }).count(),
      0,
    );
    await page.getByRole("button", { name: t("Revoke"), exact: true }).click();
    failRevoke = true;
    await page.getByRole("button", { name: t("Confirm revoke") }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: t('This action is not allowed for your current account.') })
      .waitFor();
    assert.equal(
      await page
        .getByText(t("Full account access · Active"), { exact: true })
        .count(),
      1,
    );
    failRevoke = false;
    await page.getByRole("button", { name: t("Confirm revoke") }).click();
    await page
      .getByText(t("Full account access · Revoked"), { exact: true })
      .waitFor();
    await page.getByRole('status').filter({ hasText: t('Connection revoked.') }).waitFor();
    await page.getByRole('button', { name: t('Sign out'), exact: true }).click();
    await page.getByRole('heading', { name: t('Sign in to connect an agent'), exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: t('Sign in with Google'), exact: true }).count(), 1);
    assert.equal(await page.getByLabel(t('Connection code'), { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "Agent connection EN/ES desktop/mobile preference persistence, create, copy, one-time display, failed revoke and successful revoke checks passed.",
  );
} finally {
  await browser.close();
  http.close();
}
