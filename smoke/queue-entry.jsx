import { act } from 'react';

const localDay = () => {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};
const day = localDay();
const post = (account, shortcode) => ({ account, shortcode, caption: `${account} source post`, type: 'Image', coverUrl: '' });
const base = { productionPoints: 3, durationMinutes: 30, priority: 'medium', tags: [], brief: '', notes: '', references: [], attachments: [], recommendedAccounts: [], coordinatorEmail: 'ivan@sentientagency.io' };
const pool = { ...base, id: 1, post: post('chatgptricks', 'POOL1'), status: 'pool', designerEmail: null, scheduledDate: null, scheduledStartMinutes: null };
const active = { ...base, id: 2, post: post('chatgptricks', 'ACTIVE1'), status: 'in_progress', designerEmail: 'esteban@sentientagency.io', scheduledDate: day, scheduledStartMinutes: 540 };
const scheduled = { ...base, id: 3, post: post('chatgptricks', 'NEXT1'), recommendedAccounts: ['chatgptricks'], status: 'scheduled', designerEmail: 'esteban@sentientagency.io', scheduledDate: day, scheduledStartMinutes: 570 };
const payload = {
  viewer: { email: 'esteban@sentientagency.io', isAdmin: true, isDev: true, operatingRoles: ['vc', 'pd'] },
  date: day,
  requests: [pool, active, scheduled],
  planningRequests: [active, scheduled],
  assignedRequests: [active, scheduled],
  liveDrafts: [],
  liveRevision: 0,
  designers: [{ email: 'esteban@sentientagency.io', isAdmin: true, accounts: ['chatgptricks'] }],
  schedulerUsers: [
    { email: 'esteban@sentientagency.io', isAdmin: true, roles: ['vc', 'pd'], isQueueDesigner: true, accounts: ['chatgptricks'], accountAvatars: { chatgptricks: '/api/dashboard/avatar/chatgptricks' } },
    { email: 'ivan@sentientagency.io', isAdmin: true, roles: ['vc'], isQueueDesigner: false, accounts: [] },
    { email: 'louis@sentientagency.io', isAdmin: false, roles: ['sales'], isQueueDesigner: false, accounts: [] },
  ],
  tags: ['copy'], priorities: ['low', 'medium', 'high', 'urgent'], hours: { start: 0, end: 1440 },
};

let submitted = null;
let drafted = null;
let started = false;
const response = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const stubFetch = async (url, options = {}) => {
  const value = String(url);
  if (value.includes('/api/admin/users')) return response({ users: [{ email: 'esteban@sentientagency.io', role: 'admin', operating_role: 'vc', is_admin: true }] });
  if (value.includes('/api/admin/queue/designer-accounts')) return response({ designers: [{ email: 'esteban@sentientagency.io', accounts: ['chatgptricks'] }] });
  if (value.includes('/api/admin/accounts')) return response({ accounts: [{ handle: 'chatgptricks', group: 'sentient', is_active: true }] });
  if (value.includes('/api/dashboard/queue/v2/drafts') && !value.includes('/clear')) {
    drafted = JSON.parse(options.body.get('changes')).map((change) => ({ ...pool, ...change, designerEmail: change.designerEmail, scheduledDate: change.scheduledDate, scheduledStartMinutes: change.scheduledStartMinutes, recommendedAccounts: change.recommendedAccounts || [], status: 'scheduled', isDraft: true, draftCoordinatorEmail: 'esteban@sentientagency.io' }));
    payload.liveDrafts = drafted;
    payload.liveRevision += 1;
    return response({ ok: true, drafts: drafted, liveRevision: payload.liveRevision });
  }
  if (value.includes('/api/dashboard/queue/v2/submit')) {
    submitted = JSON.parse(options.body.get('changes'));
    payload.liveDrafts = [];
    return response({ ok: true, submitted: submitted.length, notifications: { sent: 1, failed: 0 } });
  }
  if (value.includes('/api/dashboard/queue/v2/requests/3/start')) {
    started = true;
    return response({ ok: true, deferred: true, scheduledDate: day, scheduledStartMinutes: 600 });
  }
  if (value.includes('/history')) return response({ events: [] });
  if (value.includes('/api/dashboard/me')) return response({ email: 'esteban@sentientagency.io', is_dev: true });
  if (value.includes('/api/dashboard/queue/v2')) return response(payload);
  return response({});
};
globalThis.fetch = stubFetch;
window.fetch = stubFetch;

