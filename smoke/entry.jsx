import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { act } from 'react';
import App from '../src/App.jsx';

const POSTS = Array.from({ length: 12 }).map((_, i) => ({
  postKey: `chatgptricks:SC${i}`,
  shortcode: `SC${i}`,
  account: 'chatgptricks',
  accountLabel: 'ChatGPTricks',
  ownerUsername: 'chatgptricks',
  caption: i % 3 === 0 ? 'A caption #aitoolsentient' : 'Another caption about AI',
  postType: i % 2 ? 'Video' : 'Carousel',
  type: i % 2 ? 'Video' : 'Carousel',
  video: i % 2 ? 'Video' : 'Static',
  likes: 1000 * (i + 1),
  comments: 10 * i,
  postDate: `2026-08-${String(10 + i).padStart(2, '0')}T10:00:00Z`,
  isHot: i < 3,
  hotRate: 1.4,
  is_promo: i === 0 ? 1 : 0,
  hidden: 0,
  song: 'Some song',
  artist: 'Some artist',
}));

const ACCOUNTS = [
  { handle: 'chatgptricks', label: 'ChatGPTricks', group: 'sentient', has_avatar: 1, active: 1 },
  { handle: 'rivalpage', label: 'Rival Page', group: 'competitors', has_avatar: 0, active: 1 },
];

const stubFetch = async (url) => {
  const u = String(url);
  let body = {};
  if (u.includes('/api/dashboard/posts')) body = { posts: POSTS, summary: {}, ranges: {} };
  else if (u.includes('/api/dashboard/accounts')) body = { accounts: ACCOUNTS };
  else if (u.includes('/api/dashboard/lists')) body = { lists: [] };
  else if (u.includes('/api/admin/me')) body = { role: 'admin', email: 'esteban@sentientagency.io' };
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
};
globalThis.fetch = stubFetch;
window.fetch = stubFetch;

const errors = [];
const origError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ')); origError(...args); };
window.addEventListener('error', (e) => errors.push('window.error: ' + e.message));

const el = document.getElementById('root') || document.body.appendChild(document.createElement('div'));

