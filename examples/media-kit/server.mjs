import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const DEFAULT_BASE = 'https://cortex-api-db2e.onrender.com/api/v1';
const FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/client.js', ['client.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);
const ROUTES = new Map([
  ['/api/media-kit', 'media-kit'],
  ['/api/posts', 'posts'],
  ['/api/followers', 'followers/history'],
]);
const STATUS_MESSAGES = {
  401: 'La clave del servidor venció, fue revocada o no es válida.',
  403: 'La conexión ya no tiene permiso para consultar el dashboard.',
  404: 'La cuenta o el recurso no están disponibles para esta conexión.',
  422: 'Revisa los parámetros de la consulta.',
  429: 'Se alcanzó el límite de consultas. Intenta de nuevo más tarde.',
  502: 'El servicio de datos no está disponible en este momento.',
  504: 'El servicio de datos tardó demasiado en responder.',
};

function inputError(message) {
  return Object.assign(new Error(message), { status: 422 });
}

function dateValue(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw inputError('Usa fechas YYYY-MM-DD.');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw inputError('La fecha no existe.');
  }
  return value;
}

function queryFor(url, path) {
  if (url.search.length > 512) throw inputError('La consulta es demasiado larga.');
  const allowed = path === '/api/media-kit' ? [] : ['limit', 'offset', 'from', 'to'];
  if (path === '/api/posts') allowed.push('is_promo');
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) {
      throw inputError('Parámetro desconocido o repetido.');
    }
  }
  const query = new URLSearchParams();
  if (!allowed.length) return query;
  for (const [key, fallback, min, max] of [['limit', '20', 1, 100], ['offset', '0', 0, 100000]]) {
    const raw = url.searchParams.get(key) ?? fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
      throw inputError(`${key} debe ser un entero entre ${min} y ${max}.`);
    }
    query.set(key, String(value));
  }
  for (const key of ['from', 'to']) {
    if (url.searchParams.has(key)) query.set(key, dateValue(url.searchParams.get(key)));
  }
  if (query.has('from') && query.has('to') && query.get('from') > query.get('to')) {
    throw inputError('from debe ser anterior o igual a to.');
  }
  if (url.searchParams.has('is_promo')) {
    const value = url.searchParams.get('is_promo');
    if (!['true', 'false'].includes(value)) throw inputError('is_promo debe ser true o false.');
    query.set('is_promo', value);
  }
  return query;
}

async function boundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty response');
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) throw new Error('Response too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (payload?.schema_version !== '1.0' || !Object.hasOwn(payload, 'data')) {
    throw new Error('Unsupported response');
  }
  return payload;
}

/** A fixed public projection of ONE account. Configuration never comes from visitors. */
export function createMediaKitServer({
  apiKey,
  account,
  baseUrl = DEFAULT_BASE,
  cacheTtlMs = 300000,
  timeoutMs = 10000,
  now = Date.now,
  upstreamBudget = 50,
} = {}) {
  if (!apiKey?.startsWith('sad_api_') || /\s/.test(apiKey) || apiKey.length < 16) {
    throw new Error('Configura SENTIENT_DASH_API_KEY con la clave del dashboard.');
  }
  if (!/^[a-z0-9_.]{1,30}$/i.test(account ?? '')) {
    throw new Error('Configura SENTIENT_DASH_ACCOUNT sin @.');
  }
  const base = new URL(baseUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !(local && base.protocol === 'http:')) || base.username || base.password || base.search || base.hash) {
    throw new Error('El origen de datos debe ser una URL HTTPS de confianza.');
  }
  base.pathname = `${base.pathname.replace(/\/$/, '')}/`;
  const cache = new Map();
  const inflight = new Map();
  let budgetStart = now();
  let budgetUsed = 0;
  const failure = (status, retryAfter) => ({
    status,
    retryAfter,
    payload: { error: { code: `HTTP_${status}`, message: STATUS_MESSAGES[status] } },
  });

  async function load(resource, query) {
    const suffix = query.size ? `?${query}` : '';
    const key = `${resource}${suffix}`;
    const cached = cache.get(key);
    if (cached && cached.until > now()) return { ...cached.result, cacheState: 'HIT' };
    if (inflight.has(key)) return { ...await inflight.get(key), cacheState: 'COALESCED' };
    const pending = (async () => {
      if (now() - budgetStart >= 60000) {
        budgetStart = now();
        budgetUsed = 0;
      }
      if (budgetUsed >= upstreamBudget) {
        return failure(429, Math.max(1, Math.ceil((60000 - (now() - budgetStart)) / 1000)));
      }
      budgetUsed += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const target = new URL(`accounts/${encodeURIComponent(account.toLowerCase())}/${resource}${suffix}`, base);
        const response = await fetch(target, {
          headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
          signal: controller.signal,
          redirect: 'error',
        });
        if (!response.ok) {
          await response.body?.cancel();
          const status = [401, 403, 404, 422, 429].includes(response.status) ? response.status : 502;
          const retry = response.headers.get('retry-after');
          const retryAfter = status === 429 && /^\d{1,6}$/.test(retry ?? '') ? Number(retry) : status === 429 ? 60 : undefined;
          return failure(status, retryAfter);
        }
        return { status: 200, payload: await boundedJson(response) };
      } catch {
        return failure(controller.signal.aborted ? 504 : 502);
      } finally {
        clearTimeout(timer);
      }
    })();
    inflight.set(key, pending);
    try {
      const result = await pending;
      // Cache failures briefly too, so visitor reloads cannot hammer a failed key.
      cache.delete(key);
      while (cache.size >= 64) cache.delete(cache.keys().next().value);
      cache.set(key, { until: now() + (result.status === 200 ? cacheTtlMs : 10000), result });
      return { ...result, cacheState: 'MISS' };
    } finally {
      inflight.delete(key);
    }
  }

  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");
    function json(status, payload, headers = {}) {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
      response.end(JSON.stringify(payload));
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      return json(405, { error: { message: 'Usa GET.' } });
    }
    try {
      const url = new URL(request.url, 'http://media-kit.local');
      if (FILES.has(url.pathname)) {
        const [filename, contentType] = FILES.get(url.pathname);
        const content = await readFile(new URL(filename, import.meta.url));
        response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
        return response.end(request.method === 'HEAD' ? undefined : content);
      }
      if (!ROUTES.has(url.pathname)) return json(404, { error: { message: 'Ruta no disponible.' } });
      const query = queryFor(url, url.pathname);
      const result = await load(ROUTES.get(url.pathname), query);
      const headers = { 'X-Data-Cache': result.cacheState };
      if (result.retryAfter !== undefined) headers['Retry-After'] = String(result.retryAfter);
      if (request.method === 'HEAD') {
        response.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
        return response.end();
      }
      return json(result.status, result.payload, headers);
    } catch (error) {
      return json(error.status === 422 ? 422 : 500, {
        error: { message: error.status === 422 ? error.message : 'No se pudo procesar la consulta.' },
      });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PORT no es válido.');
  const server = createMediaKitServer({
    apiKey: process.env.SENTIENT_DASH_API_KEY,
    account: process.env.SENTIENT_DASH_ACCOUNT,
    baseUrl: process.env.SENTIENT_DASH_API_BASE ?? DEFAULT_BASE,
  });
  server.listen(port, '0.0.0.0', () => console.log(`Media kit disponible en http://localhost:${port}`));
}
