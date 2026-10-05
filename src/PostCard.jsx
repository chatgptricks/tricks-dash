// The gallery card and its menu. Kept out of App.jsx so pages that only need a
// card (Queue, its inspector, the stack modal) don't pull in the whole dashboard.
import { memo, useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, PenLine, Eye, EyeOff, ListTodo, LoaderCircle, Megaphone, MoreHorizontal, RefreshCw, Search, Sparkles, Trash2, Video, Zap } from 'lucide-react';
import { usePrefs } from './prefsContext';
import { API_BASE, IG_HANDLE } from './api';
import { encodeRouteState } from './urlCodec';
import { CoverImage, HotBadge, hotEffects, posterTheme } from './postDetail';
import { useStackActions, useStackScope } from './StackActions';
import { runStackOperation, stackPostKey } from './stackOperations';
import { editorialStates } from './topicGroups';
import { sendCardToSide } from './card-flight';
import { hotMetalStyle, obsidianCardHandlers } from './obsidian-card';
import chatgptricksProfileImage from './assets/chatgptricks-profile.jpg';
import traselveloralProfileImage from './assets/traselveloreal-profile.jpg';

export const ACCOUNT_PROFILE_IMAGES = {
  chatgptricks: chatgptricksProfileImage,
  traselveloreal: traselveloralProfileImage,
};

// Posts carrying this hashtag are paid placements. `\B` before the # and a
// word boundary after it so "#aitoolsentientlabs" doesn't match, while
// "...tool. #AIToolSentient" does regardless of case.
export const PROMO_HASHTAG = '#aitoolsentient';
export const PROMO_HASHTAG_RE = /#aitoolsentient\b/i;

const suggestionLink = post => `/queue.html?r=${encodeRouteState({ suggest: post.permalink, sourceAccount: post.account, sourceShortcode: post.shortcode })}`;

const currencyFormatter = new Intl.NumberFormat('en-US');
const compactFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

// Instagram hides or under-reports the like count on some posts, and Apify
// then returns null/0/1/2/3. Those aren't real engagement numbers, so showing
// them (or the old 500 placeholder) would be misleading -- render a dash.
const UNKNOWN_LIKES_MAX = 3;

function formatLikes(value) {
  if (value === null || value === undefined || Number(value) <= UNKNOWN_LIKES_MAX) return '—';
  return compactFormatter.format(value);
}

const DASHBOARD_TIME_ZONE = 'America/Costa_Rica';
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: DASHBOARD_TIME_ZONE,
});

function formatDate(iso) {
  const date = iso ? new Date(iso) : null;
  return date && Number.isFinite(date.getTime()) ? dateFormatter.format(date) : '—';
}

// "Freshness" Harvey-ball clock: a post is brand new at 0h and the ring
// drains continuously over its first 8 hours, so how new a post is reads at
// a glance without doing date math. Continuous rather than quartered -- a
// post 10 minutes old and one 90 minutes old both used to render as an
// identical "4/4" wedge, which looked like the clock wasn't moving; a plain
// fraction of elapsed/window makes every minute visibly drain the ring.
// Once a post passes 8h there's nothing left to drain, so the indicator
// disappears entirely rather than sitting there permanently empty.
const FRESHNESS_WINDOW_HOURS = 8;

function freshnessFraction(timestampMs) {
  if (!Number.isFinite(timestampMs)) return 0;
  const hours = (Date.now() - timestampMs) / 3600000;
  if (hours < 0 || hours >= FRESHNESS_WINDOW_HOURS) return 0;
  return 1 - hours / FRESHNESS_WINDOW_HOURS;
}

// Shared by the card menu and the detail rail. The control owns the short
// confirmation window so its parent closes only after the write succeeds.
export function QuickAddButton({ post, onQuickAdd, onAdded, className = 'ghost-button', role, label = 'Quick add' }) {
  const [phase, setPhase] = useState('idle');
  const closeTimer = useRef(null);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const add = async (event) => {
    event.stopPropagation();
    if (phase !== 'idle') return;
    setPhase('adding');
    const added = await onQuickAdd?.(post);
    if (!added) {
      setPhase('idle');
      return;
    }
    setPhase('added');
    closeTimer.current = setTimeout(() => onAdded?.(), 750);
  };

  return (
    <button
      type="button"
      role={role}
      className={`${className} quick-add-button is-${phase}`.trim()}
      title="Quick add to Pool with defaults"
      onClick={add}
      disabled={phase !== 'idle'}
    >
      {phase === 'adding' ? <LoaderCircle className="spin" size={13} /> : phase === 'added' ? <Check size={13} /> : <Zap size={13} />}
      {phase === 'adding' ? 'Adding…' : phase === 'added' ? 'Added' : label}
    </button>
  );
}

