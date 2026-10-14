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
  function summarize(accounts, histories, month, now = new Date()) {
    month = month || currentMonth(now);
    const sentient = [...new Map((accounts || []).filter(account => account.group === 'sentient').map(account => [account.handle, account])).values()];
    const result = { gained: null, lost: null, net: null, totalAccounts: sentient.length, coveredAccounts: 0, partial: false, from: null, to: null };
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) return { ...result, partial: true };
    const start = month + '-01';
    const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0, 12)).toISOString().slice(0, 10);
    const today = dayKey(now);
    const cutoff = today < lastDay ? today : lastDay;
    const baselineDay = shiftDay(start, -1);
    let gained = 0, lost = 0;
    for (const account of sentient) {
      const readings = dailyReadings(histories?.[account.handle], cutoff, now);
      let previous = null, compared = false, lastMonthlyDay = null;
      for (const reading of readings) {
        if (reading.day < start) { previous = reading; continue; }
        // A baseline older than month-end would pull prior-month movement into
        // this month. Use this reading as the new baseline and flag the gap.
        if (previous && (previous.day >= start || previous.day === baselineDay)) {
          const delta = reading.followers - previous.followers;
          gained += Math.max(0, delta);
          lost += Math.max(0, -delta);
          compared = true;
          result.from = !result.from || reading.day < result.from ? reading.day : result.from;
          result.to = !result.to || reading.day > result.to ? reading.day : result.to;
          if (shiftDay(previous.day, 1) !== reading.day) result.partial = true;
        } else result.partial = true;
        previous = reading;
        lastMonthlyDay = reading.day;
      }
      if (compared) result.coveredAccounts += 1;
      if (!compared || lastMonthlyDay !== cutoff) result.partial = true;
    }
    if (result.coveredAccounts) Object.assign(result, { gained, lost, net: gained - lost });
    return result;
  }
  root.SentientTrackerMonthly = { currentMonth, months, summarize };
})(globalThis);
