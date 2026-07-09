import { memo, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Bookmark,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Filter,
  Heart,
  MessageCircle,
  MoreHorizontal,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Video,
} from 'lucide-react';
import postsData from './data/posts.json';
import summaryData from './data/summary.json';

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
const PAGE_SIZE_OPTIONS = [24, 36, 60];
const IG_HANDLE = 'chatgptricks';
const STATIC_COVER_VERSION = '20260708b';
const ACCESS_PASSWORD = 'sentient2026';
const ACCESS_STORAGE_KEY = 'chatgptricks-archive-access';

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

function normalizePost(post) {
  const caption = String(post.caption || '');
  const postType = typeLabel(post.type);
  const headline = extractHeadline(caption);
  const timestamp = new Date(post.postDate).getTime();

  return {
    ...post,
    caption,
    headline,
    isVideo: post.video === 'Yes',
    postType,
    searchText: [caption, post.excerpt, post.shortcode, post.permalink, post.type, postType].join(' ').toLowerCase(),
    timestamp,
  };
}

const NORMALIZED_POSTS = postsData.map(normalizePost);

function readAccessState() {
  if (typeof window === 'undefined') return false;

  try {
    return window.sessionStorage.getItem(ACCESS_STORAGE_KEY) === 'granted';
  } catch {
    return false;
  }
}

function posterTheme(type) {
  if (typeLabel(type) === 'Video') return 'theme-video';
  if (typeLabel(type) === 'Image') return 'theme-image';
  return 'theme-carousel';
}

function canUseImageProxy() {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function coverFileName(post) {
  const fileName = String(post.coverFile || '').split(/[\\/]/).pop();
  if (fileName) return fileName;

  const rank = String(post.rank || '').padStart(4, '0');
  const date = post.postDate ? new Date(post.postDate).toISOString().slice(0, 10).replaceAll('-', '') : '';
  return rank && date && post.shortcode ? `${rank}_${date}_${post.shortcode}.jpg` : '';
}

function coverSources(post) {
  const sources = [];
  const useImageProxy = canUseImageProxy();
  const localCoverName = coverFileName(post);

  if (useImageProxy && post.coverFile) {
    sources.push(`/api/local-cover?path=${encodeURIComponent(post.coverFile)}`);
  }
  if (!useImageProxy && localCoverName) {
    sources.push(`${import.meta.env.BASE_URL}covers/${encodeURIComponent(localCoverName)}?v=${STATIC_COVER_VERSION}`);
    return sources;
  }
  if (useImageProxy && post.permalink) {
    const fallback = post.coverUrl ? `&fallback=${encodeURIComponent(post.coverUrl)}` : '';
    sources.push(`/api/cover?permalink=${encodeURIComponent(post.permalink)}${fallback}`);
  }
  if (post.coverUrl) {
    sources.push(post.coverUrl);
  }
  return sources;
}

function matchesSearch(post, query) {
  if (!query) return true;
  return post.searchText.includes(query.toLowerCase());
}

function calculateRanges(posts) {
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
    dateMin = Math.min(dateMin, post.timestamp);
    dateMax = Math.max(dateMax, post.timestamp);
  }

  return {
    likesMin,
    likesMax,
    commentsMin,
    commentsMax,
    dateMin: new Date(dateMin).toISOString().slice(0, 10),
    dateMax: new Date(dateMax).toISOString().slice(0, 10),
  };
}

