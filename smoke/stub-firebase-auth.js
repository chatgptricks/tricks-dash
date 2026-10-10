export function getAuth() { return { currentUser: { email: 'developer@example.test', getIdToken: () => Promise.resolve('tok') } }; }
export class GoogleAuthProvider { setCustomParameters() {} }
export const browserPopupRedirectResolver = {};
export const browserLocalPersistence = {};
export function setPersistence() { return Promise.resolve(); }
export function getRedirectResult() { return Promise.resolve(null); }
export function onAuthStateChanged(auth, cb) {
  cb({ email: 'developer@example.test', displayName: 'Developer', photoURL: 'https://example.test/developer-avatar.png', getIdToken: () => Promise.resolve('tok') });
  return () => {};
}
export function signInWithPopup() { return Promise.resolve(); }
export function signInWithRedirect() { return Promise.resolve(); }
export function signInWithCustomToken() { return Promise.resolve({ user: { email: 'developer@example.test' } }); }
export function signOut() { return Promise.resolve(); }
