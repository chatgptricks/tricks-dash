import { JSDOM } from 'jsdom';
import * as esbuild from 'esbuild';
import path from 'node:path';

const dom = new JSDOM('<!doctype html><html><head><title>Sentient Dash</title></head><body><div id="root"></div></body></html>', { url: 'https://sentientdash.app/mobile/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'history', 'location', 'HTMLElement', 'Element', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'localStorage', 'sessionStorage', 'URL', 'URLSearchParams', 'Blob', 'FormData']) {
  if (dom.window[key] !== undefined) { try { globalThis[key] = dom.window[key]; } catch {} }
}
globalThis.addEventListener = dom.window.addEventListener.bind(dom.window);
globalThis.removeEventListener = dom.window.removeEventListener.bind(dom.window);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
globalThis.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
dom.window.matchMedia = globalThis.matchMedia;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const build = await esbuild.build({
  entryPoints: ['smoke/mobile-entry.jsx'], bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', target: 'es2022',
  loader: { '.jpg': 'dataurl', '.png': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
  define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.VITE_API_BASE': '"https://api.test"', 'import.meta.env.MODE': '"test"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
  alias: { 'firebase/app': path.resolve('smoke/stub-firebase-app.js'), 'firebase/auth': path.resolve('smoke/stub-firebase-auth.js') },
});
await import(`data:text/javascript;base64,${Buffer.from(build.outputFiles[0].text).toString('base64')}`);
