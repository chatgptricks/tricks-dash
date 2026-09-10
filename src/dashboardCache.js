const DB_NAME = 'sentient-dash-cache';
const STORE_NAME = 'snapshots';
const DASHBOARD_KEY = 'dashboard-v1';
const RESPONSE_CACHE = 'sentient-complete-library-v1';
const RESPONSE_KEY = '/__sentient_complete_library__';
let restoring;

function openCache() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readLegacySnapshot() {
  if (!window.indexedDB) return null;
  const db = await openCache();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(DASHBOARD_KEY);
      request.onsuccess = () => {
        const value = request.result || null;
        // v1 stored the large object graph directly. New snapshots are stored
        // as one JSON value: IndexedDB can persist and restore it far faster
        // than structured-cloning tens of thousands of nested post objects.
        if (typeof value?.payload === 'string') {
          try {
            resolve(JSON.parse(value.payload));
          } catch {
            resolve(null);
          }
          return;
        }
        resolve(value);
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export function readDashboardSnapshot() {
  // Start once per document; auth and React mounting reuse this same read.
  restoring ||= (async () => {
    try {
      const response = await window.caches?.match(RESPONSE_KEY, { cacheName: RESPONSE_CACHE });
      if (response) return await response.json();
    } catch { /* Try the existing IndexedDB snapshot. */ }
    const snapshot = await readLegacySnapshot();
    if (snapshot?.catalogueComplete) void writeDashboardSnapshot(snapshot).catch(() => {});
    return snapshot;
  })();
  return restoring;
}

export async function writeDashboardSnapshot(snapshot) {
  const payload = JSON.stringify({ ...snapshot, cachedAt: Date.now() });
  // Cache Storage is shared by tabs and survives hard reloads. Store the
  // complete response atomically, independently of IndexedDB transaction locks.
  if (window.caches) {
    try {
      const cache = await window.caches.open(RESPONSE_CACHE);
      await cache.put(RESPONSE_KEY, new Response(payload, {
        headers: { 'Content-Type': 'application/json' },
      }));
      restoring = Promise.resolve(snapshot);
      return;
    } catch { /* Storage policy/quota: retain the IndexedDB fallback. */ }
  }
  if (!window.indexedDB) return;
  const db = await openCache();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const request = transaction.objectStore(STORE_NAME).put({ payload }, DASHBOARD_KEY);
      // `request.onsuccess` means IndexedDB accepted the put, not that the
      // transaction became durable. Resolve only after commit so the caller
      // may safely unblur Research and a reload cannot lose the full library.
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || request.error);
      transaction.onabort = () => reject(transaction.error || request.error);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
