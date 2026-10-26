/* Shared by the standalone Insights page and the Node analytics checks.
 * Callers select the date window and format before analyze(). Missing music
 * means missing metadata, never that a post is silent. */
(function (root) {
  'use strict';

  const clean = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  const folded = value => clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const handle = value => clean(value).replace(/^@/, '').toLowerCase();
  const likesOf = post => {
    const value = post?.l;
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
    const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
    return Number.isFinite(number) && number >= 0 ? number : null;
  };
  const median = values => {
    if (!values.length) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const audioId = value => {
    // Unsafe numeric IDs have already lost precision; do not invent an exact identity.
    if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : '';
    const id = clean(value);
    // Providers use 0 for missing audio. It must not become one shared sound
    // across unrelated posts. Keep positive IDs as strings to preserve precision.
    if (!id || /^(?:null|undefined)$/i.test(id) || /^[+-]?0+(?:\.0+)?$/.test(id) || /^-\d+(?:\.\d+)?$/.test(id)) return '';
    return id;
  };
  const postKey = (post, index = 0) => {
    const shortcode = clean(post?.sc) || clean(post?.u).match(/\/(?:p|reels?|tv)\/([^/?#]+)/)?.[1];
    return shortcode ? `post:${shortcode}` : clean(post?.u) ? `url:${clean(post.u).split(/[?#]/)[0]}` : `row:${index}`;
  };
  const accountHandles = post => [...new Set([post?.a, ...(Array.isArray(post?.aa) ? post.aa : []),
    ...(Array.isArray(post?.accounts) ? post.accounts : [])].map(handle).filter(Boolean))].sort();
  const formatOf = post => clean(post?.t) || clean(post?.pt) || 'Unknown';

  function classifyAudio(post, uniquePostKey = postKey(post)) {
    const id = audioId(post?.ai);
    const title = clean(post?.ms);
    const artist = clean(post?.ma);
    const original = post?.oa === 1 || post?.oa === true || post?.oa === '1'
      || /^(?:original audio|original sound|audio original|sonido original)(?:$|[\s·•:_-])/.test(folded(title));
    if (original) {
      const creator = artist.replace(/^@/, '') || handle(post?.a) || accountHandles(post)[0] || '';
      const suffix = id ? `#${id}` : clean(post?.sc) ? `post ${clean(post.sc)}` : uniquePostKey;
      return {
        key: id ? `id:${id}` : `original:${uniquePostKey}`,
        id: id || null, title: 'Original audio', artist: artist || null, creator: creator || null,
        kind: 'original', label: `Original audio${creator ? ` · @${creator}` : ''} · ${suffix}`,
      };
    }
    if (title) return {
      key: id ? `id:${id}` : `song:${JSON.stringify([folded(title), folded(artist)])}`,
      id: id || null, title, artist: artist || null, creator: null,
      kind: 'named', label: `${title}${artist ? ` · ${artist}` : ''}`,
    };
    if (id || artist) return {
      key: id ? `id:${id}` : `unidentified:${uniquePostKey}`,
      id: id || null, title: 'Unidentified audio', artist: artist || null, creator: null,
      kind: 'identified', label: `Unidentified audio${artist ? ` · ${artist}` : ''}${id ? ` · #${id}` : ''}`,
    };
    return { key: null, id: null, title: null, artist: null, creator: null, kind: 'unknown', label: 'Audio metadata unavailable' };
  }

  const audioQuality = post => Number(Boolean(audioId(post?.ai))) * 16
    + Number(Boolean(clean(post?.ms))) * 4 + Number(Boolean(clean(post?.ma))) * 2
    + Number(post?.oa === 1 || post?.oa === true || post?.oa === '1');

  function deduplicatePosts(input, options = {}) {
    const selected = options.selectedAccounts == null ? null : new Set([...options.selectedAccounts].map(handle));
    const groups = new Map();
    (Array.isArray(input) ? input : []).forEach((post, index) => {
      if (!post || typeof post !== 'object') return;
      const key = postKey(post, index);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(post);
    });
    const result = [];
    for (const [key, rows] of groups) {
      const allAccounts = [...new Set(rows.flatMap(accountHandles))].sort();
      const accounts = selected ? allAccounts.filter(account => selected.has(account)) : allAccounts;
      if (selected && !accounts.length) continue;
      const richest = [...rows].sort((left, right) => audioQuality(right) - audioQuality(left))[0];
      const id = audioId(richest.ai);
      const compatible = rows.filter(row => !audioId(row.ai) || audioId(row.ai) === id);
      const merged = { ...richest };
      // Fill partial snapshots without mixing two conflicting exact audio IDs.
      for (const field of ['ms', 'ma', 'ai', 'u', 'pl', 'sc', 't', 'pt', 'd']) {
        if (merged[field] === null || merged[field] === undefined || merged[field] === '') {
          const source = compatible.find(row => row[field] !== null && row[field] !== undefined && row[field] !== '');
          if (source) merged[field] = source[field];
        }
      }
      if (merged.oa === null || merged.oa === undefined) {
        const source = compatible.find(row => row.oa !== null && row.oa !== undefined);
        if (source) merged.oa = source.oa;
      }
      const knownLikes = rows.map(likesOf).filter(value => value !== null);
      // These compact rows have no capture timestamp. Keep the highest known
      // reading instead of treating a missing or older collaboration row as zero.
      merged.l = knownLikes.length ? knownLikes.reduce((maximum, value) => Math.max(maximum, value), 0) : null;
      merged.a = handle(merged.a) || allAccounts[0] || '';
      merged.aa = allAccounts;
      merged.accounts = accounts;
      merged.postKey = key;
      merged.likes = merged.l;
      merged.format = formatOf(merged);
      merged.audio = classifyAudio(merged, key);
      result.push(merged);
    }
    return result;
  }

  function rankTracks(tracks, rankBy = 'total') {
    const fields = { total: 'totalLikes', mean: 'meanLikes', median: 'medianLikes', uses: 'postCount', relative: 'relativePerformance', topPosts: 'topPostCount' };
    const field = fields[rankBy] || fields.total;
    const compareValue = (left, right, name) => {
      if (left[name] === null || left[name] === undefined) return right[name] === null || right[name] === undefined ? 0 : 1;
      if (right[name] === null || right[name] === undefined) return -1;
      return right[name] - left[name];
    };
    return [...tracks].sort((left, right) => compareValue(left, right, field)
      || compareValue(left, right, 'totalLikes') || right.postCount - left.postCount || left.key.localeCompare(right.key));
  }

  function analyze(input, options = {}) {
    const minBaselinePosts = Math.max(1, Math.floor(Number(options.minBaselinePosts) || 5));
    const minTopPosts = Math.max(1, Math.floor(Number(options.minTopPosts) || 10));
    const posts = deduplicatePosts(input, options);
    const baselinePosts = options.baselinePosts === undefined ? posts : deduplicatePosts(options.baselinePosts, options);
    const baselineGroups = new Map();
    const baselineKey = (account, format) => JSON.stringify([account, format]);
    for (const post of baselinePosts) {
      for (const account of post.accounts) {
        const key = baselineKey(account, post.format);
        if (!baselineGroups.has(key)) baselineGroups.set(key, { account, format: post.format, posts: [] });
        baselineGroups.get(key).posts.push(post);
      }
    }
    const baselines = [];
    const baselineMap = new Map();
    for (const [key, group] of baselineGroups) {
      const values = group.posts.map(post => post.likes).filter(value => value !== null).sort((left, right) => right - left);
      const middle = median(values);
      const topEligible = values.length >= minTopPosts;
      const targetTopCount = Math.ceil(values.length * 0.1);
      const topThreshold = topEligible ? values[targetTopCount - 1] : null;
      const topCount = topEligible ? values.filter(value => value >= topThreshold).length : 0;
      const row = {
        account: group.account, format: group.format, postCount: group.posts.length, knownLikesCount: values.length,
        medianLikes: middle, relativeEligible: values.length >= minBaselinePosts && middle > 0,
        topEligible, topThreshold, topCount, tiedAtCutoff: topEligible && topCount > targetTopCount,
      };
      baselines.push(row);
      baselineMap.set(key, row);
    }

    const groups = new Map();
    for (const post of posts) {
      const relativeByAccount = [];
      const topAccounts = [];
      let topEligible = false;
      for (const account of post.accounts) {
        const baseline = baselineMap.get(baselineKey(account, post.format));
        if (post.likes !== null && baseline?.relativeEligible) relativeByAccount.push({ account, value: post.likes / baseline.medianLikes });
        if (post.likes !== null && baseline?.topEligible) {
          topEligible = true;
          if (post.likes >= baseline.topThreshold) topAccounts.push(account);
        }
      }
      post.relativeByAccount = relativeByAccount;
      post.relativePerformance = median(relativeByAccount.map(row => row.value));
      post.topAccounts = topAccounts;
      post.topEligible = topEligible;
      post.topPost = topAccounts.length > 0;
      if (!post.audio.key) continue;
      if (!groups.has(post.audio.key)) groups.set(post.audio.key, []);
      groups.get(post.audio.key).push(post);
    }
    const byLikes = (left, right) => right.likes - left.likes || left.postKey.localeCompare(right.postKey);
    const tracks = [];
    for (const [key, group] of groups) {
      // Exact IDs sometimes arrive first without their song title. Prefer the
      // most complete label across this group while retaining its exact identity.
      const representative = [...group].sort((left, right) => audioQuality(right) - audioQuality(left))[0];
      const audio = representative.audio;
      const accounts = [...new Set(group.flatMap(post => post.accounts))].sort();
      const known = group.filter(post => post.likes !== null).sort(byLikes);
      const values = known.map(post => post.likes);
      const relative = group.map(post => post.relativePerformance).filter(value => value !== null);
      const totalLikes = values.length ? values.reduce((sum, value) => sum + value, 0) : null;
      const topEligibleCount = group.filter(post => post.topEligible).length;
      tracks.push({
        ...audio, key, posts: group, postCount: group.length, accounts, accountCount: accounts.length,
        knownLikesCount: values.length, totalLikes, meanLikes: values.length ? totalLikes / values.length : null,
        medianLikes: median(values), maxLikes: values.length ? values[0] : null, bestPost: known[0] || null,
        relativePerformance: median(relative), relativeCount: relative.length,
        topEligibleCount, topPostCount: topEligibleCount ? group.filter(post => post.topPost).length : null,
      });
    }
    const counts = { named: 0, original: 0, identified: 0, unknown: 0 };
    posts.forEach(post => { counts[post.audio.kind] += 1; });
    const detectedAudio = posts.length - counts.unknown;
    return {
      tracks: rankTracks(tracks, options.rankBy), posts,
      bestPosts: posts.filter(post => post.audio.key && post.likes !== null).sort(byLikes),
      unknownPosts: posts.filter(post => !post.audio.key), baselines,
      coverage: {
        totalPosts: posts.length, detectedAudio, namedTracks: counts.named, originals: counts.original,
        identifiedAudio: counts.identified, unknown: counts.unknown,
        knownLikesPosts: posts.filter(post => post.likes !== null).length,
        topEligiblePosts: posts.filter(post => post.topEligible).length,
        // namedTracks counts POSTS; namedTrackCount counts distinct named groups.
        namedTrackCount: tracks.filter(track => track.kind === 'named').length,
        trackCount: tracks.length, audioFraction: posts.length ? detectedAudio / posts.length : null,
        namedFraction: posts.length ? counts.named / posts.length : null,
      },
      methodology: {
        minBaselinePosts, minTopPosts, topFraction: 0.1, topIncludesTies: true,
        baselineScope: 'account-and-format-in-selected-window',
        relativeStatistic: 'median of per-post likes / account-format median; collaborator ratios first medianed per post',
        duplicateLikes: 'highest known reading per shortcode',
        missingMusic: 'metadata unavailable; not proof of silence',
        missingLikes: 'excluded from likes statistics; zero remains a known value',
      },
    };
  }

  root.InsightsMusic = Object.freeze({ analyze, classifyAudio, deduplicatePosts, rankTracks });
})(globalThis);
