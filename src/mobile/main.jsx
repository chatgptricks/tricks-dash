import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  AlertCircle, ArrowLeft, ArrowUpRight, BarChart3, Bell, CalendarDays, Check, CheckCircle2,
  ChevronLeft, ChevronRight, Clock3, Download, ExternalLink, Filter, Flame, Heart, Home,
  Inbox, Languages, LayoutGrid, LineChart, Link2, LoaderCircle, LogOut, MessageCircle, Moon,
  ImagePlus, Megaphone, MoreHorizontal, Palette, Play, Plus, RefreshCw, Search, Send, Settings,
  Shield, Sparkles, Star, Sun, TimerReset, UserRound, Users, Wifi, WifiOff, X,
} from 'lucide-react';
import { browserPopupRedirectResolver, getRedirectResult, onAuthStateChanged, signOut } from 'firebase/auth';
import { API_BASE, apiFetch } from '../api';
import { authPersistenceReady, describeSignInError, firebaseAuth, startGoogleSignIn } from '../firebase';
import { followQueueLive } from '../queueLive';
import { clearSsoCookie, startSsoRefresh, trySsoSignIn } from '../sso';
import './mobile.css';

const LEGACY_PASSWORD = 'sentient2026';
const DAY = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const I18N = {
  en: {
    home: 'Home', dashboard: 'Research', queue: 'Queue', tracker: 'Tracker', insights: 'Insights', settings: 'Settings',
    greeting: 'Good to see you', today: 'Today', myDay: 'My production day', teamPulse: 'Team pulse',
    assigned: 'Assigned', inProgress: 'In progress', completed: 'Completed', pool: 'Pool', approvals: 'Approvals',
    openQueue: 'Open Queue', openDashboard: 'Explore posts', noWork: 'Nothing assigned right now.',
    noWorkHelp: 'Pick a request or check back when a coordinator schedules one.', loading: 'Loading…', retry: 'Try again',
    search: 'Search posts', filters: 'Filters', all: 'All', sentient: 'Sentient', competitors: 'Competitors', hot: 'HOT',
    newest: 'Newest', oldest: 'Oldest', mostLiked: 'Most liked', mostCommented: 'Most commented', hottest: 'Hottest', account: 'Account', format: 'Format', clear: 'Clear', results: 'results',
    media: 'Media', anyMedia: 'Any media', staticOnly: 'Static only', videoOnly: 'Video only', period: 'Period', anyTime: 'Any time', last24: 'Last 24 hours', last3: 'Last 3 days', last7: 'Last 7 days', customRange: 'Custom range', from: 'From', to: 'To', minLikes: 'Minimum likes', minComments: 'Minimum comments', promoOnly: 'Promos only', showHidden: 'Show hidden posts', order: 'Order',
    likes: 'Likes', comments: 'Comments', viewPost: 'View on Instagram', downloadMedia: 'Download media',
    sendPool: 'Send to Pool', productionPoints: 'Production points', priority: 'Priority', brief: 'Brief', tags: 'Tags',
    addPool: 'Add to production pool', addedPool: 'Post added to Queue.', low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent',
    agenda: 'Agenda', requests: 'Requests', team: 'Team', pick: 'Pick', createPost: 'Create Post',
    previousDay: 'Previous day', nextDay: 'Next day', noAssignments: 'No assignments for this day.', noPool: 'The pool is empty.',
    scheduled: 'Scheduled', closed: 'Closed', cancelled: 'Cancelled', start: 'Start work', markComplete: 'Mark complete',
    completeClose: 'Close with link', finalLink: 'Published Instagram link', requestChange: 'Request change',
    assign: 'Assign', editAssignment: 'Edit assignment', returnPool: 'Return to pool', designer: 'Designer', date: 'Date', time: 'Time',
    recommendedAccounts: 'Recommended accounts', previewAssignment: 'Share temporary placement', confirmAssignment: 'Submit and notify',
    temporaryShared: 'Temporary placement is live for the designer.', assignmentSent: 'Assignment submitted.',
    activityLive: 'Live', reconnecting: 'Reconnecting', next: 'Next', choose: 'Assign this job', noPick: 'No work is available to pick.',
    title: 'Title', postType: 'Post type', notes: 'Notes', create: 'Create', created: 'Post created in the pool.',
    sentRequests: 'My requests', requestInbox: 'Approval inbox', pending: 'Pending', approved: 'Approved', rejected: 'Rejected',
    approve: 'Approve', reject: 'Reject', meeting: 'Meeting', break: 'Break', promo: 'Promo', focus: 'Focus time',
    blockTime: 'Block time', duration: 'Duration', reason: 'Reason', submitRequest: 'Submit request', requestSent: 'Request sent.',
    ppRevision: 'PP revision', cancellation: 'Cancellation', move: 'Move', newPPs: 'Requested PPs',
    followers: 'Followers', totalFollowers: 'Total followers', todayGrowth: 'Today growth', todayFollowers: 'Today', favorites: 'Favorites', growth7d: '7-day growth', avgLikes: 'Average likes', trackedAccounts: 'Tracked accounts',
    trackingSince: 'Tracking since', refresh: 'Refresh', history: 'History', posts: 'Posts', engagement: 'Engagement', followersGained: 'Gained', total: 'Total',
    performance: 'Performance overview', topAccounts: 'Top accounts', topTopics: 'Top topics', formats: 'Formats',
    last30: 'Last 30 days', last90: 'Last 90 days', allTime: 'All time', noData: 'No data available.',
    overview: 'Overview', accounts: 'Accounts', users: 'Users', usage: 'Usage', notifications: 'Notifications', system: 'System', reports: 'Reports',
    adminOnly: 'Admin or Dev access is required.', displayName: 'Display name', role: 'Role', slackId: 'Slack ID', admin: 'Admin', save: 'Save',
    active: 'Active', inactive: 'Inactive', threshold: 'HOT threshold', group: 'Group', refreshAvatar: 'Refresh avatar', deactivate: 'Deactivate', activate: 'Activate', accountSaved: 'Account updated.', disk: 'Disk', slack: 'Slack', ocr: 'OCR',
    customAlert: 'Custom notification', alertTitle: 'Title (optional)', alertMessage: 'Message', attachImage: 'Attach image', changeImage: 'Change image', sendAlert: 'Send notification', alertSent: 'Notification sent to Slack.', sendTest: 'Send test',
    dayMap: 'Day map', blockedTime: 'Blocked time',
    install: 'Install app', installHelp: 'Add Sentient Dash to your Home Screen for the full app experience.',
    iosInstall: 'In Safari, tap Share and then “Add to Home Screen”.', desktop: 'Open desktop version', signOut: 'Sign out',
    language: 'Language', theme: 'Theme', accent: 'Accent', dark: 'Dark', light: 'Light', greenAccent: 'Sentient green', neonAccent: 'Neon yellow', custom: 'Custom', close: 'Close',
    offline: 'You are offline. Live data will reconnect automatically.', updateReady: 'A new version is ready.', update: 'Update',
    signIn: 'Sign in with Google', signingIn: 'Signing in…', signInHelp: 'Use your Sentient account to open the mobile workspace.',
  },
  es: {
    home: 'Inicio', dashboard: 'Research', queue: 'Queue', tracker: 'Tracker', insights: 'Insights', settings: 'Settings',
    greeting: 'Qué bueno verte', today: 'Hoy', myDay: 'Mi día de producción', teamPulse: 'Pulso del equipo',
    assigned: 'Asignados', inProgress: 'En progreso', completed: 'Completados', pool: 'Pool', approvals: 'Aprobaciones',
    openQueue: 'Abrir Queue', openDashboard: 'Explorar posts', noWork: 'No tienes nada asignado ahora.',
    noWorkHelp: 'Elige un request o revisa cuando un coordinador programe uno.', loading: 'Cargando…', retry: 'Intentar de nuevo',
    search: 'Buscar posts', filters: 'Filtros', all: 'Todos', sentient: 'Sentient', competitors: 'Competidores', hot: 'HOT',
    newest: 'Más recientes', oldest: 'Más antiguos', mostLiked: 'Más likes', mostCommented: 'Más comentados', hottest: 'Mayor HOT', account: 'Cuenta', format: 'Formato', clear: 'Limpiar', results: 'resultados',
    media: 'Media', anyMedia: 'Cualquier media', staticOnly: 'Solo estáticos', videoOnly: 'Solo videos', period: 'Periodo', anyTime: 'Cualquier fecha', last24: 'Últimas 24 horas', last3: 'Últimos 3 días', last7: 'Últimos 7 días', customRange: 'Rango personalizado', from: 'Desde', to: 'Hasta', minLikes: 'Likes mínimos', minComments: 'Comentarios mínimos', promoOnly: 'Solo promos', showHidden: 'Mostrar posts ocultos', order: 'Orden',
    likes: 'Likes', comments: 'Comentarios', viewPost: 'Ver en Instagram', downloadMedia: 'Descargar media',
    sendPool: 'Enviar al Pool', productionPoints: 'Puntos de producción', priority: 'Prioridad', brief: 'Brief', tags: 'Tags',
    addPool: 'Agregar al pool de producción', addedPool: 'Post agregado a Queue.', low: 'Baja', medium: 'Media', high: 'Alta', urgent: 'Urgente',
    agenda: 'Agenda', requests: 'Requests', team: 'Equipo', pick: 'Pick', createPost: 'Crear Post',
    previousDay: 'Día anterior', nextDay: 'Día siguiente', noAssignments: 'No hay asignaciones para este día.', noPool: 'El pool está vacío.',
    scheduled: 'Programado', closed: 'Cerrado', cancelled: 'Cancelado', start: 'Empezar trabajo', markComplete: 'Marcar completado',
    completeClose: 'Cerrar con link', finalLink: 'Link publicado de Instagram', requestChange: 'Solicitar cambio',
    assign: 'Asignar', editAssignment: 'Editar asignación', returnPool: 'Devolver al pool', designer: 'Designer', date: 'Fecha', time: 'Hora',
    recommendedAccounts: 'Cuentas recomendadas', previewAssignment: 'Compartir posición temporal', confirmAssignment: 'Enviar y notificar',
    temporaryShared: 'La posición temporal ya es visible para el designer.', assignmentSent: 'Asignación enviada.',
    activityLive: 'En vivo', reconnecting: 'Reconectando', next: 'Siguiente', choose: 'Asignar este trabajo', noPick: 'No hay trabajo disponible para elegir.',
    title: 'Título', postType: 'Tipo de post', notes: 'Notas', create: 'Crear', created: 'Post creado en el pool.',
    sentRequests: 'Mis requests', requestInbox: 'Bandeja de aprobaciones', pending: 'Pendientes', approved: 'Aprobados', rejected: 'Rechazados',
    approve: 'Aprobar', reject: 'Rechazar', meeting: 'Meeting', break: 'Break', promo: 'Promo', focus: 'Tiempo de enfoque',
    blockTime: 'Bloquear tiempo', duration: 'Duración', reason: 'Motivo', submitRequest: 'Enviar request', requestSent: 'Request enviado.',
    ppRevision: 'Revisión de PP', cancellation: 'Cancelación', move: 'Mover', newPPs: 'PPs solicitados',
    followers: 'Seguidores', totalFollowers: 'Seguidores totales', todayGrowth: 'Crecimiento de hoy', todayFollowers: 'Hoy', favorites: 'Favoritos', growth7d: 'Crecimiento 7 días', avgLikes: 'Promedio de likes', trackedAccounts: 'Cuentas monitoreadas',
    trackingSince: 'Monitoreando desde', refresh: 'Actualizar', history: 'Historial', posts: 'Posts', engagement: 'Engagement', followersGained: 'Ganados', total: 'Total',
    performance: 'Resumen de rendimiento', topAccounts: 'Mejores cuentas', topTopics: 'Temas principales', formats: 'Formatos',
    last30: 'Últimos 30 días', last90: 'Últimos 90 días', allTime: 'Todo el tiempo', noData: 'No hay datos disponibles.',
    overview: 'Resumen', accounts: 'Cuentas', users: 'Usuarios', usage: 'Uso', notifications: 'Notificaciones', system: 'Sistema', reports: 'Reportes',
    adminOnly: 'Se necesita acceso Admin o Dev.', displayName: 'Nombre visible', role: 'Rol', slackId: 'Slack ID', admin: 'Admin', save: 'Guardar',
    active: 'Activa', inactive: 'Inactiva', threshold: 'Umbral HOT', group: 'Grupo', refreshAvatar: 'Actualizar avatar', deactivate: 'Desactivar', activate: 'Activar', accountSaved: 'Cuenta actualizada.', disk: 'Disco', slack: 'Slack', ocr: 'OCR',
    customAlert: 'Notificación personalizada', alertTitle: 'Título (opcional)', alertMessage: 'Mensaje', attachImage: 'Adjuntar imagen', changeImage: 'Cambiar imagen', sendAlert: 'Enviar notificación', alertSent: 'Notificación enviada a Slack.', sendTest: 'Enviar prueba',
    dayMap: 'Mapa del día', blockedTime: 'Tiempo bloqueado',
    install: 'Instalar app', installHelp: 'Agrega Sentient Dash a tu pantalla de inicio para usarla como app.',
    iosInstall: 'En Safari, toca Compartir y luego “Agregar a pantalla de inicio”.', desktop: 'Abrir versión desktop', signOut: 'Cerrar sesión',
    language: 'Idioma', theme: 'Tema', accent: 'Acento', dark: 'Oscuro', light: 'Claro', greenAccent: 'Verde Sentient', neonAccent: 'Amarillo neón', custom: 'Personalizado', close: 'Cerrar',
    offline: 'No tienes conexión. Los datos en vivo se reconectarán automáticamente.', updateReady: 'Hay una nueva versión lista.', update: 'Actualizar',
    signIn: 'Iniciar sesión con Google', signingIn: 'Iniciando sesión…', signInHelp: 'Usa tu cuenta de Sentient para abrir el workspace móvil.',
  },
};

