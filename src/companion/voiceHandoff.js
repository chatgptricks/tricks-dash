import { decodeRouteState } from '../urlCodec';

export const voiceHandoffKey = uid => 'sentient.pet.pendingVoice.' + uid;
const validUid = uid => typeof uid === 'string' && uid.length > 0 && uid.length <= 200;
export function clearVoiceHandoff(uid) {
  if (validUid(uid)) try { sessionStorage.removeItem(voiceHandoffKey(uid)); return true; } catch { /* Optional tab storage. */ }
  return false;
}
function destination(value) {
  try {
    const url = new URL(value, location.origin);
    if (url.origin !== location.origin || url.username || url.password || !/^\/(?:index\.html|mobile\/(?:index\.html)?)?$/.test(url.pathname)) return null;
    const state = decodeRouteState(url.searchParams.get('r')) || Object.fromEntries(url.searchParams);
    const filters = {};
    for (const key of ['q', 'likes', 'comments', 'acc', 'from', 'to', 'sort', 'type', 'promo', 'collab']) {
      const value = String(state[key] ?? '').trim();
      if (!value || (['likes', 'comments', 'promo', 'collab'].includes(key) && value === '0')
        || (key === 'sort' && value === 'newest') || (key === 'type' && value === 'All posts')) continue;
      filters[key] = key === 'acc' ? value.toLowerCase().split(',').sort().join(',') : value;
    }
    return JSON.stringify(filters);
  } catch { return null; }
}

// Only a just-completed automatic filter navigation may create this entry.
// Ordinary saved conversations never request playback on page load.
export function claimVoiceHandoff(uid, pageUrl, now = Date.now()) {
  if (!validUid(uid) || !pageUrl) return null;
  let raw;
  try { raw = sessionStorage.getItem(voiceHandoffKey(uid)); } catch { return null; }
  if (!raw) return null;
  if (!clearVoiceHandoff(uid)) return null;
  try {
    const value = JSON.parse(raw), expected = destination(value.expectedDest), actual = destination(pageUrl);
    if (value.version !== 1 || value.owner !== uid || !Number.isFinite(value.expiresAt)
      || value.expiresAt <= now || value.expiresAt > now + 90_000 || expected === null || expected !== actual
      || typeof value.id !== 'string' || !value.id || value.id.length > 200
      || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 12000
      || typeof value.question !== 'string' || value.question.length > 4000
      || !['en', 'es'].includes(value.language) || !['auto', 'filter', 'research', 'next'].includes(value.mode)) return null;
    return { id: value.id, text: value.text, question: value.question, language: value.language, mode: value.mode };
  } catch { return null; }
}
