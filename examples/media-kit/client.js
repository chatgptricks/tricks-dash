// Public UI: requests this website's server, never a Dashboard secret.
const COPY = {
  en: {
    language: 'Language', mediaKit: 'Media kit', loadingProfile: 'Loading profile', loadingData: 'Loading data',
    viewProfile: 'View Instagram profile', audience: 'Audience and performance', performanceNote: 'Performance of the public posts analyzed',
    recent: 'Last 30 days', featured: 'Featured posts', recentPosts: 'Recent posts', history: 'Follower history',
    historyNote: 'Snapshots stored by the dashboard', date: 'Date', followers: 'Followers', analyzed: 'Posts analyzed',
    averageLikes: 'Average likes', averageComments: 'Average comments', averageViews: 'Average views', averagePlays: 'Average plays',
    engagement: 'Engagement rate by followers', growth: 'Follower growth · 30 days', likes: 'likes', comments: 'comments', views: 'views', plays: 'plays',
    noDate: 'No capture date available', emptyPosts: 'No posts are available yet.', post: 'Instagram post', viewPost: 'View post',
    profileCaptured: 'Profile captured', metricsCaptured: 'Metrics captured', capturedAt: 'Captured',
    postsCount: '{count} of {total} stored posts', historyStatus: 'Latest {count} stored snapshots, oldest to newest. Dates in Costa Rica.',
    emptyHistory: 'No snapshots have been stored yet.', error: 'The data could not be loaded. Please try again later.',
    401: 'The server API key expired, was revoked, or is invalid.', 403: 'This connection no longer has access to the dashboard.',
    404: 'The account or resource is unavailable for this connection.', 422: 'Check the request parameters.',
    429: 'The request limit was reached. Please try again later.', 502: 'The data service is temporarily unavailable.',
    504: 'The data service took too long to respond.',
  },
  es: {
    language: 'Idioma', mediaKit: 'Media kit', loadingProfile: 'Cargando perfil', loadingData: 'Consultando datos',
    viewProfile: 'Ver perfil de Instagram', audience: 'Audiencia y rendimiento', performanceNote: 'Rendimiento de los posts públicos analizados',
    recent: 'Últimos 30 días', featured: 'Posts destacados', recentPosts: 'Publicaciones recientes', history: 'Historial de seguidores',
    historyNote: 'Muestras guardadas por el dashboard', date: 'Fecha', followers: 'Seguidores', analyzed: 'Posts analizados',
    averageLikes: 'Likes promedio', averageComments: 'Comentarios promedio', averageViews: 'Vistas promedio', averagePlays: 'Reproducciones promedio',
    engagement: 'Interacciones por seguidores', growth: 'Crecimiento de seguidores · 30 días', likes: 'likes', comments: 'comentarios', views: 'vistas', plays: 'reproducciones',
    noDate: 'Sin fecha de captura disponible', emptyPosts: 'Todavía no hay publicaciones disponibles.', post: 'Publicación de Instagram', viewPost: 'Ver publicación',
    profileCaptured: 'Perfil capturado', metricsCaptured: 'Métricas capturadas', capturedAt: 'Captura',
    postsCount: '{count} de {total} publicaciones guardadas', historyStatus: 'Últimas {count} muestras guardadas, de la más antigua a la más reciente. Fechas en Costa Rica.',
    emptyHistory: 'Todavía no hay muestras guardadas.', error: 'No se pudieron cargar los datos. Intenta de nuevo más tarde.',
    401: 'La clave del servidor venció, fue revocada o no es válida.', 403: 'La conexión ya no tiene permiso para consultar el dashboard.',
    404: 'La cuenta o el recurso no están disponibles para esta conexión.', 422: 'Revisa los parámetros de la consulta.',
    429: 'Se alcanzó el límite de consultas. Intenta de nuevo más tarde.', 502: 'El servicio de datos no está disponible en este momento.',
    504: 'El servicio de datos tardó demasiado en responder.',
  },
};
const LANG_KEYS = ['sentient.lang', 'sentient.language'];
function readLanguage() {
  try {
    for (const key of LANG_KEYS) {
      const saved = localStorage.getItem(key);
      if (saved === 'en' || saved === 'es') return saved;
    }
  } catch { /* Storage is optional. */ }
  return (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
}
let language = readLanguage();
const state = { report: null, reportError: null, posts: null, postsError: null, history: null, historyError: null };
const element = (id) => document.getElementById(id);
const t = (key, values = {}) => String(COPY[language][key] ?? COPY[language].error).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
const locale = () => language === 'es' ? 'es-CR' : 'en-US';
const value = (metric, suffix = '') => typeof metric === 'number' && Number.isFinite(metric)
  ? `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(metric)}${suffix}` : '—';
const captured = (timestamp) => {
  const date = timestamp ? new Date(timestamp) : null;
  return date && !Number.isNaN(date.valueOf())
    ? new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Costa_Rica' }).format(date) : t('noDate');
};
const dayLabel = (day) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(day || '') ? new Date(`${day}T12:00:00-06:00`) : null;
  return date && !Number.isNaN(date.valueOf())
    ? new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeZone: 'America/Costa_Rica' }).format(date) : t('noDate');
};
const errorStatus = (error) => Number.isInteger(error?.status) ? error.status : 502;

