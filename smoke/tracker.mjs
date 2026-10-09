import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync('public/tracker.html', 'utf8');
const section = source.split('/* ---------------- Leaderboard ---------------- */')[1].split('/* ---------------- Historical stats table ---------------- */')[0];
const historySection = source.split('/* ---------------- Historical stats table ---------------- */')[1].split('/* ---------------- Account detail ---------------- */')[0];
const dom = new JSDOM('<main id="app"></main>', { runScripts: 'outside-only' });
const { window } = dom;
window.SUMMARY = { accounts: [
  { handle: 'alpha', full_name: 'Alpha Studio', group: 'sentient', followers: 100, delta_7d: { delta: -1 } },
  { handle: 'beta', full_name: 'Beta Studio', group: 'competitor', followers: 500, delta_7d: { delta: 20 } },
  { handle: 'empty', group: 'sentient', followers: null },
] };
window.$ = selector => window.document.querySelector(selector);
window.destroyCharts = () => {};
window.readFavs = () => ['beta'];
window.fmt = window.signed = window.pct = String;
window.dt = String;
window.toolLocale = () => window.document.documentElement.lang === 'es' ? 'es-CR' : 'en-US';
window.API = 'https://example.test';
window.wireAvatarFallbacks = () => {};
window.applyRefreshAllowance = () => {};
window.refreshAllAccountsNow = window.refreshAccountNow = () => { throw new Error('Filtering must not trigger scraping'); };
window.eval(section + '\nrenderLeaderboard();');
const handles = () => [...window.document.querySelectorAll('tr[data-handle]')].map(row => row.dataset.handle);
const search = value => {
  window.$('#trackerSearch').value = value;
  window.$('#trackerSearch').dispatchEvent(new window.Event('input'));
};
assert.equal(window.document.querySelectorAll('[data-column-filter]').length, 0);
assert.deepEqual(handles(), ['beta', 'alpha', 'empty']);
window.$('[data-k="followers"]').click();
assert.deepEqual(handles(), ['alpha', 'beta', 'empty']);
assert.match(window.$('.kpis').textContent, /Most followers@beta/);
window.$('[data-k="delta_7d"]').click();
window.$('[data-k="delta_7d"]').click();
assert.deepEqual(handles(), ['alpha', 'beta', 'empty']);
search('@alpha');
assert.deepEqual(handles(), ['alpha']);
assert.equal(window.document.activeElement.id, 'trackerSearch');
search('not-found');
assert.equal(handles().length, 0);
assert.match(window.$('.tracker-empty').textContent, /No accounts match/);
window.$('#clearTrackerFilters').click();
window.$('#trackerGroup').value = 'favorites';
window.$('#trackerGroup').dispatchEvent(new window.Event('change'));
assert.deepEqual(handles(), ['beta']);
window.$('#clearTrackerFilters').click();
window.$('#trackerGroup').value = 'sentient';
window.$('#trackerGroup').dispatchEvent(new window.Event('change'));
assert.deepEqual(handles(), ['alpha', 'empty']);
assert.equal(window.$('th[aria-sort="ascending"] button').dataset.k, 'delta_7d');
window.eval(historySection);
const history = [
  { date: '2026-09-01T14:00:00+00:00', followers: 100 },
  { date: '2026-09-02T14:00:00+00:00', followers: 110 },
  { date: '2026-09-03T14:00:00+00:00', followers: 120 },
  { date: '2026-09-06T14:00:00+00:00', followers: 150 },
  { date: '2026-09-08T14:00:00+00:00', followers: 170 },
];
const filled = window.historyWindowRows(history, 'all');
assert.deepEqual(Array.from(filled, (row) => window.trackerDateKey(row.date)), [
  '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04',
  '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08',
]);
assert.deepEqual(Array.from(filled.filter((row) => row.estimated), (row) => window.trackerDateKey(row.date)), ['2026-09-04', '2026-09-05', '2026-09-07']);
assert.equal(filled.find((row) => window.trackerDateKey(row.date) === '2026-09-04').followers, 130, 'bounded gaps interpolate follower totals');
assert.equal(filled.find((row) => window.trackerDateKey(row.date) === '2026-09-07').followers, 160, 'trailing gaps carry forward the last known total');
window.document.body.innerHTML = window.renderHistoricalStats(filled);
assert.equal(window.document.querySelectorAll('.hist-missing').length, 3);
dom.window.close();
// Refresh is open to everyone with a per-person limit. A refused action (403)
// or the limit (429) must be reported, never treated as a signed-out session.
const refreshSection = source.split('const trackerDelay')[1].split('async function loadSummary(){')[0];
const refreshDom = new JSDOM('<button id="refreshAllBtn" title="Refresh all"></button><button data-refresh="alpha" title="Refresh"></button>', { runScripts: 'outside-only' });
const rw = refreshDom.window;
const alerts = [];
let signedOut = false;
let respond = null;
rw.alert = message => alerts.push(message);
rw.__onInsightsUnauthorized = () => { signedOut = true; };
rw.API = 'https://example.test';
rw.SUMMARY = { accounts: [] };
rw.DETAIL_CACHE = {};
rw.TRACKER_SESSION = 0;
rw.render = () => {};
rw.eval(fs.readFileSync('public/tool-translations.js', 'utf8'));
rw.toolText = text => rw.SentientToolI18n.translate(text, rw.document.documentElement.lang);
rw.fetch = async (url, options = {}) => respond(String(url), options);
const reply = (status, body, headers = {}) => ({ ok: status < 400, status, json: async () => body, headers: { get: name => headers[name] ?? null } });
rw.eval('const trackerDelay' + refreshSection);
const button = () => rw.document.querySelector('[data-refresh]');
respond = () => reply(403, { detail: 'Admin or Dev access is required.' });
await rw.eval('refreshAccountNow')('alpha', button());
assert.equal(signedOut, false);
assert.match(alerts.at(-1), /Admin or Dev access is required/);
respond = () => reply(429, { detail: 'Too soon' }, { 'Retry-After': '1800' });
await rw.eval('refreshAccountNow')('alpha', button());
assert.equal(signedOut, false);
assert.equal(alerts.at(-1), 'You can refresh again in 30 min.');
assert.equal(button().disabled, true);
assert.equal(rw.document.querySelector('#refreshAllBtn').disabled, true);
assert.equal(button().title, 'You can refresh again in 30 min.');
respond = url => reply(200, url.includes('refresh-allowance') ? { unlimited: true, windowSeconds: 0, retryAfterSeconds: 0 } : {});
await rw.eval('loadRefreshAllowance')();
assert.equal(button().disabled, false);
assert.equal(button().title, 'Refresh');
respond = url => reply(200, url.includes('refresh-allowance') ? { unlimited: false, windowSeconds: 3600, retryAfterSeconds: 600 } : {});
await rw.eval('loadRefreshAllowance')();
assert.equal(button().disabled, true);
rw.close();

console.log('PASS Tracker search, groups, favorites, reset, empty state, sorting, estimated values, stable leader, focus, calendar gaps and per-person refresh limits without sign-out');
