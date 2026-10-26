import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../public/insights-music.js';

const { analyze, classifyAudio, deduplicatePosts, rankTracks } = globalThis.InsightsMusic;
const post = (sc, overrides = {}) => ({ sc, a: 'one', t: 'Video', l: 100, ms: 'Song', ma: 'Artist', ...overrides });

test('collaboration duplicates count once, retain account membership, and keep known metrics and metadata', () => {
  const source = [post('shared', { a: 'two', l: null, ms: null, ma: null }), post('shared', { a: 'one', l: 42, ai: '001234567890123456789', aa: ['three', '@TWO'] })];
  const result = analyze(source);
  assert.equal(result.coverage.totalPosts, 1);
  assert.equal(result.tracks[0].totalLikes, 42);
  assert.equal(result.tracks[0].accountCount, 3);
  assert.deepEqual(result.posts[0].accounts, ['one', 'three', 'two']);
  assert.equal(result.tracks[0].id, '001234567890123456789');
  assert.equal(source[0].l, null, 'inputs must not be mutated');
});

test('different original IDs stay distinct; missing original IDs stay unique even for the same creator', () => {
  const result = analyze([
    post('a', { ms: 'Original audio', ma: 'creator', ai: '100', oa: 1 }),
    post('b', { ms: 'Original audio', ma: 'creator', ai: '200', oa: 1 }),
    post('c', { ms: 'Original audio', ma: 'creator', oa: 1 }),
    post('d', { ms: 'Original audio', ma: 'creator', oa: 1 }),
  ]);
  assert.equal(result.tracks.length, 4);
  assert.equal(result.tracks.find(track => track.id === '100').label, 'Original audio · @creator · #100');
  assert.equal(result.tracks.find(track => track.key === 'original:post:c').label, 'Original audio · @creator · post c');
  assert.equal(result.coverage.originals, 4);
});

test('exact IDs merge renamed audio; fallback songs normalize case, spacing, and accents without merging different artists', () => {
  const result = analyze([
    post('a', { ai: '7', ms: 'First title' }), post('b', { ai: '7', ms: 'Different title' }),
    post('c', { ms: ' CAFÉ   DEL MAR ', ma: ' A ' }), post('d', { ms: 'cafe del mar', ma: 'a' }),
    post('e', { ms: 'Cafe del mar', ma: 'b' }), post('f', { ai: '8', ms: 'Cafe del mar', ma: 'a' }),
  ]);
  assert.equal(result.tracks.length, 4);
  assert.equal(result.tracks.find(track => track.id === '7').postCount, 2);
  assert.equal(result.tracks.find(track => track.key.startsWith('song:') && track.postCount === 2).totalLikes, 200);
});

test('unknown music stays separate; coverage describes missing metadata, not silence', () => {
  const result = analyze([
    post('known'), post('original', { ms: null, ma: null, oa: 1 }),
    post('id-only', { ms: null, ma: null, ai: '99' }),
    post('missing', { ms: null, ma: null }), post('false-only', { ms: null, ma: null, oa: 0 }),
  ]);
  assert.equal(result.coverage.totalPosts, 5);
  assert.equal(result.coverage.detectedAudio, 3);
  assert.equal(result.coverage.namedTracks, 1);
  assert.equal(result.coverage.originals, 1);
  assert.equal(result.coverage.identifiedAudio, 1);
  assert.equal(result.coverage.unknown, 2);
  assert.equal(result.unknownPosts.length, 2);
  assert.equal(result.bestPosts.length, 3);
  assert.match(result.tracks.find(track => track.kind === 'original').label, /@one/);
});

test('unknown likes never become zero, and legitimate zero participates in statistics', () => {
  const result = analyze([post('null', { l: null }), post('empty', { l: '' }), post('zero', { l: 0 }), post('ten', { l: 10 }), post('bad', { l: -4 })]);
  const track = result.tracks[0];
  assert.equal(track.postCount, 5);
  assert.equal(track.knownLikesCount, 2);
  assert.equal(track.totalLikes, 10);
  assert.equal(track.meanLikes, 5);
  assert.equal(track.medianLikes, 5);
  assert.equal(track.maxLikes, 10);
  assert.equal(track.bestPost.sc, 'ten');
  assert.deepEqual(result.bestPosts.map(item => item.sc), ['ten', 'zero']);
  const allUnknown = analyze([post('none', { l: null })]).tracks[0];
  assert.equal(allUnknown.totalLikes, null);
  assert.equal(allUnknown.meanLikes, null);
  assert.equal(allUnknown.medianLikes, null);
  assert.equal(allUnknown.maxLikes, null);
  assert.equal(allUnknown.bestPost, null);
});

