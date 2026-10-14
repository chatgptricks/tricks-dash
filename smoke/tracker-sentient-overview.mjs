import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: () => null } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const history = values => values.map(([date, followers]) => ({ date, followers }));
const detail = followers_history => ({ followers_history, engagement_weekly: [] });
const account = (handle, group = 'sentient') => ({ handle, group, followers: 100, full_name: handle });

function fixture(accounts) {
  const source = fs.readFileSync('public/tracker.html', 'utf8');
  const dom = new JSDOM(source, { runScripts: 'outside-only', url: 'http://localhost:4199/tracker.html', pretendToBeVisual: true });
  const w = dom.window;
  const NativeDate = w.Date;
  w.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : ['2026-10-14T18:00:00Z'])); } static now() { return new NativeDate('2026-10-14T18:00:00Z').getTime(); } };
  w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  w.Chart = class { static defaults = { font: {} }; destroy() {} };
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
      state:()=>({histories:MONTHLY_HISTORIES,errors:MONTHLY_ERRORS,loading:MONTHLY_LOADING,month:MONTHLY_SELECTED,cache:DETAIL_CACHE})
    };
  `);
  const test = w.__test;
  test.setSummary(accounts); test.render();
  const values = () => Object.fromEntries([...w.document.querySelectorAll('[data-monthly]')].map(el => [el.dataset.monthly, el.textContent]));
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
    const loading = test.load(); await tick();
    assert.equal(peak, 3, 'History loading is bounded to three concurrent requests');
    assert.deepEqual(values(), { gained: '—', lost: '—', net: '—' }, 'Loading must not show an incomplete total');
    assert.equal(w.document.querySelector('#sentientMonthly [aria-busy]').getAttribute('aria-busy'), 'true');
    for (const handle of ['beta', 'gamma', 'delta', 'epsilon']) {
      assert.ok(pending.has(handle), `${handle} was scheduled by a history worker`);
      pending.get(handle).resolve(reply(200, detail(histories[handle]))); await tick();
    }
    await loading;
    assert.ok(peak <= 3);
    assert.deepEqual(calls.toSorted(), ['beta', 'delta', 'epsilon', 'gamma']);
    assert.deepEqual(values(), { gained: '+90', lost: '−50', net: '+40' }, 'Separate daily/account gains and losses before adding Sentient totals');
    assert.match(w.document.querySelector('#sentientMonthly').textContent, /5 \/ 5/);
    assert.match(w.document.querySelector('#sentientMonthly').textContent, /Partial history/);

    const before = calls.length;
    await test.load(); assert.equal(calls.length, before, 'Completed monthly histories are reused');
    test.writeAcc('alpha'); await test.renderDetail('alpha');
    assert.equal(calls.length, before, 'Opening an account reuses its monthly history request');
    w.document.querySelector('#backBtn').click();
    const search = w.document.querySelector('#trackerSearch'); search.value = 'rival'; search.dispatchEvent(new w.Event('input'));
    const group = w.document.querySelector('#trackerGroup'); group.value = 'competitors'; group.dispatchEvent(new w.Event('change'));
    assert.equal(w.document.querySelectorAll('tr[data-handle]').length, 1);
    assert.deepEqual(values(), { gained: '+90', lost: '−50', net: '+40' }, 'Leaderboard search and group filters cannot narrow Sentient totals');

    const month = w.document.querySelector('#sentientMonth');
    assert.ok([...month.options].some(option => option.value === '2026-09'));
    month.value = '2026-09'; month.dispatchEvent(new w.Event('change'));
    assert.deepEqual(values(), { gained: '+20', lost: '0', net: '+20' }, 'Changing the calendar month recomputes all Sentient accounts');
    assert.equal(test.state().month, '2026-09');
    assert.equal(w.document.activeElement.id, 'sentientMonth');
    assert.equal(calls.length, before, 'Month selection computes from loaded histories');
    w.document.querySelector('[data-k="followers"]').click();
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
    await test.load();
    assert.deepEqual(values(), { gained: '—', lost: '—', net: '—' }, 'A failed account history cannot masquerade as a complete Sentient total');
    assert.ok(w.document.querySelector('#sentientMonthly [role="alert"]'));
    assert.ok(w.document.querySelector('#retrySentientMonthly'));
    fail = false;
    await w.document.querySelector('#retrySentientMonthly').onclick();
    assert.deepEqual(calls, ['alpha', 'beta', 'beta'], 'Retry preserves successful histories and loads only the failed account');
    assert.deepEqual(values(), { gained: '+30', lost: '−10', net: '+20' });
    assert.equal(w.document.querySelector('#retrySentientMonthly'), null);
    assert.equal(Object.keys(test.state().errors).length, 0);
  } finally { dom.window.close(); }
}

{
  const { dom, w, test, values } = fixture([account('old_account')]);
  try {
    const old = deferred(); w.fetch = () => old.promise;
    const loading = test.load(); await tick();
    w.__resetToolSession();
    assert.equal(test.state().loading, false);
    assert.equal(test.state().month, '');
    test.setSummary([account('new_account')]); test.render();
    w.fetch = async () => reply(200, detail(history([['2026-09-30', 10], ['2026-10-14', 15]])));
    await test.load();
    old.resolve(reply(200, detail(history([['2026-09-30', 1000], ['2026-10-14', 99999]])))); await loading;
    assert.deepEqual(Object.keys(test.state().histories), ['new_account'], 'Late histories from an old session cannot enter the new session');
    assert.deepEqual(Object.keys(test.state().cache), ['new_account']);
    assert.deepEqual(values(), { gained: '+5', lost: '0', net: '+5' });
  } finally { dom.window.close(); }
}

{
  const { dom, w, test, values } = fixture([account('rival', 'competitors')]);
  try {
    w.fetch = () => assert.fail('No histories should load without Sentient accounts');
    await test.load();
    assert.deepEqual(values(), { gained: '—', lost: '—', net: '—' });
    assert.match(w.document.querySelector('#sentientMonthly').textContent, /No Sentient accounts tracked/);
  } finally { dom.window.close(); }
}

console.log('PASS Sentient overview: all Sentient histories, bounded reads, separate gains/losses, monthly selection, filter independence, cache reuse, unavailable/retry, and stale session protection');
