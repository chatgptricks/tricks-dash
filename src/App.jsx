import { memo, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
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
  Copy,
  ExternalLink,
  Filter,
  Flame,
  HardDrive,
  Heart,
  ImagePlus,
  Link2,
  LogOut,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Music2,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  ScanText,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  X,
  Video,
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import chatgptricksProfileImage from './assets/chatgptricks-profile.jpg';
import traselveloralProfileImage from './assets/traselveloreal-profile.jpg';

// ---------------------------------------------------------------------------
// Auth (Firebase Google Sign-In)
//
// Sentient Dash used to be public-read, gated only by a shared admin password
// for writes. It's now fully private: every visitor has to sign in with a
// Google account on the backend's allowlist before seeing anything. Firebase
// only handles "is this a real Google account" -- the actual allow/deny
// decision happens server-side (ALLOWED_EMAILS), so the frontend never needs
// to know the list itself.
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: 'AIzaSyDrtLGrnRJ3cj64sJ6Ykn-yRGtemybzoN0',
  authDomain: 'sentient-dash.firebaseapp.com',
  projectId: 'sentient-dash',
  storageBucket: 'sentient-dash.firebasestorage.app',
  messagingSenderId: '74046012975',
  appId: '1:74046012975:web:02013849972baca1f950da',
};
const firebaseApp = initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();

// Drop-in replacement for apiFetch() that attaches the signed-in user's Firebase
// ID token to every call. getIdToken() returns the cached token and only
// hits the network to refresh it when it's actually close to expiring, so
// this doesn't add a round-trip to normal usage.
async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (firebaseAuth.currentUser) {
    try {
      const token = await firebaseAuth.currentUser.getIdToken();
      headers.set('Authorization', `Bearer ${token}`);
    } catch (error) {
      // Fall through and let the request go out unauthenticated -- the
      // backend will bounce it with a 401 and the login gate will catch it.
    }
  }
  return window.fetch(url, { ...options, headers });
}

// Frontend-only fallback for the ~16 legacy endpoints that still check a
// shared password server-side. Firebase is now the real security boundary
// (nothing gets this far without a valid, allowlisted Google session), so
// this is just a fixed value the UI supplies automatically -- there is no
// password prompt anywhere anymore.
const LEGACY_REFRESH_PASSWORD = 'sentient2026';

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
  { value: 'hot', label: 'HOT' },
];

// Single source of truth for how long a post counts as HOT, in both the tab and
// the badge. 30h rather than 48h: two days still felt stale in practice -- the
// window covers a post's first full day plus the following morning, then lets go.
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
  post: '',
  view: '',
};

function readUrlState() {
  if (typeof window === 'undefined') return { ...URL_DEFAULTS };
  const params = new URLSearchParams(window.location.search);
  const state = { ...URL_DEFAULTS };
  for (const key of Object.keys(URL_DEFAULTS)) {
    const value = params.get(key);
    if (value !== null) state[key] = value;
  }
  return state;
}

function writeUrlState(state) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams();
  for (const [key, fallback] of Object.entries(URL_DEFAULTS)) {
    const value = state[key];
    if (value === undefined || value === null) continue;
    const text = String(value);
    if (text === '' || text === String(fallback)) continue;
    params.set(key, text);
  }
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
  return `rgba(245,255,0,${intensity.toFixed(2)})`;
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
  // A post keeps its HOT flag forever once it earns it (permanent record); the
  // badge only shows while it's still inside the active refresh window.
  const isHot = Boolean(post.isHot);
  const showsHotBadge = isHot && ageDays <= HOT_BADGE_WINDOW_HOURS / 24;
  // The HOT tab uses the same window, so badge and tab can never disagree.
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

