export const LAUNCH_VERSION = 'sentient-bot-v1';

const acknowledged = new Set();
export const launchStorageKey = uid => typeof uid === 'string' && uid.length > 0 && uid.length <= 200
  ? `sentient.pet.launch.${LAUNCH_VERSION}.${uid}` : null;

export function isLaunchSeen(uid) {
  const key = launchStorageKey(uid);
  if (!key) return true;
  try { return localStorage.getItem(key) === 'seen' || acknowledged.has(key); }
  catch { return acknowledged.has(key); }
}

export function markLaunchSeen(uid) {
  const key = launchStorageKey(uid);
  if (!key) return;
  acknowledged.add(key);
  try { localStorage.setItem(key, 'seen'); } catch { /* Keep dismissal for this visit when browser storage is unavailable. */ }
}
