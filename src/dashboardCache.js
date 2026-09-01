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
      request.onsuccess = () => resolve(request.result || null);
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
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({ ...snapshot, cachedAt: Date.now() }, DASHBOARD_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
