import assert from 'node:assert/strict';
import {
  ENGAGEMENT_METRICS, normalizeEngagementAccount, normalizeEngagementAccounts,
  selectEngagementAccounts, parsePositiveNumber, calculatePostCosts,
} from '../src/promoEngagement.js';

const account = (handle, values = {}) => ({
  handle, label: `${handle} Creator`, group: 'creators', followers: 10000,
  followers_captured_at: '2026-10-15T12:00:00Z', post_count: 10,
  engagement_post_count: 8, average_engagements: 125, engagement_rate_pct: 1.25,
  complete_engagement_post_count: 3, average_complete_engagements: 160,
  metrics: {
    likes: { count: 8, total: 800, average: 100 },
    comments: { count: 8, total: 200, average: 25 },
    shares: { count: 4, total: 80, average: 20 },
    saves: { count: 3, total: 30, average: 10 },
    impressions: { count: 2, total: 40000, average: 20000 },
    video_views: { count: 4, total: 40000, average: 10000 },
    video_plays: { count: 4, total: 60000, average: 15000 },
  },
  ...values,
});

for (const input of [null, undefined, '', '   ', false, true, [], {}, NaN, Infinity, -Infinity, -1, '-1', 0, '0', 'Infinity', 'NaN', '$100', '1,000', '0x10', '12a']) {
  assert.equal(parsePositiveNumber(input), null, `Reject invalid or nonpositive number: ${String(input)}`);
}
for (const [input, expected] of [[1, 1], [' 120.50 ', 120.5], ['.5', 0.5], ['1e3', 1000]]) {
  assert.equal(parsePositiveNumber(input), expected);
}

const source = account('@alpha', { followers: '10000', post_count: '10', group: ' creators ' });
const before = structuredClone(source);
const normalized = normalizeEngagementAccount(source);
assert.equal(normalized.handle, 'alpha');
assert.equal(normalized.group, 'creators');
assert.equal(normalized.followers, 10000);
assert.equal(normalized.post_count, 10);
assert.deepEqual(source, before, 'Normalization must not alter source account or metrics');
assert.notEqual(normalized.metrics, source.metrics);
assert.deepEqual(normalizeEngagementAccounts([source, null, {}, { handle: '@' }]).map(item => item.handle), ['alpha']);
assert.deepEqual(normalizeEngagementAccounts(null), []);

const missing = normalizeEngagementAccount({ handle: 'missing' });
for (const name of ENGAGEMENT_METRICS) {
  assert.deepEqual(missing.metrics[name], { count: null, total: null, average: null });
}
assert.equal(missing.followers, null);
assert.equal(missing.post_count, null);
assert.equal(missing.average_engagements, null);
assert.equal(missing.engagement_rate_pct, null);
const zeros = normalizeEngagementAccount({ handle: 'zero', followers: 0, post_count: 0, average_engagements: 0, engagement_rate_pct: 0, metrics: { likes: { count: 1, total: 0, average: 0 } } });
assert.equal(zeros.followers, 0);
assert.equal(zeros.engagement_rate_pct, 0);
assert.deepEqual(zeros.metrics.likes, { count: 1, total: 0, average: 0 }, 'Measured zero is distinct from unknown');
const malformed = normalizeEngagementAccount({ handle: 'invalid', followers: -5, post_count: 1.5, engagement_rate_pct: Infinity, average_engagements: 'bad', metrics: { likes: { count: false, total: -1, average: [] } } });
assert.equal(malformed.followers, null);
assert.equal(malformed.post_count, null);
assert.equal(malformed.engagement_rate_pct, null);
assert.deepEqual(malformed.metrics.likes, { count: null, total: null, average: null });