function Dashboard({ userEmail, onSignOut, onUnauthorized }) {
  const [dashboard, setDashboard] = useState({ posts: [], summary: {} });
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState(null);
  // Two-tier roles: everyone allowlisted sees the dashboard, only admins see
  // Settings. This is purely a UI convenience -- the backend rejects
  // /api/admin/* for non-admins regardless of what this flag says.
  const [isAdmin, setIsAdmin] = useState(false);
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
      // Best-effort: role info only controls whether the Settings button
      // shows, so a hiccup here shouldn't block the rest of the dashboard.
      // Only ever *upgrade* based on a successful response -- a transient
      // failure (or an aborted request from the next silent poll starting
      // before this one lands) must never downgrade an admin back to false,
      // or the admin page would unmount/remount and lose its state (tab
      // reset, users list cleared) every time that race happens.
      apiFetch(`${API_BASE}/api/dashboard/me`, { signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => {
          if (body) setIsAdmin(Boolean(body.is_admin));
        })
        .catch(() => {});
    } catch (error) {
      if (error.name !== 'AbortError' && !silent) {
        setLoadError('Could not load the shared Post DB. Try again in a moment.');
      }
    } finally {
      if (!signal?.aborted && !silent) setLoading(false);
    }
  }, [onUnauthorized]);

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
  const accountsInScope = useMemo(
    // 'hot' isn't a group -- it's a cross-account view, so every account stays
    // in scope and only the HOT-recency filter narrows the results.
    () =>
      activeGroup === 'all' || activeGroup === 'hot'
        ? accounts
        : accounts.filter((account) => account.group === activeGroup),
    [accounts, activeGroup],
  );
  const [selectedAccounts, setSelectedAccounts] = useState(() => new Set());
  const [showAddAccount, setShowAddAccount] = useState(false);
  // Admin panel is a full page, not a modal, so it's linkable/reload-safe
  // like every other view here -- gated behind isAdmin below regardless of
  // what a stale or hand-edited URL says.
  const [showSettings, setShowSettings] = useState(initialUrl.view === 'admin');
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
      try {
        const params = { password, results_limit: '2000' };
        if (account.dateFrom) params.date_from = account.dateFrom;
        if (account.dateTo) params.date_to = account.dateTo;
        const response = await apiFetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(account.handle)}/backfill`, {
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
        // A full-history scrape (up to 2000 posts) routinely outlives the
        // browser's own patience -- the connection drops long before Apify
        // finishes, but the server keeps running and the posts still land.
        // Same caveat the admin panel's "Extract history" retry already
        // handles -- don't report a false failure here, just keep polling
        // the dashboard so the card resolves once the import actually lands.
        setBackgroundTasks((tasks) => tasks.map((task) => (task.id === id ? { ...task, phase: 'unknown' } : task)));
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts += 1;
          await loadDashboard(undefined, { silent: true });
          if (attempts >= 6) {
            clearInterval(poll);
            setBackgroundTasks((tasks) => tasks.filter((task) => task.id !== id));
          }
        }, 30000);
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
  const [filtersHidden, setFiltersHidden] = useState(false);
  const lastScrollTopRef = useRef(0);
  const [shareCopied, setShareCopied] = useState(false);

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
      // Only when the sidebar is actually open. `selected` falls back to the
      // first result so the preview pane always has something to show, and an
      // effect writes that back into selectedKey -- meaning selectedKey is set
      // even when nobody opened anything. Sharing that would pin a stranger's
      // link to whichever post happened to sort first.
      post: isSidebarOpen ? selectedKey : '',
      view: showSettings ? 'admin' : '',
    });
  }, [
    query, activeGroup, selectedAccounts, accountsInScope, activeType, mediaFilter,
    sortBy, minLikes, minComments, dateFrom, dateTo, datePreset, selectedKey,
    isSidebarOpen, ranges.likesMin, ranges.commentsMin, showSettings,
  ]);

  const handleResultsScroll = useCallback((event) => {
    const el = event.currentTarget;
    const top = el.scrollTop;
    const maxScroll = el.scrollHeight - el.clientHeight;
    // With only a row or two of results, the whole scrollable range can
    // still be 100-300px (one tall cover image is enough) -- not zero, but
    // short enough that trackpad inertia overshoots and corrects within
    // that same short range, flipping the per-event delta sign rapidly and
    // flickering the filter bar open/closed. Scale the "stay visible near
    // the top" zone with the actual scroll range (capped at 150px) so a
    // short list gets a proportionally large dead zone; any list with more
    // than ~300px of scroll range falls back to the original fixed 40px.
    const nearTopZone = Math.min(150, Math.max(40, maxScroll * 0.5));
    const delta = top - lastScrollTopRef.current;
    if (top < nearTopZone) {
      setFiltersHidden(false);
    } else if (delta > 8) {
      setFiltersHidden(true);
    } else if (delta < -8) {
      setFiltersHidden(false);
    }
    lastScrollTopRef.current = top;
  }, []);

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

  const filtered = useMemo(() => {
    const minDate = parseDateBound(dateFrom, false);
    const maxDate = parseDateBound(dateTo, true);
    const output = [];

    for (const post of posts) {
      if (activeGroup === 'hot') {
        if (!post.isHotRecent) continue;
      } else if (activeGroup !== 'all' && post.group !== activeGroup) continue;
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
      // The HOT tab ranks by how hard each post beat its own account's
      // threshold -- the only fair comparison across accounts whose baselines
      // differ by an order of magnitude.
      if (activeGroup === 'hot') {
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
  }, [posts, activeGroup, effectiveAccounts, activeType, mediaFilter, minLikes, minComments, dateFrom, dateTo, deferredQuery, sortBy]);

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

  const selectPost = useCallback((postKey) => {
    startTransition(() => {
      setSelectedKey(postKey);
      setIsSidebarOpen(true);
    });
  }, []);

  // Admin panel is its own full page, not a modal over the dashboard --
  // rendered here as a straight replacement rather than an overlay. Gated on
  // isAdmin regardless of what a stale/hand-edited ?view=admin URL says; the
  // backend enforces the real boundary on every /api/admin/* call either way.
  if (showSettings && isAdmin) {
    return (
      <SettingsPanel
        accounts={accounts}
        onClose={() => setShowSettings(false)}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        refreshNotice={refreshNotice}
        onAccountsChanged={() => loadDashboard(undefined, { silent: true })}
      />
    );
  }

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
                      placeholder="Search captions, topics, songs, or text inside a cover..."
                    />
                  </span>
                  {query ? (
                    <button className="search-clear" type="button" aria-label="Clear search" onClick={() => setQuery('')}>
                      <X size={15} />
                    </button>
                  ) : <span className="search-scope">Includes cover text &amp; songs</span>}
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
                onClick={copyShareLink}
                title="Copy a link to this exact view"
                aria-label="Copy link to this view"
              >
                {shareCopied ? <Check size={15} /> : <Link2 size={15} />}
              </button>
              <a
                className="ghost-button refresh-button"
                href={`${import.meta.env.BASE_URL}insights.html`}
                title="Insights — análisis agregado de todas las cuentas"
                aria-label="Insights"
              >
                <BarChart3 size={15} />
              </a>
              <a
                className="ghost-button refresh-button"
                href={`${import.meta.env.BASE_URL}tracker.html`}
                title="Tracker — crecimiento de seguidores por cuenta"
                aria-label="Tracker"
              >
                <TrendingUp size={15} />
              </a>
              {isAdmin ? (
                <button
                  className="ghost-button refresh-button"
                  type="button"
                  onClick={() => setShowSettings(true)}
                  title="Settings — thresholds, history import, refresh"
                  aria-label="Settings"
                >
                  <Settings size={15} className={refreshing ? 'spin' : ''} />
                </button>
              ) : null}
              <button
                className="ghost-button refresh-button"
                type="button"
                onClick={onSignOut}
                title={userEmail ? `Signed in as ${userEmail} — sign out` : 'Sign out'}
                aria-label="Sign out"
              >
                <LogOut size={15} />
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
                    <span>Likes</span>
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
                    <label className="number-field">
                      <span>Likes (exact)</span>
                      <input
                        aria-label="Minimum likes, exact value"
                        type="number"
                        min={0}
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
                    // Keyed by account+shortcode, not shortcode alone: accounts
                    // repost each other, so ~21 shortcodes exist under two
                    // accounts. Duplicate React keys make reordering undefined
                    // and those cards got stuck at the top of every sort.
                    key={post.postKey}
                    post={post}
                    priority={index < 6}
                    selected={selected?.postKey === post.postKey}
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
                {selected.musicSong ? (
                  <SongLine url={selected.musicUrl}>
                    {selected.musicSong}
                    {selected.musicArtist ? ` — ${selected.musicArtist}` : ''}
                  </SongLine>
                ) : selected.usesOriginalAudio ? (
                  <SongLine url={selected.musicUrl}>Original audio</SongLine>
                ) : null}
                {selected.account === 'chatgptricks' ? (
                  <CanvaLine url={canvaLinkForPost(selected.postDate)} />
                ) : null}
              </section>

              <section className="panel stats-panel">
                <Metric label="Likes" value={formatLikes(selected.likes)} />
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

// Not a Spotify/Apple Music link -- Apify only gives us Instagram's own
// audio_id, which resolves to that sound's page on Instagram (every reel that
// used the exact same clip). Renders as a link when we have that id, plain
// text otherwise (older rows scraped before audio_id was captured).
function SongLine({ url, children }) {
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
// Admin panel: HOT thresholds, pulling older history, and the manual refresh.
// The password is asked for once when the panel opens and kept only in this
// component's state -- never written to localStorage, so closing the panel or
// reloading the page discards it.
function SettingsPanel({ accounts, onClose, onRefresh, refreshing, refreshNotice, onAccountsChanged }) {
  // Firebase sign-in is the real gate now (only an allowlisted Google account
  // can reach this component at all), so the old shared-password unlock
  // screen is skipped entirely -- the fixed legacy value is supplied
  // automatically for the handful of backend endpoints that still check it.
  const [password, setPassword] = useState(LEGACY_REFRESH_PASSWORD);
  const [unlocked, setUnlocked] = useState(true);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('accounts'); // 'accounts' | 'system' | 'users'

  // Users tab -- the Google sign-in allowlist + admin/viewer roles, editable
  // here instead of through Render's environment variables.
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersNotice, setUsersNotice] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('viewer');
  const [addingUser, setAddingUser] = useState(false);
  const [userActionEmail, setUserActionEmail] = useState('');

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
  const [avatarHandle, setAvatarHandle] = useState('');
  const [lifecycleHandle, setLifecycleHandle] = useState('');
  const [importFrom, setImportFrom] = useState({});
  const [importing, setImporting] = useState('');
  const [importNotice, setImportNotice] = useState({});

  // System tab
  const [disk, setDisk] = useState(null);
  const [slackStatus, setSlackStatus] = useState(null);
  const [slackSending, setSlackSending] = useState(false);
  const [slackNotice, setSlackNotice] = useState('');
  const [apifyRuns, setApifyRuns] = useState([]);
  const [apifyLoading, setApifyLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState(null);
  const [ocrStarting, setOcrStarting] = useState(false);

  const loadRoster = useCallback(async () => {
    try {
      const response = await apiFetch(`${API_BASE}/api/admin/accounts`);
      const body = await response.json().catch(() => ({}));
      if (Array.isArray(body.accounts)) setRoster(body.accounts);
    } catch (error) {
      // Keep whatever roster we already had rather than blanking the panel.
    }
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
      if (Array.isArray(body.users)) setUsers(body.users);
    } catch (error) {
      // Keep whatever list we already had rather than blanking the tab.
    } finally {
      setUsersLoading(false);
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
      loadUsage();
    }
  }, [unlocked, tab, loadUsers, loadUsage]);

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
    if (!from) {
      setImportNotice((prev) => ({ ...prev, [handle]: 'Pick a date.' }));
      return;
    }
    setImporting(handle);
    setImportNotice((prev) => ({ ...prev, [handle]: 'Starting…' }));
    try {
      const response = await apiFetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(handle)}/backfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ password, date_from: from, results_limit: '2000' }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setImportNotice((prev) => ({ ...prev, [handle]: body.detail || 'Extraction failed.' }));
        return;
      }
      setImportNotice((prev) => ({
        ...prev,
        [handle]: `Done: ${body.added ?? 0} new posts.`,
      }));
      onAccountsChanged?.();
    } catch (error) {
      // A long scrape routinely outlives the browser's patience; the server
      // keeps going, so say so instead of reporting a false failure.
      setImportNotice((prev) => ({
        ...prev,
        [handle]: 'Still running on the server. New posts will show up on their own.',
      }));
    } finally {
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
        body: new URLSearchParams({ email, role: newUserRole }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setUsersNotice(body.detail || 'Could not add that person.');
        return;
      }
      setUsers(body.users || []);
      setNewUserEmail('');
      setNewUserRole('viewer');
      setUsersNotice(`Added @${email}.`);
    } catch (error) {
      setUsersNotice('Network error while adding.');
    } finally {
      setAddingUser(false);
    }
  };

  const setUserRole = async (email, role) => {
    setUserActionEmail(email);
    setUsersNotice('');
    try {
      const response = await apiFetch(`${API_BASE}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email, role }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setUsersNotice(body.detail || `Could not update ${email}.`);
        return;
      }
      setUsers(body.users || []);
    } catch (error) {
      setUsersNotice('Network error while updating.');
    } finally {
      setUserActionEmail('');
    }
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

  const activeRoster = roster.filter((account) => account.is_active !== false);
  const inactiveRoster = roster.filter((account) => account.is_active === false);

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <button type="button" className="ghost-button" onClick={onClose}>
          <ArrowLeft size={15} />
          <span>Back to dashboard</span>
        </button>
        <h1>Admin panel</h1>
        <div className="admin-page-header-spacer" />
      </header>

      <div className="admin-page-body">
        <div className="settings-body">
          <div className="settings-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'accounts'}
              className={tab === 'accounts' ? 'settings-tab settings-tab-active' : 'settings-tab'}
              onClick={() => setTab('accounts')}
            >
              Accounts
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'system'}
              className={tab === 'system' ? 'settings-tab settings-tab-active' : 'settings-tab'}
              onClick={() => setTab('system')}
            >
              System
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'users'}
              className={tab === 'users' ? 'settings-tab settings-tab-active' : 'settings-tab'}
              onClick={() => setTab('users')}
            >
              Users
            </button>
          </div>

          {notice ? <p className="settings-notice">{notice}</p> : null}

          {tab === 'accounts' ? (
              <>
                <section className="settings-section">
                  <h3>Manage accounts</h3>
                  <p className="wizard-hint">
                    Category, display label, HOT threshold and profile picture -- all editable per account. Changes
                    are picked up by the public dashboard on its next load.
                  </p>
                  <div className="account-manage-list">
                    {activeRoster.map((account) => {
                      const edit = edits[account.handle] || { label: '', group: account.group, hot_threshold: '' };
                      return (
                        <div className="account-manage-card" key={account.handle}>
                          <div className="account-manage-top">
                            <div className="account-manage-avatar" aria-hidden="true">
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
                            </div>
                            <div className="account-manage-id">
                              <strong>@{account.handle}</strong>
                              {account.is_canonical ? <span className="status-pill status-pill-canonical">Canonical</span> : null}
                            </div>
                          </div>

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
                            </label>
                            <button
                              type="button"
                              className="ghost-button primary"
                              onClick={() => saveAccount(account)}
                              disabled={savingHandle === account.handle || !isDirty(account)}
                            >
                              {savingHandle === account.handle ? '…' : 'Save'}
                            </button>
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
                              {lifecycleHandle === account.handle ? '…' : 'Deactivate'}
                            </button>
                            <div className="account-manage-import">
                              <input
                                type="date"
                                value={importFrom[account.handle] ?? ''}
                                onChange={(event) =>
                                  setImportFrom((prev) => ({ ...prev, [account.handle]: event.target.value }))
                                }
                                aria-label={`Extract from for ${account.handle}`}
                              />
                              <button
                                type="button"
                                className="ghost-button"
                                onClick={() => runImport(account.handle)}
                                disabled={importing === account.handle}
                              >
                                {importing === account.handle ? '…' : 'Extract history'}
                              </button>
                            </div>
                          </div>
                          {importNotice[account.handle] ? (
                            <p className="settings-import-notice">{importNotice[account.handle]}</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>

                {inactiveRoster.length ? (
                  <section className="settings-section">
                    <h3>Inactive accounts</h3>
                    <p className="wizard-hint">
                      Hidden from the public dashboard and skipped by the scheduler. Post history is untouched --
                      reactivating brings everything straight back.
                    </p>
                    <div className="settings-table">
                      {inactiveRoster.map((account) => (
                        <div className="settings-row" key={account.handle}>
                          <div className="settings-row-account">
                            <strong>@{account.handle}</strong>
                            <span>{account.group}</span>
                          </div>
                          <div className="settings-row-controls">
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => toggleActive(account)}
                              disabled={lifecycleHandle === account.handle}
                            >
                              <Power size={13} />
                              {lifecycleHandle === account.handle ? '…' : 'Reactivate'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            ) : tab === 'system' ? (
              <div className="settings-list-width">
                <section className="settings-section">
                  <div className="settings-section-head">
                    <h3>Refresh now</h3>
                    <button
                      type="button"
                      className="ghost-button settings-refresh"
                      onClick={() => onRefresh(password)}
                      disabled={refreshing}
                    >
                      <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
                      <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
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

                <section className="settings-section">
                  <div className="settings-section-head">
                    <h3>
                      <HardDrive size={13} /> Disk usage
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

                <section className="settings-section">
                  <h3>
                    <MessageSquare size={13} /> Slack alerts
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
                      {slackSending ? 'Sending…' : 'Send test alert'}
                    </button>
                  </div>
                  {slackNotice ? <p className="settings-notice">{slackNotice}</p> : null}
                </section>

                <section className="settings-section">
                  <h3>Recent Apify runs</h3>
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

                <section className="settings-section">
                  <div className="settings-section-head">
                    <h3>
                      <ScanText size={13} /> Cover OCR sweep
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
              </div>
            ) : (
              <>
              <div className="settings-list-width">
                <section className="settings-section">
                  <h3>Who can sign in</h3>
                  <p className="wizard-hint">
                    Admins see this Settings page and can manage accounts, users, and diagnostics. Everyone else gets
                    the read-only dashboard.
                  </p>
                  <form className="add-user-form" onSubmit={addUser}>
                    <label className="modal-field">
                      <span>Email</span>
                      <input
                        type="email"
                        value={newUserEmail}
                        onChange={(event) => setNewUserEmail(event.target.value)}
                        placeholder="name@example.com"
                        required
                      />
                    </label>
                    <label className="modal-field">
                      <span>Role</span>
                      <select value={newUserRole} onChange={(event) => setNewUserRole(event.target.value)}>
                        <option value="viewer">Viewer</option>
                        <option value="admin">Admin</option>
                      </select>
                    </label>
                    <button type="submit" className="ghost-button primary" disabled={addingUser}>
                      {addingUser ? 'Adding…' : 'Add'}
                    </button>
                  </form>
                  {usersNotice ? <p className="settings-notice">{usersNotice}</p> : null}
                </section>

                <section className="settings-section">
                  <h3>People with access</h3>
                  <div className="settings-table">
                    {usersLoading ? <p className="wizard-hint">Loading…</p> : null}
                    {users.map((user) => (
                      <div className="settings-row" key={user.email}>
                        <div className="settings-row-account">
                          <strong>{user.email}</strong>
                          <span>{user.role === 'admin' ? 'Admin' : 'Viewer'}</span>
                        </div>
                        <div className="settings-row-controls">
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => setUserRole(user.email, user.role === 'admin' ? 'viewer' : 'admin')}
                            disabled={userActionEmail === user.email}
                          >
                            {user.role === 'admin' ? 'Make viewer' : 'Make admin'}
                          </button>
                          <button
                            type="button"
                            className="ghost-button ghost-button-danger"
                            onClick={() => removeUser(user.email)}
                            disabled={userActionEmail === user.email}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                    {!usersLoading && !users.length ? <p className="wizard-hint">No one loaded yet.</p> : null}
                  </div>
                </section>
              </div>

              <section className="settings-section usage-section">
                <h3>Usage</h3>
                <p className="wizard-hint">
                  Who actually opens Sentient Dash, how often, and when — last {usage?.days ?? 30} days.
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
                              <strong>{person.email}</strong>
                              <span className={`usage-role-pill ${person.role}`}>{person.role}</span>
                            </div>
                            {person.daily.map((d) => (
                              <div
                                key={d.date}
                                className="usage-cell"
                                title={`${person.email} · ${d.date} · ${d.count} request${d.count === 1 ? '' : 's'}`}
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
                                <strong>{person.email}</strong>
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
              </>
            )}
        </div>
      </div>
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
        const response = await apiFetch(`${API_BASE}/api/admin/accounts/preview?handle=${encodeURIComponent(cleanHandle)}`);
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
      const createResponse = await apiFetch(`${API_BASE}/api/admin/accounts`, {
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
                {task.phase === 'unknown' ? 'Still running on the server -- large imports can take a few minutes. Posts will appear on their own.' : null}
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

const PostCard = memo(function PostCard({ post, priority, selected, onSelect, onCopy }) {
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
        <div className="post-header-actions">
          <FreshnessRing timestamp={post.timestamp} />
          <button className="icon-button" onClick={stopAction} aria-label="Post menu">
            <MoreHorizontal size={16} />
          </button>
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
  if (!post.showsHotBadge) return { className: '', showBorder: false };
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

function LoginScreen({ notice }) {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = async () => {
    setSigningIn(true);
    setError('');
    try {
      await signInWithPopup(firebaseAuth, googleProvider);
    } catch (err) {
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        setError('Sign-in failed. Try again.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Sentient Dash</h1>
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
        <h1>Sentient Dash</h1>
        <p>
          {email ? <strong>{email}</strong> : 'This Google account'} isn&rsquo;t authorized for Sentient Dash. Ask for
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      setAuthUser(user);
      setUnauthorized(false);
    });
    return unsubscribe;
  }, []);

  const handleSignOut = useCallback(() => {
    signOut(firebaseAuth);
  }, []);

  const handleUnauthorized = useCallback(() => {
    setUnauthorized(true);
  }, []);

  if (authUser === undefined) {
    return <div className="auth-screen" />;
  }
  if (!authUser) {
    return <LoginScreen />;
  }
  if (unauthorized) {
    return <NotAuthorizedScreen email={authUser.email} onSignOut={handleSignOut} />;
  }
  return <Dashboard userEmail={authUser.email} onSignOut={handleSignOut} onUnauthorized={handleUnauthorized} />;
}

export default App;
