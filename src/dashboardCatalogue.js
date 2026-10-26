import { API_BASE, apiFetch } from './api';

// Keep individual requests short enough to complete under a busy API. Large
// pages can consume the entire read deadline before any cursor is saved.
const PAGE_SIZE = 2_000;
const FULL_SNAPSHOT_SHARDS = 16;
const MAX_PARALLEL_PAGE_STREAMS = 4;
const METRICS_PAGE_SIZE = 1_000;
const MAX_METRICS_PAGES = 5;

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

async function fetchRevision(manifest, signal, onProgress, startingBounds = new Map(), checkpoint = {}) {
  const sources = normaliseSources(manifest.sources);
  if (!sources) throw new DashboardCatalogueError('The post catalogue named an invalid source.');
  const key = JSON.stringify([manifest.revision, [...sources], [...startingBounds]]);
  if (checkpoint.current?.key !== key) {
    const ranges = [...sources].flatMap(([source, upperBound]) => {
      const afterId = Math.min(upperBound, Math.max(0, startingBounds.get(source) || 0));
      if (afterId >= upperBound) return [];
      // Sparse IDs make four equal ranges badly unbalanced. Smaller queued
      // ranges let free workers share dense history without adding requests
      // in flight; an empty sparse range needs only one lightweight probe.
      const shardCount = afterId === 0
        ? Math.min(FULL_SNAPSHOT_SHARDS, Math.ceil(upperBound / PAGE_SIZE)) : 1;
      const span = upperBound - afterId;
      return Array.from({ length: shardCount }, (_, index) => ({
        source,
        cursor: afterId + Math.floor((span * index) / shardCount),
        upperBound: afterId + Math.floor((span * (index + 1)) / shardCount),
        posts: [],
        done: false,
      }));
    });
    checkpoint.current = { key, ranges, received: 0 };
  }
  const progress = checkpoint.current;
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  const assertActive = () => {
    if (controller.signal.aborted) throw controller.signal.reason || new DOMException('Request aborted.', 'AbortError');
  };
  onProgress?.({ received: progress.received, total: null });
  const loadSourceRange = async (range) => {
    while (!range.done && range.cursor < range.upperBound) {
      assertActive();
      const params = new URLSearchParams({
        source: range.source,
        after_id: String(range.cursor),
        until_id: String(range.upperBound),
        limit: String(PAGE_SIZE),
        revision: manifest.revision,
      });
      const response = await apiFetch(`${API_BASE}/api/dashboard/posts/page?${params}`, { signal: controller.signal });
      assertActive();
      const body = await jsonOrError(response);
      // An aborted JSON parse may finish after the next retry has begun.
      // It must not append duplicate rows or advance that retry's cursor.
      assertActive();
      if (body?.revision !== manifest.revision || !Array.isArray(body?.posts)) {
        throw new DashboardCatalogueError('The post catalogue changed while loading.', 409);
      }
      const nextCursor = Number(body?.nextCursor);
      const done = body?.done === true;
      if (!Number.isSafeInteger(nextCursor) || nextCursor < range.cursor || nextCursor > range.upperBound || (!done && nextCursor <= range.cursor)) {
        throw new DashboardCatalogueError('The post catalogue changed while loading.', 409);
      }
      for (const post of body.posts) range.posts.push(post);
      range.cursor = nextCursor;
      range.done = done || nextCursor === range.upperBound;
      progress.received += body.posts.length;
      onProgress?.({ received: progress.received, total: null });
    }
  };

  let nextRange = 0;
  const pendingRanges = progress.ranges.filter(range => !range.done);
  const worker = async () => {
    while (nextRange < pendingRanges.length) {
      const range = pendingRanges[nextRange++];
      await loadSourceRange(range);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL_PAGE_STREAMS, pendingRanges.length) }, worker));
    assertActive();
  } catch (error) {
    // Stop siblings before a retry can reuse these range checkpoints. Every
    // completed page remains private to this view until all ranges finish.
    controller.abort(error);
    throw error;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
  const rawPosts = progress.ranges.flatMap(range => range.posts);
  const posts = dedupePosts(rawPosts);
  checkpoint.current = null;
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
  const storedCursor = catalogue.metricsCursor;
  let cursor = typeof storedCursor?.at === 'string' && typeof storedCursor?.code === 'string'
    ? { at: storedCursor.at, code: storedCursor.code }
    : { at: catalogue.metricsAt || '', code: '' };
  const updates = new Map();
  const collaborationUpdates = new Map();
  let hasMore = true;
  let pages = 0;
  // A new browser may need years of stored observations. Publish and retain
  // bounded progress instead of replaying that entire history in one read.
  while (hasMore && pages < MAX_METRICS_PAGES) {
    const params = new URLSearchParams({ after_at: cursor.at, after_code: cursor.code, limit: String(METRICS_PAGE_SIZE) });
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
    pages += 1;
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
  // Observations use second-resolution job timestamps, and another account's
  // rows can commit later in that same second. Exact codes resume a pending
  // batch; after completion, reread timestamp ties on the next ordinary poll.
  const progress = {
    metricsAt: cursor.at,
    metricsCursor: hasMore ? cursor : { at: cursor.at, code: '' },
    metricsPending: hasMore,
  };
  if (unchanged && !changed) return { notModified: true, ...progress };
  // A no-op metric batch should only advance its cursor. Keep the complete
  // snapshot identities so the UI does not normalize the entire history a
  // second time immediately after first paint.
  return {
    ...catalogue,
    posts: changed ? posts : catalogue.posts,
    ...progress,
    summary: changed ? catalogueSummary(posts) : catalogue.summary,
  };
}

export async function loadCompleteDashboardCatalogue({ signal, etag = '', onProgress, onSnapshot, cachedCatalogue = null, checkpoint = {} } = {}) {
  // A persisted full library remains complete after an ID-bounded delta is
  // merged in. Normal reloads should not pull all historical posts again just
  // because the scheduler inserted one newer row.
  // Older persisted libraries have no coauthor projection. Refill them once,
  // including existing IDs, before resuming conditional and append-only reads.
  const collaborationReady = hasCollaborationMetadata(cachedCatalogue);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const manifestResult = await fetchManifest(signal, attempt === 0 && collaborationReady ? etag : '');
    if (manifestResult.notModified) {
      checkpoint.current = null;
      return refreshCatalogueMetrics({ ...cachedCatalogue, etag }, signal, true);
    }
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
        checkpoint,
      );
      const posts = canDelta ? mergeCompleteCatalogue(cachedCatalogue.posts, catalogue.posts) : catalogue.posts;
      const snapshot = {
        ...catalogue,
        posts,
        summary: canDelta ? catalogueSummary(posts) : catalogue.summary,
        etag: manifestResult.etag,
        ...(canDelta ? { delta: true } : {}),
        metricsAt: cachedCatalogue?.metricsAt,
        metricsCursor: cachedCatalogue?.metricsCursor,
      };
      // Source pages already contain the stored likes and collaboration
      // projection. A verified complete library is usable while older metric
      // observations catch up independently; never publish a partial page.
      onSnapshot?.(snapshot);
      return refreshCatalogueMetrics(snapshot, signal);
    } catch (error) {
      if (error instanceof DashboardCatalogueError && [401, 403, 409].includes(error.status)) checkpoint.current = null;
      if (!(error instanceof DashboardCatalogueError) || error.status !== 409 || attempt === 1) throw error;
    }
  }
  throw new DashboardCatalogueError('The complete post catalogue could not be verified.', 409);
}
