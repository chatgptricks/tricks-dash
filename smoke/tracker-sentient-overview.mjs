import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: () => null } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const until = async predicate => { for (let i=0;i<1000;i++) { if(predicate())return; await tick(); } assert.fail('Tracker fixture did not settle'); };
const history = values => values.map(([date, followers]) => ({ date, followers }));
const detail = followers_history => ({ followers_history, engagement_weekly: [] });
const account = (handle, group = 'sentient') => ({ handle, group, followers: 100, full_name: handle });
const assertNoMonthlyNotices = w => {
  const panel = w.document.querySelector('#sentientMonthly');
  assert.equal(panel.querySelectorAll('.monthly-note, [role="alert"], [role="status"]').length, 0, 'The monthly overview has no missing-data, coverage or methodology notices');
  assert.doesNotMatch(panel.textContent, /Partial history|missing|Recorded through|monthly data|not available|Could not load|No Sentient accounts|Loading Sentient/i);
};

function fixture(accounts) {
  const source = fs.readFileSync('public/tracker.html', 'utf8');
  const dom = new JSDOM(source, { runScripts: 'outside-only', url: 'http://localhost:4199/tracker.html', pretendToBeVisual: true });
  const w = dom.window;
  const NativeDate = w.Date;
  w.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : ['2026-10-14T18:00:00Z'])); } static now() { return new NativeDate('2026-10-14T18:00:00Z').getTime(); } };
  w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  const chartOwners = new Set();
  w.Chart = class {
    static defaults = { font: {} };
    constructor(canvas, config) { assert.ok(!chartOwners.has(canvas), 'A chart canvas must be released before reuse'); this.canvas=canvas; this.config=config; this.data=config.data; this.options=config.options; chartOwners.add(canvas); }
    destroy() { chartOwners.delete(this.canvas); }
  };
  w.__firebaseIdToken = 'fixture-token';
  w.__refreshFirebaseIdToken = async () => 'fixture-token';
  w.__sentientRolePreviewHeaders = () => ({ 'X-Queue-Role-Preview': 'vc' });
  w.fetch = async () => { throw new Error('Unexpected request'); };
  w.eval(fs.readFileSync('public/tool-translations.js', 'utf8'));
  w.eval(fs.readFileSync('public/tracker-monthly.js', 'utf8'));
  const main = [...w.document.scripts].find(script => script.textContent.includes("const API = 'https://cortex-api-db2e.onrender.com'"));
  w.eval(main.textContent + `
    window.__test = {
      load:loadSentientMonthly, render, renderDetail, writeAcc,
      primeCache:(handle, value)=>{DETAIL_CACHE[handle]=value},
      setSummary:accounts=>{SUMMARY={tracking_since:'2026-09-01',accounts}},
      state:()=>({histories:MONTHLY_HISTORIES,errors:MONTHLY_ERRORS,loading:MONTHLY_LOADING,month:MONTHLY_SELECTED,cache:DETAIL_CACHE,charts:CHARTS}),
      route:()=>decodeRoute(new URLSearchParams(location.search).get('r'))
    };
  `);
  const test = w.__test;
  test.setSummary(accounts); test.render();
  assert.equal(w.document.querySelector('#sentientMonthly'), null, 'The default overview keeps its leaderboard without the monthly report');
  assert.equal(w.document.querySelector('#trackerOverviewTab').getAttribute('aria-selected'), 'true');
  test.enter = async () => { w.document.querySelector('#trackerSentientTab').click(); await until(() => !test.state().loading); };
  test.settled = () => until(() => !test.state().loading);
  const values = () => Object.fromEntries([...w.document.querySelectorAll('[data-monthly]')].filter(el => ['gained','lost','net'].includes(el.dataset.monthly)).map(el => [el.dataset.monthly, el.textContent]));
  return { dom, w, test, values };
}

