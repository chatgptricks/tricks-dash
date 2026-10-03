import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: () => null } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function fixture(tool) {
  const source = fs.readFileSync(`public/${tool}.html`, 'utf8');
  const dom = new JSDOM(source, { runScripts: 'outside-only', url: `http://localhost:4175/${tool}.html`, pretendToBeVisual: true });
  const w = dom.window;
  w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  const canvases = new Set();
  w.Chart = class {
    static defaults = { font: {} };
    constructor(canvas) { assert.ok(!canvases.has(canvas), 'A chart canvas must be released before reuse'); this.canvas=canvas; canvases.add(canvas); }
    destroy() { canvases.delete(this.canvas); }
  };
  w.matchMedia = () => ({ matches: false });
  w.setInterval = () => 0;
  const later = w.setTimeout.bind(w);
  w.setTimeout = (fn, delay) => later(fn, Math.min(delay, 1));
  w.fetch = async () => { throw new Error('Unexpected unmocked request'); };
  w.__firebaseIdToken = 'fixture';
  w.__refreshFirebaseIdToken = async () => 'fixture';
  w.__sentientRolePreviewHeaders = () => ({ 'X-Queue-Role-Preview': 'vc' });
  const main = [...w.document.scripts].find(script => script.textContent.includes("const API = 'https://cortex-api-db2e.onrender.com'"));
  const settings = 'const settingsMenu' + source.split('const settingsMenu')[1].split('</script>')[0];
  const bridge = tool === 'tracker'
    ? 'window.__test={boot,loadSummary,render,renderDetail,writeAcc,get:authedFetch,setSummary:value=>{SUMMARY=value},state:()=>({summary:SUMMARY,cache:DETAIL_CACHE,session:TRACKER_SESSION})};'
    : 'window.__test={boot,get:insightsGet,render,readUrl,writeUrl,buildChips,retryFollowerGrowth,filtered,state:()=>({raw:RAW,accounts:ACCOUNTS,selected:[...SEL],growth:FOLLOWER_GROWTH,error:FOLLOWER_GROWTH_ERROR}),select:values=>{SEL=new Set(values)},format:sectionTop};';
  w.eval(main.textContent + '\n' + settings + '\n' + bridge);
  return { dom, w, source, test: w.__test };
}

const summary = { tracking_since: '2026-09-01', accounts: [
  { handle: 'alpha', group: 'sentient', followers: 100 },
  { handle: 'beta', group: 'competitor', followers: 200 },
] };
const emptyDetail = { followers_history: [], engagement_weekly: [] };
const posts = { posts: [], accounts: [{ handle: 'alpha', group: 'sentient' }, { handle: 'beta', group: 'competitors' }] };
const growth = { accounts: [], peaks: [] };

{
  const { dom, w, test } = fixture('tracker');
  try {
    test.setSummary(structuredClone(summary));
    const pending = new Map();
    w.fetch = url => {
      const request = deferred(); pending.set(String(url).split('/').at(-1), request);
      return request.promise;
    };
    test.writeAcc('alpha'); const first = test.renderDetail('alpha');
    await tick();
    test.writeAcc('beta'); const second = test.renderDetail('beta');
    await tick();
    pending.get('beta').resolve(reply(200, emptyDetail)); await second;
    assert.match(w.document.querySelector('.detail-head').textContent, /@beta/);
    pending.get('alpha').resolve(reply(200, emptyDetail)); await first;
    assert.match(w.document.querySelector('.detail-head').textContent, /@beta/, 'Late account response must not replace the selected account');
    assert.equal(test.state().cache.alpha, undefined, 'Obsolete detail should not enter the active cache');

    test.writeAcc('alpha'); const leaving = test.renderDetail('alpha');
    await tick();
    test.writeAcc(''); test.render();
    const leaderboard = w.document.querySelector('#app').innerHTML;
    pending.get('alpha').resolve(reply(200, emptyDetail)); await leaving;
    assert.equal(w.document.querySelector('#app').innerHTML, leaderboard, 'Back to all accounts must survive a late detail response');

    const stale = deferred(); w.fetch = () => stale.promise;
    const oldSummary = test.loadSummary();
    await tick();
    w.__resetToolSession();
    stale.resolve(reply(200, summary));
    await assert.rejects(oldSummary, /Session changed/);
    assert.equal(test.state().summary, null);
    assert.equal(Object.keys(test.state().cache).length, 0);
    assert.equal(w.document.querySelector('#sidebar').textContent, '');

    let calls = 0, unauthorized = 0;
    w.__onInsightsUnauthorized = () => unauthorized++;
    w.fetch = async (_url, options) => {
      calls++;
      assert.equal(options.headers['X-Queue-Role-Preview'], 'vc');
      return reply(403, { detail: 'Tracker role required.' });
    };
    await assert.rejects(test.get('/fixture'), /Tracker role required/);
    assert.equal(calls, 1); assert.equal(unauthorized, 0);
    w.fetch = async () => reply(200, summary);
    await test.boot();
    assert.equal(w.document.querySelector('#app').getAttribute('aria-busy'), 'false');

    w.fetch = async () => reply(403, { detail: 'Tracker role required.' });
    await test.boot();
    assert.ok(w.document.querySelector('#retryTracker'), 'Initial load failures offer a retry');
    w.fetch = async () => reply(200, summary);
    await w.document.querySelector('#retryTracker').onclick();
    assert.ok(w.document.querySelector('#trackerSearch'), 'Retry recovers the leaderboard');
  } finally { dom.window.close(); }
}

