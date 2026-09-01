// Language and theme, shared by the React dashboard.
//
// Both live in localStorage rather than the URL: they're about who is looking,
// not about what is being looked at, so a shared ?tab=hot link shouldn't drag
// the sender's language along with it.

export const LANGS = ['en', 'es'];
export const THEMES = ['dark', 'light'];
export const ACCENT_PRESETS = Object.freeze({
  green: '#00ac80',
  lime: '#f5ff00',
  blue: '#60a5fa',
  coral: '#fb7185',
});
export const ACCENT_CHOICES = Object.keys(ACCENT_PRESETS);

const LANG_KEY = 'sentient.lang';
const THEME_KEY = 'sentient.theme';
const ACCENT_KEY = 'sentient.accent';

export function readLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch { /* private mode */ }
  // Falls back to the browser, so a Spanish-speaking teammate gets Spanish on
  // their first visit without having to find the toggle.
  return (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function readTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (THEMES.includes(saved)) return saved;
  } catch { /* private mode */ }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function normalizeHex(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!/^#[0-9a-f]{3,8}$/.test(raw)) return '';
  const short = raw.length === 4 || raw.length === 5;
  const body = raw.slice(1, short ? 4 : 7);
  if (body.length !== 3 && body.length !== 6) return '';
  return `#${body.length === 3 ? body.split('').map((digit) => `${digit}${digit}`).join('') : body}`;
}

export function normalizeAccent(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (ACCENT_PRESETS[raw]) return raw;
  return normalizeHex(raw) || 'lime';
}

export function accentHex(value) {
  const normalized = normalizeAccent(value);
  return ACCENT_PRESETS[normalized] || normalized;
}