// The card's ... menu. Positioned absolutely inside the card header rather
// than portaled: the header isn't inside an overflow-hidden container, so a
// plain absolute panel is enough and avoids the fixed-position bookkeeping
// the account dropdown needs.
export function PostMenu({ post, isPromo, onFlags, onReload, onAssign, onQuickAdd, onQuickAddSuccess, canPool, canSuggest }) {
  const { t } = usePrefs();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const ref = useRef(null);
  const stackActions = useStackActions();
  const scope = useStackScope();
  const isStack = scope.length > 1;
  const promoScope = scope.filter((member) => member.group === 'sentient');
  const runBatch = async (event, key, action) => {
    event.stopPropagation();
    setBusy(key);
    const result = await runStackOperation(key === 'promo' ? promoScope : scope, action, (done, total) => setNote(`${done}/${total}`));
    setNote(`${result.succeeded}/${result.total} ${t('posts updated')}${result.failures.length ? ` · ${result.failures.length} ${t('failed')}: ${result.failures.map((item) => item.key).join(', ')}` : ''}`);
    setBusy('');
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = async (event, key, action) => {
    event.stopPropagation();
    setBusy(key);
    setNote('');
    try {
      const result = await action();
      if (key === 'separate' && result) {
        setNote('Post separated from this stack.');
        setBusy('');
        setTimeout(() => setOpen(false), 900);
        return;
      }
      if (key === 'similar' && result) {
        setNote(result.matchedCount ? `${result.matchedCount} ${t('similar posts grouped.')}` : t('No similar posts found.'));
        setBusy('');
        setTimeout(() => setOpen(false), 1400);
        return;
      }
      if (key === 'reload' && result) {
        const before = result.likes_before;
        const after = result.likes;
        const countNote = Number.isFinite(before) && Number.isFinite(after) && before !== after
          ? `Likes ${currencyFormatter.format(before)} → ${currencyFormatter.format(after)}`
          : 'Already up to date';
        setNote(`${countNote}${result.coverRefreshed ? ' · Cover refreshed' : ''}`);
        // Leave the menu open briefly so the result is actually readable.
        setBusy('');
        setTimeout(() => setOpen(false), 1400);
        return;
      }
      setOpen(false);
    } catch (error) {
      setNote(error?.message || 'That failed -- try again.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="post-menu" ref={ref} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) setOpen((value) => !value); }} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape' && open) setOpen(false); }}>
      <button
        type="button"
        className="icon-button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        aria-label={isStack ? 'Stack menu' : 'Post menu'}
        aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>
      {open ? (
        <div className="post-menu-panel" role="menu" onClick={(event) => event.stopPropagation()}>
          {isStack ? <>
            <p className="post-menu-note">{t('Entire stack')} · {scope.length} posts</p>
            <button role="menuitem" disabled={Boolean(busy)} onClick={(event) => runBatch(event, 'reload', onReload)}><RefreshCw size={13} className={busy === 'reload' ? 'spin' : ''} />{t('Reload counts')} · {scope.length}</button>
            {promoScope.length > 0 && <button role="menuitem" disabled={Boolean(busy)} onClick={(event) => runBatch(event, 'promo', (member) => onFlags(member, { is_promo: !promoScope.every((item) => item.isPromo) }))}><Megaphone size={13} />{promoScope.every((item) => item.isPromo) ? t('Remove promo') : t('Mark as promo')} · {promoScope.length} Ours</button>}
            <button role="menuitem" disabled={Boolean(busy)} onClick={(event) => runBatch(event, 'hide', (member) => onFlags(member, { hidden: !scope.every((item) => item.hidden) }))}><EyeOff size={13} />{scope.every((item) => item.hidden) ? t('Unhide') : t('Hide')} · {scope.length}</button>
            <button role="menuitem" disabled={Boolean(busy)} onClick={(event) => run(event, 'ungroup', () => stackActions.separate(scope.map(stackPostKey)))}>{t('Ungroup stack')}</button>
          </> : <>
          {canPool ? <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
              onAssign(post);
            }}
          >
            <ListTodo size={13} />
            Send to Pool
          </button> : null}
          {canSuggest && post.permalink ? <a role="menuitem" href={suggestionLink(post)}><PenLine size={13} />{t('Suggest post')}</a> : null}
          {canPool ? <QuickAddButton post={post} onQuickAdd={onQuickAdd} onAdded={() => { setOpen(false); onQuickAddSuccess?.(); }} className="" role="menuitem" label="Quick add to Pool" /> : null}
          {stackActions ? <button type="button" role="menuitem" onClick={(event) => run(event, 'similar', () => stackActions.findSimilar(post))} disabled={Boolean(busy)}><Search size={13} className={busy === 'similar' ? 'spin' : ''} />{busy === 'similar' ? t('Searching…') : t('Find similar')}</button> : null}
          {stackActions && Number(post.stackSize) > 1 ? <button type="button" role="menuitem" onClick={(event) => run(event, 'separate', () => stackActions.separate([post.postKey || `${post.account}:${post.shortcode}`]))} disabled={Boolean(busy)}>↗ {t('Separate from stack')}</button> : null}
          {post.group === 'sentient' && <button
            type="button"
            role="menuitem"
            onClick={(event) => run(event, 'promo', () => onFlags(post, { is_promo: !post.isPromo }))}
            disabled={Boolean(busy)}
          >
            <Megaphone size={13} />
            {post.isPromo ? 'Remove promo' : 'Mark as promo'}
          </button>}
          <button
            type="button"
            role="menuitem"
            onClick={(event) => run(event, 'hide', () => onFlags(post, { hidden: !post.hidden }))}
            disabled={Boolean(busy)}
          >
            {post.hidden ? <Eye size={13} /> : <EyeOff size={13} />}
            {post.hidden ? 'Unhide' : 'Hide'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(event) => run(event, 'reload', () => onReload(post))}
            disabled={Boolean(busy)}
          >
            <RefreshCw size={13} className={busy === 'reload' ? 'spin' : ''} />
            {busy === 'reload' ? 'Reloading...' : 'Reload counts'}
          </button>
          {/* Promo is inferred from the caption hashtag as well as the flag,
              so say so rather than showing a toggle that looks stuck on. */}
          {isPromo && !post.isPromo ? (
            <p className="post-menu-note">Tagged {PROMO_HASHTAG}</p>
          ) : null}
          </>}
          {note ? <p className="post-menu-note" role="status">{note}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

// Sits directly left of the post-menu button. A conic-gradient pie rather
// than an SVG/icon set: the filled wedge is just one angle, so a continuous
// fraction draws as easily as a stepped one -- no extra markup either way.
const FreshnessRing = memo(function FreshnessRing({ timestamp }) {
  const fraction = freshnessFraction(timestamp);
  // Without this the ring only visibly moves when something else causes the
  // card to re-render (the 3-minute poll, a filter change) -- ticking on its
  // own timer is what makes a continuous fraction actually read as a live
  // clock rather than a value that happens to be more precise. Scoped to
  // just this instance and only while there's still a ring to drain, so it
  // costs nothing for the vast majority of posts that are already stale.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (fraction <= 0) return undefined;
    const timer = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, [fraction > 0]);
  if (fraction <= 0) return null;
  const filledDeg = fraction * 360;
  const hoursLeft = FRESHNESS_WINDOW_HOURS - (Date.now() - timestamp) / 3600000;
  const leftLabel = hoursLeft >= 1 ? `${hoursLeft.toFixed(1)}h` : `${Math.max(1, Math.round(hoursLeft * 60))}m`;
  return (
    <span
      className="freshness-ring"
      style={{
        background: `conic-gradient(var(--accent) 0deg ${filledDeg}deg, rgba(255,255,255,.16) ${filledDeg}deg 360deg)`,
      }}
      role="img"
      aria-label={`New post, fading over its first ${FRESHNESS_WINDOW_HOURS} hours -- about ${leftLabel} left`}
      title={`New post · fades out over its first ${FRESHNESS_WINDOW_HOURS}h (~${leftLabel} left)`}
    />
  );
});

export const PostCard = memo(function PostCard({ post, goldenNugget, priority, selected, onSelect, onFlags, onReload, onAssign, onQuickAdd, onQuickAddSuccess, canPool, canSuggest, draggable, onDragStart, onDragOver, onDrop, hideCaption = false, readOnly = false, animateSelection = true }) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const { t } = usePrefs();
  // Posts created from scratch in Queue have no source account; never
  // attribute them to the default handle.
  const manual = !post.account && post.isCustom;
  const accountLabel = post.account || (manual ? t('Manual post') : IG_HANDLE);
  const handleClick = (event) => {
    if (event.target.closest('button,a,input,select,textarea,[role="menu"],.post-menu')) return;
    if (animateSelection) sendCardToSide(event.currentTarget, post.postKey);
    onSelect(post.postKey);
  };
  const handleKeyDown = (event) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (animateSelection) sendCardToSide(event.currentTarget, post.postKey);
      onSelect(post.postKey);
    }
  };
  const stopAction = (event) => {
    event.stopPropagation();
  };
  const effects = hotEffects(post);
  const isConfirmedGoldenNugget = goldenNugget?.label === 'golden_nugget';
  const isPromisingNugget = goldenNugget?.label === 'promising';
  const cardClassName = `post-card obs-card${post.showsHotBadge ? ' obs-card-hot' : ''}${effects.className}${post.hidden ? ' post-card-hidden' : ''}${isConfirmedGoldenNugget ? ' post-card-golden-nugget' : ''}`;
  // Promo is either detected from the caption hashtag or set explicitly on
  // the post (the card's ... menu writes that flag), so a promo that didn't
  // use the tag can still be marked by hand.
  const isPromo = Boolean(post.isPromo) || PROMO_HASHTAG_RE.test(post.caption || '');

  return (
    <article
      {...obsidianCardHandlers}
      style={hotMetalStyle(post)}
      className={cardClassName}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-context-type="post"
      data-context-title={post.headline || post.caption || post.account || 'Post'}
      data-context-post-key={post.postKey}
      data-context-account={post.account || ''}
      data-context-shortcode={post.shortcode || ''}
      data-context-permalink={post.permalink || ''}
      data-context-quick-add={canPool ? 'true' : 'false'}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
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
              <span className="post-avatar-initials">{manual ? <PenLine size={14} /> : (post.account || '?').slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="post-user-copy">
            <strong title={accountLabel}>{accountLabel}</strong>
            <span>{formatDate(post.postDate)}</span>
          </div>
        </div>
        <div className="post-header-actions">
          <FreshnessRing timestamp={post.timestamp} />
          {!readOnly ? <PostMenu post={post} isPromo={isPromo} onFlags={onFlags} onReload={onReload} onAssign={onAssign} onQuickAdd={onQuickAdd} onQuickAddSuccess={onQuickAddSuccess} canPool={canPool} canSuggest={canSuggest} /> : null}
        </div>
      </div>

      <CoverImage className={`post-media ${posterTheme(post.type)}${post.isVideo && post.showsHotBadge ? ' has-video-hot' : ''}`} post={post} priority={priority}>
        {post.showsHotBadge ? <><span className="obs-metal" aria-hidden="true" /><span className="obs-foil" aria-hidden="true" /><span className="obs-glare" aria-hidden="true" /></> : <span className="obs-soft-glare" aria-hidden="true" />}
        {post.isDeleted ? <div className="post-deleted-overlay" title="Deleted from Instagram" aria-label="Deleted from Instagram"><Trash2 size={42} strokeWidth={2.4} /></div> : null}
        {post.isVideo ? (
          <div className="media-badge">
            <Video size={13} />
            Video
          </div>
        ) : null}
        {post.showsHotBadge ? <HotBadge post={post} /> : null}
        {goldenNugget ? <div className={`golden-nugget-badge${isPromisingNugget ? ' is-promising' : ''}`} title={`${isPromisingNugget ? 'Promising idea' : 'Golden nugget'}${goldenNugget.targetAccount ? ` for @${goldenNugget.targetAccount}` : ''}`}><Sparkles size={12} />{isPromisingNugget ? 'Promising' : 'Golden nugget'}</div> : null}
        {isPromo ? (
          <div className="promo-ribbon" title={`Promo (${PROMO_HASHTAG})`}>
            <span>Promo</span>
          </div>
        ) : null}
        {post.queueState && post.queueState !== 'cancelled' ? (
          <div className={`queue-source-state state-${post.queueState}`} title={`Queue · ${post.queueState.replace('_', ' ')}`}>
            <ListTodo size={11} />{editorialStates[post.queueState] || post.queueState}
          </div>
        ) : null}
        {post.queueAttribution ? (
          <div className="queue-attribution-badge" title={`Created through Queue by ${post.queueAttribution.designerEmail}`}>
            <Check size={11} />{post.queueAttribution.designerEmail?.split('@')[0] || 'Queue'}
          </div>
        ) : null}
      </CoverImage>

      <div className="post-editorial-actions" onClick={stopAction}>
        <button type="button" onClick={(event) => { sendCardToSide(event.currentTarget.closest('.post-card'), post.postKey); onSelect(post.postKey); }}>View details</button>
        {post.queueRequestId && post.queueState !== 'cancelled' ? <a className="editorial-primary" href={`/queue.html?r=${encodeRouteState({ task: post.queueRequestId })}`}>Open in Queue</a> : canPool ? <button type="button" className="editorial-primary" onClick={() => onAssign(post)}>Send to Pool</button> : canSuggest ? <a className="editorial-primary" href={suggestionLink(post)}>Suggest post</a> : null}
        <a href={post.permalink} target="_blank" rel="noreferrer">Original <ExternalLink size={11} /></a>
      </div>

      <div className="post-copy">
        <div className="post-likes">{formatLikes(post.likes)} likes</div>
        {!hideCaption ? <p>
          <strong title={accountLabel}>{accountLabel}</strong> {post.headline || post.excerpt}
        </p> : null}
        <div className="post-footer">
          <span>{post.comments != null && Number.isFinite(Number(post.comments)) ? compactFormatter.format(post.comments) : '—'} comments</span>
          <span>{formatDate(post.postDate)}</span>
        </div>
      </div>
    </article>
  );
});