const calculated = calculatePostCosts(source, '500');
assert.deepEqual(calculated, {
  price: 500, cpe: 4, completeCpe: 3.125,
  costPerLike: 5, costPerComment: 20, costPerShare: 25, costPerSave: 50,
  cpm: 25, costPerThousandViews: 50,
}, 'Use each metric average over its own sample, never its total or overall post count');
assert.equal(calculatePostCosts(source, 500, { impressions: 50000 }).cpm, 10);
assert.equal(calculatePostCosts(source, 500, { impressions: undefined }).cpm, 25);
for (const impressions of [null, '', 0, -1, NaN, Infinity, {}, false]) {
  assert.equal(calculatePostCosts(source, 500, { impressions }).cpm, null, 'An explicitly invalid impression override cannot silently use another denominator');
}
for (const price of [null, undefined, '', false, 0, -100, NaN, Infinity, '100x']) {
  const costs = calculatePostCosts(source, price);
  assert.ok(Object.values(costs).every(value => value === null), `Invalid price cannot produce a cost: ${String(price)}`);
}
assert.ok(Object.values(calculatePostCosts(null, 500)).every((value, index) => index === 0 ? value === 500 : value === null));
assert.equal(calculatePostCosts(missing, 500).cpe, null);
assert.equal(calculatePostCosts(zeros, 500).costPerLike, null, 'A real zero is displayed as zero but cannot be a divisor');
const noSamples = account('no-samples', { engagement_post_count: 0, complete_engagement_post_count: null, metrics: { likes: { count: 0, average: 100 }, video_plays: { count: 5, total: 50000, average: 10000 } } });
const noSampleCosts = calculatePostCosts(noSamples, 500);
assert.equal(noSampleCosts.cpe, null);
assert.equal(noSampleCosts.completeCpe, null);
assert.equal(noSampleCosts.costPerLike, null, 'A metric with no observed posts cannot supply a denominator');
assert.equal(noSampleCosts.costPerThousandViews, null, 'Plays cannot substitute for unavailable views');
assert.equal(calculatePostCosts(account('no-views', { metrics: { video_views: { count: 1, total: 0, average: 0 }, video_plays: { count: 5, total: 50000, average: 10000 } } }), 500).costPerThousandViews, null);
assert.equal(calculatePostCosts(source, Number.MAX_VALUE).cpm, Number.MAX_VALUE / 20000 * 1000);
assert.equal(calculatePostCosts(source, Number.MAX_VALUE, { impressions: Number.MIN_VALUE }).cpm, null, 'Do not emit nonfinite costs');
assert.deepEqual(source, before, 'Cost scenarios never persist a price or change source evidence');

const rows = [
  account('zeta', { engagement_rate_pct: null, followers: null, post_count: null, average_engagements: null }),
  account('beta', { engagement_rate_pct: 0, followers: 0, post_count: 0, average_engagements: 0 }),
  account('delta', { engagement_rate_pct: 2, followers: 200, post_count: 20, average_engagements: 200 }),
  account('Alpha', { engagement_rate_pct: 2, followers: 200, post_count: 20, average_engagements: 200, group: 'publishers', label: 'AI Daily' }),
  account('absent', { engagement_rate_pct: undefined, followers: undefined, post_count: undefined, average_engagements: undefined }),
];
const expectedOrder = ['Alpha', 'delta', 'beta', 'absent', 'zeta'];
for (const sort of [undefined, 'engagement_rate', 'engagements', 'followers', 'posts', 'unrecognized']) {
  assert.deepEqual(selectEngagementAccounts(rows, { sort }).map(item => item.handle), expectedOrder, `Descending values, measured zero before null and alphabetic ties: ${sort}`);
  assert.deepEqual(selectEngagementAccounts([...rows].reverse(), { sort }).map(item => item.handle), expectedOrder, 'Ordering is independent of input order');
}
assert.deepEqual(selectEngagementAccounts(rows, { search: '@alpha AI', group: 'PUBLISHERS' }).map(item => item.handle), ['Alpha']);
assert.equal(selectEngagementAccounts(rows, { group: 'all' }).length, rows.length);
assert.equal(selectEngagementAccounts(rows, { group: 'creators' }).length, 4);
assert.deepEqual(selectEngagementAccounts(rows, { search: 'alpha unseen' }), []);
assert.deepEqual(selectEngagementAccounts(null), []);
assert.equal(rows[0].handle, 'zeta', 'Selection must not reorder or mutate source rows');

console.log('PASS Promos engagement: preserved unknowns and zeros, per-metric samples, scenario costs, separate views/plays, search, filters and deterministic ordering');