function App() {
  const [isUnlocked, setIsUnlocked] = useState(readAccessState);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const posts = NORMALIZED_POSTS;
  const summary = summaryData;
  const ranges = useMemo(() => calculateRanges(posts), [posts]);
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
  const [pageSize, setPageSize] = useState(24);
  const [page, setPage] = useState(1);
  const [selectedShortcode, setSelectedShortcode] = useState(posts[0]?.shortcode ?? '');

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
      if (minDate && post.timestamp < minDate) continue;
      if (maxDate && post.timestamp > maxDate) continue;
      if (!matchesSearch(post, deferredQuery)) continue;
      output.push(post);
    }

    output.sort((a, b) => {
      switch (sortBy) {
        case 'comments-desc':
          return b.comments - a.comments || b.likes - a.likes;
        case 'newest':
          return b.timestamp - a.timestamp;
        case 'oldest':
          return a.timestamp - b.timestamp;
        case 'likes-desc':
        default:
          return b.likes - a.likes || b.comments - a.comments;
      }
    });

    return output;
  }, [posts, activeType, mediaFilter, minLikes, minComments, dateFrom, dateTo, deferredQuery, sortBy]);

  useEffect(() => {
    setPage(1);
  }, [deferredQuery, activeType, mediaFilter, minLikes, minComments, dateFrom, dateTo, sortBy, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const visible = useMemo(() => filtered.slice(pageStart, pageStart + pageSize), [filtered, pageStart, pageSize]);
  const showingFrom = filtered.length ? pageStart + 1 : 0;
  const showingTo = Math.min(pageStart + pageSize, filtered.length);

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
      setPageSize(24);
    });
  }, [ranges.commentsMin, ranges.likesMin]);

  const copyShortcode = useCallback(async (shortcode) => {
    await navigator.clipboard.writeText(shortcode);
  }, []);

  const selectPost = useCallback((shortcode) => {
    startTransition(() => {
      setSelectedShortcode(shortcode);
    });
  }, []);

  const unlockArchive = useCallback(
    (event) => {
      event.preventDefault();

      if (password.trim() !== ACCESS_PASSWORD) {
        setPasswordError('Wrong password.');
        return;
      }

      try {
        window.sessionStorage.setItem(ACCESS_STORAGE_KEY, 'granted');
      } catch {
        // Session persistence is optional; access still opens for this render.
      }

      setPasswordError('');
      setIsUnlocked(true);
    },
    [password],
  );

  if (!isUnlocked) {
    return <PasswordGate password={password} passwordError={passwordError} onChange={setPassword} onSubmit={unlockArchive} />;
  }

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
                <p className="eyebrow">Archive explorer</p>
                <h1>ChatGPT Tricks Archive</h1>
              </div>
            </div>

            <div className="topbar-metrics">
              <Metric label="Posts" value={summary['Exported posts'] ?? posts.length} />
              <Metric label="Likes" value={compactFormatter.format(summary['Total likes'] ?? 0)} />
              <Metric label="Avg likes" value={compactFormatter.format(summary['Average likes'] ?? 0)} />
            </div>
          </header>

          <section className="filter-strip" aria-label="Archive filters">
            <div className="filter-row filter-row-primary">
              <label className="filter-unit filter-search">
                <span>
                  <Search size={14} />
                  Search
                </span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search posts" />
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
                  <input type="date" aria-label="Date from" value={dateFrom} min={ranges.dateMin} max={ranges.dateMax} onChange={(e) => setDateFrom(e.target.value)} />
                  <input type="date" aria-label="Date to" value={dateTo} min={ranges.dateMin} max={ranges.dateMax} onChange={(e) => setDateTo(e.target.value)} />
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
                <select aria-label="Page size" value={pageSize} onChange={(e) => startTransition(() => setPageSize(Number(e.target.value)))}>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
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
            <div className="pagination-controls">
              <button className="ghost-button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage === 1}>
                <ChevronLeft size={16} />
              </button>
              <span>
                Page {safePage} of {totalPages}
              </span>
              <button className="ghost-button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={safePage === totalPages}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </section>
        </section>

        <aside className="right-rail">
          <section className="panel detail">
            {selected ? (
              <SelectedPost post={selected} onCopy={copyShortcode} />
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
        </aside>
      </main>
    </div>
  );
}

function PasswordGate({ password, passwordError, onChange, onSubmit }) {
  return (
    <main className="password-shell">
      <section className="password-card" aria-labelledby="password-title">
        <div className="brand-mark password-mark">
          <Sparkles size={22} />
        </div>
        <p className="eyebrow">Private archive</p>
        <h1 id="password-title">ChatGPT Tricks Archive</h1>
        <p className="password-copy">Enter the access password to view the post navigator.</p>

        <form className="password-form" onSubmit={onSubmit}>
          <label htmlFor="archive-password">Password</label>
          <input
            id="archive-password"
            type="password"
            value={password}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            autoFocus
          />
          {passwordError ? (
            <p className="password-error" role="alert">
              {passwordError}
            </p>
          ) : null}
          <button type="submit">Unlock archive</button>
        </form>
      </section>
    </main>
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

const SelectedPost = memo(function SelectedPost({ post, onCopy }) {
  return (
    <article className="selected-post">
      <div className="post-header selected-post-header">
        <div className="post-user">
          <div className="post-avatar" aria-hidden="true">
            {IG_HANDLE.slice(0, 2).toUpperCase()}
          </div>
          <div className="post-user-copy">
            <strong>{IG_HANDLE}</strong>
            <span>
              {formatDate(post.postDate)} · {post.postType}
            </span>
          </div>
        </div>
        <button className="icon-button" aria-label="Post menu">
          <MoreHorizontal size={16} />
        </button>
      </div>

      <CoverImage className={`selected-post-media ${posterTheme(post.type)}`} post={post} priority>
        {post.isVideo ? (
          <div className="media-badge">
            <Video size={13} />
            Video
          </div>
        ) : null}
      </CoverImage>

      <div className="post-actions selected-post-actions">
        <div className="post-actions-left">
          <button className="action-button" aria-label="Like">
            <Heart size={20} />
          </button>
          <button className="action-button" aria-label="Comment">
            <MessageCircle size={20} />
          </button>
          <button className="action-button" aria-label="Share">
            <Send size={20} />
          </button>
        </div>
        <button className="action-button" aria-label="Save">
          <Bookmark size={20} />
        </button>
      </div>

      <div className="selected-post-copy">
        <button className="text-button" onClick={() => onCopy(post.shortcode)}>
          <Copy size={14} />
          Copy shortcode
        </button>
      </div>
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
          <button className="text-button" onClick={copyPost}>
            Copy code
          </button>
        </div>
      </div>
    </article>
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
