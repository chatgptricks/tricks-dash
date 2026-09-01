import { Fragment, memo, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowUpDown,
  AtSign,
  BarChart3,
  Bookmark,
  Check,
  CalendarDays,
  ChevronDown,
  ExternalLink,
  Filter,
  Flame,
  HardDrive,
  Heart,
  ImagePlus,
  Link2,
  ListTodo,
  LogOut,
  MessageCircle,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Plus,
  Power,
  Eye,
  EyeOff,
  Megaphone,
  RefreshCw,
  RotateCcw,
  ScanText,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Sun,
  TrendingUp,
  Users,
  X,
  Video,
  Zap,
} from 'lucide-react';
import { browserPopupRedirectResolver, getRedirectResult, onAuthStateChanged, signOut } from 'firebase/auth';
import { describeSignInError, firebaseAuth, startGoogleSignIn } from './firebase';
import { clearSsoCookie, startSsoRefresh, trySsoSignIn } from './sso';
import { PrefsProvider, usePrefs } from './prefsContext';
import { ACCENT_CHOICES, accentHex } from './prefs';
import { API_BASE, IG_HANDLE, apiFetch } from './api';
import { readDashboardSnapshot, writeDashboardSnapshot } from './dashboardCache';
import { followQueueLive } from './queueLive';
import { decodeRouteState, encodeRouteState } from './urlCodec';
import {
  CoverImage,
  HotBadge,
  InstagramLink,
  PostDetailPanel,
  SelectedPost,
  hotEffects,
  hotTier,
  posterTheme,
} from './postDetail';
import chatgptricksProfileImage from './assets/chatgptricks-profile.jpg';
import traselveloralProfileImage from './assets/traselveloreal-profile.jpg';

// Frontend-only fallback for the ~16 legacy endpoints that still check a
// shared password server-side. Firebase is now the real security boundary
// (nothing gets this far without a valid, allowlisted Google session), so
// this is just a fixed value the UI supplies automatically -- there is no
// password prompt anywhere anymore.
const LEGACY_REFRESH_PASSWORD = 'sentient2026';

// Account onboarding can outlive the Settings tab (and often the browser
// refresh that an admin uses to check whether the scrape is done). Keep the
// small client-side record locally, then reconcile it with the server's
// backfill-status endpoint while the worker is alive. The actual import data
// remains server-side; this is only UI state and never contains credentials.
const SETTINGS_ACCOUNT_BACKFILLS_KEY = 'sentientdash.settings.accountBackfills.v1';

function readSettingsAccountBackfills() {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(SETTINGS_ACCOUNT_BACKFILLS_KEY) || '[]');
    return Array.isArray(value) ? value.filter((task) => task && task.handle) : [];
  } catch {
    return [];
  }
}

function persistSettingsAccountBackfills(tasks) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_ACCOUNT_BACKFILLS_KEY, JSON.stringify(tasks));
  } catch {
    // Storage can be unavailable in private browsing; the in-memory state
    // still keeps the current Settings view useful.
  }
}

const ACCOUNT_PROFILE_IMAGES = {
  chatgptricks: chatgptricksProfileImage,
  traselveloreal: traselveloralProfileImage,
};

const settingsUserAvatar = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.startsWith('/api/') ? `${API_BASE}${raw}` : raw;
};

// All/Sentient/Competitors tabs -- accounts themselves come from the
// backend's self-serve account registry (/api/dashboard/accounts), not a
// hardcoded list, so adding a new account never requires a frontend change.
const GROUP_TABS = [
  { value: 'all', label: 'All' },
  { value: 'sentient', label: 'Sentient' },
  { value: 'competitors', label: 'Competitors' },
  { value: 'hot', label: 'HOT' },
];

// How long a HOT post keeps showing its badge in the grid. 30h rather than
// 48h: two days still felt stale in practice -- the window covers a post's
// first full day plus the following morning, then lets go.
//
// This no longer bounds the HOT *tab*, which is a full history of everything
// that ever went hot (narrow it with the Published date filter). The badge
// stays time-boxed because it means "hot right now" in a mixed feed, whereas
// the tab is somewhere you go deliberately to look back.
const HOT_TAB_WINDOW_HOURS = 30;

// ---------------------------------------------------------------------------
// URL state
//
// The whole filter state lives in the query string and nowhere else. That gives
// reload-persistence and shareable links from the same mechanism: a reload just
// re-reads the URL, and a copied URL reproduces the exact view for anyone else.
// Deliberately NOT mirrored into localStorage -- a link with no params has to
// mean "clean view" for every person who opens it, otherwise a shared link
// silently shows the recipient their own saved filters instead of yours.
//
// Defaults are omitted from the URL, so the common case stays a bare path and
// only the parts you actually changed show up.
// ---------------------------------------------------------------------------
const URL_DEFAULTS = {
  q: '',
  tab: 'all',
  acc: '',
  type: 'All posts',
  media: 'all',
  sort: 'newest',
  likes: '',
  comments: '',
  from: '',
  to: '',
  range: 'all',
  promo: '',
  post: '',
  view: '',
  settingsTab: '',
};

// Each section has its own subdomain (hot.sentientdash.app, users.…). A
// Cloudflare Worker serves the right page under that hostname without
// redirecting, so the address bar keeps the subdomain -- which also means the
// browser's query string stays empty. Since this app reads its state from
// window.location, the section has to be derived from the hostname instead,
// or a bare subdomain would silently fall back to the "all" tab.
//
// These are defaults, not overrides: an explicit ?tab= always wins, so
// switching tabs on a subdomain and sharing that link still works.
const SUBDOMAIN_VIEWS = {
  hot: { tab: 'hot' },
  sentient: { tab: 'sentient' },
  competitors: { tab: 'competitors' },
  archive: { tab: 'all' },
  users: { view: 'admin' },
};

function subdomainDefaults() {
  if (typeof window === 'undefined') return {};
  const [sub, ...rest] = window.location.hostname.split('.');
  // Only trust the prefix on the real domain -- on localhost or a preview
  // host, "hot" could be a coincidence rather than a section.
  if (rest.join('.') !== 'sentientdash.app') return {};
  return SUBDOMAIN_VIEWS[sub] || {};
}

function readUrlState() {
  if (typeof window === 'undefined') return { ...URL_DEFAULTS };
  const params = new URLSearchParams(window.location.search);
  const state = { ...URL_DEFAULTS, ...subdomainDefaults() };
  const opaque = decodeRouteState(params.get('r'));
  if (opaque) {
    for (const key of Object.keys(URL_DEFAULTS)) {
      if (opaque[key] !== undefined && opaque[key] !== null) state[key] = String(opaque[key]);
    }
  }
  // Keep old shared links working; an explicitly supplied legacy value wins.
  for (const key of Object.keys(URL_DEFAULTS)) {
    const value = params.get(key);
    if (value !== null) state[key] = value;
  }
  return state;
}

function writeUrlState(state) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams();
  // Compare against the subdomain's own defaults so hot.sentientdash.app
  // doesn't write a redundant ?tab=hot. Switching to another tab there still
  // gets written, because it now differs from that host's default -- so the
  // Copy link button keeps producing a URL that reopens what you're seeing.
  const defaults = { ...URL_DEFAULTS, ...subdomainDefaults() };
  const payload = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = state[key];
    if (value === undefined || value === null) continue;
    const text = String(value);
    if (text === '' || text === String(fallback)) continue;
    payload[key] = text;
  }
  const opaque = encodeRouteState(payload);
  if (opaque && Object.keys(payload).length) params.set('r', opaque);
  const search = params.toString();
  const next = `${window.location.pathname}${search ? `?${search}` : ''}`;
  // replaceState, not pushState: filters change on every keystroke and slider
  // tick, and pushing each one would make the back button useless.
  window.history.replaceState(null, '', next);
}

