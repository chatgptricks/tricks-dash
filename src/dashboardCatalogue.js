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

function hasCollaborationMetadata(catalogue) {
  return Array.isArray(catalogue?.posts) && catalogue.posts.length > 0
    && catalogue.posts.every(post => Object.hasOwn(post, 'isCollab')
      && (post.isCollab === null || typeof post.isCollab === 'boolean')
      && Array.isArray(post.collaborators));
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
    projectionGeneration: Number(manifest.projectionGeneration) || 0,
    sources: manifest.sources,
    metricsAvailable: Boolean(manifest.metricsAvailable),
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

async function refreshCatalogueMetrics(catalogue, signal, unchanged = false) {
  if (!catalogue.metricsAvailable || !Array.isArray(catalogue.posts)) return unchanged ? { notModified: true } : catalogue;
  let cursor = { at: catalogue.metricsAt || '', code: '' };
  const updates = new Map();
  const collaborationUpdates = new Map();
  let hasMore = true;
  while (hasMore) {
    const params = new URLSearchParams({ after_at: cursor.at, after_code: cursor.code });
    const response = await apiFetch(`${API_BASE}/api/dashboard/posts/metrics?${params}`, { signal });
    // Safe while frontend and API deployments propagate independently.
    if (response.status === 404) return unchanged ? { notModified: true } : catalogue;
    const data = await jsonOrError(response);
    if (!Array.isArray(data.updates) || !data.cursor || typeof data.cursor.at !== 'string' || typeof data.cursor.code !== 'string') {
      throw new DashboardCatalogueError('The metric update stream was invalid.');
    }
    for (const item of data.updates) updates.set(item.shortcode, item);
    for (const item of data.collaborationUpdates || []) {
      if (!item.account || !item.shortcode || !Array.isArray(item.collaborators)) continue;
      collaborationUpdates.set(postIdentity(item), {
        isCollab: typeof item.isCollab === 'boolean' ? item.isCollab : null,
        collaborators: item.collaborators,
      });
    }
    if (data.hasMore && data.cursor.at === cursor.at && data.cursor.code === cursor.code) {
      throw new DashboardCatalogueError('The metric update stream did not advance.');
    }
    cursor = data.cursor;
    hasMore = Boolean(data.hasMore);
  }
  let changed = false;
  const posts = catalogue.posts.map((post, index) => {
    const patch = updates.get(post.shortcode);
    const collaboration = collaborationUpdates.get(postIdentity(post, index));
    if (!patch && !collaboration) return post;
    const metrics = patch ? { likes: patch.likes, comments: patch.comments ?? post.comments, likesUpdatedAt: patch.likesUpdatedAt } : {};
    const metricsChanged = patch && (post.likes !== metrics.likes || post.comments !== metrics.comments || post.likesUpdatedAt !== metrics.likesUpdatedAt);
    const collaborationChanged = collaboration && (post.isCollab !== collaboration.isCollab
      || JSON.stringify(post.collaborators) !== JSON.stringify(collaboration.collaborators));
    if (!metricsChanged && !collaborationChanged) return post;
    changed = true;
    return { ...post, ...metrics, ...collaboration };
  });
  if (unchanged && !changed) return { notModified: true, metricsAt: cursor.at };
  return { ...catalogue, posts, metricsAt: cursor.at, summary: catalogueSummary(posts) };
}

export async function loadCompleteDashboardCatalogue({ signal, etag = '', onProgress, cachedCatalogue = null } = {}) {
  // A persisted full library remains complete after an ID-bounded delta is
  // merged in. Normal reloads should not pull all historical posts again just
  // because the scheduler inserted one newer row.
  // Older persisted libraries have no coauthor projection. Refill them once,
  // including existing IDs, before resuming conditional and append-only reads.
  const collaborationReady = hasCollaborationMetadata(cachedCatalogue);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const manifestResult = await fetchManifest(signal, attempt === 0 && collaborationReady ? etag : '');
    if (manifestResult.notModified) return refreshCatalogueMetrics({ ...cachedCatalogue, etag }, signal, true);
    try {
      const cachedSources = normaliseSources(cachedCatalogue?.sources);
      const currentSources = normaliseSources(manifestResult.manifest.sources);
      if (!currentSources) throw new DashboardCatalogueError('The post catalogue named an invalid source.');
      const canDelta = collaborationReady && Array.isArray(cachedCatalogue?.posts)
        && cachedCatalogue.posts.length > 0
        && cachedSources
        // Metadata refreshes can change historical rows while ingestion adds
        // newer IDs. Such a generation must replace the full projection.
        && (Number(cachedCatalogue.projectionGeneration) || 0) === (Number(manifestResult.manifest.projectionGeneration) || 0)
        && currentSources.size > 0
        && currentSources.size === cachedSources.size
        // A reset/restore or removed source is not an append-only delta. A
        // full read must replace the previous snapshot and remove stale rows.
        && [...currentSources].every(([source, upperBound]) => cachedSources.has(source) && upperBound >= cachedSources.get(source))
        // A changed revision without new IDs cannot be satisfied by an empty
        // delta: it may represent updated decorations or a server generation.
        && [...currentSources].some(([source, upperBound]) => upperBound > cachedSources.get(source));
      const catalogue = await fetchRevision(
        manifestResult.manifest,
        signal,
        onProgress,
        canDelta ? cachedSources : new Map(),
      );
      if (!canDelta) return refreshCatalogueMetrics({ ...catalogue, etag: manifestResult.etag, metricsAt: cachedCatalogue?.metricsAt }, signal);
      const posts = mergeCompleteCatalogue(cachedCatalogue.posts, catalogue.posts);
      return refreshCatalogueMetrics({
        ...catalogue,
        posts,
        summary: catalogueSummary(posts),
        etag: manifestResult.etag,
        delta: true,
        metricsAt: cachedCatalogue?.metricsAt,
      }, signal);
    } catch (error) {
      if (!(error instanceof DashboardCatalogueError) || error.status !== 409 || attempt === 1) throw error;
    }
  }
  throw new DashboardCatalogueError('The complete post catalogue could not be verified.', 409);
}