{
  const { dom, w, test } = fixture('insights');
  try {
    let calls = 0, unauthorized = 0;
    const refreshes = [];
    w.__refreshFirebaseIdToken = async force => { refreshes.push(force); return 'fixture'; };
    w.__onInsightsUnauthorized = () => unauthorized++;
    w.fetch = async (_url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer fixture');
      assert.equal(options.headers['X-Queue-Role-Preview'], 'vc');
      calls++; return reply(403, { detail: 'Insights role required.' });
    };
    await assert.rejects(test.get('/fixture'), /Insights role required/);
    assert.equal(calls, 1); assert.equal(unauthorized, 0, '403 is an action refusal, not an expired session');
    calls = 0; refreshes.length = 0;
    w.fetch = async () => { calls++; return reply(calls === 1 ? 401 : 200, {}); };
    await test.get('/fixture');
    assert.deepEqual(refreshes, [false, true], '401 refreshes the Firebase token before retrying');
    assert.equal(unauthorized, 0);
    calls = 0; w.fetch = async () => { calls++; return reply(404, {}); };
    await assert.rejects(test.get('/fixture'), /HTTP 404/);
    assert.equal(calls, 1, 'Permanent failures do not repeat');

    w.fetch = async url => reply(200, String(url).includes('follower-growth') ? growth : posts);
    await test.boot();
    assert.equal(test.state().selected.length, 2);
    const chips = [...w.document.querySelectorAll('#accChips .chip')];
    assert.ok(chips.every(chip => chip.tagName === 'BUTTON' && chip.hasAttribute('aria-pressed')));
    chips.find(chip => chip.textContent === 'Clear').click();
    assert.equal(test.state().selected.length, 0);
    assert.equal(test.readUrl().selection, 'none');
    await test.boot();
    assert.equal(test.state().selected.length, 0, 'Clear selection survives reload/share URL');
    [...w.document.querySelectorAll('#accChips .chip')].find(chip => chip.textContent === 'All').click();
    assert.equal(test.readUrl().selection, '');

    w.fetch = async url => String(url).includes('follower-growth') ? reply(403, { detail: 'No follower access' }) : reply(200, posts);
    await test.boot();
    assert.ok(w.document.querySelector('[data-retry-follower-growth]'));
    assert.ok(w.document.querySelector('#accChips .chip'), 'Partial follower failure retains the usable post workspace');
    assert.equal(unauthorized, 0);
    w.fetch = async () => reply(200, growth);
    await test.retryFollowerGrowth();
    assert.equal(test.state().growth.accounts.length, 0);
    assert.equal(w.document.querySelector('[data-retry-follower-growth]'), null);
    assert.equal(w.document.querySelector('#app').getAttribute('aria-busy'), 'false');

    const populated = { ...posts, posts: [
      { a:'alpha', d:'2026-10-01T12:00:00Z', l:200, c:5, v:1000, t:'Video', pt:'clips', ocr:'Useful fixture alpha', u:'https://instagram.com/p/alpha/' },
      { a:'beta', d:'2026-10-02T12:00:00Z', l:500, c:10, v:2000, t:'Video', pt:'clips', ocr:'Useful fixture beta', u:'https://instagram.com/p/beta/' },
    ] };
    w.fetch = async url => reply(200, String(url).includes('follower-growth') ? growth : populated);
    await test.boot();
    const accountOrder = () => [...w.document.querySelectorAll('#tAcc tbody tr')].map(row => row.firstElementChild.textContent.match(/@\w+/)[0]);
    assert.deepEqual(accountOrder(), ['@beta','@alpha']);
    w.document.querySelector('#tAcc th[data-k="h"]').click();
    assert.deepEqual(accountOrder(), ['@alpha','@beta']);
    w.document.querySelector('#tAcc th[data-k="h"]').click();
    assert.deepEqual(accountOrder(), ['@beta','@alpha']);
    w.document.querySelector('#tAcc th[data-k="views"]').click();
    assert.deepEqual(accountOrder(), ['@beta','@alpha']);

    const old = deferred(); w.fetch = () => old.promise;
    const loading = test.boot();
    await tick();
    w.__resetToolSession();
    old.resolve(reply(200, posts));
    await loading;
    assert.equal(test.state().accounts.length, 0);
    assert.equal(test.state().raw.length, 0);
    assert.equal(w.document.querySelector('#accChips').textContent, '');
    assert.match(w.document.querySelector('#app').textContent, /Loading Insights/);

    w.fetch = async () => reply(403, { detail: 'Insights role required.' });
    await test.boot();
    assert.ok(w.document.querySelector('#retryInsights'));
    w.fetch = async url => reply(200, String(url).includes('follower-growth') ? growth : posts);
    await w.document.querySelector('#retryInsights').onclick();
    assert.ok(w.document.querySelector('#accChips .chip'));
  } finally { dom.window.close(); }
}

