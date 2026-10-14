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

// On Oct 9 these handles swapped identities. Exclude the equal/opposite
// audience transfer, retaining real swap-day movement and raw follower totals.
const renameAccounts = [ours('trends'), ours('em3rging')];
const renameHistories = {
  trends: sequence('2026-10-07', [28690, 28700, 235379, 235389]),
  em3rging: sequence('2026-10-07', [234470, 234465, 28693, 28690]),
};
const originalRenameHistories = JSON.stringify(renameHistories);
const rename = summarize(renameAccounts, renameHistories, '2026-10');
assert.deepEqual(totals(rename), [934, 15, 919], 'the reciprocal identity transfer is excluded, while real movement before, during and after remains');
assert.equal(rename.excludedChanges, 2, 'both known handle transitions are reported');
assert.equal(rename.coveredAccounts, 2, 'rename corrections do not remove either account from coverage');
assert.equal(JSON.stringify(renameHistories), originalRenameHistories, 'correction must not mutate the recorded follower totals');
assert.deepEqual(totals(summarize([ours('trends')], { trends: sequence('2026-10-08', [28700, 235379]) }, '2026-10')), [914, 0, 914], 'trends retains the real gain relative to the former em3rging identity');
assert.deepEqual(totals(summarize([ours('em3rging')], { em3rging: sequence('2026-10-08', [234465, 28693]) }, '2026-10')), [0, 7, -7], 'em3rging retains the real loss relative to the former trends identity');
const swapDay = summarize(renameAccounts, {
  trends: sequence('2026-10-08', [28700, 235379]),
  em3rging: sequence('2026-10-08', [234465, 28693]),
}, '2026-10');
assert.deepEqual(totals(swapDay), [914, 7, 907], 'swap-day signs reflect real movement without the 200k identity spikes');
assert.equal(swapDay.net, (235379 + 28693) - (28700 + 234465), 'equal opposite corrections preserve the raw network net on the swap day');
assert.equal(rename.net, Object.values(renameHistories).reduce((total, rows) => total + rows.at(-1).followers - rows[0].followers, 0), 'the corrected full period preserves the raw network net');

const unrelatedJump = summarize([...renameAccounts, ours('unrelated')], {
  ...renameHistories,
  unrelated: sequence('2026-10-08', [1000, 300000]),
}, '2026-10');
assert.deepEqual(totals(unrelatedJump), [299934, 15, 299919], 'a large change on another account must remain in the monthly total');
assert.equal(unrelatedJump.excludedChanges, 2, 'only the explicit rename events count as exclusions');

const beforeRename = summarize([ours('trends')], { trends: sequence('2026-10-01', [100, 200000]) }, '2026-10');
assert.deepEqual(totals(beforeRename), [199900, 0, 199900], 'large earlier changes on a renamed handle remain untouched');
assert.equal(beforeRename.excludedChanges, 0);
const afterRename = summarize(renameAccounts, {
  trends: sequence('2026-10-10', [235389, 500000]),
  em3rging: sequence('2026-10-10', [28690, 28680]),
}, '2026-10');
assert.deepEqual(totals(afterRename), [264611, 10, 264601], 'later movement on both handles remains untouched, even when large');
assert.equal(afterRename.excludedChanges, 0);

const renameGap = summarize(renameAccounts, {
  trends: [at('2026-10-07', 28690), at('2026-10-10', 235389), at('2026-10-11', 235394)],
  em3rging: [at('2026-10-07', 234470), at('2026-10-10', 28690), at('2026-10-11', 28688)],
}, '2026-10');
assert.deepEqual(totals(renameGap), [939, 17, 922], 'a gap crossing the rename removes each known offset once and preserves residual movement');
assert.equal(renameGap.excludedChanges, 2);
assert.equal(renameGap.partial, true, 'missing rename-day readings still report partial history');