{
  const accounts = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'].map(handle => account(handle)).concat(account('rival', 'competitors'));
  const { dom, w, test, values } = fixture(accounts);
  try {
    const histories = {
      alpha: history([['2026-09-29', 80], ['2026-09-30', 100], ['2026-10-01', 120], ['2026-10-02', 90], ['2026-10-03', 110], ['2026-10-14', 110]]),
      beta: history([['2026-09-29', 200], ['2026-09-30', 200], ['2026-10-01', 180], ['2026-10-02', 230], ['2026-10-14', 230]]),
      gamma: history([['2026-09-29', 300], ['2026-09-30', 300], ['2026-10-14', 300]]),
      delta: history([['2026-09-29', 400], ['2026-09-30', 400], ['2026-10-14', 400]]),
      epsilon: history([['2026-09-29', 500], ['2026-09-30', 500], ['2026-10-14', 500]]),
    };
    test.primeCache('alpha', detail(histories.alpha));
    let active = 0, peak = 0;
    const pending = new Map(), calls = [];
    w.fetch = (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer fixture-token');
      assert.equal(options.headers['X-Queue-Role-Preview'], 'vc');
      const handle = new URL(url).pathname.split('/').at(-1);
      assert.ok(handle !== 'rival', 'Monthly totals never request competitor histories');
      calls.push(handle); active++; peak = Math.max(peak, active);
      const request = deferred(); pending.set(handle, request);
      return request.promise.finally(() => { active--; });
    };
    const loading = test.enter(); await tick();
    assert.equal(peak, 3, 'History loading is bounded to three concurrent requests');
    assert.deepEqual(values(), { gained: '—', lost: '—', net: '—' }, 'Loading must not show an incomplete total');
    assert.equal(w.document.querySelector('#sentientMonthly [aria-busy]').getAttribute('aria-busy'), 'true');
    assertNoMonthlyNotices(w);
    for (const handle of ['beta', 'gamma', 'delta', 'epsilon']) {
      assert.ok(pending.has(handle), `${handle} was scheduled by a history worker`);
      pending.get(handle).resolve(reply(200, detail(histories[handle]))); await tick();
    }
    await loading;
    assert.ok(peak <= 3);
    assert.deepEqual(calls.toSorted(), ['beta', 'delta', 'epsilon', 'gamma']);
    assert.deepEqual(values(), { gained: '+90', lost: '−50', net: '+40' }, 'Separate daily/account gains and losses before adding Sentient totals');
    assertNoMonthlyNotices(w);
    assert.equal(w.document.querySelector('#trackerSentientTab').getAttribute('aria-selected'), 'true');
    assert.equal(w.document.querySelector('#tLeaderboard'), null);
    assert.equal(test.route().view, 'sentient');
    assert.match(w.document.querySelector('#sentientBestAccount').textContent, /@beta/);
    assert.equal(w.document.querySelectorAll('#sentientAccountRanking [data-monthly-account]').length, 5);
    assert.doesNotMatch(w.document.querySelector('#sentientAccountRanking').textContent, /rival/);
    const chart = () => test.state().charts.find(item => item.canvas.id === 'sentientGrowthChart');
    assert.ok(chart(), 'The Sentient report renders its growth chart');
    assert.equal(chart().data.datasets[0].data.at(-1), 40, 'Cumulative growth ends at the monthly net');
    w.document.querySelector('[data-monthly-chart="daily"]').click();
    assert.equal(chart().data.datasets[0].data.reduce((sum, value) => sum + value, 0), 40, 'Daily chart changes add up to the same monthly net');
    w.document.querySelector('[data-monthly-chart="cumulative"]').click();

    const before = calls.length;
    await test.load(); assert.equal(calls.length, before, 'Completed monthly histories are reused');
    w.document.querySelector('#sentientAccountRanking [data-monthly-account="alpha"]').click();
    await until(() => !!w.document.querySelector('#backBtn'));
    assert.equal(calls.length, before, 'Opening an account reuses its monthly history request');
    assert.equal(test.route().acc, 'alpha');
    w.document.querySelector('#backBtn').click();
    assert.ok(w.document.querySelector('#sentientMonthly'), 'Back from a ranked account restores the Sentient tab');
    w.document.querySelector('#trackerOverviewTab').click();
    assert.equal(w.document.querySelector('#sentientMonthly'), null);
    const search = w.document.querySelector('#trackerSearch'); search.value = 'rival'; search.dispatchEvent(new w.Event('input'));
    const group = w.document.querySelector('#trackerGroup'); group.value = 'competitors'; group.dispatchEvent(new w.Event('change'));
    assert.equal(w.document.querySelectorAll('tr[data-handle]').length, 1);
    await test.enter();
    assert.deepEqual(values(), { gained: '+90', lost: '−50', net: '+40' }, 'Leaderboard search and group filters cannot narrow Sentient totals');

    const month = w.document.querySelector('#sentientMonth');
    assert.ok([...month.options].some(option => option.value === '2026-09'));
    month.value = '2026-09'; month.dispatchEvent(new w.Event('change'));
    assert.deepEqual(values(), { gained: '+20', lost: '0', net: '+20' }, 'Changing the calendar month recomputes all Sentient accounts');
    assert.equal(test.state().month, '2026-09');
    assert.equal(test.route().month, '2026-09', 'The selected month is encoded in the share/reload URL');
    assert.equal(w.document.activeElement.id, 'sentientMonth');
    assert.equal(calls.length, before, 'Month selection computes from loaded histories');
    w.document.querySelector('#trackerOverviewTab').click();
    w.document.querySelector('[data-k="followers"]').click();
    await test.enter();
    assert.equal(w.document.querySelector('#sentientMonth').value, '2026-09', 'Month survives leaderboard rerenders');
    assert.deepEqual(values(), { gained: '+20', lost: '0', net: '+20' });
  } finally { dom.window.close(); }
}

