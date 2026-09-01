import { act } from 'react';

const localNow = new Date();
const day = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;
const task = {
  id: 1, status: 'scheduled', designerEmail: 'esteban@sentientagency.io', scheduledDate: day,
  scheduledStartMinutes: 600, productionPoints: 3, durationMinutes: 30, priority: 'high', tags: [],
  recommendedAccounts: ['chatgptricks'], post: { account: 'chatgptricks', shortcode: 'ONE', caption: 'Useful AI workflow', type: 'Carousel', coverUrl: '' },
};
const queue = {
  viewer: { email: 'esteban@sentientagency.io', isAdmin: true, isDev: true, operatingRoles: ['vc', 'pd'], minutesPerPP: 10 },
  date: day, requests: [{ ...task, id: 2, status: 'pool', designerEmail: null, scheduledDate: null, scheduledStartMinutes: null }],
  planningRequests: [task], assignedRequests: [task], pickRequests: [], hotPickRequests: [], liveDrafts: [], liveRevision: 0,
  pendingTicketCount: 1, timeBlocks: [], accounts: [{ handle: 'chatgptricks', label: 'ChatGPTricks' }],
  schedulerUsers: [{ email: 'esteban@sentientagency.io', displayName: 'Esteban', roles: ['vc', 'pd'], avatarUrl: '' }],
};
const tracker = { tracking_since: day, accounts: [{ handle: 'chatgptricks', label: 'ChatGPTricks', followers: 100000, delta_1d: { delta: 120 }, delta_7d: { delta: 1200 }, avg_likes_30d: 2200 }] };
const post = { account: 'chatgptricks', shortcode: 'ONE', caption: 'Useful AI workflow', ocrText: 'A better prompt', type: 'Carousel', coverUrl: '', permalink: 'https://instagram.com/p/ONE/', likes: 4200, comments: 32, postDate: `${day}T12:00:00`, group: 'sentient', isHot: true, hotMultiplier: 3.4 };
const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), blob: async () => new Blob(['x']) });
const fetchStub = async (url) => {
  const value = String(url);
  if (value.includes('/api/dashboard/me')) return ok({ email: 'esteban@sentientagency.io', is_admin: true, is_dev: true, operating_role: 'vc', operating_roles: ['vc', 'pd'] });
  if (value.includes('/api/dashboard/posts')) return ok({ posts: [post], summary: {} });
  if (value.includes('/api/dashboard/accounts')) return ok({ accounts: [{ handle: 'chatgptricks', label: 'ChatGPTricks', group: 'sentient' }] });
  if (value.includes('/api/dashboard/queue/v2/admin-report')) return ok({ totals: {}, designers: [], assignedPosts: [task] });
  if (value.includes('/api/dashboard/queue/v2')) return ok(queue);
  if (value.includes('/api/tracker/summary')) return ok(tracker);
  if (value.includes('/api/insights/posts')) return ok({ accounts: [{ handle: 'chatgptricks', group: 'sentient', label: 'ChatGPTricks' }], posts: [{ a: 'chatgptricks', d: `${day}T12:00:00`, l: 4200, c: 32, t: 'Carousel', hot: 1, ocr: 'better prompt workflow artificial intelligence' }] });
  if (value.includes('/api/admin/accounts')) return ok({ accounts: [{ handle: 'chatgptricks', label: 'ChatGPTricks', group: 'sentient', is_active: true, total_posts: 1, hot_threshold: 600 }] });
  if (value.includes('/api/admin/users')) return ok({ users: [{ email: 'esteban@sentientagency.io', display_name: 'Esteban', operating_role: 'vc', operating_roles: ['vc', 'pd'], is_admin: true, slack_user_id: 'U08UYJMPJ76' }] });
  if (value.includes('/api/admin/usage')) return ok({ active_users_7d: 1, active_users_30d: 1, total_events_in_range: 10, users: [] });
  if (value.includes('/api/admin/disk-status')) return ok({ pct_used: 25, free_mb: 750 });
  if (value.includes('/api/admin/slack-status')) return ok({ configured: true, alert_groups: 'queue' });
  if (value.includes('/api/admin/ocr/status')) return ok({ remaining: 4, with_text_total: 100 });
  return ok({});
};
globalThis.fetch = fetchStub;
window.fetch = fetchStub;
window.scrollTo = () => {};
localStorage.setItem('sentient.tracker.favs', JSON.stringify(['chatgptricks']));

