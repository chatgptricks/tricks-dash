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
  w.eval(main.textContent + '\nwindow.test={boot,render,refresh:refreshAccountNow,all:refreshAllAccountsNow,state:()=>({summary:SUMMARY,cache:DETAIL_CACHE,running:REFRESH_OPERATION})};');
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
    assert.match(w.document.querySelector('#trackerRefreshStatus').textContent, /Checking followers/);
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
console.log('PASS Tracker refresh: queued completion, canonical growth/history, selected-only reload, single-flight, malformed results, partial failures, retry and full-operation deadlines');