function hexRgb(value) {
  const hex = accentHex(value).slice(1);
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

function luminance([red, green, blue]) {
  const channel = (value) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return (0.2126 * channel(red)) + (0.7152 * channel(green)) + (0.0722 * channel(blue));
}

function contrastRatio(first, second) {
  const [bright, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (bright + 0.05) / (dark + 0.05);
}

function readableAccent(hex, lightTheme) {
  let rgb = [0, 2, 4].map((offset) => parseInt(hex.slice(1 + offset, 3 + offset), 16));
  const surface = lightTheme ? [255, 255, 255] : [8, 8, 8];
  const target = lightTheme ? 0 : 255;
  while (contrastRatio(rgb, surface) < 4.5) {
    rgb = rgb.map((channel) => Math.round(channel + ((target - channel) * 0.12)));
  }
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function readAccent() {
  try {
    return normalizeAccent(localStorage.getItem(ACCENT_KEY));
  } catch { /* private mode */ }
  return 'lime';
}

export function applyAccent(value, { persist = true } = {}) {
  const normalized = normalizeAccent(value);
  const hex = accentHex(normalized);
  const rgb = hexRgb(normalized);
  const root = document.documentElement;
  const lightTheme = root.getAttribute('data-theme') === 'light';
  const textColor = readableAccent(hex, lightTheme);
  // The foreground on a solid accent must switch much sooner than the
  // foreground used on a dark surface. This is the WCAG contrast crossover.
  const inkColor = luminance(rgb) > 0.179 ? '#151515' : '#f5f8ff';
  root.setAttribute('data-accent', normalized);
  root.style.setProperty('--accent-rgb', rgb.join(', '));
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--accent-text', textColor);
  root.style.setProperty('--accent-ink', inkColor);
  root.style.setProperty('--accent-soft', `rgba(${rgb.join(', ')}, 0.15)`);
  if (persist) {
    try { localStorage.setItem(ACCENT_KEY, normalized); } catch { /* private mode */ }
  }
  return normalized;
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
  // Light mode intentionally darkens bright accents for readable labels and
  // borders. Re-apply the selected accent whenever the theme changes.
  applyAccent(readAccent(), { persist: false });
}

export function applyLang(lang) {
  document.documentElement.setAttribute('lang', lang);
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* private mode */ }
}

// ---------------------------------------------------------------------------
// Strings
//
// Keyed by the English text so an untranslated string still renders as usable
// English rather than a raw key like "filters.account" leaking into the UI.
// ---------------------------------------------------------------------------

const ES = {
  // header
  'Captions, songs, or text inside a cover': 'Textos, canciones o texto en la portada',
  'Search posts': 'Buscar posts',
  'Clear search': 'Limpiar búsqueda',
  'posts': 'posts',
  'of': 'de',
  'likes': 'likes',
  'avg': 'prom',
  'Tracker': 'Tracker',
  'Insights': 'Insights',
  'Settings': 'Ajustes',
  'Dashboard': 'Dashboard',
  'Queue': 'Queue',
  'Command center': 'Centro de mando',
  'Workspace settings': 'Ajustes del workspace',
  'Manage the people, accounts, operations, notifications, and production controls shared by every Sentient tool.': 'Administra las personas, cuentas, operaciones, notificaciones y controles de producción compartidos por todas las herramientas de Sentient.',
  'Overview': 'Resumen',
  'Accounts': 'Cuentas',
  'Users': 'Usuarios',
  'Usage': 'Uso',
  'Notifications': 'Notificaciones',
  'System': 'Sistema',
  'Reports': 'Reportes',
  'active sources': 'fuentes activas',
  'administrators': 'administradores',
  'Activity and adoption': 'Actividad y adopción',
  'Live': 'Activo',
  'Check': 'Revisar',
  'Slack delivery configured': 'Entrega por Slack configurada',
  'Slack status unavailable': 'Estado de Slack no disponible',
  'free': 'libres',
  'Diagnostics and maintenance': 'Diagnóstico y mantenimiento',
  'Assigned Queue posts': 'Posts asignados en Queue',
  'Shared control plane': 'Control compartido',
  'One source of truth': 'Una sola fuente de verdad',
  'Changes made here affect Dashboard, Tracker, Insights, and Queue. Operational controls no longer live in tool-specific admin panels.': 'Los cambios hechos aquí afectan Dashboard, Tracker, Insights y Queue. Los controles operativos ya no viven en paneles administrativos duplicados.',
  'Manage accounts': 'Administrar cuentas',
  'Refresh now': 'Actualizar ahora',
  'Refresh': 'Actualizar',
  'Refreshing…': 'Actualizando…',
  'Disk usage': 'Uso de disco',
  'Slack alerts': 'Alertas de Slack',
  'Sending…': 'Enviando…',
  'Send test alert': 'Enviar alerta de prueba',
  'Custom alert': 'Alerta manual',
  'Recent Apify runs': 'Ejecuciones recientes de Apify',
  'Cover OCR sweep': 'Barrido OCR de portadas',
  'Who can sign in': 'Quién puede iniciar sesión',
  'Display name': 'Nombre visible',
  'Email': 'Email',
  'Queue role': 'Rol de Queue',
  'Slack user ID': 'ID de usuario de Slack',
  'Admin (full Settings access)': 'Admin (acceso completo a Settings)',
  'Adding…': 'Agregando…',
  'Add': 'Agregar',
  'People with access': 'Personas con acceso',
  'Queue production report': 'Reporte de producción de Queue',
  'Designer workload': 'Carga por designer',
  'Assigned posts': 'Posts asignados',
  'Sign out': 'Cerrar sesión',
  'Account': 'Cuenta',
  'Follower growth per account': 'Crecimiento de seguidores por cuenta',
  'Aggregate analysis across all accounts': 'Análisis agregado de todas las cuentas',
  'Copy a link to this exact view': 'Copiar link a esta vista exacta',
  'Copy link to this view': 'Copiar link a esta vista',

  // filters
  'Type': 'Tipo',
  'Date': 'Fecha',
  'Engagement': 'Engagement',
  'Sort': 'Orden',
  'Filters': 'Filtros',
  'Clear': 'Limpiar',
  'Flags': 'Marcas',
  'Promo': 'Promo',
  'Hidden': 'Ocultos',
  'All': 'Todos',
  'All posts': 'Todos',
  'Carousel': 'Carrusel',
  'Video': 'Video',
  'Image': 'Imagen',
  'Range': 'Rango',
  'From': 'Desde',
  'To': 'Hasta',
  'All time': 'Todo el tiempo',
  'Last 24 hours': 'Últimas 24 horas',
  'Last 3 days': 'Últimos 3 días',
  'Last 7 days': 'Últimos 7 días',
  'Custom range': 'Rango personalizado',
  'Min likes': 'Mín. likes',
  'Min comments': 'Mín. comentarios',
  'Minimum likes': 'Likes mínimos',
  'Minimum comments': 'Comentarios mínimos',
  'Most liked': 'Más likes',
  'Most commented': 'Más comentados',
  'Newest': 'Más nuevos',
  'Oldest': 'Más viejos',
  'Hot rate': 'Tasa hot',
  'Search accounts': 'Buscar cuentas',
  'Select all': 'Seleccionar todo',
  'Add account': 'Agregar cuenta',
  'No accounts in this group yet.': 'Todavía no hay cuentas en este grupo.',
  'All accounts': 'Todas las cuentas',
  'No accounts selected': 'Ninguna cuenta seleccionada',
  'No accounts yet': 'Todavía no hay cuentas',

  // tabs
  'Sentient': 'Sentient',
  'Competitors': 'Competidores',
  'HOT': 'HOT',
  'Create a custom list of accounts': 'Crear una lista propia de cuentas',
  'Edit': 'Editar',
  'Viewing hidden': 'Viendo ocultos',

  // grid + rail
  'Caption': 'Texto',
  'Copy': 'Copiar',
  'Copied': 'Copiado',
  'Likes': 'Likes',
  'Comments': 'Comentarios',
  'Media': 'Medio',
  'comments': 'comentarios',
  'Download media': 'Descargar media',
  'Fetching media…': 'Buscando media…',
  'Downloading…': 'Descargando…',
  'Downloaded': 'Descargados',
  'Download all': 'Descargar todo',
  'Download selected': 'Descargar selección',
  'Download just this one': 'Descargar solo este',
  'Deselect all': 'Deseleccionar todo',
  'selected': 'seleccionados',
  'Select media': 'Seleccionar media',
  'Deselect media': 'Deseleccionar media',
  'Select media hint': 'Selecciona los archivos que quieras descargar',
  'No media found for this post.': 'No se encontró media para este post.',
  'Could not list the media': 'No se pudo listar la media',
  'Download failed': 'Falló la descarga',
  'Fetched via Apify': 'Obtenido vía Apify',
  'Close': 'Cerrar',
  'file': 'archivo',
  'files': 'archivos',
  'item': 'elemento',
  'items': 'elementos',
  'Load 60 more': 'Cargar 60 más',
  'Showing': 'Mostrando',
  'No posts match the current filters.': 'Ningún post coincide con los filtros.',
  'Clear filters': 'Limpiar filtros',
  'Original audio': 'Audio original',
  'Show historical': 'Ver históricos',
  'Hide historical': 'Ocultar históricos',
  'Instagram': 'Instagram',
  'Mark as promo': 'Marcar como promo',
  'Remove promo': 'Quitar promo',
  'Hide': 'Ocultar',
  'Unhide': 'Mostrar',
  'Reload': 'Recargar',

  // auth
  'Sign in with your Google account to continue.': 'Iniciá sesión con tu cuenta de Google para continuar.',
  'Sign in with Google': 'Iniciar sesión con Google',
  'Signing in…': 'Iniciando sesión…',
  'Sign-in failed. Try again.': 'Falló el inicio de sesión. Probá de nuevo.',
  'Loading the post library': 'Cargando la librería de posts',

  // settings menu (shared shape across Dashboard/Queue/Tracker/Insights)
  'Accent color': 'Color de acento',
  'Custom color': 'Color personalizado',
  'Custom': 'Personalizado',
  'Theme': 'Tema',
  'Dark': 'Oscuro',
  'Light': 'Claro',
  'Language': 'Idioma',
  'Signed in as': 'Sesión iniciada como',
  'Admin': 'Admin',
  'Open full settings': 'Abrir Settings completo',
  'Manage designer accounts': 'Gestionar cuentas de designers',
  'Loading users…': 'Cargando usuarios…',
  'No users available.': 'No hay usuarios disponibles.',
  'Could not update account ownership.': 'No se pudo actualizar la cuenta.',
  'Choose Sentient account': 'Elegir cuenta de Sentient',
  'Assign': 'Asignar',
  'Remove account': 'Quitar cuenta',
};

export function makeT(lang) {
  return function t(text) {
    if (lang !== 'es') return text;
    return ES[text] ?? text;
  };
}
