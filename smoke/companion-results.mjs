import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { encodeRouteState } from '../src/urlCodec.js';
import { extractPostResults, postKeyFromUrl, saveResults, loadResults, clearResults } from '../src/companion/results.js';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://sentientdash.app/companion.html', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'sessionStorage']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const link = (account, code) => `https://sentientdash.app/index.html?post=${encodeURIComponent(account + ':' + code)}`;
const three = extractPostResults(`[One](https://sentientdash.app/index.html?post=evolving.ai%3ACODE_1)\n[Two](${link('chatgptricks', 'CODE-2')})\n${link('evolving.ai', 'CODE3')}.`);
assert.equal(three.length, 3);
assert.deepEqual(three.map(item => item.account), ['evolving.ai', 'chatgptricks', 'evolving.ai']);
assert.equal(three[2].postKey, 'evolving.ai:CODE3');
assert.equal(extractPostResults(`[One](${three[0].url}) [Duplicate](${three[0].url}) [Queue](https://sentientdash.app/queue.html) [Wrong page](https://sentientdash.app/settings.html?post=example%3ACODE) [Unsafe](https://evil.test/?post=example%3ACODE)`).length, 1);
assert.equal(extractPostResults(Array.from({ length: 12 }, (_, i) => link('account', 'CODE' + i)).join('\n')).length, 10);
assert.equal(postKeyFromUrl('https://sentientdash.app/?r=' + encodeRouteState({ post: 'Evolving.AI:CODE_1' })), 'evolving.ai:CODE_1');
assert.equal(postKeyFromUrl('/mobile/?r=' + encodeRouteState({ post: 'account:CODE' })), 'account:CODE');
assert.equal(postKeyFromUrl('/index.html?r=' + encodeRouteState({ post: 'account:OLD' }) + '&post=account%3ANEW'), 'account:NEW');
for (const unsafe of ['javascript:alert(1)', 'https://sentientdash.app.evil.test/?post=account%3ACODE', 'https://someone@sentientdash.app/?post=account%3ACODE', '/index.html?post=account%3A<script>', '/index.html?r=not-json']) assert.equal(postKeyFromUrl(unsafe), null);

saveResults('one', three);
assert.equal(loadResults('one').length, 3);
assert.equal(loadResults('two').length, 0);
assert.equal(loadResults(null).length, 0);
sessionStorage.setItem('sentient.pet.results.malformed', '{bad');
assert.deepEqual(loadResults('malformed'), []);
sessionStorage.setItem('sentient.pet.results.tampered', JSON.stringify({ version: 1, results: [{ url: 'https://evil.test', account: 'trusted', postKey: 'trusted:CODE' }] }));
assert.deepEqual(loadResults('tampered'), []);
clearResults('one'); assert.deepEqual(loadResults('one'), []);
const realStorage = sessionStorage;
globalThis.sessionStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
saveResults('private', three); assert.equal(loadResults('private').length, 3);
clearResults('private'); assert.deepEqual(loadResults('private'), []);
globalThis.sessionStorage = realStorage;

