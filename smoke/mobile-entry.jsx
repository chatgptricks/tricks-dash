import { act } from 'react';

// Fixtures use Queue's calendar day, regardless of the CI host's time zone.
// UTC midnight is still the previous production day in Costa Rica.
const queueDateParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit',
}).formatToParts(new Date()).filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
const day = `${queueDateParts.year}-${queueDateParts.month}-${queueDateParts.day}`;
const task = {
  id: 1, status: 'scheduled', designerEmail: 'user03@example.com', scheduledDate: day,
  scheduledStartMinutes: 600, productionPoints: 3, durationMinutes: 30, priority: 'high', tags: [],
  recommendedAccounts: ['chatgptricks'], post: { account: 'chatgptricks', shortcode: 'ONE', caption: 'Useful AI workflow', type: 'Carousel', coverUrl: '' },
};
const queue = {
  viewer: { email: 'user03@example.com', isAdmin: true, isDev: true, operatingRoles: ['vc', 'pd'], minutesPerPP: 10 },
  date: day, requests: [{ ...task, id: 2, status: 'pool', designerEmail: null, scheduledDate: null, scheduledStartMinutes: null }],
  planningRequests: [task], assignedRequests: [task], pickRequests: [], hotPickRequests: [], liveDrafts: [], liveRevision: 0,
  pendingTicketCount: 1, timeBlocks: [], accounts: [{ handle: 'chatgptricks', label: 'ChatGPTricks' }, { handle: 'unmanaged', label: 'Unmanaged' }, { handle: 'inactive', label: 'Inactive', is_active: false }],
  schedulerUsers: [{ email: 'user03@example.com', displayName: 'User 03', roles: ['vc', 'pd'], avatarUrl: '', accounts: ['chatgptricks', 'inactive'] }],
};
const tracker = { tracking_since: day, accounts: [{ handle: 'chatgptricks', label: 'ChatGPTricks', followers: 100000, delta_1d: { delta: 120 }, delta_7d: { delta: 1200 }, avg_likes_30d: 2200 }] };
const post = { account: 'chatgptricks', shortcode: 'ONE', caption: 'Useful AI workflow', ocrText: 'A better prompt', type: 'Carousel', coverUrl: '', permalink: 'https://instagram.com/p/ONE/', likes: 4200, comments: 32, postDate: `${day}T12:00:00`, group: 'sentient', isHot: true, hotMultiplier: 3.4 };
const ok = (body, headers = {}) => ({ ok: true, status: 200, headers: { get: (key) => headers[String(key).toLowerCase()] || null }, json: async () => body, text: async () => JSON.stringify(body), blob: async () => new Blob(['x']) });
const mediaRequests = [];
const suggestions = [];
const tickets = [
  { id: 89, type: 'post_suggestion', status: 'pending', requesterEmail: 'someoneelse@sentientagency.io', title: 'Another user suggestion', reason: 'Private to the other user', suggestion: { sourceUrl: 'https://example.com/other', account: 'unmanaged' } },
  { id: 88, type: 'post_suggestion', status: 'rejected', requesterEmail: queue.viewer.email, title: 'Rejected suggestion', reason: 'Rejected original idea', reviewNote: 'Please use a more recent source.', reviewerEmail: 'vc@sentientagency.io', reviewedAt: `${day}T12:00:00Z`, suggestion: { sourceUrl: 'https://example.com/rejected', account: 'chatgptricks' } },
  { id: 87, type: 'post_suggestion', status: 'approved', requesterEmail: queue.viewer.email, title: 'Approved suggestion', requestId: 87, suggestion: { sourceUrl: 'https://example.com/approved', account: 'chatgptricks' } },
];
let queueRefreshFailure = false;
let ticketRefreshFailure = true;
const downloads = [];
const downloadBlobs = new Map();
let mediaMode = 'carousel';
let mediaAborted = false;
const anchorClick = window.HTMLAnchorElement.prototype.click;
window.HTMLAnchorElement.prototype.click = function () {
  if (this.download) downloads.push({ name: this.download, blob: downloadBlobs.get(this.href) });
  else anchorClick.call(this);
};
URL.createObjectURL = (blob) => {
  const url = `blob:mobile-download-${downloadBlobs.size + 1}`;
  downloadBlobs.set(url, blob);
  return url;
};
URL.revokeObjectURL = () => {};
const fetchStub = async (url, options = {}) => {
  const value = String(url);
  if (value.includes('/api/dashboard/me')) return ok({ email: 'user03@example.com', is_admin: true, is_dev: true, operating_role: 'vc', operating_roles: ['vc', 'pd'] });
  if (value.includes('/api/dashboard/posts/manifest')) return ok({ revision: 'mobile-smoke', sources: [{ source: 'canonical', upperBound: 1 }, { source: 'dashboard', upperBound: 0 }] }, { etag: '"mobile-smoke"' });
  if (value.includes('/api/dashboard/posts/page')) return ok({ source: 'canonical', afterId: 0, nextCursor: 1, done: true, upperBound: 1, revision: 'mobile-smoke', posts: [post] });
  if (value.includes('/api/dashboard/posts/media')) {
    const params = new URL(value).searchParams;
    mediaRequests.push(params);
    if (params.get('list') === '1') return ok({ source: 'instagram', items: mediaMode === 'single-video'
      ? [{ index: 2, kind: 'video' }]
      : mediaMode === 'single-image' ? [{ index: 1, kind: 'image', filename: '01.jpg' }]
      : [{ index: 1, kind: 'image', filename: '01.jpg' }, { index: 2, kind: 'video' }] });
    if (mediaMode === 'pending') return new Promise((resolve, reject) => {
      const abort = () => { mediaAborted = true; reject(new DOMException('Download cancelled.', 'AbortError')); };
      if (options.signal?.aborted) abort();
      else options.signal?.addEventListener('abort', abort, { once: true });
    });
    if (params.get('only')?.includes(',')) return {
      ...ok({}, { 'content-type': 'application/zip', 'x-slide-count': '2' }),
      blob: async () => new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], { type: 'application/zip' }),
    };
    const video = params.get('only') === '2';
    const type = video ? 'video/mp4' : 'image/jpeg';
    return {
      ...ok({}, { 'content-type': type, ...(video ? {} : { 'content-disposition': 'attachment; filename="slide-one.jpg"' }) }),
      blob: async () => new Blob([video ? 'video bytes' : 'image bytes'], { type }),
    };
  }
  if (value.includes('/api/dashboard/posts')) return ok({ posts: [post], summary: {} });
  if (value.includes('/api/dashboard/accounts')) return ok({ accounts: [{ handle: 'chatgptricks', label: 'ChatGPTricks', group: 'sentient' }] });
  if (value.includes('/api/dashboard/queue/v2/admin-report')) return ok({ totals: {}, designers: [], assignedPosts: [task] });
  if (value.includes('/api/dashboard/queue/v2/tickets/post-suggestion')) {
    const body = Object.fromEntries(new URLSearchParams(options.body));
    suggestions.push(body);
    const ticket = { id: 90, type: 'post_suggestion', status: 'pending', requesterEmail: queue.viewer.email, requestId: null, title: body.source_url, reason: body.reason, requestedAccounts: [body.account], suggestion: { sourceUrl: body.source_url, title: body.title || 'Suggested video', account: body.account, postType: body.post_type } };
    tickets.push(ticket);
    queue.pendingTicketCount += 1;
    queueRefreshFailure = true;
    return ok({ ok: true, request: null, ticket, alreadySubmitted: false, pendingTicketCount: queue.pendingTicketCount });
  }
  if (value.includes('/api/dashboard/queue/v2/tickets')) {
    if (ticketRefreshFailure) return { ...ok({ detail: 'Ticket refresh temporarily unavailable.' }), ok: false, status: 400 };
    return ok({ tickets });
  }
  if (value.includes('/api/dashboard/queue/v2')) {
    if (queueRefreshFailure) return { ...ok({ detail: 'Refresh temporarily unavailable.' }), ok: false, status: 400 };
    return ok({ ...queue });
  }
  if (value.includes('/api/tracker/summary')) return ok(tracker);
  if (value.includes('/api/insights/posts')) return ok({ accounts: [{ handle: 'chatgptricks', group: 'sentient', label: 'ChatGPTricks' }], posts: [{ a: 'chatgptricks', d: `${day}T12:00:00`, l: 4200, c: 32, t: 'Carousel', hot: 1, ocr: 'better prompt workflow artificial intelligence' }] });
  if (value.includes('/api/admin/accounts')) return ok({ accounts: [{ handle: 'chatgptricks', label: 'ChatGPTricks', group: 'sentient', is_active: true, total_posts: 1, hot_threshold: 600 }] });
  if (value.includes('/api/admin/users')) return ok({ users: [{ email: 'user03@example.com', display_name: 'User 03', operating_role: 'vc', operating_roles: ['vc', 'pd'], is_admin: true, slack_user_id: 'U0000000012' }] });
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
const fill = async (node, value) => act(async () => {
  const proto = node.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, value);
  node.dispatchEvent(new window.Event('input', { bubbles: true }));
  node.dispatchEvent(new window.Event('change', { bubbles: true }));
});


