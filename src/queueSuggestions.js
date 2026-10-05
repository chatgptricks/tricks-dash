import { API_BASE, apiFetch } from './api';

const handle = value => String(value || '').replace(/^@/, '').trim().toLowerCase();

export function suggestionAccounts(data) {
  const email = String(data?.viewer?.email || '').toLowerCase();
  const person = (data?.schedulerUsers || data?.designers || []).find(user => String(user.email || '').toLowerCase() === email);
  const managed = new Set((person?.accounts || data?.viewer?.accounts || []).map(handle));
  return (data?.accounts || [])
    .filter(account => managed.has(handle(account.handle)) && account.active !== false && account.active !== 0 && account.is_active !== false && account.is_active !== 0 && (!account.group || account.group === 'sentient'))
    .map(account => ({ ...account, handle: handle(account.handle) }))
    .filter((account, index, accounts) => accounts.findIndex(item => item.handle === account.handle) === index)
    .sort((a, b) => a.handle.localeCompare(b.handle));
}

export function suggestionSourceUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) return '';
    return url.href;
  } catch { return ''; }
}

export async function submitQueueSuggestion({ sourceUrl, account, reason, title, postType, idempotencyKey, sourceAccount, sourceShortcode }) {
  const body = new URLSearchParams({ source_url: sourceUrl, account, reason, title: title || '', post_type: postType || 'Image', idempotency_key: idempotencyKey });
  if (sourceAccount && sourceShortcode) {
    body.set('source_account', sourceAccount);
    body.set('source_shortcode', sourceShortcode);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await apiFetch(`${API_BASE}/api/dashboard/queue/v2/tickets/post-suggestion`, { method: 'POST', body, signal: controller.signal });
    let result;
    try { result = await response.json(); } catch { throw new Error('Queue returned an unreadable response. Retry to recover your suggestion.'); }
    if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Could not schedule your suggestion. Please retry.');
    if (!result.request?.id) throw new Error('The assignment could not be confirmed. Retry to recover your suggestion.');
    return result;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Queue took too long to confirm. Retry to recover your suggestion without creating a duplicate.', { cause: error });
    throw error;
  } finally { clearTimeout(timeout); }
}

export function suggestedSlotLabel(request, timeZone = 'America/Costa_Rica', language = 'en') {
  const day = String(request?.scheduledDate || '').split('-').map(Number);
  if (day.length !== 3 || !day.every(Number.isFinite) || request?.scheduledStartMinutes == null) return '';
  // Queue stores schedule minutes in Costa Rica (UTC-6, no DST).
  const date = new Date(Date.UTC(day[0], day[1] - 1, day[2], 6, Number(request.scheduledStartMinutes)));
  return new Intl.DateTimeFormat(language === 'es' ? 'es-CR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date);
}
