import { act } from 'react';

window.localStorage.setItem('sentient.queueGuide.v1', 'completed');

const localDay = () => {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};
const day = localDay();
const post = (account, shortcode) => ({ account, shortcode, caption: `${account} source post`, type: 'Image', coverUrl: '' });
const base = { productionPoints: 3, minutesPerPP: 10, durationMinutes: 30, priority: 'medium', tags: [], brief: '', notes: '', references: [], attachments: [], recommendedAccounts: [], coordinatorEmail: 'ivan@sentientagency.io' };
const pool = { ...base, id: 1, post: post('chatgptricks', 'POOL1'), status: 'pool', designerEmail: null, scheduledDate: null, scheduledStartMinutes: null };
const active = { ...base, id: 2, post: post('chatgptricks', 'ACTIVE1'), status: 'in_progress', designerEmail: 'esteban@sentientagency.io', scheduledDate: day, scheduledStartMinutes: 540 };
const scheduled = { ...base, id: 3, post: post('chatgptricks', 'NEXT1'), recommendedAccounts: ['chatgptricks'], status: 'scheduled', designerEmail: 'esteban@sentientagency.io', scheduledDate: day, scheduledStartMinutes: 570 };
const payload = {
  viewer: { email: 'esteban@sentientagency.io', isAdmin: true, isDev: true, operatingRoles: ['vc', 'pd'] },
  date: day,
  requests: [pool, active, scheduled],
  pickRequests: [pool],
  hotPickRequests: [],
  planningRequests: [active, scheduled],
  assignedRequests: [active, scheduled],
  liveDrafts: [],
  liveRevision: 0,
  timeBlocks: [],
  pendingTicketCount: 1,
  designers: [{ email: 'esteban@sentientagency.io', isAdmin: true, accounts: ['chatgptricks'] }],
  schedulerUsers: [
    { email: 'esteban@sentientagency.io', isAdmin: true, roles: ['vc', 'pd'], isQueueDesigner: true, accounts: ['chatgptricks'], accountAvatars: { chatgptricks: '/api/dashboard/avatar/chatgptricks' } },
    { email: 'ivan@sentientagency.io', isAdmin: true, roles: ['vc', 'pd'], isQueueDesigner: true, accounts: [] },
    { email: 'louis@sentientagency.io', isAdmin: false, roles: ['sales', 'pd'], isQueueDesigner: true, accounts: [] },
    { email: 'trainee@sentientagency.io', isAdmin: false, roles: ['trainee', 'pd'], minutesPerPP: 16, isQueueDesigner: true, accounts: [] },
  ],
  accounts: [{ handle: 'chatgptricks', label: 'ChatGPTricks' }],
  accountOnboarding: { completed: false, selectedAccounts: [] },
  tags: ['copy'], priorities: ['low', 'medium', 'high', 'urgent'], hours: { start: 0, end: 1440 },
};

let submitted = null;
let drafted = null;
let started = false;
let createdTimeBlock = false;
let tickets = [
  { id: 70, type: 'cancellation', status: 'pending', requesterEmail: 'ivan@sentientagency.io', requestId: 3, reason: 'Client changed direction', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), request: { id: 3, post: { account: 'chatgptricks', shortcode: 'NEXT1' }, designerEmail: 'ivan@sentientagency.io', status: 'scheduled', productionPoints: 3 } },
  { id: 69, type: 'pp_revision', status: 'rejected', requesterEmail: 'esteban@sentientagency.io', requestId: 3, requestedProductionPoints: 5, reason: 'More editing time', reviewerEmail: 'ivan@sentientagency.io', reviewedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), request: { id: 3, post: { account: 'chatgptricks', shortcode: 'NEXT1' }, designerEmail: 'esteban@sentientagency.io', status: 'scheduled', productionPoints: 3 } },
  { id: 68, type: 'time_block', status: 'approved', requesterEmail: 'esteban@sentientagency.io', category: 'meeting', title: 'Team sync', scheduledDate: day, scheduledStartMinutes: 720, durationMinutes: 30, reason: '', reviewerEmail: 'ivan@sentientagency.io', reviewedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];
