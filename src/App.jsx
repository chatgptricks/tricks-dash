import { memo, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Bookmark,
  CalendarDays,
  Copy,
  ExternalLink,
  Filter,
  Heart,
  MessageCircle,
  MoreHorizontal,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  X,
  Video,
} from 'lucide-react';
import brandProfileImage from './assets/profile.jpg';

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

function normalizePost(post) {
  const caption = String(post.caption || '');
  const postType = typeLabel(String(post.type || 'Image'));
  const headline = extractHeadline(caption);
  const timestamp = post.postDate ? new Date(post.postDate).getTime() : Number.NaN;

  return {
    ...post,
    caption,
    headline,
    isVideo: post.video === 'Yes' || postType === 'Video',
    postType,
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
  return [post.coverUrl.startsWith('http') ? post.coverUrl : `${API_BASE}${post.coverUrl}`];
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const posts = useMemo(() => dashboard.posts.map(normalizePost), [dashboard.posts]);
  const summary = dashboard.summary;
  const ranges = useMemo(() => calculateRanges(posts), [posts]);
  const datePresets = useMemo(() => buildDatePresets(ranges), [ranges]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      try {
        setLoading(true);
        setLoadError('');
        const response = await fetch(`${API_BASE}/api/tricks-dash/posts`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.posts)) throw new Error('The shared post database returned an invalid response.');
        setDashboard({ posts: data.posts, summary: data.summary || {} });
      } catch (error) {
        if (error.name !== 'AbortError') {
          setLoadError('Could not load the shared Post DB. Try again in a moment.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadDashboard();
    return () => controller.abort();
  }, []);
  const typeCounts = useMemo(() => {
    const counts = {};
    for (const post of posts) {
      counts[post.postType] = (counts[post.postType] || 0) + 1;
    }
    return counts;
  }, [posts]);

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
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

  const filtered = useMemo(() => {
    const minDate = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const maxDate = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;
    const output = [];

    for (const post of posts) {
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
  }, [posts, activeType, mediaFilter, minLikes, minComments, dateFrom, dateTo, deferredQuery, sortBy]);

  useEffect(() => {
    setVisibleCount(POSTS_PER_BATCH);
  }, [deferredQuery, activeType, mediaFilter, minLikes, minComments, dateFrom, dateTo, sortBy]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const showingFrom = filtered.length ? 1 : 0;
  const showingTo = visible.length;
  const activeFilterCount = [
    Boolean(query.trim()),
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
  }, []);

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
          <header className="topbar">
            <div className="brand">
              <div className="brand-mark">
                <img src={brandProfileImage} alt="" aria-hidden="true" />
              </div>
              <div>
                <p className="eyebrow">Dash explorer</p>
                <h1>Tricks Dash</h1>
              </div>
            </div>

            <div className="topbar-metrics">
              <Metric label="Posts" value={summary['Exported posts'] ?? posts.length} />
              <Metric label="Likes" value={compactFormatter.format(summary['Total likes'] ?? 0)} />
              <Metric label="Avg likes" value={compactFormatter.format(summary['Average likes'] ?? 0)} />
              <a className="ghost-button predict-link" href={PREDICT_URL}>Open Predict</a>
            </div>
          </header>

          {loading ? <section className="dash-state">Loading the shared Post DB...</section> : null}
          {loadError ? <section className="dash-state dash-state-error">{loadError}</section> : null}

          {!loading && !loadError ? <>
          <section className="filter-strip" aria-label="Dashboard filters">
            <div className="filter-command-row">
              <label className="filter-search-field">
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

              <div className="filter-result-summary" aria-live="polite">
                <strong>{filtered.length.toLocaleString()}</strong>
                <span>{filtered.length === 1 ? 'post found' : 'posts found'}</span>
              </div>

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

            <div className="filter-groups-row">
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
              </fieldset>

              <fieldset className="filter-group-card filter-sort">
                <legend>
                  <ArrowUpDown size={13} />
                  Order
                </legend>
                <select aria-label="Sort posts" value={sortBy} onChange={(e) => startTransition(() => setSortBy(e.target.value))}>
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </fieldset>
            </div>
          </section>

          <section className="panel gallery">
          <div className="panel-header gallery-header">
            <div>
              <p className="section-label">Results</p>
              <h2>
                {filtered.length.toLocaleString()} matching posts
                <span>{posts.length.toLocaleString()} total</span>
              </h2>
            </div>
          </div>

          <div className="results-scroll">
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
                  <strong>{IG_HANDLE}</strong> {selected.caption}
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

const SelectedPost = memo(function SelectedPost({ post }) {
  const preview = (
    <CoverImage className={`selected-post-media ${posterTheme(post.type)}`} post={post} priority>
      {post.isVideo ? (
        <div className="media-badge">
          <Video size={13} />
          Video
        </div>
      ) : null}
    </CoverImage>
  );

  return (
    <article className="selected-post">

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

  return (
    <article className={selected ? 'post-card selected' : 'post-card'} onClick={handleClick} onKeyDown={handleKeyDown} role="button" tabIndex={0} aria-pressed={selected}>
      <div className="post-header">
        <div className="post-user">
          <div className="post-avatar" aria-hidden="true">
            <img src={brandProfileImage} alt="" aria-hidden="true" />
          </div>
          <div className="post-user-copy">
            <strong>{IG_HANDLE}</strong>
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
          <strong>{IG_HANDLE}</strong> {post.headline || post.excerpt}
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