const Prefs = createContext(null);
const usePrefs = () => useContext(Prefs);
const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
const TRACKER_FAVORITES_KEY = 'sentient.tracker.favs';
const readTrackerFavorites = () => { try { const value = JSON.parse(localStorage.getItem(TRACKER_FAVORITES_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
const writeTrackerFavorites = (handles) => { try { localStorage.setItem(TRACKER_FAVORITES_KEY, JSON.stringify(handles)); } catch {} };
const hexRgb = (value) => {
  const hex = String(value || '').replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((digit) => `${digit}${digit}`).join('') : hex;
  return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16) || 0).join(', ');
};
const assetUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/api/')) return `${API_BASE}${raw}`;
  return raw;
};
const fmt = (value) => value == null ? '—' : Intl.NumberFormat('en-US', { notation: Number(value) > 9999 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
const fmtExact = (value) => value == null || Number.isNaN(Number(value)) ? '—' : Math.round(Number(value)).toLocaleString('en-US');
const signedExact = (value) => value == null || Number.isNaN(Number(value)) ? '—' : `${Number(value) > 0 ? '+' : ''}${fmtExact(value)}`;
const matchesMobileSearch = (post, query) => {
  const haystack = `${post.caption || ''} ${post.ocrText || ''} ${post.account || ''} ${post.musicSong || ''} ${post.musicArtist || ''}`.toLowerCase();
  const include = []; const exclude = [];
  String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean).forEach((term) => (term.startsWith('-') && term.length > 1 ? exclude : include).push(term.replace(/^-/, '')));
  return include.every((term) => haystack.includes(term)) && exclude.every((term) => !haystack.includes(term));
};
const dateLabel = (value, lang = 'en') => value ? new Intl.DateTimeFormat(lang === 'es' ? 'es-CR' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) : '—';
const timeLabel = (minutes) => {
  const total = Number(minutes);
  if (!Number.isFinite(total)) return '—';
  const hour = Math.floor(total / 60) % 24;
  const minute = total % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};
const shiftDay = (value, amount) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const displayName = (email = '') => String(email).split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

async function apiJson(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const response = await apiFetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || body.message || `Request failed (${response.status}).`);
  return body;
}

function PrefsProvider({ children }) {
  const [language, setLanguageState] = useState(() => localStorage.getItem('sentient.language') || (navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en'));
  const [theme, setThemeState] = useState(() => localStorage.getItem('sentient.theme') || 'dark');
  const [accent, setAccentState] = useState(() => { const saved = localStorage.getItem('sentient.accent') || 'lime'; return saved === 'custom' ? (localStorage.getItem('sentient.accentCustom') || '#00ac80') : saved; });
  const [customAccent, setCustomAccentState] = useState(() => { const saved = localStorage.getItem('sentient.accent') || ''; return saved.startsWith('#') ? saved : (localStorage.getItem('sentient.accentCustom') || '#00ac80'); });
  const setLanguage = (value) => { localStorage.setItem('sentient.language', value); setLanguageState(value); };
  const setTheme = (value) => { localStorage.setItem('sentient.theme', value); document.documentElement.dataset.theme = value; setThemeState(value); };
  const setAccent = (value) => { localStorage.setItem('sentient.accent', value); document.documentElement.dataset.accent = value; setAccentState(value); };
  const setCustomAccent = (value) => { localStorage.setItem('sentient.accent', value); localStorage.setItem('sentient.accentCustom', value); document.documentElement.style.setProperty('--custom-accent', value); document.documentElement.style.setProperty('--custom-accent-rgb', hexRgb(value)); document.documentElement.dataset.accent = 'custom'; setCustomAccentState(value); setAccentState(value); };
  useEffect(() => { const custom = String(accent).startsWith('#'); document.documentElement.dataset.theme = theme; document.documentElement.dataset.accent = custom ? 'custom' : accent; document.documentElement.style.setProperty('--custom-accent', custom ? accent : customAccent); document.documentElement.style.setProperty('--custom-accent-rgb', hexRgb(custom ? accent : customAccent)); }, [theme, accent, customAccent]);
  const t = useCallback((key) => I18N[language]?.[key] || I18N.en[key] || key, [language]);
  return <Prefs.Provider value={{ language, setLanguage, theme, setTheme, accent, setAccent, customAccent, setCustomAccent, t }}>{children}</Prefs.Provider>;
}

function Spinner({ label }) { return <div className="m-loading"><LoaderCircle className="spin" size={22} /><span>{label}</span></div>; }
function Empty({ icon: Icon = Inbox, title, text }) { return <div className="m-empty"><Icon size={25} /><strong>{title}</strong>{text ? <p>{text}</p> : null}</div>; }
function Notice({ type = 'success', children }) { return children ? <div className={`m-notice is-${type}`}>{type === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}<span>{children}</span></div> : null; }
function Sheet({ title, onClose, children, wide = false }) {
  const { t } = usePrefs();
  useEffect(() => { const fn = (event) => event.key === 'Escape' && onClose(); document.addEventListener('keydown', fn); return () => document.removeEventListener('keydown', fn); }, [onClose]);
  return <div className="m-sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className={`m-sheet${wide ? ' is-wide' : ''}`} role="dialog" aria-modal="true"><header><h2>{title}</h2><button onClick={onClose} aria-label={t('close')}><X size={18} /></button></header><div className="m-sheet-body">{children}</div></section></div>;
}
function Cover({ src, fallbackSrc = '', alt = '', className = '' }) {
  const [activeSrc, setActiveSrc] = useState(src || fallbackSrc);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setActiveSrc(src || fallbackSrc); setFailed(false); }, [src, fallbackSrc]);
  return failed || !activeSrc ? <div className={`m-cover-empty ${className}`}><Sparkles size={22} /></div> : <img className={className} src={assetUrl(activeSrc)} alt={alt} loading="lazy" onError={() => { if (fallbackSrc && activeSrc !== fallbackSrc) setActiveSrc(fallbackSrc); else setFailed(true); }} />;
}
function Metric({ label, value, hint }) { return <div className="m-metric"><span>{label}</span><strong>{value}</strong>{hint ? <small>{hint}</small> : null}</div>; }

function LoginScreen({ notice }) {
  const { t } = usePrefs();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const login = async () => { setBusy(true); setError(''); const next = await startGoogleSignIn(); if (next) setError(describeSignInError(next)); setBusy(false); };
  return <main className="m-auth"><img src="/mobile-icon-192.png" alt="" /><span>Sentient Dash</span><h1>{t('signIn')}</h1><p>{t('signInHelp')}</p><button className="m-primary" onClick={login} disabled={busy}>{busy ? t('signingIn') : t('signIn')}</button><Notice type="error">{notice || error}</Notice></main>;
}

function MobileApp() {
  const { t } = usePrefs();
  const [user, setUser] = useState(undefined);
  const [ssoChecked, setSsoChecked] = useState(false);
  const [viewer, setViewer] = useState(undefined);
  const [authNotice, setAuthNotice] = useState('');
  useEffect(() => { authPersistenceReady.then(() => getRedirectResult(firebaseAuth, browserPopupRedirectResolver)).catch((error) => setAuthNotice(describeSignInError(error))); }, []);
  useEffect(() => { trySsoSignIn().finally(() => setSsoChecked(true)); }, []);
  useEffect(() => onAuthStateChanged(firebaseAuth, (next) => { setUser(next); setViewer(undefined); }), []);
  useEffect(() => user ? startSsoRefresh() : undefined, [user]);
  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    apiJson('/api/dashboard/me').then((body) => active && setViewer(body)).catch((error) => active && setAuthNotice(error.message));
    return () => { active = false; };
  }, [user]);
  if (user === undefined || (!user && !ssoChecked) || (user && viewer === undefined && !authNotice)) return <main className="m-auth"><Spinner label={t('loading')} /></main>;
  if (!user) return <LoginScreen notice={authNotice} />;
  if (!viewer) return <main className="m-auth"><AlertCircle size={30} /><h1>Access unavailable</h1><p>{authNotice}</p><button className="m-secondary" onClick={() => signOut(firebaseAuth)}>{t('signOut')}</button></main>;
  return <MobileShell user={user} viewer={viewer} />;
}

const NAV = [
  ['home', Home], ['dashboard', LayoutGrid], ['queue', CalendarDays], ['tracker', LineChart], ['insights', BarChart3],
];

function MobileShell({ user, viewer }) {
  const { t } = usePrefs();
  const initial = new URLSearchParams(location.search).get('tab');
  const [tab, setTab] = useState(NAV.some(([key]) => key === initial) || initial === 'settings' ? initial : 'home');
  const [profileOpen, setProfileOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);
  const navigate = useCallback((next) => {
    setTab(next); setProfileOpen(false); window.scrollTo({ top: 0, behavior: 'instant' });
    const url = new URL(location.href); url.searchParams.set('tab', next); url.searchParams.delete('post'); url.searchParams.delete('task'); history.replaceState(null, '', url);
  }, []);
  useEffect(() => { const on = () => setOnline(true); const off = () => setOnline(false); addEventListener('online', on); addEventListener('offline', off); return () => { removeEventListener('online', on); removeEventListener('offline', off); }; }, []);
  useEffect(() => { const handler = (event) => { event.preventDefault(); setInstallPrompt(event); }; addEventListener('beforeinstallprompt', handler); return () => removeEventListener('beforeinstallprompt', handler); }, []);
  useEffect(() => {
    if (!('serviceWorker' in navigator) || import.meta.env.MODE === 'test') return;
    navigator.serviceWorker.register('/mobile-sw.js', { scope: '/mobile/' }).then((registration) => {
      if (registration.waiting) setUpdateReady(true);
      registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', () => registration.installing?.state === 'installed' && navigator.serviceWorker.controller && setUpdateReady(true)));
    }).catch(() => {});
  }, []);
  const install = async () => { if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); } };
  const logout = () => { clearSsoCookie(); signOut(firebaseAuth); };
  const title = tab === 'home' ? 'Sentient Dash' : t(tab);
  return <div className="m-app">
    <header className="m-topbar"><div><span>Sentient Dash</span><h1>{title}</h1></div><button className="m-profile" onClick={() => setProfileOpen(true)} aria-label={t('settings')}><UserRound size={18} /></button></header>
    {!online ? <div className="m-connection is-offline"><WifiOff size={14} />{t('offline')}</div> : null}
    {updateReady ? <div className="m-update"><span>{t('updateReady')}</span><button onClick={() => location.reload()}>{t('update')}</button></div> : null}
    <main className="m-content">
      {tab === 'home' ? <HomeView viewer={viewer} navigate={navigate} /> : null}
      {tab === 'dashboard' ? <DashboardView viewer={viewer} /> : null}
      {tab === 'queue' ? <QueueView viewer={viewer} /> : null}
      {tab === 'tracker' ? <TrackerView /> : null}
      {tab === 'insights' ? <InsightsView /> : null}
      {tab === 'settings' ? <SettingsView viewer={viewer} /> : null}
    </main>
    <nav className="m-bottom-nav" aria-label="Sentient Dash">
      {NAV.map(([key, Icon]) => <button key={key} className={tab === key ? 'is-active' : ''} onClick={() => navigate(key)}><Icon size={19} /><span>{t(key)}</span></button>)}
    </nav>
    {profileOpen ? <ProfileSheet user={user} viewer={viewer} installPrompt={installPrompt} onInstall={install} onSettings={() => navigate('settings')} onSignOut={logout} onClose={() => setProfileOpen(false)} /> : null}
  </div>;
}