const renameDates = summarize(renameAccounts, {
  trends: [
    { date: '2026-10-09T05:00:00Z', followers: 28700 }, // Oct 8 in Costa Rica.
    { date: '2026-10-09T14:00:00Z', followers: 235379 },
    { date: '2026-10-10T14:00:00Z', followers: 235389 },
  ],
  em3rging: [
    { date: '2026-10-08', followers: 234465 },
    { date: '2026-10-09', followers: 28693 },
    { date: '2026-10-10', followers: 28690 },
  ],
}, '2026-10');
assert.deepEqual(totals(renameDates), [924, 10, 914], 'rename dates use Costa Rica calendar days for timestamps and preserve date-only values');
assert.equal(renameDates.excludedChanges, 2);

const noPreRenameReading = summarize([ours('trends')], { trends: sequence('2026-10-09', [235379, 235389]) }, '2026-10');
assert.deepEqual(totals(noPreRenameReading), [10, 0, 10], 'history starting after the rename must not introduce a correction without a crossing');
assert.equal(noPreRenameReading.excludedChanges, 0);
const nextMonth = monthly.summarize(renameAccounts, {
  trends: sequence('2026-10-31', [250000, 250020, 250010]),
  em3rging: sequence('2026-10-31', [30000, 29995, 29997]),
}, '2026-11', new Date('2026-11-03T20:00:00Z'));
assert.deepEqual(totals(nextMonth), [22, 15, 7], 'the dated correction cannot affect a later calendar month');
assert.equal(nextMonth.excludedChanges, 0);

const reportHistories = {
  ...histories,
  decline: sequence('2026-08-31', [300, 290, 285, ...Array(28).fill(285)]),
  missing: [],
};
const reportAccounts = [
  { ...ours('alpha'), full_name: 'Alpha Studio' },
  ours('beta'), ours('decline'), ours('missing'),
  { ...ours('beta'), label: 'Beta Studio' },
  { handle: 'competitor', group: 'competitors' },
];
const report = monthly.report(reportAccounts, reportHistories, '2026-09', new Date(NOW));
assert.deepEqual(totals(report), [22, 25, -3], 'monthly report uses the same per-account signed aggregation');
assert.deepEqual(Array.from(report.accountStats, account => account.handle), ['beta', 'alpha', 'missing', 'decline'], 'ranking includes each Sentient handle once and sorts by net descending');
assert.equal(report.totalAccounts, 4, 'duplicate accounts and competitors do not inflate report scope');
assert.equal(report.bestAccount.handle, 'beta');
assert.equal(report.bestAccount.label, 'Beta Studio');
assert.equal(report.worstAccount.handle, 'decline');
assert.equal(report.accountStats.find(account => account.handle === 'alpha').label, 'Alpha Studio');
assert.equal(report.totalFollowers, 597, 'report audience sums the last recorded raw follower totals in the selected period');
assert.deepEqual([report.growingAccounts, report.decliningAccounts, report.flatAccounts], [2, 1, 1]);
assert.ok(Math.abs(report.accountStats.find(account => account.handle === 'beta').growthPct - 3.5) < 1e-9, 'growth percent uses the account baseline represented by its corrected net');
const missingStats = report.accountStats.find(account => account.handle === 'missing');
assert.deepEqual([missingStats.gained, missingStats.lost, missingStats.net, missingStats.followers, missingStats.growthPct], [0, 0, 0, null, null], 'accounts without history remain visible with zero movement and unknown audience');
assert.equal(report.series.length, 30, 'a closed-month chart includes every calendar day');
assert.equal(report.series[0].date, '2026-09-01');
assert.equal(report.series.at(-1).date, '2026-09-30');
assert.deepEqual(Array.from(report.series.slice(0, 2), point => [point.gained, point.lost, point.net, point.cumulative]), [[10, 15, -5, -5], [12, 10, 2, -3]]);
assert.equal(report.series.at(-1).cumulative, report.net, 'cumulative chart endpoint equals the monthly net');
for (const metric of ['gained', 'lost', 'net']) {
  assert.equal(report.accountStats.reduce((sum, account) => sum + account[metric], 0), report[metric], `ranking ${metric} sums to the monthly headline`);
  assert.equal(report.series.reduce((sum, point) => sum + point[metric], 0), report[metric], `daily chart ${metric} sums to the monthly headline`);
}

