// Shared API plumbing -- used by the main dashboard (App.jsx), the Queue
// board (queue.jsx), and anything else that needs to call Cortex. Kept in
// one module so the request/auth behavior can't drift between entry points.
import { firebaseAuth } from './firebase';

export const IG_HANDLE = 'chatgptricks';
// The diskless parallel backend is the production origin.  Keep the base
// override for local previews and an immediate rollback through a rebuild.
export const API_BASE = (import.meta.env.VITE_API_BASE || 'https://sentientdash-app.onrender.com').replace(/\/$/, '');

const TRANSIENT_GATEWAY_STATUSES = new Set([500, 502, 503, 504]);
const USER_UPSERT_RETRY_ATTEMPTS = 6;

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
  const refreshAuthToken = async (forceRefresh = false) => {
    if (!firebaseAuth.currentUser) return false;
    try {
      const token = await firebaseAuth.currentUser.getIdToken(forceRefresh);
      headers.set('Authorization', `Bearer ${token}`);
      // Mirrors tracker.html/insights.html: keeps a live token on window so
      // ad-hoc admin/debug calls against this API (e.g. from devtools) don't
      // need their own sign-in flow. Refreshed on every request this app
      // already makes, so it stays current without extra network calls.
      window.__firebaseIdToken = token;
      return true;
    } catch (error) {
      // Fall through and let the request go out unauthenticated -- the
      // backend will bounce it with a 401 and the login gate will catch it.
      return false;
    }
  };
  await refreshAuthToken();
  // Render can briefly return a gateway error while it swaps a service
  // instance. Retrying safe reads here keeps every tool resilient without
  // repeating mutations such as Queue assignments or imports. The Users
  // upsert is intentionally included as a narrow exception: it is an
  // idempotent write keyed by email, so retrying it prevents a cold-start,
  // connection handoff, or expired Firebase token from making the
  // Self-assign marker appear broken. It gets a longer window than reads
  // because a Render instance can take more than the old five seconds to
  // become ready after a restart.
  const method = String(options.method || 'GET').toUpperCase();
  const canRetry = method === 'GET' || method === 'HEAD';
  const isIdempotentUserUpsert = method === 'POST' && /\/api\/admin\/users\/?(?:\?|$)/.test(String(url));
  const retryAttempts = isIdempotentUserUpsert ? USER_UPSERT_RETRY_ATTEMPTS : (canRetry ? 4 : 1);
  let lastError;
  for (let attempt = 0; attempt < retryAttempts; attempt += 1) {
    try {
      const response = await window.fetch(url, { ...options, headers });
      const refreshMayRecoverUnauthorizedUserUpsert = isIdempotentUserUpsert && response.status === 401;
      if ((!canRetry && !isIdempotentUserUpsert) || (!TRANSIENT_GATEWAY_STATUSES.has(response.status) && !refreshMayRecoverUnauthorizedUserUpsert) || attempt === retryAttempts - 1) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      if ((!canRetry && !isIdempotentUserUpsert) || error?.name === 'AbortError' || attempt === retryAttempts - 1) throw error;
      lastError = error;
    }
    if (isIdempotentUserUpsert) await refreshAuthToken(true);
    // Keep the final waits bounded: they give Render enough time to accept a
    // request after a handoff without trapping the Settings control forever.
    await waitForRetry(Math.min(800 * (2 ** attempt), 8000), options.signal);
  }
  throw lastError || new Error('Request failed.');
}
