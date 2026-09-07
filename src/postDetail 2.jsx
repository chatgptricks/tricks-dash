// The "open a post and deep-dive" pieces -- cover art, caption, stats, song,
// Instagram link, and the media-download modal (with its Google Lens
// reverse-image-search icon). Shared by the main dashboard's right rail
// (App.jsx) and the Queue board's own detail sidebar (queue.jsx) so both
// surfaces show and do exactly the same things for a post, with one place to
// fix bugs or add features instead of two copies drifting apart.
import { createPortal } from 'react-dom';
import { memo, useEffect, useMemo, useState } from 'react';
import { Copy, Download, ExternalLink, Eye, Flame, Music2, Video, X } from 'lucide-react';
import { usePrefs } from './prefsContext';
import { API_BASE, IG_HANDLE, apiFetch } from './api';

// Small, self-contained duplicates of formatting helpers that also live in
// App.jsx (used pervasively there for filters/sorting, not just this panel).
// Cheap pure functions -- not worth a shared import just to avoid a few
// duplicated lines on each side.
const compactFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const UNKNOWN_LIKES_MAX = 3;

export function formatLikes(value) {
  if (value === null || value === undefined || Number(value) <= UNKNOWN_LIKES_MAX) return '—';
  return compactFormatter.format(value);
}

export function formatDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

function formatElapsed(timestampMs) {
  if (!Number.isFinite(timestampMs)) return null;
  const diffMs = Date.now() - timestampMs;
  if (diffMs < 0) return null;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function typeLabel(value) {
  const text = String(value ?? '');
  if (text.startsWith('Carousel')) return 'Carousel';
  if (text.startsWith('Video')) return 'Video';
  return 'Image';
}

export function posterTheme(type) {
  if (typeLabel(type) === 'Video') return 'theme-video';
  if (typeLabel(type) === 'Image') return 'theme-image';
  return 'theme-carousel';
}

export function coverSources(post) {
  const sources = [];
  const refreshToken = post?.coverRefreshToken;
  const withRefreshToken = (source) => {
    if (refreshToken == null || refreshToken === '') return source;
    const separator = source.includes('?') ? '&' : '?';
    return `${source}${separator}cover_reload=${encodeURIComponent(String(refreshToken))}`;
  };
  const add = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    const source = /^https?:\/\//i.test(raw) ? raw : raw.startsWith('/') ? `${API_BASE}${raw}` : `${API_BASE}/${raw}`;
    const refreshedSource = withRefreshToken(source);
    if (!sources.includes(refreshedSource)) sources.push(refreshedSource);
  };

  add(post?.coverUrl);

  // CDN URLs from Instagram expire, and newly backfilled accounts can have no
  // cover URL at all until their first lazy download. Cortex exposes a
  // durable, cached cover route keyed by the database post id; keep it as a
  // second source so cards recover automatically instead of becoming a large
  // black placeholder when the original URL is stale or missing.
  const postId = post?.id ?? post?.postId ?? post?.post_id;
  const account = String(post?.account || '').trim();
  if (account && postId != null && /^\d+$/.test(String(postId))) {
    add(`${API_BASE}/api/dashboard/covers/${encodeURIComponent(account)}/${encodeURIComponent(String(postId))}`);
  }

  return sources;
}

export function coverUrlForPost(post) {
  return coverSources(post)[0] || '';
}

// Five escalating tiers matching the account thresholds worth calling out:
// 1x (just qualifies), 2x, 3x, 5x, 8x. Every step up is visibly bigger,
// brighter, and busier than the last.
export function hotTier(multiplier) {
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
export function hotEffects(post) {
  if (!post.showsHotBadge) return { className: '', showBorder: false };
  const tier = hotTier(post.hotMultiplier);
  const tierClass = tier >= 2 ? `post-card-tier-${tier}` : '';
  return {
    className: tierClass ? ` ${tierClass}` : '',
    showBorder: tier >= 2,
  };
}

export const HotBadge = memo(function HotBadge({ post, large = false }) {
  const tier = hotTier(post.hotMultiplier);
  const hasRate = Number.isFinite(post.hotMultiplier);
  const age = formatElapsed(post.timestamp);
  const label = [
    hasRate ? `${post.hotMultiplier.toFixed(1)}x the rate threshold` : 'Went viral in its first hour',
    age ? `posted ${age} ago` : null,
  ]
    .filter(Boolean)
    .join(' · ');

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
      {age ? <b className="hot-badge-age">{age}</b> : null}
    </div>
  );
});