function ProfileSheet({ user, viewer, installPrompt, onInstall, onSettings, onSignOut, onClose }) {
  const prefs = usePrefs(); const { t } = prefs;
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent || '') && !navigator.standalone;
  const desktop = `${location.origin}/?desktop=1`;
  return <Sheet title={displayName(user.email)} onClose={onClose}>
    <div className="m-profile-card"><UserRound size={24} /><div><strong>{user.email}</strong><span>{viewer.operating_roles?.join(' · ') || viewer.operating_role}</span></div></div>
    {(viewer.is_admin || viewer.is_dev) ? <button className="m-menu-row" onClick={onSettings}><Settings size={18} /><span>{t('settings')}</span><ChevronRight size={17} /></button> : null}
    {installPrompt ? <button className="m-menu-row" onClick={onInstall}><Download size={18} /><span>{t('install')}</span><ChevronRight size={17} /></button> : null}
    {ios ? <div className="m-install-tip"><Download size={18} /><div><strong>{t('install')}</strong><p>{t('iosInstall')}</p></div></div> : null}
    <section className="m-pref-section"><label>{t('language')}</label><div className="m-segment"><button className={prefs.language === 'en' ? 'is-on' : ''} onClick={() => prefs.setLanguage('en')}>EN</button><button className={prefs.language === 'es' ? 'is-on' : ''} onClick={() => prefs.setLanguage('es')}>ES</button></div></section>
    <section className="m-pref-section"><label>{t('theme')}</label><div className="m-segment"><button className={prefs.theme === 'dark' ? 'is-on' : ''} onClick={() => prefs.setTheme('dark')}><Moon size={14} />{t('dark')}</button><button className={prefs.theme === 'light' ? 'is-on' : ''} onClick={() => prefs.setTheme('light')}><Sun size={14} />{t('light')}</button></div></section>
    <section className="m-pref-section"><label>{t('accent')}</label><div className="m-colors">{['green', 'lime', 'blue', 'coral'].map((color) => <button key={color} className={`is-${color}${prefs.accent === color ? ' is-on' : ''}`} onClick={() => prefs.setAccent(color)} aria-label={color === 'green' ? t('greenAccent') : color === 'lime' ? t('neonAccent') : color} />)}<label className={String(prefs.accent).startsWith('#') ? 'is-on' : ''}><Palette size={14} /><input type="color" value={prefs.customAccent} onChange={(event) => prefs.setCustomAccent(event.target.value)} /></label></div></section>
    <a className="m-menu-row" href={desktop}><ExternalLink size={18} /><span>{t('desktop')}</span><ChevronRight size={17} /></a>
    <button className="m-menu-row is-danger" onClick={onSignOut}><LogOut size={18} /><span>{t('signOut')}</span></button>
  </Sheet>;
}

function HomeView({ viewer, navigate }) {
  const { t, language } = usePrefs();
  const [data, setData] = useState(null); const [tracker, setTracker] = useState(null); const [error, setError] = useState('');
  const coordinator = viewer.is_admin || viewer.operating_roles?.includes('vc');
  const load = useCallback(() => { setError(''); Promise.all([apiJson(`/api/dashboard/queue/v2?date=${DAY()}`), apiJson('/api/tracker/summary')]).then(([queue, track]) => { setData(queue); setTracker(track); }).catch((err) => setError(err.message)); }, []);
  useEffect(() => { load(); }, [load]);
  if (!data && !error) return <Spinner label={t('loading')} />;
  if (error) return <><Notice type="error">{error}</Notice><button className="m-secondary" onClick={load}>{t('retry')}</button></>;
  const assigned = data.assignedRequests || [];
  const active = assigned.find((task) => task.status === 'in_progress');
  const next = active || assigned.find((task) => task.status === 'scheduled') || data.planningRequests?.find((task) => task.status === 'in_progress');
  const poolCount = (data.requests || []).filter((task) => task.status === 'pool').length;
  const todayCount = (data.planningRequests || []).filter((task) => task.scheduledDate === DAY() && ['scheduled', 'in_progress', 'completed'].includes(task.status)).length;
  const trackerAccounts = tracker?.accounts || [];
  const favoriteHandles = readTrackerFavorites();
  const byHandle = new Map(trackerAccounts.map((account) => [account.handle, account]));
  const favoriteAccounts = favoriteHandles.map((handle) => byHandle.get(handle)).filter(Boolean);
  const homeAccounts = (favoriteAccounts.length ? favoriteAccounts : [...trackerAccounts].sort((a, b) => Number(b.followers || 0) - Number(a.followers || 0))).slice(0, 4);
  return <div className="m-stack">
    <section className="m-welcome"><span>{t('greeting')}</span><h2>{displayName(viewer.email)}</h2><p>{dateLabel(DAY(), language)}</p></section>
    {coordinator ? <><div className="m-section-head"><div><span>{t('today')}</span><h2>{t('teamPulse')}</h2></div><button onClick={() => navigate('queue')}>{t('openQueue')}<ArrowUpRight size={15} /></button></div><div className="m-metric-grid"><Metric label={t('pool')} value={poolCount} /><Metric label={t('assigned')} value={todayCount} /><Metric label={t('approvals')} value={data.pendingTicketCount || 0} /></div></> : <><div className="m-section-head"><div><span>{t('today')}</span><h2>{t('myDay')}</h2></div><button onClick={() => navigate('queue')}>{t('openQueue')}<ArrowUpRight size={15} /></button></div>{next ? <QueueTaskCard task={next} compact /> : <Empty title={t('noWork')} text={t('noWorkHelp')} />}</>}
    <button className="m-hero-action" onClick={() => navigate('dashboard')}><span><Search size={20} /><b>{t('openDashboard')}</b></span><ChevronRight size={20} /></button>
    <div className="m-section-head"><div><span>{t('tracker')}</span><h2>{favoriteAccounts.length ? t('favorites') : t('trackedAccounts')}</h2></div><button onClick={() => navigate('tracker')}><ArrowUpRight size={15} /></button></div>
    <div className="m-mini-list">{homeAccounts.map((account) => <div key={account.handle}><Cover src={`/api/dashboard/avatar/${account.handle}`} /><span><b>@{account.handle}</b><small>{fmtExact(account.followers)} {t('followers')}</small></span><strong className={(account.delta_1d?.delta || 0) < 0 ? 'is-negative' : ''}>{account.delta_1d ? `${signedExact(account.delta_1d.delta)} ${t('todayFollowers')}` : '—'}</strong></div>)}</div>
  </div>;
}