test('relative performance uses all provided baseline posts in the same account and format', () => {
  const baselinePosts = [10, 20, 30, 40, 50].map((l, index) => post(`base-${index}`, { l, ms: null, ma: null }));
  baselinePosts.push(...[1000, 2000, 3000, 4000, 5000].map((l, index) => post(`image-${index}`, { l, t: 'Image' })));
  baselinePosts.push(...[1, 2, 3, 4, 5].map((l, index) => post(`other-${index}`, { l, a: 'other' })));
  const result = analyze([post('target', { l: 90 })], { baselinePosts });
  assert.equal(result.tracks[0].relativePerformance, 3);
  assert.equal(result.tracks[0].relativeCount, 1);
  assert.equal(result.baselines.find(row => row.account === 'one' && row.format === 'Video').medianLikes, 30);
});

test('insufficient or zero-median baselines do not produce fabricated performance ratios', () => {
  assert.equal(analyze([post('a'), post('b')]).tracks[0].relativePerformance, null);
  const zeroBaseline = Array.from({ length: 5 }, (_, index) => post(`z-${index}`, { l: 0 }));
  assert.equal(analyze([post('target', { l: 90 })], { baselinePosts: zeroBaseline }).tracks[0].relativePerformance, null);
});

test('top decile includes cutoff ties, needs enough known likes, and counts each unique post once', () => {
  const input = [100, 100, 80, 70, 60, 50, 40, 30, 20, 10].map((l, index) => post(`p-${index}`, { l }));
  input.push(post('unknown-likes', { l: null }), post('p-0', { l: null, a: 'one' }));
  const result = analyze(input);
  assert.equal(result.tracks[0].topPostCount, 2);
  assert.equal(result.tracks[0].topEligibleCount, 10);
  assert.equal(result.coverage.topEligiblePosts, 10);
  assert.equal(result.posts.find(item => item.sc === 'unknown-likes').topEligible, false);
  assert.equal(result.baselines[0].knownLikesCount, 10);
  assert.equal(result.baselines[0].topThreshold, 100);
  assert.equal(result.baselines[0].tiedAtCutoff, true);
  assert.equal(analyze(input.slice(0, 9)).tracks[0].topPostCount, null);
  assert.equal(analyze(input.slice(0, 9)).tracks[0].topEligibleCount, 0);
});

test('zero top-post occurrences differ from missing eligible samples', () => {
  const baselinePosts = Array.from({ length: 10 }, (_, index) => post(`b-${index}`, { l: index + 1 }));
  const result = analyze([post('eligible-not-top', { l: 1 }), post('small-sample', { a: 'other', l: 100, ms: 'Other' })], { baselinePosts, rankBy: 'topPosts' });
  assert.equal(result.tracks[0].topPostCount, 0);
  assert.equal(result.tracks[0].topEligibleCount, 1);
  assert.equal(result.tracks[1].topPostCount, null);
  assert.equal(result.tracks[1].topEligibleCount, 0);
});

test('selected collaborator accounts scope attribution without losing the canonical representative', () => {
  const input = [post('shared', { a: 'one', aa: ['one', 'two'], l: 60 })];
  const baselinePosts = [10, 20, 30, 40, 50].map((l, index) => post(`two-${index}`, { a: 'two', l }));
  baselinePosts.push(...[100, 200, 300, 400, 500].map((l, index) => post(`one-${index}`, { a: 'one', l })));
  const result = analyze(input, { baselinePosts, selectedAccounts: new Set(['two']) });
  assert.equal(result.posts.length, 1);
  assert.deepEqual(result.posts[0].accounts, ['two']);
  assert.equal(result.posts[0].a, 'one');
  assert.equal(result.tracks[0].relativePerformance, 2);
  assert.equal(result.tracks[0].accountCount, 1);
  assert.equal(result.baselines.length, 1);
});

test('a collaborative post contributes one median ratio instead of duplicating a song use', () => {
  const input = [post('shared', { a: 'one', aa: ['one', 'two'], l: 60 })];
  const baselinePosts = [10, 20, 30, 40, 50].map((l, index) => post(`one-${index}`, { a: 'one', l }));
  baselinePosts.push(...[20, 40, 60, 80, 100].map((l, index) => post(`two-${index}`, { a: 'two', l })));
  const result = analyze(input, { baselinePosts });
  assert.equal(result.tracks[0].postCount, 1);
  assert.equal(result.tracks[0].relativePerformance, 1.5);
  assert.equal(result.tracks[0].relativeCount, 1);
});

