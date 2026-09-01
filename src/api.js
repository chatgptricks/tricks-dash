// Shared API plumbing -- used by the main dashboard (App.jsx), the Queue
// board (queue.jsx), and anything else that needs to call Cortex. Kept in
// one module so the request/auth behavior can't drift between entry points.
import { firebaseAuth } from './firebase';

export const IG_HANDLE = 'chatgptricks';
export const API_BASE = (import.meta.env.VITE_API_BASE || 'https://cortex-api-db2e.onrender.com').replace(/\/$/, '');

const TRANSIENT_GATEWAY_STATUSES = new Set([502, 503, 504]);

function waitForRetry(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    if (!signal) return;
    const abort = () => { window.clearTimeout(timer); reject(new DOMException('Request aborted.', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
  });
}

// Drop-in replacement for fetch() that attaches the signed-in user's Firebase
// ID token to every call. getIdToken() returns the cached token and only
// hits the network to refresh it when it's actually close to expiring, so
// this doesn't add a round-trip to normal usage.
export async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  // Role previews belong to the current top-level browsing context. Using
  // sessionStorage keeps two Queue windows independent while still sharing
  // the selected role between dashboard.html and queue.html in one window.
  const previewRole = window.sessionStorage.getItem('sentient.queueRolePreview');
  if (previewRole) headers.set('X-Queue-Role-Preview', previewRole);
  // Queue uses each person's local production clock. Send the browser's
  // canonical IANA zone with authenticated requests so a Colombian teammate
  // is recognized automatically (America/Bogota) without a manual toggle.
  try {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTimeZone === 'America/Costa_Rica' || browserTimeZone === 'America/Bogota') {
      headers.set('X-Sentient-Time-Zone', browserTimeZone);
    }
  } catch { /* unavailable in a non-browser test environment */ }
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
  // Render can briefly return a gateway error while it swaps a service
  // instance. Retrying safe reads here keeps every tool resilient without
  // repeating mutations such as Queue assignments or imports.
  const method = String(options.method || 'GET').toUpperCase();
  const canRetry = method === 'GET' || method === 'HEAD';
  let lastError;
  for (let attempt = 0; attempt < (canRetry ? 4 : 1); attempt += 1) {
    try {
      const response = await window.fetch(url, { ...options, headers });
      if (!canRetry || !TRANSIENT_GATEWAY_STATUSES.has(response.status) || attempt === 3) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (!canRetry || error?.name === 'AbortError' || attempt === 3) throw error;
      lastError = error;
    }
    await waitForRetry(700 * (2 ** attempt), options.signal);
  }
  throw lastError || new Error('Request failed.');
}
