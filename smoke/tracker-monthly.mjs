import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const NOW = '2026-10-14T20:00:00Z';
class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return Date.parse(NOW); }
}
const context = vm.createContext({ Date: FixtureDate, Intl });
vm.runInContext(fs.readFileSync('public/tracker-monthly.js', 'utf8'), context);
const monthly = context.SentientTrackerMonthly;
assert.ok(monthly, 'the standalone classic script exposes SentientTrackerMonthly');

const ours = handle => ({ handle, group: 'sentient' });
const at = (day, followers) => ({ date: `${day}T14:00:00Z`, followers });
const sequence = (start, values) => values.map((followers, index) => {
  const day = new Date(`${start}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + index);
  return at(day.toISOString().slice(0, 10), followers);
});
const summarize = (accounts, histories, month = '2026-09') => monthly.summarize(accounts, histories, month, new Date(NOW));
const totals = result => [result.gained, result.lost, result.net];

assert.equal(monthly.currentMonth(new Date('2026-10-01T04:00:00Z')), '2026-09', 'calendar months follow Costa Rica midnight');
assert.equal(monthly.currentMonth(new Date('2026-10-01T06:00:00Z')), '2026-10');
assert.equal(monthly.currentMonth(), '2026-10', 'current month defaults to the current instant');

const alpha = sequence('2026-08-31', [100, 110, 105, ...Array(28).fill(105)]);
const beta = sequence('2026-08-31', [200, 195, 207, ...Array(28).fill(207)]);
const histories = {
  alpha,
  beta,
  competitor: sequence('2026-08-31', [1000, ...Array(30).fill(5000)]),
};
const complete = summarize([ours('alpha'), ours('beta'), { handle: 'competitor', group: 'competitors' }], histories);
assert.deepEqual(totals(complete), [22, 10, 12], 'positive and negative changes are split per account before aggregation');
assert.equal(complete.totalAccounts, 2, 'only Sentient accounts belong to the total');
assert.equal(complete.coveredAccounts, 2);
assert.equal(complete.partial, false, 'a closed month with its prior-day baseline and every daily reading is complete');
assert.equal(complete.from, '2026-09-01');
assert.equal(complete.to, '2026-09-30');

const flat = summarize([ours('alpha')], { alpha: sequence('2026-08-31', Array(31).fill(0)) });
assert.deepEqual(totals(flat), [0, 0, 0], 'true flat readings, including zero followers, are measured zeros');
assert.equal(flat.coveredAccounts, 1);
assert.equal(flat.partial, false);

for (const history of [[], [at('2026-09-01', 100)]]) {
  const empty = summarize([ours('alpha')], { alpha: history });
  assert.deepEqual(totals(empty), [null, null, null], 'no comparison must not look like measured zero movement');
  assert.equal(empty.coveredAccounts, 0);
  assert.equal(empty.partial, true);
  assert.equal(empty.from, null);
  assert.equal(empty.to, null);
}

const missingAccount = summarize([ours('alpha'), ours('missing')], { alpha });
assert.deepEqual(totals(missingAccount), [10, 5, 5]);
assert.equal(missingAccount.totalAccounts, 2);
assert.equal(missingAccount.coveredAccounts, 1);
assert.equal(missingAccount.partial, true, 'unloaded or absent account history is visible as partial coverage');

const noBaseline = summarize([ours('alpha')], { alpha: [at('2026-09-01', 100), at('2026-09-02', 115)] });
assert.deepEqual(totals(noBaseline), [15, 0, 15], 'the first recorded count is not itself a follower gain');
assert.equal(noBaseline.partial, true);
assert.equal(noBaseline.from, '2026-09-02');

const priorDay = summarize([ours('alpha')], { alpha: [at('2026-08-31', 100), at('2026-09-01', 115)] });
assert.deepEqual(totals(priorDay), [15, 0, 15], 'the preceding calendar day supplies the first monthly comparison');
assert.equal(priorDay.from, '2026-09-01');
assert.equal(priorDay.partial, true, 'a closed month ending on the first is stale');

const staleBaseline = summarize([ours('alpha')], { alpha: [at('2026-08-30', 100), at('2026-09-01', 200), at('2026-09-02', 210)] });
assert.deepEqual(totals(staleBaseline), [10, 0, 10], 'a gap spanning the month boundary is not entirely attributed to this month');
assert.equal(staleBaseline.from, '2026-09-02');
assert.equal(staleBaseline.partial, true);

const withinMonthGap = summarize([ours('alpha')], { alpha: [at('2026-08-31', 100), at('2026-09-01', 110), at('2026-09-03', 135)] });
assert.deepEqual(totals(withinMonthGap), [35, 0, 35], 'observed changes across an in-month gap are retained without inventing intermediate readings');
assert.equal(withinMonthGap.partial, true);
assert.equal(withinMonthGap.to, '2026-09-03');

const collapse = summarize([ours('alpha')], { alpha: [
  at('2026-09-02', 125),
  { date: '2026-09-02T01:00:00Z', followers: '130' },
  { date: '2026-09-01T01:00:00Z', followers: '110' },
  at('2026-08-31', 100),
  at('2026-09-01', 120),
  { date: '2026-09-02T03:00:00Z', followers: null },
  { date: '2026-09-02T04:00:00Z', followers: '' },
  { date: '2026-09-02T05:00:00Z', followers: 'bad' },
  { date: '2026-09-02T05:10:00Z', followers: Infinity },
  { date: '2026-09-02T05:20:00Z', followers: true },
  { date: 'invalid', followers: 99999 },
] });
assert.deepEqual(totals(collapse), [20, 5, 15], 'out-of-order timestamps collapse to the latest usable reading on each Costa Rica day');
assert.equal(collapse.from, '2026-09-01');
assert.equal(collapse.to, '2026-09-02');

const dateOnly = summarize([ours('alpha')], { alpha: [
  { date: '2026-08-31', followers: '100' },
  { date: '2026-09-01', followers: '107' },
  { date: '2026-09-02', followers: '105' },
] });
assert.deepEqual(totals(dateOnly), [7, 2, 5], 'date-only history values already denote Costa Rica calendar days');
assert.equal(dateOnly.from, '2026-09-01');
assert.equal(dateOnly.to, '2026-09-02');

const currentHistory = sequence('2026-09-30', Array.from({ length: 15 }, (_, index) => 100 + index));
const current = monthly.summarize([ours('alpha')], { alpha: currentHistory }, undefined, new Date(NOW));
assert.deepEqual(totals(current), [14, 0, 14], 'omitting the selected month uses the current Costa Rica month');
assert.equal(current.partial, false, 'current-month coverage ends today, not on the future month end');
assert.equal(current.from, '2026-10-01');
assert.equal(current.to, '2026-10-14');
const staleCurrent = summarize([ours('alpha')], { alpha: currentHistory.slice(0, -1) }, '2026-10');
assert.equal(staleCurrent.partial, true, 'a current month without today’s reading reports stale coverage');

const future = summarize([ours('alpha')], { alpha: [
  ...currentHistory,
  { date: '2026-10-14T23:00:00Z', followers: 9999 },
  at('2026-10-15', 99999),
  at('2026-11-01', 999999),
] }, '2026-10');
assert.deepEqual(totals(future), [14, 0, 14], 'future timestamps, including later today, cannot alter monthly totals');
assert.equal(future.to, '2026-10-14');

const months = Array.from(monthly.months({ alpha: [...alpha, at('2026-11-01', 9999), { date: 'invalid', followers: 1 }] }, new Date(NOW)));
assert.equal(months[0], '2026-10', 'month selection starts with the current month');
assert.ok(months.includes('2026-09'), 'recorded months remain selectable');
assert.equal(months.includes('2026-11'), false, 'future history does not create future month options');
assert.equal(new Set(months).size, months.length, 'month options are unique');
assert.deepEqual(months, [...months].sort().reverse(), 'month options are newest first');

console.log('PASS Tracker Sentient monthly aggregation, per-account signs, calendar boundaries, daily collapse, missing coverage, measured zero and future-data exclusion');