(async () => {
  const checks = {};
  const errors = [];
  const oldError = console.error;
  console.error = (...args) => { const message = args.map(String).join(' '); if (!/not wrapped in act/.test(message)) errors.push(message); oldError(...args); };
  try {
    await act(async () => { await import('../src/mobile/main.jsx'); await new Promise((resolve) => setTimeout(resolve, 300)); });
    checks['Mobile shell renders'] = Boolean(document.querySelector('.m-app'));
    checks['Four primary sections render'] = document.querySelectorAll('.m-bottom-nav button').length === 4;
    checks['Research is the landing view'] = document.querySelector('.m-post-grid') !== null;

    const nav = [...document.querySelectorAll('.m-bottom-nav button')];
    checks['Independent Dashboard renders'] = document.querySelectorAll('.m-post-card').length === 1;
    await click(document.querySelector('.m-post-card'));
    const suggestLink = [...document.querySelectorAll('.m-post-detail a')].find((node) => /Suggest a post/.test(node.textContent));
    const researchRoute = suggestLink ? JSON.parse(atob(new URL(suggestLink.href).searchParams.get('r').replace(/-/g, '+').replace(/_/g, '/'))) : {};
    checks['Mobile Research suggestion preserves source identity'] = researchRoute.tab === 'queue' && researchRoute.suggest === post.permalink && researchRoute.sourceAccount === post.account && researchRoute.sourceShortcode === post.shortcode;
    const downloadButton = document.querySelector('.m-post-detail .m-action-grid button');
    checks['Mobile media download action renders'] = /Download media/.test(downloadButton?.textContent || '');
    await click(downloadButton);
    checks['Mobile carousel downloads one ZIP with original image and video'] = downloads.length === 1
      && downloads[0].blob?.type === 'application/zip' && /\.zip$/i.test(downloads[0].name);
    checks['Mobile carousel ZIP requests precisely the listed item indexes'] = mediaRequests.length === 2
      && mediaRequests[0].get('list') === '1'
      && mediaRequests[1].get('only') === '1,2';
    mediaMode = 'single-image';
    await click(downloadButton);
    checks['Mobile single image retains server filename and native image type'] = downloads.length === 2
      && downloads[1].name === 'slide-one.jpg' && downloads[1].blob?.type === 'image/jpeg'
      && mediaRequests.slice(-2).map((params) => params.get('list') || params.get('only')).join('|') === '1|1';
    mediaMode = 'single-video';
    await click(downloadButton);
    checks['Mobile single video downloads one MP4'] = downloads.length === 3
      && downloads[2].blob?.type === 'video/mp4' && /\.mp4$/i.test(downloads[2].name)
      && mediaRequests.slice(-2).map((params) => params.get('list') || params.get('only')).join('|') === '1|2';
    mediaMode = 'pending';
    await click(downloadButton);
    checks['Mobile prevents overlapping media downloads'] = downloadButton.disabled;
    await click(document.querySelector('.m-sheet > header button'));
    checks['Closing the mobile post aborts its download without saving a file'] = mediaAborted
      && downloads.length === 3 && !document.querySelector('.m-post-detail');
    mediaMode = 'carousel';
    await click(document.querySelector('.m-search-row > button'));
    checks['Research advanced filters render'] = /Media/.test(document.body.textContent) && /Minimum likes/.test(document.body.textContent) && /Period/.test(document.body.textContent);
    await click(document.querySelector('.m-sheet > header button'));
    await click(nav[1]);
    checks['Independent Queue renders'] = Boolean(document.querySelector('.m-queue-toolbar')) && Boolean(document.querySelector('.m-task'));
    checks['Queue day map renders'] = Boolean(document.querySelector('.m-day-map')) && Boolean(document.querySelector('.m-day-bar'));
    checks['Mobile Queue is a desktop-directed support view'] = /Open Queue on desktop/.test(document.body.textContent)
      && !document.querySelector('.m-queue-quick');
    const suggestButton = [...document.querySelectorAll('.m-content button')].find((node) => /Suggest a post/.test(node.textContent));
    checks['Mobile Queue offers post suggestions requiring VC approval'] = Boolean(suggestButton) && /Suggestions need VC approval/.test(document.body.textContent);
    await click(suggestButton);
    const suggestionForm = document.querySelector('.queue-suggestion-modal form') || document.querySelector('form[aria-labelledby="queue-suggestion-title"]') || document.querySelector('[role="dialog"] form');
    checks['Suggestion offers only active managed accounts'] = Boolean(suggestionForm) && [...suggestionForm.querySelectorAll('select option')].some((option) => option.value === 'chatgptricks') && ![...suggestionForm.querySelectorAll('select option')].some((option) => ['unmanaged', 'inactive'].includes(option.value));
    await fill(suggestionForm.querySelector('input[type="url"]'), 'https://www.youtube.com/watch?v=workflow');
    await fill(suggestionForm.querySelector('textarea'), 'Adapt this useful walkthrough for our audience.');
    await act(async () => { suggestionForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 150)); });
    checks['Mobile suggestion submits arbitrary source and selected account'] = suggestions.length === 1 && suggestions[0].source_url === 'https://www.youtube.com/watch?v=workflow' && suggestions[0].account === 'chatgptricks' && Boolean(suggestions[0].idempotency_key);
    checks['Pending submission stays successful when refresh fails'] = /Sent for approval/.test(document.body.textContent) && !/Could not (?:send|schedule|add)/.test(document.body.textContent);
    checks['Pending suggestion does not enter mobile agenda or reserve a slot'] = document.querySelectorAll('.m-task').length === 1 && document.querySelectorAll('.m-day-bar').length === 1 && queue.planningRequests.length === 1 && queue.assignedRequests.length === 1;
    queueRefreshFailure = false;
    const viewRequest = [...document.querySelectorAll('dialog button')].find((node) => /View request/.test(node.textContent));
    await click(viewRequest);
    checks['Mobile pending request remains readable when ticket refresh fails'] = /My suggestions/.test(document.querySelector('.m-sheet')?.textContent || '') && /Suggested video/.test(document.querySelector('.m-ticket-list')?.textContent || '') && /Pending/.test(document.querySelector('.m-ticket-list')?.textContent || '') && /@chatgptricks/.test(document.querySelector('.m-ticket-list')?.textContent || '');
    await click(document.querySelector('.m-sheet > header button'));
    ticketRefreshFailure = false;
    await click([...document.querySelectorAll('.m-content button')].find((node) => /My suggestions/.test(node.textContent)));
    checks['Mobile suggestions sheet shows only own requests even for VC'] = document.querySelectorAll('.m-ticket-list article').length === 3 && !/Another user suggestion|Private to the other user/.test(document.querySelector('.m-sheet')?.textContent || '');
    checks['Mobile suggestions tracking preserves review outcomes and notes'] = /Pending/.test(document.querySelector('.m-ticket-list')?.textContent || '') && /Approved/.test(document.querySelector('.m-ticket-list')?.textContent || '') && /Rejected/.test(document.querySelector('.m-ticket-list')?.textContent || '') && /Please use a more recent source/.test(document.querySelector('.m-ticket-list')?.textContent || '');
    checks['Mobile suggestions sheet cannot approve, reject, or block time'] = ![...document.querySelectorAll('.m-sheet button')].some((node) => /^(Approve|Reject|Block time)$/.test(node.textContent.trim()));
    await click(document.querySelector('.m-sheet > header button'));
    checks['Closing pending tracking leaves mobile agenda unchanged'] = document.querySelectorAll('.m-task').length === 1 && queue.pendingTicketCount === 2;
    await click(nav[2]);
    checks['Independent Tracker renders'] = document.querySelectorAll('.m-tracker-row').length === 1 && /100,000/.test(document.body.textContent) && /\+120/.test(document.body.textContent);
    checks['Tracker favorite is first'] = Boolean(document.querySelector('.m-tracker-row:first-child .m-favorite.is-on'));
    await click(nav[3]);
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
    const extractSelect = [...document.querySelectorAll('.m-sheet .m-form select')]
      .find((select) => [...select.options].some((option) => option.value === 'reels'));
    checks['Existing account can choose Reels'] = [...(extractSelect?.options || [])]
      .map((option) => option.value).join('|') === 'posts|reels|both';
    checks['No render errors'] = errors.length === 0;
  } catch (error) {
    const nested = Array.isArray(error?.errors) ? error.errors : [error];
    errors.push(...nested.map((item) => item?.stack || String(item)));
  }
  window.HTMLAnchorElement.prototype.click = anchorClick;
  console.error = oldError;
  console.log(JSON.stringify({ checks, errors }, null, 2));
  process.exit(Object.values(checks).every(Boolean) && !errors.length ? 0 : 1);
})();
