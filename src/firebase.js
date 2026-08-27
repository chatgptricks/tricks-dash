// Firebase auth (Google Sign-In), shared by the main dashboard (App.jsx) and
// the standalone Queue page (queue.jsx). Kept in one module so the two Vite
// entry points can't drift into two different sign-in behaviors.
//
// Sentient Dash used to be public-read, gated only by a shared admin password
// for writes. It's now fully private: every visitor has to sign in with a
// Google account on the backend's allowlist before seeing anything. Firebase
// only handles "is this a real Google account" -- the actual allow/deny
// decision happens server-side (ALLOWED_EMAILS), so the frontend never needs
// to know the list itself.
import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  getAuth,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDrtLGrnRJ3cj64sJ6Ykn-yRGtemybzoN0',
  authDomain: 'sentient-dash.firebaseapp.com',
  projectId: 'sentient-dash',
  storageBucket: 'sentient-dash.firebasestorage.app',
  messagingSenderId: '74046012975',
  appId: '1:74046012975:web:02013849972baca1f950da',
};
export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Sign-in that survives mobile browsers.
//
// Popup is still the happy path: it keeps the user on our origin, so Firebase's
// session state stays first-party. But mobile browsers block popups far more
// aggressively than desktop (and some in-app webviews have no window.open at
// all), so when the popup can't open we fall back to a full-page redirect.
// getRedirectResult() picks the user back up when they come back -- callers
// handle that themselves since it needs to run once at app start, not per
// sign-in attempt.
const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
  'auth/internal-error',
]);

export async function startGoogleSignIn() {
  try {
    await signInWithPopup(firebaseAuth, googleProvider, browserPopupRedirectResolver);
    return null;
  } catch (err) {
    const code = err?.code || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return null; // user backed out on purpose
    }
    if (POPUP_FALLBACK_CODES.has(code)) {
      await signInWithRedirect(firebaseAuth, googleProvider, browserPopupRedirectResolver);
      return null; // page is navigating away
    }
    return err;
  }
}

export function describeSignInError(err) {
  const code = err?.code || '';
  if (code === 'auth/unauthorized-domain') {
    return `This domain (${typeof window !== 'undefined' ? window.location.hostname : ''}) isn't authorized in Firebase yet.`;
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error reaching Google. Check your connection and try again.';
  }
  return code ? `Sign-in failed (${code}). Try again.` : 'Sign-in failed. Try again.';
}
