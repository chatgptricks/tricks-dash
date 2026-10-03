import { JSDOM } from 'jsdom';
import * as esbuild from 'esbuild';
import path from 'node:path';
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url:'http://localhost/motion', pretendToBeVisual:true });
for (const key of ['window','document','HTMLElement','Element','Node','Event','KeyboardEvent','MouseEvent','CustomEvent','getComputedStyle','localStorage','sessionStorage','MutationObserver']) globalThis[key] = dom.window[key];
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const built = await esbuild.build({ entryPoints:['smoke/motion-entry.jsx'], bundle:true, write:false, format:'esm', platform:'browser', jsx:'automatic', target:'es2022', external:['node:assert/strict'], loader:{'.css':'empty','.png':'dataurl','.jpg':'dataurl','.svg':'dataurl'}, define:{'import.meta.env.BASE_URL':'"/"','import.meta.env.VITE_API_BASE':'"https://api.test"','import.meta.env.DEV':'false','import.meta.env.PROD':'true'}, alias:{'firebase/app':path.resolve('smoke/stub-firebase-app.js'),'firebase/auth':path.resolve('smoke/stub-firebase-auth.js')} });
await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
