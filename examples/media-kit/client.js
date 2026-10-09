// Este archivo es público. Solo consulta el servidor del propio website.
const number = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 });
const dates = new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Costa_Rica' });
const element = (id) => document.getElementById(id);
const value = (metric, suffix = '') => typeof metric === 'number' && Number.isFinite(metric) ? `${number.format(metric)}${suffix}` : '—';
const captured = (timestamp) => {
  const date = timestamp ? new Date(timestamp) : null;
  return date && !Number.isNaN(date.valueOf()) ? dates.format(date) : 'sin fecha disponible';
};

async function read(path) {
  const response = await fetch(path);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message ?? 'No se pudieron cargar los datos.');
  return payload;
}

function metrics(target, items) {
  target.replaceChildren();
  for (const [label, metric] of items) {
    const group = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
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
    empty.textContent = 'Todavía no hay publicaciones disponibles.';
    target.append(empty);
    return;
  }
  for (const post of items) {
    const card = document.createElement('article');
    card.className = 'post';
    const caption = document.createElement('p');
    caption.textContent = post.caption || 'Publicación de Instagram';
    const detail = document.createElement('p');
    detail.className = 'muted';
    detail.textContent = `${value(post.likes)} likes · ${value(post.comments)} comentarios · ${value(post.video_views)} vistas`;
    const link = document.createElement('a');
    link.textContent = 'Ver publicación';
    card.append(caption, detail);
    if (instagramLink(link, post.permalink)) card.append(link);
    target.append(card);
  }
}

async function load() {
  try {
    const payload = await read('/api/media-kit');
    const report = payload.data;
    const account = report.account;
    const allTime = report.summary?.all_time;
    element('name').textContent = account.public_name || `@${account.handle}`;
    element('bio').textContent = account.public_bio || '';
    element('profile').hidden = !instagramLink(element('profile'), account.profile_url);
    metrics(element('metrics'), [
      ['Seguidores', value(account.followers)],
      ['Posts analizados', value(allTime?.post_count)],
      ['Likes promedio', value(allTime?.metrics?.likes?.average)],
      ['Comentarios promedio', value(allTime?.metrics?.comments?.average)],
      ['Vistas promedio', value(allTime?.metrics?.video_views?.average)],
      ['Engagement por seguidores', value(allTime?.engagement_rate_pct, '%')],
    ]);
    element('freshness').textContent = `Perfil capturado: ${captured(payload.data_updated_at?.profile)} · Métricas capturadas: ${captured(payload.data_updated_at?.engagement)}`;
    const recent = report.summary?.last_30_days;
    if (recent) {
      element('recent').hidden = false;
      metrics(element('recent-metrics'), [
        ['Posts analizados', value(recent.post_count)],
        ['Likes promedio', value(recent.metrics?.likes?.average)],
        ['Vistas promedio', value(recent.metrics?.video_views?.average)],
        ['Engagement por seguidores', value(recent.engagement_rate_pct, '%')],
      ]);
    }
    posts(element('best-posts'), report.best_posts?.all_time?.slice(0, 3).map((post) => ({
      ...post,
      caption: post.public_caption,
      ...post.metrics,
    })));
    element('content').hidden = false;
    element('status').textContent = '';
  } catch (error) {
    element('name').textContent = 'Media kit';
    element('status').textContent = error.message;
    return;
  }
  await Promise.all([
    read('/api/posts?limit=6').then((payload) => {
      posts(element('posts'), payload.data);
      element('posts-status').textContent = `${payload.data.length} de ${value(payload.pagination?.total)} publicaciones guardadas`;
    }).catch((error) => { element('posts-status').textContent = error.message; }),
    read('/api/followers?limit=12').then(async (firstPage) => {
      const total = firstPage.pagination?.total;
      const payload = Number.isSafeInteger(total) && total > 12
        ? await read(`/api/followers?limit=12&offset=${total - 12}`)
        : firstPage;
      element('history').replaceChildren();
      for (const sample of payload.data) {
        const row = document.createElement('tr');
        const date = document.createElement('td');
        const followers = document.createElement('td');
        date.textContent = sample.date;
        followers.textContent = value(sample.followers);
        row.append(date, followers);
        element('history').append(row);
      }
      element('history-status').textContent = payload.data.length ? 'Últimas 12 muestras disponibles, de la más antigua a la más reciente. Fechas en Costa Rica.' : 'Todavía no hay muestras guardadas.';
    }).catch((error) => { element('history-status').textContent = error.message; }),
  ]);
}

void load();
