import { JSDOM } from 'jsdom';
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://sentientdash.app/', pretendToBeVisual: true });
for (const k of ['window','document','navigator','HTMLElement','Element','Node','Event','KeyboardEvent','MouseEvent','FocusEvent','HTMLInputElement','requestAnimationFrame','cancelAnimationFrame','getComputedStyle','localStorage','sessionStorage','URL','URLSearchParams','FormData','matchMedia','Blob'])
  if (dom.window[k] !== undefined) { try { globalThis[k] = dom.window[k]; } catch {} }
globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
globalThis.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} takeRecords(){return[]} };
globalThis.matchMedia ||= () => ({ matches:false, addEventListener(){}, removeEventListener(){} });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const out = await esbuild.build({
  entryPoints: ['smoke/wizard-entry.jsx'], bundle: true, write: false, format: 'esm', platform: 'browser',
  jsx: 'automatic', target: 'es2022',
  loader: { '.jpg':'dataurl', '.png':'dataurl', '.svg':'dataurl', '.css':'empty' },
  define: { 'import.meta.env.BASE_URL':'"/"', 'import.meta.env.VITE_API_BASE':'"https://api.test"', 'import.meta.env.MODE':'"test"', 'import.meta.env.DEV':'false', 'import.meta.env.PROD':'true' },
  alias: { 'firebase/app': path.resolve('smoke/stub-firebase-app.js'), 'firebase/auth': path.resolve('smoke/stub-firebase-auth.js') },
});
await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
