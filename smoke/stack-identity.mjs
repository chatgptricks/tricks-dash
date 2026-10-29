// Mounted components with a fixture-only API and clipboard; never contacts production.
import { JSDOM } from 'jsdom';
import * as esbuild from 'esbuild';
import path from 'node:path';

const dom = new JSDOM('<!doctype html><html><head><title>Stack identity</title></head><body></body></html>', {
  url: 'https://dashboard.example.test/', pretendToBeVisual: true,
});
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'localStorage']) {
  if (dom.window[key] !== undefined) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
globalThis.matchMedia = window.matchMedia;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__SMOKE__ = true;

const result = await esbuild.build({
  entryPoints: ['smoke/stack-identity-entry.jsx'], bundle: true, write: false, format: 'esm', platform: 'browser',
  jsx: 'automatic', target: 'es2022',
  loader: { '.jpg': 'dataurl', '.png': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
  define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.VITE_API_BASE': '"https://api.test"', 'import.meta.env.MODE': '"test"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
  alias: { 'firebase/app': path.resolve('smoke/stub-firebase-app.js'), 'firebase/auth': path.resolve('smoke/stub-firebase-auth.js') },
});
try {
  await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  dom.window.close();
}
// React's browser scheduler retains its MessageChannel in this Node harness.
process.exit(process.exitCode || 0);
