import { JSDOM } from 'jsdom';
import * as esbuild from 'esbuild';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://sentientdash.app/', pretendToBeVisual: true,
});
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'localStorage', 'sessionStorage']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
try {
  const output = await esbuild.build({
    entryPoints: ['smoke/recovery-entry.jsx'], bundle: true, write: false,
    format: 'esm', platform: 'browser', jsx: 'automatic', target: 'es2022',
    external: ['node:assert/strict'], loader: { '.css': 'empty' },
  });
  await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { dom.window.close(); }
// React's browser scheduler retains a MessagePort under jsdom.
process.exit(process.exitCode || 0);