export const CoverImage = memo(function CoverImage({ className, post, priority = false, children }) {
  const sources = useMemo(() => coverSources(post), [post]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const sourceKey = sources.join('|');

  useEffect(() => {
    setSourceIndex(0);
  }, [post.shortcode, sourceKey]);

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
          <div>{post.postType || post.type}</div>
          <strong>{post.title || post.shortcode}</strong>
        </div>
      )}
      {children}
    </div>
  );
});

export function InstagramLink({ post, onClick, compact = false }) {
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

export function SongLine({ url, children }) {
  const content = (
    <>
      <Music2 size={14} />
      <span>{children}</span>
    </>
  );
  return url ? (
    <a className="song-line" href={url} target="_blank" rel="noreferrer" title="Open this sound on Instagram">
      {content}
    </a>
  ) : (
    <p className="song-line">{content}</p>
  );
}

export function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export const SelectedPost = memo(function SelectedPost({ post }) {
  const preview = (
    <CoverImage className={`selected-post-media ${posterTheme(post.type)}`} post={post} priority>
      {post.isVideo ? (
        <div className="media-badge">
          <Video size={13} />
          Video
        </div>
      ) : null}
      {post.showsHotBadge ? <HotBadge post={post} large /> : null}
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

// Picks a column count (within [MIN_COLS, MAX_COLS]) that leaves the fewest
// empty cells in the grid's last row for this exact item count, instead of
// letting CSS auto-fill pick columns purely from viewport width. A 19-item
// carousel in a fixed 6-column grid leaves 5 empty slots in the last row --
// this is what actually read as "broken" in bug reports, not a real layout
// bug. Ties prefer more columns (fuller rows, less vertical scroll).
const MIN_COLS = 3;
const MAX_COLS = 6;
function bestColumns(count) {
  if (count <= 0) return MIN_COLS;
  if (count <= MIN_COLS) return count;
  let best = MAX_COLS;
  let bestWaste = Infinity;
  for (let c = MIN_COLS; c <= MAX_COLS; c += 1) {
    const waste = Math.ceil(count / c) * c - count;
    if (waste < bestWaste || (waste === bestWaste && c >= best)) { bestWaste = waste; best = c; }
  }
  return best;
}

// One grid cell: owns its own "has the image actually painted yet" state so
// a slow/large carousel shows a skeleton shimmer per-cell instead of a wall
// of solid black boxes that looked broken/frozen while everything loaded at
// once.
function MediaCell({ item, picked, disabled, onToggle, onDownload, t }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImage = item.poster && !failed;
  return (
    <article className={picked ? 'media-cell is-picked' : 'media-cell'}>
      <button
        type="button"
        className="media-cell-select"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={picked}
        aria-label={`${picked ? t('Deselect media') : t('Select media')} ${item.index}`}
      >
        {showImage ? (
          <>
            {!loaded ? <span className="media-cell-skeleton" aria-hidden="true" /> : null}
            <img
              src={item.poster}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className={loaded ? 'is-loaded' : ''}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
            />
          </>
        ) : (
          <span className="media-cell-blank">{item.kind === 'video' ? '▶' : '—'}</span>
        )}
        <span className="media-cell-number">{String(item.index).padStart(2, '0')}</span>
        <span className="media-cell-tag">{item.kind === 'video' ? t('Video') : t('Image')}</span>
      </button>
      {/* These are sibling buttons, rather than controls nested inside the
          selection button. That keeps the grid keyboard-accessible and avoids
          invalid interactive markup. */}
      <div className="media-cell-quick-actions">
        <button
          type="button"
          className="media-cell-action"
          title={t('Download just this one')}
          aria-label={`${t('Download just this one')} ${item.index}`}
          disabled={disabled}
          onClick={() => onDownload([item.index])}
        >
          <Download size={13} />
        </button>
      {/* Reverse-image search to trace a slide back to its original source
          (a lot of these covers are reposts). Lens needs a URL it can fetch
          itself, so this only shows up for slides that actually have a
          poster -- nothing to look up on a blank placeholder. */}
      {item.poster ? (
        <button
          type="button"
          className="media-cell-action"
          title={t('Find with Google Lens')}
          aria-label={`${t('Find with Google Lens')} ${item.index}`}
          onClick={(e) => {
            e.preventDefault();
            window.open(
              `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(item.poster)}`,
              '_blank',
              'noopener,noreferrer',
            );
          }}
        >
          <Eye size={12} />
        </button>
      ) : null}
      </div>
    </article>
  );
}

export function SlideDownload({ post }) {
  const { t } = usePrefs();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [state, setState] = useState('idle'); // idle | listing | working | error
  const [note, setNote] = useState('');

  // A new post invalidates everything the modal was showing.
  useEffect(() => {
    setOpen(false); setItems(null); setPicked(new Set()); setState('idle'); setNote('');
  }, [post.postKey]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const mediaUrl = (extra = '') =>
    `${API_BASE}/api/dashboard/posts/media`
    + `?account=${encodeURIComponent(post.account || IG_HANDLE)}`
    + `&shortcode=${encodeURIComponent(post.shortcode)}${extra}`;

  const readError = async (response) => {
    try { return (await response.json())?.detail || `HTTP ${response.status}`; }
    catch { return `HTTP ${response.status}`; }
  };

  const openPicker = async () => {
    setOpen(true);
    if (items) return;
    setState('listing'); setNote('');
    try {
      const response = await apiFetch(mediaUrl('&list=1'));
      if (!response.ok) throw new Error(await readError(response));
      const body = await response.json();
      setItems(body.items || []);
      setPicked(new Set((body.items || []).map((i) => i.index)));
      setState('idle');
      if (body.source === 'apify') setNote(t('Fetched via Apify'));
    } catch (error) {
      setState('error'); setNote(error.message || t('Could not list the media'));
    }
  };

  const download = async (indexes) => {
    setState('working'); setNote('');
    try {
      const list = indexes && indexes.length ? indexes : null;
      const response = await apiFetch(mediaUrl(list ? `&only=${list.join(',')}` : ''));
      if (!response.ok) throw new Error(await readError(response));
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const named = /filename="([^"]+)"/.exec(disposition);
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = named ? named[1] : `${post.account || IG_HANDLE}-${post.shortcode}.zip`;
      document.body.appendChild(link); link.click(); link.remove();
      // Revoking immediately can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(href), 30000);
      setState('idle');
      setNote(`${t('Downloaded')} ${list ? list.length : (items?.length ?? '')} ${t(((list ? list.length : items?.length) === 1) ? 'file' : 'files')}`);
    } catch (error) {
      setState('error'); setNote(error.message || t('Download failed'));
    }
  };

  const toggle = (index) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const allPicked = items && picked.size === items.length;

  return (
    <>
      <section className="panel slide-download">
        <button type="button" className="ghost-button" onClick={openPicker}>
          <Download size={15} />
          {t('Download media')}
        </button>
      </section>

      {open ? createPortal(
        <div className="media-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="media-modal" role="dialog" aria-modal="true" aria-label={t('Download media')}>
            <header className="media-modal-head">
              <div className="media-modal-title">
                <span className="media-modal-title-icon"><Download size={17} /></span>
                <p>
                  {t('Download media')}
                  <span>
                    @{post.account || IG_HANDLE} · {post.shortcode}
                    {items && items.length ? ` · ${items.length} ${t(items.length === 1 ? 'item' : 'items')}` : ''}
                  </span>
                </p>
              </div>
              <div className="media-modal-head-actions">
                {items && items.length ? <span className="media-selected-count">{picked.size} {t('selected')}</span> : null}
                <button type="button" className="tool-icon" onClick={() => setOpen(false)} aria-label={t('Close')}>
                  <X size={15} />
                </button>
              </div>
            </header>

            {state === 'listing' ? (
              <div className="media-modal-loading" aria-live="polite">
                <span className="media-loading-spinner" aria-hidden="true" />
                <p>{t('Fetching media…')}</p>
              </div>
            ) : items && items.length ? (
              <>
                <div className="media-grid" style={{ '--media-cols': bestColumns(items.length) }}>
                  {items.map((item) => (
                    <MediaCell
                      key={item.index}
                      item={item}
                      picked={picked.has(item.index)}
                      disabled={state === 'working'}
                      onToggle={() => toggle(item.index)}
                      onDownload={download}
                      t={t}
                    />
                  ))}
                </div>

                <footer className="media-modal-foot">
                  <div className="media-selection-summary">
                    {picked.size} {t(picked.size === 1 ? 'file' : 'files')} {t('selected')}
                  </div>
                  <div className="media-modal-actions">
                    <button
                      type="button"
                      className="text-button"
                      disabled={state === 'working'}
                      onClick={() => setPicked(allPicked ? new Set() : new Set(items.map((i) => i.index)))}
                    >
                      {allPicked ? t('Deselect all') : t('Select all')}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={state === 'working' || !picked.size}
                      onClick={() => download([...picked].sort((a, b) => a - b))}
                    >
                      {state === 'working' ? t('Downloading…') : `${t('Download selected')} (${picked.size})`}
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={state === 'working'}
                      onClick={() => download(null)}
                    >
                      {t('Download all')}
                    </button>
                  </div>
                </footer>
              </>
            ) : (
              <p className="media-modal-empty">{note || t('No media found for this post.')}</p>
            )}

            {note && items && items.length
              ? <p className={state === 'error' ? 'slide-download-note is-error' : 'slide-download-note'}>{note}</p>
              : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

// Transcript text is deliberately never rendered in the dashboard. When the
// Reels actor supplied one, let the coordinator save the original text file
// without adding it to captions/cards or asking the browser to expose a URL.
export function TranscriptDownload({ post }) {
  const { t } = usePrefs();
  const [state, setState] = useState('idle');
  const [note, setNote] = useState('');
  if (!post?.transcriptAvailable) return null;

  const download = async () => {
    setState('working'); setNote('');
    try {
      const response = await apiFetch(
        `${API_BASE}/api/dashboard/posts/${encodeURIComponent(post.account || IG_HANDLE)}/${encodeURIComponent(post.shortcode)}/transcript`,
      );
      if (!response.ok) {
        let detail = '';
        try { detail = (await response.json())?.detail || ''; } catch { /* non-JSON response */ }
        throw new Error(detail || `HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const named = /filename="([^"]+)"/.exec(disposition);
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = named ? named[1] : `${post.account}-${post.shortcode}-transcript.txt`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 30000);
      setState('idle'); setNote(t('Downloaded'));
    } catch (error) {
      setState('error'); setNote(error.message || t('Download failed'));
    }
  };

  return (
    <section className="panel slide-download transcript-download">
      <button type="button" className="ghost-button" disabled={state === 'working'} onClick={download}>
        <Download size={15} />
        {state === 'working' ? 'Downloading…' : t('Download transcript')}
      </button>
      {note ? <small className={state === 'error' ? 'media-download-error' : 'media-download-note'}>{note}</small> : null}
    </section>
  );
}

// Deep-dive content below the cover art -- caption + song, stats, download
// button -- for whatever container wants to show it (App.jsx's right rail,
// queue.jsx's own sidebar). Deliberately does NOT render the cover/SelectedPost
// or the outer <aside>/close-button chrome: callers render SelectedPost
// themselves (App.jsx already needs its own not-selected empty state there),
// this just covers the part that's otherwise identical on both pages.
export function PostDetailPanel({ post, captionExtra = null }) {
  const { t } = usePrefs();
  if (!post) return null;
  return (
    <>
      <section className="panel caption-panel">
        <div className="panel-header caption-header">
          <div>
            <p className="section-label">{t('Caption')}</p>
          </div>
          <button className="ghost-button" onClick={() => navigator.clipboard.writeText(post.caption || '')}>
            <Copy size={15} />
            {t('Copy')}
          </button>
        </div>
        <p>
          <strong>{post.account || IG_HANDLE}</strong> {post.caption}
        </p>
        {post.musicSong ? (
          <SongLine url={post.musicUrl}>
            {post.musicSong}
            {post.musicArtist ? ` — ${post.musicArtist}` : ''}
          </SongLine>
        ) : post.usesOriginalAudio ? (
          <SongLine url={post.musicUrl}>Original audio</SongLine>
        ) : null}
        {captionExtra}
      </section>

      <section className="panel stats-panel">
        <Metric label="Likes" value={formatLikes(post.likes)} />
        <Metric label={t('Comments')} value={compactFormatter.format(post.comments || 0)} />
        <Metric label={t('Date')} value={formatDate(post.postDate || post.publishedAt)} />
        <Metric label={t('Media')} value={post.postType || post.type} />
      </section>

      <SlideDownload post={post} />
      <TranscriptDownload post={post} />
    </>
  );
}
