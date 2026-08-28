// Shared API plumbing -- used by the main dashboard (App.jsx), the Queue
// board (queue.jsx), and anything else that needs to call Cortex. Kept in
// one module so the request/auth behavior can't drift between entry points.
import { firebaseAuth } from './firebase';

export const IG_HANDLE = 'chatgptricks';
export const API_BASE = (import.meta.env.VITE_API_BASE || 'https://cortex-api-db2e.onrender.com').replace(/\/$/, '');

// Drop-in replacement for fetch() that attaches the signed-in user's Firebase
// ID token to every call. getIdToken() returns the cached token and only
// hits the network to refresh it when it's actually close to expiring, so
// this doesn't add a round-trip to normal usage.
export async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const previewRole = window.localStorage.getItem('sentient.queueRolePreview');
  if (previewRole) headers.set('X-Queue-Role-Preview', previewRole);
  if (firebaseAuth.currentUser) {
    try {
      const token = await firebaseAuth.currentUser.getIdToken();
      headers.set('Authorization', `Bearer ${token}`);
      // Mirrors tracker.html/insights.html: keeps a live token on window so
      // ad-hoc admin/debug calls against this API (e.g. from devtools) don't
      // need their own sign-in flow. Refreshed on every request this app
      // already makes, so it stays current without extra network calls.
      window.__firebaseIdToken = token;
    } catch (error) {
      // Fall through and let the request go out unauthenticated -- the
      // backend will bounce it with a 401 and the login gate will catch it.
    }
  }
  return window.fetch(url, { ...options, headers });
}