// Decorative stand-in for the cards peeking behind a collapsed stack. Same
// silhouette and header as PostCard, but no cover image, menu or handlers:
// only its edges are visible, and a gallery can hold many stacks.
export const PostCardLayer = memo(function PostCardLayer({ post }) {
  const account = post.account || IG_HANDLE;
  return (
    <article className={`post-card obs-card${post.showsHotBadge ? ' obs-card-hot' : ''}`} style={hotMetalStyle(post)}>
      <div className="post-header">
        <div className="post-user">
          <div className="post-avatar" aria-hidden="true">
            {ACCOUNT_PROFILE_IMAGES[post.account] ? <img src={ACCOUNT_PROFILE_IMAGES[post.account]} alt="" /> : <span className="post-avatar-initials">{account.slice(0, 2).toUpperCase()}</span>}
          </div>
          <div className="post-user-copy">
            <strong>{account}</strong>
            <span>{formatDate(post.postDate)}</span>
          </div>
        </div>
      </div>
      <div className={`post-media ${posterTheme(post.type)}`} />
    </article>
  );
});

// The card shown in the Selected post view. The landed flight clone ignores
// pointer events, so clicks reach this slot: they open the original post.
// Controls inside the fallback card (menu, actions) keep their own behavior.
// With `menuProps`, a live "..." menu is placed over the landed clone's button
// (card-flight publishes its position), since the clone itself is static.
export function InspectorCardSlot({ post, sideview, menuProps, children }) {
  const { t } = usePrefs();
  const permalink = post?.permalink;
  const open = () => { if (permalink) window.open(permalink, '_blank', 'noopener,noreferrer'); };
  return (
    <section
      className={`obs-card-slot${permalink ? ' is-link' : ''}`}
      data-obs-sideview={sideview}
      role={permalink ? 'link' : undefined}
      tabIndex={permalink ? 0 : undefined}
      aria-label={permalink ? t('Open original') : undefined}
      title={permalink ? t('Open original') : undefined}
      onClick={(event) => { if (!event.target.closest('button,a,input,select,textarea,[role="menu"],.post-menu')) open(); }}
      onKeyDown={(event) => { if (event.target === event.currentTarget && event.key === 'Enter') { event.preventDefault(); open(); } }}
    >
      {children}
      {menuProps && post ? (
        <div className="obs-slot-menu">
          <PostMenu key={post.postKey} post={post} isPromo={Boolean(post.isPromo) || PROMO_HASHTAG_RE.test(post.caption || '')} {...menuProps} />
        </div>
      ) : null}
    </section>
  );
}
