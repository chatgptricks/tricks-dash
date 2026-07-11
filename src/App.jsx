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
  Sparkles,
  X,
  Video,
} from 'lucide-react';

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
  const [sortBy, setSortBy] = useState('likes-desc');
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
      setSortBy('likes-desc');
      setMinLikes(ranges.likesMin);
      setMinComments(ranges.commentsMin);
      setDateFrom('');
      setDateTo('');
      setDatePreset('all');
      setVisibleCount(POSTS_PER_BATCH);
    });
  }, [ranges.commentsMin, ranges.likesMin]);

  const applyDatePreset = useCallback((value) => {
    const preset = datePresets.find((option) => option.value === value);
    setDatePreset(value);
    setDateFrom(preset?.from ?? '');
    setDateTo(preset?.to ?? '');
  }, [datePresets]);

  const copyShortcode = useCallback(async (shortcode) => {
    await navigator.clipboard.writeText(shortcode);
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
                <Sparkles size={18} />
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
            <div className="filter-row filter-row-primary">
              <label className="filter-unit filter-search">
                <span>
                  <Search size={14} />
                  Search
                </span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search captions and cover text" />
              </label>

              <div className="filter-unit filter-type">
                <div className="filter-title">
                  <Filter size={14} />
                  Type
                </div>
                <div className="chip-row">
                  {TYPE_OPTIONS.map((option) => (
                    <button
                      key={option}
                      className={option === activeType ? 'chip chip-active' : 'chip'}
                      onClick={() => startTransition(() => setActiveType(option))}
                    >
                      {TYPE_LABELS[option] ?? option}
                      {option !== 'All posts' ? <span>{typeCounts[option] ?? 0}</span> : null}
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-unit filter-media">
                <div className="filter-title">
                  <Video size={14} />
                  Media
                </div>
                <div className="chip-row compact-chips">
                  {MEDIA_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      className={option.value === mediaFilter ? 'chip chip-active' : 'chip'}
                      onClick={() => startTransition(() => setMediaFilter(option.value))}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="filter-row filter-row-secondary">
              <div className="filter-unit filter-date">
                <div className="filter-title">
                  <CalendarDays size={14} />
                  Date
                </div>
                <div className="inline-fields">
                  <select aria-label="Date range" value={datePreset} onChange={(event) => applyDatePreset(event.target.value)}>
                    {datePreset === 'custom' ? <option value="custom">Custom range</option> : null}
                    {datePresets.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
                  </select>
                  <input type="date" aria-label="Date from" value={dateFrom} min={ranges.dateMin} max={ranges.dateMax} onChange={(e) => { setDatePreset('custom'); setDateFrom(e.target.value); }} />
                  <input type="date" aria-label="Date to" value={dateTo} min={ranges.dateMin} max={ranges.dateMax} onChange={(e) => { setDatePreset('custom'); setDateTo(e.target.value); }} />
                </div>
              </div>

              <div className="filter-unit filter-engagement">
                <div className="filter-title">
                  <SlidersHorizontal size={14} />
                  Engagement
                </div>
                <label className="range-field compact-range">
                  <span>{compactFormatter.format(minLikes)}+ likes</span>
                  <input
                    type="range"
                    min={ranges.likesMin}
                    max={ranges.likesMax}
                    value={minLikes}
                    onChange={(e) => startTransition(() => setMinLikes(clampNumber(e.target.value, ranges.likesMin)))}
                  />
                </label>
                <input
                  aria-label="Minimum comments"
                  placeholder="Comments"
                  type="number"
                  min={0}
                  value={minComments}
                  onChange={(e) => startTransition(() => setMinComments(clampNumber(e.target.value, ranges.commentsMin)))}
                />
              </div>

              <div className="filter-unit filter-sort">
                <div className="filter-title">
                  <ArrowUpDown size={14} />
                  Sort
                </div>
                <select value={sortBy} onChange={(e) => startTransition(() => setSortBy(e.target.value))}>
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <button className="ghost-button filter-reset" onClick={onReset}>
                <RotateCcw size={15} />
                Reset
              </button>
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

        {!loading && !loadError ? <aside
          className={isSidebarOpen ? 'right-rail is-open' : 'right-rail'}
          aria-label="Selected post details"
          aria-hidden={!isSidebarOpen}
        >
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
                    <h2>{selected.shortcode}</h2>
                  </div>
                  <button className="ghost-button" onClick={() => copyShortcode(selected.shortcode)}>
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
            {IG_HANDLE.slice(0, 2).toUpperCase()}
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
