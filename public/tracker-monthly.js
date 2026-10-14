/* Calendar-month follower balances shared by the standalone and mobile Tracker.
   These are observed snapshot changes, not Instagram's gross follows/unfollows. */
(function (root) {
  const timeZone = 'America/Costa_Rica';
  const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  function dayKey(value) {
    // A date-only value already denotes a Tracker calendar day, not UTC midnight.
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const date = new Date(value + 'T12:00:00Z');
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
    }
    if (value == null || value === '') return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const parts = Object.fromEntries(dateFormatter.formatToParts(date).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  const shiftDay = (day, amount) => {
    const date = new Date(day + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  };
  const currentMonth = (now = new Date()) => dayKey(now).slice(0, 7);
  // Confirmed reciprocal handle swap on 2026-10-09. The previous-day
  // audiences differed by 205,765. Remove that equal/opposite identity
  // transfer, preserving real follower movement on the swap day as well.
  const renameDate = '2026-10-09';
  const renameOffsets = new Map([['em3rging', -205765], ['trends', 205765]]);
  function dailyReadings(history, cutoff, now) {
    const days = new Map();
    for (const row of Array.isArray(history) ? history : []) {
      const raw = row?.followers;
      if ((typeof raw !== 'number' && typeof raw !== 'string') || String(raw).trim() === '') continue;
      const followers = Number(raw);
      const day = dayKey(row.date);
      if (!day || day > cutoff || !Number.isFinite(followers) || followers < 0) continue;
      const timestamp = new Date(String(row.date).length === 10 ? row.date + 'T12:00:00Z' : row.date).getTime();
      if (String(row.date).length !== 10 && timestamp > new Date(now).getTime()) continue;
      if (!days.has(day) || timestamp >= days.get(day).timestamp) days.set(day, { day, followers, timestamp });
    }
    return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  }
  function months(histories, now = new Date()) {
    const today = dayKey(now);
    const values = new Set([currentMonth(now)]);
    for (const history of Object.values(histories || {})) {
      for (const row of dailyReadings(history, today, now)) values.add(row.day.slice(0, 7));
    }
    return [...values].sort().reverse();
  }
  function aggregate(accounts, histories, month, now) {
    month = month || currentMonth(now);
    const sentient = [...new Map((accounts || []).filter(account => account.group === 'sentient').map(account => [account.handle, account])).values()];
    const result = { gained: null, lost: null, net: null, totalAccounts: sentient.length, coveredAccounts: 0, partial: false, from: null, to: null, excludedChanges: 0 };
    const accountStats = sentient.map(account => ({ handle: account.handle, label: account.label || account.full_name || account.handle, gained: 0, lost: 0, net: 0, followers: null, growthPct: null, excludedDelta: 0 }));
    const series = [];
    const comparedHandles = new Set();
    const finish = () => {
      accountStats.sort((a, b) => b.net - a.net || String(a.handle).localeCompare(String(b.handle)));
      const eligible = accountStats.filter(account => comparedHandles.has(account.handle));
      let cumulative = 0;
      for (const point of series) {
        point.net = point.gained - point.lost;
        point.cumulative = cumulative += point.net;
      }
      return {
        summary: result,
        accountStats,
        series,
        bestAccount: eligible[0] || null,
        worstAccount: eligible.filter(account => account.net < 0).at(-1) || null,
        totalFollowers: accountStats.reduce((total, account) => total + (account.followers ?? 0), 0),
        growingAccounts: accountStats.filter(account => account.net > 0).length,
        decliningAccounts: accountStats.filter(account => account.net < 0).length,
        flatAccounts: accountStats.filter(account => account.net === 0).length,
      };
    };
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) {
      result.partial = true;
      return finish();
    }
    const start = month + '-01';
    const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0, 12)).toISOString().slice(0, 10);
    const today = dayKey(now);
    const cutoff = today < lastDay ? today : lastDay;
    const baselineDay = shiftDay(start, -1);
    for (let day = start; day <= cutoff; day = shiftDay(day, 1)) series.push({ date: day, gained: 0, lost: 0, net: 0, cumulative: 0 });
    const seriesByDay = new Map(series.map(point => [point.date, point]));
    let gained = 0, lost = 0;
    for (let index = 0; index < sentient.length; index += 1) {
      const account = sentient[index];
      const stats = accountStats[index];
      const readings = dailyReadings(histories?.[account.handle], cutoff, now);
      stats.followers = readings.at(-1)?.followers ?? null;
      let previous = null, compared = false, lastMonthlyDay = null;
      for (const reading of readings) {
        if (reading.day < start) { previous = reading; continue; }
        // A baseline older than month-end would pull prior-month movement into
        // this month. Use this reading as the new baseline and flag the gap.
        if (previous && (previous.day >= start || previous.day === baselineDay)) {
          const crossesRename = previous.day < renameDate && reading.day >= renameDate;
          const offset = crossesRename ? renameOffsets.get(String(account.handle).toLowerCase().replace(/^@/, '')) || 0 : 0;
          const delta = reading.followers - previous.followers - offset;
          if (offset) {
            result.excludedChanges += 1;
            stats.excludedDelta += offset;
          }
          const dailyGained = Math.max(0, delta), dailyLost = Math.max(0, -delta);
          gained += dailyGained;
          lost += dailyLost;
          stats.gained += dailyGained;
          stats.lost += dailyLost;
          const point = seriesByDay.get(reading.day);
          point.gained += dailyGained;
          point.lost += dailyLost;
          compared = true;
          result.from = !result.from || reading.day < result.from ? reading.day : result.from;
          result.to = !result.to || reading.day > result.to ? reading.day : result.to;
          if (shiftDay(previous.day, 1) !== reading.day) result.partial = true;
        } else result.partial = true;
        previous = reading;
        lastMonthlyDay = reading.day;
      }
      stats.net = stats.gained - stats.lost;
      if (compared) {
        result.coveredAccounts += 1;
        comparedHandles.add(account.handle);
        const baseline = stats.followers - stats.net;
        if (baseline > 0) stats.growthPct = stats.net / baseline * 100;
      }
      if (!compared || lastMonthlyDay !== cutoff) result.partial = true;
    }
    if (result.coveredAccounts) Object.assign(result, { gained, lost, net: gained - lost });
    return finish();
  }
  function summarize(accounts, histories, month, now = new Date()) {
    return aggregate(accounts, histories, month, now).summary;
  }
  function report(accounts, histories, month, now = new Date()) {
    const { summary, ...analytics } = aggregate(accounts, histories, month, now);
    return { ...summary, ...analytics };
  }
  root.SentientTrackerMonthly = { currentMonth, months, summarize, report };
})(globalThis);