const renameReport = monthly.report(renameAccounts, renameHistories, '2026-10', new Date(NOW));
assert.deepEqual(totals(renameReport), totals(rename), 'report and summarize share rename corrections');
assert.deepEqual([renameReport.series.find(point => point.date === '2026-10-09').gained, renameReport.series.find(point => point.date === '2026-10-09').lost, renameReport.series.find(point => point.date === '2026-10-09').net], [914, 7, 907], 'the daily chart removes the identity exchange while preserving true swap-day movement');
assert.equal(renameReport.series.find(point => point.date === '2026-10-08').net, 5, 'the daily chart retains real movement before the rename');
assert.equal(renameReport.series.find(point => point.date === '2026-10-10').net, 7, 'the daily chart retains real movement after the rename');
assert.equal(renameReport.series.at(-1).cumulative, 919);
assert.equal(renameReport.totalFollowers, 264079, 'corrected growth does not alter the raw audience total');
assert.equal(renameReport.bestAccount.handle, 'trends');
assert.equal(renameReport.worstAccount.handle, 'em3rging');
assert.equal(renameReport.bestAccount.excludedDelta, 205765, 'the renamed growth row exposes the signed identity transfer for its annotation');
assert.equal(renameReport.worstAccount.excludedDelta, -205765, 'the renamed loss row exposes the opposite identity transfer for its annotation');
assert.equal(renameReport.accountStats.reduce((total, account) => total + account.excludedDelta, 0), 0, 'the reciprocal identity corrections cancel at network level');
assert.ok(renameReport.accountStats.every(account => account.gained < 205000 && account.lost < 205000), 'no account movement retains the artificial 200k spike');
assert.ok(renameReport.series.every(point => point.gained < 205000 && point.lost < 205000), 'no daily chart point retains the artificial 200k spike');
assert.ok(report.accountStats.every(account => account.excludedDelta === 0), 'unaffected account rows have no excluded movement');
assert.equal(renameReport.bestAccount.growthPct, 934 / (235389 - 934) * 100, 'rename-aware percentage uses corrected net and current raw audience');

const gapReport = monthly.report(renameAccounts, {
  trends: [at('2026-10-07', 28690), at('2026-10-10', 235389)],
  em3rging: [at('2026-10-07', 234470), at('2026-10-10', 28690)],
}, '2026-10', new Date(NOW));
assert.deepEqual(Array.from(gapReport.series.filter(point => ['2026-10-08', '2026-10-09', '2026-10-10'].includes(point.date)), point => [point.gained, point.lost, point.net]), [[0, 0, 0], [0, 0, 0], [934, 15, 919]], 'gaps create no interpolated growth; corrected observed changes belong to the recorded day');

const reportFuture = monthly.report([ours('alpha')], { alpha: [
  ...currentHistory,
  { date: '2026-10-14T23:00:00Z', followers: 9999 },
  at('2026-10-15', 99999),
] }, '2026-10', new Date(NOW));
assert.equal(reportFuture.series.length, 14, 'current-month chart ends on today in Costa Rica');
assert.equal(reportFuture.series.at(-1).date, '2026-10-14');
assert.equal(reportFuture.totalFollowers, 114, 'future readings cannot inflate the audience total');
assert.equal(reportFuture.series.at(-1).cumulative, 14);
assert.equal(reportFuture.worstAccount, null, 'a report without declining accounts has no biggest loser');
assert.equal(reportFuture.accountStats[0].excludedDelta, 0);
const unknownReport = monthly.report([ours('missing')], {}, '2026-09', new Date(NOW));
assert.deepEqual(totals(unknownReport), [null, null, null], 'report preserves the core unknown-total semantics');
assert.equal(unknownReport.bestAccount, null);
assert.equal(unknownReport.worstAccount, null);
assert.equal(unknownReport.series.at(-1).cumulative, 0, 'unknown data has a zero series ready for display');
const negativeReport = monthly.report([ours('decline'), ours('missing')], reportHistories, '2026-09', new Date(NOW));
assert.equal(negativeReport.bestAccount.handle, 'decline', 'an unknown account cannot outrank a measured account as best performer');

console.log('PASS Tracker monthly aggregation, targeted rename correction, scoped ranking, audience, daily chart and cumulative consistency');