function DashboardView({ viewer }) {
  const { t } = usePrefs();
  const deepLinkOpened = useRef(false);
  const [payload, setPayload] = useState(null); const [accounts, setAccounts] = useState([]); const [error, setError] = useState('');
  const [search, setSearch] = useState(''); const [group, setGroup] = useState('all'); const [account, setAccount] = useState(''); const [type, setType] = useState(''); const [media, setMedia] = useState('all'); const [period, setPeriod] = useState('all'); const [dateFrom, setDateFrom] = useState(''); const [dateTo, setDateTo] = useState(''); const [minLikes, setMinLikes] = useState(''); const [minComments, setMinComments] = useState(''); const [promoOnly, setPromoOnly] = useState(false); const [showHidden, setShowHidden] = useState(false); const [sort, setSort] = useState('newest');
  const [filtersOpen, setFiltersOpen] = useState(false); const [selected, setSelected] = useState(null);
  const load = useCallback(() => { setError(''); Promise.all([apiJson('/api/dashboard/posts'), apiJson('/api/dashboard/accounts')]).then(([posts, roster]) => { setPayload(posts); setAccounts(roster.accounts || []); }).catch((err) => setError(err.message)); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const postId = new URLSearchParams(location.search).get('post');
    if (!postId || !payload?.posts?.length || deepLinkOpened.current) return;
    deepLinkOpened.current = true;
    const decoded = decodeURIComponent(postId).toLowerCase();
    const match = payload.posts.find((post) => String(post.shortcode || '').toLowerCase() === decoded || `${post.account}:${post.shortcode}`.toLowerCase() === decoded);
    if (match) setSelected(match);
  }, [payload]);
  const filtered = useMemo(() => {
    const cutoff = ['all', 'custom'].includes(period) ? 0 : Date.now() - Number(period) * 86400000;
    const rows = (payload?.posts || []).filter((post) => {
      if (group === 'hot' && !post.isHot) return false;
      if (!['all', 'hot'].includes(group) && post.group !== group) return false;
      if (account && post.account !== account) return false;
      if (type && !String(post.type || '').toLowerCase().startsWith(type)) return false;
      const isVideo = post.video === 'Yes' || String(post.type || '').toLowerCase().startsWith('video');
      if (media === 'video' && !isVideo) return false;
      if (media === 'static' && isVideo) return false;
      if (promoOnly && !post.isPromo && !/#(?:promo|promotion|ad)\b/i.test(post.caption || '')) return false;
      if (showHidden ? !post.hidden : Boolean(post.hidden)) return false;
      if (minLikes !== '' && Number(post.likes || 0) < Number(minLikes)) return false;
      if (minComments !== '' && Number(post.comments || 0) < Number(minComments)) return false;
      if (cutoff && new Date(post.postDate || 0).getTime() < cutoff) return false;
      const postDay = String(post.postDate || '').slice(0, 10);
      if (period === 'custom' && dateFrom && postDay < dateFrom) return false;
      if (period === 'custom' && dateTo && postDay > dateTo) return false;
      if (!matchesMobileSearch(post, search)) return false;
      return true;
    });
    rows.sort(sort === 'likes' ? (a, b) => Number(b.likes || 0) - Number(a.likes || 0) : sort === 'comments' ? (a, b) => Number(b.comments || 0) - Number(a.comments || 0) : sort === 'hot' ? (a, b) => Number(b.hotMultiplier || 0) - Number(a.hotMultiplier || 0) : sort === 'oldest' ? (a, b) => String(a.postDate || '').localeCompare(String(b.postDate || '')) : (a, b) => String(b.postDate || '').localeCompare(String(a.postDate || '')));
    return rows;
  }, [payload, search, group, account, type, media, period, dateFrom, dateTo, minLikes, minComments, promoOnly, showHidden, sort]);
  const filterActive = Boolean(account || type || media !== 'all' || period !== 'all' || dateFrom || dateTo || minLikes !== '' || minComments !== '' || promoOnly || showHidden || sort !== 'newest');
  if (!payload && !error) return <Spinner label={t('loading')} />;
  return <div className="m-stack">
    <div className="m-search-row"><label><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('search')} /></label><button className={filterActive ? 'is-active' : ''} onClick={() => setFiltersOpen(true)}><Filter size={18} /></button></div>
    <div className="m-chip-scroll">{['all', 'sentient', 'competitors', 'hot'].map((value) => <button key={value} className={group === value ? 'is-on' : ''} onClick={() => setGroup(value)}>{value === 'hot' ? <Flame size={13} /> : null}{t(value)}</button>)}</div>
    <div className="m-result-count"><span>{fmt(filtered.length)} {t('results')}</span>{(filterActive || search) ? <button onClick={() => { setAccount(''); setType(''); setMedia('all'); setPeriod('all'); setDateFrom(''); setDateTo(''); setMinLikes(''); setMinComments(''); setPromoOnly(false); setShowHidden(false); setSort('newest'); setSearch(''); }}>{t('clear')}</button> : null}</div>
    {error ? <Notice type="error">{error}</Notice> : null}
    <div className="m-post-grid">{filtered.slice(0, 300).map((post) => <button className="m-post-card" key={`${post.account}:${post.shortcode}`} onClick={() => setSelected(post)}><div className="m-post-cover"><Cover src={post.coverUrl} alt="" />{post.isHot ? <span className="m-hot"><Flame size={11} />{Number(post.hotMultiplier || 0).toFixed(1)}x</span> : null}{post.queueState ? <span className="m-queued"><Check size={11} /></span> : null}</div><div><b>@{post.account}</b><span><Heart size={11} />{fmt(post.likes)}</span></div></button>)}</div>
    {filtersOpen ? <Sheet title={t('filters')} onClose={() => setFiltersOpen(false)}><div className="m-form"><label>{t('account')}<select value={account} onChange={(event) => setAccount(event.target.value)}><option value="">{t('all')}</option>{accounts.map((item) => <option key={item.handle} value={item.handle}>@{item.handle}</option>)}</select></label><div className="m-form-pair"><label>{t('format')}<select value={type} onChange={(event) => setType(event.target.value)}><option value="">{t('all')}</option><option value="image">Image</option><option value="video">Video</option><option value="carousel">Carousel</option></select></label><label>{t('media')}<select value={media} onChange={(event) => setMedia(event.target.value)}><option value="all">{t('anyMedia')}</option><option value="static">{t('staticOnly')}</option><option value="video">{t('videoOnly')}</option></select></label></div><label>{t('period')}<select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="all">{t('anyTime')}</option><option value="1">{t('last24')}</option><option value="3">{t('last3')}</option><option value="7">{t('last7')}</option><option value="30">{t('last30')}</option><option value="90">{t('last90')}</option><option value="custom">{t('customRange')}</option></select></label>{period === 'custom' ? <div className="m-form-pair"><label>{t('from')}<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label>{t('to')}<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label></div> : null}<div className="m-form-pair"><label>{t('minLikes')}<input type="number" inputMode="numeric" min="0" value={minLikes} onChange={(event) => setMinLikes(event.target.value)} /></label><label>{t('minComments')}<input type="number" inputMode="numeric" min="0" value={minComments} onChange={(event) => setMinComments(event.target.value)} /></label></div><label>{t('order')}<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">{t('newest')}</option><option value="oldest">{t('oldest')}</option><option value="likes">{t('mostLiked')}</option><option value="comments">{t('mostCommented')}</option><option value="hot">{t('hottest')}</option></select></label><label className="m-toggle"><input type="checkbox" checked={promoOnly} onChange={(event) => setPromoOnly(event.target.checked)} /><span>{t('promoOnly')}</span></label><label className="m-toggle"><input type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} /><span>{t('showHidden')}</span></label><button className="m-primary" onClick={() => setFiltersOpen(false)}>{fmt(filtered.length)} {t('results')}</button></div></Sheet> : null}
    {selected ? <PostSheet post={selected} viewer={viewer} onClose={() => setSelected(null)} onPooled={(request) => { setPayload((current) => ({ ...current, posts: current.posts.map((post) => post.account === selected.account && post.shortcode === selected.shortcode ? { ...post, queueState: 'pool', queueRequestId: request.id } : post) })); setSelected(null); }} /> : null}
  </div>;
}

function PostSheet({ post, viewer, onClose, onPooled }) {
  const { t, language } = usePrefs(); const [poolForm, setPoolForm] = useState(false); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  const coordinator = viewer.is_admin || viewer.operating_roles?.includes('vc');
  const [form, setForm] = useState({ pps: 3, priority: 'medium', tags: '', brief: '' });
  const [videoPoster, setVideoPoster] = useState('');
  useEffect(() => {
    if (!(post.video === 'Yes' || String(post.type || '').toLowerCase().startsWith('video')) || !post.shortcode) return undefined;
    let active = true;
    apiJson(`/api/dashboard/posts/media?account=${encodeURIComponent(post.account)}&shortcode=${encodeURIComponent(post.shortcode)}&list=1`)
      .then((result) => { const poster = (result.items || []).find((item) => item.poster)?.poster || ''; if (active) setVideoPoster(poster); })
      .catch(() => { if (active) setVideoPoster(''); });
    return () => { active = false; };
  }, [post.account, post.shortcode, post.type, post.video]);
  const download = async () => {
    setBusy(true); setNotice('');
    try { const response = await apiFetch(`${API_BASE}/api/dashboard/posts/media?account=${encodeURIComponent(post.account)}&shortcode=${encodeURIComponent(post.shortcode)}`); if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || 'Download failed.'); const blob = await response.blob(); const href = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = href; link.download = `${post.account}-${post.shortcode}.zip`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(href), 30000); } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  };
  const pool = async (event) => { event.preventDefault(); setBusy(true); setNotice(''); try { const body = new URLSearchParams({ account: post.account, shortcode: post.shortcode, production_points: String(form.pps), priority: form.priority, tags: form.tags, brief: form.brief, references: '[]' }); const result = await apiJson('/api/dashboard/queue/v2/pool', { method: 'POST', body }); onPooled(result.request); } catch (error) { setNotice(error.message); setBusy(false); } };
  return <Sheet title={`@${post.account}`} onClose={onClose} wide><article className="m-post-detail"><Cover src={post.coverUrl} fallbackSrc={videoPoster} /><div className="m-detail-kicker"><span>{post.type}</span><span>{dateLabel(post.postDate, language)}</span></div><div className="m-detail-metrics"><span><Heart size={16} />{fmt(post.likes)} {t('likes')}</span><span><MessageCircle size={16} />{fmt(post.comments)} {t('comments')}</span></div>{post.title ? <h3>{post.title}</h3> : null}<p>{post.caption}</p>{post.queueState ? <Notice>{t('queue')}: {post.queueState}</Notice> : null}<Notice type="error">{notice}</Notice><div className="m-action-grid"><a className="m-secondary" href={post.permalink} target="_blank" rel="noreferrer"><ExternalLink size={16} />{t('viewPost')}</a><button className="m-secondary" onClick={download} disabled={busy}><Download size={16} />{t('downloadMedia')}</button>{coordinator && !post.queueState ? <button className="m-primary" onClick={() => setPoolForm(!poolForm)}><Send size={16} />{t('sendPool')}</button> : null}</div>{poolForm ? <form className="m-form m-inline-form" onSubmit={pool}><label>{t('productionPoints')}<input type="number" min="1" value={form.pps} onChange={(event) => setForm({ ...form, pps: event.target.value })} required /></label><label>{t('priority')}<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{['low', 'medium', 'high', 'urgent'].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></label><label>{t('tags')}<input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="copy, carousel" /></label><label>{t('brief')}<textarea rows="3" value={form.brief} onChange={(event) => setForm({ ...form, brief: event.target.value })} /></label><button className="m-primary" disabled={busy}>{busy ? t('loading') : t('addPool')}</button></form> : null}</article></Sheet>;
}

function QueueView({ viewer }) {
  const { t } = usePrefs();
  const [date, setDate] = useState(DAY()); const [data, setData] = useState(null); const [error, setError] = useState(''); const [mode, setMode] = useState('agenda'); const [open, setOpen] = useState(null); const [assigning, setAssigning] = useState(null); const [ticketsOpen, setTicketsOpen] = useState(false); const [pickOpen, setPickOpen] = useState(false); const [createOpen, setCreateOpen] = useState(false); const [live, setLive] = useState('connecting'); const [toast, setToast] = useState('');
  const revision = useRef(0); const loadRef = useRef(null); const deepLinkOpened = useRef(false);
  const coordinator = Boolean(data?.viewer?.isAdmin || data?.viewer?.operatingRoles?.includes('vc') || viewer.is_admin || viewer.operating_roles?.includes('vc'));
  const load = useCallback(async ({ silent = false } = {}) => { if (!silent) setError(''); try { const next = await apiJson(`/api/dashboard/queue/v2?date=${date}`); setData(next); revision.current = Math.max(revision.current, Number(next.liveRevision || 0)); if (open?.id) { const all = [...(next.requests || []), ...(next.planningRequests || []), ...(next.assignedRequests || []), ...(next.liveDrafts || [])]; setOpen(all.find((task) => task.id === open.id) || null); } } catch (err) { setError(err.message); } }, [date, open?.id]);
  loadRef.current = load; useEffect(() => { load(); }, [date]);
  useEffect(() => {
    const taskId = Number(new URLSearchParams(location.search).get('task'));
    if (!taskId || deepLinkOpened.current) return;
    deepLinkOpened.current = true;
    apiJson(`/api/dashboard/queue/v2/requests/${taskId}`).then(({ request }) => {
      if (request?.scheduledDate) setDate(request.scheduledDate);
      if (request) setOpen(request);
    }).catch((reason) => setError(reason.message));
  }, []);
  useEffect(() => { if (!data?.viewer?.email || import.meta.env.MODE === 'test') { setLive('live'); return undefined; } const controller = new AbortController(); followQueueLive({ after: revision.current, signal: controller.signal, onStatus: setLive, onEvent: (event) => { revision.current = Math.max(revision.current, Number(event.revision || 0)); setTimeout(() => loadRef.current?.({ silent: true }), 80); } }); return () => controller.abort(); }, [data?.viewer?.email]);
  const tell = (message) => { setToast(message); setTimeout(() => setToast(''), 3500); };
  const assigned = useMemo(() => { const map = new Map((data?.assignedRequests || []).map((task) => [task.id, task])); (data?.liveDrafts || []).filter((task) => task.designerEmail === data?.viewer?.email).forEach((task) => map.set(task.id, task)); return [...map.values()].sort((a, b) => `${a.scheduledDate}${String(a.scheduledStartMinutes || 0).padStart(4, '0')}`.localeCompare(`${b.scheduledDate}${String(b.scheduledStartMinutes || 0).padStart(4, '0')}`)); }, [data]);
  const pool = useMemo(() => { const map = new Map((data?.requests || []).filter((task) => task.status === 'pool').map((task) => [task.id, task])); (data?.liveDrafts || []).forEach((task) => task.status === 'pool' ? map.set(task.id, task) : map.delete(task.id)); return [...map.values()].sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2)); }, [data]);
  const team = useMemo(() => [...(data?.planningRequests || []), ...(data?.liveDrafts || [])].filter((task, index, rows) => task.designerEmail && ['scheduled', 'in_progress', 'completed'].includes(task.status) && rows.findLastIndex((item) => item.id === task.id) === index).sort((a, b) => `${a.scheduledDate}${String(a.scheduledStartMinutes || 0).padStart(4, '0')}`.localeCompare(`${b.scheduledDate}${String(b.scheduledStartMinutes || 0).padStart(4, '0')}`)), [data]);
  const pickItems = data?.pickRequests || data?.hotPickRequests || [];
  const modes = coordinator ? ['agenda', 'pool', 'team', 'requests'] : ['agenda', 'requests'];
  if (!data && !error) return <Spinner label={t('loading')} />;
  return <div className="m-stack">
    <div className="m-queue-toolbar"><div className={`m-live is-${live}`}>{live === 'live' ? <Wifi size={13} /> : <WifiOff size={13} />}{live === 'live' ? t('activityLive') : t('reconnecting')}</div><div><button onClick={() => setDate(shiftDay(date, -1))} aria-label={t('previousDay')}><ChevronLeft size={18} /></button><button onClick={() => setDate(DAY())}>{date === DAY() ? t('today') : dateLabel(date)}</button><button onClick={() => setDate(shiftDay(date, 1))} aria-label={t('nextDay')}><ChevronRight size={18} /></button></div></div>
    <div className="m-tab-scroll">{modes.map((value) => <button key={value} className={mode === value ? 'is-on' : ''} onClick={() => { setMode(value); if (value === 'requests') setTicketsOpen(true); }}>{t(value)}{value === 'requests' && data.pendingTicketCount ? <i>{data.pendingTicketCount}</i> : null}</button>)}</div>
    <div className="m-queue-quick">{!coordinator ? <button onClick={() => setPickOpen(true)}><Sparkles size={16} />{t('pick')}</button> : <><button onClick={() => setCreateOpen(true)}><Plus size={16} />{t('createPost')}</button><button onClick={() => setTicketsOpen(true)}><Inbox size={16} />{t('approvals')}</button></>}</div>
    {error ? <Notice type="error">{error}</Notice> : null}{toast ? <Notice>{toast}</Notice> : null}
    {mode === 'agenda' ? <section className="m-agenda"><div className="m-section-head"><div><span>{dateLabel(date)}</span><h2>{coordinator ? t('team') : t('myDay')}</h2></div></div><MiniSchedule data={data} date={date} coordinator={coordinator} onOpen={setOpen} />{(coordinator ? team.filter((task) => task.scheduledDate === date) : assigned.filter((task) => task.scheduledDate === date)).length ? (coordinator ? team : assigned).filter((task) => task.scheduledDate === date).map((task) => <QueueTaskCard key={task.id} task={task} onClick={() => setOpen(task)} showDesigner={coordinator} />) : <Empty title={t('noAssignments')} />}</section> : null}
    {mode === 'pool' ? <section className="m-queue-list">{pool.length ? pool.map((task) => <QueueTaskCard key={task.id} task={task} onClick={() => setOpen(task)} />) : <Empty title={t('noPool')} />}</section> : null}
    {mode === 'team' ? <section className="m-team-groups">{data.schedulerUsers?.map((person) => { const work = team.filter((task) => task.designerEmail === person.email && task.scheduledDate === date); return <article key={person.email}><header><Avatar person={person} /><span><b>{person.displayName || displayName(person.email)}</b><small>{work.length} {t('assigned')}</small></span></header>{work.length ? work.map((task) => <QueueTaskCard key={task.id} task={task} compact onClick={() => setOpen(task)} />) : <p>{t('noAssignments')}</p>}</article>; })}</section> : null}
    {open ? <QueueDetail task={open} coordinator={coordinator} onAssign={() => setAssigning(open)} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load({ silent: true }); }} tell={tell} /> : null}
    {assigning ? <AssignmentSheet task={assigning} data={data} onClose={() => setAssigning(null)} onChanged={(message) => { tell(message); load({ silent: true }); }} /> : null}
    {ticketsOpen ? <TicketsSheet coordinator={coordinator} data={data} onClose={() => { setTicketsOpen(false); if (mode === 'requests') setMode('agenda'); }} onChanged={() => load({ silent: true })} /> : null}
    {pickOpen ? <PickSheet items={pickItems} onClose={() => setPickOpen(false)} onPicked={() => { tell(t('assignmentSent')); load({ silent: true }); }} /> : null}
    {createOpen ? <CreatePostSheet onClose={() => setCreateOpen(false)} onCreated={() => { tell(t('created')); load({ silent: true }); }} /> : null}
  </div>;
}

