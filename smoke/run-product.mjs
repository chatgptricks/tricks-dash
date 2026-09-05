import { JSDOM } from 'jsdom';
import * as esbuild from 'esbuild';
import path from 'node:path';

const dom = new JSDOM('<!doctype html><html><head><title>t</title></head><body></body></html>', {
  url: 'https://hot.sentientdash.app/', pretendToBeVisual: true,
});
for (const k of ['window','document','HTMLElement','Element','Node','Event','KeyboardEvent','MouseEvent','requestAnimationFrame','cancelAnimationFrame','getComputedStyle','ResizeObserver','IntersectionObserver','localStorage','matchMedia']) {
  if (dom.window[k] !== undefined) { try { globalThis[k] = dom.window[k]; } catch {} }
}
globalThis.ResizeObserver ||= class { observe(){} unobserve(){} disconnect(){} };
globalThis.IntersectionObserver ||= class { observe(){} unobserve(){} disconnect(){} takeRecords(){return[]} };
globalThis.matchMedia ||= () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__SMOKE__ = true;

const out = await esbuild.build({
  entryPoints: ['smoke/product-entry.jsx'], bundle: true, write: false, format: 'esm', platform: 'browser',
  jsx: 'automatic', target: 'es2022',
  loader: { '.jpg': 'dataurl', '.png': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
  define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.VITE_API_BASE': '"https://api.test"', 'import.meta.env.MODE': '"test"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
  alias: { 'firebase/app': path.resolve('smoke/stub-firebase-app.js'), 'firebase/auth': path.resolve('smoke/stub-firebase-auth.js') },
});
const code = out.outputFiles[0].text;
const b64 = Buffer.from(code).toString('base64');
await import('data:text/javascript;base64,' + b64);