test('ranking supports all declared metrics and always places missing likes after real zero', () => {
  const tracks = [
    { key: 'unknown', totalLikes: null, meanLikes: null, medianLikes: null, postCount: 5, relativePerformance: null, topPostCount: 0 },
    { key: 'zero', totalLikes: 0, meanLikes: 0, medianLikes: 0, postCount: 4, relativePerformance: 0, topPostCount: 0 },
    { key: 'large', totalLikes: 100, meanLikes: 20, medianLikes: 15, postCount: 3, relativePerformance: 1, topPostCount: 1 },
    { key: 'strong', totalLikes: 90, meanLikes: 90, medianLikes: 90, postCount: 1, relativePerformance: 3, topPostCount: 2 },
  ];
  assert.deepEqual(rankTracks(tracks, 'total').map(track => track.key), ['large', 'strong', 'zero', 'unknown']);
  for (const rank of ['mean', 'median', 'relative', 'topPosts']) assert.equal(rankTracks(tracks, rank)[0].key, 'strong');
  assert.equal(rankTracks(tracks, 'uses')[0].key, 'unknown');
  assert.equal(tracks[0].key, 'unknown', 'ranking must not mutate its input');
});

test('ID-only duplicates do not overwrite a richer label or mix conflicting exact metadata', () => {
  const merged = deduplicatePosts([post('same', { ai: '7', l: 50 }), post('same', { ai: '7', ms: null, ma: null, l: 70 })])[0];
  assert.equal(merged.audio.label, 'Song · Artist');
  assert.equal(merged.likes, 70);
  const conflicting = deduplicatePosts([post('conflict', { ai: '1', ma: null }), post('conflict', { ai: '2', ms: null, ma: 'Wrong Artist' })])[0];
  assert.equal(conflicting.audio.id, '1');
  assert.equal(conflicting.audio.artist, null);
});

test('safe identity preserves numeric strings and rejects already-rounded numeric IDs', () => {
  assert.equal(classifyAudio(post('a', { ai: '001234567890123456789' })).id, '001234567890123456789');
  assert.equal(classifyAudio(post('a', { ai: 123 })).id, '123');
  assert.equal(classifyAudio(post('a', { ai: Number.MAX_SAFE_INTEGER + 1 })).id, null);
  assert.equal(deduplicatePosts([{ u: 'https://www.instagram.com/reel/ABC/?x=1' }, { sc: 'ABC' }]).length, 1);
  const withPermalink = deduplicatePosts([post('ABC', { ai: '1' }), post('ABC', { u: 'https://www.instagram.com/p/ABC/', ms: null })])[0];
  assert.equal(withPermalink.u, 'https://www.instagram.com/p/ABC/');
  assert.equal(deduplicatePosts([{ pl: 400 }, { pl: 400 }]).length, 2, 'video plays are not a post identity');
  assert.equal(analyze([{ oa: 1 }, { oa: 1 }]).tracks.length, 2);
});

test('missing audio ID sentinels do not create fictitious shared audio or inflate coverage', () => {
  const invalid = [0, -0, -1, '0', '000', ' 0 ', '0.0', '-0', '-1', '-100', '', '  ', null, undefined, 'null', 'NULL', 'undefined'];
  const input = invalid.map((ai, index) => post(`missing-${index}`, { ai, ms: null, ma: null, oa: false }));
  const result = analyze(input);
  assert.equal(result.tracks.length, 0);
  assert.equal(result.coverage.detectedAudio, 0);
  assert.equal(result.coverage.unknown, invalid.length);
  assert.ok(result.posts.every(item => item.audio.id === null && item.audio.key === null));
  assert.equal(classifyAudio(post('alphanumeric', { ai: 'audio-1' })).id, 'audio-1', 'Existing alphanumeric identities are not reinterpreted');
  assert.equal(classifyAudio(post('leading-zero', { ai: '00012345678901234567890' })).id, '00012345678901234567890');
});

test('originals with missing-ID sentinels stay separate and named songs use the title/artist fallback', () => {
  const result = analyze([
    post('original-a', { ms: 'Original audio', ma: 'creator', ai: '0', oa: true }),
    post('original-b', { ms: 'Original audio', ma: 'creator', ai: 0, oa: true }),
    post('named-a', { ai: '0' }), post('named-b', { ai: null }),
  ]);
  assert.equal(result.tracks.length, 3);
  const originals = result.tracks.filter(track => track.kind === 'original');
  assert.equal(originals.length, 2);
  assert.ok(originals.every(track => track.id === null && track.postCount === 1 && !track.label.includes('#0')));
  assert.equal(result.tracks.find(track => track.kind === 'named').postCount, 2);
});

test('empty selection has honest empty coverage and null percentages', () => {
  const result = analyze([]);
  assert.deepEqual(result.tracks, []);
  assert.equal(result.coverage.totalPosts, 0);
  assert.equal(result.coverage.audioFraction, null);
  assert.equal(result.coverage.namedFraction, null);
  assert.equal(analyze([post('a')], { selectedAccounts: [] }).coverage.totalPosts, 0);
});