// Exercise each actual auth callback with two distinct fixture identities. No
// Firebase SDK or remote API is loaded by this test.
for (const tool of ['tracker', 'insights']) {
  const { dom, w, source, test } = fixture(tool);
  try {
    const handler = source.split('onAuthStateChanged(auth, async (user) => {')[1].split('\n});')[0];
    w.__auth = { currentUser: null };
    let boots = 0;
    w.__startInsightsBoot = () => { boots++; };
    w.fetch = async () => reply(200, { unlimited: false });
    w.eval(`let booted=false,sessionUid=null,authTurn=0; const auth=window.__auth; const gate=document.getElementById('authGate'); const gateText=document.getElementById('authGateText'); const gateBtn=document.getElementById('authGateBtn'); function showSignInGate(){gate.classList.remove('hidden')} function describeSignInError(e){return e.message} function setSettingsAvatar(){} window.__authHandler=async(user)=>{${handler}\n};`);
    const first = { uid: 'first', email: 'first@example.test', getIdToken: async () => 'first-token' };
    const second = { uid: 'second', email: 'second@example.test', getIdToken: async () => 'second-token' };
    w.__auth.currentUser = first; await w.__authHandler(first);
    if(tool === 'tracker') test.setSummary(summary);
    w.__auth.currentUser = second; await w.__authHandler(second);
    assert.equal(boots, 2, `${tool}: a direct account switch reboots under the new identity`);
    assert.equal(w.__firebaseIdToken, 'second-token');
    if(tool === 'tracker') assert.equal(test.state().summary, null);
    w.__auth.currentUser = null; await w.__authHandler(null);
    assert.equal(w.__firebaseIdToken, '');
    assert.equal(w.__signedInEmail, '');
    assert.equal(w.__refreshFirebaseIdToken, undefined);

    const delayedToken = deferred();
    const late = { ...first, getIdToken: () => delayedToken.promise };
    w.__auth.currentUser = late; const lateLogin = w.__authHandler(late);
    w.__auth.currentUser = second; await w.__authHandler(second);
    delayedToken.resolve('late-first-token'); await lateLogin;
    assert.equal(w.__firebaseIdToken, 'second-token', `${tool}: a late token cannot overwrite the new identity`);
    assert.equal(w.__signedInEmail, second.email);
  } finally { dom.window.close(); }
}

for (const tool of ['tracker', 'insights']) {
  const { dom, w } = fixture(tool);
  try {
    w.fetch = async () => reply(200, { is_dev: true });
    w.checkAdminForSettings(); await tick();
    assert.equal(w.document.querySelector('#settingsAdmin').classList.contains('is-visible'), true);
    w.__resetToolSession();
    assert.equal(w.document.querySelector('#settingsAdmin').classList.contains('is-visible'), false, `${tool}: reset hides the prior user's command-center link`);
    w.sessionStorage.setItem('sentient.queueRolePreview', 'pd');
    w.checkAdminForSettings(); await tick();
    assert.equal(w.document.querySelector('#settingsAdmin').classList.contains('is-visible'), false, `${tool}: PD preview does not inherit raw Dev Settings access`);
    w.sessionStorage.removeItem('sentient.queueRolePreview');
    w.__resetToolSession();
    const old = deferred(); w.fetch = () => old.promise;
    w.checkAdminForSettings(); await tick();
    w.__resetToolSession();
    old.resolve(reply(200, { is_dev: true })); await tick();
    assert.equal(w.document.querySelector('#settingsAdmin').classList.contains('is-visible'), false, `${tool}: a late permission response cannot restore old Settings access`);
  } finally { dom.window.close(); }
}

console.log('PASS Tracker and Insights: stale navigation/session reads, direct account switches, token races, permission vs auth errors, retry recovery, empty-selection links, keyboard chips and partial follower recovery');
