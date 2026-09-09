// Firebase persistence is origin-scoped. All product navigation resolves to
// sentientdash.app, so the normal Firebase session already covers Dashboard,
// Queue, Tracker, Insights, Settings and Promos without copying credentials.
//
// Do not mint custom Firebase tokens into a `.sentientdash.app` JavaScript
// cookie. A token readable by every subdomain turns any injected script on one
// host into an account-session takeover across all of them. Subdomains now
// require their own explicit Google sign-in, while first-party tools stay on
// the canonical root origin.
const LEGACY_COOKIE = 'sentient_sso';

export async function trySsoSignIn() {
  clearSsoCookie();
  return false;
}

export function clearSsoCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${LEGACY_COOKIE}=; path=/; max-age=0; secure; samesite=lax`;
  if (window.location.hostname.endsWith('.sentientdash.app')) {
    document.cookie = `${LEGACY_COOKIE}=; path=/; max-age=0; secure; samesite=lax; domain=.sentientdash.app`;
  }
}

export function startSsoRefresh() {
  return () => {};
}
