export * from './stub-firebase-auth.js';

const auth = { currentUser: { email: 'developer@example.test', getIdToken: async () => 'tok' } };
const listeners = new Set();
export function getAuth() { return auth; }
export function onAuthStateChanged(_auth, callback) {
  listeners.add(callback);
  callback(auth.currentUser);
  return () => listeners.delete(callback);
}
globalThis.__setToolTestUser = email => {
  auth.currentUser = email ? { email, getIdToken: async () => 'tok' } : null;
  listeners.forEach(callback => callback(auth.currentUser));
};
