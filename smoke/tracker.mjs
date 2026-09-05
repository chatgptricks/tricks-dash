import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync('public/tracker.html', 'utf8');
const section = source.split('/* ---------------- Leaderboard ---------------- */')[1].split('/* ---------------- Historical stats table ---------------- */')[0];
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
window.API = 'https://example.test';
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
dom.window.close();
console.log('PASS Tracker search, groups, favorites, reset, empty state, sorting, missing values, stable leader and focus');
