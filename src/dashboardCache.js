const DB_NAME = 'sentient-dash-cache';
const STORE_NAME = 'snapshots';
const DASHBOARD_KEY = 'dashboard-v1';

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

export async function readDashboardSnapshot() {
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

export async function writeDashboardSnapshot(snapshot) {
  if (!window.indexedDB) return;
  const db = await openCache();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const payload = JSON.stringify({ ...snapshot, cachedAt: Date.now() });
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