const TYPE_OPTIONS = ['All posts', 'Carousel', 'Video', 'Image'];
const SORT_OPTIONS = [
  { value: 'likes-desc', label: 'Most liked' },
  { value: 'comments-desc', label: 'Most commented' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  // How hard a post beat its own account's HOT threshold. Comparable across
  // accounts with very different baselines, so it's the "most viral" ranking.
  { value: 'hot-rate', label: 'Hot rate' },
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
// Posts carrying this hashtag are paid placements. `\B` before the # and a
// word boundary after it so "#aitoolsentientlabs" doesn't match, while
// "...tool. #AIToolSentient" does regardless of case.
const PROMO_HASHTAG = '#aitoolsentient';
const PROMO_HASHTAG_RE = /#aitoolsentient\b/i;
// One emoji favicon per section, drawn as an inline SVG data URI.
//
// All the dashboard sections are the same index.html, so a static <link> can
// only ever show one icon for seven subdomains. Swapping it at runtime means a
// pinned tab for hot.sentientdash.app and one for archive.sentientdash.app are
// actually distinguishable, which is the entire point of pinning them.
const SECTION_ICONS = {
  hot: { emoji: '🔥', title: 'HOT' },
  sentient: { emoji: '🧠', title: 'Sentient' },
  competitors: { emoji: '👀', title: 'Competitors' },
  all: { emoji: '🎛️', title: 'Dashboard' },
  admin: { emoji: '👤', title: 'Users' },
};

// A bare emoji in an SVG <text> renders at whatever size the font gives it and
// sits on the baseline, so it gets clipped at the bottom of a 16px favicon.
// font-size 84 in a 100-box with dominant-baseline central and a 4px nudge
// keeps the whole glyph inside the viewBox for every emoji we use.
function emojiFaviconHref(emoji) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="54" font-size="84" text-anchor="middle" dominant-baseline="central">${emoji}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function useSectionFavicon(section) {
  useEffect(() => {
    const config = SECTION_ICONS[section];
    if (!config) return;
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/svg+xml';
    link.href = emojiFaviconHref(config.emoji);
    document.title = `${config.title} · sentientdash.app`;
  }, [section]);
}


// ---------------------------------------------------------------------------
// Language + theme
// ---------------------------------------------------------------------------
// One Settings entry point (gear icon) instead of a prefs strip, a separate
// admin gear, and an account-menu avatar as three unrelated controls. Same
// shape as the Settings button on Queue/Tracker/Insights: accent, theme and
// language live together with account info and, for admins, the same
// designer-account assignment tool Queue's Admin Tools panel exposes.
export function SettingsMenu({ email, avatarUrl, isAdmin, isDev, onSignOut, showSettingsLink = true }) {
  const { t, lang, theme, setLang, setTheme, accent, setAccent } = usePrefs();
  const [open, setOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setAvatarFailed(false); }, [avatarUrl]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="settings-menu" ref={ref}>
      <button
        type="button"
        className={open ? 'settings-menu-trigger is-active' : 'settings-menu-trigger'}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`${t('Settings')} · ${email || ''}`.trim()}
        title={t('Settings')}
      >
        {avatarUrl && !avatarFailed ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setAvatarFailed(true)} /> : <span>{(email || '?').trim().charAt(0).toUpperCase()}</span>}
      </button>
      {open ? (
        <div className="settings-menu-panel" role="menu">
          <div className="settings-menu-section">
            <span>{t('Accent color')}</span>
            <div className="settings-accent-picker">
              {ACCENT_CHOICES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={accent === value ? `accent-${value} is-on` : `accent-${value}`}
                  onClick={() => setAccent(value)}
                  aria-label={`${value} accent`}
                />
              ))}
              <label className="settings-custom-color" title={t('Custom color')}>
                <input
                  type="color"
                  value={accentHex(accent)}
                  onChange={(event) => setAccent(event.target.value)}
                  aria-label={t('Custom color')}
                />
                <span>{t('Custom')}</span>
              </label>
            </div>
          </div>
          <div className="settings-menu-section">
            <span>{t('Theme')}</span>
            <div className="settings-menu-segment">
              <button type="button" className={theme === 'dark' ? 'is-on' : ''} onClick={() => setTheme('dark')}><Moon size={13} />{t('Dark')}</button>
              <button type="button" className={theme === 'light' ? 'is-on' : ''} onClick={() => setTheme('light')}><Sun size={13} />{t('Light')}</button>
            </div>
          </div>
          <div className="settings-menu-section">
            <span>{t('Language')}</span>
            <div className="lang-toggle" role="group" aria-label="Language">
              {['en', 'es'].map((code) => (
                <button
                  key={code}
                  type="button"
                  className={lang === code ? 'lang-option is-on' : 'lang-option'}
                  onClick={() => setLang(code)}
                  aria-pressed={lang === code}
                >
                  {code === 'en' ? 'ENG' : 'ES'}
                </button>
              ))}
            </div>
          </div>
          {(isAdmin || isDev) && showSettingsLink ? (
            <div className="settings-menu-section settings-menu-admin">
              <span>{t('Command center')}</span>
              <a className="settings-menu-link" href={`${import.meta.env.BASE_URL}settings.html`}>
                <Settings size={13} />
                {t('Settings')}
              </a>
            </div>
          ) : null}
          <div className="settings-menu-footer">
            <small>{email}</small>
            <button type="button" className="settings-menu-signout" onClick={onSignOut}>
              <LogOut size={13} />
              {t('Sign out')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}


const PREDICT_URL = 'https://chatgptricks.github.io/cortex/';
// How long a HOT post keeps showing its badge. Deliberately the SAME window as
// the HOT tab: a badge that outlived the tab meant a post could look hot in the
// grid while being absent from the place you go to find hot posts. HOT is a
// "right now" signal -- past the window it's just a good post, and the numbers
// say so on their own.
const HOT_BADGE_WINDOW_HOURS = HOT_TAB_WINDOW_HOURS;
// Live data refresh cadence for an already-open tab (the backend refreshes
// itself automatically every 30 min during its active window; this just
// keeps an open dashboard in sync with that without a manual reload).
const AUTO_POLL_MS = 3 * 60 * 1000;
// A Render replacement normally takes less than a minute. Keep recovery
// frequent and predictable instead of exponentially backing off into a long
// blank wait; all normal reads are already guarded by apiFetch's short retry.
const RECONNECT_POLL_MS = 3_000;

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

// A plain linear slider from 0 to the dataset's max likes was nearly
// unusable: one viral post with millions of likes stretches the whole track
// across a range where every meaningful value (1k, 5k, 10k...) is crammed
// into the first couple of pixels. Fixed stops instead -- the slider's own
// value is an index into this list, not a like count.
const LIKES_STOPS = [0, 1000, 2000, 5000, 10000, 50000, 100000];

// Must match the thumb width set on .filter-engagement .compact-range
// input[type='range']::-webkit-slider-thumb / ::-moz-range-thumb in
// styles.css. The tick marks below the slider are positioned in JS using
// this exact value so they can never drift out of sync with a CSS-only edit.
const RANGE_THUMB_PX = 14;

// Maps an arbitrary likes count (e.g. from an older shared URL) to its
// closest stop, so the slider always lands on one of the fixed positions
// instead of silently clamping or erroring on a value that isn't in the list.
function likesStopIndex(value) {
  let closest = 0;
  let bestDiff = Infinity;
  LIKES_STOPS.forEach((stop, index) => {
    const diff = Math.abs(stop - value);
    if (diff < bestDiff) {
      bestDiff = diff;
      closest = index;
    }
  });
  return closest;
}
// chatgptricks' monthly Canva design doc, keyed by "YYYY-MM". Months with a
// single doc for the whole month store { url }; months split into two docs
// (see the source list) store { a, b } -- which one a given post maps to is
// decided by day-of-month in canvaLinkForPost below (1st-15th -> a, 16th
// onward -> b), per an explicit decision on how these get split.
const CANVA_DESIGNS = {
  '2025-01': { url: 'https://www.canva.com/design/editor/shell?designId=DAGeMj8IriI&extension=wlbjD0yXsAgCTumA0nRalQ&mode=edit' },
  '2025-02': { url: 'https://www.canva.com/design/editor/shell?designId=DAGhqScjOR8&extension=umu4gkVjx_r6eBx7faP70g&mode=edit' },
  '2025-03': { url: 'https://www.canva.com/design/editor/shell?designId=DAGjijmmefk&extension=ZcNWd6flzFuFyw8om5c7hg&mode=edit' },
  '2025-04': { url: 'https://www.canva.com/design/editor/shell?designId=DAGlaWE85DA&extension=r_OvcgpnZZSoc2YKL-BHUQ&mode=edit' },
  '2025-05': {
    a: 'https://www.canva.com/design/editor/shell?designId=DAGnw5weeTc&extension=pgcmgN8GWYvlCGScebb_YQ&mode=edit',
    b: 'https://www.canva.com/design/editor/shell?designId=DAGpQ79lgQA&extension=vK9Tod39Le-5BQ6RLIjIrQ&mode=edit',
  },
  '2025-06': { url: 'https://www.canva.com/design/editor/shell?designId=DAGbdOgiNak&extension=w45DIrxDBUacSwD6GK_qtw&mode=edit' },
  '2025-07': { url: 'https://www.canva.com/design/editor/shell?designId=DAGu5D_2OJM&extension=efbajomt6u0BcJ02g5ziOA&mode=edit' },
  '2025-08': { url: 'https://www.canva.com/design/editor/shell?designId=DAGwe2Ch8dI&extension=ZJUGx_zPO9galHPL8OjLnw&mode=edit' },
  '2025-09': { url: 'https://www.canva.com/design/editor/shell?designId=DAGzlzhjY3o&extension=W8gJcpYzTF5dEGMaJ_GQJg&mode=edit' },
  '2025-10': { url: 'https://www.canva.com/design/editor/shell?designId=DAG3Pcc78IE&extension=f-dCDO0sUZScl0zv_WNcqw&mode=edit' },
  '2025-11': { url: 'https://www.canva.com/design/editor/shell?designId=DAG5xN_3gvY&extension=MEa4__EfPZ48APT0oOCCmg&mode=edit' },
  '2025-12': { url: 'https://www.canva.com/design/editor/shell?designId=DAG8oAP2Qbs&extension=WtCOIKQZMhtvqpNsglVEXg&mode=edit' },
  '2026-01': {
    a: 'https://www.canva.com/design/editor/shell?designId=DAG-p7dp2G4&extension=ZFQCwzuywyANf7iSGpBQKw&mode=edit',
    b: 'https://www.canva.com/design/editor/shell?designId=DAHAP9ytKw4&extension=6W1kTRr9Cwxjl9HEh4QopA&mode=edit',
  },
  '2026-02': { url: 'https://www.canva.com/design/editor/shell?designId=DAHCUPS8ojc&extension=YSB20zIfLmo6vGgoIvXq1g&mode=edit' },
  '2026-03': { url: 'https://www.canva.com/design/editor/shell?designId=DAHFBYHiCaU&extension=DdvvzBemTqfTecDSN1x7eg&mode=edit' },
  '2026-04': {
    a: 'https://www.canva.com/design/editor/shell?designId=DAHG-Rq7TXM&extension=LEUUopHFNyb3Hcr3dpq-qQ&mode=edit',
    b: 'https://www.canva.com/design/editor/shell?designId=DAHIaNiBs2k&extension=Xxiwq0Wn6dIz_9El-nsoUg&mode=edit',
  },
  '2026-05': {
    a: 'https://www.canva.com/design/editor/shell?designId=DAHJoPgWbaw&extension=NUE57a6WJJp1rGwAeDHRdg&mode=edit',
    b: 'https://www.canva.com/design/editor/shell?designId=DAHLT_DomrE&extension=Zc-_C4V1wiUSbaY05wR7Zw&mode=edit',
  },
  '2026-06': {
    a: 'https://www.canva.com/design/editor/shell?designId=DAHM_3BHusk&extension=Ne1aBOBRCAHpHxPZzfvEsg&mode=edit',
    b: 'https://www.canva.com/design/editor/shell?designId=DAHOH7gL4d4&extension=VZpv8IRJuS3uPCQ4rUJP_A&mode=edit',
  },
  '2026-07': { url: 'https://www.canva.com/design/editor/shell?designId=DAHQk6XX7lQ&extension=xT3deI8-L3lHlS-EeYqdrg&mode=edit' },
};

// A standing permalink that always points at whichever design is currently
// active for the month that hasn't finished yet -- there's no dedicated
// CANVA_DESIGNS entry for the current month until it ends, at which point a
// specific link gets added above and this fallback stops applying to it
// (the next, now-current month falls back to this same permalink again).
const CURRENT_MONTH_CANVA_URL = 'https://www.canva.com/design/DAGr_aGMCF4/xWvA62aXKdC5rHjmtHe_gA/edit';

function canvaLinkForPost(postDateIso) {
  if (!postDateIso) return null;
  const d = new Date(postDateIso);
  if (Number.isNaN(d.getTime())) return null;
  const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const entry = CANVA_DESIGNS[key];
  if (entry) {
    return entry.url ? entry.url : d.getUTCDate() <= 15 ? entry.a : entry.b;
  }
  const now = new Date();
  const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return key === currentKey ? CURRENT_MONTH_CANVA_URL : null;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function formatDate(iso) {
  return dateFormatter.format(new Date(iso));
}

// Compact "how long ago" for the HOT pill -- shares the badge's own timestamp
// rather than re-fetching, so it's consistent with everything else computed
// at normalize time and refreshes on the same AUTO_POLL_MS cadence as the rest
// of the dashboard.
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

// Usage heatmap color scale. Log-based rather than linear against the max
// cell: request counts are extremely lopsided (one person refreshing a tab
// left open all day vs. someone who checks once), so a linear scale would
// leave every cell except the single busiest one looking equally "empty".
function usageCellColor(count) {
  if (!count) return 'rgba(255,255,255,.05)';
  const intensity = Math.min(1, 0.16 + Math.log2(count + 1) / 7);
  return `rgba(var(--accent-rgb),${intensity.toFixed(2)})`;
}

function typeLabel(value) {
  // Coerced rather than assumed: this runs on every card render, and a post
  // arriving without `type` used to throw here and blank the whole page.
  const text = String(value ?? '');
  if (text.startsWith('Carousel')) return 'Carousel';
  if (text.startsWith('Video')) return 'Video';
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
  // A post keeps its HOT flag forever once it earns it (permanent record); the
  // badge only shows while it's still inside the active refresh window.
  const isHot = Boolean(post.isHot);
  // The badge is permanent, like the flag itself. It used to expire after 30h,
  // which made sense when the HOT tab only covered that window -- but now that
  // the tab is a full history, a time-boxed badge meant browsing past hot
  // posts showed a grid with no HOT markers and no rates on it. If a post
  // earned HOT, it says so, and its multiplier stays visible.
  const showsHotBadge = isHot;
  // Still available for anything that wants "hot right now" rather than "was
  // ever hot" -- the recency is conveyed by the age shown on the badge.
  const isHotRecent = isHot && ageDays <= HOT_TAB_WINDOW_HOURS / 24;

  return {
    ...post,
    // Accounts repost each other, so a shortcode alone is not unique across the
    // dataset (~21 collisions today). Everything that identifies a post -- React
    // keys, selection, the sidebar lookup -- uses this instead.
    postKey: `${post.account || ''}:${shortcode || post.rank || ''}`,
    caption,
    headline,
    permalink,
    isVideo,
    postType,
    isHot,
    showsHotBadge,
    isHotRecent,
    searchText: [
      caption,
      post.excerpt,
      post.ocrText,
      post.shortcode,
      post.permalink,
      post.type,
      postType,
      post.musicSong,
      post.musicArtist,
    ]
      .map(normalizeSearchValue)
      .filter(Boolean)
      .join(' '),
    timestamp,
  };
}

// Splits a query into required terms and excluded terms: a token glued to a
// leading "-" (e.g. "-foto") must NOT appear, everything else must. This
// lets "prompts -foto" find prompt posts while filtering out ones that
// mention "foto", without needing separate include/exclude UI.
function parseSearchQuery(query) {
  const include = [];
  const exclude = [];
  for (const token of String(query || '').trim().split(/\s+/)) {
    if (!token) continue;
    const isExclusion = token.length > 1 && token.startsWith('-');
    const value = normalizeSearchValue(isExclusion ? token.slice(1) : token);
    if (!value) continue;
    (isExclusion ? exclude : include).push(value);
  }
  return { include, exclude };
}

function matchesSearch(post, query) {
  const { include, exclude } = parseSearchQuery(query);
  if (!include.length && !exclude.length) return true;
  for (const term of include) if (!post.searchText.includes(term)) return false;
  for (const term of exclude) if (post.searchText.includes(term)) return false;
  return true;
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
    // Posts with an unknown like count (null) must not drag the slider range
    // down to 0 -- Math.min/max would coerce null to 0 and skew the filter.
    if (post.likes !== null && post.likes !== undefined) {
      likesMin = Math.min(likesMin, post.likes);
      likesMax = Math.max(likesMax, post.likes);
    }
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

// dateFrom/dateTo hold either a plain "YYYY-MM-DD" (custom picks and the
// day-based presets) or a full ISO datetime (the rolling 24h/3d/7d presets,
// which need an exact hour rather than a whole-day boundary). Detect which by
// whether a "T" is already present rather than tracking it separately.
function parseDateBound(value, endOfDay) {
  if (!value) return null;
  if (value.includes('T')) return new Date(value).getTime();
  return new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`).getTime();
}

// "Last 24 hours" / "3 days" / "7 days" are anchored to the real current
// time, not the dataset's latest post -- so they keep sliding forward as new
// posts land instead of freezing at whatever was newest when the page
// happened to load. They carry a full ISO datetime (not just a date) so the
// filter can cut off at an exact hour: rounding out to whole calendar days
// (like the day-based presets below do) barely matters over 30-90 days, but
// would nearly double a 24-hour window.
function rollingSince(hours) {
  return new Date(Date.now() - hours * 3600000).toISOString();
}

function buildDatePresets(ranges) {
  const rollingPresets = [
    { value: '24h', label: 'Last 24 hours', from: rollingSince(24), to: '' },
    { value: '3d', label: 'Last 3 days', from: rollingSince(72), to: '' },
    { value: '7d', label: 'Last 7 days', from: rollingSince(168), to: '' },
  ];

  if (!ranges.dateMin || !ranges.dateMax) {
    return [{ value: 'all', label: 'All time', from: '', to: '' }, ...rollingPresets];
  }

  const latest = new Date(`${ranges.dateMax}T12:00:00`);
  const earliest = new Date(`${ranges.dateMin}T12:00:00`);
  const presets = [
    { value: 'all', label: 'All time', from: '', to: '' },
    ...rollingPresets,
    { value: 'latest-30', label: 'Latest 30 days', from: formatInputDate(new Date(latest.getTime() - 29 * 86400000)), to: ranges.dateMax },
    { value: 'latest-90', label: 'Latest 90 days', from: formatInputDate(new Date(latest.getTime() - 89 * 86400000)), to: ranges.dateMax },
  ];

  for (let year = latest.getFullYear(); year >= earliest.getFullYear(); year -= 1) {
    presets.push({ value: `year-${year}`, label: String(year), from: `${year}-01-01`, to: `${year}-12-31` });
  }

  return presets;
}

const DEV_EMAIL = 'esteban@sentientagency.io';
const ROLE_SWITCHER_DEFAULTS = Object.freeze({
  [DEV_EMAIL]: ['sales', 'pd', 'vc', 'trainee', 'admin'],
  'ivan@sentientagency.io': ['sales', 'pd', 'vc', 'trainee', 'admin'],
});
const ACTIVE_ROLE_PREVIEWS = new Set(['sales', 'pd', 'vc', 'trainee', 'admin']);
const hasActiveRolePreview = () => ACTIVE_ROLE_PREVIEWS.has(window.sessionStorage.getItem('sentient.queueRolePreview') || '');

export function DevRolePreview({ isDev, canSwitchRoles = false, availableRoles = [] }) {
  const [open, setOpen] = useState(false);
  const requestedRole = window.sessionStorage.getItem('sentient.queueRolePreview') || '';
  const options = [...new Set((isDev ? ROLE_SWITCHER_DEFAULTS[DEV_EMAIL] : availableRoles).filter((role) => ['sales', 'pd', 'vc', 'trainee', 'admin'].includes(role)))];
  const active = options.includes(requestedRole) ? requestedRole : '';
  if (!isDev && !canSwitchRoles) return null;
  const label = { sales: 'Sales', pd: 'Post Designer', vc: 'Viral Coordinator', trainee: 'Trainee', admin: 'Admin' }[active] || (isDev ? 'Dev' : 'Role');
  const choose = (event) => {
    const role = event.target.value;
    if (role) window.sessionStorage.setItem('sentient.queueRolePreview', role);
    else window.sessionStorage.removeItem('sentient.queueRolePreview');
    window.location.reload();
  };
  return <div className="dev-role-preview"><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}><span>{isDev ? 'DEV' : 'ROLE'}</span>{label}</button>{open ? <div className="dev-role-preview-panel"><strong>{isDev ? 'Role preview' : 'Active role'}</strong><p>{isDev ? 'Only visible to Esteban.' : 'Switch among your assigned roles.'}</p><label>Active role<select value={active} onChange={choose}><option value="">{isDev ? 'Dev · full access' : 'Use my default role'}</option>{options.map((role) => <option key={role} value={role}>{({ sales: 'Sales', pd: 'Post Designer', vc: 'Viral Coordinator', trainee: 'Trainee', admin: 'Admin' })[role]}</option>)}</select></label></div> : null}</div>;
}

function Dashboard({ userEmail, userPhoto, onSignOut, onUnauthorized }) {
  const knownRoleSwitcher = Object.prototype.hasOwnProperty.call(ROLE_SWITCHER_DEFAULTS, String(userEmail || '').trim().toLowerCase());
  const knownDev = String(userEmail || '').trim().toLowerCase() === DEV_EMAIL;
  const [dashboard, setDashboard] = useState({ posts: [], summary: {} });
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [connectionNotice, setConnectionNotice] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState(null);
  // Two-tier roles: everyone allowlisted sees the dashboard, only admins see
  // Settings. This is purely a UI convenience -- the backend rejects
  // /api/admin/* for non-admins regardless of what this flag says.
  const [isAdmin, setIsAdmin] = useState(false);
  const [operatingRole, setOperatingRole] = useState('sales');
  const [operatingRoles, setOperatingRoles] = useState(['sales']);
  const [isDev, setIsDev] = useState(knownDev);
  const [canSwitchRoles, setCanSwitchRoles] = useState(knownRoleSwitcher);
  const [availableRoles, setAvailableRoles] = useState(() => ROLE_SWITCHER_DEFAULTS[String(userEmail || '').trim().toLowerCase()] || []);
  const [queuePendingCount, setQueuePendingCount] = useState(0);
  const [assignmentPost, setAssignmentPost] = useState(null);
  const reconnectTimer = useRef(null);
  const reconnectAttempt = useRef(0);
  const dashboardLoader = useRef(null);
  const requestedRolePreview = window.sessionStorage.getItem('sentient.queueRolePreview') || '';
  const activeRolePreview = ACTIVE_ROLE_PREVIEWS.has(requestedRolePreview) ? requestedRolePreview : '';
  const rolePreviewActive = Boolean(activeRolePreview);
  // Apply the chosen preview synchronously. `/api/dashboard/me` remains the
  // authoritative permission source, but on a 50k-post dashboard its state
  // update can land several seconds after the cached catalogue paints. The
  // role floatie must not show a PD header and stale Dev/Coordinator tools (or
  // a VC header without them) during that window.
  const effectiveIsAdmin = rolePreviewActive ? activeRolePreview === 'admin' : isAdmin;
  const effectiveOperatingRoles = useMemo(
    () => (rolePreviewActive ? [...new Set([activeRolePreview, 'pd'])] : operatingRoles),
    [activeRolePreview, operatingRoles, rolePreviewActive],
  );
  // The role switcher is a real UI preview. Dev gets full access only when no
  // simulated role is active; otherwise this tab must behave exactly like the
  // selected role so permission audits are trustworthy.
  const baseCoordinatorAccess = (isDev && !rolePreviewActive) || isAdmin || operatingRoles.includes('vc');
  const coordinatorAccess = rolePreviewActive
    ? effectiveIsAdmin || effectiveOperatingRoles.includes('vc')
    : baseCoordinatorAccess;
  const posts = useMemo(() => dashboard.posts.map(normalizePost), [dashboard.posts]);
  const summary = dashboard.summary;
  const ranges = useMemo(() => calculateRanges(posts), [posts]);
  const datePresets = useMemo(() => buildDatePresets(ranges), [ranges]);

  const refreshQueueSummary = useCallback(async () => {
    try {
      const response = await apiFetch(`${API_BASE}/api/dashboard/queue/v2/summary`);
      if (!response.ok) return;
      const summary = await response.json();
      setQueuePendingCount(Number(summary.pending) || 0);
    } catch {
      // Queue is an extra workspace tool. A temporary failure must never
      // block the post library, and a retry happens on the next dashboard
      // refresh or when an assignment is saved.
    }
  }, []);
  // Access is independent from the post catalogue. During an ingestion or DB
  // reconnect the catalogue may be temporarily unavailable, but `/me` is a
  // lightweight auth request and must still establish the header tools.
  // Previously it was nested inside loadDashboard *after* posts/accounts had
  // loaded, so Admins and VCs lost Tracker/Insights exactly when the dashboard
  // showed its reconnect notice.
  const applyAccess = useCallback((body) => {
    if (!body) return;
    setIsAdmin(Boolean(body.is_admin));
    setOperatingRole(body.operating_role || 'sales');
    setOperatingRoles(body.operating_roles || [body.operating_role || 'sales']);
    setIsDev(Boolean(body.is_dev) || knownDev);
    setCanSwitchRoles(Boolean(body.can_role_switch) || knownRoleSwitcher);
    setAvailableRoles(Array.isArray(body.available_operating_roles) ? body.available_operating_roles : (ROLE_SWITCHER_DEFAULTS[String(userEmail || '').trim().toLowerCase()] || body.operating_roles || []));
  }, [knownDev, knownRoleSwitcher, userEmail]);
  const loadAccess = useCallback(async (signal) => {
    try {
      const response = await apiFetch(`${API_BASE}/api/dashboard/me`, { signal });
      if (response.ok) applyAccess(await response.json());
    } catch {
      // The dashboard retains any last successful role state. A transient
      // access check must never hide an already-authorized workspace.
    }
  }, [applyAccess]);
  const quickAddToPool = useCallback(async (post) => {
    try {
      const body = new FormData();
      body.append('account', post.account);
      body.append('shortcode', post.shortcode);
      body.append('production_points', '3');
      body.append('priority', 'normal');
      body.append('tags', '');
      const response = await apiFetch(`${API_BASE}/api/dashboard/queue/v2/pool`, { method: 'POST', body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || 'Could not add this post to Queue.');
      await refreshQueueSummary();
      setRefreshNotice({ type: 'success', message: 'Added to Queue with the default 3 PP setup.' });
    } catch (error) {
      setRefreshNotice({ type: 'error', message: error.message || 'Could not add this post to Queue.' });
    }
  }, [refreshQueueSummary]);

  // The shared contextual menu is mounted once per page and emits actions
  // instead of reaching into React internals. Resolve the post from the live
  // catalogue here so Quick add always uses the same permission checks and
  // optimistic queue badge as the visible card action.
  useEffect(() => {
    const onContextAction = (event) => {
      if (event.detail?.action !== 'quick-add' || !coordinatorAccess) return;
      const detail = event.detail || {};
      const post = posts.find((item) => (
        (detail.postKey && item.postKey === detail.postKey)
        || (detail.shortcode && item.shortcode === detail.shortcode && (!detail.account || item.account === detail.account))
      ));
      if (post) quickAddToPool(post);
    };
    window.addEventListener('sentient:context-action', onContextAction);
    return () => window.removeEventListener('sentient:context-action', onContextAction);
  }, [coordinatorAccess, posts, quickAddToPool]);

  useEffect(() => {
    refreshQueueSummary();
  }, [refreshQueueSummary, userEmail]);

  useEffect(() => {
    const controller = new AbortController();
    loadAccess(controller.signal);
    return () => controller.abort();
  }, [loadAccess]);

  // Queue publishes a durable revision for every pool, draft, assignment and
  // delivery change. Keep the dashboard's Queue badge in sync with that same
  // stream so users never have to reload the post library just to see new work.
  useEffect(() => {
    if (!(effectiveIsAdmin || effectiveOperatingRoles.some((role) => role === 'pd' || role === 'vc'))) return undefined;
    if (import.meta.env.MODE === 'test') return undefined;
    const controller = new AbortController();
    followQueueLive({ after: 0, signal: controller.signal, onEvent: () => refreshQueueSummary() });
    return () => controller.abort();
  }, [effectiveIsAdmin, effectiveOperatingRoles, refreshQueueSummary]);

  const loadDashboard = useCallback(async (signal, { silent = false } = {}) => {
    let loaded = false;
    try {
      if (!silent) {
        setLoading(true);
        setLoadError('');
      }
      const [postsResponse, accountsResponse] = await Promise.all([
        apiFetch(`${API_BASE}/api/dashboard/posts`, { signal }),
        apiFetch(`${API_BASE}/api/dashboard/accounts`, { signal }),
      ]);
      if (postsResponse.status === 401 || postsResponse.status === 403 || accountsResponse.status === 401 || accountsResponse.status === 403) {
        onUnauthorized();
        return;
      }
      if (!postsResponse.ok) throw new Error(`HTTP ${postsResponse.status}`);
      if (!accountsResponse.ok) throw new Error(`HTTP ${accountsResponse.status}`);
      const postsData = await postsResponse.json();
      const accountsData = await accountsResponse.json();
      if (!Array.isArray(postsData.posts) || !Array.isArray(accountsData.accounts)) {
        throw new Error('The shared post database returned an invalid response.');
      }
      setDashboard({ posts: postsData.posts, summary: postsData.summary || {} });
      setAccounts(accountsData.accounts);
      writeDashboardSnapshot({ posts: postsData.posts, summary: postsData.summary || {}, accounts: accountsData.accounts }).catch(() => {});
      loaded = true;
      reconnectAttempt.current = 0;
      setConnectionNotice('');
      if (reconnectTimer.current) {
        window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      loadAccess(signal);
    } catch (error) {
      if (error.name !== 'AbortError') {
        // Render can briefly replace the API instance during deploys. Do not
        // discard a loaded dashboard or turn a temporary 502 into a blocking
        // red error screen; keep the current UI and reconnect automatically.
        setLoadError('');
        setConnectionNotice('Reconnecting to the shared Post DB…');
        reconnectAttempt.current += 1;
        if (!reconnectTimer.current) {
          reconnectTimer.current = window.setTimeout(() => {
            reconnectTimer.current = null;
            dashboardLoader.current?.(undefined, { silent: true });
          }, RECONNECT_POLL_MS);
        }
      }
    } finally {
      // If the first request fails, keep the structural skeleton in place
      // until the automatic retry succeeds rather than replacing it with an
      // alarming database-error page.
      if (!signal?.aborted && loaded) setLoading(false);
    }
  }, [loadAccess, onUnauthorized]);

  dashboardLoader.current = loadDashboard;

  useEffect(() => {
    let active = true;
    // Render the last successful catalogue immediately. This is intentionally
    // separate from the live request below: a Render restart must never turn
    // a previously usable dashboard into an empty/error state.
    readDashboardSnapshot().then((snapshot) => {
      if (!active || !snapshot || !Array.isArray(snapshot.posts) || !Array.isArray(snapshot.accounts)) return;
      setDashboard({ posts: snapshot.posts, summary: snapshot.summary || {} });
      setAccounts(snapshot.accounts);
      setLoading(false);
    }).catch(() => {});
    const controller = new AbortController();
    loadDashboard(controller.signal);
    return () => { active = false; controller.abort(); };
  }, [loadDashboard]);

  useEffect(() => () => {
    if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
  }, []);

  useEffect(() => {
    if (!connectionNotice) return undefined;
    // Browsers throttle timers in a background tab. As soon as the user
    // returns to the Dash (or connectivity comes back), do not wait for a
    // throttled timer: make a fresh request immediately.
    const reconnectNow = () => {
      if (document.visibilityState === 'hidden') return;
      if (reconnectTimer.current) {
        window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      dashboardLoader.current?.(undefined, { silent: true });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') reconnectNow();
    };
    window.addEventListener('online', reconnectNow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('online', reconnectNow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [connectionNotice]);

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

  // Takes the password as an argument now: the Settings panel already holds it
  // in memory for the session, so it no longer needs a window.prompt.
  const handleRefresh = useCallback(async (password) => {
    if (!password) return;

    setRefreshing(true);
    setRefreshNotice(null);
    try {
      const response = await apiFetch(`${API_BASE}/api/dashboard/refresh`, {
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

  // Read once, at mount: the URL is the source of truth for the initial view,
  // and from then on the app writes to it rather than reading back.
  const initialUrl = useRef(readUrlState()).current;
  const [query, setQuery] = useState(initialUrl.q);
  const deferredQuery = useDeferredValue(query);
  const [activeGroup, setActiveGroup] = useState(initialUrl.tab);
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
  const [customLists, setCustomLists] = useState([]);
  // null = closed. Otherwise the list being created (id null) or edited.
  const [listEditor, setListEditor] = useState(null);

  const accountsInScope = useMemo(
    // 'hot' isn't a group -- it's a cross-account view, so every account stays
    // in scope and only the HOT-recency filter narrows the results.
    () => {
      if (activeGroup.startsWith('list:')) {
        const list = customLists.find((entry) => `list:${entry.id}` === activeGroup);
        // Unknown id (e.g. a stale link to a deleted list) falls back to the
        // full roster rather than rendering an empty, unexplained account box.
        return list ? accounts.filter((account) => list.handles.includes(account.handle)) : accounts;
      }
      return activeGroup === 'all' || activeGroup === 'hot'
        ? accounts
        : accounts.filter((account) => account.group === activeGroup);
    },
    [accounts, activeGroup, customLists],
  );
  const [selectedAccounts, setSelectedAccounts] = useState(() => new Set());
  const [backgroundTasks, setBackgroundTasks] = useState([]);

  // Custom lists fall back to the archive icon: they're user-made and there's
  // no sensible per-list emoji to pick.
  useSectionFavicon(SECTION_ICONS[activeGroup] ? activeGroup : 'all');

  // Claude's first Settings pass lived inside the Dashboard at ?view=admin.
  // Keep old bookmarks useful, but move them to the standalone command center
  // as soon as the role check confirms this user can open it.
  useEffect(() => {
    if (initialUrl.view !== 'admin' || !(effectiveIsAdmin || (isDev && !rolePreviewActive))) return;
    const params = new URLSearchParams();
    if (initialUrl.settingsTab) params.set('r', encodeRouteState({ tab: initialUrl.settingsTab }));
    window.location.replace(`${import.meta.env.BASE_URL}settings.html${params.size ? `?${params}` : ''}`);
  }, [initialUrl, effectiveIsAdmin, isDev, rolePreviewActive]);

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
        serverProgress: { phase: 'queued' },
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
          const response = await apiFetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(account.handle)}/avatar`, {
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
      // The background endpoint, not the synchronous one. A full history
      // import runs for minutes -- far longer than the proxy in front of the
      // API will hold an idle connection -- so the blocking call died every
      // time and left the account at zero posts with no explanation. This
      // starts the work server-side and polls for the outcome, so closing the
      // tab or losing the network no longer costs you the import.
      const finish = (patch) =>
        setBackgroundTasks((tasks) => tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)));

      try {
        // 2000 stays the default for the other two modes; the wizard only
        // sends a number when you explicitly picked a post count.
        const params = { password, results_limit: String(account.resultsLimit || 2000) };
        if (account.dateFrom) params.date_from = account.dateFrom;
        if (account.dateTo) params.date_to = account.dateTo;
        const response = await apiFetch(`${API_BASE}/api/admin/accounts/backfill-bg/${encodeURIComponent(account.handle)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(params),
        });
        const started = await response.json().catch(() => ({}));
        if (!response.ok) {
          finish({ phase: 'error', error: started.detail || 'Import failed to start.' });
          return;
        }
        if (started.already_running) {
          finish({ phase: 'error', error: `Another import (@${started.handle}) is still running. Try again once it finishes.` });
          return;
        }

        // Poll until the worker reports back. Generous ceiling: 2000 posts can
        // take a good while, and giving up early is what made this look broken.
        // 4s (rather than 10s) so the phase/counts below feel live rather than
        // stepping in visible jumps.
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts += 1;
          try {
            const statusResponse = await apiFetch(`${API_BASE}/api/admin/accounts/backfill-status`);
            const status = await statusResponse.json().catch(() => ({}));
            if (status.running) {
              finish({ serverProgress: status.progress || null });
              if (attempts >= 300) { // ~20 minutes
                clearInterval(poll);
                finish({ phase: 'unknown' });
                setTimeout(() => setBackgroundTasks((tasks) => tasks.filter((task) => task.id !== id)), 10000);
              }
              return;
            }
            clearInterval(poll);
            if (status.error) {
              finish({ phase: 'error', error: status.error });
              return;
            }
            finish({ phase: 'done', added: status.result?.added ?? 0, serverProgress: null });
            await loadDashboard(undefined, { silent: true });
            setTimeout(() => setBackgroundTasks((tasks) => tasks.filter((task) => task.id !== id)), 8000);
          } catch {
            // A dropped poll is not a failed import -- the work is server-side.
            if (attempts >= 300) {
              clearInterval(poll);
              finish({ phase: 'unknown' });
            }
          }
        }, 4000);
      } catch (error) {
        finish({ phase: 'error', error: 'Could not reach the server to start the import.' });
      }
    })();
  }, [loadDashboard]);

  const dismissBackgroundTask = useCallback((id) => {
    setBackgroundTasks((tasks) => tasks.filter((task) => task.id !== id));
  }, []);
  // Whenever the tab (or the account roster itself) changes, default back
  // to "everything in this tab selected" rather than carrying over a
  // narrower selection from a different tab's account list.
  //
  // Exception: the very first run after accounts load, when the URL named a
  // specific set. This effect fires on mount too, so without the guard it would
  // immediately overwrite a shared link's account selection with "all".
  const urlAccountsPending = useRef(Boolean(initialUrl.acc));
  // A stable key of *which handles exist*, not the accounts array itself.
  // loadDashboard() re-fetches every 3 minutes (AUTO_POLL_MS) and each poll
  // produces a brand-new array reference even when nothing actually changed,
  // so depending on `accounts` directly made this effect re-fire on every
  // silent poll and silently reset any manual account-selection filter back
  // to "everything in this tab" -- the account roster only really changes
  // when one is added/removed/reactivated, so key off that instead.
  const accountsKey = useMemo(() => accounts.map((account) => account.handle).sort().join(','), [accounts]);
  useEffect(() => {
    if (!accounts.length) return;
    if (urlAccountsPending.current) {
      urlAccountsPending.current = false;
      const inScope = new Set(accountsInScope.map((account) => account.handle));
      const fromUrl = initialUrl.acc.split(',').map((h) => h.trim()).filter((h) => inScope.has(h));
      if (fromUrl.length) {
        setSelectedAccounts(new Set(fromUrl));
        return;
      }
    }
    setSelectedAccounts(new Set(accountsInScope.map((account) => account.handle)));
  }, [activeGroup, accountsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [activeType, setActiveType] = useState(initialUrl.type);
  const [mediaFilter, setMediaFilter] = useState(initialUrl.media);
  const [sortBy, setSortBy] = useState(initialUrl.sort);
  const [minLikes, setMinLikes] = useState(initialUrl.likes === '' ? ranges.likesMin : Number(initialUrl.likes));
  const [minComments, setMinComments] = useState(initialUrl.comments === '' ? ranges.commentsMin : Number(initialUrl.comments));
  const [dateFrom, setDateFrom] = useState(initialUrl.from);
  const [dateTo, setDateTo] = useState(initialUrl.to);
  const [datePreset, setDatePreset] = useState(initialUrl.range);
  const [visibleCount, setVisibleCount] = useState(POSTS_PER_BATCH);
  const [selectedKey, setSelectedKey] = useState(initialUrl.post);
  const [isSidebarOpen, setIsSidebarOpen] = useState(Boolean(initialUrl.post));
  const [showHidden, setShowHidden] = useState(false);
  // Paid placements, flagged either by the #aitoolsentient hashtag or by
  // hand from the card menu. Both count -- the hashtag is the automatic
  // signal, the manual flag is the correction when it's missing.
  const [promoOnly, setPromoOnly] = useState(initialUrl.promo === '1');
  // HOT tab: false shows only what's hot now, true adds everything older.
  const [showHotHistory, setShowHotHistory] = useState(false);
  const { t } = usePrefs();
  const topbarRef = useRef(null);
  const groupTabsRef = useRef(null);
  const leftPaneRef = useRef(null);
  const resultsScrollRef = useRef(null);
  const searchInputRef = useRef(null);
  const [shareCopied, setShareCopied] = useState(false);
  // Only meaningful on narrow viewports, where the six popover triggers
  // collapse behind a single "Filters" button.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Cmd/Ctrl+K and "/" jump to the search box. Search is the most-used control
  // on the page and until now had no keyboard route to it at all.
  useEffect(() => {
    const onKeyDown = (event) => {
      const key = event.key?.toLowerCase();
      const isShortcut = (key === 'k' && (event.metaKey || event.ctrlKey))
        // Bare "/" only when you're not already typing somewhere.
        || (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey
            && !/^(input|textarea|select)$/i.test(event.target?.tagName || '')
            && !event.target?.isContentEditable);
      if (!isShortcut) return;
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // The URL is already up to date by the time this runs (the effect below keeps
  // it in sync), so copying it is just reading location.href.
  const copyShareLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1600);
    } catch {
      // Clipboard is blocked outside a secure context or without permission;
      // select the URL instead so the person can copy it by hand.
      window.prompt('Copy this link:', window.location.href);
    }
  }, []);

  // Mirror the filter state into the URL. Only the account selection needs
  // special handling: "all accounts in this tab" is the default, so writing the
  // full list every time would bloat every URL with something that carries no
  // information. It's only recorded when it's actually a narrower subset.
  useEffect(() => {
    const inScope = accountsInScope.map((account) => account.handle);
    const isEveryAccount =
      inScope.length > 0 && inScope.every((handle) => selectedAccounts.has(handle))
      && selectedAccounts.size === inScope.length;
    writeUrlState({
      q: query,
      tab: activeGroup,
      acc: isEveryAccount ? '' : [...selectedAccounts].join(','),
      type: activeType,
      media: mediaFilter,
      sort: sortBy,
      // <= not ===: ranges.likesMin is 0 before posts load and the real
      // minimum afterwards, so an untouched slider stops matching it mid-load
      // and would write a meaningless likes=0 into every URL.
      likes: minLikes <= ranges.likesMin ? '' : minLikes,
      comments: minComments <= ranges.commentsMin ? '' : minComments,
      from: dateFrom,
      to: dateTo,
      range: datePreset,
      promo: promoOnly ? '1' : '',
      // Only when the sidebar is actually open. `selected` falls back to the
      // first result so the preview pane always has something to show, and an
      // effect writes that back into selectedKey -- meaning selectedKey is set
      // even when nobody opened anything. Sharing that would pin a stranger's
      // link to whichever post happened to sort first.
      post: isSidebarOpen ? selectedKey : '',
      view: '',
    });
  }, [
    query, activeGroup, selectedAccounts, accountsInScope, activeType, mediaFilter,
    sortBy, minLikes, minComments, dateFrom, dateTo, datePreset, promoOnly, selectedKey,
    isSidebarOpen, ranges.likesMin, ranges.commentsMin,
  ]);

  // Switching tabs changes which accounts are in scope, but the effect that
  // re-selects them runs *after* this render -- so for one pass the selection
  // still holds only the previous tab's handles and nothing matches, flashing
  // "0 results" (easy to misread as a broken date filter). Resolve the
  // selection here instead: keep only in-scope handles, and treat an empty
  // result as "everything in this tab".
  const effectiveAccounts = useMemo(() => {
    const inScope = accountsInScope.map((account) => account.handle);
    const chosen = inScope.filter((handle) => selectedAccounts.has(handle));
    return new Set(chosen.length ? chosen : inScope);
  }, [accountsInScope, selectedAccounts]);

  const activeList = useMemo(
    () =>
      activeGroup.startsWith('list:')
        ? customLists.find((list) => `list:${list.id}` === activeGroup) || null
        : null,
    [activeGroup, customLists],
  );

  const filtered = useMemo(() => {
    const minDate = parseDateBound(dateFrom, false);
    const maxDate = parseDateBound(dateTo, true);
    const output = [];

    for (const post of posts) {
      if (activeGroup === 'hot') {
        // Default view is what's hot right now; the full history is opt-in
        // via "Show historical" so the tab opens on a short, current list
        // rather than hundreds of past winners.
        if (showHotHistory ? !post.isHot : !post.isHotRecent) continue;
      } else if (activeList) {
        // A custom list is a hand-picked set of accounts, so it cuts across
        // the sentient/competitors split rather than sitting inside it.
        if (!activeList.handles.includes(post.account)) continue;
      } else if (activeGroup !== 'all' && post.group !== activeGroup) continue;
      // Hidden posts are filtered out, not deleted -- the Visibility filter is
      // how you get back to them to unhide. Without that switch, hiding would
      // be effectively irreversible from the UI.
      if (showHidden ? !post.hidden : Boolean(post.hidden)) continue;
      if (promoOnly && !(post.isPromo || PROMO_HASHTAG_RE.test(post.caption || ''))) continue;
      if (!effectiveAccounts.has(post.account)) continue;
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
      // Ranking by how hard a post beat its own account's threshold is the
      // only fair comparison across accounts whose baselines differ by an
      // order of magnitude. It used to be forced on the HOT tab, but now that
      // the tab spans all history that would pin the same all-time winners to
      // the top forever -- so it's an explicit sort option instead, and the
      // HOT tab otherwise honours the Order control like every other view.
      if (sortBy === 'hot-rate') {
        const diff = (b.hotMultiplier || 0) - (a.hotMultiplier || 0);
        if (diff) return diff;
        return (b.timestamp || 0) - (a.timestamp || 0);
      }
      // Everywhere else HOT posts are NOT floated to the top: they sit in their
      // natural position for the chosen sort and filters, and are identified by
      // the badge alone. The dedicated HOT tab is where they get surfaced.
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
  }, [posts, activeGroup, effectiveAccounts, activeType, mediaFilter, minLikes, minComments, dateFrom, dateTo, deferredQuery, sortBy, showHidden, promoOnly, activeList, showHotHistory]);

  // Leaving the HOT tab collapses history again, so coming back always
  // opens on "what's hot now" rather than a stale expanded state.
  useEffect(() => {
    if (activeGroup !== 'hot' && showHotHistory) setShowHotHistory(false);
  }, [activeGroup, showHotHistory]);

  useEffect(() => {
    setVisibleCount(POSTS_PER_BATCH);
  }, [deferredQuery, activeGroup, selectedAccounts, activeType, mediaFilter, minLikes, minComments, dateFrom, dateTo, sortBy, showHidden, showHotHistory]);

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
    promoOnly,
    showHidden,
  ].filter(Boolean).length;

  // One chip per active filter, each able to clear just itself.
  //
  // With the controls behind popovers there'd otherwise be no way to see what
  // is narrowing the set without opening all six -- and the old strip had the
  // same blind spot the moment it scrolled away. These chips are the only
  // always-visible answer to "why am I seeing 412 of 2,655?".
  //
  // Sort is included even though it isn't strictly a filter: it changes what
  // you see first, and being able to get back to Newest in one click is worth
  // more than taxonomic purity.
  const activeFilterChips = useMemo(() => {
    const chips = [];
    if (query.trim()) {
      chips.push({ key: 'q', label: `“${query.trim()}”`, clear: () => setQuery('') });
    }
    if (selectedAccounts.size < accountsInScope.length) {
      const label =
        selectedAccounts.size === 1
          ? accountsInScope.find((account) => selectedAccounts.has(account.handle))?.label ?? '1 account'
          : `${selectedAccounts.size} of ${accountsInScope.length} accounts`;
      chips.push({
        key: 'acc',
        label,
        clear: () => setSelectedAccounts(new Set(accountsInScope.map((account) => account.handle))),
      });
    }
    if (activeType !== 'All posts') {
      chips.push({ key: 'type', label: TYPE_LABELS[activeType] ?? activeType, clear: () => setActiveType('All posts') });
    }
    if (mediaFilter !== 'all') {
      const label = MEDIA_OPTIONS.find((option) => option.value === mediaFilter)?.label ?? mediaFilter;
      chips.push({ key: 'media', label, clear: () => setMediaFilter('all') });
    }
    if (datePreset !== 'all' || dateFrom || dateTo) {
      const preset = datePresets.find((option) => option.value === datePreset);
      const label = preset && datePreset !== 'custom'
        ? preset.label
        : [dateFrom || '…', dateTo || '…'].join(' → ');
      chips.push({
        key: 'date',
        label,
        clear: () => { setDatePreset('all'); setDateFrom(''); setDateTo(''); },
      });
    }
    if (minLikes > 0) {
      chips.push({ key: 'likes', label: `${compactFormatter.format(minLikes)}+ likes`, clear: () => setMinLikes(0) });
    }
    if (minComments > 0) {
      chips.push({
        key: 'comments',
        label: `${compactFormatter.format(minComments)}+ comments`,
        clear: () => setMinComments(0),
      });
    }
    if (sortBy !== 'newest') {
      const label = SORT_OPTIONS.find((option) => option.value === sortBy)?.label ?? sortBy;
      chips.push({ key: 'sort', label, clear: () => setSortBy('newest') });
    }
    return chips;
  }, [
    query, selectedAccounts, accountsInScope, activeType, mediaFilter,
    datePreset, dateFrom, dateTo, datePresets, minLikes, minComments, sortBy,
  ]);

  // Short status strings for the popover triggers, so a collapsed filter still
  // says what it's doing ("Date · Last 7 days" rather than a bare "Date").
  const accountSummary = selectedAccounts.size < accountsInScope.length
    ? (selectedAccounts.size === 1
        ? accountsInScope.find((account) => selectedAccounts.has(account.handle))?.label
        : String(selectedAccounts.size))
    : '';
  const typeSummary = [
    activeType !== 'All posts' ? TYPE_LABELS[activeType] ?? activeType : '',
    promoOnly ? 'Promo' : '',
    showHidden ? 'Hidden' : '',
  ].filter(Boolean).join(', ');
  const dateSummary = datePreset !== 'all' && datePreset !== 'custom'
    ? datePresets.find((option) => option.value === datePreset)?.label
    : (dateFrom || dateTo ? 'Custom' : '');
  const engagementSummary = [
    minLikes > 0 ? `${compactFormatter.format(minLikes)}+` : '',
    minComments > 0 ? `${compactFormatter.format(minComments)}+ 💬` : '',
  ].filter(Boolean).join(' · ');

  const selected = useMemo(() => {
    if (!filtered.length) return null;
    return filtered.find((post) => post.postKey === selectedKey) ?? filtered[0];
  }, [filtered, selectedKey]);

  useEffect(() => {
    if (selected?.postKey && selectedKey !== selected.postKey) {
      setSelectedKey(selected.postKey);
    }
  }, [selected, selectedKey]);

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
      setPromoOnly(false);
      setShowHidden(false);
      setVisibleCount(POSTS_PER_BATCH);
    });
  }, [accountsInScope]);

  const applyDatePreset = useCallback((value) => {
    const preset = datePresets.find((option) => option.value === value);
    setDatePreset(value);
    setDateFrom(preset?.from ?? '');
    setDateTo(preset?.to ?? '');
  }, [datePresets]);

  const loadLists = useCallback(async () => {
    try {
      const response = await apiFetch(`${API_BASE}/api/dashboard/lists`);
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.lists)) setCustomLists(data.lists);
    } catch {
      // Lists are an enhancement -- never block the dashboard on them.
    }
  }, []);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  const saveList = useCallback(async (draft) => {
    const body = new FormData();
    body.append('name', draft.name);
    body.append('handles', draft.handles.join(','));
    if (draft.id) body.append('list_id', String(draft.id));
    const response = await apiFetch(`${API_BASE}/api/dashboard/lists`, { method: 'POST', body });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.detail || `HTTP ${response.status}`);
    }
    const data = await response.json();
    await loadLists();
    setActiveGroup(`list:${data.list.id}`);
    return data.list;
  }, [loadLists]);

  const deleteList = useCallback(async (listId) => {
    const body = new FormData();
    body.append('list_id', String(listId));
    const response = await apiFetch(`${API_BASE}/api/dashboard/lists/delete`, { method: 'POST', body });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // Fall back to All rather than leaving the user on a tab that no longer
    // exists (which would render an empty grid with no way to tell why).
    setActiveGroup('all');
    await loadLists();
  }, [loadLists]);

  // Counted across the whole library, not the current filters: the badge is
  // there to tell you hidden posts exist at all.
  const hiddenCount = useMemo(() => posts.reduce((total, post) => total + (post.hidden ? 1 : 0), 0), [posts]);

  // Hot posts that are no longer current -- the number behind the
  // "Show historical" button.
  const hotHistoryCount = useMemo(
    () => posts.reduce((total, post) => total + (post.isHot && !post.isHotRecent ? 1 : 0), 0),
    [posts],
  );

  // Patch one post in place. The dashboard payload is tens of thousands of
  // posts, so re-fetching the whole thing to reflect a single flag would be
  // both slow and visually jarring (scroll position, image reloads).
  const patchPost = useCallback((account, shortcode, patch) => {
    setDashboard((current) => ({
      ...current,
      posts: current.posts.map((post) =>
        post.account === account && post.shortcode === shortcode ? { ...post, ...patch } : post,
      ),
    }));
  }, []);

  const setPostFlags = useCallback(async (post, flags) => {
    // Optimistic: the toggle should feel instant. On failure we put the old
    // values back rather than leaving the UI lying about server state.
    const previous = { isPromo: post.isPromo, hidden: post.hidden };
    const optimistic = {};
    if ('is_promo' in flags) optimistic.isPromo = flags.is_promo;
    if ('hidden' in flags) optimistic.hidden = flags.hidden;
    patchPost(post.account, post.shortcode, optimistic);

    const body = new FormData();
    body.append('account', post.account);
    body.append('shortcode', post.shortcode);
    Object.entries(flags).forEach(([key, value]) => body.append(key, value ? 'true' : 'false'));
    try {
      const response = await apiFetch(`${API_BASE}/api/dashboard/posts/flags`, { method: 'POST', body });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      patchPost(post.account, post.shortcode, { isPromo: data.is_promo, hidden: data.hidden });
    } catch {
      patchPost(post.account, post.shortcode, previous);
    }
  }, [patchPost]);

  const reloadPost = useCallback(async (post) => {
    const body = new FormData();
    body.append('account', post.account);
    body.append('shortcode', post.shortcode);
    const response = await apiFetch(`${API_BASE}/api/dashboard/posts/reload`, { method: 'POST', body });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    // The API refresh also re-caches a fresh cover when the previous one was
    // missing or expired. Bump a client-only token so the browser does not
    // reuse a cached 404/502 for the same cover route and CoverImage starts
    // from its first source again.
    patchPost(post.account, post.shortcode, {
      likes: data.likes,
      comments: data.comments ?? post.comments,
      coverRefreshToken: Date.now(),
    });
    return { ...data, coverRefreshed: data.cover_refreshed !== false };
  }, [patchPost]);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const selectPost = useCallback((postKey) => {
    startTransition(() => {
      setSelectedKey(postKey);
      setIsSidebarOpen(true);
    });
  }, []);

  return (
    <div className="shell">
      <div className="backdrop" />
      <main className="app-layout">
        <section ref={leftPaneRef} className="left-pane">
          <header ref={topbarRef} className="topbar">
            {/* Left column: who we are, then the single most-used control.
                The old "DASH EXPLORER" eyebrow sat exactly where the search
                field now goes and said nothing the wordmark doesn't. */}
            <div className="topbar-identity">
              {/* Wordmark and count share row one so the left column is two
                  rows tall, the same as tools + filters on the right. Three
                  stacked rows here left the right column short and the header
                  lopsided. */}
              <div className="topbar-brandline">
                <h1><Wordmark /></h1>
                {!loading && !loadError ? (
                  <p className="results-count">
                    <strong>{filtered.length.toLocaleString()}</strong> {t('of')} {posts.length.toLocaleString()} {t('posts')}
                    <span className="results-count-aside">
                      {compactFormatter.format(combinedSummary.totalLikes ?? summary['Total likes'] ?? 0)} {t('likes')}
                      {' · '}
                      {compactFormatter.format(combinedSummary.averageLikes ?? summary['Average likes'] ?? 0)} {t('avg')}
                    </span>
                  </p>
                ) : <p className="results-count results-count-pending" aria-hidden="true" />}
              </div>

              {/* Rendered while loading too, just disabled. Hiding it made the
                  header change shape the moment data landed, which is what
                  made the load look broken -- the skeleton has to occupy the
                  same box as the real thing or it isn't a skeleton. */}
              <div className="topbar-search">
                <Search size={18} aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={query}
                  disabled={loading || Boolean(loadError)}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label={t('Search posts')}
                  placeholder={t('Captions, songs, or text inside a cover')}
                />
                {query ? (
                  <button className="search-clear" type="button" aria-label={t('Clear search')} onClick={() => setQuery('')}>
                    <X size={15} />
                  </button>
                ) : <kbd className="search-kbd">⌘K</kbd>}
              </div>
            </div>

            {/* Right column: tools on top, filters underneath. */}
            <div className="topbar-controls">
              <div className="tool-row">
                {/* target=_blank because these are separate apps with their own
                    auth gate and load: navigating in place threw away the
                    filters, the scroll position and the open post. And they're
                    labelled now -- five identical green icons gave you no way
                    to know where you were about to go. */}
                <a
                  className="tool-link tool-link-queue"
                  href={`${import.meta.env.BASE_URL}queue.html`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open your assigned post queue"
                >
                  <ListTodo size={15} />
                  <span>Queue</span>
                  {queuePendingCount ? <b className="queue-pending-badge">{queuePendingCount > 99 ? '99+' : queuePendingCount}</b> : null}
                  <ExternalLink size={12} className="tool-link-out" aria-hidden="true" />
                </a>
                {coordinatorAccess ? <a
                  className="tool-link"
                  href={`${import.meta.env.BASE_URL}tracker.html`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t('Follower growth per account')}
                >
                  <TrendingUp size={15} />
                  <span>{t('Tracker')}</span>
                  <ExternalLink size={12} className="tool-link-out" aria-hidden="true" />
                </a> : null}
                {coordinatorAccess ? <a
                  className="tool-link"
                  href={`${import.meta.env.BASE_URL}insights.html`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t('Aggregate analysis across all accounts')}
                >
                  <BarChart3 size={15} />
                  <span>{t('Insights')}</span>
                  <ExternalLink size={12} className="tool-link-out" aria-hidden="true" />
                </a> : null}

                <span className="tool-divider" aria-hidden="true" />

                <SettingsMenu
                  email={userEmail}
                  avatarUrl={userPhoto}
                  isAdmin={effectiveIsAdmin}
                  isDev={isDev && !rolePreviewActive}
                  onSignOut={onSignOut}
                />
              </div>

            </div>

            {refreshNotice ? (
              <p className={`refresh-notice refresh-notice-${refreshNotice.type}`} role="status">
                {refreshNotice.text}
              </p>
            ) : null}
            {/* Refreshes are deliberately silent once a real catalogue is on
                screen. A transient background failure used to leave the
                reconnect banner visible forever even though the cached
                catalogue remained perfectly usable. The retry continues in
                the background and atomically swaps in fresh data on success. */}
          </header>


          {loading ? <DashboardSkeleton /> : null}
          {loadError ? <section className="dash-state dash-state-error">{loadError}</section> : null}

          {!loading && !loadError ? <>
          {/* Filters share this row with the group tabs: same height,
              same pill shape. Tabs pick the set, filters narrow it --
              one decision surface instead of two stacked bars. */}
          <div className="tabs-bar">
          <div
            ref={groupTabsRef}
            className="group-tabs"
            role="tablist"
            aria-label="Account group"
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
            {/* Custom lists render as extra tabs after HOT. They're private
                to whoever made them, so this row differs per signed-in user. */}
            {customLists.map((list) => (
              <button
                key={`list:${list.id}`}
                type="button"
                role="tab"
                aria-selected={activeGroup === `list:${list.id}`}
                className={activeGroup === `list:${list.id}` ? 'group-tab group-tab-active' : 'group-tab'}
                onClick={() => startTransition(() => setActiveGroup(`list:${list.id}`))}
                title={`${list.handles.length} accounts`}
              >
                {list.name}
              </button>
            ))}
            <button
              type="button"
              className="group-tab group-tab-add"
              onClick={() => setListEditor({ id: null, name: '', handles: [] })}
              title="Create a custom list of accounts"
              aria-label="Create a custom list"
            >
              <Plus size={13} />
            </button>
            {activeList ? (
              <button
                type="button"
                className="group-tab group-tab-edit"
                onClick={() =>
                  setListEditor({ id: activeList.id, name: activeList.name, handles: [...activeList.handles] })
                }
                title={`Edit "${activeList.name}"`}
              >
                Edit
              </button>
            ) : null}

          </div>
            <div className="filter-row">
                <button
                  type="button"
                  className={mobileFiltersOpen ? 'filter-sheet-toggle filter-sheet-toggle-open' : 'filter-sheet-toggle'}
                  onClick={() => setMobileFiltersOpen((value) => !value)}
                  aria-expanded={mobileFiltersOpen}
                >
                  <SlidersHorizontal size={14} />
                  {t('Filters')}
                  {activeFilterCount ? <b>{activeFilterCount}</b> : null}
                </button>

                <div className={mobileFiltersOpen ? 'filter-triggers filter-triggers-open' : 'filter-triggers'}>

                  <FilterPopover
                    id="account"
                    icon={<AtSign size={13} />}
                    label={t('Account')}
                    summary={accountSummary}
                    isActive={Boolean(accountSummary)}
                    /* Wide enough for the multi-column roster. 340 gave it a
                       single column and quietly undid the columns+avatars
                       layout already built for this list. */
                    width={700}
                  >
                    <AccountMultiSelect
                      inline
                      accounts={accountsInScope}
                      counts={accountCounts}
                      selected={selectedAccounts}
                      onChange={(next) => startTransition(() => setSelectedAccounts(next))}
                    />
                  </FilterPopover>

                  <FilterPopover
                    id="type"
                    icon={<Filter size={13} />}
                    label={t('Type')}
                    summary={typeSummary}
                    isActive={Boolean(typeSummary)}
                    width={280}
                  >
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

                    {/* Promo and Hidden are the same question as Type -- "which
                        posts do I want to see?" -- so they live here instead of
                        as two more pills competing for room on the tab row. */}
                    <p className="popover-subhead">{t('Flags')}</p>
                    <div className="chip-row">
                      <button
                        type="button"
                        className={promoOnly ? 'chip chip-active' : 'chip'}
                        onClick={() => startTransition(() => setPromoOnly((value) => !value))}
                        aria-pressed={promoOnly}
                        title={`Only posts carrying ${PROMO_HASHTAG} or flagged as promo by hand`}
                      >
                        <Megaphone size={12} />
                        {t('Promo')}
                      </button>
                      <button
                        type="button"
                        className={showHidden ? 'chip chip-active' : 'chip'}
                        onClick={() => startTransition(() => setShowHidden((value) => !value))}
                        aria-pressed={showHidden}
                        disabled={!hiddenCount}
                        title={hiddenCount ? 'Show the posts you have hidden, so you can bring them back' : 'Nothing hidden yet'}
                      >
                        {showHidden ? <Eye size={12} /> : <EyeOff size={12} />}
                        {t('Hidden')}
                        <span>{hiddenCount}</span>
                      </button>
                    </div>
                  </FilterPopover>


                  <FilterPopover
                    id="date"
                    icon={<CalendarDays size={13} />}
                    label={t('Date')}
                    summary={dateSummary}
                    isActive={Boolean(dateSummary)}
                    width={280}
                  >
                    <div className="date-fields">
                      <label className="select-field">
                        <span>{t('Range')}</span>
                        <select aria-label="Date range" value={datePreset} onChange={(event) => applyDatePreset(event.target.value)}>
                          {datePreset === 'custom' ? <option value="custom">Custom range</option> : null}
                          {datePresets.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
                        </select>
                      </label>
                      <label className="date-field">
                        <span>{t('From')}</span>
                        <input type="date" aria-label="Date from" value={dateFrom} min={ranges.dateMin} max={ranges.dateMax} onChange={(e) => { setDatePreset('custom'); setDateFrom(e.target.value); }} />
                      </label>
                      <label className="date-field">
                        <span>{t('To')}</span>
                        <input type="date" aria-label="Date to" value={dateTo} min={ranges.dateMin} max={ranges.dateMax} onChange={(e) => { setDatePreset('custom'); setDateTo(e.target.value); }} />
                      </label>
                    </div>
                  </FilterPopover>

                  <FilterPopover
                    id="engagement"
                    icon={<SlidersHorizontal size={13} />}
                    label={t('Engagement')}
                    summary={engagementSummary}
                    isActive={minLikes > 0 || minComments > 0}
                    /* Seven tick labels ending in "100K+" need the room: at
                       320 the last two ran into each other. */
                    width={400}
                  >
                    <div className="filter-engagement-inner">
                      <label className="range-field compact-range">
                        <span>{t('Likes')}</span>
                        <input
                          type="range"
                          aria-label="Minimum likes"
                          min={0}
                          max={LIKES_STOPS.length - 1}
                          step={1}
                          value={likesStopIndex(minLikes)}
                          onChange={(e) => startTransition(() => setMinLikes(LIKES_STOPS[clampNumber(e.target.value, 0)]))}
                        />
                        {/* Each tick is positioned with the exact same formula the
                            browser uses to place the native thumb: the thumb's
                            travel path runs from THUMB_PX / 2 to
                            100% - THUMB_PX / 2 (see the CSS thumb rules), so a
                            stop at fraction f of the way through the stops sits
                            at calc(THUMB_PX/2 + f * (100% - THUMB_PX)). Centering
                            each tick on that exact point with translateX(-50%)
                            (rather than a plain flex space-between row of
                            variable-width text) is what makes the marks land
                            exactly under the thumb regardless of label width. */}
                        <div className="range-ticks" aria-hidden="true">
                          {LIKES_STOPS.map((stop, index) => {
                            const fraction = index / (LIKES_STOPS.length - 1);
                            const isActive = likesStopIndex(minLikes) === index;
                            return (
                              <div
                                key={stop}
                                className={isActive ? 'range-tick range-tick-active' : 'range-tick'}
                                style={{ left: `calc(${RANGE_THUMB_PX / 2}px + (100% - ${RANGE_THUMB_PX}px) * ${fraction})` }}
                              >
                                <span className="range-tick-mark" />
                                <span className="range-tick-label">
                                  {stop === 0 ? '0' : compactFormatter.format(stop)}
                                  {index === LIKES_STOPS.length - 1 ? '+' : ''}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </label>
                      <div className="engagement-numbers">
                        {/* Both of these are floors, not equality matches -- the
                            box exists so you can type a threshold between the
                            slider's stops (e.g. 3,500), not to find posts with
                            exactly that many likes. */}
                        <label className="number-field">
                          <span>{t('Min likes')}</span>
                          <input
                            aria-label="Minimum likes"
                            type="number"
                            min={0}
                            placeholder="0"
                            title="Show posts with at least this many likes"
                            value={minLikes}
                            onChange={(e) => startTransition(() => setMinLikes(clampNumber(e.target.value, 0)))}
                          />
                        </label>
                        <label className="number-field">
                          <span>{t('Min comments')}</span>
                          <input
                            aria-label="Minimum comments"
                            placeholder="0"
                            title="Show posts with at least this many comments"
                            type="number"
                            min={0}
                            value={minComments}
                            onChange={(e) => startTransition(() => setMinComments(clampNumber(e.target.value, ranges.commentsMin)))}
                          />
                        </label>
                      </div>
                    </div>
                  </FilterPopover>

                  <FilterPopover
                    id="sort"
                    icon={<ArrowUpDown size={13} />}
                    label={t('Sort')}
                    summary={sortBy !== 'newest' ? SORT_OPTIONS.find((o) => o.value === sortBy)?.label : ''}
                    isActive={sortBy !== 'newest'}
                    width={240}
                  >
                    <div className="sort-options">
                      {SORT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={option.value === sortBy ? 'sort-option sort-option-active' : 'sort-option'}
                          onClick={() => startTransition(() => setSortBy(option.value))}
                          aria-pressed={option.value === sortBy}
                        >
                          {option.label}
                          {option.value === sortBy ? <Check size={14} /> : null}
                        </button>
                      ))}
                    </div>
                  </FilterPopover>
                </div>

                {/* Replaces the old chip row: every trigger already shows its
                    own value, so the chips repeated all of it one row down.
                    Resetting them all still needs one control, though. */}
                {activeFilterCount ? (
                  <button type="button" className="filter-clear-pill" onClick={onReset}>
                    <RotateCcw size={13} />
                    {t('Clear')}
                    <b>{activeFilterCount}</b>
                  </button>
                ) : null}

                <button
                  className="tool-icon share-button"
                  type="button"
                  onClick={copyShareLink}
                  title={t('Copy a link to this exact view')}
                  aria-label={t('Copy link to this view')}
                >
                  {shareCopied ? <Check size={15} /> : <Link2 size={15} />}
                </button>
              </div>
          </div>

          <section className="panel gallery">
          <div ref={resultsScrollRef} className="results-scroll">
            {visible.length ? (
              <div className="gallery-grid">
                {visible.map((post, index) => (
                  <PostCard
                    // Keyed by account+shortcode, not shortcode alone: accounts
                    // repost each other, so ~21 shortcodes exist under two
                    // accounts. Duplicate React keys make reordering undefined
                    // and those cards got stuck at the top of every sort.
                    key={post.postKey}
                    post={post}
                    priority={index < 6}
                    selected={selected?.postKey === post.postKey}
                    onSelect={selectPost}
                    onFlags={setPostFlags}
                    onReload={reloadPost}
                    onAssign={setAssignmentPost}
                    onQuickAdd={quickAddToPool}
                    canPool={coordinatorAccess}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>{activeGroup === 'hot' && !showHotHistory && hotHistoryCount
                  ? 'Nothing is hot right now.'
                  : 'No posts match the current filters.'}</p>
                <button className="ghost-button" onClick={onReset}>
                  {t('Clear filters')}
                </button>
              </div>
            )}

            {/* The HOT tab defaults to what's hot *now*; everything older sits
                behind this. Placed after the last current post so the default
                view stays a short, scannable "what's happening today" list
                instead of opening on hundreds of past winners. */}
            {activeGroup === 'hot' && !showHotHistory && hotHistoryCount ? (
              <div className="hot-history-cta">
                <button className="ghost-button" onClick={() => startTransition(() => setShowHotHistory(true))}>
                  <Flame size={13} />
                  Show historical HOT posts
                  <span>{hotHistoryCount.toLocaleString()}</span>
                </button>
                <p>Older posts that went hot before the last {HOT_TAB_WINDOW_HOURS}h.</p>
              </div>
            ) : null}
            {activeGroup === 'hot' && showHotHistory ? (
              <div className="hot-history-cta">
                <button className="ghost-button" onClick={() => startTransition(() => setShowHotHistory(false))}>
                  Hide historical
                </button>
              </div>
            ) : null}
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
                <p>{t('No posts match the current filters.')}</p>
                <button className="ghost-button" onClick={onReset}>
                  {t('Clear filters')}
                </button>
              </div>
            )}
          </section>

          {selected ? (
            <PostDetailPanel
              post={selected}
              captionExtra={<>{selected.account === 'chatgptricks' ? <CanvaLine url={canvaLinkForPost(selected.postDate)} /> : null}{coordinatorAccess ? <><button type="button" className="ghost-button" onClick={() => setAssignmentPost(selected)}><ListTodo size={13} />Send to Pool</button><button type="button" className="ghost-button" title="Quick add to Pool with defaults" onClick={() => quickAddToPool(selected)}><Zap size={13} />Quick add</button></> : null}</>}
            />
          ) : null}

        </aside> : null}
      </main>

      {listEditor ? (
        <ListEditor
          draft={listEditor}
          accounts={accounts}
          onSave={saveList}
          onDelete={deleteList}
          onClose={() => setListEditor(null)}
        />
      ) : null}

      {assignmentPost ? (
        <AssignPostModal
          post={assignmentPost}
          userEmail={userEmail}
          isAdmin={effectiveIsAdmin}
          accounts={accounts}
          onClose={() => setAssignmentPost(null)}
          onAssigned={() => {
            refreshQueueSummary();
            setAssignmentPost(null);
          }}
        />
      ) : null}

      <BackgroundTaskStack tasks={backgroundTasks} onDismiss={dismissBackgroundTask} />
      <DevRolePreview isDev={isDev} canSwitchRoles={canSwitchRoles} availableRoles={availableRoles} />
    </div>
  );
}

// Not a Spotify/Apple Music link -- Apify only gives us Instagram's own
// audio_id, which resolves to that sound's page on Instagram (every reel that
// used the exact same clip). Renders as a link when we have that id, plain
// text otherwise (older rows scraped before audio_id was captured).
// chatgptricks-only: the monthly Canva design doc this post's cover most
// likely came from (see CANVA_DESIGNS / canvaLinkForPost above). No link for
// months not yet in the list rather than a dead/guessed URL.
function CanvaLine({ url }) {
  if (!url) return null;
  return (
    <a className="song-line canva-line" href={url} target="_blank" rel="noreferrer" title="Open this month's Canva design doc">
      <ExternalLink size={14} />
      <span>Open Canva design doc</span>
    </a>
  );
}

// Dropdown with a checkbox list of accounts, scoped to whichever tab
// (All/Sentient/Competitors) is currently active. Adding a new account
// (self-serve, via the "+ Add account" row at the bottom) never requires a
// frontend change -- the list is entirely driven by /api/dashboard/accounts.
// Bundled profile image first (a handful are shipped with the app), then the
// backend's cached avatar, then initials. Shared so the filter dropdown and
// the admin roster can't drift apart.
function AccountAvatar({ handle, hasAvatar, size = 28 }) {
  const bundled = ACCOUNT_PROFILE_IMAGES[handle];
  const style = { width: size, height: size };
  if (bundled) return <img className="account-avatar" style={style} src={bundled} alt="" />;
  if (hasAvatar) {
    return (
      <img
        className="account-avatar"
        style={style}
        src={`${API_BASE}/api/dashboard/avatar/${encodeURIComponent(handle)}`}
        alt=""
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span className="account-avatar account-avatar-fallback" style={style}>
      {handle.slice(0, 2).toUpperCase()}
    </span>
  );
}

// The product wordmark: sentientdash.app, with "dash" in the accent colour.
// A component rather than a repeated string so the three places it appears
// (topbar, sign-in gate, unauthorized gate) can't drift apart, and so the
// highlight is markup instead of something to re-hand-craft each time.
function Wordmark() {
  return (
    <>
      sentient<span className="wordmark-accent">dash</span>
      <span className="wordmark-tld">.app</span>
    </>
  );
}

// Shown while the post library loads. A skeleton of the real layout rather
// than a spinner or a line of text: the first load pulls tens of thousands of
// posts, and a bare "Loading..." on an empty page reads as broken. Mirroring
// the filter strip and card grid also means the page doesn't visibly jump
// when the data lands.
function DashboardSkeleton() {
  return (
    <section className="dash-skeleton" role="status" aria-live="polite">
      <span className="sr-only">Loading the post library</span>
      {/* No filter placeholders here: the real topbar already renders its own
          disabled search and six placeholder pills while loading, so a second
          set below duplicated the row and overlapped it. This is only the
          grid, built from the real .gallery-grid / .post-card classes so the
          placeholders inherit the actual column count, gaps, card height and
          3:4 media ratio. */}
      <div className="gallery-grid" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, index) => (
          <article className="post-card dash-skeleton-card" key={index}>
            <div className="post-header">
              <div className="post-user">
                <div className="post-avatar skeleton-block" />
                <div className="post-user-copy dash-skeleton-lines">
                  <div className="skeleton-block skeleton-line skeleton-line-sm" />
                  <div className="skeleton-block skeleton-line skeleton-line-xs" />
                </div>
              </div>
            </div>
            <div className="post-media skeleton-block" />
            {/* Row heights mirror the real card's internals (28px action
                buttons; a 14/15/24 likes-caption-footer stack) so the
                placeholder ends up the same total height as a loaded card
                and the grid doesn't resize when data arrives. */}
            <div className="post-actions">
              <div className="dash-skeleton-actions">
                {Array.from({ length: 3 }).map((_, dot) => (
                  <span className="skeleton-block skeleton-dot" key={dot} />
                ))}
              </div>
            </div>
            <div className="post-copy">
              <div className="skeleton-row skeleton-row-likes">
                <span className="skeleton-block skeleton-line skeleton-line-xs" />
              </div>
              <div className="skeleton-row skeleton-row-caption">
                <span className="skeleton-block skeleton-line" />
              </div>
              <div className="skeleton-row skeleton-row-footer">
                <span className="skeleton-block skeleton-line skeleton-line-sm" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// Create/edit a custom account list. Kept as a small modal rather than a
// wizard: a list is just a name plus a set of handles.
function ListEditor({ draft, accounts, onSave, onDelete, onClose }) {
  const [name, setName] = useState(draft.name);
  const [picked, setPicked] = useState(() => new Set(draft.handles));
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const term = search.trim().toLowerCase();
  const visible = term
    ? accounts.filter(
        (a) => a.handle.toLowerCase().includes(term) || (a.label || '').toLowerCase().includes(term),
      )
    : accounts;

  const toggle = (handle) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });
  };

  const submit = async () => {
    setError('');
    if (!name.trim()) return setError('Give the list a name.');
    if (!picked.size) return setError('Pick at least one account.');
    setSaving(true);
    try {
      await onSave({ id: draft.id, name: name.trim(), handles: [...picked] });
      onClose();
    } catch (exc) {
      setError(exc.message || 'Could not save that list.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal list-editor" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>{draft.id ? 'Edit list' : 'New list'}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <label className="modal-field">
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. AI news, Spanish, Competitors to watch"
            autoFocus
          />
        </label>

        <div className="list-editor-picker">
          <div className="account-multiselect-search">
            <Search size={14} />
            <input
              type="search"
              value={search}
              placeholder="Search accounts"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="account-multiselect-list account-multiselect-grid list-editor-grid">
            {visible.map((account) => (
              <label
                key={account.handle}
                className={
                  picked.has(account.handle)
                    ? 'account-multiselect-item account-multiselect-item-on'
                    : 'account-multiselect-item'
                }
              >
                <input
                  type="checkbox"
                  checked={picked.has(account.handle)}
                  onChange={() => toggle(account.handle)}
                />
                <AccountAvatar handle={account.handle} hasAvatar={account.has_avatar} />
                <span className="account-multiselect-name">
                  <strong>{account.label}</strong>
                  <em>@{account.handle}</em>
                </span>
              </label>
            ))}
          </div>
        </div>

        {error ? <p className="modal-error">{error}</p> : null}

        <div className="modal-actions list-editor-actions">
          {draft.id ? (
            <button
              type="button"
              className="ghost-button danger"
              onClick={async () => {
                await onDelete(draft.id);
                onClose();
              }}
            >
              Delete list
            </button>
          ) : null}
          <span className="list-editor-count">{picked.size} selected</span>
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary-button" onClick={submit} disabled={saving}>
            {saving ? 'Saving...' : 'Save list'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Sign out used to be a 42px green button sitting immediately beside the
// Tracker link and styled identically to it -- a session-ending action one
// pixel from a navigation link, with nothing to tell them apart. Behind a menu
// it takes a deliberate second click, and the menu is also the only place the
// signed-in email was ever shown (it used to hide in a title attribute).
// AccountMenu's avatar-trigger + sign-out panel is now folded into
// SettingsMenu above (one entry point instead of two adjacent controls).

// A filter that lives behind a compact trigger instead of an always-open card.
//
// Six always-open filter cards cost ~150px of vertical space at the top of a
// page whose whole job is showing a grid -- that height is what forced the
// scroll-to-hide machinery in the first place. As triggers they cost one 34px
// row, and the control itself only exists while you're using it.
//
// The panel is portaled to document.body and positioned from the trigger's
// bounding rect, the same approach AccountMultiSelect already uses: the
// trigger lives inside a flex row that may clip, so an absolutely-positioned
// panel would be cut off rather than floating over the gallery.
function FilterPopover({ id, icon, label, summary, isActive, width = 300, children }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (triggerRef.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    // Esc closes and hands focus back to the trigger, so keyboard users don't
    // get dumped at the top of the document.
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const bounds = trigger.getBoundingClientRect();
      // Right-align to the trigger when a left-aligned panel would run off
      // screen -- these triggers sit in the right-hand column, so most of
      // them are closer to the right edge than the panel is wide.
      const left = Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8));
      setRect({ top: bounds.bottom + 6, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, width]);

  const panelId = `filter-popover-${id}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={isActive ? 'filter-trigger filter-trigger-active' : 'filter-trigger'}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
      >
        {icon}
        <span className="filter-trigger-label">{label}</span>
        {summary ? <span className="filter-trigger-summary">{summary}</span> : null}
        <ChevronDown size={13} className={open ? 'chevron chevron-open' : 'chevron'} />
      </button>
      {open && rect
        ? createPortal(
            <div
              id={panelId}
              ref={panelRef}
              className="filter-popover-panel"
              role="group"
              aria-label={label}
              style={{ top: rect.top, left: rect.left, width }}
            >
              <p className="filter-popover-title">{label}</p>
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function AccountMultiSelect({ accounts, counts, selected, onChange, onAddAccount, inline = false }) {
  const [open, setOpen] = useState(inline);
  const [panelRect, setPanelRect] = useState(null);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);

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

  // Reset the query each time the panel opens (a stale filter from last time
  // looks like accounts have gone missing) and put the cursor in the box so
  // you can just start typing.
  useEffect(() => {
    if (!open) {
      setSearch('');
      return;
    }
    const id = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(id);
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

  // Match on handle and label so both "@chatgptricks" and a custom display
  // name find the same account.
  const term = search.trim().toLowerCase();
  const visibleAccounts = term
    ? accounts.filter(
        (account) =>
          account.handle.toLowerCase().includes(term) ||
          (account.label || '').toLowerCase().includes(term),
      )
    : accounts;

  // The panel needs an explicit width or the auto-fill grid collapses to a
  // single column: with `width: max-content` the grid's own max-content size
  // is one track wide, so it never gets the room to wrap into columns.
  // Derived from the roster size (not the filtered subset) so the panel
  // doesn't resize under the cursor while typing a search.
  const COLUMN_PX = 232;
  const columns = Math.min(4, Math.max(1, Math.ceil(accounts.length / 9)));
  const panelWidth = Math.max(panelRect?.width ?? 0, columns * COLUMN_PX);

  // Select all / Clear act on what's currently filtered, which is what you
  // want after searching a niche ("select all the ones matching 'ai'"). With
  // an empty search that's still every account, so the plain case is normal.
  const applyToVisible = (add) => {
    const next = new Set(selected);
    visibleAccounts.forEach((account) => (add ? next.add(account.handle) : next.delete(account.handle)));
    onChange(next);
  };

  // Inline mode: the caller (a FilterPopover) is already a floating panel, so
  // rendering our own trigger and second portal on top of it would mean two
  // clicks and two stacked layers to reach one list.
  const body = (
    <>
              <div className="account-multiselect-search">
                <Search size={14} />
                <input
                  ref={searchRef}
                  type="search"
                  value={search}
                  placeholder="Search accounts"
                  onChange={(event) => setSearch(event.target.value)}
                  // Escape clears the query first and only closes the panel
                  // when it's already empty, so a mistyped search doesn't
                  // cost you the whole dropdown.
                  onKeyDown={(event) => {
                    if (event.key !== 'Escape') return;
                    if (search) {
                      event.stopPropagation();
                      setSearch('');
                    } else {
                      setOpen(false);
                    }
                  }}
                />
                {search ? (
                  <button type="button" className="account-multiselect-search-clear" onClick={() => setSearch('')}>
                    <X size={13} />
                  </button>
                ) : null}
              </div>
              <div className="account-multiselect-actions">
                <button type="button" onClick={() => applyToVisible(true)}>
                  {term ? `Select these (${visibleAccounts.length})` : 'Select all'}
                </button>
                <button type="button" onClick={() => applyToVisible(false)}>
                  Clear
                </button>
              </div>
              <div className="account-multiselect-list account-multiselect-grid">
                {visibleAccounts.map((account) => (
                  <label
                    key={account.handle}
                    className={
                      selected.has(account.handle)
                        ? 'account-multiselect-item account-multiselect-item-on'
                        : 'account-multiselect-item'
                    }
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(account.handle)}
                      onChange={() => toggle(account.handle)}
                    />
                    <AccountAvatar handle={account.handle} hasAvatar={account.has_avatar} />
                    <span className="account-multiselect-name">
                      <strong>{account.label}</strong>
                      <em>@{account.handle}</em>
                    </span>
                    <b>{counts[account.handle] ?? 0}</b>
                  </label>
                ))}
                {!accounts.length ? <p className="account-multiselect-empty">No accounts in this group yet.</p> : null}
                {accounts.length && !visibleAccounts.length ? (
                  <p className="account-multiselect-empty">No accounts match &ldquo;{search}&rdquo;.</p>
                ) : null}
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
    </>
  );

  if (inline) {
    return (
      <div className="account-multiselect-inline" role="listbox" aria-multiselectable="true">
        {body}
      </div>
    );
  }

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
              style={{ top: panelRect.top, left: panelRect.left, width: panelWidth }}
            >
              {body}
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
// Admin panel: HOT thresholds, pulling older history, and the manual refresh.
// The password is asked for once when the panel opens and kept only in this
// component's state -- never written to localStorage, so closing the panel or
// reloading the page discards it.
export function SettingsPanel({
  accounts = [], onRefresh, refreshing = false, refreshNotice, onAccountsChanged,
  initialTab, userEmail, userPhoto, isAdmin = false, isDev = false, onSignOut,
}) {
  const { t } = usePrefs();
  // Firebase sign-in is the real gate now (only an allowlisted Google account
  // can reach this component at all), so the old shared-password unlock
  // screen is skipped entirely -- the fixed legacy value is supplied
  // automatically for the handful of backend endpoints that still check it.
  const [password, setPassword] = useState(LEGACY_REFRESH_PASSWORD);
  const [unlocked, setUnlocked] = useState(true);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState('');
  const settingsTabs = ['overview', 'accounts', 'users', 'usage', 'notifications', 'system', 'reports'];
  const [tab, setTab] = useState(settingsTabs.includes(initialTab) ? initialTab : 'overview');
  const [showAddAccount, setShowAddAccount] = useState(false);

  // Reports tab -- the same production-report data Queue's admin overlay
  // used to show in its own separate panel (totals, priorities, designer
  // workload, assigned posts). One Reports tab here instead of two admin UIs
  // that both talk to the same /admin-report endpoint.
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');

  // Users tab -- the Google sign-in allowlist + admin/viewer roles, editable
  // here instead of through Render's environment variables.
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersNotice, setUsersNotice] = useState('');
  const [userDisplayDrafts, setUserDisplayDrafts] = useState({});
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserDisplayName, setNewUserDisplayName] = useState('');
  // Admin is an orthogonal flag layered on top of a Queue role, same as
  // everywhere else a person's role is shown (Queue's own roster appends
  // "Admin" onto whatever operating role someone has, never treats it as a
  // competing option on the same dropdown) -- not a separate "Access:
  // Viewer/Admin" tier that used to sit next to an unrelated "Queue role"
  // dropdown for what the backend treats as the same one is_admin boolean.
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
  const [newUserOperatingRole, setNewUserOperatingRole] = useState('pd');
  const [newUserSlackId, setNewUserSlackId] = useState('');
  const [addingUser, setAddingUser] = useState(false);
  const [userActionEmail, setUserActionEmail] = useState('');
  const [designerAccounts, setDesignerAccounts] = useState([]);
  const [designerAccountChoice, setDesignerAccountChoice] = useState({});

  // Users tab -- usage heatmap. Separate load/loading state from the roster
  // above: the roster is small and cheap, this is a heavier aggregation
  // query, and neither should block the other from rendering.
  const [usage, setUsage] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);

  // The prop is /api/dashboard/accounts (active-only, public). This panel
  // needs inactive accounts too (to show/reactivate them), so once unlocked
  // it re-fetches the full admin roster and works off that instead.
  const [roster, setRoster] = useState(accounts);
  const [edits, setEdits] = useState({});
  const [savingHandle, setSavingHandle] = useState('');
  // Accounts table: search/sort/status-filter and which row's detail panel
  // is open. One redesign pass replacing 31 nearly-identical cards -- a
  // sortable, searchable table scans far faster than scrolling cards.
  const [accountSearch, setAccountSearch] = useState('');
  const [accountStatusFilter, setAccountStatusFilter] = useState('active');
  const [accountSort, setAccountSort] = useState({ key: 'handle', dir: 'asc' });
  const [expandedHandle, setExpandedHandle] = useState('');
  const [avatarHandle, setAvatarHandle] = useState('');
  const [lifecycleHandle, setLifecycleHandle] = useState('');
  const [importFrom, setImportFrom] = useState({});
  const [importCount, setImportCount] = useState({});
  const [importing, setImporting] = useState('');
  const [importNotice, setImportNotice] = useState({});
  // New-account imports are intentionally tracked separately from the manual
  // "Extract history" control. This record survives a Settings reload and
  // remains visible until the background worker reports completion.
  const [accountBackfills, setAccountBackfills] = useState(readSettingsAccountBackfills);
  const [accountBackfillNow, setAccountBackfillNow] = useState(Date.now());
  const accountBackfillRemoveTimers = useRef(new Map());

  // System tab
  const [disk, setDisk] = useState(null);
  const [slackStatus, setSlackStatus] = useState(null);
  const [slackSending, setSlackSending] = useState(false);
  const [slackNotice, setSlackNotice] = useState('');
  const [customAlertTitle, setCustomAlertTitle] = useState('');
  const [customAlertMessage, setCustomAlertMessage] = useState('');
  const [customAlertImage, setCustomAlertImage] = useState(null); // File | null
  const [customAlertImagePreview, setCustomAlertImagePreview] = useState(''); // object URL
  const [customAlertSending, setCustomAlertSending] = useState(false);
  const [customAlertNotice, setCustomAlertNotice] = useState('');
  const customAlertFileInputRef = useRef(null);
  const [apifyRuns, setApifyRuns] = useState([]);
  const [apifyLoading, setApifyLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState(null);
  const [ocrStarting, setOcrStarting] = useState(false);

  const selectTab = useCallback((nextTab) => {
    setTab(nextTab);
    const params = new URLSearchParams();
    if (nextTab !== 'overview') params.set('r', encodeRouteState({ tab: nextTab }));
    const search = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}`);
  }, []);

  const loadRoster = useCallback(async () => {
    try {
      const response = await apiFetch(`${API_BASE}/api/admin/accounts`);
      const body = await response.json().catch(() => ({}));
      if (Array.isArray(body.accounts)) setRoster(body.accounts);
    } catch (error) {
      // Keep whatever roster we already had rather than blanking the panel.
    }
  }, []);

  const patchAccountBackfill = useCallback((handle, patch) => {
    setAccountBackfills((current) => {
      const next = current.map((task) => (task.handle === handle ? { ...task, ...patch, updatedAt: Date.now() } : task));
      persistSettingsAccountBackfills(next);
      return next;
    });
  }, []);

  const addAccountBackfill = useCallback((account) => {
    const task = {
      id: `${account.handle}-${Date.now()}`,
      handle: account.handle,
      label: account.label || account.handle,
      group: account.group || 'sentient',
      avatarUrl: account.avatarUrl || '',
      phase: 'starting',
      startedAt: Date.now(),
      serverProgress: { phase: 'queued' },
      added: 0,
      error: '',
    };
    setAccountBackfills((current) => {
      const next = [...current.filter((item) => item.handle !== task.handle), task];
      persistSettingsAccountBackfills(next);
      return next;
    });
    return task;
  }, []);

  const dismissAccountBackfill = useCallback((handle) => {
    const timer = accountBackfillRemoveTimers.current.get(handle);
    if (timer) {
      clearTimeout(timer);
      accountBackfillRemoveTimers.current.delete(handle);
    }
    setAccountBackfills((current) => {
      const next = current.filter((task) => task.handle !== handle);
      persistSettingsAccountBackfills(next);
      return next;
    });
  }, []);

  const activeAccountBackfillHandles = accountBackfills
    .filter((task) => ['starting', 'importing', 'waiting'].includes(task.phase))
    .map((task) => task.handle)
    .join('|');

  // Keep elapsed-time copy fresh without forcing the entire Settings panel to
  // re-render every second when there is no onboarding work in flight.
  useEffect(() => {
    if (!accountBackfills.some((task) => ['starting', 'importing', 'waiting'].includes(task.phase))) return undefined;
    const timer = setInterval(() => setAccountBackfillNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [accountBackfills]);

  // A backfill is a process on the API, not a request held open by the browser.
  // Polling here lets Settings reconnect after a reload and pick up the exact
  // phase/count the worker is currently reporting.
  useEffect(() => {
    const handles = activeAccountBackfillHandles.split('|').filter(Boolean);
    if (!unlocked || !handles.length) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const statusResponse = await apiFetch(`${API_BASE}/api/admin/accounts/backfill-status`);
        const status = await statusResponse.json().catch(() => ({}));
        if (cancelled) return;
        const activeHandle = status.handle || '';
        for (const handle of handles) {
          if (status.running) {
            if (activeHandle === handle) {
              patchAccountBackfill(handle, { phase: 'importing', serverProgress: status.progress || null, error: '' });
            } else {
              patchAccountBackfill(handle, {
                phase: 'waiting',
                serverProgress: null,
                waitingFor: activeHandle,
                error: '',
              });
            }
            continue;
          }
          // The worker keeps the completed handle in its status payload. Do
          // not turn an unrelated/no-op status response into a false success.
          if (activeHandle !== handle) continue;
          if (status.error) {
            patchAccountBackfill(handle, { phase: 'error', error: status.error, serverProgress: status.progress || null });
          } else {
            patchAccountBackfill(handle, {
              phase: 'done',
              added: status.result?.added ?? 0,
              serverProgress: { phase: 'inserting', done: 1, total: 1 },
              error: '',
            });
            onAccountsChanged?.();
            await loadRoster();
          }
        }
      } catch {
        // A transient status failure should not hide the task or call it done.
      }
    };
    poll();
    const timer = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [unlocked, activeAccountBackfillHandles, patchAccountBackfill, onAccountsChanged, loadRoster]);

  // Keep the completed acknowledgement visible briefly so an admin can see
  // that the import actually finished, then remove it from localStorage.
  useEffect(() => {
    for (const task of accountBackfills) {
      if (task.phase !== 'done' || accountBackfillRemoveTimers.current.has(task.handle)) continue;
      const timer = setTimeout(() => {
        accountBackfillRemoveTimers.current.delete(task.handle);
        dismissAccountBackfill(task.handle);
      }, 9000);
      accountBackfillRemoveTimers.current.set(task.handle, timer);
    }
  }, [accountBackfills, dismissAccountBackfill]);

  useEffect(() => () => {
    for (const timer of accountBackfillRemoveTimers.current.values()) clearTimeout(timer);
    accountBackfillRemoveTimers.current.clear();
  }, []);

  const loadSystemStatus = useCallback(async () => {
    try {
      const [diskRes, slackRes, ocrRes] = await Promise.all([
        apiFetch(`${API_BASE}/api/admin/disk-status`),
        apiFetch(`${API_BASE}/api/admin/slack-status`),
        apiFetch(`${API_BASE}/api/admin/ocr/status`),
      ]);
      if (diskRes.ok) setDisk(await diskRes.json());
      if (slackRes.ok) setSlackStatus(await slackRes.json());
      if (ocrRes.ok) setOcrStatus(await ocrRes.json());
    } catch (error) {
      // Read-only diagnostics -- fail quietly, sections just stay on "Loading…".
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const response = await apiFetch(`${API_BASE}/api/admin/users`);
      const body = await response.json().catch(() => ({}));
      if (Array.isArray(body.users)) {
        setUsers(body.users);
        setUserDisplayDrafts(Object.fromEntries(body.users.map((person) => [person.email, person.display_name || person.email.split('@')[0]])));
      }
    } catch (error) {
      // Keep whatever list we already had rather than blanking the tab.
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const loadDesignerAccounts = useCallback(async () => {
    try {
      const response = await apiFetch(`${API_BASE}/api/admin/queue/designer-accounts`);
      const body = await response.json().catch(() => ({}));
      if (Array.isArray(body.designers)) setDesignerAccounts(body.designers);
    } catch (error) {
      setUsersNotice('Could not load Queue account assignments.');
    }
  }, []);

  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    try {
      const response = await apiFetch(`${API_BASE}/api/admin/usage?days=30`);
      const body = await response.json().catch(() => ({}));
      if (Array.isArray(body.users)) setUsage(body);
    } catch (error) {
      // Keep whatever we already had rather than blanking the heatmap.
    } finally {
      setUsageLoading(false);
    }
  }, []);

  const loadApifyRuns = useCallback(async () => {
    if (!password) return;
    setApifyLoading(true);
    try {
      const response = await apiFetch(`${API_BASE}/api/admin/apify/runs?password=${encodeURIComponent(password)}&limit=10`);
      const body = await response.json().catch(() => ({}));
      if (Array.isArray(body.runs)) setApifyRuns(body.runs);
    } catch (error) {
      // ignore
    } finally {
      setApifyLoading(false);
    }
  }, [password]);

  useEffect(() => {
    const next = {};
    for (const account of roster) {
      next[account.handle] = {
        label: account.label || '',
        group: account.group,
        hot_threshold: String(account.hot_threshold ?? ''),
      };
    }
    setEdits(next);
  }, [roster]);

  useEffect(() => {
    if (!unlocked) return;
    loadRoster();
    loadSystemStatus();
  }, [unlocked, loadRoster, loadSystemStatus]);

  useEffect(() => {
    if (unlocked && tab === 'system') loadApifyRuns();
  }, [unlocked, tab, loadApifyRuns]);

  useEffect(() => {
    if (unlocked && tab === 'users') {
      loadUsers();
      loadDesignerAccounts();
    }
    if (unlocked && tab === 'usage') {
      loadUsage();
      loadUsers();
    }
  }, [unlocked, tab, loadUsers, loadUsage, loadDesignerAccounts]);

  const loadReport = useCallback(async () => {
    setReportLoading(true);
    setReportError('');
    try {
      const response = await apiFetch(`${API_BASE}/api/dashboard/queue/v2/admin-report`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || `HTTP ${response.status}`);
      setReport(body);
    } catch (error) {
      setReportError(error.message || 'Could not load the Queue report.');
    } finally {
      setReportLoading(false);
    }
  }, []);

  useEffect(() => {
    if (unlocked && tab === 'reports') loadReport();
  }, [unlocked, tab, loadReport]);

  useEffect(() => {
    if (!unlocked || tab !== 'overview') return;
    loadUsers();
    loadDesignerAccounts();
    loadReport();
  }, [unlocked, tab, loadUsers, loadDesignerAccounts, loadReport]);

  // While a sweep is running, poll so the "done" count moves without a manual
  // refresh -- same pattern as the background-task polling used elsewhere.
  useEffect(() => {
    if (!unlocked || !ocrStatus?.running) return;
    const timer = setInterval(loadSystemStatus, 4000);
    return () => clearInterval(timer);
  }, [unlocked, ocrStatus?.running, loadSystemStatus]);

  // Validated by attempting the cheapest password-gated write we have: a
  // no-op settings update on the first account. Avoids inventing a dedicated
  // auth endpoint just for this panel.
  const unlock = async (event) => {
    event.preventDefault();
    if (!password || !accounts.length) return;
    setChecking(true);
    setNotice('');
    try {
      const account = accounts[0];
      const response = await apiFetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(account.handle)}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ password, hot_threshold: String(account.hot_threshold) }),
      });
      if (response.status === 401) {
        setNotice('Incorrect password.');
        return;
      }
      if (!response.ok) {
        setNotice('Could not validate. Try again.');
        return;
      }
      setUnlocked(true);
    } catch (error) {
      setNotice('Network error. Try again.');
    } finally {
      setChecking(false);
    }
  };

  const isDirty = (account) => {
    const edit = edits[account.handle];
    if (!edit) return false;
    return (
      edit.label !== (account.label || '') ||
      edit.group !== account.group ||
      String(edit.hot_threshold) !== String(account.hot_threshold ?? '')
    );
  };

  const saveAccount = async (account) => {
    const edit = edits[account.handle];
    if (!edit) return;
    const value = Number.parseInt(edit.hot_threshold, 10);
    if (!Number.isFinite(value) || value < 1) {
      setNotice(`Invalid threshold for @${account.handle}.`);
      return;
    }
    setSavingHandle(account.handle);
    setNotice('');
    try {
      const params = new URLSearchParams({ password, hot_threshold: String(value), group: edit.group });
      // Backend ignores a blank label rather than clearing it, so only send
      // one when it actually has content.
      if (edit.label.trim()) params.set('label', edit.label.trim());
      const response = await apiFetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(account.handle)}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setNotice(body.detail || `Could not save @${account.handle}.`);
        return;
      }
      setNotice(`@${account.handle} updated.`);
      await loadRoster();
      onAccountsChanged?.();
    } catch (error) {
      setNotice('Network error while saving.');
    } finally {
      setSavingHandle('');
    }
  };

  const refreshAvatar = async (handle) => {
    setAvatarHandle(handle);
    setNotice('');
    try {
      const response = await apiFetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(handle)}/avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setNotice(body.detail || `Could not refresh the avatar for @${handle}.`);
        return;
      }
      setNotice(`Avatar refreshed for @${handle}.`);
      await loadRoster();
      onAccountsChanged?.();
    } catch (error) {
      setNotice('Network error refreshing the avatar.');
    } finally {
      setAvatarHandle('');
    }
  };

  const toggleActive = async (account) => {
    const endpoint = account.is_active ? 'deactivate' : 'activate';
    setLifecycleHandle(account.handle);
    setNotice('');
    try {
      const response = await apiFetch(
        `${API_BASE}/api/admin/accounts/${encodeURIComponent(account.handle)}/${endpoint}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ password }),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setNotice(body.detail || `Could not update @${account.handle}.`);
        return;
      }
      setNotice(account.is_active ? `@${account.handle} deactivated.` : `@${account.handle} reactivated.`);
      await loadRoster();
      onAccountsChanged?.();
    } catch (error) {
      setNotice('Network error.');
    } finally {
      setLifecycleHandle('');
    }
  };

  const runImport = async (handle) => {
    const from = importFrom[handle];
    // Count defaults to 2000 (same default the wizard uses) rather than
    // requiring one -- a date alone is still a valid request ("everything
    // since X"), same as before this field existed.
    const rawCount = importCount[handle];
    const count = Math.max(1, Math.min(5000, Math.round(Number(rawCount) || 2000)));
    setImporting(handle);
    setImportNotice((prev) => ({ ...prev, [handle]: 'Starting…' }));
    // Uses the background endpoint, not the synchronous one: a full-history
    // scrape from an old date routinely runs for minutes, far longer than the
    // proxy in front of the API holds an idle connection open. The blocking
    // call died every time here (same bug the add-account wizard had) and
    // left the account exactly where it started with no real error shown --
    // "Extraction failed" was actually "the request never got a response."
    try {
      const params = { password, results_limit: String(count) };
      if (from) params.date_from = from;
      const response = await apiFetch(`${API_BASE}/api/admin/accounts/backfill-bg/${encodeURIComponent(handle)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params),
      });
      const started = await response.json().catch(() => ({}));
      if (!response.ok) {
        setImportNotice((prev) => ({ ...prev, [handle]: started.detail || 'Could not start the import.' }));
        setImporting('');
        return;
      }
      if (started.already_running) {
        setImportNotice((prev) => ({
          ...prev,
          [handle]: `Another import (@${started.handle}) is already running. Try again once it finishes.`,
        }));
        setImporting('');
        return;
      }

      // Poll until the worker reports back. 2000 posts from an old date can
      // take a good while -- giving up early is what made this look broken
      // in the first place. 4s (not 10s) so the phase text below tracks the
      // real work closely instead of stepping in visible jumps.
      const pollStartedAt = Date.now();
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts += 1;
        try {
          const statusResponse = await apiFetch(`${API_BASE}/api/admin/accounts/backfill-status`);
          const status = await statusResponse.json().catch(() => ({}));
          if (status.running) {
            const elapsedSec = Math.round((Date.now() - pollStartedAt) / 1000);
            const live = describeBackfillProgress(status.progress, elapsedSec);
            setImportNotice((prev) => ({ ...prev, [handle]: live.text || `Importing… ${elapsedSec}s` }));
            if (attempts >= 300) { // ~20 minutes
              clearInterval(poll);
              setImportNotice((prev) => ({
                ...prev,
                [handle]: 'Still running on the server. New posts will show up on their own.',
              }));
              setImporting('');
            }
            return;
          }
          clearInterval(poll);
          if (status.error) {
            setImportNotice((prev) => ({ ...prev, [handle]: status.error }));
          } else {
            setImportNotice((prev) => ({ ...prev, [handle]: `Done: ${status.result?.added ?? 0} new posts.` }));
            onAccountsChanged?.();
            await loadRoster();
          }
          setImporting('');
        } catch {
          // Transient poll failure -- next tick tries again, importing stays
          // true so the button shows busy rather than falsely idle.
        }
      }, 4000);
    } catch (error) {
      setImportNotice((prev) => ({ ...prev, [handle]: 'Network error starting the import.' }));
      setImporting('');
    }
  };

  const sendSlackTest = async () => {
    setSlackSending(true);
    setSlackNotice('');
    try {
      const response = await apiFetch(`${API_BASE}/api/admin/slack-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSlackNotice(body.detail || 'Could not send the test alert.');
        return;
      }
      setSlackNotice(body.sent ? 'Test alert sent -- check Slack.' : 'Slack accepted the request but did not confirm delivery.');
    } catch (error) {
      setSlackNotice('Network error.');
    } finally {
      setSlackSending(false);
    }
  };

  // Object URLs need explicit cleanup or they leak for the life of the tab.
  // Swapping images (paste, then paste again, or paste then pick a file)
  // revokes the previous one before creating the next.
  const setCustomAlertFile = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setCustomAlertNotice('That attachment is not an image.');
      return;
    }
    setCustomAlertImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setCustomAlertImage(file);
  };

  const clearCustomAlertImage = () => {
    setCustomAlertImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
    setCustomAlertImage(null);
    if (customAlertFileInputRef.current) customAlertFileInputRef.current.value = '';
  };

  // Lets the message box double as a paste target: Cmd/Ctrl+V a screenshot
  // while the cursor is in there and it attaches instead of doing nothing
  // (images have no text representation to insert, so there's nothing to
  // suppress from the normal paste behavior).
  const handleCustomAlertPaste = (event) => {
    const item = Array.from(event.clipboardData?.items || []).find((entry) => entry.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (file) setCustomAlertFile(file);
  };

  const sendCustomAlert = async () => {
    const message = customAlertMessage.trim();
    if (!message) {
      setCustomAlertNotice('Write something to send first.');
      return;
    }
    setCustomAlertSending(true);
    setCustomAlertNotice('');
    try {
      const form = new FormData();
      form.set('password', password);
      form.set('message', message);
      if (customAlertTitle.trim()) form.set('title', customAlertTitle.trim());
      if (customAlertImage) form.set('image', customAlertImage);
      // No Content-Type header here on purpose -- the browser sets the
      // multipart boundary itself, and overriding it breaks the upload.
      const response = await apiFetch(`${API_BASE}/api/admin/slack-custom`, { method: 'POST', body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCustomAlertNotice(body.detail || 'Could not send the alert.');
        return;
      }
      setCustomAlertNotice(body.sent ? 'Alert sent -- check Slack.' : 'Slack accepted the request but did not confirm delivery.');
      if (body.sent) {
        setCustomAlertTitle('');
        setCustomAlertMessage('');
        clearCustomAlertImage();
      }
    } catch (error) {
      setCustomAlertNotice('Network error.');
    } finally {
      setCustomAlertSending(false);
    }
  };

  const startOcrSweep = async () => {
    setOcrStarting(true);
    setNotice('');
    try {
      const response = await apiFetch(`${API_BASE}/api/admin/ocr/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(body.detail || 'Could not start the OCR sweep.');
        return;
      }
      await loadSystemStatus();
    } catch (error) {
      setNotice('Network error starting the OCR sweep.');
    } finally {
      setOcrStarting(false);
    }
  };

  const addUser = async (event) => {
    event.preventDefault();
    const email = newUserEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setUsersNotice('Enter a valid email address.');
      return;
    }
    setAddingUser(true);
    setUsersNotice('');
    try {
      const response = await apiFetch(`${API_BASE}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          email,
          display_name: newUserDisplayName.trim() || email.split('@')[0],
          role: newUserIsAdmin ? 'admin' : 'viewer',
          operating_role: newUserOperatingRole,
          is_admin: String(newUserIsAdmin),
          slack_user_id: newUserSlackId.trim(),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setUsersNotice(body.detail || 'Could not add that person.');
        return;
      }
      const nextUsers = body.users || [];
      setUsers(nextUsers);
      setUserDisplayDrafts(Object.fromEntries(nextUsers.map((person) => [person.email, person.display_name || person.email.split('@')[0]])));
      setNewUserEmail('');
      setNewUserDisplayName('');
      setNewUserIsAdmin(false);
      setNewUserOperatingRole('pd');
      setNewUserSlackId('');
      setUsersNotice(`Added @${email}.`);
    } catch (error) {
      setUsersNotice('Network error while adding.');
    } finally {
      setAddingUser(false);
    }
  };

  const updateUser = async (user, changes) => {
    setUserActionEmail(user.email);
    setUsersNotice('');
    const nextRole = changes.role ?? user.role;
    const nextOperatingRole = changes.operating_role ?? user.operating_role ?? 'sales';
    const nextSlackId = changes.slack_user_id ?? user.slack_user_id ?? '';
    const nextDisplayName = changes.display_name ?? user.display_name ?? user.email.split('@')[0];
    const nextTimeZone = changes.time_zone ?? user.time_zone ?? '';
    const nextCanSelfAssign = changes.can_self_assign ?? Boolean(user.can_self_assign);
    const previousUser = user;
    // Reflect edits immediately. The API response remains authoritative, but
    // a slow round trip should never make the Users table feel unresponsive.
    setUsers((current) => current.map((person) => person.email === user.email ? {
      ...person,
      display_name: nextDisplayName,
      role: nextRole,
      operating_role: nextOperatingRole,
      slack_user_id: nextSlackId,
      time_zone: nextTimeZone,
      can_self_assign: nextCanSelfAssign ? 1 : 0,
      is_admin: nextRole === 'admin' ? 1 : 0,
    } : person));
    setUserDisplayDrafts((current) => ({ ...current, [user.email]: nextDisplayName }));
    try {
      const response = await apiFetch(`${API_BASE}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          email: user.email,
          display_name: nextDisplayName,
          role: nextRole,
          operating_role: nextOperatingRole,
          is_admin: String(nextRole === 'admin'),
          slack_user_id: nextSlackId,
          time_zone: nextTimeZone,
          can_self_assign: String(Boolean(nextCanSelfAssign)),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setUsers((current) => current.map((person) => person.email === user.email ? previousUser : person));
        setUserDisplayDrafts((current) => ({ ...current, [user.email]: previousUser.display_name || user.email.split('@')[0] }));
        setUsersNotice(body.detail || `Could not update ${user.email}.`);
        return;
      }
      const nextUsers = body.users || [];
      setUsers(nextUsers);
      setUserDisplayDrafts(Object.fromEntries(nextUsers.map((person) => [person.email, person.display_name || person.email.split('@')[0]])));
      await loadDesignerAccounts();
      setUsersNotice(`Updated ${user.email}.`);
    } catch (error) {
      setUsers((current) => current.map((person) => person.email === user.email ? previousUser : person));
      setUserDisplayDrafts((current) => ({ ...current, [user.email]: previousUser.display_name || user.email.split('@')[0] }));
      setUsersNotice('Network error while updating.');
    } finally {
      setUserActionEmail('');
    }
  };

  const addDesignerAccount = async (designerEmail) => {
    const handle = designerAccountChoice[designerEmail];
    if (!handle) return;
    setUserActionEmail(designerEmail);
    try {
      const response = await apiFetch(`${API_BASE}/api/admin/queue/designer-accounts`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ designer_email: designerEmail, account_handle: handle }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || 'Could not assign that account.');
      setDesignerAccounts(body.designers || []);
      setDesignerAccountChoice((current) => ({ ...current, [designerEmail]: '' }));
    } catch (error) { setUsersNotice(error.message); } finally { setUserActionEmail(''); }
  };

  const removeDesignerAccount = async (designerEmail, handle) => {
    setUserActionEmail(designerEmail);
    try {
      const query = new URLSearchParams({ designer_email: designerEmail, account_handle: handle });
      const response = await apiFetch(`${API_BASE}/api/admin/queue/designer-accounts?${query}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || 'Could not remove that account.');
      setDesignerAccounts(body.designers || []);
    } catch (error) { setUsersNotice(error.message); } finally { setUserActionEmail(''); }
  };

  const removeUser = async (email) => {
    setUserActionEmail(email);
    setUsersNotice('');
    try {
      const response = await apiFetch(`${API_BASE}/api/admin/users/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setUsersNotice(body.detail || `Could not remove ${email}.`);
        return;
      }
      setUsers(body.users || []);
      setUsersNotice(`Removed ${email}.`);
    } catch (error) {
      setUsersNotice('Network error while removing.');
    } finally {
      setUserActionEmail('');
    }
  };

  const ACCOUNT_SORT_COLUMNS = {
    handle: (a) => a.handle || '',
    group: (a) => a.group || '',
    followers: (a) => a.followers,
    total_posts: (a) => a.total_posts,
    avg_likes: (a) => a.avg_likes,
    hot_threshold: (a) => a.hot_threshold,
    is_active: (a) => (a.is_active ? 1 : 0),
  };

  const visibleRoster = roster.filter((account) => {
    if (accountStatusFilter === 'active' && account.is_active === false) return false;
    if (accountStatusFilter === 'inactive' && account.is_active !== false) return false;
    const q = accountSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      account.handle.toLowerCase().includes(q) ||
      (account.label || '').toLowerCase().includes(q) ||
      (account.group || '').toLowerCase().includes(q)
    );
  });

  const sortedRoster = [...visibleRoster].sort((a, b) => {
    const getValue = ACCOUNT_SORT_COLUMNS[accountSort.key] || ACCOUNT_SORT_COLUMNS.handle;
    const mul = accountSort.dir === 'asc' ? 1 : -1;
    const av = getValue(a);
    const bv = getValue(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // unknowns sort last regardless of direction
    if (bv == null) return -1;
    if (typeof av === 'string') return av.localeCompare(bv) * mul;
    return (av - bv) * mul;
  });

  const toggleAccountSort = (key) => {
    setAccountSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const fmtCompact = (n) => {
    if (n == null) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  };
  const userDisplayName = (email) => users.find((person) => person.email === email)?.display_name || email;

  // Plain date (no time) for "oldest post on file" -- this is how far back a
  // history backfill actually reached for that account, which is otherwise
  // invisible unless you go dig through the raw data.
  const fmtOldestPost = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const handleAccountCreated = async (account, legacyPassword) => {
    setShowAddAccount(false);
    addAccountBackfill(account);
    await loadRoster();
    setNotice(`@${account.handle} added. Initial history import is starting in the background.`);

    if (account.avatarUrl) {
      apiFetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(account.handle)}/avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ password: legacyPassword, image_url: account.avatarUrl }),
      }).then(() => loadRoster()).catch(() => {});
    }

    const params = { password: legacyPassword, results_limit: String(account.resultsLimit || 2000) };
    if (account.dateFrom) params.date_from = account.dateFrom;
    if (account.dateTo) params.date_to = account.dateTo;
    try {
      const response = await apiFetch(`${API_BASE}/api/admin/accounts/backfill-bg/${encodeURIComponent(account.handle)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params),
      });
      const started = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = started.detail || 'Could not start the initial history import.';
        patchAccountBackfill(account.handle, { phase: 'error', error: message });
        setNotice(`@${account.handle} was added, but its initial history import could not be started.`);
      } else if (started.already_running) {
        const message = `Another import (@${started.handle || 'another account'}) is already running. Try again once it finishes.`;
        patchAccountBackfill(account.handle, { phase: 'error', error: message });
        setNotice(`@${account.handle} was added, but its initial history import is waiting for another import to finish.`);
      } else {
        patchAccountBackfill(account.handle, { phase: 'importing', serverProgress: { phase: 'queued' }, error: '' });
      }
    } catch {
      patchAccountBackfill(account.handle, { phase: 'error', error: 'Network error while starting the initial history import.' });
      setNotice(`@${account.handle} was added, but its initial history import could not be started.`);
    }
    onAccountsChanged?.();
  };

  return (
    <div className="admin-page">
      <header className="admin-page-header settings-command-header">
        <a className="settings-command-brand" href={`${import.meta.env.BASE_URL}settings.html`} aria-label="Settings home">
          <span className="settings-command-mark"><Settings size={19} /></span>
          <span><small>sentientdash.app</small><strong>{t('Settings')}</strong></span>
        </a>
        <nav className="settings-command-nav" aria-label="Sentient tools">
          <a href={import.meta.env.BASE_URL}>{t('Dashboard')}</a>
          <a href={`${import.meta.env.BASE_URL}tracker.html`}>{t('Tracker')}</a>
          <a href={`${import.meta.env.BASE_URL}insights.html`}>{t('Insights')}</a>
          <a href={`${import.meta.env.BASE_URL}queue.html`}>{t('Queue')}</a>
          <span aria-current="page">{t('Settings')}</span>
        </nav>
        <SettingsMenu
          email={userEmail}
          avatarUrl={userPhoto}
          isAdmin={isAdmin}
          isDev={isDev}
          onSignOut={onSignOut}
          showSettingsLink={false}
        />
      </header>

      <div className="admin-page-body">
        <section className="settings-command-intro">
          <div>
            <span className="settings-command-kicker">{t('Command center')}</span>
            <h1>{t('Workspace settings')}</h1>
            <p>{t('Manage the people, accounts, operations, notifications, and production controls shared by every Sentient tool.')}</p>
          </div>
          <div className="settings-command-access">
            <span>{isDev ? 'DEV' : 'ADMIN'}</span>
            <small>{userEmail}</small>
          </div>
        </section>
        <div className="settings-body">
          <div className="settings-tabs" role="tablist">
            {[
              ['overview', t('Overview')],
              ['accounts', t('Accounts')],
              ['users', t('Users')],
              ['usage', t('Usage')],
              ['notifications', t('Notifications')],
              ['system', t('System')],
              ['reports', t('Reports')],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                className={tab === value ? 'settings-tab settings-tab-active' : 'settings-tab'}
                onClick={() => selectTab(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {notice ? <p className="settings-notice">{notice}</p> : null}

          {tab === 'overview' ? (
            <div className="settings-overview-grid">
              {[
                { tab: 'accounts', label: t('Accounts'), value: roster.length, detail: `${roster.filter((item) => item.is_active !== false).length} ${t('active sources')}`, icon: <AtSign size={18} /> },
                { tab: 'users', label: t('Users'), value: users.length, detail: `${users.filter((item) => item.is_admin).length} ${t('administrators')}`, icon: <Users size={18} /> },
                { tab: 'usage', label: t('Usage'), value: '30d', detail: t('Activity and adoption'), icon: <BarChart3 size={18} /> },
                { tab: 'notifications', label: t('Notifications'), value: slackStatus?.configured ? t('Live') : t('Check'), detail: slackStatus?.configured ? t('Slack delivery configured') : t('Slack status unavailable'), icon: <MessageSquare size={18} /> },
                { tab: 'system', label: t('System'), value: disk ? `${disk.pct_used}%` : '—', detail: disk ? `${disk.free_mb.toLocaleString()} MB ${t('free')}` : t('Diagnostics and maintenance'), icon: <HardDrive size={18} /> },
                { tab: 'reports', label: t('Reports'), value: report?.assignedPosts?.length ?? '—', detail: t('Assigned Queue posts'), icon: <TrendingUp size={18} /> },
              ].map((item) => (
                <button type="button" className="settings-overview-card" key={item.tab} onClick={() => selectTab(item.tab)}>
                  <span className="settings-overview-icon">{item.icon}</span>
                  <span><small>{item.label}</small><strong>{item.value}</strong><em>{item.detail}</em></span>
                  <ChevronDown size={15} className="settings-overview-arrow" />
                </button>
              ))}
              <section className="settings-overview-brief">
                <div><span className="settings-command-kicker">{t('Shared control plane')}</span><h2>{t('One source of truth')}</h2></div>
                <p>{t('Changes made here affect Dashboard, Tracker, Insights, and Queue. Operational controls no longer live in tool-specific admin panels.')}</p>
              </section>
            </div>
          ) : tab === 'accounts' ? (
              <>
                {accountBackfills.length ? (
                  <section className="settings-section settings-account-backfill-progress" aria-live="polite">
                    <div className="settings-section-head">
                      <div>
                        <span className="settings-command-kicker">Account onboarding</span>
                        <h3>Initial history import</h3>
                      </div>
                      <span className="settings-account-backfill-count">
                        {accountBackfills.filter((task) => ['starting', 'importing', 'waiting'].includes(task.phase)).length
                          ? 'In progress'
                          : 'Recent'}
                      </span>
                    </div>
                    <p className="wizard-hint">
                      New accounts stay here while their history is collected. This status survives a reload and clears after the import finishes.
                    </p>
                    <div className="settings-account-backfill-list">
                      {accountBackfills.map((task) => {
                        const elapsedSec = Math.max(0, Math.round((accountBackfillNow - (task.startedAt || accountBackfillNow)) / 1000));
                        const live = task.phase === 'importing' ? describeBackfillProgress(task.serverProgress, elapsedSec) : null;
                        const statusText =
                          task.phase === 'starting' ? 'Starting the import…' :
                          task.phase === 'waiting' ? `Waiting for @${task.waitingFor || 'another account'} to finish…` :
                          task.phase === 'done' ? `Imported ${task.added ?? 0} new post${task.added === 1 ? '' : 's'}.` :
                          task.phase === 'error' ? task.error || 'Import could not be started.' :
                          live?.text || `Importing post history… ${elapsedSec}s`;
                        const percent = live?.percent;
                        return (
                          <article key={task.id || task.handle} className={`settings-account-backfill-card settings-account-backfill-${task.phase}`}>
                            <span className="settings-account-backfill-avatar" aria-hidden="true">
                              {task.avatarUrl ? <img src={task.avatarUrl} alt="" referrerPolicy="no-referrer" /> : (task.label || task.handle).slice(0, 2).toUpperCase()}
                            </span>
                            <div className="settings-account-backfill-main">
                              <div className="settings-account-backfill-topline">
                                <div>
                                  <strong>@{task.handle}</strong>
                                  <span>{task.label || task.handle}</span>
                                </div>
                                {['done', 'error'].includes(task.phase) ? (
                                  <button
                                    type="button"
                                    className="settings-account-backfill-dismiss"
                                    onClick={() => dismissAccountBackfill(task.handle)}
                                    aria-label={`Dismiss import status for ${task.handle}`}
                                  >
                                    <X size={13} />
                                  </button>
                                ) : null}
                              </div>
                              <p>{statusText}</p>
                              <div className="settings-account-backfill-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent ?? undefined}>
                                {percent != null ? <span style={{ width: `${percent}%` }} /> : <span className="indeterminate" />}
                              </div>
                            </div>
                            <span className="settings-account-backfill-percent">
                              {percent != null ? `${percent}%` : task.phase === 'done' ? '100%' : 'Live'}
                            </span>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
                <section className="settings-section">
                  <div className="settings-section-head">
                    <h3>{t('Manage accounts')}</h3>
                    <div className="settings-section-actions">
                      <span className="accounts-count">{sortedRoster.length} of {roster.length}</span>
                      <button type="button" className="ghost-button primary" onClick={() => setShowAddAccount(true)}>
                        <Plus size={13} /> {t('Add account')}
                      </button>
                    </div>
                  </div>
                  <p className="wizard-hint">
                    Click a row to edit its label, category, HOT threshold, or avatar, or pull more history.
                    "Suggested" is the account's average first-hour likes (the same number the HOT check
                    itself compares against), rounded up to the nearest hundred.
                  </p>

                  <div className="accounts-toolbar">
                    <input
                      type="text"
                      className="accounts-search"
                      placeholder="Search by handle, label, or category…"
                      value={accountSearch}
                      onChange={(event) => setAccountSearch(event.target.value)}
                    />
                    <div className="accounts-status-filter">
                      {[
                        { value: 'active', label: 'Active' },
                        { value: 'inactive', label: 'Inactive' },
                        { value: 'all', label: 'All' },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`chip-button${accountStatusFilter === option.value ? ' active' : ''}`}
                          onClick={() => setAccountStatusFilter(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="accounts-table-wrap">
                    <table className="accounts-table">
                      <thead>
                        <tr>
                          {[
                            { key: 'handle', label: 'Account' },
                            { key: 'group', label: 'Category' },
                            { key: 'followers', label: 'Followers' },
                            { key: 'total_posts', label: 'Posts' },
                            { key: 'avg_likes', label: 'Avg 1h likes (30d)' },
                            { key: 'hot_threshold', label: 'HOT /hr' },
                            { key: 'is_active', label: 'Status' },
                          ].map((col) => (
                            <th key={col.key} className="accounts-th-sortable" onClick={() => toggleAccountSort(col.key)}>
                              {col.label}
                              {accountSort.key === col.key ? (
                                <ArrowUpDown size={11} className={accountSort.dir === 'desc' ? 'flip' : ''} />
                              ) : null}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRoster.map((account) => {
                          const isOpen = expandedHandle === account.handle;
                          const edit = edits[account.handle] || { label: '', group: account.group, hot_threshold: '' };
                          const isInactive = account.is_active === false;
                          return (
                            <Fragment key={account.handle}>
                              <tr
                                className={`accounts-row${isOpen ? ' open' : ''}${isInactive ? ' inactive' : ''}`}
                                data-context-type="account"
                                data-context-title={`@${account.handle}`}
                                data-context-handle={account.handle}
                                data-context-account={account.handle}
                                onClick={() => setExpandedHandle(isOpen ? '' : account.handle)}
                              >
                                <td className="accounts-cell-handle">
                                  <span className="account-manage-avatar accounts-avatar-sm" aria-hidden="true">
                                    {ACCOUNT_PROFILE_IMAGES[account.handle] ? (
                                      <img src={ACCOUNT_PROFILE_IMAGES[account.handle]} alt="" />
                                    ) : account.has_avatar ? (
                                      <img
                                        src={`${API_BASE}/api/dashboard/avatar/${encodeURIComponent(account.handle)}`}
                                        alt=""
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      <span>{account.handle.slice(0, 2).toUpperCase()}</span>
                                    )}
                                  </span>
                                  <span className="accounts-handle-text">
                                    <strong>@{account.handle}</strong>
                                    {account.is_canonical ? (
                                      <span className="status-pill status-pill-canonical">Canonical</span>
                                    ) : null}
                                  </span>
                                </td>
                                <td>{ACCOUNT_GROUP_OPTIONS.find((option) => option.value === account.group)?.label || account.group}</td>
                                <td>{fmtCompact(account.followers)}</td>
                                <td>{fmtCompact(account.total_posts)}</td>
                                <td>{fmtCompact(account.avg_likes)}</td>
                                <td>{account.hot_threshold ?? '—'}</td>
                                <td>
                                  <span className={`status-pill ${isInactive ? 'status-pill-inactive' : 'status-pill-active'}`}>
                                    {isInactive ? 'Inactive' : 'Active'}
                                  </span>
                                </td>
                              </tr>
                              {isOpen ? (
                                <tr className="accounts-detail-row">
                                  <td colSpan={7}>
                                    <div className="account-manage-detail" onClick={(event) => event.stopPropagation()}>
                                      <div className="account-manage-fields">
                                        <label className="account-manage-field">
                                          <span>Label</span>
                                          <input
                                            type="text"
                                            value={edit.label}
                                            placeholder={account.handle}
                                            onChange={(event) =>
                                              setEdits((prev) => ({
                                                ...prev,
                                                [account.handle]: { ...prev[account.handle], label: event.target.value },
                                              }))
                                            }
                                          />
                                        </label>
                                        <label className="account-manage-field">
                                          <span>Category</span>
                                          <select
                                            value={edit.group}
                                            onChange={(event) =>
                                              setEdits((prev) => ({
                                                ...prev,
                                                [account.handle]: { ...prev[account.handle], group: event.target.value },
                                              }))
                                            }
                                          >
                                            {ACCOUNT_GROUP_OPTIONS.map((option) => (
                                              <option key={option.value} value={option.value}>
                                                {option.label}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <label className="account-manage-field account-manage-field-narrow">
                                          <span>HOT /hr</span>
                                          <input
                                            type="number"
                                            min={1}
                                            value={edit.hot_threshold}
                                            onChange={(event) =>
                                              setEdits((prev) => ({
                                                ...prev,
                                                [account.handle]: { ...prev[account.handle], hot_threshold: event.target.value },
                                              }))
                                            }
                                          />
                                          {account.suggested_hot_threshold ? (
                                            <button
                                              type="button"
                                              className="hot-suggestion"
                                              title={`Based on ${account.avg_likes_sample_size} post(s)' first-hour likes, last 30 days`}
                                              onClick={() =>
                                                setEdits((prev) => ({
                                                  ...prev,
                                                  [account.handle]: {
                                                    ...prev[account.handle],
                                                    hot_threshold: String(account.suggested_hot_threshold),
                                                  },
                                                }))
                                              }
                                            >
                                              Suggested: {account.suggested_hot_threshold.toLocaleString()}
                                            </button>
                                          ) : null}
                                        </label>
                                        <button
                                          type="button"
                                          className="ghost-button primary"
                                          onClick={() => saveAccount(account)}
                                          disabled={savingHandle === account.handle || !isDirty(account)}
                                        >
                                          {savingHandle === account.handle ? '…' : 'Save'}
                                        </button>
                                        <span className="account-manage-oldest-post" title="Published date of the oldest post we have on file for this account">
                                          Oldest post: {fmtOldestPost(account.oldest_post_at)}
                                        </span>
                                      </div>

                                      <div className="account-manage-actions">
                                        <button
                                          type="button"
                                          className="ghost-button"
                                          onClick={() => refreshAvatar(account.handle)}
                                          disabled={avatarHandle === account.handle}
                                        >
                                          <ImagePlus size={13} />
                                          {avatarHandle === account.handle ? 'Refreshing…' : 'Refresh avatar'}
                                        </button>
                                        <button
                                          type="button"
                                          className="ghost-button ghost-button-danger"
                                          onClick={() => toggleActive(account)}
                                          disabled={lifecycleHandle === account.handle || account.is_canonical}
                                          title={account.is_canonical ? 'The canonical account cannot be deactivated.' : undefined}
                                        >
                                          <Power size={13} />
                                          {lifecycleHandle === account.handle ? '…' : isInactive ? 'Reactivate' : 'Deactivate'}
                                        </button>
                                        {!isInactive ? (
                                          <div className="account-manage-import">
                                            <input
                                              type="date"
                                              value={importFrom[account.handle] ?? ''}
                                              onChange={(event) =>
                                                setImportFrom((prev) => ({ ...prev, [account.handle]: event.target.value }))
                                              }
                                              aria-label={`Extract from for ${account.handle}`}
                                              title="Optional: only posts from this date on"
                                            />
                                            <input
                                              type="number"
                                              min={1}
                                              max={5000}
                                              placeholder="2000"
                                              value={importCount[account.handle] ?? ''}
                                              onChange={(event) =>
                                                setImportCount((prev) => ({ ...prev, [account.handle]: event.target.value }))
                                              }
                                              aria-label={`Number of posts to extract for ${account.handle}`}
                                              title="How many posts to pull (default 2000)"
                                              className="account-manage-import-count"
                                            />
                                            <span className="account-manage-import-cost">
                                              ~${(
                                                Math.max(1, Math.min(5000, Math.round(Number(importCount[account.handle]) || 2000))) * 0.0023
                                              ).toFixed(2)}
                                            </span>
                                            <button
                                              type="button"
                                              className="ghost-button"
                                              onClick={() => runImport(account.handle)}
                                              disabled={importing === account.handle}
                                            >
                                              {importing === account.handle ? '…' : 'Extract history'}
                                            </button>
                                          </div>
                                        ) : null}
                                      </div>
                                      {importNotice[account.handle] ? (
                                        <p className="settings-import-notice">{importNotice[account.handle]}</p>
                                      ) : null}
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })}
                        {!sortedRoster.length ? (
                          <tr>
                            <td colSpan={7} className="accounts-table-empty">No accounts match.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : tab === 'system' || tab === 'notifications' ? (
              <div className="system-tab-grid">
                {tab === 'system' ? <>
                <section className="settings-section system-card">
                  <div className="settings-section-head">
                    <h3>{t('Refresh now')}</h3>
                    <button
                      type="button"
                      className="ghost-button settings-refresh"
                      onClick={() => onRefresh(password)}
                      disabled={refreshing}
                    >
                      <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
                      <span>{refreshing ? t('Refreshing…') : t('Refresh')}</span>
                    </button>
                  </div>
                  <p className="wizard-hint">
                    Runs the engagement cycle for every account. Normally happens on its own every 30 minutes.
                  </p>
                  {refreshNotice ? (
                    <p className={refreshNotice.type === 'error' ? 'settings-notice-error' : 'settings-notice'}>
                      {refreshNotice.text}
                    </p>
                  ) : null}
                </section>

                <section className="settings-section system-card">
                  <div className="settings-section-head">
                    <h3>
                      <HardDrive size={13} /> {t('Disk usage')}
                    </h3>
                  </div>
                  {disk ? (
                    <>
                      <div className="disk-bar">
                        <div
                          className="disk-bar-fill"
                          style={{
                            width: `${Math.min(disk.pct_used, 100)}%`,
                            background: disk.pct_used >= 85 ? '#ff4d4d' : disk.pct_used >= 70 ? '#ffb020' : '#23a047',
                          }}
                        />
                      </div>
                      <p className="wizard-hint">
                        {disk.pct_used}% used -- {disk.used_mb.toLocaleString()} MB / {disk.total_mb.toLocaleString()} MB
                        ({disk.free_mb.toLocaleString()} MB free)
                      </p>
                    </>
                  ) : (
                    <p className="wizard-hint">Loading…</p>
                  )}
                </section>

                </> : null}

                {tab === 'notifications' ? <>
                <section className="settings-section system-card">
                  <h3>
                    <MessageSquare size={13} /> {t('Slack alerts')}
                  </h3>
                  <p className="wizard-hint">
                    {slackStatus
                      ? slackStatus.configured
                        ? `Configured -- alerting for: ${slackStatus.alert_groups}`
                        : 'No Slack webhook configured on the server.'
                      : 'Loading…'}
                  </p>
                  <div className="settings-section-head">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={sendSlackTest}
                      disabled={slackSending || !slackStatus?.configured}
                    >
                      {slackSending ? t('Sending…') : t('Send test alert')}
                    </button>
                  </div>
                  {slackNotice ? <p className="settings-notice">{slackNotice}</p> : null}
                </section>

                <section className="settings-section system-card system-card-wide">
                  <h3>
                    <Megaphone size={13} /> {t('Custom alert')}
                  </h3>
                  <p className="wizard-hint">
                    Send a one-off Slack message for anything that doesn't fit HOT posts, disk, or snapshot alerts.
                  </p>
                  <div className="custom-alert-form">
                    <input
                      type="text"
                      className="custom-alert-title"
                      placeholder="Title (optional)"
                      value={customAlertTitle}
                      onChange={(event) => setCustomAlertTitle(event.target.value)}
                      maxLength={120}
                    />
                    <textarea
                      className="custom-alert-message"
                      placeholder="What do you want to notify? (You can paste an image here too)"
                      value={customAlertMessage}
                      onChange={(event) => setCustomAlertMessage(event.target.value)}
                      onPaste={handleCustomAlertPaste}
                      rows={3}
                      maxLength={2900}
                    />
                    {customAlertImagePreview ? (
                      <div className="custom-alert-preview">
                        <img src={customAlertImagePreview} alt="Attachment preview" />
                        <button
                          type="button"
                          className="custom-alert-preview-remove"
                          onClick={clearCustomAlertImage}
                          aria-label="Remove attached image"
                          title="Remove image"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : null}
                    <input
                      type="file"
                      accept="image/*"
                      ref={customAlertFileInputRef}
                      onChange={(event) => setCustomAlertFile(event.target.files?.[0])}
                      style={{ display: 'none' }}
                    />
                    <div className="settings-section-head">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => customAlertFileInputRef.current?.click()}
                        disabled={customAlertSending}
                      >
                        <ImagePlus size={13} /> {customAlertImage ? 'Change image' : 'Upload image'}
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={sendCustomAlert}
                        disabled={customAlertSending || !slackStatus?.configured || !customAlertMessage.trim()}
                      >
                        {customAlertSending ? 'Sending…' : 'Send alert'}
                      </button>
                    </div>
                  </div>
                  {customAlertNotice ? <p className="settings-notice">{customAlertNotice}</p> : null}
                </section>

                </> : null}

                {tab === 'system' ? <>
                <section className="settings-section system-card system-card-wide">
                  <h3>{t('Recent Apify runs')}</h3>
                  <div className="settings-table">
                    {apifyLoading ? <p className="wizard-hint">Loading…</p> : null}
                    {apifyRuns.map((run) => (
                      <div className="settings-row" key={run.id}>
                        <div className="settings-row-account">
                          <strong>{run.status}</strong>
                          <span>{run.startedAt ? new Date(run.startedAt).toLocaleString() : '—'}</span>
                        </div>
                        <div className="settings-row-controls">
                          <span className="settings-unit">
                            {typeof run.usd === 'number' ? `$${run.usd.toFixed(2)}` : '—'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {!apifyLoading && !apifyRuns.length ? <p className="wizard-hint">No runs found.</p> : null}
                  </div>
                </section>

                <section className="settings-section system-card">
                  <div className="settings-section-head">
                    <h3>
                      <ScanText size={13} /> {t('Cover OCR sweep')}
                    </h3>
                  </div>
                  <p className="wizard-hint">
                    {ocrStatus
                      ? `${ocrStatus.remaining.toLocaleString()} covers still need OCR (${ocrStatus.with_text_total.toLocaleString()} already have text).`
                      : 'Loading…'}
                  </p>
                  <div className="settings-section-head">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={startOcrSweep}
                      disabled={ocrStarting || Boolean(ocrStatus?.running)}
                    >
                      {ocrStatus?.running ? `Running… (${ocrStatus.done} done)` : 'Run OCR sweep'}
                    </button>
                  </div>
                </section>
                </> : null}
              </div>
            ) : tab === 'users' || tab === 'usage' ? (
              <>
              {tab === 'users' ? (
              <div className="settings-list-width">
                <section className="settings-section">
                  <h3>{t('Who can sign in')}</h3>
                  <p className="wizard-hint">
                    Admins and Devs manage shared access here. Every listed person has Dashboard and Post Designer
                    access; the Queue role below grants an additional operating perspective when needed.
                  </p>
                  <form className="add-user-form" onSubmit={addUser}>
                    <label className="modal-field">
                      <span>{t('Display name')}</span>
                      <input
                        value={newUserDisplayName}
                        onChange={(event) => setNewUserDisplayName(event.target.value)}
                        placeholder="e.g. Esteban"
                        required
                      />
                    </label>
                    <label className="modal-field">
                      <span>{t('Email')}</span>
                      <input
                        type="email"
                        value={newUserEmail}
                        onChange={(event) => setNewUserEmail(event.target.value)}
                        placeholder="name@example.com"
                        required
                      />
                    </label>
                    <label className="modal-field">
                      <span>{t('Queue role')}</span>
                      <select value={newUserOperatingRole} onChange={(event) => setNewUserOperatingRole(event.target.value)}>
                        <option value="pd">Post Designer only</option><option value="sales">Sales</option><option value="vc">Viral Coordinator</option><option value="trainee">Trainee</option>
                      </select>
                    </label>
                    <label className="modal-field">
                      <span>{t('Slack user ID')}</span>
                      <input value={newUserSlackId} onChange={(event) => setNewUserSlackId(event.target.value.toUpperCase())} placeholder="U0123456789" />
                    </label>
                    <label className="modal-field-checkbox">
                      <input type="checkbox" checked={newUserIsAdmin} onChange={(event) => setNewUserIsAdmin(event.target.checked)} />
                      <span>{t('Admin (full Settings access)')}</span>
                    </label>
                    <button type="submit" className="ghost-button primary" disabled={addingUser}>
                      {addingUser ? t('Adding…') : t('Add')}
                    </button>
                  </form>
                  {usersNotice ? <p className="settings-notice">{usersNotice}</p> : null}
                </section>

                <section className="settings-section">
                  <h3>{t('People with access')}</h3>
                  <p className="wizard-hint">
                    Role and Queue account assignment live on the same row per person now -- there
                    used to be a second, separate list here just for accounts, keyed off a
                    different endpoint, which meant scrolling to two places to see one person's
                    full access.
                  </p>
                  <div className="settings-table">
                    {usersLoading ? <p className="wizard-hint">Loading…</p> : null}
                    {users.map((user) => {
                      const designer = designerAccounts.find((item) => item.email === user.email) || { email: user.email, accounts: [] };
                      const available = roster.filter((account) => account.group === 'sentient' && account.is_active !== false && !designer.accounts.includes(account.handle));
                      return (
                        <div
                          className="settings-row settings-row-wide"
                          key={user.email}
                          data-context-type="user"
                          data-context-title={user.display_name || user.email.split('@')[0]}
                          data-context-email={user.email}
                        >
                          <div className="settings-row-account">
                            <span className="settings-user-avatar" aria-hidden="true">
                              <span>{(user.display_name || user.email.split('@')[0]).split(/\s+/).map((word) => word.slice(0, 1)).join('').slice(0, 2).toUpperCase()}</span>
                              {user.avatar_url ? <img src={settingsUserAvatar(user.avatar_url)} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} /> : null}
                            </span>
                            <div className="settings-user-copy">
                              <strong>{user.display_name || user.email.split('@')[0]}</strong>
                            <small>{user.email}</small>
                            <span>{(() => {
                              let roles = user.operating_roles;
                              if (typeof roles === 'string') {
                                try { roles = JSON.parse(roles); } catch { roles = []; }
                              }
                              if (!Array.isArray(roles)) roles = [];
                              const labels = [];
                              if (roles.includes('vc') || user.operating_role === 'vc') labels.push('VC');
                              if (roles.includes('sales') || user.operating_role === 'sales') labels.push('Sales');
                              if (roles.includes('trainee') || user.operating_role === 'trainee') labels.push('Trainee');
                              if (user.role === 'admin' || user.is_admin) labels.push('Admin');
                              if (roles.includes('dev')) labels.push('Dev');
                              return labels.join(' · ') || 'Standard access';
                            })()}</span>
                            </div>
                          </div>
                          <div className="settings-row-controls queue-user-controls">
                            <input
                              value={userDisplayDrafts[user.email] ?? (user.display_name || user.email.split('@')[0])}
                              aria-label={`Display name for ${user.email}`}
                              placeholder="Display name"
                              onChange={(event) => setUserDisplayDrafts((current) => ({ ...current, [user.email]: event.target.value }))}
                              onBlur={(event) => {
                                const value = event.target.value.trim();
                                if (value && value !== (user.display_name || '')) updateUser(user, { display_name: value });
                              }}
                            />
                            <select value={user.operating_role || 'pd'} aria-label={`Queue role for ${user.email}`} onChange={(event) => updateUser(user, { operating_role: event.target.value })} disabled={userActionEmail === user.email}>
                              <option value="pd">Post Designer only</option><option value="sales">Sales</option><option value="vc">VC</option><option value="trainee">Trainee</option>
                            </select>
                            <select value={user.time_zone || ''} aria-label={`Time zone for ${user.email}`} onChange={(event) => updateUser(user, { time_zone: event.target.value })} disabled={userActionEmail === user.email}>
                              <option value="">Automatic browser zone</option><option value="America/Costa_Rica">Costa Rica (UTC−6)</option><option value="America/Bogota">Colombia (UTC−5)</option>
                            </select>
                            <input defaultValue={user.slack_user_id || ''} aria-label={`Slack user ID for ${user.email}`} placeholder="Slack ID" onBlur={(event) => { if (event.target.value.trim() !== (user.slack_user_id || '')) updateUser(user, { slack_user_id: event.target.value.trim().toUpperCase() }); }} />
                            <label className="settings-user-admin-toggle">
                              <input type="checkbox" checked={Boolean(user.can_self_assign)} onChange={(event) => updateUser(user, { can_self_assign: event.target.checked })} disabled={userActionEmail === user.email} />
                              <span>Self-assign</span>
                            </label>
                            <label className="settings-user-admin-toggle">
                              <input
                                type="checkbox"
                                checked={user.role === 'admin'}
                                onChange={(event) => updateUser(user, { role: event.target.checked ? 'admin' : 'viewer' })}
                                disabled={userActionEmail === user.email || user.email === userEmail}
                              />
                              <span>Admin</span>
                            </label>
                            <button
                              type="button"
                              className="ghost-button ghost-button-danger"
                              onClick={() => removeUser(user.email)}
                              disabled={userActionEmail === user.email}
                            >
                              Remove
                            </button>
                          </div>
                          <div className="settings-row-accounts">
                            <span className="settings-row-accounts-label">Queue accounts</span>
                            <div className="queue-designer-account-chips">
                              {designer.accounts.map((handle) => (
                                <button type="button" key={handle} onClick={() => removeDesignerAccount(user.email, handle)} disabled={userActionEmail === user.email}>
                                  @{handle} <X size={11} />
                                </button>
                              ))}
                              {!designer.accounts.length ? <em>No accounts assigned</em> : null}
                            </div>
                            <div className="queue-designer-add">
                              <select value={designerAccountChoice[user.email] || ''} onChange={(event) => setDesignerAccountChoice((current) => ({ ...current, [user.email]: event.target.value }))}>
                                <option value="">Choose Sentient account</option>
                                {available.map((account) => <option key={account.handle} value={account.handle}>@{account.handle}</option>)}
                              </select>
                              <button type="button" className="ghost-button" disabled={!designerAccountChoice[user.email] || userActionEmail === user.email} onClick={() => addDesignerAccount(user.email)}>Assign</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {!usersLoading && !users.length ? <p className="wizard-hint">No one loaded yet.</p> : null}
                  </div>
                </section>
              </div>
              ) : null}

              {tab === 'usage' ? (
              <section className="settings-section usage-section">
                <h3>{t('Usage')}</h3>
                <p className="wizard-hint">
                  Who actually opens sentientdash.app, how often, and when — last {usage?.days ?? 30} days.
                </p>
                {usageLoading && !usage ? (
                  <p className="wizard-hint">Loading…</p>
                ) : !usage ? (
                  <p className="wizard-hint">Couldn't load usage data.</p>
                ) : (
                  <>
                    <div className="usage-kpis">
                      <div className="usage-kpi">
                        <b>Active, 7d</b>
                        <strong>{usage.active_users_7d}</strong>
                        <em>of {usage.total_users} people</em>
                      </div>
                      <div className="usage-kpi">
                        <b>Active, 30d</b>
                        <strong>{usage.active_users_30d}</strong>
                        <em>of {usage.total_users} people</em>
                      </div>
                      <div className="usage-kpi">
                        <b>Requests, 30d</b>
                        <strong>{usage.total_events_in_range.toLocaleString('en-US')}</strong>
                        <em>across everyone</em>
                      </div>
                    </div>

                    <h4 className="usage-subhead">Daily activity per person</h4>
                    <div className="usage-heatmap-scroll">
                      <div
                        className="usage-grid"
                        style={{ gridTemplateColumns: `160px repeat(${usage.day_keys.length}, 1fr)` }}
                      >
                        <div className="usage-grid-corner" />
                        {usage.day_keys.map((day, index) => (
                          <div className="usage-daylabel" key={day}>
                            {index % 5 === 0 ? day.slice(5).replace('-', '/') : ''}
                          </div>
                        ))}
                        {usage.users.map((person) => (
                          <div className="usage-row-group" key={person.email}>
                            <div className="usage-rowlabel">
                              <strong>{userDisplayName(person.email)}</strong>
                              <span className={`usage-role-pill ${person.role}`}>{person.role}</span>
                            </div>
                            {person.daily.map((d) => (
                              <div
                                key={d.date}
                                className="usage-cell"
                                title={`${userDisplayName(person.email)} · ${d.date} · ${d.count} request${d.count === 1 ? '' : 's'}`}
                                style={{ background: usageCellColor(d.count) }}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="usage-secondary">
                      <div>
                        <h4 className="usage-subhead">When the team is online (UTC)</h4>
                        <div
                          className="usage-grid usage-dowhour-grid"
                          style={{ gridTemplateColumns: '48px repeat(24, 1fr)' }}
                        >
                          <div className="usage-grid-corner" />
                          {Array.from({ length: 24 }, (_, hour) => (
                            <div className="usage-hourlabel" key={hour}>
                              {hour % 3 === 0 ? hour : ''}
                            </div>
                          ))}
                          {usage.dow_labels.map((label, dayIndex) => (
                            <div className="usage-row-group" key={label}>
                              <div className="usage-dowlabel">{label}</div>
                              {usage.global_dow_hour[dayIndex].map((count, hourIndex) => (
                                <div
                                  key={hourIndex}
                                  className="usage-cell"
                                  title={`${label} ${hourIndex}:00 UTC · ${count} request${count === 1 ? '' : 's'}`}
                                  style={{ background: usageCellColor(count) }}
                                />
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h4 className="usage-subhead">Per-person detail</h4>
                        <div className="usage-detail-list">
                          {usage.users.map((person) => (
                            <div className="usage-detail-row" key={person.email}>
                              <div className="usage-detail-account">
                                <strong>{userDisplayName(person.email)}</strong>
                                <span className={`usage-role-pill ${person.role}`}>{person.role}</span>
                              </div>
                              <div className="usage-detail-stats">
                                <span>{person.total_all_time.toLocaleString('en-US')} total</span>
                                <span>{person.last_7d} last 7d</span>
                                <span>{person.active_days} active days</span>
                                <span>
                                  {person.last_seen
                                    ? `last seen ${formatElapsed(new Date(person.last_seen).getTime())} ago`
                                    : 'never signed in'}
                                </span>
                              </div>
                              <div className="usage-detail-sections">
                                <span title="Dashboard requests">Dash {person.sections.dashboard}</span>
                                <span title="Insights requests">Insights {person.sections.insights}</span>
                                <span title="Admin panel requests">Admin {person.sections.admin}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </section>
              ) : null}
              </>
            ) : (
              <div className="settings-list-width">
                <section className="settings-section">
                  <h3>{t('Queue production report')}</h3>
                  <p className="wizard-hint">
                    Same data Queue's own Admin overlay used to show in a second, separate panel --
                    one Reports tab here instead of two admin tools telling the same story.
                  </p>
                  {reportError ? <p className="settings-notice-error">{reportError}</p> : null}
                  {reportLoading && !report ? <p className="wizard-hint">Loading…</p> : null}
                </section>

                {report ? (
                  <>
                    <section className="settings-section">
                      <h3>Status</h3>
                      <div className="system-tab-grid">
                        {[
                          ['pool', 'In pool'],
                          ['scheduled', 'Scheduled'],
                          ['in_progress', 'In progress'],
                          ['completed', 'Ready to close'],
                          ['closed', 'Closed'],
                        ].map(([status, label]) => (
                          <div className="system-card" key={status}>
                            <div className="settings-section-head">
                              <h3>{label}</h3>
                            </div>
                            <p className="wizard-hint">
                              <strong>{report.totals?.[status]?.count || 0}</strong> requests ·{' '}
                              {report.totals?.[status]?.points || 0} PP
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="settings-section">
                      <h3>Urgency</h3>
                      <div className="system-tab-grid">
                        <div className="system-card">
                          <div className="settings-section-head"><h3>Urgent</h3></div>
                          <p className="wizard-hint"><strong>{report.priorities?.urgent?.count || 0}</strong> requests · {report.priorities?.urgent?.points || 0} PP</p>
                        </div>
                        <div className="system-card">
                          <div className="settings-section-head"><h3>Regular</h3></div>
                          <p className="wizard-hint"><strong>{report.priorities?.normal?.count || 0}</strong> requests · {report.priorities?.normal?.points || 0} PP</p>
                        </div>
                      </div>
                    </section>

                    <section className="settings-section">
                      <h3>{t('Designer workload')}</h3>
                      <div className="settings-table">
                        {(report.designers || []).map((designer) => (
                          <div className="settings-row" key={designer.email}>
                            <div className="settings-row-account">
                              <strong>{designer.email}</strong>
                              <span>
                                {designer.activeRequests} active · {designer.productionPoints} PP ·{' '}
                                {designer.urgentRequests} urgent
                              </span>
                            </div>
                            <div className="settings-row-controls">
                              <span className="settings-unit">
                                {designer.closedRequests} closed ·{' '}
                                {designer.averageActualMinutes == null ? '—' : `${designer.averageActualMinutes} min`} avg
                              </span>
                            </div>
                          </div>
                        ))}
                        {!(report.designers || []).length ? <p className="wizard-hint">No designer activity yet.</p> : null}
                      </div>
                    </section>

                    <section className="settings-section">
                      <h3>{t('Assigned posts')} ({(report.assignedPosts || []).length})</h3>
                      <div className="settings-table">
                        {(report.assignedPosts || []).map((post) => (
                          <div className="settings-row" key={post.id}>
                            <div className="settings-row-account">
                              <strong>{post.post?.title || post.post?.account || 'Post'}</strong>
                              <span>
                                {post.designerEmail || '—'} ·{' '}
                                {post.scheduledDate ? `${post.scheduledDate} ${String(post.scheduledStartMinutes ?? '')}` : 'Unscheduled'}
                              </span>
                            </div>
                            <div className="settings-row-controls">
                              {post.priority === 'urgent' ? <span className="settings-unit">Urgent</span> : null}
                              <span className="settings-unit">{post.productionPoints} PP</span>
                              <span className="settings-unit" style={{ textTransform: 'capitalize' }}>{(post.status || '').replace('_', ' ')}</span>
                            </div>
                          </div>
                        ))}
                        {!(report.assignedPosts || []).length ? <p className="wizard-hint">Nothing assigned right now.</p> : null}
                      </div>
                    </section>
                  </>
                ) : null}
              </div>
            )}
        </div>
      </div>
      {showAddAccount ? (
        <AddAccountWizard onClose={() => setShowAddAccount(false)} onAccountCreated={handleAccountCreated} />
      ) : null}
    </div>
  );
}

function AddAccountWizard({ onClose, onAccountCreated }) {
  const [step, setStep] = useState(0);
  // Firebase sign-in already gates access to this wizard -- no user-facing
  // password prompt, just the fixed legacy value the backend still checks.
  const [password] = useState(LEGACY_REFRESH_PASSWORD);
  const [handle, setHandle] = useState('');
  const [label, setLabel] = useState('');
  const [group, setGroup] = useState('competitors');
  // Held as text, not a number. Coercing on every keystroke meant clearing the
  // field ran Number('') -> 0, so the box refilled itself with a 0 you then had
  // to type around. The value is only turned back into a number where it's
  // actually used.
  const { t } = usePrefs();
  // The preview picture is a raw Instagram CDN url straight from the scraper,
  // and those don't always render for us -- signed, short-lived, and subject to
  // whatever hotlink rules the CDN is applying that day. The stored avatar the
  // account gets later is served from our own backend, which is why the picture
  // works everywhere else. A failure here is cosmetic, so fall back to the
  // placeholder rather than leaving a broken-image icon in the form.
  const [previewImageFailed, setPreviewImageFailed] = useState(false);
  const [hotThreshold, setHotThreshold] = useState('600');
  const hotThresholdValue = Math.max(0, Math.round(Number(hotThreshold) || 0));
  const [importScope, setImportScope] = useState('all'); // 'all' | 'range' | 'count'
  // Text while editing, same reason as the threshold: coercing per keystroke
  // makes the field impossible to clear.
  const [importCount, setImportCount] = useState('2000');
  const importCountValue = Math.min(5000, Math.max(1, Math.round(Number(importCount) || 0)));
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
  // Every failure used to collapse into "couldn't find that account", so a
  // rate-limit or a slow lookup was indistinguishable from a bad handle --
  // and the advice it gave ("double-check the handle") was actively wrong.
  const [previewError, setPreviewError] = useState('');
  const previewRequestRef = useRef(0);

  const cleanHandle = handle.trim().replace(/^@/, '');
  const canLeaveStep0 = cleanHandle.length > 0;

  // Typing no longer triggers a lookup. Each one costs an Apify credit and
  // takes 5-20s, so spending them on half-typed prefixes was both slow and
  // wasteful -- and blowing the server's per-minute cap made a perfectly good
  // handle report as nonexistent. Now it happens once, when asked.
  useEffect(() => {
    setPreview(null);
    setPreviewError('');
    setPreviewImageFailed(false);
    setPreviewStatus('idle');
    previewRequestRef.current += 1; // abandon anything still in flight
  }, [cleanHandle]);

  const lookupHandle = useCallback(async () => {
    if (cleanHandle.length < 3 || previewStatus === 'loading') return;
    setPreviewStatus('loading');
    setPreviewError('');
    const requestId = ++previewRequestRef.current;
    try {
      const response = await apiFetch(`${API_BASE}/api/admin/accounts/preview?handle=${encodeURIComponent(cleanHandle)}`);
      if (previewRequestRef.current !== requestId) return; // handle changed since this fired
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setPreviewStatus('error');
        if (response.status === 429) {
          setPreviewError('Too many lookups in a row. Wait a moment and try again.');
        } else if (response.status === 404) {
          setPreviewError(body.detail || "Couldn't find that account -- double-check the handle.");
        } else {
          setPreviewError(body.detail || `Lookup failed (${response.status}). The account may still be fine.`);
        }
        return;
      }
      setPreviewImageFailed(false);
      setPreview(await response.json());
      setPreviewStatus('idle');
    } catch (error) {
      if (previewRequestRef.current === requestId) {
        setPreviewStatus('error');
        setPreviewError('Network error during lookup. The account may still be fine.');
      }
    }
  }, [cleanHandle, previewStatus]);

  const goNext = () => {
    if (step === 0 && !canLeaveStep0) {
      setNotice('Enter the Instagram handle first.');
      return;
    }
    if (step === 1 && importScope === 'range' && !importFrom) {
      setNotice('Pick at least a start date, or switch back to All posts.');
      return;
    }
    if (step === 1 && importScope === 'count' && !(Number(importCount) >= 1)) {
      setNotice('Enter how many posts to import.');
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
      const createResponse = await apiFetch(`${API_BASE}/api/admin/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          password,
          handle: cleanHandle,
          label: label.trim() || cleanHandle,
          group,
          hot_threshold: String(hotThresholdValue),
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
          resultsLimit: importScope === 'count' ? importCountValue : null,
        },
        password,
      );
    } catch (error) {
      setSubmitting(false);
      setNotice('Something went wrong. Try again.');
    }
  };

  return (
    // No backdrop-click-to-close here on purpose: this is a 3-step form the
    // user may have spent a minute filling in, and a stray click just outside
    // the card (easy to do -- it's a large modal) used to discard all of it
    // silently. Closing now requires the explicit X button.
    <div className="modal-backdrop">
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
                {preview?.profile_pic_url && !previewImageFailed ? (
                  <img
                    src={preview.profile_pic_url}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={() => setPreviewImageFailed(true)}
                  />
                ) : previewStatus === 'loading' ? (
                  <span className="wizard-preview-spinner" aria-hidden="true" />
                ) : (
                  <AtSign size={16} />
                )}
              </div>
              <label className="modal-field wizard-handle-field">
                <span>Instagram handle</span>
                <div className="wizard-handle-input">
                  <input
                    value={handle}
                    onChange={(event) => setHandle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      // Enter would otherwise submit the surrounding form and
                      // skip the step before the lookup has run.
                      event.preventDefault();
                      lookupHandle();
                    }}
                    placeholder="e.g. natgeo"
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={lookupHandle}
                    disabled={cleanHandle.length < 3 || previewStatus === 'loading'}
                  >
                    {previewStatus === 'loading' ? 'Checking…' : 'Check'}
                  </button>
                </div>
              </label>
            </div>
            {preview ? (
              <p className="wizard-preview-meta">
                {preview.full_name || `@${preview.handle}`}
                {typeof preview.followers_count === 'number' ? ` · ${compactFormatter.format(preview.followers_count)} followers` : ''}
                {preview.private ? ' · Private' : ''}
              </p>
            ) : previewStatus === 'error' ? (
              <p className="wizard-preview-meta wizard-preview-meta-error">
                {previewError || "Couldn't find that account -- double-check the handle."}
              </p>
            ) : cleanHandle.length >= 3 && previewStatus === 'idle' ? (
              <p className="wizard-preview-meta">Press Enter to check the account, or just continue.</p>
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
                onChange={(event) => setHotThreshold(event.target.value)}
                onBlur={() => {
                  // Leaving it blank has to resolve to something; the field is
                  // required downstream, so it lands on the value it started at
                  // rather than a silent 0 that would mark every post HOT.
                  const parsed = Number(hotThreshold);
                  if (hotThreshold.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
                    setHotThreshold('600');
                  } else {
                    setHotThreshold(String(Math.round(parsed)));
                  }
                }}
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
                <button
                  type="button"
                  role="radio"
                  aria-checked={importScope === 'count'}
                  className={importScope === 'count' ? 'wizard-scope-option wizard-scope-option-active' : 'wizard-scope-option'}
                  onClick={() => setImportScope('count')}
                >
                  Post count
                </button>
              </div>
            </div>
            {importScope === 'range' ? (
              <div className="wizard-scope-dates">
                <label className="modal-field">
                  <span>{t('From')}</span>
                  <input type="date" value={importFrom} onChange={(event) => setImportFrom(event.target.value)} />
                </label>
                <label className="modal-field">
                  <span>{t('To')}</span>
                  <input type="date" value={importTo} onChange={(event) => setImportTo(event.target.value)} />
                </label>
              </div>
            ) : importScope === 'count' ? (
              <>
                <label className="modal-field">
                  <span>How many of the most recent posts</span>
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    value={importCount}
                    onChange={(event) => setImportCount(event.target.value)}
                    onBlur={() => {
                      const parsed = Number(importCount);
                      if (importCount.trim() === '' || !Number.isFinite(parsed) || parsed < 1) setImportCount('2000');
                      else setImportCount(String(Math.min(5000, Math.round(parsed))));
                    }}
                  />
                </label>
                <p className="wizard-hint">
                  Newest first. The scraper is billed per post, so this is the direct lever on
                  what the import costs -- roughly ${(importCountValue * 0.0023).toFixed(2)} for {importCountValue.toLocaleString()} posts.
                </p>
              </>
            ) : (
              <p className="wizard-hint">Imports up to the most recent 2,000 posts. Use a date range or a post count for a narrower, faster import.</p>
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
                  {ACCOUNT_GROUP_OPTIONS.find((option) => option.value === group)?.label} · HOT at {hotThresholdValue}+ likes/hr
                </p>
                <p className="wizard-summary-meta">
                  {importScope === 'count'
                    ? `Importing the ${importCountValue.toLocaleString()} most recent posts`
                    : importScope === 'range'
                    ? `Importing ${importFrom || '…'} to ${importTo || '…'}`
                    : 'Importing up to 2,000 most recent posts'}
                </p>
              </div>
            </div>
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

// Turns the backend's on_progress phase (see apify_sync.py's run_backfill:
// starting the Apify run, waiting on the scrape, downloading the dataset,
// saving each post's cover) into an actual sentence, plus a real completion
// percentage once the "inserting" phase gives us a done/total count --
// replacing what used to be a single opaque "Importing…" spinner for what
// can be a many-minutes-long import with nothing else shown.
function describeBackfillProgress(progress, elapsedSec) {
  const phase = progress?.phase;
  switch (phase) {
    case 'queued':
      return { text: 'Queued…', percent: null };
    case 'preparing':
      return { text: 'Preparing the request…', percent: null };
    case 'starting_apify_run':
      return { text: 'Starting the Instagram scraper…', percent: null };
    case 'waiting_apify': {
      const secs = progress.elapsed_seconds ?? elapsedSec ?? 0;
      const status = progress.run_status;
      const statusLabel =
        status === 'RUNNING' ? 'is scraping Instagram' : status === 'READY' ? 'is starting up' : `reported "${status || 'unknown'}"`;
      return { text: `Apify ${statusLabel}… ${secs}s`, percent: null };
    }
    case 'fetching_dataset':
      return { text: 'Downloading the scraped posts…', percent: null };
    case 'dataset_ready':
      return { text: `Got ${progress.fetched ?? 0} posts from Instagram, checking what's new…`, percent: null };
    case 'matching':
      return { text: `Comparing ${progress.fetched ?? 0} posts against what we already have…`, percent: null };
    case 'inserting': {
      const total = progress.total ?? 0;
      const done = progress.done ?? 0;
      const failed = progress.failed ?? 0;
      if (!total) {
        const already = typeof progress.already_had === 'number' ? ` (${progress.already_had} already saved)` : '';
        return { text: `No new posts to save${already}.`, percent: 100 };
      }
      const percent = Math.max(0, Math.min(100, Math.round((done / total) * 100)));
      const failedNote = failed ? `, ${failed} failed` : '';
      return { text: `Saving posts: ${done}/${total}${failedNote}`, percent };
    }
    default:
      return { text: null, percent: null };
  }
}

// Floating, non-blocking progress widget for in-flight account imports.
// Rendered as a fixed stack in the corner so the rest of the dashboard
// (tabs, filters, gallery) stays fully usable while an Apify backfill
// (which can take a minute or more) runs.
function BackgroundTaskStack({ tasks, onDismiss }) {
  const [now, setNow] = useState(Date.now());
  const hasActive = tasks.some((task) => task.phase === 'importing' || task.phase === 'unknown');

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
        const live = task.phase === 'importing' ? describeBackfillProgress(task.serverProgress, elapsedSec) : null;
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
                {task.phase === 'importing' ? live?.text || `Importing post history… ${elapsedSec}s` : null}
                {task.phase === 'unknown' ? 'Still running on the server -- large imports can take a few minutes. Posts will appear on their own.' : null}
                {task.phase === 'done' ? `Imported ${task.added} post${task.added === 1 ? '' : 's'}` : null}
                {task.phase === 'error' ? task.error || 'Import failed.' : null}
              </p>
              <div className="bg-task-progress">
                {task.phase === 'importing' && live?.percent != null ? (
                  <div className="bg-task-progress-fill bg-task-progress-real" style={{ width: `${live.percent}%` }} />
                ) : (
                  <div className={`bg-task-progress-fill bg-task-progress-${task.phase}`} />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// The card menu opens this small assignment composer rather than attempting
// to turn the menu itself into a form. Assigning a post is the only required
// action; every bit of task metadata is optional and belongs to each person’s
// independent Queue task on the backend.
function AssignPostModal({ post, userEmail, isAdmin, accounts, onClose, onAssigned }) {
  const [productionPoints, setProductionPoints] = useState(3);
  const [note, setNote] = useState('');
  const [notes, setNotes] = useState('');
  const [references, setReferences] = useState('');
  const [attachmentFiles, setAttachmentFiles] = useState([]);
  const [createdRequestId, setCreatedRequestId] = useState(null);
  const [tags, setTags] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const toggleTag = (tag) => {
    setTags((current) => {
      const next = new Set(current);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!Number.isInteger(Number(productionPoints)) || Number(productionPoints) < 1) {
      setError('Production points are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let requestId = createdRequestId;
      if (!requestId) {
        const body = new FormData();
        body.append('account', post.account);
        body.append('shortcode', post.shortcode);
        body.append('production_points', String(productionPoints));
        body.append('brief', note);
        body.append('notes', notes);
        body.append('references', JSON.stringify(references.split(/\n|,/).map((item) => item.trim()).filter(Boolean)));
        body.append('tags', [...tags].join(','));
        const response = await apiFetch(`${API_BASE}/api/dashboard/queue/v2/pool`, { method: 'POST', body });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || 'Could not save this Queue assignment.');
        requestId = data.request?.id;
        setCreatedRequestId(requestId);
      }
      const failed = [];
      for (const file of attachmentFiles) {
        try {
          const fileBody = new FormData();
          fileBody.append('file', file);
          const response = await apiFetch(`${API_BASE}/api/dashboard/queue/v2/requests/${requestId}/attachments`, { method: 'POST', body: fileBody });
          if (!response.ok) failed.push(file);
        } catch {
          failed.push(file);
        }
      }
      if (failed.length) {
        setAttachmentFiles(failed);
        throw new Error(`The post is already in the Pool, but ${failed.length} file${failed.length === 1 ? '' : 's'} failed to upload. Send again to retry only those files.`);
      }
      onAssigned();
    } catch (reason) {
      setError(reason.message || 'Could not save this Queue assignment.');
    } finally {
      setSaving(false);
    }
  };

  const tagOptions = ['content', 'design', 'copy', 'research', 'review', 'repurpose'];
  const cover = post.coverUrl ? (post.coverUrl.startsWith('http') ? post.coverUrl : `${API_BASE}${post.coverUrl}`) : '';

  return (
    <div className="queue-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form className="queue-assign-modal" onSubmit={submit} aria-labelledby="queue-assign-title">
        <div className="queue-assign-head">
          <div>
            <p className="section-label">Queue</p>
            <h2 id="queue-assign-title">Send to Pool</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close assignment dialog" onClick={onClose} disabled={saving}>
            <X size={16} />
          </button>
        </div>

        <div className="queue-assign-post">
          {cover ? <img src={cover} alt="" /> : <div className="queue-assign-cover-fallback">@</div>}
          <div>
            <strong>@{post.account}</strong>
            <p>{post.headline || post.excerpt || post.caption || 'Instagram post'}</p>
          </div>
        </div>

        <div className="queue-assign-grid">
          <label>
            <span>Production points <i>required</i></span>
            <input type="number" min="1" step="1" value={productionPoints} onChange={(event) => setProductionPoints(event.target.value)} />
          </label>
        </div>

        <label className="queue-assign-note">
          <span>Brief or note <i>optional</i></span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What should this person do with this post?" rows={3} />
        </label>

        <label className="queue-assign-note"><span>Extra notes <i>optional</i></span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} /></label>
        <label className="queue-assign-note"><span>Reference links <i>optional</i></span><textarea value={references} onChange={(event) => setReferences(event.target.value)} placeholder="One link per line" rows={2} /></label>

        <label className="queue-assign-files">
          <span>Files <i>optional · up to 20 MB each</i></span>
          <input type="file" multiple onChange={(event) => setAttachmentFiles([...event.target.files])} />
          {attachmentFiles.length ? <small>{attachmentFiles.map((file) => file.name).join(' · ')}</small> : null}
        </label>

        <fieldset className="queue-assign-fieldset queue-tag-fieldset">
          <legend>Tags <i>optional</i></legend>
          <div className="queue-tag-picker">
            {tagOptions.map((tag) => (
              <button type="button" key={tag} className={tags.has(tag) ? 'queue-tag-option is-selected' : 'queue-tag-option'} onClick={() => toggleTag(tag)}>
                {tag}
              </button>
            ))}
          </div>
        </fieldset>

        {error ? <p className="queue-assign-error" role="alert">{error}</p> : null}
        <div className="queue-assign-actions">
          <button type="button" className="ghost-button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving}>
            <ListTodo size={15} />
            {saving ? 'Saving…' : 'Send to Pool'}
          </button>
        </div>
      </form>
    </div>
  );
}

// The card's ... menu. Positioned absolutely inside the card header rather
// than portaled: the header isn't inside an overflow-hidden container, so a
// plain absolute panel is enough and avoids the fixed-position bookkeeping
// the account dropdown needs.
function PostMenu({ post, isPromo, onFlags, onReload, onAssign, onQuickAdd, canPool }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const ref = useRef(null);

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
    } catch {
      setNote('That failed -- try again.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="post-menu" ref={ref}>
      <button
        className="icon-button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        aria-label="Post menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>
      {open ? (
        <div className="post-menu-panel" role="menu" onClick={(event) => event.stopPropagation()}>
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
          {canPool ? <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); setOpen(false); onQuickAdd?.(post); }}><Zap size={13} />Quick add to Pool</button> : null}
          <button
            type="button"
            role="menuitem"
            onClick={(event) => run(event, 'promo', () => onFlags(post, { is_promo: !post.isPromo }))}
            disabled={Boolean(busy)}
          >
            <Megaphone size={13} />
            {post.isPromo ? 'Remove promo' : 'Mark as promo'}
          </button>
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
          {note ? <p className="post-menu-note">{note}</p> : null}
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

const PostCard = memo(function PostCard({ post, priority, selected, onSelect, onFlags, onReload, onAssign, onQuickAdd, canPool }) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const handleClick = () => onSelect(post.postKey);
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(post.postKey);
    }
  };
  const stopAction = (event) => {
    event.stopPropagation();
  };
  const effects = hotEffects(post);
  const cardClassName = `post-card${selected ? ' selected' : ''}${effects.className}${post.hidden ? ' post-card-hidden' : ''}`;
  // Promo is either detected from the caption hashtag or set explicitly on
  // the post (the card's ... menu writes that flag), so a promo that didn't
  // use the tag can still be marked by hand.
  const isPromo = Boolean(post.isPromo) || PROMO_HASHTAG_RE.test(post.caption || '');

  return (
    <article
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
              <span className="post-avatar-initials">{(post.account || '?').slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="post-user-copy">
            <strong>{post.account || IG_HANDLE}</strong>
            <span>{formatDate(post.postDate)}</span>
          </div>
        </div>
        <div className="post-header-actions">
          <FreshnessRing timestamp={post.timestamp} />
          <PostMenu post={post} isPromo={isPromo} onFlags={onFlags} onReload={onReload} onAssign={onAssign} onQuickAdd={onQuickAdd} canPool={canPool} />
        </div>
      </div>

      <CoverImage className={`post-media ${posterTheme(post.type)}`} post={post} priority={priority}>
        {post.isVideo ? (
          <div className="media-badge">
            <Video size={13} />
            Video
          </div>
        ) : null}
        {post.showsHotBadge ? <HotBadge post={post} /> : null}
        {isPromo ? (
          <div className="promo-ribbon" title={`Promo (${PROMO_HASHTAG})`}>
            <span>Promo</span>
          </div>
        ) : null}
        {post.queueState && post.queueState !== 'cancelled' ? (
          <div className={`queue-source-state state-${post.queueState}`} title={`Queue · ${post.queueState.replace('_', ' ')}`}>
            <ListTodo size={11} />{post.queueState === 'pool' ? 'In Pool' : 'Assigned'}
          </div>
        ) : null}
        {post.queueAttribution ? (
          <div className="queue-attribution-badge" title={`Created through Queue by ${post.queueAttribution.designerEmail}`}>
            <Check size={11} />{post.queueAttribution.designerEmail?.split('@')[0] || 'Queue'}
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
        <div className="post-likes">{formatLikes(post.likes)} likes</div>
        <p>
          <strong>{post.account || IG_HANDLE}</strong> {post.headline || post.excerpt}
        </p>
        <div className="post-footer">
          <span>{compactFormatter.format(post.comments)} comments</span>
          <span>{formatDate(post.postDate)}</span>
          <InstagramLink post={post} onClick={stopAction} compact />
        </div>
      </div>
    </article>
  );
});

function LoginScreen({ notice }) {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = async () => {
    setSigningIn(true);
    setError('');
    const err = await startGoogleSignIn();
    if (err) setError(describeSignInError(err));
    setSigningIn(false);
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1><Wordmark /></h1>
        <p>Sign in with your Google account to continue.</p>
        <button type="button" className="primary-button auth-google-button" onClick={handleSignIn} disabled={signingIn}>
          {signingIn ? 'Signing in…' : 'Sign in with Google'}
        </button>
        {notice ? <p className="settings-notice">{notice}</p> : null}
        {error ? <p className="settings-notice">{error}</p> : null}
      </div>
    </div>
  );
}

function NotAuthorizedScreen({ email, onSignOut }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1><Wordmark /></h1>
        <p>
          {email ? <strong>{email}</strong> : 'This Google account'} isn&rsquo;t authorized for sentientdash.app. Ask for
          access, then sign in again.
        </p>
        <button type="button" className="ghost-button" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function App() {
  const [authUser, setAuthUser] = useState(undefined); // undefined = loading, null = signed out
  const [unauthorized, setUnauthorized] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  // Whether we've finished trying the cross-subdomain SSO cookie -- gates the
  // login screen so a returning visitor never sees a flash of "sign in" while
  // the silent signInWithCustomToken() exchange is still in flight.
  const [ssoChecked, setSsoChecked] = useState(false);

  // Picks the user back up after the mobile redirect fallback sends them
  // through Google and back. Resolves to null on a normal (non-redirect) load.
  useEffect(() => {
    getRedirectResult(firebaseAuth, browserPopupRedirectResolver).catch((err) => {
      setAuthNotice(describeSignInError(err));
    });
  }, []);

  // Same-session-everywhere: if this origin has no local Firebase session but
  // the shared .sentientdash.app cookie has one, silently adopt it instead of
  // making the user sign in again on every subdomain/page.
  useEffect(() => {
    trySsoSignIn().finally(() => setSsoChecked(true));
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      setAuthUser(user);
      setUnauthorized(false);
      if (user) {
        user.getIdToken().then((token) => { window.__firebaseIdToken = token; }).catch(() => {});
      } else {
        window.__firebaseIdToken = null;
      }
    });
    return unsubscribe;
  }, []);

  // Keeps the shared SSO cookie fresh for as long as this tab stays signed in.
  useEffect(() => {
    if (!authUser) return undefined;
    return startSsoRefresh();
  }, [authUser]);

  const handleSignOut = useCallback(() => {
    clearSsoCookie();
    signOut(firebaseAuth);
  }, []);

  const handleUnauthorized = useCallback(() => {
    setUnauthorized(true);
  }, []);

  if (authUser === undefined || (!authUser && !ssoChecked)) {
    return <div className="auth-screen" />;
  }
  if (!authUser) {
    return <LoginScreen notice={authNotice} />;
  }
  if (unauthorized) {
    return <NotAuthorizedScreen email={authUser.email} onSignOut={handleSignOut} />;
  }
  return <Dashboard userEmail={authUser.email} userPhoto={authUser.photoURL || ''} onSignOut={handleSignOut} onUnauthorized={handleUnauthorized} />;
}

// Language and theme wrap the whole app, including the sign-in gate -- the
// toggles have to work before you're authenticated too.
export default function AppWithPrefs() {
  return (
    <PrefsProvider>
      <App />
    </PrefsProvider>
  );
}
