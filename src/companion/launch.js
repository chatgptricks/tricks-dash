export const LAUNCH_VERSION = 'sentient-bot-v1';

const preferences = new Map(), writeFailed = new Set();
export const launchStorageKey = uid => typeof uid === 'string' && uid.length > 0 && uid.length <= 200
  ? `sentient.pet.launch.${LAUNCH_VERSION}.${uid}` : null;

export function isLaunchSuppressed(uid) {
  const key = launchStorageKey(uid);
  if (!key) return true;
  if (writeFailed.has(key)) return preferences.get(key) === true;
  // Earlier automatic acknowledgments ('seen') are not an explicit opt-out.
  try { return localStorage.getItem(key) === 'hidden'; }
  catch { return preferences.get(key) === true; }
}

export function setLaunchSuppressed(uid, value) {
  const key = launchStorageKey(uid);
  if (!key) return;
  const hidden = value === true;
  preferences.set(key, hidden);
  try {
    if (hidden) localStorage.setItem(key, 'hidden');
    else localStorage.removeItem(key);
    writeFailed.delete(key);
  } catch { writeFailed.add(key); }
}