const bundle = await build({ stdin: { contents: `import {act} from 'react'; import {createRoot} from 'react-dom/client'; import {ResultPills} from './src/companion/ResultPills.jsx'; import {AnswerText} from './src/companion/Companion.jsx'; export {act}; let root; export function mount(props){root=createRoot(document.getElementById('root')); root.render(<ResultPills {...props}/>)} export function answer(props){root=createRoot(document.getElementById('root'));root.render(<div className="chat-message-text"><AnswerText {...props}/></div>)} export function unmount(){root.unmount()}`, loader: 'jsx', resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', target: 'es2022', loader: { '.css': 'empty' } });
const app = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
let clicked = null, dismissed = false;
await app.act(async () => app.mount({ results: three, currentUrl: 'https://sentientdash.app/?r=' + encodeRouteState({ post: three[1].postKey }), locale: 'es', onNavigate: (event, result) => { event.preventDefault(); clicked = result.postKey; }, onDismiss: () => { dismissed = true; } }));
assert.equal(document.querySelector('nav').getAttribute('aria-label'), 'Resultados de tu consulta');
assert.equal(document.querySelectorAll('a').length, 3);
assert.equal(document.querySelector('[aria-current="page"] .pet-result-number').textContent, '2');
assert.equal(document.querySelector('[aria-current="page"] .pet-result-account').textContent, '@chatgptricks');
assert.match(document.querySelector('a').getAttribute('aria-label'), /Resultado 1 · @evolving.ai/);
await app.act(async () => document.querySelectorAll('a')[2].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
assert.equal(clicked, three[2].postKey);
await app.act(async () => document.querySelector('button').click()); assert.equal(dismissed, true);
await app.act(async () => app.unmount());
await app.act(async () => app.mount({ results: three, locale: 'en' }));
assert.equal(document.querySelector('button'), null, 'Inline pills do not render dismissal without a callback');
assert.equal(document.querySelector('nav').getAttribute('aria-label'), 'Your query results');
await app.act(async () => app.unmount());
const ranked = `Top reels:
1. [View post](${link('evolving.ai', 'TOP1')}) — 916,744 likes (published 2025-06-03)
2. [View post](${link('evolving.ai', 'TOP2')}) — 888,153 likes (published 2025-02-10)
3. [View post](${link('evolving.ai', 'TOP3')}) — 809,238 likes (published 2025-07-12)
[Source](https://sentientdash.app/insights.html)`;
let navigated = null;
await app.act(async () => app.answer({ text: ranked, results: extractPostResults(ranked), currentUrl: link('evolving.ai', 'TOP2'), locale: 'en', onNavigate: event => { event.preventDefault(); navigated = event.currentTarget.href; } }));
const answer = document.querySelector('.chat-message-text');
assert.equal(answer.querySelectorAll('.pet-result-pill').length, 3, 'Each ranked result is represented once by an inline pill');
assert.equal(answer.querySelector('.pet-results'), null, 'The answer does not append a separate result list');
for (const [index, likes] of ['916,744', '888,153', '809,238'].entries()) {
  assert.equal(answer.textContent.split(likes + ' likes').length - 1, 1, 'Each like count appears once');
  assert.match(answer.textContent, new RegExp(`${index + 1}\\s*@evolving\\.ai\\s*— ${likes} likes`), 'The like count stays next to its pill');
}
assert.doesNotMatch(answer.textContent, /(?:^|\n)[1-3]\.\s/, 'Pill ordinals replace the original list numbering');
assert.equal(answer.querySelector('[aria-current="page"]').href, link('evolving.ai', 'TOP2'));
assert.equal(answer.querySelectorAll('a:not(.pet-result-pill)').length, 1, 'Other dashboard links remain normal links');
await app.act(async () => answer.querySelectorAll('.pet-result-pill')[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
assert.equal(navigated, link('evolving.ai', 'TOP2'));
await app.act(async () => app.unmount());

const bare = `- ${link('evolving.ai', 'BARE')}. — 12,345 likes
Again: [View post](${link('evolving.ai', 'BARE')})
<script>escaped</script> [Unsafe](https://evil.test/)`;
await app.act(async () => app.answer({ text: bare, results: extractPostResults(bare), locale: 'es' }));
assert.equal(document.querySelectorAll('.pet-result-pill').length, 1, 'Bare and repeated links to the same post share a single pill');
assert.equal(document.querySelector('.pet-result-pill').href, link('evolving.ai', 'BARE'));
assert.match(document.querySelector('.pet-result-pill').getAttribute('aria-label'), /Resultado 1/);
assert.equal(document.querySelector('script'), null);
assert.match(document.querySelector('.chat-message-text').textContent, /<script>escaped<\/script>/);
assert.equal(document.querySelector('a[href^="https://evil.test"]'), null);
await app.act(async () => app.unmount());

for (const text of [
  `[12,000 likes](${link('account', 'LABEL')})`,
  `[12,000 likes](${link('account', 'LABEL')}) — 12,000 likes`,
  `[12.000 me gusta](${link('account', 'LABEL')})`,
]) {
  await app.act(async () => app.answer({ text, results: extractPostResults(text), locale: 'es' }));
  assert.equal(document.querySelectorAll('.pet-result-pill').length, 1);
  const metric = text.includes('me gusta') ? '12.000 me gusta' : '12,000 likes';
  assert.equal(document.querySelector('.chat-message-text').textContent.split(metric).length - 1, 1, 'Metric link labels are preserved next to the pill without repeating the count');
  await app.act(async () => app.unmount());
}

const twelve = Array.from({ length: 12 }, (_, i) => `${i + 1}. [View post](${link('account', 'COUNT' + i)}) — ${100 - i} likes`).join('\n');
await app.act(async () => app.answer({ text: twelve, results: extractPostResults(twelve) }));
assert.equal(document.querySelectorAll('.pet-result-pill').length, 10, 'The ten-result cap matches the floating list');
assert.equal(document.querySelectorAll('a:not(.pet-result-pill)').length, 2, 'Extra links remain accessible when outside the pill cap');
await app.act(async () => app.unmount());
dom.window.close();
console.log('Companion results: internal post extraction, deduplication, 10-result cap, route selection, user isolation, persistence, inline metrics without duplication, dismissal and accessible pills passed.');
process.exit(0);