(async () => {
 try {
  const root = createRoot(el);
  await act(async () => { root.render(<StrictMode><App /></StrictMode>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 400)); });

  const html = el.innerHTML;
  console.log('--- STATE ---', html.includes('dash-skeleton') ? 'SKELETON' : (html.includes('dash-state-error') ? 'ERROR' : 'LOADED'));
  const checks = {
    'topbar rendered': html.includes('class="topbar"'),
    'search field': html.includes('topbar-search'),
    'results count': html.includes('results-count'),
    'tracker link new tab': /href="[^"]*tracker\.html"[^>]*target="_blank"/.test(html)
      || (html.includes('tracker.html') && html.includes('target="_blank"')),
    'insights link': html.includes('insights.html'),
    'account menu': html.includes('account-menu-trigger'),
    'filter triggers': (html.match(/filter-trigger[ "]/g) || []).length >= 5,
    'no old filter-strip': !html.includes('filter-group-card'),
    'no eyebrow': !html.includes('Dash explorer'),
    'favicon set': (document.querySelector('link[rel="icon"]')?.href || '').startsWith('data:image/svg+xml'),
    'title has section': /sentientdash\.app/.test(document.title),
  };
  console.log('\n=== RENDER CHECKS ===');
  for (const [k, v] of Object.entries(checks)) console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
  console.log('\ndocument.title =', JSON.stringify(document.title));
  console.log('favicon =', (document.querySelector('link[rel="icon"]')?.getAttribute('href') || '').slice(0, 70));


  // ---- interaction checks -------------------------------------------------
  const q = (sel, root = document) => root.querySelector(sel);
  const qa = (sel, root = document) => [...root.querySelectorAll(sel)];
  const click = async (node) => { await act(async () => { node.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); };
  const press = async (key, opts = {}) => { await act(async () => { document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, ...opts })); }); };
  const inter = {};

  const typeTrigger = qa('.filter-trigger').find((b) => /Type/.test(b.textContent));
  inter['Type trigger exists'] = Boolean(typeTrigger);
  await click(typeTrigger);
  inter['popover opens on click'] = Boolean(q('.filter-popover-panel'));
  inter['popover is portaled to body'] = q('.filter-popover-panel')?.parentElement === document.body;
  inter['trigger reports expanded'] = typeTrigger.getAttribute('aria-expanded') === 'true';

  const videoChip = qa('.filter-popover-panel .chip').find((b) => b.textContent.trim().startsWith('Video'));
  inter['Video option in popover'] = Boolean(videoChip);
  await click(videoChip);
  inter['trigger goes active'] = typeTrigger.classList.contains('filter-trigger-active');
  inter['trigger shows summary'] = /Video/.test(typeTrigger.textContent);

  await press('Escape');
  inter['Escape closes popover'] = !q('.filter-popover-panel');

  inter['Clear pill shows the count'] = /1/.test(q('.filter-clear-pill')?.textContent || '');
  await click(q('.filter-clear-pill'));
  inter['Clear resets the trigger'] = !typeTrigger.classList.contains('filter-trigger-active');

  const searchBox = q('.topbar-search input');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(searchBox, 'robot');
    searchBox.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  inter['clear button replaces kbd hint'] = Boolean(q('.topbar-search .search-clear')) && !q('.search-kbd');

  await act(async () => { window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })); });
  inter['Cmd+K focuses search'] = document.activeElement === searchBox;

  await click(q('.account-menu-trigger'));
  inter['account menu opens'] = Boolean(q('.account-menu-panel'));
  inter['menu shows the email'] = /sentientagency\.io/.test(q('.account-menu-email')?.textContent || '');
  inter['sign out lives in the menu'] = /Sign out/.test(q('.account-menu-panel')?.textContent || '');


  const acctTrigger = qa('.filter-trigger').find((b) => /Account/.test(b.textContent));
  await click(acctTrigger);
  const acctPanel = q('.filter-popover-panel');
  inter['Account popover opens'] = Boolean(acctPanel);
  inter['account list is inline, not nested'] = Boolean(q('.account-multiselect-inline', acctPanel))
    && !q('.account-multiselect-trigger', acctPanel);
  inter['account search box present'] = Boolean(q('.account-multiselect-search input', acctPanel));
  inter['accounts listed'] = qa('.account-multiselect-item', acctPanel).length >= 1;
  await press('Escape');

  const sortTrigger = qa('.filter-trigger').find((b) => /Sort/.test(b.textContent));
  await click(sortTrigger);
  inter['Sort is a list, not a select'] = qa('.filter-popover-panel .sort-option').length >= 5
    && !q('.filter-popover-panel select');
  await press('Escape');
  inter['no Asset filter'] = !qa('.filter-trigger').some(b => /Asset/.test(b.textContent));
  inter['no active-chip row'] = !q('.active-chips');
  inter['no standalone Promo pill'] = !qa('.filter-trigger').some(b => /^Promo/.test(b.textContent.trim()));
  inter['no Hidden pill on tab row'] = !q('.tabs-bar .hidden-toggle');
  await click(typeTrigger);
  const flagChips = qa('.filter-popover-panel .chip');
  inter['Promo lives in Type'] = flagChips.some(c => /Promo/.test(c.textContent));
  inter['Hidden lives in Type'] = flagChips.some(c => /Hidden/.test(c.textContent));
  const promoChip = flagChips.find(c => /Promo/.test(c.textContent));
  await click(promoChip);
  inter['Promo toggles'] = promoChip.classList.contains('chip-active');
  inter['Type trigger summarises Promo'] = /Promo/.test(typeTrigger.textContent);
  await press('Escape');
  inter['Clear pill appears'] = Boolean(q('.filter-clear-pill'));
  await click(q('.filter-clear-pill'));
  inter['Clear resets promo'] = !/Promo/.test(typeTrigger.textContent);
  inter['filters live on the tab row'] = Boolean(q('.tabs-bar .filter-row')) && Boolean(q('.tabs-bar .group-tabs'));
  await press('Escape');


  // ---- layout probe (computed styles, not pixel geometry: jsdom has no
  // layout engine, so we assert the CSS that decides the layout) ----
  const gcs = (sel, props) => {
    const n = document.querySelector(sel);
    if (!n) return { MISSING: sel };
    const c = getComputedStyle(n);
    return Object.fromEntries(props.map(p => [p, c[p]]));
  };
  console.log('\n=== LAYOUT ===');
  console.log('.topbar-search ', JSON.stringify(gcs('.topbar-search', ['flex','height','minHeight','maxWidth'])));
  console.log('.topbar        ', JSON.stringify(gcs('.topbar', ['display','gridTemplateColumns','alignItems'])));
  console.log('.topbar-brandline', JSON.stringify(gcs('.topbar-brandline', ['display','alignItems','minHeight'])));
  const lay = {};
  lay['search is not flex-grow'] = !/^1 /.test(getComputedStyle(document.querySelector('.topbar-search')).flex);
  lay['search height 38px'] = getComputedStyle(document.querySelector('.topbar-search')).height === '38px';
  lay['brandline holds count'] = Boolean(document.querySelector('.topbar-brandline .results-count'));
  lay['one filter row in DOM'] = document.querySelectorAll('.filter-row').length === 1;
  lay['no duplicate skeleton strip'] = document.querySelectorAll('.dash-skeleton-strip').length === 0;
  Object.assign(checks, lay);


  // ---- carousel download ---------------------------------------------------
  // Earlier checks left "robot" in the search box, which filters everything
  // out -- with no results there is no selected post and no rail to test.
  await act(async () => {
    const box = q('.topbar-search input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(box, '');
    box.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  const clearPill = q('.filter-clear-pill');
  if (clearPill) await click(clearPill);
  // The harness loads hot.sentientdash.app, so the app opens on the HOT tab
  // by subdomain. The fixture has no currently-hot posts, so switch to ALL.
  const allTab = qa('.group-tab').find(t => /^ALL$/i.test(t.textContent.trim()));
  if (allTab) await click(allTab);
  await act(async () => { await new Promise(r => setTimeout(r, 300)); });
  console.log('GRID:', qa('.post-card').length, 'cards | triggers active:',
    qa('.filter-trigger-active').map(t => t.textContent.trim()).join(' , ') || 'none',
    '| search:', JSON.stringify(q('.topbar-search input')?.value),
    '| tab:', q('.group-tab-active')?.textContent, '| count:', q('.results-count')?.textContent);
  const card = q('.post-card');
  if (card) { await click(card); }
  await act(async () => { await new Promise(r => setTimeout(r, 200)); });
  console.log('RAIL:', (q('.right-rail')?.className) || 'NO RAIL', '| panels:', qa('.right-rail .panel').map(n=>n.className).join(' , ') || 'none', '| detail html:', (q('.panel.detail')?.innerHTML || '').slice(0,120));
  const dl = qa('.slide-download button')[0];
  inter['download button in rail'] = Boolean(dl);
  inter['download button labelled'] = /Download images/.test(dl?.textContent || '');
  let called = null;
  const realFetch = globalThis.fetch;
  // apiFetch goes through window.fetch, so stubbing globalThis alone misses it.
  const stubbed = async (u, o) => {
    if (String(u).includes('/posts/media')) {
      called = String(u);
      return { ok: true, status: 200,
        blob: async () => new (window.Blob || Blob)(['zip']),
        headers: { get: (k) => (k === 'X-Slide-Count' ? '3' : 'instagram') } };
    }
    return realFetch(u, o);
  };
  globalThis.fetch = stubbed; window.fetch = stubbed;
  // The app calls the global URL, which in this harness is Node's, not
  // jsdom's -- and Node's createObjectURL rejects a jsdom Blob. Stub both.
  window.URL.createObjectURL = () => 'blob:stub';
  window.URL.revokeObjectURL = () => {};
  globalThis.URL.createObjectURL = () => 'blob:stub';
  globalThis.URL.revokeObjectURL = () => {};
  if (dl) await click(dl);
  await act(async () => { await new Promise(r => setTimeout(r, 250)); });
  inter['calls the media endpoint'] = Boolean(called && /account=/.test(called) && /shortcode=/.test(called));
  await act(async () => { await new Promise(r => setTimeout(r, 400)); });
  console.log('NOTE:', JSON.stringify(q('.slide-download-note')?.textContent || null));
  inter['reports the slide count'] = /3 images/.test(q('.slide-download-note')?.textContent || '');
  globalThis.fetch = realFetch; window.fetch = realFetch;


  // ---- language + theme ----------------------------------------------------
  inter['theme starts dark'] = document.documentElement.getAttribute('data-theme') === 'dark';
  inter['lang toggle present'] = qa('.lang-option').map(b => b.textContent.trim()).join('/') === 'ENG/ES';
  const sun = q('.theme-toggle');
  inter['sun shown in dark'] = /\u2600/.test(sun?.textContent || '');
  await click(sun);
  inter['switches to light'] = document.documentElement.getAttribute('data-theme') === 'light';
  inter['moon shown in light'] = /\uD83C\uDF19/.test(q('.theme-toggle')?.textContent || '');
  inter['theme persisted'] = localStorage.getItem('sentient.theme') === 'light';
  await click(q('.theme-toggle'));
  inter['switches back to dark'] = document.documentElement.getAttribute('data-theme') === 'dark';

  const es = qa('.lang-option').find(b => b.textContent.trim() === 'ES');
  await click(es);
  inter['html lang becomes es'] = document.documentElement.getAttribute('lang') === 'es';
  inter['lang persisted'] = localStorage.getItem('sentient.lang') === 'es';
  inter['UI translated'] = /Buscar posts|Textos, canciones/.test(document.body.innerHTML);
  inter['filters translated'] = qa('.filter-trigger').some(b => /Cuenta|Fecha|Orden/.test(b.textContent));
  await click(qa('.lang-option').find(b => b.textContent.trim() === 'ENG'));
  inter['back to english'] = /Captions, songs/.test(document.body.innerHTML);

  console.log('\n=== INTERACTION CHECKS ===');
  for (const [k, v] of Object.entries(inter)) console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
  Object.assign(checks, inter);

  const real = errors.filter((e) => !/not wrapped in act|ReactDOMTestUtils|useLayoutEffect does nothing|Not implemented: navigation/.test(e));
  console.log('\n=== CONSOLE ERRORS (' + real.length + ') ===');
  real.slice(0, 8).forEach((e) => console.log('-', e.slice(0, 300)));
  const failed = Object.values(checks).some((v) => !v) || real.length > 0;
  process.exit(failed ? 1 : 0);
 } catch (e) { console.log('\nHARNESS ERROR:', e && e.message); console.log((e && e.stack || '').split('\n').slice(0,4).join('\n').slice(0,400)); process.exit(1); }
})();
