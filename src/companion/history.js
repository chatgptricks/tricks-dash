// Conversations stay on this device, scoped to the signed-in dashboard user.
import { COMMANDS, sanitizeNextContext } from './commands.js';
// The active ID is tab-local; writing history merges the latest device history
// so starting a chat in another tab does not replace an unrelated conversation.
const MAX_CONVERSATIONS = 30, MAX_MESSAGES = 60, MAX_CONTENT = 8000;
const MAX_HISTORY_CHARS = 1_000_000;
const memoryHistory = new Map(), memoryActive = new Map();
const historyWriteFailed = new Set(), activeWriteFailed = new Set();
const validUid = uid => typeof uid === 'string' && uid.length > 0 && uid.length <= 200;
const validId = id => typeof id === 'string' && /^[a-z\d_-]{1,100}$/i.test(id);
const historyKey = uid => 'sentient.pet.history.' + uid;
const activeKey = uid => 'sentient.pet.active.' + uid;
const legacyKey = uid => 'sentient.pet.chat.' + uid;
const createId = () => globalThis.crypto?.randomUUID?.() || 'chat-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);

function readStorage(kind, key, fallback) {
  try {
    if (!globalThis[kind]) return fallback;
    const raw = globalThis[kind].getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return fallback; }
}

function sanitizeMessages(values) {
  if (!Array.isArray(values)) return [];
  return values.filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-MAX_MESSAGES).map((item, index) => {
    const clean = { id: validId(item.id) ? item.id : 'message-' + index, role: item.role, content: item.content.slice(0, MAX_CONTENT) };
    if (item.failed === true) clean.failed = true;
    if (item.role === 'user' && validId(item.request_id)) clean.request_id = item.request_id;
    if (item.role === 'assistant' && ['en', 'es'].includes(item.language)) clean.language = item.language;
    if (item.role === 'assistant' && ['auto', ...COMMANDS].includes(item.mode)) clean.mode = item.mode;
    const pendingNext = item.role === 'assistant' ? sanitizeNextContext(item.pending_next) : null;
    if (pendingNext) clean.pending_next = pendingNext;
    if (item.role === 'assistant' && Array.isArray(item.sources)) {
      clean.sources = item.sources.slice(0, 10).flatMap(source => {
        if (!source || typeof source.url !== 'string' || source.url.length > 2000) return [];
        try {
          const url = new URL(source.url);
          if (url.origin !== 'https://sentientdash.app' || url.username || url.password) return [];
          return [{ url: url.href, label: typeof source.label === 'string' ? source.label.slice(0, 200) : '', endpoint: typeof source.endpoint === 'string' ? source.endpoint.slice(0, 250) : '', partial: source.partial === true }];
        } catch { return []; }
      });
    }
    return clean;
  });
}

function normalizeEntry(value) {
  if (!value || !validId(value.id)) return null;
  const messages = sanitizeMessages(value.messages);
  if (!messages.length) return null;
  const timestamp = typeof value.updatedAt === 'string' ? Date.parse(value.updatedAt) : NaN;
  return {
    id: value.id,
    title: (typeof value.title === 'string' && value.title.trim() ? value.title : messages.find(item => item.role === 'user')?.content || messages[0].content).replace(/\s+/g, ' ').trim().slice(0, 100),
    updatedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date(0).toISOString(),
    messages,
  };
}

function boundedHistory(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const result = values.map(normalizeEntry).filter(Boolean).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id); return true;
  }).slice(0, MAX_CONVERSATIONS);
  while (result.length > 1 && JSON.stringify(result).length > MAX_HISTORY_CHARS) result.pop();
  while (result.length && result[0].messages.length > 1 && JSON.stringify(result).length > MAX_HISTORY_CHARS) result[0].messages.shift();
  return result;
}

function setActive(uid, conversation) {
  const current = { id: conversation.id, messages: sanitizeMessages(conversation.messages) };
  memoryActive.set(uid, current);
  try {
    sessionStorage.setItem(activeKey(uid), JSON.stringify(current.id));
    // Preserve the legacy key for navigation recovery and existing sessions.
    sessionStorage.setItem(legacyKey(uid), JSON.stringify(current.messages));
    activeWriteFailed.delete(uid);
  } catch { activeWriteFailed.add(uid); }
  return current;
}

function writeHistory(uid, entries) {
  const next = boundedHistory(entries);
  memoryHistory.set(uid, next);
  try { localStorage.setItem(historyKey(uid), JSON.stringify(next)); historyWriteFailed.delete(uid); }
  catch { historyWriteFailed.add(uid); }
  return next;
}

export function listConversations(uid) {
  if (!validUid(uid)) return [];
  if (historyWriteFailed.has(uid)) return boundedHistory(memoryHistory.get(uid) || []);
  return boundedHistory(readStorage('localStorage', historyKey(uid), memoryHistory.get(uid) || []));
}

export function newConversation(uid) {
  const conversation = { id: createId(), messages: [] };
  return validUid(uid) ? setActive(uid, conversation) : conversation;
}

export function saveConversation(uid, conversation) {
  if (!validUid(uid) || !conversation || !validId(conversation.id)) return listConversations(uid);
  const current = setActive(uid, conversation);
  const history = listConversations(uid);
  if (!current.messages.length) return history;
  const previous = history.find(item => item.id === current.id);
  const unchanged = previous && JSON.stringify(previous.messages) === JSON.stringify(current.messages);
  const entry = normalizeEntry({ ...current, title: previous?.title, updatedAt: unchanged ? previous.updatedAt : new Date().toISOString() });
  return writeHistory(uid, [entry, ...history.filter(item => item.id !== current.id)]);
}

export function loadConversation(uid) {
  if (!validUid(uid)) return { id: createId(), messages: [] };
  const history = listConversations(uid);
  const cached = memoryActive.get(uid);
  if (activeWriteFailed.has(uid) && cached) return { id: cached.id, messages: sanitizeMessages(cached.messages) };
  const activeId = readStorage('sessionStorage', activeKey(uid), cached?.id);
  const messages = sanitizeMessages(readStorage('sessionStorage', legacyKey(uid), cached?.messages));
  if (validId(activeId)) {
    const existing = history.find(item => item.id === activeId);
    // Session messages are the current tab's latest copy, including a reply
    // whose history write could not fit in device storage.
    return setActive(uid, { id: activeId, messages: messages.length ? messages : existing?.messages || [] });
  }
  const conversation = { id: createId(), messages };
  if (messages.length) saveConversation(uid, conversation);
  else setActive(uid, conversation);
  return conversation;
}

export function deleteConversation(uid, id) {
  if (!validUid(uid) || !validId(id)) return listConversations(uid);
  const next = writeHistory(uid, listConversations(uid).filter(item => item.id !== id));
  const activeId = activeWriteFailed.has(uid) ? memoryActive.get(uid)?.id : readStorage('sessionStorage', activeKey(uid), memoryActive.get(uid)?.id);
  if (activeId === id) newConversation(uid);
  return next;
}