{
  const { dom, w, test, values } = fixture([account('alpha'), account('beta'), account('rival', 'competitors')]);
  try {
    const calls = [];
    let fail = true;
    w.fetch = async url => {
      const handle = new URL(url).pathname.split('/').at(-1); calls.push(handle);
      return handle === 'beta' && fail
        ? reply(403, { detail: 'History unavailable' })
        : reply(200, detail(history([['2026-09-30', 100], ['2026-10-14', handle === 'alpha' ? 130 : 90]])));
    };
    await test.enter();
    assert.deepEqual(values(), { gained: '+30', lost: '0', net: '+30' }, 'Available histories remain summed even when another account fails to load');
    assertNoMonthlyNotices(w);
    assert.ok(w.document.querySelector('#retrySentientMonthly'));
    fail = false;
    await w.document.querySelector('#retrySentientMonthly').onclick();
    assert.deepEqual(calls, ['alpha', 'beta', 'beta'], 'Retry preserves successful histories and loads only the failed account');
    assert.deepEqual(values(), { gained: '+30', lost: '−10', net: '+20' });
    assert.match(w.document.querySelector('#sentientBestAccount').textContent, /@alpha/);
    assert.match(w.document.querySelector('#sentientWorstAccount').textContent, /@beta/);
    assert.equal(w.document.querySelector('#retrySentientMonthly'), null);
    assert.equal(Object.keys(test.state().errors).length, 0);
    assertNoMonthlyNotices(w);
  } finally { dom.window.close(); }
}

{
  const { dom, w, test, values } = fixture([account('old_account')]);
  try {
    const old = deferred(); w.fetch = () => old.promise;
    const oldLoad = test.load();
    const loading = test.enter(); await tick();
    w.__resetToolSession();
    assert.equal(test.state().loading, false);
    assert.equal(test.state().month, '');
    w.fetch = async () => reply(200, detail(history([['2026-09-30', 10], ['2026-10-14', 15]])));
    test.setSummary([account('new_account')]); test.render();
    if(!w.document.querySelector('#sentientMonthly')) await test.enter();
    else await test.settled();
    old.resolve(reply(200, detail(history([['2026-09-30', 1000], ['2026-10-14', 99999]])))); await oldLoad; await loading;
    assert.deepEqual(Object.keys(test.state().histories), ['new_account'], 'Late histories from an old session cannot enter the new session');
    assert.deepEqual(Object.keys(test.state().cache), ['new_account']);
    assert.deepEqual(values(), { gained: '+5', lost: '0', net: '+5' });
  } finally { dom.window.close(); }
}

