import { API_BASE, apiFetch } from './api';

// A six-thousand-row page made a cold Research load wait on ten or more
// sequential request/JSON-parse cycles.  Twelve thousand stays well within
// the API's bounded-response budget while materially reducing that overhead.
const PAGE_SIZE = 12_000;
const FULL_SNAPSHOT_SHARDS = 4;
const MAX_PARALLEL_PAGE_STREAMS = 4;

export class DashboardCatalogueError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'DashboardCatalogueError';
    this.status = status;
  }
}

function dedupePosts(posts) {
  // The canonical history has a few legacy duplicate rows. Fetch every source
  // row so the transport can prove completion, then keep the same one-card per
  // account+shortcode projection that Research has always used.
  const seen = new Set();
  return posts.filter((post, index) => {
    const account = String(post?.account || '').trim().toLowerCase();
    const shortcode = String(post?.shortcode || '').trim();
    const key = shortcode ? `${account}:${shortcode}` : `${account}:row:${post?.rank ?? index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function postIdentity(post, index) {
  const account = String(post?.account || '').trim().toLowerCase();
  const shortcode = String(post?.shortcode || '').trim();
  return shortcode ? `${account}:${shortcode}` : `${account}:row:${post?.rank ?? index}`;
}

function normaliseSources(sources) {
  if (!Array.isArray(sources)) return null;
  const result = new Map();
  for (const entry of sources) {
    const source = String(entry?.source || '');
    const upperBound = Number(entry?.upperBound);
    if (!source || !Number.isSafeInteger(upperBound) || upperBound < 0) return null;
    result.set(source, upperBound);
  }
  return result;
}

async function jsonOrError(response) {
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      message = body?.detail || message;
    } catch {
      // A gateway timeout may not have a JSON error body.
    }
    throw new DashboardCatalogueError(message, response.status);
  }
  return response.json();
}

async function fetchManifest(signal, etag = '') {
  const headers = etag ? { 'If-None-Match': etag } : undefined;
  const response = await apiFetch(`${API_BASE}/api/dashboard/posts/manifest`, { signal, headers });
  if (response.status === 304) return { notModified: true };
  const manifest = await jsonOrError(response);
  if (!Array.isArray(manifest?.sources) || !manifest?.revision) {
    throw new DashboardCatalogueError('The post catalogue manifest was invalid.');
  }
  return { manifest, etag: response.headers.get('ETag') || `"${manifest.revision}"` };
}

function catalogueSummary(posts) {
  const knownLikes = posts.map((post) => Number(post?.likes)).filter((likes) => Number.isFinite(likes));
  const totalLikes = knownLikes.reduce((sum, likes) => sum + likes, 0);
  return {
    'Exported posts': posts.length,
    'Total likes': totalLikes,
    'Average likes': knownLikes.length ? Math.round(totalLikes / knownLikes.length) : 0,
  };
}

async function fetchRevision(manifest, signal, onProgress, startingBounds = new Map()) {
  const sources = manifest.sources.map((entry) => {
    const source = String(entry?.source || '');
    const upperBound = Math.max(0, Number(entry?.upperBound) || 0);
    if (!source || !Number.isSafeInteger(upperBound)) {
      throw new DashboardCatalogueError('The post catalogue named an invalid source.');
    }
    return { source, upperBound };
  });
  let received = 0;
  onProgress?.({ received, total: null });

  const loadSourceRange = async ({ source, afterId, upperBound }) => {
    const rows = [];
    let cursor = afterId;
    while (cursor < upperBound) {
      const params = new URLSearchParams({
        source,
        after_id: String(cursor),
        until_id: String(upperBound),
        limit: String(PAGE_SIZE),
        revision: manifest.revision,
      });
      const response = await apiFetch(`${API_BASE}/api/dashboard/posts/page?${params}`, { signal });
      const body = await jsonOrError(response);
      if (body?.revision !== manifest.revision || !Array.isArray(body?.posts)) {
        throw new DashboardCatalogueError('The post catalogue changed while loading.', 409);
      }
      const nextCursor = Number(body?.nextCursor);
      const done = body?.done === true;
      if (!Number.isSafeInteger(nextCursor) || nextCursor < cursor || nextCursor > upperBound || (!done && nextCursor <= cursor)) {
        throw new DashboardCatalogueError('The post catalogue changed while loading.', 409);
      }
      rows.push(...body.posts);
      received += body.posts.length;
      onProgress?.({ received, total: null });
      cursor = nextCursor;
      if (done) break;
    }
    return rows;
  };

  const ranges = sources.flatMap(({ source, upperBound }) => {
    const afterId = Math.min(upperBound, Math.max(0, startingBounds.get(source) || 0));
    if (afterId >= upperBound) return [];
    // A cold snapshot is immutable below its high-water mark, so independent
    // primary-key ranges can be read concurrently without either gaps or
    // duplicate posts. Deltas stay as one tiny stream; only the first full
    // library load needs this acceleration.
    const shardCount = afterId === 0 && upperBound > PAGE_SIZE ? FULL_SNAPSHOT_SHARDS : 1;
    const span = upperBound - afterId;
    return Array.from({ length: shardCount }, (_, index) => ({
      source,
      afterId: afterId + Math.floor((span * index) / shardCount),
      upperBound: afterId + Math.floor((span * (index + 1)) / shardCount),
    })).filter((range) => range.afterId < range.upperBound);
  });

  // Keep a deliberate ceiling: a few parallel streams use the upgraded API
  // efficiently, while many tabs cannot stampede Postgres or the browser.
  const rawPosts = [];
  let nextRange = 0;
  const worker = async () => {
    while (nextRange < ranges.length) {
      const rangeIndex = nextRange;
      nextRange += 1;
      rawPosts.push(...await loadSourceRange(ranges[rangeIndex]));
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL_PAGE_STREAMS, ranges.length) }, worker));
  const posts = dedupePosts(rawPosts);
  return {
    posts,
    summary: catalogueSummary(posts),
    rawTotal: rawPosts.length,
    revision: manifest.revision,
    sources: manifest.sources,
  };
}

function mergeCompleteCatalogue(cachedPosts, newerPosts) {
  const replacements = new Map(newerPosts.map((post, index) => [postIdentity(post, index), post]));
  const retained = cachedPosts.map((post, index) => replacements.get(postIdentity(post, index)) || post);
  const existing = new Set(retained.map(postIdentity));
  for (const post of newerPosts) {
    const key = postIdentity(post);
    if (!existing.has(key)) retained.push(post);
  }
  return dedupePosts(retained);
}

export async function loadCompleteDashboardCatalogue({ signal, etag = '', onProgress, cachedCatalogue = null } = {}) {
  // A persisted full library remains complete after an ID-bounded delta is
  // merged in. Normal reloads should not pull all historical posts again just
  // because the scheduler inserted one newer row.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const manifestResult = await fetchManifest(signal, attempt === 0 ? etag : '');
    if (manifestResult.notModified) return manifestResult;
    try {
      const cachedSources = normaliseSources(cachedCatalogue?.sources);
      const canDelta = Array.isArray(cachedCatalogue?.posts)
        && cachedCatalogue.posts.length > 0
        && cachedSources
        && manifestResult.manifest.sources.every((source) => cachedSources.has(String(source?.source || '')));
      const catalogue = await fetchRevision(
        manifestResult.manifest,
        signal,
        onProgress,
        canDelta ? cachedSources : new Map(),
      );
      if (!canDelta) return { ...catalogue, etag: manifestResult.etag };
      const posts = mergeCompleteCatalogue(cachedCatalogue.posts, catalogue.posts);
      return {
        ...catalogue,
        posts,
        summary: catalogueSummary(posts),
        etag: manifestResult.etag,
        delta: true,
      };
    } catch (error) {
      if (!(error instanceof DashboardCatalogueError) || error.status !== 409 || attempt === 1) throw error;
    }
  }
  throw new DashboardCatalogueError('The complete post catalogue could not be verified.', 409);
}
