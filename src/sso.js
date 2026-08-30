// Single sign-on across the dashboard, the Queue board, and the standalone
// tracker/insights pages -- everything lives under *.sentientdash.app, but
// Firebase's own session persistence (IndexedDB/localStorage) is strictly
// per-origin, so a user signed in on the dashboard still hits a fresh Google
// prompt on hot.sentientdash.app or /queue.html. This bridges that gap with
// a small, short-lived bootstrap credential shared via a root-domain cookie:
//
// 1. After any successful sign-in, mint a Firebase custom token (tied to the
//    caller's own uid, via POST /api/auth/custom-token) and store it in a
//    Domain=.sentientdash.app cookie.
// 2. On load, any page with no local Firebase session but a valid cookie
//    silently exchanges it for a real session via signInWithCustomToken()
//    before ever showing the "Sign in with Google" screen.
//
// The cookie only ever carries a short-lived custom token (never a password
// or long-lived credential), and it's re-minted periodically while a tab is
// open so a long visit doesn't run out mid-session.
import { signInWithCustomToken } from 'firebase/auth';
import { authPersistenceReady, firebaseAuth } from './firebase';
import { API_BASE } from './api';

const COOKIE_NAME = 'sentient_sso';
const COOKIE_MAX_AGE_S = 45 * 60; // re-minted well before Firebase's own ~1h custom-token expiry
const REFRESH_INTERVAL_MS = 20 * 60 * 1000;

function cookieDomain() {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  // Only scope the cookie to the shared root domain on the real deployment --
  // local dev (localhost) can't set a .sentientdash.app cookie anyway, and
  // trying to would just make the cookie silently fail to write.
  return host.endsWith('sentientdash.app') ? '.sentientdash.app' : '';
}

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name, value, maxAgeSeconds) {
  const domain = cookieDomain();
  let cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; secure; samesite=lax`;
  if (domain) cookie += `; domain=${domain}`;
  document.cookie = cookie;
}

function clearCookie(name) {
  const domain = cookieDomain();
  let cookie = `${name}=; path=/; max-age=0; secure; samesite=lax`;
  if (domain) cookie += `; domain=${domain}`;
  document.cookie = cookie;
}

// Mints a fresh custom token for the currently signed-in user and stores it
// in the shared cookie. Best-effort: a failed mint just means the next page
// falls back to a normal Google sign-in instead of silently reusing a session.
export async function publishSsoCookie() {
  const user = firebaseAuth.currentUser;
  if (!user) return;
  try {
    const idToken = await user.getIdToken();
    const response = await fetch(`${API_BASE}/api/auth/custom-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!response.ok) return;
    const { customToken } = await response.json();
    if (customToken) writeCookie(COOKIE_NAME, customToken, COOKIE_MAX_AGE_S);
  } catch {
    // ignore -- see comment above
  }
}

// Tries to silently sign in using the shared cookie, if one exists. Returns
// true once the attempt (successful or not) is finished, so callers know
// they've done everything they can before falling back to the login screen.
export async function trySsoSignIn() {
  await authPersistenceReady;
  const token = readCookie(COOKIE_NAME);
  if (!token) return false;
  try {
    await signInWithCustomToken(firebaseAuth, token);
  } catch {
    clearCookie(COOKIE_NAME);
  }
  return true;
}

export function clearSsoCookie() {
  clearCookie(COOKIE_NAME);
}

// Keeps the cookie fresh for as long as this tab stays open and signed in.
// Returns a cleanup function for a useEffect.
export function startSsoRefresh() {
  publishSsoCookie();
  const id = setInterval(publishSsoCookie, REFRESH_INTERVAL_MS);
  return () => clearInterval(id);
}
