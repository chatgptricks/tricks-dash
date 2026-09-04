import { API_BASE, apiFetch } from './api';

export function userProfileDraft(person) {
  return {
    display_name: String(person.display_name ?? person.email?.split('@')[0] ?? '').trim(),
    operating_role: person.operating_role || 'pd',
    time_zone: person.time_zone || '',
    minutes_per_pp: person.minutes_per_pp === '' || person.minutes_per_pp == null ? '' : String(Number(person.minutes_per_pp)),
    slack_user_id: String(person.stored_slack_user_id ?? person.slack_user_id ?? '').trim().toUpperCase(),
    role: person.role === 'admin' || person.is_admin ? 'admin' : 'viewer',
  };
}

export function mergeUserDrafts(previous, people, drafts, savedEmail = '') {
  return Object.fromEntries(people.map((person) => {
    const draft = drafts[person.email];
    const baseline = previous[person.email];
    const dirty = baseline && draft && Object.keys(baseline).some((field) => String(draft[field] ?? '') !== String(baseline[field] ?? ''));
    return [person.email, person.email !== savedEmail && dirty ? draft : userProfileDraft(person)];
  }));
}

function profileMatches(people, email, expected) {
  const person = people?.find((item) => item.email === email);
  if (!person) return false;
  const actual = userProfileDraft(person);
  return Object.keys(expected).every((field) => actual[field] === expected[field]);
}

async function boundedRequest(fetcher, url, options, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DOMException('Request timed out.', 'TimeoutError'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const response = await fetcher(url, { ...options, signal: controller.signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail) ? body.detail.map((item) => item.msg).join('; ') : '';
        const error = new Error(detail || `The server could not save the change (HTTP ${response.status}).`);
        error.status = response.status;
        throw error;
      }
      return body;
    })()]);
  } finally {
    clearTimeout(timer);
  }
}

export async function saveUserProfile(person, { fetcher = apiFetch, onStatus, timeoutMs = 20000 } = {}) {
  const email = String(person.email || '').trim().toLowerCase();
  const expected = userProfileDraft(person);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (!expected.display_name) throw new Error('Display name cannot be blank.');
  if (!['pd', 'vc', 'sales', 'trainee'].includes(expected.operating_role)) throw new Error('Choose a valid Queue role.');
  if (!['', 'America/Costa_Rica', 'America/Bogota'].includes(expected.time_zone)) throw new Error('Choose Costa Rica, Colombia, or the automatic time zone.');
  if (expected.slack_user_id && !/^U[A-Z0-9]{8,20}$/.test(expected.slack_user_id)) throw new Error('Enter a valid Slack user ID starting with U, or leave it blank.');
  if (expected.minutes_per_pp !== '' && (!Number.isInteger(Number(expected.minutes_per_pp)) || Number(expected.minutes_per_pp) < 1 || Number(expected.minutes_per_pp) > 240)) {
    throw new Error('Minutes per PP must be a whole number between 1 and 240, or blank for the default.');
  }
  const clearFields = ['slack_user_id', 'time_zone', 'minutes_per_pp'].filter((field) => expected[field] === '');
  const body = new URLSearchParams({ email, ...expected, is_admin: String(expected.role === 'admin'), clear_fields: clearFields.join(',') });
  if (expected.minutes_per_pp === '') body.delete('minutes_per_pp');
  onStatus?.('saving');
  try {
    const saved = await boundedRequest(fetcher, `${API_BASE}/api/admin/users`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    }, timeoutMs);
    if (Array.isArray(saved.users) && profileMatches(saved.users, email, expected)) return saved;
  } catch (error) {
    if ([400, 401, 403, 404, 409, 422].includes(error.status)) {
      if (error.status === 401) throw new Error('Your session expired. Sign in again; your draft is still here.');
      if (error.status === 403) throw new Error('Your account cannot make this change. Your draft is still here.');
      throw error;
    }
  }
  onStatus?.('checking');
  try {
    const confirmed = await boundedRequest(fetcher, `${API_BASE}/api/admin/users`, {}, Math.min(timeoutMs, 12000));
    if (Array.isArray(confirmed.users) && profileMatches(confirmed.users, email, expected)) return confirmed;
  } catch {}
  throw new Error('Could not confirm this change with the server. Your draft is kept. Check your connection and choose Retry save.');
}
