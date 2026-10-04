// Exercise the actual caption editor and API plumbing. All API requests and
// third-party resources are intercepted: no paid generation or live data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sentient-caption-generator-'));
const output = path.resolve('work/caption-generator');
fs.mkdirSync(output, { recursive: true });
const harness = '/caption-generator-fixture.js';
const sourceCaption = 'Most teams start with the tool. Start with the task instead.\n\nWrite down the repetitive step, define the result you need, and test one small workflow.\n\nComment WORKFLOW and we will send you the guide.';
const firstCaption = 'A better workflow starts with one clear task.\n\nPick the step you repeat every day. Define the result. Test a small improvement before rebuilding the whole process.\n\nWhich task would you simplify first?';
const secondCaption = 'Small improvements beat a crowded tool stack.\n\nStart with one recurring task, measure the result, and keep what works.\n\nSave this for your next workflow review.';
const thirdCaption = 'Empieza con una tarea concreta.\n\nDefine el resultado que necesitas y prueba un cambio pequeño antes de rehacer todo el proceso.';
const advisory = 'Jev flagged this caption. Check its facts and CTA before publishing.';
const server = await createServer({
  logLevel: 'error', cacheDir: path.join(temporary, 'vite-cache'),
  resolve: { alias: {
    'firebase/auth': path.resolve('smoke/stub-firebase-auth.js'),
    'firebase/app': path.resolve('smoke/stub-firebase-app.js'),
  } },
  plugins: [{
    name: 'caption-generator-fixture',
    resolveId(id) { if (id === harness) return id; },
    load(id) {
      if (id !== harness) return null;
      return `import { createElement, useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import GenerateCaptionModal from '/src/GenerateCaptionModal.jsx';
        import { applyTheme, applyAccent } from '/src/prefs.js';
        import '/src/styles.css';
        import '/src/visual-theme.js';
        const query = new URL(location.href).searchParams;
        applyTheme(query.get('theme') || 'dark'); applyAccent('lime');
        const mode = query.get('source') || 'full';
        const account = mode === 'competitor' ? 'other.studio' : 'alpha.studio';
        const post = { account, shortcode: 'CAPTION', postKey: account + ':CAPTION',
          caption: mode === 'truncated' || mode === 'unavailable' ? 'Most teams start with the tool…' : ${JSON.stringify(sourceCaption)},
          captionTruncated: mode === 'truncated' || mode === 'unavailable',
          permalink: 'https://instagram.com/p/CAPTION/', postDate: '2026-10-04T12:00:00Z' };
        const accounts = [
          { handle: 'alpha.studio', label: 'Alpha Studio', group: 'sentient', is_active: true },
          { handle: 'beta.studio', label: 'Beta Studio', group: 'sentient', is_active: true },
          { handle: 'inactive.studio', label: 'Inactive Studio', group: 'sentient', is_active: false },
          { handle: 'other.studio', label: 'Other Studio', group: 'competitors', is_active: true }
        ];
        const draftStore = new Map();
        function Fixture() {
          const [open, setOpen] = useState(false);
          return createElement('main', { style: { padding: 24 } },
            createElement('button', { type: 'button', className: 'primary-button', id: 'open-caption', onClick: () => setOpen(true) }, 'Generate similar caption'),
            open ? createElement(GenerateCaptionModal, { post, accounts, draftStore, onClose: () => setOpen(false) }) : null);
        }
        createRoot(document.getElementById('root')).render(createElement(Fixture));`;
    },
  }],
  server: { host: 'localhost', port: 4200 },
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const errors = [], posts = [], sourceRequests = [], pending = [];
let nextResponse = { json: { caption: firstCaption, jevWarning: advisory, jevVerification: { accepted: false } } };
let holdGeneration = false, sourceUnavailable = true, browser;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (fs.existsSync(chrome) ? chrome : undefined) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    localStorage.setItem('sentient.lang', 'en');
    localStorage.setItem('sentient.effects', 'off');
    window.__captionRequests = [];
    window.__captionAborts = 0;
    window.__clipboardWrites = [];
    window.__clipboardDenied = false;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      async writeText(text) {
        if (window.__clipboardDenied) throw new DOMException('Clipboard is unavailable', 'NotAllowedError');
        window.__clipboardWrites.push(text);
      },
    } });
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (url, options = {}) => {
      if (String(url).includes('/posts/generate-caption')) {
        window.__captionRequests.push(Object.fromEntries(options.body.entries()));
        options.signal?.addEventListener('abort', () => { window.__captionAborts += 1; }, { once: true });
      }
      return nativeFetch(url, options);
    };
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/caption-generator-fixture.html') {
      const html = `<html lang="en" data-tool="research"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Caption generator fixture</title></head><body><div id="root"></div><script type="module" src="${harness}"></script></body></html>`;
      return route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml(url.pathname, html) });
    }
    if (url.pathname === '/api/dashboard/posts/generate-caption') {
      assert.equal(request.method(), 'POST');
      posts.push(request);
      if (holdGeneration) { pending.push(route); return; }
      return route.fulfill(nextResponse);
    }
    if (/\/api\/dashboard\/posts\/[^/]+\/CAPTION\/detail$/.test(url.pathname)) {
      assert.equal(request.method(), 'GET');
      sourceRequests.push(url.pathname);
      if (sourceUnavailable && new URL(request.frame().url()).searchParams.get('source') === 'unavailable') {
        return route.fulfill({ status: 404, json: { detail: 'Source caption unavailable' } });
      }
      return route.fulfill({ json: { caption: sourceCaption } });
    }
    if (url.pathname.startsWith('/api/')) {
      errors.push(`Unexpected API request: ${request.method()} ${url.pathname}`);
      return route.fulfill({ status: 404, json: { detail: 'Unmocked API' } });
    }
    if (url.origin === base) return route.continue();
    return route.fulfill({ status: 404, body: '' });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const modal = page.locator('.caption-generator-modal');
  const editor = page.locator('.caption-generator-result textarea');
  const submit = modal.locator('button[type="submit"]');
  const accountSelect = modal.locator('select').nth(0);
  const languageSelect = modal.locator('select').nth(1);
  const requests = () => page.evaluate(() => window.__captionRequests);
  const open = async (source = 'full', theme = 'dark') => {
    await page.goto(`${base}/caption-generator-fixture.html?source=${source}&theme=${theme}`);
    await page.locator('#open-caption').click();
    await modal.waitFor();
  };
  const expectEditor = async value => {
    await page.waitForFunction(expected => document.querySelector('.caption-generator-result textarea')?.value === expected, value);
    assert.equal(await editor.inputValue(), value);
  };
  const generate = async response => {
    if (response) nextResponse = response;
    const count = posts.length;
    await submit.click();
    await page.waitForFunction(() => !document.querySelector('.caption-generator-modal button[type="submit"]')?.disabled);
    assert.equal(posts.length, count + 1, 'A click starts exactly one generation');
  };
  const history = number => modal.locator('.caption-generator-history').getByRole('button', { name: new RegExp(`^Draft ${number}(?:\\b|$)`) });

  await open();
  assert.equal(await accountSelect.inputValue(), 'alpha.studio');
  assert.equal(await languageSelect.inputValue(), 'same');
  assert.deepEqual(await accountSelect.locator('option').evaluateAll(options => options.map(option => option.value).filter(Boolean)), ['alpha.studio', 'beta.studio']);
  assert.equal(posts.length, 0, 'Opening the editor never triggers paid generation');
  assert.equal(sourceRequests.length, 0, 'Complete source captions do not need another GET');
  await generate();
  await expectEditor(firstCaption);
  assert.deepEqual((await requests())[0], { source_account: 'alpha.studio', shortcode: 'CAPTION', target_account: 'alpha.studio', output_language: 'same', remove_manychat_automation: 'false' });
  assert.match(await modal.locator('.caption-generator-review').innerText(), /Check its facts and CTA/);
  const editedFirst = firstCaption.replace('A better workflow', 'Your next useful workflow');
  await editor.fill(editedFirst);
  assert.match(await modal.innerText(), /Edited since review/i);
  await generate({ json: { caption: secondCaption, jevVerification: { accepted: true } } });
  await expectEditor(secondCaption);
  assert.equal((await requests())[1].previous_caption, editedFirst, 'Regeneration receives current manual edits');
  await history(1).click();
  await expectEditor(editedFirst);
  assert.equal(await history(1).getAttribute('aria-pressed'), 'true');
  assert.match(await modal.innerText(), /Edited since review/i);
  await history(2).click();
  await expectEditor(secondCaption);
  const editedSecond = `${secondCaption}\n\nOne task. One measurable result.`;
  await editor.fill(editedSecond);
  await history(1).click();
  await history(2).click();
  await expectEditor(editedSecond);
  await modal.getByRole('combobox', { name: 'Compare with', exact: true }).selectOption('1');
  assert.equal(await modal.locator('.caption-generator-reference-text').innerText(), editedFirst, 'Comparison uses the saved edits of the selected draft');
  await modal.getByRole('combobox', { name: 'Compare with', exact: true }).selectOption('source');
  await modal.getByRole('button', { name: 'Restore generated text', exact: true }).click();
  await expectEditor(secondCaption);
  await editor.fill(editedSecond);
  console.log('PASS Exact source/destination payload, safe defaults, manual edits as regeneration input, independently editable draft history');

  await languageSelect.selectOption('es');
  await expectEditor(editedSecond);
  await generate({ json: { caption: thirdCaption, jevWarning: advisory } });
  await expectEditor(thirdCaption);
  assert.equal((await requests())[2].output_language, 'es');
  assert.equal(Object.hasOwn((await requests())[2], 'previous_caption'), false, 'Different options do not send an unrelated previous caption');
  await accountSelect.selectOption('beta.studio');
  await expectEditor(thirdCaption);
  await modal.getByRole('checkbox').check();
  await expectEditor(thirdCaption);
  await generate({ json: { caption: thirdCaption + '\n\nGuárdalo para tu próximo proyecto.', jevWarning: advisory } });
  assert.equal((await requests())[3].target_account, 'beta.studio');
  assert.equal((await requests())[3].remove_manychat_automation, 'true');
  assert.equal(Object.hasOwn((await requests())[3], 'previous_caption'), false);
  const currentCaption = await editor.inputValue();
  const currentReview = await modal.locator('.caption-generator-review').innerText();
  await generate({ json: { caption: '   ' } });
  await expectEditor(currentCaption);
  await modal.getByRole('alert').waitFor();
  assert.equal(await modal.locator('.caption-generator-review').innerText(), currentReview, 'Empty success responses preserve the previous advisory');
  await generate({ json: { caption: currentCaption } });
  await expectEditor(currentCaption);
  assert.match(await modal.getByRole('alert').innerText(), /same wording/i);
  await generate({ status: 502, json: { detail: { message: 'Fixture generation is temporarily unavailable.', verification: { accepted: false } } } });
  await expectEditor(currentCaption);
  assert.match(await modal.getByRole('alert').innerText(), /temporarily unavailable/);
  assert.equal(await modal.locator('.caption-generator-review').innerText(), currentReview, 'Failures preserve the previous advisory');
  console.log('PASS Option changes preserve drafts and isolate regeneration context; empty and failed responses preserve editable work and review');

  await modal.getByRole('button', { name: 'Copy caption', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.__clipboardWrites), [currentCaption]);
  assert.ok(await modal.getByRole('button', { name: 'Copied', exact: true }).isVisible());
  await editor.fill('   ');
  assert.ok(await modal.getByRole('button', { name: /Copy caption|Copied/, exact: true }).isDisabled(), 'Blank edits cannot be copied');
  assert.equal((await page.evaluate(() => window.__clipboardWrites)).length, 1);
  await editor.fill(currentCaption);
  await page.evaluate(() => { window.__clipboardDenied = true; });
  await modal.getByRole('button', { name: /Copy caption|Copied/, exact: true }).click();
  assert.match(await modal.getByRole('alert').innerText(), /could not copy/i);
  await expectEditor(currentCaption);
  await page.evaluate(() => { window.__clipboardDenied = false; });

  const focusableSelector = 'button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]';
  const focusables = modal.locator(focusableSelector).filter({ visible: true });
  await focusables.last().focus();
  await page.keyboard.press('Tab');
  assert.ok(await focusables.first().evaluate(element => element === document.activeElement), 'Tab wraps to the first modal control');
  await page.keyboard.press('Shift+Tab');
  assert.ok(await focusables.last().evaluate(element => element === document.activeElement), 'Shift+Tab wraps to the last modal control');
  await page.keyboard.press('Escape');
  await modal.waitFor({ state: 'detached' });
  assert.ok(await page.locator('#open-caption').evaluate(element => element === document.activeElement), 'Closing returns focus to the opener');
  await page.locator('#open-caption').click();
  await expectEditor(currentCaption);
  assert.equal(await accountSelect.inputValue(), 'beta.studio');
  assert.equal(await languageSelect.inputValue(), 'es');
  assert.equal(await modal.getByRole('checkbox').isChecked(), true);
  assert.equal(await history(1).count(), 1);
  console.log('PASS Clipboard guard/failure recovery, keyboard focus trap, Escape, focus return, and session draft restoration');

  holdGeneration = true;
  const beforePending = posts.length;
  await submit.click();
  await page.waitForFunction(count => window.__captionRequests.length === count, beforePending + 1);
  assert.ok(await editor.isDisabled() || await editor.getAttribute('readonly') !== null, 'The active draft cannot change while generation uses it');
  await modal.evaluate(form => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await pause(100);
  assert.equal(posts.length, beforePending + 1, 'Repeated submit events cannot create duplicate paid requests');
  await modal.getByRole('button', { name: 'Close caption generator', exact: true }).click();
  await modal.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => window.__captionAborts), 1, 'Closing aborts the pending fetch');
  holdGeneration = false;
  for (const route of pending.splice(0)) await route.fulfill({ json: { caption: 'A cancelled response must never replace the draft.' } }).catch(() => {});
  await page.locator('#open-caption').click();
  await expectEditor(currentCaption);
  assert.equal(await submit.isDisabled(), false, 'Reopening is not stuck in a generating state');
  assert.equal(await history(5).count(), 0, 'Neither errors nor cancellation add phantom drafts');
  console.log('PASS Duplicate generation guard, busy editing lock, cancellable close, and preserved drafts after reopening');

  // Expire the existing deadline precisely while response.json() is resolving,
  // without waiting three minutes or substituting a different API client.
  await page.evaluate(() => {
    const nativeFetch = window.fetch, nativeTimer = window.setTimeout;
    let expire;
    window.setTimeout = (callback, delay, ...args) => {
      if (delay === 180000) expire = callback;
      return nativeTimer(callback, delay, ...args);
    };
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      if (String(args[0]).includes('/posts/generate-caption')) {
        const read = response.json.bind(response);
        response.json = async () => { const body = await read(); expire(); return body; };
      }
      return response;
    };
    window.__restoreCaptionTimeoutFixture = () => { window.fetch = nativeFetch; window.setTimeout = nativeTimer; };
  });
  await generate({ json: { caption: 'A response received after the deadline must not replace saved work.' } });
  await expectEditor(currentCaption);
  assert.match(await modal.getByRole('alert').innerText(), /Generation took too long/);
  assert.equal(await history(5).count(), 0);
  await page.evaluate(() => window.__restoreCaptionTimeoutFixture());
  console.log('PASS A deadline during response body reading surfaces a recoverable timeout and preserves drafts');

  await open('truncated');
  await page.waitForFunction(text => document.querySelector('.caption-generator-reference-text')?.textContent.includes(text), 'Comment WORKFLOW');
  assert.equal(sourceRequests.at(-1), '/api/dashboard/posts/alpha.studio/CAPTION/detail');
  const beforeFallback = posts.length;
  await open('unavailable');
  await page.waitForFunction(() => /could not be loaded/i.test(document.querySelector('.caption-generator-source-note')?.textContent || ''));
  assert.match(await modal.locator('.caption-generator-reference-text').innerText(), /Most teams start with the tool/);
  assert.equal(posts.length, beforeFallback, 'Source loading or its failure never auto-generates');
  const beforeSourceRetry = sourceRequests.length;
  sourceUnavailable = false;
  await modal.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.waitForFunction(text => document.querySelector('.caption-generator-reference-text')?.textContent.includes(text), 'Comment WORKFLOW');
  assert.equal(sourceRequests.length, beforeSourceRetry + 1, 'Retry fetches the full source again');
  assert.equal(await modal.locator('.caption-generator-source-note').count(), 0, 'Successful source retry clears the preview warning');
  assert.equal(posts.length, beforeFallback, 'Retrying source text never auto-generates');
  await open('competitor');
  assert.equal(await accountSelect.inputValue(), '', 'A competitor source requires a valid owned destination');
  assert.ok(await submit.isDisabled());
  console.log('PASS Full source hydration, honest preview fallback, and explicit destination for competitor sources');

  for (const theme of ['dark', 'light']) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width < 700 ? 844 : 1040 });
      await open('full', theme);
      await generate({ json: { caption: firstCaption, jevWarning: advisory, jevVerification: { accepted: false, factFidelity: .65, targetAlignment: .7, unsupportedClaims: .3 } } });
      await expectEditor(firstCaption);
      const feedback = modal.locator('.caption-generator-review-details');
      assert.equal(await feedback.evaluate(element => element.open), true, 'Flagged feedback is expanded');
      assert.deepEqual(await feedback.locator('dd').allTextContents(), ['65%', '70%', '30%']);
      assert.equal(await feedback.locator('li').count(), 3, 'Actionable concerns explain each flagged dimension');
      const feedbackFits = await feedback.locator('dt, dd, li').evaluateAll(elements => elements.every(element => {
        const box = element.getBoundingClientRect();
        const parent = element.closest('.caption-generator-modal').getBoundingClientRect();
        return box.width > 0 && box.left >= parent.left && box.right <= parent.right;
      }));
      assert.ok(feedbackFits, `${theme} ${width}: expanded feedback and scores stay within the dialog`);
      const geometry = await page.evaluate(() => {
        const modal = document.querySelector('.caption-generator-modal');
        const box = modal.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, viewport: innerWidth, scroll: document.documentElement.scrollWidth, height: innerHeight, modalScroll: modal.scrollWidth, modalWidth: modal.clientWidth };
      });
      assert.ok(geometry.left >= -1 && geometry.right <= width + 1, `${theme} ${width}: modal stays within viewport`);
      assert.ok(geometry.scroll <= width + 1 && geometry.modalScroll <= geometry.modalWidth + 1, `${theme} ${width}: no horizontal clipping`);
      assert.ok(geometry.top >= -1 && geometry.bottom <= geometry.height + 1, `${theme} ${width}: dialog height stays accessible`);
      await modal.evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: path.join(output, `${theme}-${width}.png`), fullPage: true });
      if (width < 700) {
        await editor.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, `${theme}-${width}-editor.png`), fullPage: true });
      }
      await feedback.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `${theme}-${width}-review.png`), fullPage: true });
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS Desktop/mobile and light/dark caption editor geometry; screenshots in work/caption-generator');
} finally {
  await browser?.close();
  await server.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