function MiniSchedule({ data, date, coordinator, onOpen }) {
  const { t } = usePrefs();
  const byId = new Map();
  [...(data.planningRequests || []), ...(data.assignedRequests || []), ...(data.liveDrafts || [])].forEach((task) => {
    if (task.designerEmail && task.scheduledDate === date && ['scheduled', 'in_progress', 'completed', 'closed'].includes(task.status)) byId.set(task.id, task);
  });
  const tasks = [...byId.values()];
  const blocks = (data.timeBlocks || []).filter((block) => block.scheduledDate === date && ['pending', 'approved'].includes(block.status));
  const roster = data.schedulerUsers || data.designers || [];
  const viewerEmail = data.viewer?.email;
  const people = (coordinator ? roster : roster.filter((person) => person.email === viewerEmail)).filter((person) => tasks.some((task) => task.designerEmail === person.email) || blocks.some((block) => block.requesterEmail === person.email));
  const rows = people.length ? people : [{ email: viewerEmail, displayName: displayName(viewerEmail) }];
  const now = new Date(); const nowMinutes = now.getHours() * 60 + now.getMinutes(); const showNow = date === DAY();
  return <section className="m-day-map"><header><div><span>{t('blockedTime')}</span><h3>{t('dayMap')}</h3></div><div className="m-day-map-hours"><i>00</i><i>06</i><i>12</i><i>18</i><i>24</i></div></header><div className="m-day-map-rows">{rows.map((person) => { const personTasks = tasks.filter((task) => task.designerEmail === person.email); const personBlocks = blocks.filter((block) => block.requesterEmail === person.email); return <div className="m-day-map-row" key={person.email}><b>{coordinator ? (person.displayName || displayName(person.email)) : t('today')}</b><div className="m-day-map-track">{showNow ? <i className="m-day-now" style={{ left: `${(nowMinutes / 1440) * 100}%` }} /> : null}{personTasks.map((task) => { const user = roster.find((item) => item.email === task.designerEmail); const duration = Number(task.durationMinutes || Number(task.productionPoints || 1) * Number(user?.minutesPerPP || 10)); return <button key={task.id} className={`m-day-bar status-${task.status}${task.isDraft ? ' is-draft' : ''}`} style={{ left: `${(Number(task.scheduledStartMinutes || 0) / 1440) * 100}%`, width: `${Math.max(1.2, (duration / 1440) * 100)}%` }} title={`${timeLabel(task.scheduledStartMinutes)} · ${duration} min`} aria-label={`Queue #${task.id}, ${timeLabel(task.scheduledStartMinutes)}, ${duration} minutes`} onClick={() => onOpen(task)} />; })}{personBlocks.map((block) => <i key={`block-${block.id}`} className={`m-day-bar is-time-block status-${block.status}`} style={{ left: `${(Number(block.scheduledStartMinutes || 0) / 1440) * 100}%`, width: `${Math.max(1.2, (Number(block.durationMinutes || 10) / 1440) * 100)}%` }} title={`${block.title || block.category} · ${timeLabel(block.scheduledStartMinutes)}`} />)}</div></div>; })}</div></section>;
}

function Avatar({ person }) {
  const src = assetUrl(person.avatarUrl || person.avatar_url);
  return src ? <img className="m-avatar" src={src} alt="" /> : <span className="m-avatar is-empty">{displayName(person.displayName || person.email).slice(0, 1)}</span>;
}
function QueueTaskCard({ task, onClick, compact = false, showDesigner = false }) {
  const { t } = usePrefs(); const post = task.post || {};
  return <button className={`m-task priority-${task.priority || 'medium'} status-${task.status}${compact ? ' is-compact' : ''}${task.isDraft ? ' is-draft' : ''}`} onClick={onClick}><Cover src={post.coverUrl || task.coverUrl} /><div><span className="m-task-meta"><i>{t(task.status) || task.status}</i>{task.isDraft ? <i>{t('pending')}</i> : null}</span><b>{post.title || post.ocrText || post.caption || `Queue #${task.id}`}</b><small>@{post.account || 'unassigned'} · {task.productionPoints} PP · {task.durationMinutes || Number(task.productionPoints || 1) * Number(task.minutesPerPP || 10)}m</small>{showDesigner ? <em>{displayName(task.designerEmail)}</em> : null}</div>{task.scheduledStartMinutes != null ? <time>{timeLabel(task.scheduledStartMinutes)}</time> : <ChevronRight size={18} />}</button>;
}

function QueueDetail({ task, coordinator, onAssign, onClose, onChanged, tell }) {
  const { t } = usePrefs(); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(''); const [requestOpen, setRequestOpen] = useState(false); const [closing, setClosing] = useState(false); const [link, setLink] = useState('');
  const run = async (action, body) => { setBusy(true); setNotice(''); try { await apiJson(`/api/dashboard/queue/v2/requests/${task.id}/${action}`, { method: 'POST', body }); tell(t('assignmentSent')); onChanged(); } catch (error) { setNotice(error.message); } finally { setBusy(false); } };
  const returnPool = () => runSubmit([{ id: task.id, status: 'pool', designerEmail: null, scheduledDate: null, scheduledStartMinutes: null, productionPoints: task.productionPoints, recommendedAccounts: task.recommendedAccounts || [] }]);
  const runSubmit = async (changes) => { setBusy(true); setNotice(''); try { await apiJson('/api/dashboard/queue/v2/submit', { method: 'POST', body: new URLSearchParams({ changes: JSON.stringify(changes) }) }); tell(t('assignmentSent')); onChanged(); } catch (error) { setNotice(error.message); } finally { setBusy(false); } };
  const post = task.post || {};
  return <Sheet title={`Queue #${task.id}`} onClose={onClose} wide><article className="m-task-detail"><Cover src={post.coverUrl || task.coverUrl} /><div className="m-detail-kicker"><span className={`m-priority priority-${task.priority}`}>{t(task.priority) || task.priority}</span><span>{t(task.status) || task.status}</span></div><h3>{post.title || post.ocrText || post.caption || `Queue #${task.id}`}</h3><p>{task.brief || post.caption}</p><div className="m-info-grid"><div><span>{t('designer')}</span><b>{task.designerEmail ? displayName(task.designerEmail) : '—'}</b></div><div><span>{t('date')}</span><b>{task.scheduledDate || '—'}</b></div><div><span>{t('time')}</span><b>{timeLabel(task.scheduledStartMinutes)}</b></div><div><span>PP</span><b>{task.productionPoints}</b></div></div>{task.recommendedAccounts?.length ? <div className="m-bubbles">{task.recommendedAccounts.map((account) => <span key={account}>@{account}</span>)}</div> : null}<Notice type="error">{notice}</Notice><div className="m-action-grid">{task.status === 'scheduled' && !coordinator ? <button className="m-primary" disabled={busy} onClick={() => run('start')}><Play size={16} />{t('start')}</button> : null}{task.status === 'in_progress' && !coordinator ? <button className="m-primary" disabled={busy} onClick={() => run('complete')}><CheckCircle2 size={16} />{t('markComplete')}</button> : null}{task.status === 'completed' && !coordinator ? <button className="m-primary" onClick={() => setClosing(true)}><Link2 size={16} />{t('completeClose')}</button> : null}{!coordinator && ['scheduled', 'in_progress', 'completed'].includes(task.status) ? <button className="m-secondary" onClick={() => setRequestOpen(true)}><TimerReset size={16} />{t('requestChange')}</button> : null}{coordinator && task.status !== 'closed' ? <button className="m-primary" onClick={onAssign}><CalendarDays size={16} />{task.designerEmail ? t('editAssignment') : t('assign')}</button> : null}{coordinator && task.status === 'scheduled' ? <button className="m-secondary" disabled={busy} onClick={returnPool}><ArrowLeft size={16} />{t('returnPool')}</button> : null}{post.permalink ? <a className="m-secondary" href={post.permalink} target="_blank" rel="noreferrer"><ExternalLink size={16} />Instagram</a> : null}</div>{closing ? <form className="m-form m-inline-form" onSubmit={(event) => { event.preventDefault(); run('close', new URLSearchParams({ final_permalink: link })); }}><label>{t('finalLink')}<input type="url" required value={link} onChange={(event) => setLink(event.target.value)} /></label><button className="m-primary" disabled={busy}>{t('completeClose')}</button></form> : null}{requestOpen ? <TaskRequestForm task={task} onClose={() => setRequestOpen(false)} onSent={() => { setRequestOpen(false); tell(t('requestSent')); }} /> : null}</article></Sheet>;
}