async function read(path) {
  let response;
  try { response = await fetch(path, { headers: { 'Accept-Language': language } }); }
  catch { throw Object.assign(new Error('Data request failed'), { status: 502 }); }
  // Error bodies and provider diagnostics are never displayed to visitors.
  if (!response.ok) throw Object.assign(new Error('Data request failed'), { status: response.status });
  try { return await response.json(); }
  catch { throw Object.assign(new Error('Invalid data response'), { status: 502 }); }
}

function metrics(target, items) {
  target.replaceChildren();
  for (const [label, metric] of items) {
    const group = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = t(label);
    detail.textContent = metric;
    group.append(term, detail);
    target.append(group);
  }
}

function instagramLink(anchor, link) {
  try {
    const url = new URL(link);
    if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname)) return false;
    anchor.href = url.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    return true;
  } catch { return false; }
}

function posts(target, items) {
  target.replaceChildren();
  if (!items?.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = t('emptyPosts');
    target.append(empty);
    return;
  }
  for (const post of items) {
    const card = document.createElement('article');
    card.className = 'post';
    const caption = document.createElement('p');
    caption.textContent = post.caption || t('post');
    const detail = document.createElement('p');
    detail.className = 'muted';
    detail.textContent = `${value(post.likes)} ${t('likes')} · ${value(post.comments)} ${t('comments')} · ${value(post.video_views)} ${t('views')} · ${value(post.video_plays)} ${t('plays')}`;
    const link = document.createElement('a');
    link.textContent = t('viewPost');
    card.append(caption, detail);
    if (instagramLink(link, post.permalink)) card.append(link);
    target.append(card);
  }
}

