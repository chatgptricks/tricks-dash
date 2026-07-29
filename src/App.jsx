import { memo, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUpDown,
  AtSign,
  Bookmark,
  CalendarDays,
  ChevronDown,
  Copy,
  ExternalLink,
  Filter,
  Flame,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  X,
  Video,
} from 'lucide-react';
import chatgptricksProfileImage from './assets/chatgptricks-profile.jpg';
import traselveloralProfileImage from './assets/traselveloreal-profile.jpg';

const ACCOUNT_PROFILE_IMAGES = {
  chatgptricks: chatgptricksProfileImage,
  traselveloreal: traselveloralProfileImage,
};

// All/Sentient/Competitors tabs -- accounts themselves come from the
// backend's self-serve account registry (/api/dashboard/accounts), not a
// hardcoded list, so adding a new account never requires a frontend change.
const GROUP_TABS = [
  { value: 'all', label: 'All' },
  { value: 'sentient', label: 'Sentient' },
  { value: 'competitors', label: 'Competitors' },
];

const TYPE_OPTIONS = ['All posts', 'Carousel', 'Video', 'Image'];
const SORT_OPTIONS = [
  { value: 'likes-desc', label: 'Most liked' },
  { value: 'comments-desc', label: 'Most commented' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];
const MEDIA_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'video', label: 'Video' },
  { value: 'static', label: 'Static' },
];
const TYPE_LABELS = {
  'All posts': 'All',
  Carousel: 'Carousel',
  Video: 'Video',
  Image: 'Image',
};
const POSTS_PER_BATCH = 60;
const IG_HANDLE = 'chatgptricks';
const API_BASE = (import.meta.env.VITE_API_BASE || 'https://cortex-api-db2e.onrender.com').replace(/\/$/, '');
const PREDICT_URL = 'https://chatgptricks.github.io/cortex/';
// A post stays pinned to the top + shows the HOT badge only while it's
// still inside the same window the daily engagement job keeps refreshing it
// (<=10 days old) -- after that it reverts to normal sort position.
const HOT_PIN_WINDOW_DAYS = 10;
// Live data refresh cadence for an already-open tab (the backend refreshes
// itself automatically every 30 min during its active window; this just
// keeps an open dashboard in sync with that without a manual reload).
const AUTO_POLL_MS = 3 * 60 * 1000;

const currencyFormatter = new Intl.NumberFormat('en-US');
const compactFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function formatDate(iso) {
  return dateFormatter.format(new Date(iso));
}

function typeLabel(value) {
  if (value.startsWith('Carousel')) return 'Carousel';
  if (value.startsWith('Video')) return 'Video';
  return 'Image';
}

function clampNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractHeadline(caption) {
  const firstLine =
    String(caption || '')
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) || '';

  const sentence = firstLine.split(/(?<=[.!?])\s/)[0].trim();
  const words = sentence.split(/\s+/).filter(Boolean);
  const limit = words.length > 10 ? 10 : words.length;
  return words.slice(0, limit).join(' ');
}

function normalizeSearchValue(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function realShortcode(shortcode) {
  // Legacy rows imported before shortcode tracking existed use a "post-<id>"
  // placeholder instead of a real Instagram shortcode -- those can't produce
  // a valid Instagram permalink.
  return shortcode && !String(shortcode).startsWith('post-') ? shortcode : null;
}

function normalizePost(post) {
  const caption = String(post.caption || '');
  const postType = typeLabel(String(post.type || 'Image'));
  const headline = extractHeadline(caption);
  const timestamp = post.postDate ? new Date(post.postDate).getTime() : Number.NaN;
  const isVideo = post.video === 'Yes' || postType === 'Video';
  const shortcode = realShortcode(post.shortcode);
  const permalink = post.permalink || (shortcode ? `https://www.instagram.com/${isVideo ? 'reel' : 'p'}/${shortcode}/` : '');
  const ageDays = Number.isFinite(timestamp) ? (Date.now() - timestamp) / 86400000 : Infinity;
  // A post keeps its HOT flag forever once it earns it (permanent record),
  // but only stays pinned to the top / shows the badge while still within
  // the active refresh window.
  const isHot = Boolean(post.isHot);
  const isPinned = isHot && ageDays <= HOT_PIN_WINDOW_DAYS;

  return {
    ...post,
    caption,
    headline,
    permalink,
    isVideo,
    postType,
    isHot,
    isPinned,
    searchText: [caption, post.excerpt, post.ocrText, post.shortcode, post.permalink, post.type, postType]
      .map(normalizeSearchValue)
      .filter(Boolean)
      .join(' '),
    timestamp,
  };
}

function posterTheme(type) {
  if (typeLabel(type) === 'Video') return 'theme-video';
  if (typeLabel(type) === 'Image') return 'theme-image';
  return 'theme-carousel';
}

function coverSources(post) {
  if (!post.coverUrl) return [];
  if (post.coverUrl.startsWith('http')) return [post.coverUrl];
  // Both accounts serve covers live from the Cortex backend now
  // (/api/tricks-dash/covers/{id} and /api/traselveloreal/covers/{id}).
  return [`${API_BASE}${post.coverUrl}`];
}

function matchesSearch(post, query) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return true;
  return post.searchText.includes(normalizedQuery);
}

function calculateRanges(posts) {
  if (!posts.length) {
    return { likesMin: 0, likesMax: 0, commentsMin: 0, commentsMax: 0, dateMin: '', dateMax: '' };
  }

  let likesMin = Infinity;
  let likesMax = -Infinity;
  let commentsMin = Infinity;
  let commentsMax = -Infinity;
  let dateMin = Infinity;
  let dateMax = -Infinity;

  for (const post of posts) {
    likesMin = Math.min(likesMin, post.likes);
    likesMax = Math.max(likesMax, post.likes);
    commentsMin = Math.min(commentsMin, post.comments);
    commentsMax = Math.max(commentsMax, post.comments);
    if (Number.isFinite(post.timestamp)) {
      dateMin = Math.min(dateMin, post.timestamp);
      dateMax = Math.max(dateMax, post.timestamp);
    }
  }

  return {
    likesMin,
    likesMax,
    commentsMin,
    commentsMax,
    dateMin: Number.isFinite(dateMin) ? new Date(dateMin).toISOString().slice(0, 10) : '',
    dateMax: Number.isFinite(dateMax) ? new Date(dateMax).toISOString().slice(0, 10) : '',
  };
}