function AssignmentSheet({ task, data, onClose, onChanged }) {
  const { t } = usePrefs(); const users = data.schedulerUsers || data.designers || []; const now = new Date(); const rounded = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 10) * 10;
  const [form, setForm] = useState({ designer: task.designerEmail || users[0]?.email || '', date: task.scheduledDate || DAY(), time: task.scheduledStartMinutes ?? rounded, pps: task.productionPoints || 3, accounts: task.recommendedAccounts || [] }); const [previewed, setPreviewed] = useState(Boolean(task.isDraft)); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  const change = { id: task.id, status: 'scheduled', designerEmail: form.designer, scheduledDate: form.date, scheduledStartMinutes: Number(form.time), productionPoints: Number(form.pps), recommendedAccounts: form.accounts };
  const preview = async () => { setBusy(true); setNotice(''); try { await apiJson('/api/dashboard/queue/v2/drafts', { method: 'POST', body: new URLSearchParams({ changes: JSON.stringify([change]) }) }); setPreviewed(true); onChanged(t('temporaryShared')); } catch (error) { setNotice(error.message); } finally { setBusy(false); } };
  const submit = async () => { setBusy(true); setNotice(''); try { await apiJson('/api/dashboard/queue/v2/submit', { method: 'POST', body: new URLSearchParams({ changes: JSON.stringify([change]) }) }); onChanged(t('assignmentSent')); onClose(); } catch (error) { setNotice(error.message); } finally { setBusy(false); } };
  return <Sheet title={task.designerEmail ? t('editAssignment') : t('assign')} onClose={onClose}><form className="m-form" onSubmit={(event) => { event.preventDefault(); previewed ? submit() : preview(); }}><label>{t('designer')}<select required value={form.designer} onChange={(event) => { setForm({ ...form, designer: event.target.value }); setPreviewed(false); }}>{users.map((person) => <option key={person.email} value={person.email}>{person.displayName || displayName(person.email)}</option>)}</select></label><div className="m-form-pair"><label>{t('date')}<input type="date" required value={form.date} onChange={(event) => { setForm({ ...form, date: event.target.value }); setPreviewed(false); }} /></label><label>{t('time')}<input type="time" step="600" required value={timeLabel(form.time)} onChange={(event) => { const [h, m] = event.target.value.split(':').map(Number); setForm({ ...form, time: h * 60 + m }); setPreviewed(false); }} /></label></div><label>{t('productionPoints')}<input type="number" min="1" required value={form.pps} onChange={(event) => { setForm({ ...form, pps: event.target.value }); setPreviewed(false); }} /></label><fieldset><legend>{t('recommendedAccounts')}</legend><div className="m-check-grid">{(data.accounts || []).map((account) => <label key={account.handle}><input type="checkbox" checked={form.accounts.includes(account.handle)} onChange={() => { const accounts = form.accounts.includes(account.handle) ? form.accounts.filter((value) => value !== account.handle) : [...form.accounts, account.handle]; setForm({ ...form, accounts }); setPreviewed(false); }} /><span>@{account.handle}</span></label>)}</div></fieldset><Notice type="error">{notice}</Notice>{previewed ? <Notice>{t('temporaryShared')}</Notice> : null}<button className="m-primary" disabled={busy}>{busy ? t('loading') : previewed ? t('confirmAssignment') : t('previewAssignment')}</button></form></Sheet>;
}

function PickSheet({ items, onClose, onPicked }) {
  const { t } = usePrefs(); const sorted = [...items].sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2) || Number(b.hotMultiplier || 0) - Number(a.hotMultiplier || 0)); const [index, setIndex] = useState(0); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(''); const task = sorted[index];
  const pick = async () => { setBusy(true); try { await apiJson('/api/dashboard/queue/v2/pick', { method: 'POST', body: new URLSearchParams({ request_id: String(task.id) }) }); onPicked(); onClose(); } catch (error) { setNotice(error.message); setBusy(false); } };
  return <Sheet title={t('pick')} onClose={onClose}>{task ? <div className="m-stack"><QueueTaskCard task={task} /><Notice type="error">{notice}</Notice><div className="m-action-grid"><button className="m-secondary" onClick={() => setIndex((index + 1) % sorted.length)}>{t('next')}<ChevronRight size={16} /></button><button className="m-primary" disabled={busy} onClick={pick}><Check size={16} />{t('choose')}</button></div></div> : <Empty title={t('noPick')} />}</Sheet>;
}

function CreatePostSheet({ onClose, onCreated }) {
  const { t } = usePrefs(); const [form, setForm] = useState({ title: '', type: 'Image', pps: 3, priority: 'medium', tags: '', brief: '', notes: '' }); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  const submit = async (event) => { event.preventDefault(); setBusy(true); try { await apiJson('/api/dashboard/queue/v2/create', { method: 'POST', body: new URLSearchParams({ title: form.title, post_type: form.type, production_points: String(form.pps), priority: form.priority, tags: form.tags, brief: form.brief, notes: form.notes, references: '[]' }) }); onCreated(); onClose(); } catch (error) { setNotice(error.message); setBusy(false); } };
  return <Sheet title={t('createPost')} onClose={onClose}><form className="m-form" onSubmit={submit}><label>{t('title')}<input required maxLength="160" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label>{t('postType')}<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{['Image', 'Carousel', 'Reel', 'Promo', 'Story', 'Other'].map((value) => <option key={value}>{value}</option>)}</select></label><div className="m-form-pair"><label>{t('productionPoints')}<input type="number" min="1" value={form.pps} onChange={(event) => setForm({ ...form, pps: event.target.value })} /></label><label>{t('priority')}<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{['low', 'medium', 'high', 'urgent'].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></label></div><label>{t('tags')}<input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} /></label><label>{t('brief')}<textarea rows="3" value={form.brief} onChange={(event) => setForm({ ...form, brief: event.target.value })} /></label><label>{t('notes')}<textarea rows="2" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label><Notice type="error">{notice}</Notice><button className="m-primary" disabled={busy}>{busy ? t('loading') : t('create')}</button></form></Sheet>;
}

function TaskRequestForm({ task, onClose, onSent }) {
  const { t } = usePrefs(); const [type, setType] = useState('pp'); const [pps, setPps] = useState(task.productionPoints + 1); const [date, setDate] = useState(task.scheduledDate || DAY()); const [time, setTime] = useState(task.scheduledStartMinutes || 600); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  const submit = async (event) => { event.preventDefault(); setBusy(true); try { let path; let body; if (type === 'pp') { path = '/api/dashboard/queue/v2/tickets/pp-revision'; body = new URLSearchParams({ request_id: String(task.id), production_points: String(pps), reason }); } else if (type === 'cancel') { path = '/api/dashboard/queue/v2/tickets/cancellation'; body = new URLSearchParams({ request_id: String(task.id), reason }); } else { path = '/api/dashboard/queue/v2/tickets/move'; body = new URLSearchParams({ request_id: String(task.id), scheduled_date: date, scheduled_start_minutes: String(time), reason }); } await apiJson(path, { method: 'POST', body }); onSent(); } catch (error) { setNotice(error.message); setBusy(false); } };
  return <div className="m-nested-form"><button className="m-close-mini" onClick={onClose}><X size={14} /></button><form className="m-form" onSubmit={submit}><div className="m-segment"><button type="button" className={type === 'pp' ? 'is-on' : ''} onClick={() => setType('pp')}>{t('ppRevision')}</button><button type="button" className={type === 'move' ? 'is-on' : ''} onClick={() => setType('move')}>{t('move')}</button><button type="button" className={type === 'cancel' ? 'is-on' : ''} onClick={() => setType('cancel')}>{t('cancellation')}</button></div>{type === 'pp' ? <label>{t('newPPs')}<input type="number" min="1" value={pps} onChange={(event) => setPps(event.target.value)} /></label> : null}{type === 'move' ? <div className="m-form-pair"><label>{t('date')}<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>{t('time')}<input type="time" step="600" value={timeLabel(time)} onChange={(event) => { const [h, m] = event.target.value.split(':').map(Number); setTime(h * 60 + m); }} /></label></div> : null}<label>{t('reason')}<textarea rows="2" value={reason} onChange={(event) => setReason(event.target.value)} /></label><Notice type="error">{notice}</Notice><button className="m-primary" disabled={busy}>{t('submitRequest')}</button></form></div>;
}

function TicketsSheet({ coordinator, data, onClose, onChanged }) {
  const { t } = usePrefs(); const [tickets, setTickets] = useState([]); const [status, setStatus] = useState('pending'); const [loading, setLoading] = useState(true); const [notice, setNotice] = useState(''); const [blockOpen, setBlockOpen] = useState(false);
  const load = useCallback(() => { setLoading(true); apiJson('/api/dashboard/queue/v2/tickets').then((body) => setTickets(body.tickets || [])).catch((error) => setNotice(error.message)).finally(() => setLoading(false)); }, []); useEffect(() => { load(); }, [load]);
  const review = async (id, action) => { try { await apiJson(`/api/dashboard/queue/v2/tickets/${id}/review`, { method: 'POST', body: new URLSearchParams({ action }) }); load(); onChanged(); } catch (error) { setNotice(error.message); } };
  return <Sheet title={coordinator ? t('requestInbox') : t('sentRequests')} onClose={onClose} wide><div className="m-tab-scroll">{['pending', 'approved', 'rejected'].map((value) => <button className={status === value ? 'is-on' : ''} key={value} onClick={() => setStatus(value)}>{t(value)}</button>)}</div>{!coordinator ? <button className="m-secondary m-full" onClick={() => setBlockOpen(!blockOpen)}><Clock3 size={16} />{t('blockTime')}</button> : null}{blockOpen ? <TimeBlockForm data={data} onSent={() => { setBlockOpen(false); load(); onChanged(); }} /> : null}<Notice type="error">{notice}</Notice>{loading ? <Spinner label={t('loading')} /> : <div className="m-ticket-list">{tickets.filter((ticket) => ticket.status === status).map((ticket) => <article key={ticket.id}><header><span>{t(ticket.type === 'time_block' ? ticket.category || 'blockTime' : ticket.type) || ticket.type}</span><i className={`status-${ticket.status}`}>{t(ticket.status)}</i></header><b>{ticket.request?.post?.title || ticket.title || (ticket.requestId ? `Queue #${ticket.requestId}` : displayName(ticket.requesterEmail))}</b><p>{ticket.reason}</p><small>{displayName(ticket.requesterEmail)} · {ticket.scheduledDate || ''} {timeLabel(ticket.scheduledStartMinutes)}</small>{coordinator && ticket.status === 'pending' ? <footer><button onClick={() => review(ticket.id, 'reject')}>{t('reject')}</button><button className="is-approve" onClick={() => review(ticket.id, 'approve')}>{t('approve')}</button></footer> : null}</article>)}{!tickets.some((ticket) => ticket.status === status) ? <Empty title={t('noData')} /> : null}</div>}</Sheet>;
}

function TimeBlockForm({ data, onSent }) {
  const { t } = usePrefs(); const now = new Date(); const [form, setForm] = useState({ category: 'meeting', date: data.date || DAY(), time: Math.ceil((now.getHours() * 60 + now.getMinutes()) / 10) * 10, duration: 30, title: '', note: '' }); const [notice, setNotice] = useState('');
  const submit = async (event) => { event.preventDefault(); try { await apiJson('/api/dashboard/queue/v2/tickets/time-block', { method: 'POST', body: new URLSearchParams({ category: form.category, scheduled_date: form.date, scheduled_start_minutes: String(form.time), duration_minutes: String(form.duration), title: form.title, note: form.note }) }); onSent(); } catch (error) { setNotice(error.message); } };
  return <form className="m-form m-inline-form" onSubmit={submit}><label>{t('blockTime')}<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{['meeting', 'break', 'promo', 'focus'].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></label><label>{t('title')}<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><div className="m-form-pair"><label>{t('date')}<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label><label>{t('time')}<input type="time" step="600" value={timeLabel(form.time)} onChange={(event) => { const [h, m] = event.target.value.split(':').map(Number); setForm({ ...form, time: h * 60 + m }); }} /></label></div><label>{t('duration')}<input type="number" min="10" step="10" value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} /></label><label>{t('notes')}<textarea rows="2" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label><Notice type="error">{notice}</Notice><button className="m-primary">{t('submitRequest')}</button></form>;
}

