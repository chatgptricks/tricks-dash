import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync('public/tracker.html', 'utf8');
const helper = fs.readFileSync('public/tracker-refresh.js', 'utf8');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 1));
const until = async predicate => { for (let i=0; i<500; i++) { if(predicate()) return; await tick(); } assert.fail('Refresh did not settle'); };
const reply = body => ({ ok: true, status: 200, json: async () => body, headers: { get: () => null } });
const countResult = { handle: 'alpha', followers_count: 125 };

{
  const dom = new JSDOM('', { runScripts: 'outside-only' });
  dom.window.eval(helper);
  const refresh = dom.window.SentientTrackerRefresh;
  let reads = 0;
  const statuses = [];
  const result = await refresh.wait({ job_id: 'one', status: 'queued' }, {
    read: async () => { reads++; return reads === 1 ? { status: 'running', progress: { total: 2, completed: 1 } } : { status: 'done', result: countResult }; },
    onProgress: job => statuses.push(job.status), delay: async () => {},
  });
  assert.equal(result.followers_count, 125);
  assert.deepEqual(statuses, ['queued', 'running', 'done']);
  await assert.rejects(refresh.wait({}, { read: async () => ({}) }), /Could not verify/);
  await assert.rejects(refresh.wait({ job_id: 'bad', status: 'done', result: {} }), /Could not verify/);
  await assert.rejects(refresh.wait({ job_id: 'bad', status: 'error', error: 'Instagram unavailable' }), /Instagram unavailable/);
  assert.equal(refresh.outcome({}).error, true);
  assert.equal(refresh.outcome({ handle: 'beta', followers_count: 125 }, 'en', 'alpha').error, true, 'A different account cannot count as the requested refresh');
  assert.equal(refresh.outcome({ snapshotted: ['beta'], failed: {} }, 'en', 'alpha').error, true, 'A batch missing the requested account cannot report success');
  assert.equal(refresh.readingDate('2026-10-18T01:00:00Z', 'en'), 'Oct 17, 2026');
  assert.equal(refresh.readingDate('2026-10-18', 'en'), 'Oct 18, 2026', 'Date-only readings keep the canonical calendar date');
  assert.equal(refresh.outcome({ snapshotted: [], failed: {} }).error, true);
  assert.match(refresh.outcome({ snapshotted: ['alpha'], failed: { beta: 'unavailable' } }, 'es').message, /@beta/);
  assert.match(refresh.describe({ progress: { total: 75, completed: 23, failed: 2 } }, 'es'), /23\/75.*2 sin actualizar/);
  assert.match(refresh.describe({ status: 'queued' }, 'en'), /queued/i);
  assert.match(refresh.describe({ status: 'queued' }, 'es'), /en cola/i);
  assert.equal(refresh.buttonLabel({ status: 'submitting' }, 'es'), 'Iniciando…');
  assert.equal(refresh.buttonLabel({ status: 'queued' }, 'en'), 'Queued…');
  assert.equal(refresh.buttonLabel({ status: 'queued' }, 'es'), 'En cola…');
  assert.equal(refresh.buttonLabel({ status: 'running', progress: { total: 75, completed: 23 } }, 'en'), 'Updating 23/75…');
  assert.equal(refresh.buttonLabel({ status: 'running', progress: { total: 75, completed: 23 } }, 'es'), 'Actualizando 23/75…');
  let now = 0, resumedReads = 0;
  const realNow = dom.window.Date.now;
  dom.window.Date.now = () => now;
  const resumed = await refresh.wait({ job_id: 'sleeping', status: 'queued' }, {
    read: async () => ++resumedReads === 1 ? { status: 'running' } : { status: 'done', result: countResult },
    delay: async () => { now += 16 * 60 * 1000; },
  });
  assert.equal(resumed.followers_count, 125, 'A resumed tab reads a finished job after its wait deadline');
  assert.equal(resumedReads, 2);
  let deadlineReads = 0;
  await assert.rejects(refresh.wait({ job_id: 'unfinished', status: 'queued' }, {
    maxWaitMs: 0, read: async () => { deadlineReads++; return { status: 'running' }; },
  }), /still running/);
  assert.equal(deadlineReads, 1, 'The final deadline check does not extend polling indefinitely');
  dom.window.Date.now = realNow;
  const realTimeout = dom.window.setTimeout;
  dom.window.setTimeout = (fn, ms) => realTimeout(fn, Math.min(ms, 5));
  await assert.rejects(refresh.wait({ job_id: 'hung-final-read', status: 'queued' }, {
    maxWaitMs: 0, read: async () => new Promise(() => {}),
  }), /timed out/, 'The final read has a bounded connection deadline');
  dom.window.setTimeout = realTimeout;
  await assert.rejects(refresh.bounded(async () => new Promise(() => {}), { timeoutMs: 5 }), /timed out/, 'A hung token/body must settle even if transport ignores abort');
  const controller = new AbortController();
  const waiting = refresh.bounded(async () => new Promise(() => {}), { signal: controller.signal });
  controller.abort();
  await assert.rejects(waiting, { name: 'AbortError' });
  dom.window.close();
}

