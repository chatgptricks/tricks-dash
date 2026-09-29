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
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  setPersistence,
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
// Make the persistence mode explicit. Firebase defaults to local persistence
// in most browsers, but mobile Safari and embedded webviews can otherwise
// fall back to a session-only store. Keeping this promise shared ensures that
// popup, redirect, and SSO sign-ins all use the same durable storage before
// they start.
export const authPersistenceReady = setPersistence(firebaseAuth, browserLocalPersistence).catch(() => null);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Sign-in that survives mobile browsers.
//
// Popup is the path: it keeps the user on our origin, so Firebase's session
// state stays first-party. It must open inside the click's user activation:
// any await before signInWithPopup (even an already-resolved promise) lets
// Safari and installed iPhone apps block it. Persistence is already set at
// module load, and Firebase queues the sign-in behind it.
//
// A blocked popup is reported, not retried as a redirect: a redirect through
// the separate authDomain fails in browsers that partition third-party
// storage (Safari, Firefox, Brave) with "Using signInWithRedirect in a
// storage-partitioned browser environment". Redirect remains only where a
// popup cannot exist at all (some in-app webviews). getRedirectResult()
// picks that user back up at app start.
const REDIRECT_FALLBACK_CODES = new Set([
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
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
    if (REDIRECT_FALLBACK_CODES.has(code)) {
      await authPersistenceReady;
      await signInWithRedirect(firebaseAuth, googleProvider, browserPopupRedirectResolver);
      return null; // page is navigating away
    }
    return err;
  }
}

const prefersSpanish = () => {
  if (typeof document === 'undefined') return false;
  return String(document.documentElement.lang || navigator.language || '').toLowerCase().startsWith('es');
};

export function describeSignInError(err) {
  const code = err?.code || '';
  if (code === 'auth/unauthorized-domain') {
    return `This domain (${typeof window !== 'undefined' ? window.location.hostname : ''}) isn't authorized in Firebase yet.`;
  }
  if (code === 'auth/popup-blocked') {
    return prefersSpanish()
      ? 'Tu navegador bloqueó la ventana de Google. Permite ventanas emergentes para sentientdash.app y vuelve a intentarlo.'
      : 'Your browser blocked the Google sign-in window. Allow pop-ups for sentientdash.app and try again.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error reaching Google. Check your connection and try again.';
  }
  return code ? `Sign-in failed (${code}). Try again.` : 'Sign-in failed. Try again.';
}
