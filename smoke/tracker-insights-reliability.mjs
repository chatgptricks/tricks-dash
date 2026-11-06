import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: () => null } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function fixture(tool, { music = false } = {}) {
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
  w.setTimeout = (fn, delay) => later(fn, delay >= 30000 ? delay : Math.min(delay, 1));
  w.fetch = async () => { throw new Error('Unexpected unmocked request'); };
  w.__firebaseIdToken = 'fixture';
  w.__refreshFirebaseIdToken = async () => 'fixture';
  w.__sentientRolePreviewHeaders = () => ({ 'X-Queue-Role-Preview': 'vc' });
  if(tool === 'tracker') w.eval(fs.readFileSync('public/tracker-refresh.js', 'utf8'));
  if(music) for(const file of ['tool-translations.js','insights-music.js','insights-music-view.js']) w.eval(fs.readFileSync(`public/${file}`, 'utf8'));
  const main = [...w.document.scripts].find(script => script.textContent.includes("const API = 'https://cortex-api-db2e.onrender.com'"));
  const settings = 'const settingsMenu' + source.split('const settingsMenu')[1].split('</script>')[0];
  const bridge = tool === 'tracker'
    ? 'window.__test={boot,loadSummary,render,renderDetail,writeAcc,get:authedFetch,setSummary:value=>{SUMMARY=value},state:()=>({summary:SUMMARY,cache:DETAIL_CACHE,session:TRACKER_SESSION})};'
    : 'window.__test={boot,get:insightsGet,render,readUrl,writeUrl,buildChips,retryFollowerGrowth,filtered,state:()=>({raw:RAW,musicRaw:MUSIC_RAW,accounts:ACCOUNTS,selected:[...SEL],growth:FOLLOWER_GROWTH,error:FOLLOWER_GROWTH_ERROR}),select:values=>{SEL=new Set(values)},format:sectionTop};';
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
    const controller = new w.AbortController();
    let pendingSignal;
    w.fetch = async (_url, options) => { pendingSignal = options.signal; return new Promise(() => {}); };
    const pendingRead = test.get('/pending', { signal: controller.signal });
    await tick();
    controller.abort();
    await assert.rejects(pendingRead, { name: 'AbortError' });
    assert.equal(pendingSignal.aborted, true, 'Desktop reads forward cancellation to their transport');
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

    let requestSignal;
    w.fetch = async (_url, options) => { requestSignal = options.signal; return new Promise(() => {}); };
    await assert.rejects(test.get('/stalled-headers', { timeoutMs: 20 }), /timed out/);
    assert.equal(requestSignal.aborted, true, 'The whole read deadline cancels a stalled network request');
    w.fetch = async (_url, options) => { requestSignal = options.signal; return { ...reply(200, {}), json: () => new Promise(() => {}) }; };
    await assert.rejects(test.get('/stalled-body', { timeoutMs: 20 }), /timed out/);
    assert.equal(requestSignal.aborted, true, 'The deadline also covers response-body downloads');
    w.__refreshFirebaseIdToken = () => new Promise(() => {});
    calls = 0; w.fetch = async () => { calls++; return reply(200, {}); };
    await assert.rejects(test.get('/stalled-token', { timeoutMs: 20 }), /timed out/);
    assert.equal(calls, 0, 'A stalled token refresh is bounded without sending an unauthenticated request');
    w.__refreshFirebaseIdToken = async () => 'fixture';

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
    const pendingGrowth = deferred();
    w.fetch = async url => String(url).includes('follower-growth') ? pendingGrowth.promise : reply(200, populated);
    await test.boot();
    const performanceTable = w.document.querySelector('#tAcc');
    assert.ok(performanceTable, 'Post performance renders while the optional follower request remains unresolved');
    assert.equal(w.document.querySelector('#app').getAttribute('aria-busy'), 'false', 'Optional signals do not hold the workspace loader');
    assert.match(w.document.querySelector('#followerGrowth').textContent, /Loading the daily follower signal/);
    pendingGrowth.resolve(reply(200, growth)); await tick();
    assert.equal(w.document.querySelector('#tAcc'), performanceTable, 'Follower completion updates only its own panel, preserving post charts and sort state');
    assert.equal(test.state().growth.accounts.length, 0);

    const timers=[];
    const setTimeout=w.setTimeout;
    w.setTimeout=(callback,delay,...args)=>{ if(delay===30000) timers.push(callback); return setTimeout(callback,delay,...args); };
    w.fetch = async url => String(url).includes('follower-growth') ? new Promise(() => {}) : reply(200, populated);
    await test.boot();
    timers[0](); await tick();
    w.setTimeout=setTimeout;
    assert.ok(w.document.querySelector('[data-retry-follower-growth]'), 'A stalled optional signal times out into its own retry control');
    assert.ok(w.document.querySelector('#tAcc'), 'Optional timeout preserves usable post performance');

    const obsoleteGrowth = deferred();
    w.fetch = async url => String(url).includes('follower-growth') ? obsoleteGrowth.promise : reply(200, populated);
    await test.boot();
    w.InsightsMusicView = { mount: element => { element.innerHTML='<div id="music-fixture">Music report</div>'; return {coverage:{totalPosts:0}}; } };
    w.history.replaceState(null, '', '/insights.html?view=music');
    await test.boot();
    const musicReport = w.document.querySelector('#music-fixture');
    assert.ok(musicReport);
    obsoleteGrowth.resolve(reply(200, { accounts:[{handle:'obsolete'}],peaks:[] })); await tick();
    assert.equal(w.document.querySelector('#music-fixture'), musicReport, 'A late overview signal cannot replace the Music view');
    assert.equal(test.state().growth, null, 'An obsolete view does not install its late follower results');
    w.history.replaceState(null, '', '/insights.html');

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

{
  const { dom, w, test } = fixture('insights', { music: true });
  try {
    const timers = new Map();
    let timerId = 0, now = Date.parse('2026-10-26T18:00:00Z');
    const later = w.setTimeout, cancel = w.clearTimeout.bind(w);
    w.setTimeout = (fn, delay) => {
      if(delay !== 10000) return later(fn, delay);
      const id = --timerId; timers.set(id, fn); return id;
    };
    w.clearTimeout = id => { if(!timers.delete(id)) cancel(id); };
    w.Date.now = () => now;
    const poll = () => {
      assert.equal(timers.size, 1, 'A stale report has at most one pending refresh check');
      const [id, fn] = timers.entries().next().value; timers.delete(id);
      now += 10000; return fn();
    };
    const generated = '2026-10-26T17:00:00+00:00';
    const report = {
      ...posts,
      posts: [{ a:'alpha',sc:'retained',d:'2026-10-01T12:00:00Z',l:200,c:5,v:1000,t:'Video',pt:'clips',u:'https://instagram.com/p/retained/',ms:'Retained song',ma:'Fixture artist',ai:'60001',oa:false }],
      coverage: { generated_at: generated }, cache: { stale:true,refreshing:true,age_seconds:3600 },
    };
    const metadata = refreshing => ({ not_modified:true,coverage:report.coverage,cache:{stale:true,refreshing,age_seconds:3610} });
    w.history.replaceState(null, '', '/insights.html?view=music');
    const requests = [];
    w.fetch = async url => { requests.push(String(url)); return reply(200, report); };
    await test.boot();
    assert.match(w.document.querySelector('#musicFreshness').textContent, /Data updated.*Updating…/);
    assert.match(w.document.querySelector('#musicRanking').textContent, /Retained song/);
    assert.equal(requests[0], 'https://cortex-api-db2e.onrender.com/api/insights/music', 'The first load requests a complete report');
    assert.equal(w.document.querySelector('#app').getAttribute('aria-busy'), 'false');
    w.document.documentElement.lang = 'es'; test.render();
    assert.match(w.document.querySelector('#musicFreshness').textContent, /Datos actualizados.*Actualizando…/);
    w.document.documentElement.lang = 'en'; test.render();
    const search = w.document.querySelector('#musicSearch'); search.value = 'Retained'; search.dispatchEvent(new w.Event('input'));
    const sort = w.document.querySelector('#musicSort'); sort.value = 'mean'; sort.dispatchEvent(new w.Event('change'));
    const table = w.document.querySelector('#musicRanking');
    w.fetch = async url => {
      assert.equal(new URL(url).searchParams.get('known_generated_at'), generated, 'Refresh checks send the displayed report version');
      return reply(200, metadata(false));
    };
    await poll();
    assert.equal(w.document.querySelector('#musicRanking'), table, 'Metadata-only responses do not remount or analyze the complete catalogue');
    assert.match(w.document.querySelector('#musicFreshness').textContent, /Data updated.*Showing saved data/);
    w.fetch = async () => reply(404, {});
    await poll();
    assert.equal(w.document.querySelector('#musicRanking'), table, 'A failed refresh preserves the usable report');
    assert.equal(w.document.querySelector('#musicSearch').value, 'Retained');
    assert.equal(w.document.querySelector('#musicSort').value, 'mean');
    assert.equal(w.document.querySelector('#app [role="alert"]'), null);
    w.fetch = async () => reply(200, { ...metadata(true),coverage:{generated_at:'wrong-version'} });
    await poll();
    assert.equal(w.document.querySelector('#musicRanking'), table, 'Metadata from a different generation cannot replace or relabel the report');
    const fresh = { ...report,posts:[{...report.posts[0],l:900}],coverage:{generated_at:'2026-10-26T18:00:00+00:00'},cache:{stale:false,refreshing:false,age_seconds:0} };
    w.fetch = async () => reply(200, fresh);
    await poll();
    assert.notEqual(w.document.querySelector('#musicRanking'), table, 'A new complete generation replaces the old data');
    assert.match(w.document.querySelector('#musicRanking').textContent, /900/);
    assert.equal(w.document.querySelector('#musicSearch').value, 'Retained');
    assert.equal(w.document.querySelector('#musicSort').value, 'mean');
    assert.doesNotMatch(w.document.querySelector('#musicFreshness').textContent, /Updating|Showing saved/);
    assert.equal(timers.size, 0, 'A fresh report stops polling');

    w.fetch = async () => reply(200, report); await test.boot();
    let calls = 0;
    w.fetch = async () => { calls++; return reply(200, metadata(true)); };
    Object.defineProperty(w.document, 'visibilityState', { configurable:true,value:'hidden' });
    await poll();
    assert.equal(calls, 0, 'Hidden tabs do not download refresh checks');
    Object.defineProperty(w.document, 'visibilityState', { configurable:true,value:'visible' });
    now += 5 * 60 * 1000;
    await poll();
    assert.equal(calls, 0, 'The five-minute background budget stops further requests');
    assert.equal(timers.size, 0);
    assert.match(w.document.querySelector('#musicFreshness').textContent, /Showing saved data/);

    w.fetch = async () => reply(200, report); await test.boot();
    const pending = deferred(); let pendingSignal;
    w.fetch = async (_url, options) => { pendingSignal=options.signal; return pending.promise; };
    const checking = poll(); await tick();
    w.fetch = async url => reply(200, String(url).includes('follower-growth') ? growth : posts);
    w.document.querySelector('#insightsOverview').click(); await tick();
    assert.equal(pendingSignal.aborted, true, 'Leaving Music cancels an in-flight refresh');
    pending.resolve(reply(200, fresh)); await checking;
    assert.equal(w.document.querySelector('#musicCoverage'), null, 'A late Music report cannot replace Overview');
    assert.equal(timers.size, 0);
    w.document.querySelector('#insightsMusic').click();
    const signedOut = deferred();
    w.fetch = async (_url, options) => { pendingSignal=options.signal; return signedOut.promise; };
    const oldSession = poll(); await tick();
    w.__resetToolSession();
    assert.equal(pendingSignal.aborted, true, 'Sign-out cancels refresh transport');
    signedOut.resolve(reply(200, fresh)); await oldSession;
    assert.equal(test.state().musicRaw.length, 0, 'A late poll cannot restore the prior session catalogue');
    assert.equal(w.document.querySelector('#musicCoverage'), null);
    assert.equal(timers.size, 0);

    w.fetch = async () => reply(404, {}); await test.boot();
    assert.ok(w.document.querySelector('#retryInsights'));
    const retry = deferred(); w.fetch = () => retry.promise;
    const retrying = w.document.querySelector('#retryInsights').onclick();
    assert.match(w.document.querySelector('#app [role="status"]').textContent, /Loading Insights/);
    assert.equal(w.document.querySelector('#retryInsights'), null, 'Retry replaces the old error with visible loading status');
    retry.resolve(reply(200, fresh)); await retrying;
    assert.ok(w.document.querySelector('#musicCoverage'));
    w.__resetToolSession();
    w.fetch = async () => reply(404, {}); await test.boot();
    const overview = deferred();
    w.fetch = url => String(url).includes('follower-growth') ? Promise.resolve(reply(200,growth)) : overview.promise;
    w.document.querySelector('#insightsOverview').click();
    assert.match(w.document.querySelector('#app [role="status"]').textContent, /Loading Insights/);
    assert.equal(w.document.querySelector('#retryInsights'), null, 'Changing from a failed Music load to an unloaded Overview clears the old error');
    overview.resolve(reply(200, posts)); await tick();
    assert.equal(w.document.querySelector('#app').getAttribute('aria-busy'), 'false');
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

console.log('PASS Tracker and Insights: stale navigation/session reads, direct account switches, token races, permission vs auth errors, retry recovery, empty-selection links, keyboard chips, partial follower recovery, lightweight Music freshness polling and cancellation');
