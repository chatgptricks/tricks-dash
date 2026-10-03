const DB_NAME = 'sentient-dash-cache';
const STORE_NAME = 'snapshots';
const RESPONSE_CACHE = 'sentient-complete-library-v2';
const restoring = new Map();
const mutations = new Map();
const generations = new Map();
const normaliseOwner = (owner) => String(owner || '').trim().toLowerCase();
const dashboardKey = (owner) => `dashboard-v2:${owner}`;
const responseKey = (owner) => `/__sentient_complete_library_v2__/${encodeURIComponent(owner)}`;
const generationFor = (owner) => generations.get(owner) || 0;

// A sign-out deletion must run after any write already in progress. Otherwise
// a slow cache.put/IndexedDB commit can resurrect that user's private snapshot.
function mutate(owner, operation) {
  const pending = (mutations.get(owner) || Promise.resolve()).catch(() => {}).then(operation);
  mutations.set(owner, pending);
  void pending.finally(() => {
    if (mutations.get(owner) === pending) mutations.delete(owner);
  }).catch(() => {});
  return pending;
}

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

async function readIndexedSnapshot(owner) {
  if (!window.indexedDB) return null;
  const db = await openCache();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(dashboardKey(owner));
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

export function readDashboardSnapshot(owner) {
  owner = normaliseOwner(owner);
  if (!owner) return Promise.resolve(null);
  if (restoring.has(owner)) return restoring.get(owner);
  const generation = generationFor(owner);
  const read = (async () => {
    await mutations.get(owner)?.catch(() => {});
    let snapshot;
    try {
      const response = await window.caches?.match(responseKey(owner), { cacheName: RESPONSE_CACHE });
      if (response) snapshot = await response.json();
    } catch { /* Try this user's IndexedDB snapshot. */ }
    snapshot ||= await readIndexedSnapshot(owner);
    // Legacy unowned caches are deliberately not restored or migrated. Google
    // sign-in alone does not authorize a person to see another user's library.
    return generationFor(owner) === generation && snapshot?.owner === owner ? snapshot : null;
  })();
  restoring.set(owner, read);
  void read.catch(() => { if (restoring.get(owner) === read) restoring.delete(owner); });
  return read;
}

export async function writeDashboardSnapshot(snapshot, owner) {
  owner = normaliseOwner(owner);
  if (!owner) return;
  const generation = generationFor(owner);
  const ownedSnapshot = { ...snapshot, owner, cachedAt: Date.now() };
  const payload = JSON.stringify(ownedSnapshot);
  return mutate(owner, async () => {
    if (generationFor(owner) !== generation) return;
    // Cache Storage is shared by tabs and survives hard reloads. Store the
    // complete response atomically, independently of IndexedDB transaction locks.
    if (window.caches) {
      try {
        const cache = await window.caches.open(RESPONSE_CACHE);
        await cache.put(responseKey(owner), new Response(payload, {
          headers: { 'Content-Type': 'application/json' },
        }));
        if (generationFor(owner) === generation) restoring.set(owner, Promise.resolve(ownedSnapshot));
        return;
      } catch { /* Storage policy/quota: retain the IndexedDB fallback. */ }
    }
    if (!window.indexedDB) return;
    const db = await openCache();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const request = transaction.objectStore(STORE_NAME).put({ payload }, dashboardKey(owner));
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
    if (generationFor(owner) === generation) restoring.set(owner, Promise.resolve(ownedSnapshot));
  });
}

export function clearDashboardSnapshot(owner) {
  owner = normaliseOwner(owner);
  if (!owner) return Promise.resolve();
  generations.set(owner, generationFor(owner) + 1);
  restoring.delete(owner);
  return mutate(owner, async () => {
    try {
      const cache = await window.caches?.open(RESPONSE_CACHE);
      await cache?.delete(responseKey(owner));
    } catch { /* Continue with the independent IndexedDB copy. */ }
    if (!window.indexedDB) return;
    const db = await openCache();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).delete(dashboardKey(owner));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  });
}
