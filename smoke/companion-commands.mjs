import assert from 'node:assert/strict';
import { parseCommand, suggestCommands } from '../src/companion/commands.js';

const parsed = [
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
  ['/', ['filter', 'research']],
  ['  /', ['filter', 'research']],
  ['\n\t /f', ['filter']],
  ['/RE', ['research']],
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

console.log('PASS Companion commands: explicit per-message modes, exact boundaries, whitespace, unknown commands and command suggestions.');