function render() {
  document.documentElement.lang = language;
  document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll('[data-language]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.language === language)));
  document.title = t('mediaKit');
  element('name').textContent = state.reportError ? t('mediaKit') : t('loadingProfile');
  element('status').textContent = state.reportError ? t(state.reportError) : state.report ? '' : t('loadingData');
  element('content').hidden = !state.report;
  if (!state.report) return;
  const payload = state.report;
  const report = payload.data;
  const account = report.account;
  const allTime = report.summary?.all_time;
  element('name').textContent = account.public_name || `@${account.handle}`;
  document.title = `${account.public_name || `@${account.handle}`} · ${t('mediaKit')}`;
  element('bio').textContent = account.public_bio || '';
  element('profile').hidden = !instagramLink(element('profile'), account.profile_url);
  const cards = [
    ['followers', value(account.followers)], ['analyzed', value(allTime?.post_count)],
    ['averageLikes', value(allTime?.metrics?.likes?.average)], ['averageComments', value(allTime?.metrics?.comments?.average)],
    ['averageViews', value(allTime?.metrics?.video_views?.average)], ['averagePlays', value(allTime?.metrics?.video_plays?.average)],
    ['engagement', value(allTime?.engagement_rate_pct, '%')],
  ];
  if (typeof report.follower_growth?.['30d']?.pct === 'number') cards.push(['growth', value(report.follower_growth['30d'].pct, '%')]);
  metrics(element('metrics'), cards);
  element('freshness').textContent = `${t('profileCaptured')}: ${captured(payload.data_updated_at?.profile)} · ${t('metricsCaptured')}: ${captured(payload.data_updated_at?.engagement)}`;
  const recent = report.summary?.last_30_days;
  element('recent').hidden = !recent;
  if (recent) metrics(element('recent-metrics'), [
    ['analyzed', value(recent.post_count)], ['averageLikes', value(recent.metrics?.likes?.average)],
    ['averageViews', value(recent.metrics?.video_views?.average)], ['engagement', value(recent.engagement_rate_pct, '%')],
  ]);
  posts(element('best-posts'), report.best_posts?.all_time?.slice(0, 3).map((post) => ({ ...post, caption: post.public_caption, ...post.metrics })));
  if (state.posts) {
    posts(element('posts'), state.posts.data);
    element('posts-status').textContent = t('postsCount', { count: value(state.posts.data.length), total: value(state.posts.pagination?.total) });
  } else element('posts-status').textContent = state.postsError ? t(state.postsError) : t('loadingData');
  if (state.history) {
    element('history').replaceChildren();
    for (const sample of state.history.data) {
      const row = document.createElement('tr');
      const date = document.createElement('td');
      const followers = document.createElement('td');
      date.textContent = dayLabel(sample.date);
      date.title = `${t('capturedAt')}: ${captured(sample.captured_at)}`;
      followers.textContent = value(sample.followers);
      row.append(date, followers);
      element('history').append(row);
    }
    element('history-status').textContent = state.history.data.length
      ? t('historyStatus', { count: value(state.history.data.length) }) : t('emptyHistory');
  } else element('history-status').textContent = state.historyError ? t(state.historyError) : t('loadingData');
}

function setLanguage(next) {
  if (next !== 'en' && next !== 'es') return;
  language = next;
  try { LANG_KEYS.forEach((key) => localStorage.setItem(key, next)); } catch { /* Storage is optional. */ }
  render();
}
document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => setLanguage(button.dataset.language)));
window.addEventListener('storage', (event) => { if (LANG_KEYS.includes(event.key)) setLanguage(event.newValue); });
render();

async function load() {
  try {
    const payload = await read('/api/media-kit');
    if (!payload?.data?.account) throw Object.assign(new Error('Invalid account response'), { status: 502 });
    state.report = payload;
    render();
  } catch (error) { state.report = null; state.reportError = errorStatus(error); render(); return; }
  await Promise.all([
    read('/api/posts?limit=6').then((payload) => {
      if (!Array.isArray(payload.data)) throw Object.assign(new Error('Invalid posts response'), { status: 502 });
      state.posts = payload;
    }).catch((error) => { state.postsError = errorStatus(error); }).finally(render),
    read('/api/followers?limit=12').then(async (firstPage) => {
      const total = firstPage.pagination?.total;
      const payload = Number.isSafeInteger(total) && total > 12
        ? await read(`/api/followers?limit=12&offset=${total - 12}`) : firstPage;
      if (!Array.isArray(payload.data)) throw Object.assign(new Error('Invalid history response'), { status: 502 });
      state.history = payload;
    }).catch((error) => { state.historyError = errorStatus(error); }).finally(render),
  ]);
}
void load();
