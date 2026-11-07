import assert from 'node:assert/strict';
import { parseCommand, suggestCommands, sanitizeNextContext, pendingNextContext } from '../src/companion/commands.js';

const parsed = [
  ['/next', { mode: 'next', query: '' }],
  [' /NEXT  reel para @chatgptricks ', { mode: 'next', query: 'reel para @chatgptricks' }],
  ['/nextish posts', { mode: 'auto', query: '/nextish posts' }],
  ['/next/post', { mode: 'auto', query: '/next/post' }],
  ['/filter posts about Elon Musk', { mode: 'filter', query: 'posts about Elon Musk' }],
  ['  /FILTER  posts with more than 5000 likes  ', { mode: 'filter', query: 'posts with more than 5000 likes' }],
  ['/research latest post from evolving.ai', { mode: 'research', query: 'latest post from evolving.ai' }],
  ['\n\t/ReSeArCh\n top three reels\nfrom evolving.ai\t', { mode: 'research', query: 'top three reels\nfrom evolving.ai' }],
  ['/filter\tcarousels', { mode: 'filter', query: 'carousels' }],
  ['/research\u00a0newest promos', { mode: 'research', query: 'newest promos' }],
  ['/filter', { mode: 'filter', query: '' }],
  ['/research \n\t', { mode: 'research', query: '' }],
  ['/filter /research latest posts', { mode: 'filter', query: '/research latest posts' }],
  ['  ordinary question  ', { mode: 'auto', query: 'ordinary question' }],
  ['Compare /filter and /research', { mode: 'auto', query: 'Compare /filter and /research' }],
  [' /filtering posts ', { mode: 'auto', query: '/filtering posts' }],
  ['/researcher latest posts', { mode: 'auto', query: '/researcher latest posts' }],
  ['/filter: latest posts', { mode: 'auto', query: '/filter: latest posts' }],
  ['/research/posts', { mode: 'auto', query: '/research/posts' }],
  ['/unknown posts', { mode: 'auto', query: '/unknown posts' }],
  ['/', { mode: 'auto', query: '/' }],
  ['', { mode: 'auto', query: '' }],
  [null, { mode: 'auto', query: '' }],
];
for (const [value, expected] of parsed) assert.deepEqual(parseCommand(value), expected, `Parse ${JSON.stringify(value)}`);

const suggestions = [
  ['/', ['filter', 'research', 'next']],
  ['  /', ['filter', 'research', 'next']],
  ['\n\t /f', ['filter']],
  ['/RE', ['research']],
  ['/n', ['next']],
  ['/NEXT', ['next']],
  ['/next ', []],
  ['/filter', ['filter']],
  ['/RESEARCH', ['research']],
  ['/filter ', []],
  ['/research\t', []],
  ['/research\n', []],
  ['/filter likes', []],
  ['/research\nlatest posts', []],
  ['/filterx', []],
  ['/rubbish', []],
  ['use /f', []],
  ['//f', []],
  ['/ré', []],
  ['', []],
  [undefined, []],
];
for (const [value, expected] of suggestions) assert.deepEqual(suggestCommands(value), expected, `Suggest ${JSON.stringify(value)}`);

const clarification = { post_format: null, target_account: 'ChatGPT Tricks' };
const nextMessages = [{ role: 'user', content: '/next' }, { role: 'assistant', content: 'Which format?', pending_next: clarification }];
assert.deepEqual(sanitizeNextContext(clarification), clarification);
assert.deepEqual(sanitizeNextContext({ ...clarification, extra: 'ignored' }), clarification);
for (const option_count of [1, 5, 10]) {
  const counted = { ...clarification, option_count };
  assert.deepEqual(sanitizeNextContext({ ...counted, extra: 'ignored' }), counted, 'Supported counts survive without arbitrary metadata');
}
for (const option_count of [undefined, null, true, false, '5', 0, -1, 11, 1.5, NaN, Infinity]) {
  assert.equal(sanitizeNextContext({ ...clarification, option_count }), null, 'Counts must be integers from 1 through 10');
}
for (const invalid of [null, [], {}, { post_format: 'video', target_account: null }, { post_format: null, target_account: 'x'.repeat(65) }, { post_format: 'image', target_account: 5 }, { post_format: null, target_account: '' }]) assert.equal(sanitizeNextContext(invalid), null);
assert.deepEqual(pendingNextContext(nextMessages, 'reel'), clarification);
assert.deepEqual(pendingNextContext([...nextMessages, { role: 'user', content: 'reel', failed: true }], 'reel'), clarification, 'Failed replies can retry');
const fiveOptions = { ...clarification, option_count: 5 };
const fiveMessages = [{ role: 'user', content: '/next give me five options' }, { role: 'assistant', content: 'Which format?', pending_next: fiveOptions }];
assert.deepEqual(pendingNextContext(fiveMessages, 'reel'), fiveOptions, 'Answering a clarification preserves the requested number of options');
assert.deepEqual(pendingNextContext([...fiveMessages, { role: 'user', content: 'reel', failed: true }], 'reel'), fiveOptions, 'Retry preserves the requested number of options');
assert.equal(pendingNextContext(fiveMessages, '/next'), null, 'A fresh explicit request does not inherit a previous count');
assert.equal(pendingNextContext(nextMessages, '/research newest post'), null);
assert.equal(pendingNextContext(nextMessages, '/unknown'), null);
assert.equal(pendingNextContext(nextMessages, '/next'), null, 'Explicit next starts fresh');
assert.equal(pendingNextContext([...nextMessages, { role: 'assistant', content: 'Here is your recommendation' }], 'another one'), null, 'Completed responses cannot revive old slots');
assert.equal(pendingNextContext([...nextMessages, { role: 'user', content: '/research newest post', failed: true }], 'reel'), null, 'A newer explicit shortcut leaves the old clarification even when it fails');

console.log('PASS Companion commands: explicit per-message modes, exact boundaries, whitespace, unknown commands and command suggestions.');
