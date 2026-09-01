import { act } from 'react';

const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const users = [{ email: 'esteban@sentientagency.io', display_name: 'Esteban', role: 'admin', operating_role: 'vc', operating_roles: '["vc","pd","dev"]', is_admin: 1, slack_user_id: 'U08UYJMPJ76', avatar_url: '/api/dashboard/user-avatar/U08UYJMPJ76' }];
const accounts = [{ handle: 'chatgptricks', label: 'ChatGPTricks', group: 'sentient', group_name: 'sentient', hot_threshold: 600, is_active: true, followers: 1, total_posts: 1, avg_likes: 1 }];
window.localStorage.setItem('sentientdash.settings.accountBackfills.v1', JSON.stringify([{
  id: 'newaccount-1', handle: 'newaccount', label: 'New Account', group: 'sentient', phase: 'done',
  startedAt: Date.now() - 18_000, serverProgress: { phase: 'inserting', done: 100, total: 100 }, added: 25, error: '',
}]));
const usage = {
  days: 30, active_users_7d: 1, active_users_30d: 1, total_users: 1, total_events_in_range: 12,
  day_keys: ['2026-08-30'], dow_labels: ['Mon'], global_dow_hour: [Array(24).fill(0)],
  users: [{ email: users[0].email, role: 'admin', daily: [{ date: '2026-08-30', count: 12 }], total_all_time: 12, last_7d: 12, active_days: 1, last_seen: new Date().toISOString(), sections: { dashboard: 8, insights: 2, admin: 2 } }],
};
const stubFetch = async (url) => {
  const value = String(url);
  if (value.includes('/api/dashboard/me')) return ok({ email: users[0].email, is_admin: true, is_dev: true });
  if (value.includes('/api/admin/accounts')) return ok({ accounts });
  if (value.includes('/api/admin/users')) return ok({ users });
  if (value.includes('/api/admin/queue/designer-accounts')) return ok({ designers: [{ email: users[0].email, displayName: 'Esteban', accounts: ['chatgptricks'] }] });
  if (value.includes('/api/admin/disk-status')) return ok({ pct_used: 22, used_mb: 220, total_mb: 1000, free_mb: 780 });
  if (value.includes('/api/admin/slack-status')) return ok({ configured: true, alert_groups: 'queue, system' });
  if (value.includes('/api/admin/ocr/status')) return ok({ running: false, remaining: 0, with_text_total: 100, done: 0 });
  if (value.includes('/api/admin/usage')) return ok(usage);
  if (value.includes('/api/dashboard/queue/v2/admin-report')) return ok({ totals: {}, priorities: {}, designers: [], assignedPosts: [] });
  if (value.includes('/api/admin/apify/runs')) return ok({ runs: [] });
  return ok({});
};
globalThis.fetch = stubFetch;
window.fetch = stubFetch;

const clickTab = async (label) => {
  const button = [...document.querySelectorAll('.settings-tab')].find((node) => node.textContent.trim() === label);
  await act(async () => {
    button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
};

(async () => {
  const checks = {};
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => { const message = args.map(String).join(' '); if (!/not wrapped in act/.test(message)) errors.push(message); originalError(...args); };
  try {
    await act(async () => {
      await import('../src/settings.jsx');
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    checks['Standalone Settings renders'] = Boolean(document.querySelector('.settings-command-header'));
    checks['Global tool navigation renders'] = document.querySelectorAll('.settings-command-nav a').length === 4;
    checks['Seven logical tabs render'] = document.querySelectorAll('.settings-tab').length === 7;
    checks['Overview command cards render'] = document.querySelectorAll('.settings-overview-card').length === 6;
    checks['Gear remains available'] = Boolean(document.querySelector('.settings-menu-trigger'));

    await clickTab('Accounts');
    checks['Account import progress is persistent'] = Boolean(document.querySelector('.settings-account-backfill-progress'))
      && /@newaccount/.test(document.body.textContent)
      && /Imported 25 new posts/.test(document.body.textContent);
    await act(async () => {
      document.querySelector('.settings-account-backfill-dismiss')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    await clickTab('Users');
    checks['Users centralizes identity and roles'] = Boolean(document.querySelector('[aria-label="Display name for esteban@sentientagency.io"]'))
      && Boolean(document.querySelector('.settings-user-admin-toggle'))
      && Boolean(document.querySelector('.settings-row-accounts'));
    checks['Users show Slack avatar slot'] = Boolean(document.querySelector('.settings-user-avatar img'));

    await clickTab('Usage');
    checks['Usage has its own tab'] = Boolean(document.querySelector('.usage-section')) && !document.querySelector('.settings-row-accounts');

    await clickTab('Notifications');
    checks['Notifications has Slack and manual alert controls'] = /Slack alerts/.test(document.body.textContent) && /Custom alert/.test(document.body.textContent) && !/Disk usage/.test(document.body.textContent);

    await clickTab('System');
    checks['System excludes manual notifications'] = /Disk usage/.test(document.body.textContent) && /Recent Apify runs/.test(document.body.textContent) && !/Custom alert/.test(document.body.textContent);
    checks['No render or console errors'] = errors.length === 0;
  } catch (error) {
    errors.push(error.stack || String(error));
  } finally {
    console.error = originalError;
  }
  console.log(JSON.stringify({ checks, errors }));
  process.exit(Object.values(checks).every(Boolean) && !errors.length ? 0 : 1);
})();