function formatInputDate(date) {
  return date.toISOString().slice(0, 10);
}

function buildDatePresets(ranges) {
  if (!ranges.dateMin || !ranges.dateMax) return [{ value: 'all', label: 'All time', from: '', to: '' }];

  const latest = new Date(`${ranges.dateMax}T12:00:00`);
  const earliest = new Date(`${ranges.dateMin}T12:00:00`);
  const presets = [
    { value: 'all', label: 'All time', from: '', to: '' },
    { value: 'latest-30', label: 'Latest 30 days', from: formatInputDate(new Date(latest.getTime() - 29 * 86400000)), to: ranges.dateMax },
    { value: 'latest-90', label: 'Latest 90 days', from: formatInputDate(new Date(latest.getTime() - 89 * 86400000)), to: ranges.dateMax },
  ];

  for (let year = latest.getFullYear(); year >= earliest.getFullYear(); year -= 1) {
    presets.push({ value: `year-${year}`, label: String(year), from: `${year}-01-01`, to: `${year}-12-31` });
  }

  return presets;
}

function App() {
  const [dashboard, setDashboard] = useState({ posts: [], summary: {} });
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState(null);
  const posts = useMemo(() => dashboard.posts.map(normalizePost), [dashboard.posts]);
  const summary = dashboard.summary;
  const ranges = useMemo(() => calculateRanges(posts), [posts]);
  const datePresets = useMemo(() => buildDatePresets(ranges), [ranges]);

  const loadDashboard = useCallback(async (signal, { silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
        setLoadError('');
      }
      const [postsResponse, accountsResponse] = await Promise.all([
        fetch(`${API_BASE}/api/dashboard/posts`, { signal }),
        fetch(`${API_BASE}/api/dashboard/accounts`, { signal }),
      ]);
      if (!postsResponse.ok) throw new Error(`HTTP ${postsResponse.status}`);
      if (!accountsResponse.ok) throw new Error(`HTTP ${accountsResponse.status}`);
      const postsData = await postsResponse.json();
      const accountsData = await accountsResponse.json();
      if (!Array.isArray(postsData.posts) || !Array.isArray(accountsData.accounts)) {
        throw new Error('The shared post database returned an invalid response.');
      }
      setDashboard({ posts: postsData.posts, summary: postsData.summary || {} });
      setAccounts(accountsData.accounts);
    } catch (error) {
      if (error.name !== 'AbortError' && !silent) {
        setLoadError('Could not load the shared Post DB. Try again in a moment.');
      }
    } finally {
      if (!signal?.aborted && !silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadDashboard(controller.signal);
    return () => controller.abort();
  }, [loadDashboard]);

  // Both accounts now refresh themselves automatically on the backend
  // (every 30 min during the active window). Poll quietly in the background
  // so an already-open tab picks up new likes/HOT status without a manual
  // reload, without disturbing the loading/error UI on each tick.
  useEffect(() => {
    const timer = setInterval(() => {
      const controller = new AbortController();
      loadDashboard(controller.signal, { silent: true });
    }, AUTO_POLL_MS);
    return () => clearInterval(timer);
  }, [loadDashboard]);

  const handleRefresh = useCallback(async () => {
    const password = window.prompt('Refresh password:');
    if (!password) return;

    setRefreshing(true);
    setRefreshNotice(null);
    try {
      const response = await fetch(`${API_BASE}/api/dashboard/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ password }),
      });
      if (response.status === 401) {
        setRefreshNotice({ type: 'error', text: 'Incorrect password.' });
        return;
      }
      if (!response.ok) {
        setRefreshNotice({ type: 'error', text: 'Refresh failed. Try again in a moment.' });
        return;
      }
      const data = await response.json();

      let added = 0;
      let updated = 0;
      let hotMarked = 0;
      for (const result of Object.values(data || {})) {
        if (!result || result.error) continue;
        added += result?.short_term?.new_posts?.added ?? 0;
        updated += (result?.short_term?.engagement?.updated ?? 0) + (result?.daily?.updated ?? 0);
        hotMarked += result?.short_term?.engagement?.hot_marked ?? 0;
      }

      const parts = [];
      if (added > 0) parts.push(`${added} new post${added === 1 ? '' : 's'}`);
      if (updated > 0) parts.push(`${updated} post${updated === 1 ? '' : 's'} refreshed`);
      if (hotMarked > 0) parts.push(`${hotMarked} marked HOT`);
      setRefreshNotice({
        type: 'success',
        text: parts.length ? `${parts.join(', ')}.` : 'Already up to date.',
      });
      if (added > 0 || updated > 0) await loadDashboard();
    } catch (error) {
      setRefreshNotice({ type: 'error', text: 'Refresh failed. Try again in a moment.' });
    } finally {
      setRefreshing(false);
    }
  }, [loadDashboard]);
  const typeCounts = useMemo(() => {
    const counts = {};
    for (const post of posts) {
      counts[post.postType] = (counts[post.postType] || 0) + 1;
    }
    return counts;
  }, [posts]);

  const accountCounts = useMemo(() => {
    const counts = {};
    for (const post of posts) {
      counts[post.account] = (counts[post.account] || 0) + 1;
    }
    return counts;
  }, [posts]);

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [activeGroup, setActiveGroup] = useState('all');
  const groupScopedPosts = useMemo(
    () => (activeGroup === 'all' ? posts : posts.filter((post) => post.group === activeGroup)),
    [posts, activeGroup],
  );
  const combinedSummary = useMemo(() => {
    const totalPosts = groupScopedPosts.length;
    const totalLikes = groupScopedPosts.reduce((sum, post) => sum + (post.likes || 0), 0);
    return {
      totalPosts,
      totalLikes,
      averageLikes: totalPosts ? Math.round(totalLikes / totalPosts) : 0,
    };
  }, [groupScopedPosts]);
  const accountsInScope = useMemo(
    () => (activeGroup === 'all' ? accounts : accounts.filter((account) => account.group === activeGroup)),
    [accounts, activeGroup],
  );
  const [selectedAccounts, setSelectedAccounts] = useState(() => new Set());
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [backgroundTasks, setBackgroundTasks] = useState([]);

  // Kicks off the (slow, Apify-bound) initial history import for a
  // freshly-created account without blocking the UI -- tracked as a
  // floating card in BackgroundTaskStack instead of a modal the user has
  // to wait in front of.
  const startBackgroundBackfill = useCallback((account, password) => {
    const id = `${account.handle}-${Date.now()}`;
    setBackgroundTasks((tasks) => [
      ...tasks,
      {
        id,
        handle: account.handle,
        label: account.label,
        group: account.group,
        avatarUrl: account.avatarUrl || null,
        phase: 'importing',
        startedAt: Date.now(),
        added: 0,
        error: null,
      },
    ]);

    // Cache the real profile picture locally so it survives past the CDN
    // URL's expiry (see /api/dashboard/avatar/{handle}). Runs independently
    // of the backfill below -- a failure here shouldn't block the import,
    // and we already have the picture URL from the wizard's own preview
    // fetch, so this just downloads it once rather than hitting Apify again.
    if (account.avatarUrl) {
      (async () => {
        try {
          const response = await fetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(account.handle)}/avatar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ password, image_url: account.avatarUrl }),
          });
          if (response.ok) {
            await loadDashboard(undefined, { silent: true });
          }
        } catch (error) {
          // Non-critical -- the card just falls back to initials if this fails.
        }
      })();
    }

    (async () => {
      try {
        const params = { password, results_limit: '2000' };
        if (account.dateFrom) params.date_from = account.dateFrom;
        if (account.dateTo) params.date_to = account.dateTo;
        const response = await fetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(account.handle)}/backfill`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(params),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setBackgroundTasks((tasks) => tasks.map((task) => (task.id === id ? { ...task, phase: 'error', error: data.detail || 'Import failed.' } : task)));
          return;
        }
        setBackgroundTasks((tasks) => tasks.map((task) => (task.id === id ? { ...task, phase: 'done', added: data.added ?? 0 } : task)));
        await loadDashboard(undefined, { silent: true });
        setTimeout(() => setBackgroundTasks((tasks) => tasks.filter((task) => task.id !== id)), 8000);
      } catch (error) {
        setBackgroundTasks((tasks) => tasks.map((task) => (task.id === id ? { ...task, phase: 'error', error: 'Import failed. Try again in a moment.' } : task)));
      }
    })();
  }, [loadDashboard]);

  const dismissBackgroundTask = useCallback((id) => {
    setBackgroundTasks((tasks) => tasks.filter((task) => task.id !== id));
  }, []);
  // Whenever the tab (or the account roster itself) changes, default back
  // to "everything in this tab selected" rather than carrying over a
  // narrower selection from a different tab's account list.
  useEffect(() => {
    setSelectedAccounts(new Set(accountsInScope.map((account) => account.handle)));
  }, [activeGroup, accounts]); // eslint-disable-line react-hooks/exhaustive-deps
  const [activeType, setActiveType] = useState('All posts');
  const [mediaFilter, setMediaFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [minLikes, setMinLikes] = useState(ranges.likesMin);
  const [minComments, setMinComments] = useState(ranges.commentsMin);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [datePreset, setDatePreset] = useState('all');
  const [visibleCount, setVisibleCount] = useState(POSTS_PER_BATCH);
  const [selectedShortcode, setSelectedShortcode] = useState(posts[0]?.shortcode ?? '');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [filtersHidden, setFiltersHidden] = useState(false);
  const lastScrollTopRef = useRef(0);

  const handleResultsScroll = useCallback((event) => {
    const top = event.currentTarget.scrollTop;
    const delta = top - lastScrollTopRef.current;
    if (top < 40) {
      setFiltersHidden(false);
    } else if (delta > 8) {
      setFiltersHidden(true);
    } else if (delta < -8) {
      setFiltersHidden(false);
    }
    lastScrollTopRef.current = top;
  }, []);

  const filtered = useMemo(() => {
    const minDate = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const maxDate = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;
    const output = [];

    for (const post of posts) {
      if (activeGroup !== 'all' && post.group !== activeGroup) continue;
      if (!selectedAccounts.has(post.account)) continue;
      if (activeType !== 'All posts' && post.postType !== activeType) continue;
      if (mediaFilter === 'video' && !post.isVideo) continue;
      if (mediaFilter === 'static' && post.isVideo) continue;
      if (post.likes < minLikes) continue;
      if (post.comments < minComments) continue;
      if (minDate && (!Number.isFinite(post.timestamp) || post.timestamp < minDate)) continue;
      if (maxDate && (!Number.isFinite(post.timestamp) || post.timestamp > maxDate)) continue;
      if (!matchesSearch(post, deferredQuery)) continue;
      output.push(post);
    }

    output.sort((a, b) => {
      // HOT posts always float to the top, regardless of the active sort --
      // ties within the pinned group (and the rest of the list) still fall
      // back to whatever sort the viewer picked.
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      switch (sortBy) {
        case 'comments-desc':
          return b.comments - a.comments || b.likes - a.likes;
        case 'newest':
          return (b.timestamp || 0) - (a.timestamp || 0);
        case 'oldest':
          return (a.timestamp || 0) - (b.timestamp || 0);
        case 'likes-desc':
        default:
          return b.likes - a.likes || b.comments - a.comments;
      }
    });

    return output;
  }, [posts, activeGroup, selectedAccounts, activeType, mediaFilter, minLikes, minComments, dateFrom, dateTo, deferredQuery, sortBy]);

  useEffect(() => {
    setVisibleCount(POSTS_PER_BATCH);
  }, [deferredQuery, activeGroup, selectedAccounts, activeType, mediaFilter, minLikes, minComments, dateFrom, dateTo, sortBy]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const showingFrom = filtered.length ? 1 : 0;
  const showingTo = visible.length;
  const activeFilterCount = [
    Boolean(query.trim()),
    selectedAccounts.size < accountsInScope.length,
    activeType !== 'All posts',
    mediaFilter !== 'all',
    datePreset !== 'all' || Boolean(dateFrom) || Boolean(dateTo),
    minLikes > 0,
    minComments > 0,
    sortBy !== 'newest',
  ].filter(Boolean).length;

  const selected = useMemo(() => {
    if (!filtered.length) return null;
    return filtered.find((post) => post.shortcode === selectedShortcode) ?? filtered[0];
  }, [filtered, selectedShortcode]);

  useEffect(() => {
    if (selected?.shortcode && selectedShortcode !== selected.shortcode) {
      setSelectedShortcode(selected.shortcode);
    }
  }, [selected, selectedShortcode]);

  const onReset = useCallback(() => {
    setQuery('');
    startTransition(() => {
      setSelectedAccounts(new Set(accountsInScope.map((account) => account.handle)));
      setActiveType('All posts');
      setMediaFilter('all');
      setSortBy('newest');
      setMinLikes(0);
      setMinComments(0);
      setDateFrom('');
      setDateTo('');
      setDatePreset('all');
      setVisibleCount(POSTS_PER_BATCH);
    });
  }, [accountsInScope]);

  const applyDatePreset = useCallback((value) => {
    const preset = datePresets.find((option) => option.value === value);
    setDatePreset(value);
    setDateFrom(preset?.from ?? '');
    setDateTo(preset?.to ?? '');
  }, [datePresets]);

  const copyShortcode = useCallback(async (shortcode) => {
    await navigator.clipboard.writeText(shortcode);
  }, []);

  const copyCaption = useCallback(async (caption) => {
    await navigator.clipboard.writeText(caption);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const selectPost = useCallback((shortcode) => {
    startTransition(() => {
      setSelectedShortcode(shortcode);
      setIsSidebarOpen(true);
    });
  }, []);

  return (
    <div className="shell">
      <div className="backdrop" />
      <main className="app-layout">
        <section className="left-pane">
          <header className={filtersHidden ? 'topbar topbar-compact' : 'topbar'}>
            <div className="brand">
              <div className="brand-title">
                <p className="eyebrow">Dash explorer</p>
                <h1>Sentient Dash</h1>
              </div>

              {!loading && !loadError ? (
                <label className="filter-search-field topbar-search">
                  <Search size={18} aria-hidden="true" />
                  <span className="filter-search-copy">
                    <span>Search the post library</span>
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search captions, topics, or text inside a cover..."
                    />
                  </span>
                  {query ? (
                    <button className="search-clear" type="button" aria-label="Clear search" onClick={() => setQuery('')}>
                      <X size={15} />
                    </button>
                  ) : <span className="search-scope">Includes cover text</span>}
                </label>
              ) : null}
            </div>

            <div className="topbar-metrics">
              {!loading && !loadError ? (
                <Metric
                  label="Matching"
                  value={`${filtered.length.toLocaleString()} / ${posts.length.toLocaleString()}`}
                />
              ) : null}
              <Metric label="Likes" value={compactFormatter.format(combinedSummary.totalLikes ?? summary['Total likes'] ?? 0)} />
              <Metric label="Avg likes" value={compactFormatter.format(combinedSummary.averageLikes ?? summary['Average likes'] ?? 0)} />
              <button
                className="ghost-button refresh-button"
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                title={refreshing ? 'Refreshing…' : 'Pull new Instagram posts into the shared Post DB'}
                aria-label="Refresh"
              >
                <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
              </button>
            </div>
            {refreshNotice ? (
              <p className={`refresh-notice refresh-notice-${refreshNotice.type}`} role="status">
                {refreshNotice.text}
              </p>
            ) : null}
          </header>

          {loading ? <section className="dash-state">Loading the shared Post DB...</section> : null}
          {loadError ? <section className="dash-state dash-state-error">{loadError}</section> : null}

          {!loading && !loadError ? <>
          <div
            className={filtersHidden ? 'group-tabs group-tabs-hidden' : 'group-tabs'}
            role="tablist"
            aria-label="Account group"
            aria-hidden={filtersHidden}
          >
            {GROUP_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={activeGroup === tab.value}
                className={activeGroup === tab.value ? 'group-tab group-tab-active' : 'group-tab'}
                onClick={() => startTransition(() => setActiveGroup(tab.value))}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <section
            className={filtersHidden ? 'filter-strip filter-strip-hidden' : 'filter-strip'}
            aria-label="Dashboard filters"
            aria-hidden={filtersHidden}
          >
            <div className="filter-groups-row">
              <fieldset className="filter-group-card filter-account">
                <legend>
                  <AtSign size={13} />
                  Account
                </legend>
                <AccountMultiSelect
                  accounts={accountsInScope}
                  counts={accountCounts}
                  selected={selectedAccounts}
                  onChange={(next) => startTransition(() => setSelectedAccounts(next))}
                  onAddAccount={() => setShowAddAccount(true)}
                />
              </fieldset>

              <fieldset className="filter-group-card filter-type">
                <legend>
                  <Filter size={13} />
                  Content type
                </legend>
                <div className="chip-row">
                  {TYPE_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={option === activeType ? 'chip chip-active' : 'chip'}
                      onClick={() => startTransition(() => setActiveType(option))}
                      aria-pressed={option === activeType}
                    >
                      {TYPE_LABELS[option] ?? option}
                      {option !== 'All posts' ? <span>{typeCounts[option] ?? 0}</span> : null}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="filter-group-card filter-media">
                <legend>
                  <Video size={13} />
                  Asset
                </legend>
                <div className="chip-row compact-chips">
                  {MEDIA_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={option.value === mediaFilter ? 'chip chip-active' : 'chip'}
                      onClick={() => startTransition(() => setMediaFilter(option.value))}
                      aria-pressed={option.value === mediaFilter}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="filter-group-card filter-date">
                <legend>
                  <CalendarDays size={13} />
                  Published
                </legend>
                <div className="date-fields">
                  <label className="select-field">
                    <span>Range</span>
                    <select aria-label="Date range" value={datePreset} onChange={(event) => applyDatePreset(event.target.value)}>
                    {datePreset === 'custom' ? <option value="custom">Custom range</option> : null}
                    {datePresets.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
                    </select>
                  </label>
                  <label className="date-field">
                    <span>From</span>
                    <input type="date" aria-label="Date from" value={dateFrom} min={ranges.dateMin} max={ranges.dateMax} onChange={(e) => { setDatePreset('custom'); setDateFrom(e.target.value); }} />
                  </label>
                  <label className="date-field">
                    <span>To</span>
                    <input type="date" aria-label="Date to" value={dateTo} min={ranges.dateMin} max={ranges.dateMax} onChange={(e) => { setDatePreset('custom'); setDateTo(e.target.value); }} />
                  </label>
                </div>
              </fieldset>

              <fieldset className="filter-group-card filter-engagement">
                <legend>
                  <SlidersHorizontal size={13} />
                  Minimum engagement
                </legend>
                <div className="filter-engagement-inner">
                  <label className="range-field compact-range">
                    <span>Likes <strong>{compactFormatter.format(minLikes)}+</strong></span>
                    <input
                      type="range"
                      aria-label="Minimum likes"
                      min={0}
                      max={ranges.likesMax}
                      value={minLikes}
                      onChange={(e) => startTransition(() => setMinLikes(clampNumber(e.target.value, 0)))}
                    />
                  </label>
                  <label className="number-field">
                    <span>Comments</span>
                    <input
                      aria-label="Minimum comments"
                      type="number"
                      min={0}
                      value={minComments}
                      onChange={(e) => startTransition(() => setMinComments(clampNumber(e.target.value, ranges.commentsMin)))}
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset className="filter-group-card filter-sort">
                <legend>
                  <ArrowUpDown size={13} />
                  Order
                </legend>
                <div className="filter-sort-inner">
                  <select aria-label="Sort posts" value={sortBy} onChange={(e) => startTransition(() => setSortBy(e.target.value))}>
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </fieldset>

              <button
                className={activeFilterCount ? 'filter-clear-all filter-clear-all-active' : 'filter-clear-all'}
                type="button"
                onClick={onReset}
                disabled={!activeFilterCount}
              >
                <RotateCcw size={15} />
                <span>Clear filters</span>
                {activeFilterCount ? <b>{activeFilterCount}</b> : null}
              </button>
            </div>
          </section>

          <section className="panel gallery">
          <div className="results-scroll" onScroll={handleResultsScroll}>
            {visible.length ? (
              <div className="gallery-grid">
                {visible.map((post, index) => (
                  <PostCard
                    key={post.shortcode}
                    post={post}
                    priority={index < 6}
                    selected={selected?.shortcode === post.shortcode}
                    onSelect={selectPost}
                    onCopy={copyShortcode}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>No posts match the current filters.</p>
                <button className="ghost-button" onClick={onReset}>
                  Clear filters
                </button>
              </div>
            )}
          </div>

          <div className="pagination">
            <div className="pagination-copy">
              Showing {showingFrom}-{showingTo} of {filtered.length.toLocaleString()}
            </div>
            {visible.length < filtered.length ? (
              <button className="ghost-button load-more-button" onClick={() => setVisibleCount((count) => count + POSTS_PER_BATCH)}>
                Load 60 more
              </button>
            ) : <span className="all-loaded">All matching posts loaded</span>}
          </div>
        </section>
        </> : null}
        </section>

        {isSidebarOpen ? <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Close selected post details"
          onClick={closeSidebar}
        /> : null}

        {!loading && !loadError ? <aside
          className={isSidebarOpen ? 'right-rail is-open' : 'right-rail'}
          aria-label="Selected post details"
          aria-hidden={!isSidebarOpen}
        >
          {selected ? (
            <button className="rail-close-button" type="button" aria-label="Close selected post details" onClick={closeSidebar}>
              <X size={14} />
            </button>
          ) : null}
          <section className="panel detail">
            {selected ? (
              <SelectedPost post={selected} />
            ) : (
              <div className="empty-state">
                <p>No posts match the current filters.</p>
                <button className="ghost-button" onClick={onReset}>
                  Clear filters
                </button>
              </div>
            )}
          </section>

          {selected ? (
            <>
              <section className="panel caption-panel">
                <div className="panel-header caption-header">
                  <div>
                    <p className="section-label">Caption</p>
                  </div>
                  <button className="ghost-button" onClick={() => copyCaption(selected.caption)}>
                    <Copy size={15} />
                    Copy
                  </button>
                </div>
                <p>
                  <strong>{selected.account || IG_HANDLE}</strong> {selected.caption}
                </p>
              </section>

              <section className="panel stats-panel">
                <Metric label="Likes" value={compactFormatter.format(selected.likes)} />
                <Metric label="Comments" value={compactFormatter.format(selected.comments)} />
                <Metric label="Date" value={formatDate(selected.postDate)} />
                <Metric label="Media" value={selected.video} />
              </section>
            </>
          ) : null}
        </aside> : null}
      </main>

      {showAddAccount ? (
        <AddAccountWizard
          onClose={() => setShowAddAccount(false)}
          onAccountCreated={(account, password) => {
            setShowAddAccount(false);
            loadDashboard(undefined, { silent: true });
            startBackgroundBackfill(account, password);
          }}
        />
      ) : null}

      <BackgroundTaskStack tasks={backgroundTasks} onDismiss={dismissBackgroundTask} />
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

// Dropdown with a checkbox list of accounts, scoped to whichever tab
// (All/Sentient/Competitors) is currently active. Adding a new account
// (self-serve, via the "+ Add account" row at the bottom) never requires a
// frontend change -- the list is entirely driven by /api/dashboard/accounts.
function AccountMultiSelect({ accounts, counts, selected, onChange, onAddAccount }) {
  const [open, setOpen] = useState(false);
  const [panelRect, setPanelRect] = useState(null);
  const containerRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target) &&
        panelRef.current &&
        !panelRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // The dropdown panel is portaled to document.body and positioned with
  // fixed coordinates derived from the trigger's bounding rect -- the
  // trigger sits inside .filter-strip, which needs overflow:hidden for its
  // own collapse animation, so an absolutely-positioned panel would get
  // clipped instead of floating over the gallery.
  useEffect(() => {
    if (!open) return undefined;
    const updatePosition = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setPanelRect({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  const allSelected = accounts.length > 0 && accounts.every((account) => selected.has(account.handle));
  let label = 'No accounts yet';
  if (accounts.length) {
    if (allSelected) label = accounts.length === 1 ? accounts[0].label : `All accounts (${accounts.length})`;
    else if (selected.size === 0) label = 'No accounts selected';
    else if (selected.size === 1) {
      const match = accounts.find((account) => selected.has(account.handle));
      label = match?.label ?? `1 account`;
    } else label = `${selected.size} of ${accounts.length} accounts`;
  }

  const toggle = (handle) => {
    const next = new Set(selected);
    if (next.has(handle)) next.delete(handle);
    else next.add(handle);
    onChange(next);
  };

  return (
    <div className="account-multiselect" ref={containerRef}>
      <button
        type="button"
        className="account-multiselect-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>{label}</span>
        <ChevronDown size={14} className={open ? 'chevron chevron-open' : 'chevron'} />
      </button>
      {open && panelRect
        ? createPortal(
            <div
              className="account-multiselect-panel"
              role="listbox"
              aria-multiselectable="true"
              ref={panelRef}
              style={{ top: panelRect.top, left: panelRect.left, minWidth: panelRect.width }}
            >
              <div className="account-multiselect-actions">
                <button
                  type="button"
                  onClick={() => onChange(new Set(accounts.map((account) => account.handle)))}
                >
                  Select all
                </button>
                <button type="button" onClick={() => onChange(new Set())}>
                  Clear
                </button>
              </div>
              <div className="account-multiselect-list">
                {accounts.map((account) => (
                  <label key={account.handle} className="account-multiselect-item">
                    <input
                      type="checkbox"
                      checked={selected.has(account.handle)}
                      onChange={() => toggle(account.handle)}
                    />
                    <span>{account.label}</span>
                    <b>{counts[account.handle] ?? 0}</b>
                  </label>
                ))}
                {!accounts.length ? <p className="account-multiselect-empty">No accounts in this group yet.</p> : null}
              </div>
              {onAddAccount ? (
                <button
                  type="button"
                  className="account-multiselect-add"
                  onClick={() => {
                    setOpen(false);
                    onAddAccount();
                  }}
                >
                  <Plus size={13} />
                  Add account
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

const ACCOUNT_GROUP_OPTIONS = [
  { value: 'sentient', label: 'Sentient' },
  { value: 'competitors', label: 'Competitors' },
];

const WIZARD_STEPS = ['Account', 'Settings', 'Confirm'];

// Self-serve account creation, as a 3-step wizard. Creating the account is
// fast (a single DB insert) so it stays in-modal with immediate validation
// (e.g. a wrong password surfaces right here). The slow part -- pulling
// initial post history from Apify, which can take a minute or more -- is
// hard to make feel un-stuck inside a blocking form, so as soon as the
// account is created this modal closes and the import continues as a
// floating background task (see BackgroundTaskStack) that the rest of the
// dashboard stays fully interactive around.
function AddAccountWizard({ onClose, onAccountCreated }) {
  const [step, setStep] = useState(0);
  const [password, setPassword] = useState('');
  const [handle, setHandle] = useState('');
  const [label, setLabel] = useState('');
  const [group, setGroup] = useState('competitors');
  const [hotThreshold, setHotThreshold] = useState(600);
  const [importScope, setImportScope] = useState('all'); // 'all' | 'range'
  const [importFrom, setImportFrom] = useState('');
  const [importTo, setImportTo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  // Live profile-picture preview: a single lightweight Apify lookup fired
  // a moment after the user stops typing the handle, so step 1 can show
  // who they're actually about to add instead of just a blank field.
  // Best-effort only -- a failed/unknown lookup never blocks the wizard,
  // it just falls back to the initials placeholder used everywhere else.
  const [preview, setPreview] = useState(null); // { profile_pic_url, full_name, followers_count } | null
  const [previewStatus, setPreviewStatus] = useState('idle'); // idle | loading | error
  const previewRequestRef = useRef(0);

  const cleanHandle = handle.trim().replace(/^@/, '');
  const canLeaveStep0 = cleanHandle.length > 0;

  useEffect(() => {
    setPreview(null);
    if (cleanHandle.length < 2) {
      setPreviewStatus('idle');
      return undefined;
    }
    setPreviewStatus('loading');
    const requestId = ++previewRequestRef.current;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE}/api/admin/accounts/preview?handle=${encodeURIComponent(cleanHandle)}`);
        if (previewRequestRef.current !== requestId) return; // stale -- handle changed since this fired
        if (!response.ok) {
          setPreviewStatus('error');
          return;
        }
        const data = await response.json();
        setPreview(data);
        setPreviewStatus('idle');
      } catch (error) {
        if (previewRequestRef.current === requestId) setPreviewStatus('error');
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [cleanHandle]);

  const goNext = () => {
    if (step === 0 && !canLeaveStep0) {
      setNotice('Enter the Instagram handle first.');
      return;
    }
    if (step === 1 && importScope === 'range' && !importFrom) {
      setNotice('Pick at least a start date, or switch back to All posts.');
      return;
    }
    setNotice('');
    setStep((value) => Math.min(value + 1, WIZARD_STEPS.length - 1));
  };
  const goBack = () => {
    setNotice('');
    setStep((value) => Math.max(value - 1, 0));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!password || !cleanHandle) return;

    setSubmitting(true);
    setNotice('');
    try {
      const createResponse = await fetch(`${API_BASE}/api/admin/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          password,
          handle: cleanHandle,
          label: label.trim() || cleanHandle,
          group,
          hot_threshold: String(hotThreshold),
        }),
      });
      if (createResponse.status === 401) {
        setSubmitting(false);
        setNotice('Incorrect password.');
        return;
      }
      if (!createResponse.ok) {
        const body = await createResponse.json().catch(() => ({}));
        setSubmitting(false);
        setNotice(body.detail || 'Could not create the account.');
        return;
      }

      // Created -- hand off to the parent, which closes this modal and
      // starts the backfill as a background task with this same password.
      onAccountCreated(
        {
          handle: cleanHandle,
          label: label.trim() || cleanHandle,
          group,
          avatarUrl: preview?.profile_pic_url || null,
          dateFrom: importScope === 'range' ? importFrom || null : null,
          dateTo: importScope === 'range' ? importTo || null : null,
        },
        password,
      );
    } catch (error) {
      setSubmitting(false);
      setNotice('Something went wrong. Try again.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-card wizard-card" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <div className="modal-header">
          <h2>Add account</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="wizard-steps" role="list">
          {WIZARD_STEPS.map((stepLabel, index) => (
            <div
              key={stepLabel}
              role="listitem"
              className={
                index === step ? 'wizard-step wizard-step-active' : index < step ? 'wizard-step wizard-step-done' : 'wizard-step'
              }
            >
              <span className="wizard-step-dot">{index < step ? '✓' : index + 1}</span>
              <span className="wizard-step-label">{stepLabel}</span>
            </div>
          ))}
        </div>

        {step === 0 ? (
          <div className="wizard-panel">
            <div className="wizard-handle-row">
              <div className={previewStatus === 'loading' ? 'wizard-preview-avatar wizard-preview-loading' : 'wizard-preview-avatar'}>
                {preview?.profile_pic_url ? (
                  <img src={preview.profile_pic_url} alt="" referrerPolicy="no-referrer" />
                ) : previewStatus === 'loading' ? (
                  <span className="wizard-preview-spinner" aria-hidden="true" />
                ) : (
                  <AtSign size={16} />
                )}
              </div>
              <label className="modal-field wizard-handle-field">
                <span>Instagram handle</span>
                <input
                  value={handle}
                  onChange={(event) => setHandle(event.target.value)}
                  placeholder="e.g. natgeo"
                  autoFocus
                  required
                />
              </label>
            </div>
            {preview ? (
              <p className="wizard-preview-meta">
                {preview.full_name || `@${preview.handle}`}
                {typeof preview.followers_count === 'number' ? ` · ${compactFormatter.format(preview.followers_count)} followers` : ''}
                {preview.private ? ' · Private' : ''}
              </p>
            ) : previewStatus === 'error' ? (
              <p className="wizard-preview-meta wizard-preview-meta-error">Couldn't find that account -- double-check the handle.</p>
            ) : null}
            <label className="modal-field">
              <span>Display label (optional)</span>
              <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Defaults to the handle" />
            </label>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="wizard-panel">
            <label className="modal-field">
              <span>Group</span>
              <select value={group} onChange={(event) => setGroup(event.target.value)}>
                {ACCOUNT_GROUP_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="modal-field">
              <span>HOT threshold (likes in the first hour)</span>
              <input
                type="number"
                min={0}
                value={hotThreshold}
                onChange={(event) => setHotThreshold(clampNumber(event.target.value, 0))}
              />
            </label>
            <div className="modal-field">
              <span>Post history to import</span>
              <div className="wizard-scope-toggle" role="radiogroup" aria-label="Post history to import">
                <button
                  type="button"
                  role="radio"
                  aria-checked={importScope === 'all'}
                  className={importScope === 'all' ? 'wizard-scope-option wizard-scope-option-active' : 'wizard-scope-option'}
                  onClick={() => setImportScope('all')}
                >
                  All posts
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={importScope === 'range'}
                  className={importScope === 'range' ? 'wizard-scope-option wizard-scope-option-active' : 'wizard-scope-option'}
                  onClick={() => setImportScope('range')}
                >
                  Date range
                </button>
              </div>
            </div>
            {importScope === 'range' ? (
              <div className="wizard-scope-dates">
                <label className="modal-field">
                  <span>From</span>
                  <input type="date" value={importFrom} onChange={(event) => setImportFrom(event.target.value)} />
                </label>
                <label className="modal-field">
                  <span>To</span>
                  <input type="date" value={importTo} onChange={(event) => setImportTo(event.target.value)} />
                </label>
              </div>
            ) : (
              <p className="wizard-hint">Imports up to the most recent 2,000 posts. Use a date range for a narrower, faster import.</p>
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="wizard-panel">
            <div className="wizard-summary">
              <div className="wizard-summary-avatar" aria-hidden="true">
                {preview?.profile_pic_url ? (
                  <img src={preview.profile_pic_url} alt="" referrerPolicy="no-referrer" />
                ) : (
                  (label.trim() || cleanHandle || '?').slice(0, 2).toUpperCase()
                )}
              </div>
              <div>
                <p className="wizard-summary-handle">@{cleanHandle || 'handle'}</p>
                <p className="wizard-summary-meta">
                  {ACCOUNT_GROUP_OPTIONS.find((option) => option.value === group)?.label} · HOT at {hotThreshold}+ likes/hr
                </p>
                <p className="wizard-summary-meta">
                  {importScope === 'range'
                    ? `Importing ${importFrom || '…'} to ${importTo || '…'}`
                    : 'Importing up to 2,000 most recent posts'}
                </p>
              </div>
            </div>
            <label className="modal-field">
              <span>Refresh password</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus />
            </label>
            <p className="wizard-hint">
              Post history import runs in the background after this -- you can keep using the dashboard while it works.
            </p>
          </div>
        ) : null}

        {notice ? <p className="modal-notice">{notice}</p> : null}

        <div className="modal-actions wizard-actions">
          <button type="button" className="ghost-button" onClick={step === 0 ? onClose : goBack}>
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < WIZARD_STEPS.length - 1 ? (
            <button type="button" className="ghost-button primary" onClick={goNext}>
              Next
            </button>
          ) : (
            <button type="submit" className="ghost-button primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Add account'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

// Floating, non-blocking progress widget for in-flight account imports.
// Rendered as a fixed stack in the corner so the rest of the dashboard
// (tabs, filters, gallery) stays fully usable while an Apify backfill
// (which can take a minute or more) runs. There's no true progress
// percentage available from the backend for a single blocking import call,
// so the bar is an indeterminate sweep with an elapsed timer for feedback.
function BackgroundTaskStack({ tasks, onDismiss }) {
  const [now, setNow] = useState(Date.now());
  const hasActive = tasks.some((task) => task.phase === 'importing');

  useEffect(() => {
    if (!hasActive) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasActive]);

  if (!tasks.length) return null;

  return (
    <div className="bg-task-stack">
      {tasks.map((task) => {
        const elapsedSec = Math.max(0, Math.round((now - task.startedAt) / 1000));
        const initials = (task.label || task.handle || '?').slice(0, 2).toUpperCase();
        return (
          <div key={task.id} className={`bg-task-card bg-task-${task.phase}`}>
            <div className="bg-task-avatar" aria-hidden="true">
              {task.avatarUrl ? <img src={task.avatarUrl} alt="" referrerPolicy="no-referrer" /> : initials}
            </div>
            <div className="bg-task-body">
              <div className="bg-task-top">
                <span className="bg-task-handle">@{task.handle}</span>
                <button type="button" className="bg-task-dismiss" onClick={() => onDismiss(task.id)} aria-label="Dismiss">
                  <X size={12} />
                </button>
              </div>
              <p className="bg-task-status">
                {task.phase === 'importing' ? `Importing post history… ${elapsedSec}s` : null}
                {task.phase === 'done' ? `Imported ${task.added} post${task.added === 1 ? '' : 's'}` : null}
                {task.phase === 'error' ? task.error || 'Import failed.' : null}
              </p>
              <div className="bg-task-progress">
                <div className={`bg-task-progress-fill bg-task-progress-${task.phase}`} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const SelectedPost = memo(function SelectedPost({ post }) {
  const preview = (
    <CoverImage className={`selected-post-media ${posterTheme(post.type)}`} post={post} priority>
      {post.isVideo ? (
        <div className="media-badge">
          <Video size={13} />
          Video
        </div>
      ) : null}
      {post.isPinned ? <HotBadge post={post} large /> : null}
    </CoverImage>
  );

  const selectedEffects = hotEffects(post);

  return (
    <article className={`selected-post${selectedEffects.className}`}>
      {selectedEffects.showBorder ? <span className="hot-border" aria-hidden="true" /> : null}
      {post.permalink ? (
        <a
          className="selected-post-link"
          href={post.permalink}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${post.shortcode} on Instagram`}
        >
          {preview}
        </a>
      ) : preview}
    </article>
  );
});

const PostCard = memo(function PostCard({ post, priority, selected, onSelect, onCopy }) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const handleClick = () => onSelect(post.shortcode);
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(post.shortcode);
    }
  };
  const stopAction = (event) => {
    event.stopPropagation();
  };
  const copyPost = (event) => {
    event.stopPropagation();
    onCopy(post.shortcode);
  };

  const effects = hotEffects(post);
  const cardClassName = `post-card${selected ? ' selected' : ''}${effects.className}`;

  return (
    <article className={cardClassName} onClick={handleClick} onKeyDown={handleKeyDown} role="button" tabIndex={0} aria-pressed={selected}>
      {effects.showBorder ? <span className="hot-border" aria-hidden="true" /> : null}
      <div className="post-header">
        <div className="post-user">
          <div className="post-avatar" aria-hidden="true">
            {ACCOUNT_PROFILE_IMAGES[post.account] ? (
              <img src={ACCOUNT_PROFILE_IMAGES[post.account]} alt="" aria-hidden="true" />
            ) : post.account && !avatarFailed ? (
              <img
                src={`${API_BASE}/api/dashboard/avatar/${encodeURIComponent(post.account)}`}
                alt=""
                aria-hidden="true"
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <span className="post-avatar-initials">{(post.account || '?').slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="post-user-copy">
            <strong>{post.account || IG_HANDLE}</strong>
            <span>{formatDate(post.postDate)}</span>
          </div>
        </div>
        <button className="icon-button" onClick={stopAction} aria-label="Post menu">
          <MoreHorizontal size={16} />
        </button>
      </div>

      <CoverImage className={`post-media ${posterTheme(post.type)}`} post={post} priority={priority}>
        {post.isVideo ? (
          <div className="media-badge">
            <Video size={13} />
            Video
          </div>
        ) : null}
        {post.isPinned ? <HotBadge post={post} /> : null}
      </CoverImage>

      <div className="post-actions">
        <div className="post-actions-left">
          <button className="action-button" onClick={stopAction} aria-label="Like">
            <Heart size={18} />
          </button>
          <button className="action-button" onClick={stopAction} aria-label="Comment">
            <MessageCircle size={18} />
          </button>
          <button className="action-button" onClick={stopAction} aria-label="Share">
            <Send size={18} />
          </button>
        </div>
        <button className="action-button" onClick={stopAction} aria-label="Save">
          <Bookmark size={18} />
        </button>
      </div>

      <div className="post-copy">
        <div className="post-likes">{compactFormatter.format(post.likes)} likes</div>
        <p>
          <strong>{post.account || IG_HANDLE}</strong> {post.headline || post.excerpt}
        </p>
        <div className="post-footer">
          <span>{compactFormatter.format(post.comments)} comments</span>
          <span>{formatDate(post.postDate)}</span>
          <InstagramLink post={post} onClick={stopAction} compact />
          <button className="text-button" onClick={copyPost}>
            Copy code
          </button>
        </div>
      </div>
    </article>
  );
});

function InstagramLink({ post, onClick, compact = false }) {
  if (!post.permalink) return null;

  return (
    <a
      className={compact ? 'instagram-link compact' : 'instagram-link'}
      href={post.permalink}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
    >
      <ExternalLink size={compact ? 12 : 14} />
      Instagram
    </a>
  );
}

// Five escalating tiers matching the account thresholds worth calling out:
// 1x (just qualifies), 2x, 3x, 5x, 8x. Every step up is visibly bigger,
// brighter, and busier than the last.
function hotTier(multiplier) {
  const value = Number.isFinite(multiplier) ? multiplier : 1;
  if (value >= 8) return 5;
  if (value >= 5) return 4;
  if (value >= 3) return 3;
  if (value >= 2) return 2;
  return 1;
}

// Card-level effects (beyond the badge itself), scaled to how far over the
// per-hour threshold the post's first hour landed. Only ever applied while
// the post is still pinned (i.e. still inside its active HOT window).
// Tier 1 (1x) is badge-only; tiers 2-5 (2x/3x/5x/8x) each step up the
// animated glowing border's color, speed, and halo strength.
function hotEffects(post) {
  if (!post.isPinned) return { className: '', showBorder: false };
  const tier = hotTier(post.hotMultiplier);
  const tierClass = tier >= 2 ? `post-card-tier-${tier}` : '';
  return {
    className: tierClass ? ` ${tierClass}` : '',
    showBorder: tier >= 2,
  };
}

const HotBadge = memo(function HotBadge({ post, large = false }) {
  const tier = hotTier(post.hotMultiplier);
  const hasRate = Number.isFinite(post.hotMultiplier);
  const label = hasRate ? `${post.hotMultiplier.toFixed(1)}x the rate threshold` : 'Went viral in its first hour';

  // Cap rendered flame icons at 3 so tier 4/5 badges don't get comically
  // wide -- the rest of the escalation (size, color, pulse speed) still
  // comes through via the hot-tier-N class.
  const flameCount = Math.min(tier, 3);

  return (
    <div className={`hot-badge hot-tier-${tier}${large ? ' hot-badge-large' : ''}`} title={label}>
      {Array.from({ length: flameCount }).map((_, index) => (
        <Flame key={index} size={large ? 14 : 12} />
      ))}
      <span>HOT</span>
      {hasRate ? <b className="hot-badge-rate">{post.hotMultiplier.toFixed(1)}x</b> : null}
    </div>
  );
});

const CoverImage = memo(function CoverImage({ className, post, priority = false, children }) {
  const sources = useMemo(() => coverSources(post), [post]);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [post.shortcode, sources.length]);

  const activeSource = sources[sourceIndex];

  return (
    <div className={className}>
      {activeSource ? (
        <img
          className="cover-image"
          src={activeSource}
          alt={post.shortcode}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          referrerPolicy="no-referrer"
          onError={() => {
            setSourceIndex((current) => Math.min(current + 1, sources.length));
          }}
        />
      ) : (
        <div className="cover-fallback">
          <div>{post.postType}</div>
          <strong>{post.shortcode}</strong>
        </div>
      )}
      {children}
    </div>
  );
});

export default App;
