// Sign-in must never fall back to a cross-domain redirect for a blocked popup:
// that redirect fails in storage-partitioned browsers (Safari, Firefox, Brave).
import assert from 'node:assert/strict';
import path from 'node:path';
import * as esbuild from 'esbuild';

const stub = `
export const calls = [];
export let popupError = null;
export const setPopupError = (error) => { popupError = error; };
export class GoogleAuthProvider { setCustomParameters() {} }
export const browserLocalPersistence = {};
export const browserPopupRedirectResolver = {};
export function getAuth() { return {}; }
export function setPersistence() { return Promise.resolve(); }
export async function signInWithPopup() { calls.push('popup'); if (popupError) throw popupError; }
export async function signInWithRedirect() { calls.push('redirect'); }
`;
const out = await esbuild.build({
  stdin: { contents: "export * from './src/firebase.js'; export { calls, setPopupError } from 'firebase/auth';", resolveDir: path.resolve('.'), loader: 'js' },
  bundle: true, write: false, format: 'esm', platform: 'neutral',
  plugins: [{ name: 'stub', setup(build) {
    build.onResolve({ filter: /^firebase\/(auth|app)$/ }, (args) => ({ path: args.path, namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({ contents: args.path === 'firebase/app' ? 'export const initializeApp = () => ({});' : stub, loader: 'js' }));
  } }],
});
globalThis.document = { documentElement: { lang: 'es' } };
const auth = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

auth.setPopupError(null);
assert.equal(await auth.startGoogleSignIn(), null);
assert.deepEqual(auth.calls.splice(0), ['popup']);

auth.setPopupError({ code: 'auth/popup-blocked' });
const blocked = await auth.startGoogleSignIn();
assert.equal(blocked.code, 'auth/popup-blocked');
assert.deepEqual(auth.calls.splice(0), ['popup'], 'a blocked popup must not redirect');
assert.match(auth.describeSignInError(blocked), /Permite ventanas emergentes/);

auth.setPopupError({ code: 'auth/internal-error' });
assert.equal((await auth.startGoogleSignIn()).code, 'auth/internal-error');
assert.deepEqual(auth.calls.splice(0), ['popup']);

auth.setPopupError({ code: 'auth/operation-not-supported-in-this-environment' });
assert.equal(await auth.startGoogleSignIn(), null);
assert.deepEqual(auth.calls.splice(0), ['popup', 'redirect'], 'no-popup environments still redirect');
console.log('PASS sign-in keeps popups first-party and only redirects where a popup cannot exist');
