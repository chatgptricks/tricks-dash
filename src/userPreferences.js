// React side of the server-owned preferences (see public/user-preferences.js).
import '../public/user-preferences.js';
import { onAuthStateChanged } from 'firebase/auth';
import { firebaseAuth } from './firebase';
import { API_BASE, apiFetch } from './api';

let loadedFor = '';
let started = false;

// Idempotent: every entry point may call it; it loads once per signed-in user.
export function syncUserPreferences() {
  if (started) return;
  started = true;
  onAuthStateChanged(firebaseAuth, (user) => {
    const email = String(user?.email || '').toLowerCase();
    if (!email || email === loadedFor) return;
    loadedFor = email;
    window.SentientPreferences?.load({ fetch: apiFetch, base: API_BASE, email });
  });
}

export const savePreference = (key, value) => window.SentientPreferences?.save(key, value);
export const readPreference = (key) => window.SentientPreferences?.get(key);

// Calls `apply(preferences)` whenever the server's values arrive.
export function onServerPreferences(apply) {
  const listener = (event) => apply(event.detail || {});
  window.addEventListener('sentient-preferences', listener);
  return () => window.removeEventListener('sentient-preferences', listener);
}