{
  const { dom, w, test, values } = fixture([account('rival', 'competitors')]);
  try {
    w.fetch = () => assert.fail('No histories should load without Sentient accounts');
    await test.enter();
    assert.deepEqual(values(), { gained: '+0', lost: '0', net: '0' });
    assertNoMonthlyNotices(w);
  } finally { dom.window.close(); }
}

{
  const { dom, w, test, values } = fixture([account('empty')]);
  try {
    w.fetch = async () => reply(200, detail([]));
    await test.enter();
    assert.deepEqual(values(), { gained: '+0', lost: '0', net: '0' }, 'No usable comparisons contribute zero to the monthly sum');
    assertNoMonthlyNotices(w);
  } finally { dom.window.close(); }
}

{
  const { dom, w, test, values } = fixture([account('unavailable')]);
  try {
    w.fetch = async () => reply(403, { detail: 'History unavailable' });
    await test.enter();
    assert.deepEqual(values(), { gained: '+0', lost: '0', net: '0' }, 'An empty available-history sum remains numeric even if every history request fails');
    assert.ok(w.document.querySelector('#retrySentientMonthly'));
    assertNoMonthlyNotices(w);
  } finally { dom.window.close(); }
}

{
  const { dom, w, test, values } = fixture([account('em3rging'), account('trends')]);
  try {
    const histories = {
      // The account names swapped on October 9. Removing equal reciprocal
      // offsets (234,465 - 28,700) must preserve that day's real +914 / -7.
      em3rging: history([['2026-10-08', 234465], ['2026-10-09', 28693]]),
      trends: history([['2026-10-08', 28700], ['2026-10-09', 235379]]),
    };
    w.fetch = async url => reply(200, detail(histories[new URL(url).pathname.split('/').at(-1)]));
    await test.enter();
    assert.deepEqual(values(), { gained: '+914', lost: '−7', net: '+907' }, 'Equal reciprocal name-swap offsets preserve the real +914 / -7 changes instead of erasing the whole daily jumps');
    assert.match(w.document.querySelector('#sentientBestAccount').textContent, /@trends/);
    assert.match(w.document.querySelector('#sentientWorstAccount').textContent, /@em3rging/);
    assertNoMonthlyNotices(w);
    const adjustment = w.document.querySelector('#sentientRenameAdjustment');
    assert.ok(adjustment, 'The explicitly requested rename adjustment is documented in the report');
    assert.equal(adjustment.tagName, 'DETAILS', 'Rename details stay expandable');
    assert.match(adjustment.textContent, /@em3rging[\s\S]*@trends/);
    assert.match(adjustment.textContent, /Account names swapped/);
    assert.match(adjustment.textContent, /205,765/, 'The explanation identifies the reciprocal account-identity offset');
    assert.equal(w.document.querySelectorAll('#sentientAccountRanking .monthly-adjusted-badge').length, 2, 'Both swapped account rows identify their corrected follower jump');
    const emerging = w.document.querySelector('#sentientAccountRanking [data-monthly-account="em3rging"]');
    const trends = w.document.querySelector('#sentientAccountRanking [data-monthly-account="trends"]');
    assert.equal(emerging.cells[3].textContent, '−7');
    assert.equal(trends.cells[2].textContent, '+914');
  } finally { dom.window.close(); }
}

console.log('PASS Sentient overview: all Sentient histories, bounded reads, gains/losses, months, filter independence, cache reuse, available-history totals/retry, no notices, rename correction and stale session protection');
