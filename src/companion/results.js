import { decodeRouteState } from '../urlCodec.js';

// Only the result set explicitly opened by this user is retained. It is
// tab-local so independent searches in other tabs do not replace these pills.
const ORIGIN = 'https://sentientdash.app';
const MAX_RESULTS = 10;
const memory = new Map(), writeFailed = new Set();
const validUid = uid => typeof uid === 'string' && uid.length > 0 && uid.length <= 200;
const storageKey = uid => 'sentient.pet.results.' + uid;
const linkPattern = () => /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)|(https:\/\/sentientdash\.app\/[^\s<>\])"'`]+)/g;

export function postKeyFromUrl(value) {
  if (typeof value !== 'string' || value.length > 6000) return null;
  try {
    const url = new URL(value, ORIGIN);
    if (url.origin !== ORIGIN || url.username || url.password || !/^\/(?:index\.html|mobile\/(?:index\.html)?)?$/.test(url.pathname)) return null;
    const route = url.searchParams.get('r');
    const key = url.searchParams.get('post') ?? (route && route.length <= 4000 ? decodeRouteState(route)?.post : null);
    if (typeof key !== 'string' || !/^[a-z\d_.]{1,64}:[a-z\d_-]{1,100}$/i.test(key)) return null;
    const [account, code] = key.split(':');
    return account.toLowerCase() + ':' + code;
  } catch { return null; }
}

function normalizeResult(value) {
  if (!value || typeof value.url !== 'string') return null;
  const postKey = postKeyFromUrl(value.url);
  if (!postKey) return null;
  const account = postKey.split(':')[0];
  return {
    url: ORIGIN + '/index.html?post=' + encodeURIComponent(postKey),
    postKey,
    account,
    label: typeof value.label === 'string' ? value.label.replace(/\s+/g, ' ').trim().slice(0, 200) : '',
  };
}

function normalizeResults(values) {
  if (!Array.isArray(values)) return [];
  const results = [], seen = new Set();
  for (const value of values.slice(0, 100)) {
    const item = normalizeResult(value);
    if (!item || seen.has(item.postKey)) continue;
    seen.add(item.postKey); results.push(item);
    if (results.length === MAX_RESULTS) break;
  }
  return results;
}

export function extractPostResults(text) {
  if (typeof text !== 'string') return [];
  const values = [];
  for (const match of text.slice(0, 64_000).matchAll(linkPattern())) {
    values.push({ url: (match[2] || match[3]).replace(/[.,!?;:]+$/, ''), label: match[1] || '' });
  }
  return normalizeResults(values);
}

export function saveResults(uid, results) {
  if (!validUid(uid)) return [];
  const next = normalizeResults(results);
  memory.set(uid, next);
  try { sessionStorage.setItem(storageKey(uid), JSON.stringify({ version: 1, results: next })); writeFailed.delete(uid); }
  catch { writeFailed.add(uid); }
  return next;
}

export function loadResults(uid) {
  if (!validUid(uid)) return [];
  if (writeFailed.has(uid)) return normalizeResults(memory.get(uid));
  try {
    const raw = sessionStorage.getItem(storageKey(uid));
    if (!raw || raw.length > 60_000) return [];
    const stored = JSON.parse(raw);
    return stored?.version === 1 ? normalizeResults(stored.results) : [];
  } catch { return normalizeResults(memory.get(uid)); }
}

export function clearResults(uid) {
  if (!validUid(uid)) return;
  memory.set(uid, []);
  try { sessionStorage.removeItem(storageKey(uid)); writeFailed.delete(uid); }
  catch { writeFailed.add(uid); }
}