const transfer = { setData() {}, getData() { return ''; }, dropEffect: 'move' };
const dragEvent = (type, clientX = 0) => {
  const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX });
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  return event;
};
const click = async (node) => { await act(async () => { node.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); };

(async () => {
  const checks = {};
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => { const message = args.map(String).join(' '); if (!/not wrapped in act/.test(message)) errors.push(message); originalError(...args); };
  try {
    await act(async () => {
      await import('../src/queue.jsx');
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    checks['Queue renders'] = Boolean(document.querySelector('.scheduler-canvas'));
    checks['24 hourly labels render'] = document.querySelectorAll('.scheduler-time-head b').length === 24;
    checks['Now renders once'] = document.querySelectorAll('.scheduler-now-global').length === 1 && document.querySelectorAll('.scheduler-now').length === 0;
    checks['Center Now control renders'] = Boolean(document.querySelector('.scheduler-center-now'));
    checks['Pool and scheduled blocks render'] = document.querySelectorAll('.queue-pool-card').length === 1 && document.querySelectorAll('.scheduler-block').length === 2;
    checks['Account badge and resize handles render'] = Boolean(document.querySelector('.scheduler-account-badges')) && document.querySelectorAll('.scheduler-resize-handle').length >= 2;
    checks['All dashboard users render in scheduler'] = document.querySelectorAll('.scheduler-row').length === 3 && document.querySelectorAll('.scheduler-row.is-non-queue-user').length === 2;
    await click(document.querySelector('.queue-admin-button'));
    checks['Admin tabs render'] = document.querySelectorAll('.queue-admin-tabs [role="tab"]').length === 2;
    await click([...document.querySelectorAll('.queue-admin-tabs [role="tab"]')].find((node) => /User Management|Gestión de usuarios/.test(node.textContent)));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    checks['User Management lists users and accounts'] = Boolean(document.querySelector('.queue-user-management-list')) && Boolean(document.querySelector('.queue-user-management-add select'));

    const nextBlock = document.querySelector('.scheduler-block.state-scheduled');
    await click(nextBlock);
    checks['Sideview opens'] = Boolean(document.querySelector('.queue-request-rail'));
    const start = [...document.querySelectorAll('.queue-detail-actions button')].find((node) => /Start work|Empezar trabajo/.test(node.textContent));
    await click(start);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    checks['Start action accepts deferred response'] = started && !document.querySelector('.queue-request-rail');
    checks['Deferred warning is shown'] = /already in progress|Ya hay otro post/.test(document.querySelector('.queue-toast')?.textContent || '');

    const poolCard = document.querySelector('.queue-pool-card');
    const track = document.querySelector('.scheduler-track');
    track.getBoundingClientRect = () => ({ left: 0, right: 1440, top: 0, bottom: 84, width: 1440, height: 84, x: 0, y: 0, toJSON() {} });
    await act(async () => { poolCard.dispatchEvent(dragEvent('dragstart')); });
    await act(async () => { track.dispatchEvent(dragEvent('dragover', 550)); });
    const ghost = document.querySelector('.scheduler-drop-preview');
    checks['Drag ghost renders before drop'] = Boolean(ghost);
    checks['Ghost shows final collision-free time'] = /10:00/.test(ghost?.textContent || '');
    await act(async () => { track.dispatchEvent(dragEvent('drop', 550)); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    checks['Drop creates one draft'] = document.querySelectorAll('.scheduler-drafts article').length === 1;
    checks['Draft is shared before submit'] = drafted?.length === 1 && Boolean(document.querySelector('.scheduler-block.is-draft'));
    const submit = document.querySelector('.scheduler-submit');
    await click(submit);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    checks['Submit sends final planned position'] = submitted?.length === 1 && submitted[0].scheduledStartMinutes === 600 && submitted[0].scheduledDate === day;
    checks['No render or console errors'] = errors.length === 0;

    console.log('\n=== QUEUE SMOKE ===');
    for (const [label, passed] of Object.entries(checks)) console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
    if (errors.length) errors.slice(0, 5).forEach((error) => console.log('ERROR ', error.slice(0, 300)));
    process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
  } catch (error) {
    console.log('QUEUE HARNESS ERROR:', error?.stack || error);
    process.exit(1);
  }
})();