function TrackerView() {
  const { t } = usePrefs(); const [data, setData] = useState(null); const [detail, setDetail] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(''); const [favorites, setFavorites] = useState(readTrackerFavorites);
  const load = useCallback(() => { setError(''); apiJson('/api/tracker/summary').then(setData).catch((err) => setError(err.message)); }, []); useEffect(() => { load(); }, [load]);
  const open = async (handle) => { setBusy(handle); try { setDetail(await apiJson(`/api/tracker/accounts/${encodeURIComponent(handle)}`)); } catch (err) { setError(err.message); } finally { setBusy(''); } };
  const refresh = async (handle) => { setBusy(handle); try { await apiJson(`/api/tracker/accounts/${encodeURIComponent(handle)}/refresh`, { method: 'POST' }); load(); if (detail?.handle === handle) setDetail(await apiJson(`/api/tracker/accounts/${encodeURIComponent(handle)}`)); } catch (err) { setError(err.message); } finally { setBusy(''); } };
  const toggleFavorite = (handle) => { const next = favorites.includes(handle) ? favorites.filter((value) => value !== handle) : [...favorites, handle]; setFavorites(next); writeTrackerFavorites(next); };
  if (!data && !error) return <Spinner label={t('loading')} />;
  const accounts = data?.accounts || [];
  const favoriteOrder = new Map(favorites.map((handle, index) => [handle, index]));
  const ordered = [...accounts].sort((a, b) => { const aFav = favoriteOrder.has(a.handle); const bFav = favoriteOrder.has(b.handle); if (aFav !== bFav) return aFav ? -1 : 1; if (aFav) return favoriteOrder.get(a.handle) - favoriteOrder.get(b.handle); return Number(b.followers || 0) - Number(a.followers || 0); });
  const totalFollowers = accounts.reduce((sum, account) => sum + Number(account.followers || 0), 0);
  const todayGrowth = accounts.reduce((sum, account) => sum + Number(account.delta_1d?.delta || 0), 0);
  return <div className="m-stack"><div className="m-metric-grid"><Metric label={t('trackedAccounts')} value={accounts.length} hint={`${favorites.length} ${t('favorites').toLowerCase()}`} /><Metric label={t('totalFollowers')} value={fmtExact(totalFollowers)} /><Metric label={t('todayGrowth')} value={signedExact(todayGrowth)} /></div><Notice type="error">{error}</Notice><section className="m-account-list">{ordered.map((account) => <article className="m-tracker-row" key={account.handle}><button className={`m-favorite${favorites.includes(account.handle) ? ' is-on' : ''}`} onClick={() => toggleFavorite(account.handle)} aria-label={`${t('favorites')} @${account.handle}`}><Star size={16} fill={favorites.includes(account.handle) ? 'currentColor' : 'none'} /></button><button className="m-tracker-open" onClick={() => open(account.handle)}><Cover src={`/api/dashboard/avatar/${account.handle}`} /><div><b>@{account.handle}</b><span>{account.label}</span></div><strong>{fmtExact(account.followers)}<small className={(account.delta_1d?.delta || 0) < 0 ? 'is-negative' : ''}>{account.delta_1d ? `${signedExact(account.delta_1d.delta)} ${t('todayFollowers')}` : `— ${t('todayFollowers')}`}</small></strong>{busy === account.handle ? <LoaderCircle className="spin" size={16} /> : <ChevronRight size={18} />}</button></article>)}</section>{detail ? <TrackerDetail data={detail} busy={busy === detail.handle} onRefresh={() => refresh(detail.handle)} onClose={() => setDetail(null)} /> : null}</div>;
}

function TrackerDetail({ data, busy, onRefresh, onClose }) {
  const { t } = usePrefs(); const history = data.followers_history || []; const points = history.slice(-30).map((item) => Number(item.followers || 0)); const min = Math.min(...points); const max = Math.max(...points); const path = points.length > 1 ? points.map((value, index) => `${index ? 'L' : 'M'} ${(index / (points.length - 1)) * 300} ${90 - ((value - min) / Math.max(1, max - min)) * 80}`).join(' ') : '';
  return <Sheet title={`@${data.handle}`} onClose={onClose} wide><div className="m-stack"><div className="m-detail-account"><Cover src={`/api/dashboard/avatar/${data.handle}`} /><div><h3>{data.label || data.handle}</h3><span>{fmtExact(points.at(-1))} {t('followers')}</span></div><button onClick={onRefresh} disabled={busy}><RefreshCw className={busy ? 'spin' : ''} size={17} /></button></div><div className="m-sparkline"><svg viewBox="0 0 300 100" role="img"><path d={path} /></svg></div><div className="m-section-head"><div><span>{t('history')}</span><h2>{history.length} snapshots</h2></div></div><div className="m-history-list"><div className="m-history-head"><span>{t('date')}</span><b>{t('followersGained')}</b><b>{t('total')}</b><small>{t('posts')}</small></div>{history.slice(-12).map((row) => <div key={row.date}><span>{dateLabel(row.date)}</span><b className={`m-history-growth${Number(row.followers_gained || 0) < 0 ? ' is-negative' : ''}`}>{row.followers_gained == null ? '—' : signedExact(row.followers_gained)}</b><b>{fmtExact(row.followers)}</b><small>{row.posts_that_day || 0}</small></div>)}</div></div></Sheet>;
}

const STOP_WORDS = new Set('the and for with this that from your you are was have has how what why who new best can use para por con que los las una un del como más este esta sus sin sobre hoy'.split(' '));
function InsightsView() {
  const { t } = usePrefs(); const [data, setData] = useState(null); const [error, setError] = useState(''); const [period, setPeriod] = useState('30'); const [group, setGroup] = useState('all');
  useEffect(() => { apiJson('/api/insights/posts').then(setData).catch((err) => setError(err.message)); }, []);
  const rows = useMemo(() => { if (!data) return []; const cutoff = period === 'all' ? 0 : Date.now() - Number(period) * 86400000; const allowed = new Set((data.accounts || []).filter((account) => group === 'all' || account.group === group).map((account) => account.handle)); return (data.posts || []).filter((post) => allowed.has(post.a) && (!cutoff || new Date(post.d).getTime() >= cutoff)); }, [data, period, group]);
  const analysis = useMemo(() => {
    const byAccount = new Map(); const byType = new Map(); const words = new Map(); let likes = 0; let comments = 0; let hot = 0;
    rows.forEach((post) => { likes += Number(post.l || 0); comments += Number(post.c || 0); hot += post.hot ? 1 : 0; const acc = byAccount.get(post.a) || { n: 0, likes: 0 }; acc.n += 1; acc.likes += Number(post.l || 0); byAccount.set(post.a, acc); const type = byType.get(post.t) || { n: 0, likes: 0 }; type.n += 1; type.likes += Number(post.l || 0); byType.set(post.t, type); String(post.ocr || '').toLowerCase().replace(/[^a-záéíóúñ0-9 ]/g, ' ').split(/\s+/).filter((word) => word.length > 3 && !STOP_WORDS.has(word)).forEach((word) => words.set(word, (words.get(word) || 0) + 1)); });
    const accounts = [...byAccount].map(([name, value]) => ({ name, ...value, avg: value.likes / value.n })).sort((a, b) => b.avg - a.avg).slice(0, 6); const types = [...byType].map(([name, value]) => ({ name, ...value, avg: value.likes / value.n })).sort((a, b) => b.avg - a.avg); const topics = [...words].sort((a, b) => b[1] - a[1]).slice(0, 16);
    return { likes, comments, hot, accounts, types, topics };
  }, [rows]);
  if (!data && !error) return <Spinner label={t('loading')} />;
  return <div className="m-stack"><div className="m-tab-scroll"><button className={period === '30' ? 'is-on' : ''} onClick={() => setPeriod('30')}>{t('last30')}</button><button className={period === '90' ? 'is-on' : ''} onClick={() => setPeriod('90')}>{t('last90')}</button><button className={period === 'all' ? 'is-on' : ''} onClick={() => setPeriod('all')}>{t('allTime')}</button></div><div className="m-chip-scroll">{['all', 'sentient', 'competitors'].map((value) => <button key={value} className={group === value ? 'is-on' : ''} onClick={() => setGroup(value)}>{t(value)}</button>)}</div><Notice type="error">{error}</Notice><div className="m-metric-grid"><Metric label={t('posts')} value={fmt(rows.length)} /><Metric label={t('likes')} value={fmt(analysis.likes)} /><Metric label="HOT" value={fmt(analysis.hot)} /></div><InsightBars title={t('topAccounts')} rows={analysis.accounts.map((item) => ({ label: `@${item.name}`, value: item.avg, meta: `${fmt(item.avg)} avg` }))} /><InsightBars title={t('formats')} rows={analysis.types.map((item) => ({ label: item.name, value: item.avg, meta: `${item.n} posts` }))} /><section className="m-topic-cloud"><div className="m-section-head"><div><span>{t('performance')}</span><h2>{t('topTopics')}</h2></div></div><div>{analysis.topics.map(([word, count], index) => <span key={word} style={{ fontSize: `${Math.max(12, 22 - index * .45)}px`, opacity: Math.max(.5, 1 - index * .025) }}>{word}<small>{count}</small></span>)}</div></section></div>;
}
function InsightBars({ title, rows }) { const max = Math.max(1, ...rows.map((row) => row.value || 0)); return <section className="m-insight-card"><h2>{title}</h2>{rows.length ? rows.map((row) => <div key={row.label}><header><b>{row.label}</b><span>{row.meta}</span></header><i><span style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }} /></i></div>) : <Empty title="No data" />}</section>; }

