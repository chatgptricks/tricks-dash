// Account summaries come from the engagement endpoint. A missing measurement is
// unknown, while a measured zero remains zero; neither can be a cost divisor.
export const ENGAGEMENT_METRICS = Object.freeze([
  'likes', 'comments', 'shares', 'saves', 'impressions', 'video_views', 'video_plays',
]);

const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = value => typeof value === 'string' ? value.trim() : '';
const fold = value => text(value).normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ');

function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  // Avoid Number(null), Number(''), booleans, arrays, hexadecimal and other
  // coercions that could turn unavailable data or an invalid price into a value.
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const number = Number(value.trim());
  return Number.isFinite(number) ? number : null;
}

function nonnegativeNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function sampleCount(value) {
  const number = nonnegativeNumber(value);
  return Number.isInteger(number) ? number : null;
}

export function parsePositiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

export function normalizeEngagementAccount(value) {
  const account = record(value);
  const metrics = record(account.metrics);
  return {
    ...account,
    handle: text(account.handle).replace(/^@+/, ''),
    label: text(account.label),
    group: text(account.group),
    followers: sampleCount(account.followers),
    followers_captured_at: text(account.followers_captured_at) || null,
    post_count: sampleCount(account.post_count),
    engagement_post_count: sampleCount(account.engagement_post_count),
    average_engagements: nonnegativeNumber(account.average_engagements),
    engagement_rate_pct: nonnegativeNumber(account.engagement_rate_pct),
    complete_engagement_post_count: sampleCount(account.complete_engagement_post_count),
    average_complete_engagements: nonnegativeNumber(account.average_complete_engagements),
    metrics: Object.fromEntries(ENGAGEMENT_METRICS.map(name => {
      const metric = record(metrics[name]);
      return [name, {
        count: sampleCount(metric.count),
        total: nonnegativeNumber(metric.total),
        average: nonnegativeNumber(metric.average),
      }];
    })),
    first_post_at: text(account.first_post_at) || null,
    last_post_at: text(account.last_post_at) || null,
    metrics_updated_at: text(account.metrics_updated_at) || null,
  };
}

export function normalizeEngagementAccounts(accounts) {
  return (Array.isArray(accounts) ? accounts : [])
    .map(normalizeEngagementAccount)
    .filter(account => account.handle);
}

export function selectEngagementAccounts(accounts, options = {}) {
  const query = fold(options.search).split(' ').filter(Boolean);
  const group = fold(options.group);
  const sortKey = {
    engagement_rate: 'engagement_rate_pct',
    engagements: 'average_engagements',
    followers: 'followers',
    posts: 'post_count',
  }[options.sort] || 'engagement_rate_pct';

  return normalizeEngagementAccounts(accounts).filter(account => {
    if (group && group !== 'all' && fold(account.group) !== group) return false;
    const searchable = fold(`@${account.handle} ${account.label} ${account.group}`);
    return query.every(token => searchable.includes(token));
  }).sort((a, b) => {
    const aValue = a[sortKey];
    const bValue = b[sortKey];
    if (aValue === null && bValue !== null) return 1;
    if (aValue !== null && bValue === null) return -1;
    if (aValue !== null && bValue !== null && aValue !== bValue) return bValue - aValue;
    return fold(a.handle).localeCompare(fold(b.handle), 'en-US')
      || a.handle.localeCompare(b.handle, 'en-US');
  });
}

// Small requests keep cold full-history calculations within the API's request
// budget. Nothing is published until every selected account has been validated.
export async function loadEngagementAccounts(request, handles, { signal, onProgress } = {}) {
  const selected = [...new Map((Array.isArray(handles) ? handles : []).map(handle => {
    const value = text(handle).replace(/^@+/, '');
    return [fold(value), value];
  }).filter(([key]) => key)).values()];
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const batches = [];
  for (let index = 0; index < selected.length; index += 5) batches.push(selected.slice(index, index + 5));
  const combined = new Map();
  const cache = { ttl_days: 7, cached_count: 0, recalculated_count: 0 };
  let next = 0, generatedAt = null, latestTime = -Infinity, failure = null;
  const worker = async () => {
    try {
      while (next < batches.length) {
        controller.signal.throwIfAborted();
        const batch = batches[next++];
        const params = new URLSearchParams({ days: '0', format: 'all' });
        batch.forEach(handle => params.append('accounts', handle));
        const body = await request(`/api/admin/promos/engagement?${params}`, { signal: controller.signal, timeout: 90000 });
        controller.signal.throwIfAborted();
        if (!Array.isArray(body?.accounts)) throw new Error('Engagement returned incomplete data. Please retry.');
        const accounts = normalizeEngagementAccounts(body.accounts);
        const expected = new Set(batch.map(fold));
        const received = new Set(accounts.map(account => fold(account.handle)));
        if (accounts.length !== batch.length || received.size !== batch.length || [...received].some(handle => !expected.has(handle))) {
          throw new Error('Engagement returned incomplete data. Please retry.');
        }
        accounts.forEach(account => combined.set(fold(account.handle), account));
        cache.cached_count += sampleCount(body.cache?.cached_count) || 0;
        cache.recalculated_count += sampleCount(body.cache?.recalculated_count) || 0;
        const timestamp = Date.parse(body.generated_at);
        if (Number.isFinite(timestamp) && timestamp > latestTime) { latestTime = timestamp; generatedAt = body.generated_at; }
        onProgress?.({ completed: combined.size, total: selected.length });
      }
    } catch (issue) {
      failure ||= issue;
      controller.abort();
      throw issue;
    }
  };
  try {
    controller.signal.throwIfAborted();
    await Promise.all(Array.from({ length: Math.min(2, batches.length) }, worker));
    controller.signal.throwIfAborted();
    return { accounts: selected.map(handle => combined.get(fold(handle))), generated_at: generatedAt, cache };
  } catch (issue) {
    controller.abort();
    throw failure || issue;
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}

function costFor(price, denominator, multiplier = 1) {
  const positiveDenominator = parsePositiveNumber(denominator);
  if (price === null || positiveDenominator === null) return null;
  const result = price / positiveDenominator * multiplier;
  return Number.isFinite(result) ? result : null;
}

export function calculatePostCosts(value, price, options = {}) {
  const account = normalizeEngagementAccount(value);
  const postPrice = parsePositiveNumber(price);
  const metricAverage = name => {
    const metric = account.metrics[name];
    return metric.count > 0 ? metric.average : null;
  };
  const impressions = options.impressions === undefined ? metricAverage('impressions') : options.impressions;
  return {
    price: postPrice,
    cpe: costFor(postPrice, account.engagement_post_count > 0 ? account.average_engagements : null),
    completeCpe: costFor(postPrice, account.complete_engagement_post_count > 0 ? account.average_complete_engagements : null),
    costPerLike: costFor(postPrice, metricAverage('likes')),
    costPerComment: costFor(postPrice, metricAverage('comments')),
    costPerShare: costFor(postPrice, metricAverage('shares')),
    costPerSave: costFor(postPrice, metricAverage('saves')),
    cpm: costFor(postPrice, impressions, 1000),
    // Views and plays are different measurements and must not be added together.
    costPerThousandViews: costFor(postPrice, metricAverage('video_views'), 1000),
  };
}