const click = async (node) => act(async () => { node.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 80)); });

(async () => {
  const checks = {};
  const errors = [];
  const oldError = console.error;
  console.error = (...args) => { const message = args.map(String).join(' '); if (!/not wrapped in act/.test(message)) errors.push(message); oldError(...args); };
  try {
    await act(async () => { await import('../src/mobile/main.jsx'); await new Promise((resolve) => setTimeout(resolve, 300)); });
    checks['Mobile shell renders'] = Boolean(document.querySelector('.m-app'));
    checks['Five primary sections render'] = document.querySelectorAll('.m-bottom-nav button').length === 5;
    checks['Role-aware home renders'] = /Team pulse|Pulso del equipo/.test(document.body.textContent);

    const nav = [...document.querySelectorAll('.m-bottom-nav button')];
    await click(nav[1]);
    checks['Independent Dashboard renders'] = document.querySelectorAll('.m-post-card').length === 1;
    await click(document.querySelector('.m-search-row > button'));
    checks['Research advanced filters render'] = /Media/.test(document.body.textContent) && /Minimum likes/.test(document.body.textContent) && /Period/.test(document.body.textContent);
    await click(document.querySelector('.m-sheet > header button'));
    await click(nav[2]);
    checks['Independent Queue renders'] = Boolean(document.querySelector('.m-queue-toolbar')) && Boolean(document.querySelector('.m-task'));
    checks['Queue day map renders'] = Boolean(document.querySelector('.m-day-map')) && Boolean(document.querySelector('.m-day-bar'));
    await click(nav[3]);
    checks['Independent Tracker renders'] = document.querySelectorAll('.m-tracker-row').length === 1 && /100,000/.test(document.body.textContent) && /\+120/.test(document.body.textContent);
    checks['Tracker favorite is first'] = Boolean(document.querySelector('.m-tracker-row:first-child .m-favorite.is-on'));
    await click(nav[4]);
    checks['Independent Insights renders'] = Boolean(document.querySelector('.m-insight-card'));

    await click(document.querySelector('.m-profile'));
    const settings = [...document.querySelectorAll('.m-menu-row')].find((node) => /Settings|Ajustes/.test(node.textContent));
    await click(settings);
    checks['Admin Settings section renders'] = document.querySelectorAll('.m-tab-scroll button').length === 7;
    const settingsTabs = [...document.querySelectorAll('.m-tab-scroll button')];
    await click(settingsTabs.find((node) => /Notifications|Notificaciones/.test(node.textContent)));
    checks['Custom notification renders'] = Boolean(document.querySelector('.m-settings-card textarea'));
    await click(settingsTabs.find((node) => /Accounts|Cuentas/.test(node.textContent)));
    const accountRow = document.querySelector('.m-settings-list > button');
    await click(accountRow);
    checks['Account parameters are editable'] = Boolean(document.querySelector('.m-account-edit-head')) && document.querySelectorAll('.m-sheet .m-form input').length >= 2;
    checks['No render errors'] = errors.length === 0;
  } catch (error) {
    const nested = Array.isArray(error?.errors) ? error.errors : [error];
    errors.push(...nested.map((item) => item?.stack || String(item)));
  }
  console.error = oldError;
  console.log(JSON.stringify({ checks, errors }, null, 2));
  process.exit(Object.values(checks).every(Boolean) && !errors.length ? 0 : 1);
})();