function SettingsView({ viewer }) {
  const { t } = usePrefs(); const allowed = viewer.is_admin || viewer.is_dev; const [tab, setTab] = useState('overview'); const [data, setData] = useState({}); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [editingUser, setEditingUser] = useState(null); const [editingAccount, setEditingAccount] = useState(null);
  const load = useCallback(async () => { if (!allowed) return; setLoading(true); setError(''); try { const [accounts, users, usage, disk, slack, ocr, report] = await Promise.all([apiJson('/api/admin/accounts'), apiJson('/api/admin/users'), apiJson('/api/admin/usage?days=30'), apiJson('/api/admin/disk-status'), apiJson('/api/admin/slack-status'), apiJson('/api/admin/ocr/status'), apiJson('/api/dashboard/queue/v2/admin-report')]); setData({ accounts: accounts.accounts || [], users: users.users || [], usage, disk, slack, ocr, report }); } catch (err) { setError(err.message); } finally { setLoading(false); } }, [allowed]); useEffect(() => { load(); }, [load]);
  if (!allowed) return <Empty icon={Shield} title={t('adminOnly')} />;
  const tabs = ['overview', 'accounts', 'users', 'usage', 'notifications', 'system', 'reports'];
  return <div className="m-stack"><div className="m-tab-scroll">{tabs.map((value) => <button key={value} className={tab === value ? 'is-on' : ''} onClick={() => setTab(value)}>{t(value)}</button>)}</div>{loading ? <Spinner label={t('loading')} /> : null}<Notice type="error">{error}</Notice>{!loading && tab === 'overview' ? <div className="m-command-grid"><Metric label={t('accounts')} value={data.accounts.length} /><Metric label={t('users')} value={data.users.length} /><Metric label={t('usage')} value={data.usage?.active_users_30d ?? '—'} hint="30d" /><Metric label={t('disk')} value={`${data.disk?.pct_used ?? '—'}%`} /><Metric label={t('approvals')} value={data.report?.totals?.scheduled?.count ?? 0} /><Metric label="OCR" value={data.ocr?.remaining ?? '—'} /></div> : null}{!loading && tab === 'accounts' ? <section className="m-settings-list">{data.accounts.map((account) => <button key={account.handle} onClick={() => setEditingAccount(account)}><Cover src={`/api/dashboard/avatar/${account.handle}`} /><div><b>@{account.handle}</b><span>{account.label} · {account.group}</span><small>{fmt(account.total_posts)} posts · {t('threshold')} {fmt(account.hot_threshold)}</small></div><i className={account.is_active ? 'is-active' : ''}>{account.is_active ? t('active') : t('inactive')}</i><ChevronRight size={17} /></button>)}</section> : null}{!loading && tab === 'users' ? <section className="m-settings-list">{data.users.map((user) => <button key={user.email} onClick={() => setEditingUser(user)}><Avatar person={{ ...user, avatarUrl: user.avatar_url }} /><div><b>{user.display_name || displayName(user.email)}</b><span>{user.email}</span><small>{user.operating_role || 'pd'}{user.is_admin ? ' · Admin' : ''}</small></div><ChevronRight size={18} /></button>)}</section> : null}{!loading && tab === 'usage' ? <UsagePanel data={data.usage} /> : null}{!loading && tab === 'notifications' ? <div className="m-stack"><div className="m-command-grid"><Metric label="Slack webhook" value={data.slack?.configured ? 'ON' : 'OFF'} /><Metric label="Groups" value={data.slack?.alert_groups || '—'} /><Metric label="Queue DMs" value="ON" /></div><CustomNotificationPanel configured={Boolean(data.slack?.configured)} /></div> : null}{!loading && tab === 'system' ? <div className="m-stack"><div className="m-command-grid"><Metric label={t('disk')} value={`${data.disk?.pct_used ?? '—'}%`} hint={`${fmt(data.disk?.free_mb)} MB free`} /><Metric label="OCR remaining" value={fmt(data.ocr?.remaining)} /><Metric label="OCR indexed" value={fmt(data.ocr?.with_text_total)} /></div><div className="m-progress"><span style={{ width: `${Math.min(100, data.disk?.pct_used || 0)}%` }} /></div></div> : null}{!loading && tab === 'reports' ? <ReportsPanel data={data.report} /> : null}{editingAccount ? <AccountEditSheet account={editingAccount} onClose={() => setEditingAccount(null)} onSaved={() => { setEditingAccount(null); load(); }} /> : null}{editingUser ? <UserEditSheet user={editingUser} onClose={() => setEditingUser(null)} onSaved={() => { setEditingUser(null); load(); }} /> : null}</div>;
}

function AccountEditSheet({ account, onClose, onSaved }) {
  const { t } = usePrefs(); const [form, setForm] = useState({ label: account.label || '', group: account.group || 'sentient', threshold: account.hot_threshold || 600 }); const [busy, setBusy] = useState(''); const [notice, setNotice] = useState('');
  const save = async (event) => { event.preventDefault(); setBusy('save'); setNotice(''); try { await apiJson(`/api/admin/accounts/${encodeURIComponent(account.handle)}/settings`, { method: 'POST', body: new URLSearchParams({ password: LEGACY_PASSWORD, label: form.label, group: form.group, hot_threshold: String(form.threshold) }) }); setNotice(t('accountSaved')); onSaved(); } catch (error) { setNotice(error.message); } finally { setBusy(''); } };
  const lifecycle = async () => { setBusy('lifecycle'); setNotice(''); try { await apiJson(`/api/admin/accounts/${encodeURIComponent(account.handle)}/${account.is_active ? 'deactivate' : 'activate'}`, { method: 'POST', body: new URLSearchParams({ password: LEGACY_PASSWORD }) }); onSaved(); } catch (error) { setNotice(error.message); setBusy(''); } };
  const refreshAvatar = async () => { setBusy('avatar'); setNotice(''); try { await apiJson(`/api/admin/accounts/${encodeURIComponent(account.handle)}/avatar`, { method: 'POST', body: new URLSearchParams({ password: LEGACY_PASSWORD }) }); setNotice(t('accountSaved')); } catch (error) { setNotice(error.message); } finally { setBusy(''); } };
  return <Sheet title={`@${account.handle}`} onClose={onClose}><form className="m-form" onSubmit={save}><div className="m-account-edit-head"><Cover src={`/api/dashboard/avatar/${account.handle}`} /><div><b>@{account.handle}</b><span>{fmt(account.total_posts)} posts</span></div><i className={account.is_active ? 'is-active' : ''}>{account.is_active ? t('active') : t('inactive')}</i></div><label>{t('displayName')}<input required value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></label><div className="m-form-pair"><label>{t('group')}<select value={form.group} onChange={(event) => setForm({ ...form, group: event.target.value })}><option value="sentient">Sentient</option><option value="competitors">{t('competitors')}</option></select></label><label>{t('threshold')}<input type="number" inputMode="numeric" min="1" required value={form.threshold} onChange={(event) => setForm({ ...form, threshold: event.target.value })} /></label></div><Notice type={notice === t('accountSaved') ? 'success' : 'error'}>{notice}</Notice><button className="m-primary" disabled={Boolean(busy)}>{busy === 'save' ? t('loading') : t('save')}</button><div className="m-action-grid"><button type="button" className="m-secondary" disabled={Boolean(busy)} onClick={refreshAvatar}><RefreshCw className={busy === 'avatar' ? 'spin' : ''} size={16} />{t('refreshAvatar')}</button>{!account.is_canonical && account.handle !== 'chatgptricks' ? <button type="button" className="m-secondary" disabled={Boolean(busy)} onClick={lifecycle}>{account.is_active ? t('deactivate') : t('activate')}</button> : null}</div></form></Sheet>;
}

function CustomNotificationPanel({ configured }) {
  const { t } = usePrefs(); const [title, setTitle] = useState(''); const [message, setMessage] = useState(''); const [imageFile, setImageFile] = useState(null); const [preview, setPreview] = useState(''); const [busy, setBusy] = useState(''); const [notice, setNotice] = useState('');
  useEffect(() => { if (!imageFile) { setPreview(''); return undefined; } const url = URL.createObjectURL(imageFile); setPreview(url); return () => URL.revokeObjectURL(url); }, [imageFile]);
  const submit = async (event) => { event.preventDefault(); setBusy('send'); setNotice(''); try { const body = new FormData(); body.set('password', LEGACY_PASSWORD); body.set('message', message.trim()); if (title.trim()) body.set('title', title.trim()); if (imageFile) body.set('image', imageFile); const result = await apiJson('/api/admin/slack-custom', { method: 'POST', body }); if (!result.sent) throw new Error('Slack did not confirm delivery.'); setTitle(''); setMessage(''); setImageFile(null); setNotice(t('alertSent')); } catch (error) { setNotice(error.message); } finally { setBusy(''); } };
  const sendTest = async () => { setBusy('test'); setNotice(''); try { const result = await apiJson('/api/admin/slack-test', { method: 'POST', body: new URLSearchParams({ password: LEGACY_PASSWORD }) }); if (!result.sent) throw new Error('Slack did not confirm delivery.'); setNotice(t('alertSent')); } catch (error) { setNotice(error.message); } finally { setBusy(''); } };
  return <section className="m-settings-card"><header><Megaphone size={18} /><div><h3>{t('customAlert')}</h3><p>Slack alert channel</p></div><button type="button" onClick={sendTest} disabled={!configured || Boolean(busy)}>{busy === 'test' ? t('loading') : t('sendTest')}</button></header><form className="m-form" onSubmit={submit}><input aria-label={t('alertTitle')} placeholder={t('alertTitle')} maxLength="120" value={title} onChange={(event) => setTitle(event.target.value)} /><textarea aria-label={t('alertMessage')} placeholder={t('alertMessage')} rows="4" maxLength="2900" required value={message} onChange={(event) => setMessage(event.target.value)} />{preview ? <div className="m-alert-preview"><img src={preview} alt="" /><button type="button" onClick={() => setImageFile(null)} aria-label={t('close')}><X size={15} /></button></div> : null}<label className="m-file-input"><ImagePlus size={16} /><span>{imageFile ? t('changeImage') : t('attachImage')}</span><input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(event) => setImageFile(event.target.files?.[0] || null)} /></label><Notice type={notice === t('alertSent') ? 'success' : 'error'}>{notice}</Notice><button className="m-primary" disabled={!configured || !message.trim() || Boolean(busy)}>{busy === 'send' ? t('loading') : t('sendAlert')}</button></form></section>;
}

function UsagePanel({ data }) { const { t } = usePrefs(); return <div className="m-stack"><div className="m-metric-grid"><Metric label="Active 7d" value={data?.active_users_7d ?? '—'} /><Metric label="Active 30d" value={data?.active_users_30d ?? '—'} /><Metric label="Events" value={fmt(data?.total_events_in_range)} /></div><section className="m-settings-list">{(data?.users || []).map((user) => <article key={user.email}><span className="m-avatar is-empty">{displayName(user.email).slice(0, 1)}</span><div><b>{displayName(user.email)}</b><span>{user.email}</span><small>{fmt(user.last_7d)} events · {user.active_days} days</small></div></article>)}</section></div>; }
function ReportsPanel({ data }) { const { t } = usePrefs(); const totals = data?.totals || {}; return <div className="m-stack"><div className="m-command-grid">{['pool', 'scheduled', 'in_progress', 'completed', 'closed', 'cancelled'].map((status) => <Metric key={status} label={t(status) || status} value={totals[status]?.count || 0} hint={`${totals[status]?.points || 0} PP`} />)}</div><section className="m-settings-list">{(data?.designers || []).map((person) => <article key={person.email}><span className="m-avatar is-empty">{displayName(person.email).slice(0, 1)}</span><div><b>{displayName(person.email)}</b><span>{person.activeRequests} active · {person.productionPoints} PP</span><small>{person.closedRequests} closed</small></div></article>)}</section></div>; }

function UserEditSheet({ user, onClose, onSaved }) {
  const { t } = usePrefs(); const roles = (() => { try { return Array.isArray(user.operating_roles) ? user.operating_roles : JSON.parse(user.operating_roles || '[]'); } catch { return [user.operating_role || 'pd']; } })(); const [form, setForm] = useState({ name: user.display_name || displayName(user.email), role: roles.find((role) => role !== 'pd' && role !== 'dev') || user.operating_role || 'pd', slack: user.slack_user_id || '', admin: Boolean(user.is_admin) }); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event) => { event.preventDefault(); setBusy(true); try { await apiJson('/api/admin/users', { method: 'POST', body: new URLSearchParams({ email: user.email, role: form.admin ? 'admin' : 'viewer', operating_role: form.role, is_admin: String(form.admin), slack_user_id: form.slack, display_name: form.name }) }); onSaved(); } catch (error) { setNotice(error.message); setBusy(false); } };
  return <Sheet title={t('users')} onClose={onClose}><form className="m-form" onSubmit={submit}><label>{t('displayName')}<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>{t('role')}<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{['pd', 'vc', 'sales', 'trainee'].map((role) => <option key={role} value={role}>{role.toUpperCase()}</option>)}</select></label><label>{t('slackId')}<input value={form.slack} onChange={(event) => setForm({ ...form, slack: event.target.value.toUpperCase() })} /></label><label className="m-toggle"><input type="checkbox" checked={form.admin} onChange={(event) => setForm({ ...form, admin: event.target.checked })} /><span>{t('admin')}</span></label><Notice type="error">{notice}</Notice><button className="m-primary" disabled={busy}>{busy ? t('loading') : t('save')}</button></form></Sheet>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><PrefsProvider><MobileApp /></PrefsProvider></React.StrictMode>);
