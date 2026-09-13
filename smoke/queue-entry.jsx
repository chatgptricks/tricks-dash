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
// A browser-wide draft from a prior user must never hydrate into Esteban's
// Queue session. The app now only reads owner-verified v3 envelopes.
window.localStorage.setItem('sentient.queueDrafts.v2', JSON.stringify([{ ...pool, status: 'scheduled', designerEmail: 'other@sentientagency.io', scheduledDate: day, scheduledStartMinutes: 600 }]));
const active = { ...base, id: 2, post: post('chatgptricks', 'ACTIVE1'), status: 'in_progress', designerEmail: 'esteban@sentientagency.io', scheduledDate: day, scheduledStartMinutes: 540 };
const scheduled = { ...base, id: 3, post: post('chatgptricks', 'NEXT1'), recommendedAccounts: ['chatgptricks'], status: 'scheduled', designerEmail: 'esteban@sentientagency.io', scheduledDate: day, scheduledStartMinutes: 570 };
const payload = {
  viewer: { displayName: 'Esteban Current', email: 'esteban@sentientagency.io', isAdmin: false, isDev: true, operatingRoles: ['pd'] },
  date: day,
  requests: [pool, active, scheduled],
  pickRequests: [pool],
  hotPickRequests: [],
  planningRequests: [active, scheduled],
  assignedRequests: [active, scheduled],
  liveDrafts: [],
  liveRevision: 0,
  presence: {
    'esteban@sentientagency.io': { status: 'active', lastSeenAt: new Date().toISOString() },
    'ivan@sentientagency.io': { status: 'idle', lastSeenAt: new Date().toISOString() },
    'louis@sentientagency.io': { status: 'offline', lastSeenAt: null },
    'trainee@sentientagency.io': { status: 'active', lastSeenAt: new Date().toISOString() },
  },
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
window.sessionStorage.setItem('sentient.queueSnapshot.v1:esteban@sentientagency.io', JSON.stringify({ version: 1, date: day, archive: false, savedAt: Date.now(), data: payload }));

let releaseInitialQueueFetch;
let holdInitialQueueFetch = true;
const initialQueueFetch = new Promise((resolve) => { releaseInitialQueueFetch = resolve; });

let submitted = null;
let drafted = null;
let started = false;
let failNextStart = false;
let allowStart = false;
let releaseStart;
let createdTimeBlock = false;
let releaseDelete;
let rejectDelete = false;
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
  if (value.includes('/api/dashboard/queue/v2/tickets/time-block/') && options.body?.get('delete')) {
    await new Promise(resolve => { releaseDelete = resolve; });
    if (rejectDelete) return { ok: false, status: 409, json: async () => ({ detail: 'Deletion failed' }) };
    payload.timeBlocks = [];
    return response({ ok: true });
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
  if (value.includes('/api/dashboard/queue/v2/drafts/clear')) {
    const ids = JSON.parse(options.body.get('request_ids') || '[]');
    payload.liveDrafts = payload.liveDrafts.filter(task => !ids.includes(task.id));
    return response({ ok: true });
  }
  if (value.includes('/api/dashboard/queue/v2/drafts') && !value.includes('/clear')) {
    drafted = JSON.parse(options.body.get('changes')).map((change) => ({ ...pool, ...change, designerEmail: change.designerEmail, scheduledDate: change.scheduledDate, scheduledStartMinutes: change.scheduledStartMinutes, recommendedAccounts: change.recommendedAccounts || [], status: change.status === 'pool' ? 'pool' : 'scheduled', isDraft: true, draftCoordinatorEmail: 'esteban@sentientagency.io' }));
    payload.liveDrafts = drafted;
    payload.liveRevision += 1;
    return response({ ok: true, drafts: drafted, liveRevision: payload.liveRevision });
  }
  if (value.includes('/api/dashboard/queue/v2/submit')) {
    submitted = JSON.parse(options.body.get('changes'));
    payload.liveDrafts = payload.liveDrafts.filter(task => !submitted.some(change => change.id === task.id));
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
    if (allowStart) {
      await new Promise(resolve => { releaseStart = resolve; });
      scheduled.status = 'in_progress';
      return response({ ok: true, deferred: false, scheduledDate: day, scheduledStartMinutes: 570 });
    }
    if (failNextStart) {
      failNextStart = false;
      return { ok: false, status: 403, json: async () => ({ detail: 'Only the assigned designer can start this request.' }) };
    }
    started = true;
    return response({ ok: true, deferred: true, scheduledDate: day, scheduledStartMinutes: 600 });
  }
  if (/\/requests\/\d+\/complete/.test(value)) {
    const id = Number(value.match(/requests\/(\d+)/)[1]);
    for (const key of ['requests', 'planningRequests', 'assignedRequests']) payload[key] = payload[key].map(task => task.id === id ? { ...task, status: 'completed', completedAt: new Date().toISOString() } : task);
    return response({ ok: true });
  }
  if (value.includes('/history')) return response({ events: [] });
  if (value.includes('/api/dashboard/me')) return response({ email: 'esteban@sentientagency.io', is_dev: true });
  if (value.includes('/api/dashboard/queue/v2')) {
    if (holdInitialQueueFetch) {
      await initialQueueFetch;
      holdInitialQueueFetch = false;
    }
    return response(payload);
  }
  return response({});
};
globalThis.fetch = stubFetch;
window.fetch = stubFetch;

const transferData = new Map();
const transfer = {
  setData(type, value) { transferData.set(type, value); },
  getData(type) { return transferData.get(type) || ''; },
  get types() { return [...transferData.keys()]; },
  clearData() { transferData.clear(); },
  dropEffect: 'move', effectAllowed: 'all',
};
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
    // Importing the entrypoint starts its intentionally pending first Queue
    // fetch. Keep that import outside React's async act boundary so the
    // smoke harness can inspect the cached view before releasing the fetch.
    await import('../src/queue.jsx');
    // Flush the initial effects without importing inside the async act scope;
    // otherwise React waits for the deliberately unresolved network promise.
    await act(async () => {});
    checks['Cached Queue view stays visible while reload syncs'] = Boolean(document.querySelector('.scheduler-canvas'))
      && !document.querySelector('.queue-state')
      && !document.querySelector('.queue-refresh-progress');
    releaseInitialQueueFetch();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 250)); });
    checks['Queue renders'] = Boolean(document.querySelector('.scheduler-canvas'));
    checks['Legacy browser-wide Queue drafts are ignored'] = !document.querySelector('.scheduler-drafts');
    const cachedQueue = JSON.parse(window.sessionStorage.getItem('sentient.queueSnapshot.v1:esteban@sentientagency.io') || 'null');
    checks['Queue saves the current view for an instant reload'] = cachedQueue?.version === 1
      && cachedQueue?.date === day
      && Boolean(cachedQueue?.data?.viewer?.email);
    checks['First-use account setup renders'] = Boolean(document.querySelector('.queue-account-setup-modal'));
    await click(document.querySelector('.queue-account-choice'));
    await click(document.querySelector('.queue-account-setup-modal .scheduler-primary'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    checks['Account setup persists selection'] = payload.accountOnboarding.completed && payload.accountOnboarding.selectedAccounts.includes('chatgptricks') && !document.querySelector('.queue-account-setup-modal');
    const schedulerTimeRows = [...document.querySelectorAll('.scheduler-time-zone-row')];
    checks['Costa Rica and Colombia hourly labels render'] = schedulerTimeRows.length === 2
      && schedulerTimeRows.every((row) => row.querySelectorAll('b').length === 24);
    const nowLineBefore = document.querySelector('.scheduler-now-global');
    checks['Now renders once above the calendar'] = document.querySelectorAll('.scheduler-now-global > b').length === 1 && /Now|Ahora/.test(nowLineBefore?.textContent || '');
    checks['Center Now control renders'] = Boolean(document.querySelector('.scheduler-center-now'));
    const showAllControl = document.querySelector('.scheduler-show-all');
    checks['Show all scheduler control renders'] = Boolean(showAllControl) && /Show all|Mostrar todo/.test(showAllControl?.textContent || '');
    await click(showAllControl);
    checks['Show all fits the effective schedule with compact block information'] = Boolean(document.querySelector('.scheduler.is-effective-view'))
      && Boolean(document.querySelector('.scheduler-block .scheduler-effective-meta'));
    await click(document.querySelector('.scheduler-show-all'));
    await click(document.querySelector('.dev-role-preview > button'));
    const timeZonePreview = document.querySelector('.dev-timezone-preview');
    checks['Dev time-zone simulator renders'] = Boolean(timeZonePreview) && timeZonePreview.options.length === 2;
    await act(async () => { timeZonePreview.value = 'America/Bogota'; timeZonePreview.dispatchEvent(new window.Event('change', { bubbles: true })); });
    checks['Dev time-zone simulator switches to Colombia'] = window.sessionStorage.getItem('sentient.queueTimeZonePreview') === 'America/Bogota';
    const noonCostaRicaHeader = schedulerTimeRows[0]?.querySelector('b[style*="left: 50%"], b[style*="left:50%"]');
    const noonColombiaHeader = schedulerTimeRows[1]?.querySelector('b[style*="left: 50%"], b[style*="left:50%"]');
    const nowLineAfter = document.querySelector('.scheduler-now-global');
    checks['Colombia labels stay one hour ahead without moving Now'] = noonCostaRicaHeader?.textContent === '12:00'
      && noonColombiaHeader?.textContent === '13:00'
      && nowLineAfter?.style.left === nowLineBefore?.style.left;
    checks['Colombia reads a Costa Rica 09:00 assignment as 10:00'] = [...document.querySelectorAll('.scheduler-block-copy small')].some((node) => /10:00/.test(node.textContent || ''));
    checks['Pool and scheduled blocks render'] = document.querySelectorAll('.queue-pool-card').length === 1 && document.querySelectorAll('.scheduler-block').length === 2;
    const upcomingSearch = document.querySelector('.queue-admin-search input');
    checks['Upcoming production search renders'] = Boolean(upcomingSearch) && upcomingSearch.type === 'search' && document.querySelectorAll('.queue-admin-assignment-row').length === 2;
    const setSearchValue = (value) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(upcomingSearch, value);
      upcomingSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
      upcomingSearch.dispatchEvent(new window.Event('change', { bubbles: true }));
    };
    await act(async () => { setSearchValue('scheduled'); });
    checks['Upcoming production search filters rows'] = document.querySelectorAll('.queue-admin-assignment-row').length === 1;
    await act(async () => { setSearchValue(''); });
    checks['Upcoming production search clears'] = document.querySelectorAll('.queue-admin-assignment-row').length === 2;
    checks['Legacy priority renders as regular work'] = document.querySelector('.queue-pool-card')?.classList.contains('priority-normal')
      && !document.querySelector('.queue-pool-card .queue-priority-badge')
      && !/Low|Medium|High/.test(document.querySelector('.queue-pool-card')?.textContent || '');
    checks['Account badge and resize handles render'] = Boolean(document.querySelector('.scheduler-account-badges')) && document.querySelectorAll('.scheduler-resize-handle').length >= 2;
    checks['Roster presence bubbles show active, idle and offline states'] = document.querySelector('.scheduler-user-presence.is-active')
      && document.querySelector('.scheduler-user-presence.is-idle')
      && document.querySelector('.scheduler-user-presence.is-offline');
    checks['All dashboard users render as PD-capable'] = document.querySelectorAll('.scheduler-row').length === 4 && document.querySelectorAll('.scheduler-row.is-non-queue-user').length === 0;
    checks['Roster shows only the highest role'] = [...document.querySelectorAll('.scheduler-user-copy small')].map((node) => node.textContent.trim()).join('|') === 'Admin|Admin|Sales|Trainee';
    const louisHeader = [...document.querySelectorAll('.scheduler-row > header')].find((node) => /Louis/.test(node.textContent || ''));
    await act(async () => { louisHeader.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 240, clientY: 170 })); });
    await click([...document.querySelectorAll('.scheduler-context-menu button')].find((node) => /^Hide Louis/.test(node.textContent || '')));
    checks['Hide user removes that VC row immediately'] = ![...document.querySelectorAll('.scheduler-row')].some((node) => /Louis/.test(node.textContent || ''));
    transfer.clearData();
    const traineeHeader = [...document.querySelectorAll('.scheduler-row > header')].find((node) => /Trainee/.test(node.textContent || ''));
    const ivanRow = [...document.querySelectorAll('.scheduler-row')].find((node) => /Ivan/.test(node.textContent || ''));
    await act(async () => { traineeHeader.dispatchEvent(dragEvent('dragstart')); ivanRow.dispatchEvent(dragEvent('dragover')); ivanRow.dispatchEvent(dragEvent('drop')); });
    checks['Drag reorder updates VC rows immediately'] = [...document.querySelectorAll('.scheduler-user-copy b')].map((node) => node.textContent.trim()).join('|') === 'Esteban Current|Trainee|Ivan';
    transfer.clearData();
    const createPostButton = document.querySelector('.queue-create-button');
    const addTimeButton = document.querySelector('.scheduler-add-time');
    checks['Add Time is grouped with Create Post'] = Boolean(addTimeButton) && createPostButton?.parentElement === addTimeButton.parentElement;
    checks['Dev keeps the coordinator scheduler controls'] = Boolean(addTimeButton)
      && document.querySelectorAll('.scheduler-resize-handle').length >= 2;
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
      && Boolean(document.querySelector('.product-nav a[href*="index.html"]'));
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
    const deletePersonalTime = async () => {
      await act(async () => { document.querySelector('.scheduler-time-block').dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
      await click([...document.querySelectorAll('.scheduler-context-menu button')].find(node => node.textContent === 'Delete personal time'));
    };
    rejectDelete = true;
    await deletePersonalTime();
    checks['Delete shows loading only on its time block'] = Boolean(document.querySelector('.scheduler-time-block.is-pending-action .queue-item-loading')) && !document.querySelector('.queue-refresh-progress');
    checks['Other posts remain interactive during deletion'] = !document.querySelector('.scheduler-block').disabled;
    await act(async () => { releaseDelete(); await new Promise(resolve => setTimeout(resolve, 50)); });
    checks['Failed delete restores the block'] = Boolean(document.querySelector('.scheduler-time-block:not(.is-pending-action)'));
    rejectDelete = false;
    await deletePersonalTime();
    await act(async () => { releaseDelete(); await new Promise(resolve => setTimeout(resolve, 50)); });
    checks['Confirmed delete removes the block'] = !document.querySelector('.scheduler-time-block');

    const nextBlock = document.querySelector('.scheduler-block.state-scheduled');
    await click(nextBlock);
    checks['Sideview opens'] = Boolean(document.querySelector('.queue-request-rail'));
    checks['Assignment detail uses the current Settings name'] = document.querySelector('.queue-request-rail').textContent.includes('Esteban Current');
    const start = [...document.querySelectorAll('.queue-detail-actions button')].find((node) => /Start work|Empezar trabajo/.test(node.textContent));
    failNextStart = true;
    await click(start);
    checks['Start action asks where to place the work'] = Boolean(document.querySelector('#queue-start-choice-title'));
    await click(document.querySelector('.queue-create-modal .scheduler-primary'));
    checks['Rejected start closes the detail and preserves scheduled state'] = !document.querySelector('.queue-request-rail') && Boolean(document.querySelector('.scheduler-block.state-scheduled'));
    checks['Rejected start shows the server reason'] = document.querySelector('.queue-toast')?.textContent.includes('Only the assigned designer');
    await click(document.querySelector('.scheduler-block.state-scheduled'));
    await click([...document.querySelectorAll('.queue-detail-actions button')].find(node => /Start work|Empezar trabajo/.test(node.textContent)));
    await click(document.querySelector('.queue-create-modal .scheduler-primary'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    checks['Deferred start closes the detail and stays scheduled'] = started
      && !document.querySelector('.queue-request-rail')
      && Boolean(document.querySelector('.scheduler-block.state-scheduled'));
    checks['Deferred warning is shown'] = /already in progress|Ya hay otro post/.test(document.querySelector('.queue-toast')?.textContent || '');

    const poolCardShell = document.querySelector('.queue-pool-card');
    const poolCard = poolCardShell?.querySelector(':scope > button');
    checks['Pool card primary surface is draggable'] = Boolean(poolCard?.draggable) && !poolCardShell?.draggable;
    const track = document.querySelector('.scheduler-track');
    track.getBoundingClientRect = () => ({ left: 0, right: 1440, top: 0, bottom: 84, width: 1440, height: 84, x: 0, y: 0, toJSON() {} });
    await act(async () => { poolCard.dispatchEvent(dragEvent('dragstart')); });
    await act(async () => { track.dispatchEvent(dragEvent('dragover', 550)); });
    const ghost = document.querySelector('.scheduler-drop-preview');
    checks['Drag ghost renders before drop'] = Boolean(ghost);
    checks['Ghost shows a final placement'] = Boolean(ghost?.style.left && ghost?.style.width);
    await act(async () => { track.dispatchEvent(dragEvent('drop', 550)); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    checks['Drop creates one draft'] = document.querySelectorAll('.scheduler-draft-actions').length === 1;
    checks['Draft is shared before submit'] = drafted?.length === 1 && Boolean(document.querySelector('.scheduler-block.is-draft'));
    checks['Drafts no longer have a separate bar'] = !document.querySelector('.scheduler-drafts');
    await click(document.querySelector('.scheduler-draft-pages'));
    checks['Page picker is local to the draft and assigned user'] = document.querySelector('.scheduler-page-picker')?.textContent.includes('Esteban Current') && document.querySelectorAll('.scheduler-page-options input').length === 1;
    await click(document.querySelector('.scheduler-page-options input'));
    checks['Page choice saves to this draft'] = payload.liveDrafts[0].recommendedAccounts.includes('chatgptricks');
    await click(document.querySelector('.scheduler-page-picker header button'));
    const localDraftEnvelope = JSON.parse(window.localStorage.getItem('sentient.queueDrafts.v3:esteban@sentientagency.io') || 'null');
    checks['Draft recovery is scoped to its authenticated owner'] = localDraftEnvelope?.version === 1
      && localDraftEnvelope?.ownerEmail === 'esteban@sentientagency.io'
      && Array.isArray(localDraftEnvelope?.drafts)
      && localDraftEnvelope.drafts.length === 1;
    checks['Draft leaves pool before submit'] = document.querySelectorAll('.queue-pool-card').length === 0;
    const poolDrop = document.querySelector('.scheduler-pool');
    const draftBlock = document.querySelector('.scheduler-block.is-draft');
    await act(async () => { draftBlock.dispatchEvent(dragEvent('dragstart')); poolDrop.dispatchEvent(dragEvent('dragover')); poolDrop.dispatchEvent(dragEvent('drop')); });
    checks['Pool return updates before network confirmation'] = !document.querySelector('.scheduler-draft-actions') && Boolean(document.querySelector('.queue-pool-card'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    checks['Scheduled block returns immediately without Submit'] = submitted?.[0]?.status === 'pool' && !document.querySelector('.scheduler-draft-actions') && Boolean(document.querySelector('.queue-pool-card'));
    const returnedPool = document.querySelector('.queue-pool-card > button');
    await act(async () => { returnedPool.dispatchEvent(dragEvent('dragstart')); track.dispatchEvent(dragEvent('dragover', 550)); track.dispatchEvent(dragEvent('drop', 550)); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    checks['Pool return can be scheduled again'] = drafted?.[0]?.status === 'scheduled' && Boolean(document.querySelector('.scheduler-block.is-draft'));
    await click(document.querySelector('.scheduler-block.is-draft'));
    checks['Draft sideview keeps caption clear'] = Boolean(document.querySelector('.queue-detail-copy > p'))
      && !document.querySelector('.queue-detail-notice.is-draft');
    await click(document.querySelector('.queue-request-rail .rail-close-button'));
    checks['Every post has a clock buffer'] = document.querySelectorAll('.scheduler-buffer-tongue').length === document.querySelectorAll('.scheduler-block').length
      && [...document.querySelectorAll('.scheduler-buffer-tongue')].every(node => node.querySelector('svg'));
    checks['Personal time has no buffer tongue'] = !document.querySelector('.is-personal-buffer');
    const otherScheduled = document.querySelector('.scheduler-block.state-scheduled:not(.is-draft)');
    await act(async () => { otherScheduled.dispatchEvent(dragEvent('dragstart')); track.dispatchEvent(dragEvent('drop', 850)); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    checks['Two posts can have independent pending changes'] = payload.liveDrafts.length === 2;
    await click(document.querySelector('.scheduler-draft-actions[data-request-id="1"] button:nth-child(2)'));
    checks['Cancel only discards the selected draft'] = payload.liveDrafts.length === 1 && payload.liveDrafts[0].id === 3;
    const poolAfterCancel = document.querySelector('.queue-pool-card > button');
    await act(async () => { poolAfterCancel.dispatchEvent(dragEvent('dragstart')); track.dispatchEvent(dragEvent('drop', 550)); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    const submit = document.querySelector('.scheduler-draft-actions[data-request-id="1"] button');
    checks['Each draft has confirm and cancel icons'] = document.querySelectorAll('.scheduler-draft-actions button').length === 6 && !document.querySelector('.scheduler-draft-float');
    await click(submit);
    checks['Confirm preserves the other pending post'] = payload.liveDrafts.length === 1 && payload.liveDrafts[0].id === 3;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 500)); });
    checks['Submit sends final planned position'] = submitted?.length === 1 && submitted[0].status === 'scheduled' && submitted[0].designerEmail === 'esteban@sentientagency.io';
    await click(document.querySelector('.queue-create-button'));
    checks['Create Post accepts an intelligent source link'] = Boolean(document.querySelector('.queue-source-link input[type="url"]'))
      && Boolean(document.querySelector('.queue-source-link button'));
    await click(document.querySelector('.queue-create-head > button'));
    await click(document.querySelector('.scheduler-draft-actions[data-request-id="3"] button:nth-child(2)'));
    allowStart = true;
    await click(document.querySelector('.scheduler-block.state-scheduled'));
    await click([...document.querySelectorAll('.queue-detail-actions button')].find(node => /Start work|Empezar trabajo/.test(node.textContent)));
    await click(document.querySelector('.queue-create-modal .scheduler-primary'));
    checks['Starting closes sidebar while request is pending'] = !document.querySelector('.queue-request-rail') && Boolean(document.querySelector('.scheduler-block.is-pending-action .queue-item-loading'));
    await act(async () => { releaseStart(); await new Promise(resolve => setTimeout(resolve, 50)); });
    checks['Start updates state without reload'] = document.querySelectorAll('.scheduler-block.state-in_progress').length === 2 && !document.querySelector('.scheduler-block.is-pending-action');
    await click(document.querySelector('.scheduler-block.state-in_progress'));
    await click([...document.querySelectorAll('.queue-detail-actions button')].find(node => /Mark complete|Marcar como completado/.test(node.textContent)));
    checks['Completing closes sidebar and updates state'] = !document.querySelector('.queue-request-rail') && Boolean(document.querySelector('.scheduler-block.state-completed'));
    checks['No render or console errors'] = errors.length === 0;

    console.log('\n=== QUEUE SMOKE ===');
    for (const [label, passed] of Object.entries(checks)) console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
    if (errors.length) errors.slice(0, 5).forEach((error) => console.log('ERROR ', error.slice(0, 300)));
    process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
  } catch (error) {
    for (const [label, passed] of Object.entries(checks)) console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
    console.log('QUEUE HARNESS ERROR:', String(error?.stack || error).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g, '<bundled-smoke>'));
    process.exit(1);
  }
})();
