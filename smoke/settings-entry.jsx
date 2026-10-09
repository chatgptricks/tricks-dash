import { act } from 'react';

const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const users = [{ email: 'user03@example.com', display_name: 'User 03', role: 'admin', operating_role: 'vc', operating_roles: '["vc","pd","dev"]', is_admin: 1, slack_user_id: 'U0000000012', avatar_url: '/api/dashboard/user-avatar/U0000000012' }];
const accounts = [{ handle: 'chatgptricks', label: 'ChatGPTricks', group: 'sentient', group_name: 'sentient', subcategory: 'ai_automation', research_enabled: true, promos_enabled: false, hot_threshold: 600, scrape_mode: 'posts', is_active: true, followers: 1, total_posts: 1, avg_likes: 1 }];
accounts.push({ ...accounts[0], handle: 'fixture.account', label: 'Fixture account' });
const mediaKitPdf = new Uint8Array([37, 80, 68, 70, 45, ...new TextEncoder().encode('1.7\nSettings media kit fixture\n%%EOF\n')]);
const mediaKitRequests = [], mediaKitDownloads = [], mediaKitBlobs = [];
let mediaKitMode = 'success';
let resolveMediaKit = null;
const createObjectURL = (blob) => { mediaKitBlobs.push(blob); return `blob:settings-media-kit-${mediaKitBlobs.length}`; };
URL.createObjectURL = createObjectURL;
window.URL.createObjectURL = createObjectURL;
URL.revokeObjectURL = () => {};
window.URL.revokeObjectURL = () => {};
window.HTMLAnchorElement.prototype.click = function () { mediaKitDownloads.push({ filename: this.download, href: this.href }); };
// Import cards come from the server-owned queue, never from browser storage.
const backfillStatus = { running: true, active: null, queue: [], tasks: [{
  handle: 'newaccount', status: 'running', requested_at: new Date(Date.now() - 18_000).toISOString(),
  started_at: new Date(Date.now() - 15_000).toISOString(), progress: { phase: 'inserting', done: 40, total: 100 },
}] };
const usage = {
  days: 30, active_users_7d: 1, active_users_30d: 1, total_users: 1, total_events_in_range: 12,
  day_keys: ['2026-08-30'], dow_labels: ['Mon'], global_dow_hour: [Array(24).fill(0)],
  users: [{ email: users[0].email, role: 'admin', daily: [{ date: '2026-08-30', count: 12 }], total_all_time: 12, last_7d: 12, active_days: 1, last_seen: new Date().toISOString(), sections: { dashboard: 8, insights: 2, admin: 2 } }],
};
let rejectUserSave = false;
let submittedAccountRequest = null;
const stubFetch = async (url, options = {}) => {
  const value = String(url);
  if (value.includes('/api/admin/account-requests')) {
    submittedAccountRequest = Object.fromEntries(options.body);
    return ok({ ok: true, slackDelivered: true });
  }
  if (value.includes('/api/admin/accounts/backfill-status')) return ok(backfillStatus);
  if (/\/api\/admin\/accounts\/[^/]+\/media-kit\.pdf$/.test(value)) {
    mediaKitRequests.push({ url: value, options });
    if (mediaKitMode === 'pending') await new Promise((resolve) => { resolveMediaKit = resolve; });
    if (mediaKitMode === 'error') return new Response(JSON.stringify({ detail: 'Report data temporarily unavailable. Retry the download.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    return new Response(mediaKitPdf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="chatgptricks-media-kit-2026-10-09.pdf"' } });
  }
  if (value.includes('/api/dashboard/me')) return ok({ email: users[0].email, is_admin: true, is_dev: true });
  if (value.includes('/api/admin/accounts')) return ok({ accounts });
  if (value.includes('/api/admin/users')) {
    if (options.method === 'POST') {
      if (rejectUserSave) return { ok: false, status: 400, json: async () => ({ detail: 'Test validation failure' }) };
      const values = Object.fromEntries(options.body);
      const index = users.findIndex((person) => person.email === values.email);
      users[index] = { ...users[index], ...values, is_admin: values.is_admin === 'true', minutes_per_pp: values.minutes_per_pp || null };
    }
    return ok({ users });
  }
  if (value.includes('/api/admin/queue/designer-accounts')) return ok({ designers: [{ email: users[0].email, displayName: 'User 03', accounts: ['chatgptricks'] }] });
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
    checks['Standalone Settings renders'] = Boolean(document.querySelector('.product-header'));
    // Full DEV access exposes the same tools as Research.
    checks['Global tool navigation renders'] = [...document.querySelectorAll('.product-nav a')].map(link => link.textContent.trim()).join(',') === 'Research,Queue,Tracker,Promos,Vault,Hooks,News,Insights';
    checks['Seven logical tabs render'] = document.querySelectorAll('.settings-tab').length === 7;
    checks['Overview command cards render'] = document.querySelectorAll('.settings-overview-card').length === 6;
    checks['Gear remains available'] = Boolean(document.querySelector('.settings-menu-trigger'));

    await clickTab('Accounts');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    const mediaKitButton = () => document.querySelector('[aria-label="Download media kit for chatgptricks"]');
    checks['Media kit has its own Accounts column and generates on click'] = document.querySelectorAll('.accounts-table th').length === 9
      && [...document.querySelectorAll('.accounts-table th')].some((node) => /Media kit/i.test(node.textContent))
      && Boolean(mediaKitButton()) && mediaKitRequests.length === 0;
    mediaKitMode = 'pending';
    await act(async () => { mediaKitButton().click(); await new Promise((resolve) => setTimeout(resolve, 20)); });
    checks['Pending report disables only that account and does not expand its row'] = mediaKitButton().disabled
      && /Generating/i.test(mediaKitButton().textContent)
      && !document.querySelector('[aria-label="Download media kit for fixture.account"]').disabled
      && !document.querySelector('.accounts-detail-row') && mediaKitRequests.length === 1;
    await act(async () => { mediaKitButton().click(); await new Promise((resolve) => setTimeout(resolve, 10)); });
    checks['Pending report cannot start duplicate downloads'] = mediaKitRequests.length === 1;
    mediaKitMode = 'success';
    await act(async () => { resolveMediaKit(); await new Promise((resolve) => setTimeout(resolve, 30)); });
    checks['Successful report downloads server PDF with its attachment name'] = mediaKitDownloads.length === 1
      && mediaKitDownloads[0].filename === 'chatgptricks-media-kit-2026-10-09.pdf'
      && Buffer.from(await mediaKitBlobs[0].arrayBuffer()).equals(Buffer.from(mediaKitPdf))
      && mediaKitRequests[0].url === 'https://api.test/api/admin/accounts/chatgptricks/media-kit.pdf'
      && mediaKitRequests[0].options.cache === 'no-store' && !mediaKitButton().disabled
      && !document.querySelector('.accounts-detail-row');
    mediaKitMode = 'error';
    await act(async () => { mediaKitButton().click(); await new Promise((resolve) => setTimeout(resolve, 30)); });
    checks['Failed report retains a local row error and stays retryable'] = /Report data temporarily unavailable/.test(document.querySelector('.account-media-kit-error')?.textContent || '')
      && !mediaKitButton().disabled && mediaKitDownloads.length === 1
      && !document.querySelector('.accounts-detail-row');
    mediaKitMode = 'pending';
    await act(async () => { mediaKitButton().click(); await new Promise((resolve) => setTimeout(resolve, 20)); });
    checks['Report retry clears stale error while generating'] = !document.querySelector('.account-media-kit-error') && mediaKitButton().disabled;
    mediaKitMode = 'success';
    await act(async () => { resolveMediaKit(); await new Promise((resolve) => setTimeout(resolve, 30)); });
    checks['Report retry makes a fresh request and completes without editing the account'] = mediaKitRequests.length === 3
      && mediaKitDownloads.length === 2 && !mediaKitButton().disabled
      && !document.querySelector('.account-media-kit-error') && !document.querySelector('.accounts-detail-row');
    const accountSearch = document.querySelector('.accounts-search');
    const accountSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => { accountSetter.call(accountSearch, 'no-account-matches-fixture'); accountSearch.dispatchEvent(new window.Event('input', { bubbles: true })); });
    checks['Empty account results span the Media kit column'] = document.querySelector('.accounts-table-empty')?.colSpan === 9;
    await act(async () => { accountSetter.call(accountSearch, ''); accountSearch.dispatchEvent(new window.Event('input', { bubbles: true })); });
    checks['Account import progress comes from the server queue'] = Boolean(document.querySelector('.settings-account-backfill-progress'))
      && /@newaccount/.test(document.body.textContent)
      && !window.localStorage.getItem('sentientdash.settings.accountBackfills.v1');
    backfillStatus.tasks = [];
    await act(async () => {
      document.querySelector('.settings-account-backfill-dismiss')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await act(async () => {
      document.querySelector('.accounts-row')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const scrapeSelect = document.querySelector('[aria-label="Content to extract for chatgptricks"]');
    checks['Expanded account details span the Media kit column'] = document.querySelector('.accounts-detail-row td')?.colSpan === 9;
    checks['Existing account exposes Reels extraction'] = scrapeSelect?.value === 'posts'
      && [...(scrapeSelect?.options || [])].map((option) => option.value).join('|') === 'posts|reels|both';
    checks['Account exposes category, subcategory, and tool scopes'] = [...document.querySelectorAll('.account-manage-field select')]
      .some((select) => [...select.options].some((option) => option.value === 'leads'))
      && [...document.querySelectorAll('.account-manage-field select')]
        .some((select) => [...select.options].some((option) => option.value === 'ai_automation'))
      && document.querySelectorAll('.account-tool-scope input[type="checkbox"]').length === 2;

    await clickTab('Users');
    checks['User admin controls are collapsed by default'] = !document.querySelector('.settings-user-admin-panel');
    await act(async () => {
      document.querySelector('[aria-label="Open admin options for user03@example.com"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    checks['Users centralizes identity and roles'] = Boolean(document.querySelector('[aria-label="Display name for user03@example.com"]'))
      && Boolean(document.querySelector('.settings-user-admin-toggle'))
      && Boolean(document.querySelector('.settings-user-admin-accounts'));
    checks['Users show Slack avatar slot'] = Boolean(document.querySelector('.settings-user-avatar img'));

    const nameInput = document.querySelector('[aria-label="Display name for user03@example.com"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setter.call(nameInput, 'User 03 edited');
      nameInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    rejectUserSave = true;
    await act(async () => {
      document.querySelector('.settings-user-savebar .primary').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    checks['Failed save preserves the typed draft'] = nameInput.value === 'User 03 edited' && /Test validation failure/.test(document.querySelector('.settings-user-save-error')?.textContent || '');
    checks['Failed save offers retry without retyping'] = /Retry save/.test(document.querySelector('.settings-user-savebar .primary')?.textContent || '');
    rejectUserSave = false;
    await act(async () => {
      document.querySelector('.settings-user-savebar .primary').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    checks['Retry confirms saved data and clears the error'] = users[0].display_name === 'User 03 edited' && !document.querySelector('.settings-user-save-error') && document.querySelector('.settings-user-savebar .primary').disabled;
    checks['Saved badge retains the Slack avatar'] = Boolean(document.querySelector('.settings-user-avatar img'));

    await clickTab('Usage');
    checks['Usage has its own tab'] = Boolean(document.querySelector('.usage-section')) && !document.querySelector('.settings-row-accounts');

    await clickTab('Notifications');
    checks['Notifications has Slack and manual alert controls'] = /Slack alerts/.test(document.body.textContent) && /Custom alert/.test(document.body.textContent) && !/Disk usage/.test(document.body.textContent);

    await clickTab('System');
    checks['System excludes manual notifications'] = /Disk usage/.test(document.body.textContent) && /Recent Apify runs/.test(document.body.textContent) && !/Custom alert/.test(document.body.textContent);
    const { createRoot } = await import('react-dom/client');
    const { SettingsPanel } = await import('../src/App.jsx');
    const { PrefsProvider } = await import('../src/prefsContext');
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => { root.render(<PrefsProvider><SettingsPanel initialTab="accounts" isAdmin userEmail="admin@example.com" /></PrefsProvider>); await new Promise((resolve) => setTimeout(resolve, 30)); });
    await act(async () => { [...host.querySelectorAll('button')].find((node) => node.textContent.trim() === 'Add account').click(); });
    checks['Admin gets the account-shaped request flow'] = /Add account/.test(host.textContent) && host.querySelector('.wizard-steps') && !/Initial history import/.test(host.textContent);
    await act(async () => {
      const input = host.querySelector('input[placeholder="@username"]');
      setter.call(input, '@newbrand');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await act(async () => { host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 30)); });
    checks['Admin submits request and sees scheduled confirmation'] = submittedAccountRequest?.handle === '@newbrand' && /proximo refresh programado/.test(host.textContent);
    await act(async () => { root.unmount(); });
    host.remove();
    checks['No render or console errors'] = errors.length === 0;
  } catch (error) {
    errors.push(error.stack || String(error));
  } finally {
    console.error = originalError;
  }
  console.log(JSON.stringify({ checks, errors }));
  process.exit(Object.values(checks).every(Boolean) && !errors.length ? 0 : 1);
})();