function fixture(query = '') {
  const dom = new JSDOM(source, { runScripts: 'outside-only', url: `https://sentientdash.app/tracker.html${query}` });
  const w = dom.window;
  w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  w.Chart = class { static defaults = { font: {} }; destroy() {} };
  w.setInterval = () => 0;
  w.__firebaseIdToken = 'fixture'; w.__refreshFirebaseIdToken = async () => 'fixture';
  w.eval(helper); w.eval(fs.readFileSync('public/tracker-monthly.js', 'utf8'));
  const wait = w.SentientTrackerRefresh.wait;
  w.SentientTrackerRefresh.wait = (job, options) => wait(job, { ...options, delay: async () => {} });
  const main = [...w.document.scripts].find(script => script.textContent.includes("const API = 'https://cortex-api-db2e.onrender.com'"));
  w.eval(main.textContent + '\nwindow.test={boot,render,writeAcc,refresh:refreshAccountNow,all:refreshAllAccountsNow,state:()=>({summary:SUMMARY,cache:DETAIL_CACHE,running:REFRESH_OPERATION})};');
  return { dom, w, test: w.test };
}
const summary = (followers, growth) => ({ accounts: [{ handle: 'alpha', group: 'sentient', followers, delta_1d: { delta: growth, pct: growth }, captured_at: '2026-10-17T19:00:00Z' }], tracking_since: '2026-10-16' });
const detail = followers => ({ handle: 'alpha', followers_history: [{ date: '2026-10-16', followers: 100 }, { date: '2026-10-17', followers, followers_gained: followers - 100 }], engagement_weekly: [] });
{
  const { dom, w, test } = fixture('?acc=alpha');
  try {
    let posts = 0, summaries = 0, details = 0;
    const pending = deferred(), oldDetail = deferred();
    w.fetch = async (input, options = {}) => {
      const path = new URL(input).pathname;
      if (options.method === 'POST') { posts++; assert.equal(path, '/api/tracker/accounts/alpha/refresh', 'Detail reload only refreshes its selected account'); return reply({ job_id: 'one', status: 'queued' }); }
      if (path.endsWith('/summary')) return reply(++summaries === 1 ? summary(101, 1) : summary(125, 25));
      if (path.includes('/refresh-jobs/')) return pending.promise;
      if (path.endsWith('/accounts/alpha')) return ++details === 1 ? oldDetail.promise : reply(detail(125));
      throw new Error(path);
    };
    await test.boot();
    await until(() => posts === 1);
    const same = test.refresh('alpha');
    assert.equal(posts, 1, 'Clicks while refreshing do not enqueue another paid job');
    assert.equal(summaries, 1, 'Queued refresh must not reload stale summary as if complete');
    assert.match(w.document.querySelector('#trackerRefreshStatus').textContent, /queued/i);
    pending.resolve(reply({ status: 'done', result: countResult }));
    await same;
    await until(() => details === 2);
    await tick();
    oldDetail.resolve(reply(detail(101))); await tick();
    assert.equal(test.state().summary.accounts[0].delta_1d.delta, 25, 'Canonical growth refreshes alongside follower count');
    assert.equal(test.state().cache.alpha.followers_history.at(-1).followers, 125, 'Late pre-refresh detail cannot overwrite fresh history');
    assert.match(w.document.querySelector('.kpis').textContent, /1 day growth\+25/);
    assert.match(w.document.querySelector('#trackerRefreshStatus').textContent, /Followers for @alpha updated/);
    await test.boot(); test.render(); await tick();
    assert.equal(posts, 1, 'Boot retries/navigation within the same page do not start repeated jobs');
    assert.equal(w.document.querySelector('#detailRefreshBtn').disabled, false);
  } finally { dom.window.close(); }
}
{
  const { dom, w, test } = fixture();
  try {
    let posts = 0;
    w.fetch = async (input, options = {}) => {
      const path = new URL(input).pathname;
      if (options.method === 'POST') { posts++; assert.equal(path, '/api/tracker/snapshot-now'); return reply({ job_id: 'all', status: 'queued' }); }
      if (path.endsWith('/summary')) return reply(summary(125, 25));
      if (path.includes('/refresh-jobs/')) return reply({ status: 'done', result: { snapshotted: ['alpha'], failed: { beta: 'Instagram unavailable' } } });
      throw new Error(path);
    };
    await test.boot(); await until(() => posts === 1 && !test.state().running);
    assert.match(w.document.querySelector('#trackerRefreshStatus').textContent, /Could not update @beta/);
    assert.equal(w.document.querySelector('#trackerRefreshStatus').getAttribute('role'), 'alert');
    assert.ok(w.document.querySelector('#trackerRefreshStatus button'));
    assert.equal(w.document.querySelector('#refreshAllBtn').disabled, false);
  } finally { dom.window.close(); }
}
{
  const { dom, w, test } = fixture();
  try {
    const progress = deferred(), completion = deferred(), reloaded = deferred();
    let posts = 0, polls = 0, summaries = 0;
    w.fetch = async (input, options = {}) => {
      const path = new URL(input).pathname;
      if (options.method === 'POST') { posts++; return reply({ job_id: 'visible-progress', status: 'queued' }); }
      if (path.endsWith('/summary')) return ++summaries === 1 ? reply(summary(101, 1)) : reloaded.promise;
      if (path.includes('/refresh-jobs/')) return ++polls === 1 ? progress.promise : completion.promise;
      if (path.endsWith('/accounts/alpha')) return reply(detail(101));
      throw new Error(path);
    };
    await test.boot();
    await until(() => polls === 1);
    const assertBusy = (selector, label) => {
      const button = w.document.querySelector(selector);
      assert.equal(button.disabled, true);
      assert.equal(button.getAttribute('aria-busy'), 'true');
      assert.ok(button.querySelector('.refresh-icon.is-spinning'));
      if(label) assert.match(button.textContent, label);
    };
    assertBusy('#refreshAllBtn', /Queued/);
    assertBusy('[data-refresh="alpha"]');
    assert.match(w.document.querySelector('[data-refresh="alpha"]').getAttribute('aria-label'), /Queued.*@alpha/);
    test.render();
    assertBusy('#refreshAllBtn', /Queued/);
    void test.refresh('alpha'); void test.all();
    assert.equal(posts, 1, 'Rapid refresh calls and rerender reuse automatic refresh work');
    test.writeAcc('alpha'); test.render();
    await until(() => w.document.querySelector('#detailRefreshBtn'));
    assertBusy('#detailRefreshBtn', /Queued/);
    progress.resolve(reply({ status: 'running', progress: { total: 75, completed: 23 } }));
    await until(() => w.document.querySelector('#detailRefreshBtn').textContent.includes('23/75'));
    assertBusy('#detailRefreshBtn', /Updating 23\/75/);
    test.render();
    await until(() => w.document.querySelector('#detailRefreshBtn'));
    assertBusy('#detailRefreshBtn', /Updating 23\/75/);
    test.writeAcc(''); test.render();
    assertBusy('#refreshAllBtn', /Updating 23\/75/);
    assertBusy('[data-refresh="alpha"]');
    completion.resolve(reply({ status: 'done', progress: { total: 75, completed: 75 }, result: { snapshotted: ['alpha'], failed: {} } }));
    await until(() => summaries === 2);
    test.render();
    assertBusy('#refreshAllBtn', /Updating 75\/75/);
    reloaded.resolve(reply(summary(125, 25)));
    await until(() => !test.state().running);
    assert.match(w.document.querySelector('#refreshAllBtn').textContent, /Refresh all/);
    assert.equal(w.document.querySelector('#refreshAllBtn').getAttribute('aria-busy'), 'false');
    assert.equal(w.document.querySelector('#refreshAllBtn').disabled, false);
    assert.equal(w.document.querySelector('.refresh-icon.is-spinning'), null);
    assert.equal(posts, 1);
  } finally { dom.window.close(); }
}
for (const phase of ['enqueue', 'polling']) {
  const { dom, w, test } = fixture();
  try {
    let pendingSignal;
    w.fetch = async (input, options = {}) => {
      const path = new URL(input).pathname;
      if (path.endsWith('/summary')) return reply(summary(101, 1));
      if (options.method === 'POST' && phase === 'polling') return reply({ job_id: 'cancelled-session', status: 'queued' });
      pendingSignal = options.signal;
      return new Promise(() => {});
    };
    await test.boot();
    await until(() => pendingSignal);
    const running = test.state().running.promise;
    w.__resetToolSession();
    await running;
    assert.equal(pendingSignal.aborted, true, `A session change aborts the pending ${phase} connection`);
    assert.equal(test.state().running, null);
    assert.equal(test.state().summary, null);
    assert.equal(w.document.querySelector('#trackerRefreshStatus').hidden, true);
  } finally { dom.window.close(); }
}
console.log('PASS Tracker refresh: queued completion, canonical growth/history, selected-only reload, single-flight, malformed results, partial failures, retry and full-operation deadlines');