const response = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const stubFetch = async (url, options = {}) => {
  const value = String(url);
  if (value.includes('/api/admin/users')) return response({ users: [{ email: 'esteban@sentientagency.io', role: 'admin', operating_role: 'vc', is_admin: true }] });
  if (value.includes('/api/admin/queue/designer-accounts')) return response({ designers: [{ email: 'esteban@sentientagency.io', accounts: ['chatgptricks'] }] });
  if (value.includes('/api/admin/accounts')) return response({ accounts: [{ handle: 'chatgptricks', group: 'sentient', is_active: true }] });
  if (value.includes('/api/dashboard/queue/v2/admin-report')) return response({ totals: {}, priorities: {}, designers: [], assignedPosts: [active, scheduled] });
  if (value.includes('/api/dashboard/queue/v2/account-onboarding')) {
    payload.accountOnboarding = { completed: true, selectedAccounts: JSON.parse(options.body.get('accounts') || '[]') };
    return response({ ok: true, accountOnboarding: payload.accountOnboarding });
  }
  if (value.includes('/api/dashboard/queue/v2/tickets/time-block')) {
    const block = { id: 71, type: 'time_block', status: 'pending', requesterEmail: 'esteban@sentientagency.io', category: options.body.get('category'), title: options.body.get('title') || 'Meeting', scheduledDate: options.body.get('scheduled_date'), scheduledStartMinutes: Number(options.body.get('scheduled_start_minutes')), durationMinutes: Number(options.body.get('duration_minutes')), reason: options.body.get('note') || '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    createdTimeBlock = true;
    payload.timeBlocks = [block];
    payload.pendingTicketCount += 1;
    tickets = [block, ...tickets];
    return response({ ok: true, ticket: block });
  }
  if (/\/api\/dashboard\/queue\/v2\/tickets\/\d+\/review/.test(value)) {
    const id = Number(value.match(/tickets\/(\d+)\/review/)[1]);
    tickets = tickets.map((ticket) => ticket.id === id ? { ...ticket, status: options.body.get('action') === 'approve' ? 'approved' : 'rejected', reviewerEmail: 'esteban@sentientagency.io', reviewedAt: new Date().toISOString() } : ticket);
    payload.pendingTicketCount = tickets.filter((ticket) => ticket.status === 'pending').length;
    return response({ ok: true, ticket: tickets.find((ticket) => ticket.id === id) });
  }
  if (value.includes('/api/dashboard/queue/v2/tickets')) return response({ tickets });
  if (value.includes('/api/dashboard/queue/v2/pick')) {
    const picked = { ...pool, status: 'scheduled', designerEmail: 'esteban@sentientagency.io', scheduledDate: day, scheduledStartMinutes: 600 };
    payload.requests = [picked, ...payload.requests.filter((task) => task.id !== picked.id)];
    payload.pickRequests = [];
    payload.assignedRequests = [...payload.assignedRequests, picked];
    return response({ ok: true, request: picked });
  }
  if (value.includes('/api/dashboard/queue/v2/drafts') && !value.includes('/clear')) {
    drafted = JSON.parse(options.body.get('changes')).map((change) => ({ ...pool, ...change, designerEmail: change.designerEmail, scheduledDate: change.scheduledDate, scheduledStartMinutes: change.scheduledStartMinutes, recommendedAccounts: change.recommendedAccounts || [], status: change.status === 'pool' ? 'pool' : 'scheduled', isDraft: true, draftCoordinatorEmail: 'esteban@sentientagency.io' }));
    payload.liveDrafts = drafted;
    payload.liveRevision += 1;
    return response({ ok: true, drafts: drafted, liveRevision: payload.liveRevision });
  }
  if (value.includes('/api/dashboard/queue/v2/submit')) {
    submitted = JSON.parse(options.body.get('changes'));
    payload.liveDrafts = [];
    const poolReturn = submitted.find((change) => change.status === 'pool');
    if (poolReturn) {
      const source = [...payload.requests, ...payload.planningRequests].find((task) => task.id === poolReturn.id) || pool;
      const returned = { ...source, ...poolReturn, status: 'pool', designerEmail: null, scheduledDate: null, scheduledStartMinutes: null };
      payload.requests = [...payload.requests.filter((task) => task.id !== returned.id), returned];
      payload.planningRequests = payload.planningRequests.filter((task) => task.id !== returned.id);
      payload.assignedRequests = payload.assignedRequests.filter((task) => task.id !== returned.id);
      return response({ ok: true, submitted: submitted.length, notifications: { sent: 0, failed: 0 } });
    }
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
    checks['First-use account setup renders'] = Boolean(document.querySelector('.queue-account-setup-modal'));
    await click(document.querySelector('.queue-account-choice'));
    await click(document.querySelector('.queue-account-setup-modal .scheduler-primary'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    checks['Account setup persists selection'] = payload.accountOnboarding.completed && payload.accountOnboarding.selectedAccounts.includes('chatgptricks') && !document.querySelector('.queue-account-setup-modal');
    checks['24 hourly labels render'] = document.querySelectorAll('.scheduler-time-head b').length === 24;
    checks['Now renders once'] = document.querySelectorAll('.scheduler-now-global').length === 1 && document.querySelectorAll('.scheduler-now').length === 0;
    checks['Center Now control renders'] = Boolean(document.querySelector('.scheduler-center-now'));
    await click(document.querySelector('.dev-role-preview > button'));
    const timeZonePreview = document.querySelector('.dev-timezone-preview');
    checks['Dev time-zone simulator renders'] = Boolean(timeZonePreview) && timeZonePreview.options.length === 2;
    await act(async () => { timeZonePreview.value = 'America/Bogota'; timeZonePreview.dispatchEvent(new window.Event('change', { bubbles: true })); });
    checks['Dev time-zone simulator switches to Colombia'] = window.sessionStorage.getItem('sentient.queueTimeZonePreview') === 'America/Bogota';
    checks['Pool and scheduled blocks render'] = document.querySelectorAll('.queue-pool-card').length === 1 && document.querySelectorAll('.scheduler-block').length === 2;
    checks['Account badge and resize handles render'] = Boolean(document.querySelector('.scheduler-account-badges')) && document.querySelectorAll('.scheduler-resize-handle').length >= 2;
    checks['All dashboard users render as PD-capable'] = document.querySelectorAll('.scheduler-row').length === 4 && document.querySelectorAll('.scheduler-row.is-non-queue-user').length === 0;
    checks['Queue has no duplicate Admin tool'] = !document.querySelector('.queue-admin-button');
    const profileTrigger = document.querySelector('.queue-settings-trigger');
    checks['Signed-in profile opens Queue settings'] = profileTrigger?.querySelector('img')?.getAttribute('src') === 'https://example.test/esteban-avatar.png';
    await click(profileTrigger);
    const settingsLink = document.querySelector('.queue-settings-admin .queue-settings-link');
    checks['Admin profile menu links to standalone Settings'] = settingsLink?.tagName === 'A'
      && /\/settings\.html$/.test(settingsLink.getAttribute('href') || '');
    const resetQueueButton = document.querySelector('.queue-settings-admin .queue-settings-danger');
    checks['Admin profile menu exposes protected Queue reset'] = /Reset Queue|Resetear Queue/.test(resetQueueButton?.textContent || '');
    const guideButton = [...document.querySelectorAll('.queue-settings-panel button')].find((node) => /Start guided tour|Iniciar guía/.test(node.textContent));
    await click(guideButton);
    checks['Guided tour starts from Settings'] = Boolean(document.querySelector('.queue-guide-welcome'));
    await click([...document.querySelectorAll('.queue-guide-language button')].find((node) => /English/.test(node.textContent)));
    checks['Guided tour highlights Queue controls'] = Boolean(document.querySelector('.queue-guide-highlight')) && document.querySelectorAll('.queue-guide-veil').length === 4;
    const guideSteps = ['Requests & approvals', 'Your production day', 'The production pool', 'Schedule blocks', 'Upcoming work', 'Return to Dashboard'];
    const visitedGuideSteps = [];
    for (const title of guideSteps) {
      await click(document.querySelector('.queue-guide-card .scheduler-primary'));
      visitedGuideSteps.push(document.querySelector('.queue-guide-card h2')?.textContent || '');
    }
    checks['Guided tour includes Upcoming and Dashboard navigation'] = guideSteps.every((title, index) => visitedGuideSteps[index] === title)
      && Boolean(document.querySelector('.queue-dashboard-link'));
    await click(document.querySelector('.queue-guide-skip'));
    if (document.querySelector('.queue-overlay-backdrop')) await click(document.querySelector('.queue-overlay-backdrop'));

    await click(document.querySelector('.queue-ticket-button'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    const ticketPanel = document.querySelector('.queue-ticket-panel');
    checks['Coordinator ticket inbox renders'] = Boolean(ticketPanel) && document.querySelectorAll('.queue-ticket-list article').length === 1;
    checks['Request status tabs render'] = document.querySelectorAll('.queue-ticket-panel > nav [role="tab"]').length === 3;
    checks['Coordinator can review pending requests'] = document.querySelectorAll('.queue-ticket-list footer button').length === 2;
    await click([...document.querySelectorAll('.queue-ticket-panel > nav [role="tab"]')].find((node) => /Approved|Aprobadas/.test(node.textContent)));
    checks['Approved requests render separately'] = document.querySelectorAll('.queue-ticket-list article.status-approved').length === 1 && !document.querySelector('.queue-ticket-list footer');
    await click([...document.querySelectorAll('.queue-ticket-panel > nav [role="tab"]')].find((node) => /Rejected|Rechazadas/.test(node.textContent)));
    checks['Rejected requests render separately'] = document.querySelectorAll('.queue-ticket-list article.status-rejected').length === 1 && !document.querySelector('.queue-ticket-list footer');
    await click(document.querySelector('.queue-ticket-panel > header button'));

    const ownTrack = document.querySelector('.scheduler-track');
    ownTrack.getBoundingClientRect = () => ({ left: 0, right: 1440, top: 0, bottom: 84, width: 1440, height: 84, x: 0, y: 0, toJSON() {} });
    await act(async () => { ownTrack.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 120 })); });
    checks['Right click opens personal time form'] = Boolean(document.querySelector('.scheduler-time-form'));
    await click(document.querySelector('.scheduler-time-form > .scheduler-primary'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    checks['Pending personal time appears immediately'] = createdTimeBlock && Boolean(document.querySelector('.scheduler-time-block.status-pending'));

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
    checks['Draft leaves pool before submit'] = document.querySelectorAll('.queue-pool-card').length === 0;
    const poolDrop = document.querySelector('.scheduler-pool');
    const draftBlock = document.querySelector('.scheduler-block.is-draft');
    await act(async () => { draftBlock.dispatchEvent(dragEvent('dragstart')); poolDrop.dispatchEvent(dragEvent('dragover')); poolDrop.dispatchEvent(dragEvent('drop')); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    checks['Scheduled block returns immediately without Submit'] = submitted?.[0]?.status === 'pool' && !document.querySelector('.scheduler-drafts article') && Boolean(document.querySelector('.queue-pool-card'));
    const returnedPool = document.querySelector('.queue-pool-card');
    await act(async () => { returnedPool.dispatchEvent(dragEvent('dragstart')); track.dispatchEvent(dragEvent('dragover', 550)); track.dispatchEvent(dragEvent('drop', 550)); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    checks['Pool return can be scheduled again'] = drafted?.[0]?.status === 'scheduled' && Boolean(document.querySelector('.scheduler-block.is-draft'));
    const submit = document.querySelector('.scheduler-submit');
    await click(submit);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    checks['Submit sends final planned position'] = submitted?.length === 1 && submitted[0].scheduledStartMinutes === 600 && submitted[0].scheduledDate === day;
    await click(document.querySelector('.queue-create-button'));
    checks['Create Post accepts an intelligent source link'] = Boolean(document.querySelector('.queue-source-link input[type="url"]'))
      && Boolean(document.querySelector('.queue-source-link button'));
    await click(document.querySelector('.queue-create-head > button'));
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
