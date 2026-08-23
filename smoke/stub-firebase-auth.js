export function getAuth() { return { currentUser: { email: 'esteban@sentientagency.io', getIdToken: () => Promise.resolve('tok') } }; }
export class GoogleAuthProvider { setCustomParameters() {} }
export const browserPopupRedirectResolver = {};
export function getRedirectResult() { return Promise.resolve(null); }
export function onAuthStateChanged(auth, cb) {
  cb({ email: 'esteban@sentientagency.io', getIdToken: () => Promise.resolve('tok') });
  return () => {};
}
export function signInWithPopup() { return Promise.resolve(); }
export function signInWithRedirect() { return Promise.resolve(); }
export function signOut() { return Promise.resolve(); }
