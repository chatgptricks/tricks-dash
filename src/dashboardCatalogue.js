import { API_BASE, apiFetch } from './api';

const PAGE_SIZE = 6_000;
const PREVIEW_PAGE_SIZE = 250;

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

async function fetchRecentPreview(manifest, signal) {
  // Paint the newest cards before reading every historical page. The full
  // stable snapshot remains the authority for search and totals, but a user
  // should never stare at a blank Research screen while that background read
  // completes.
  const pages = await Promise.all(manifest.sources.map(async (entry) => {
    const source = String(entry?.source || '');
    if (!source) throw new DashboardCatalogueError('The post catalogue named an invalid source.');
    const params = new URLSearchParams({
      source,
      offset: '0',
      limit: String(PREVIEW_PAGE_SIZE),
      revision: manifest.revision,
    });
    const response = await apiFetch(`${API_BASE}/api/dashboard/posts/page?${params}`, { signal });
    const body = await jsonOrError(response);
    if (body?.revision !== manifest.revision || !Array.isArray(body?.posts)) {
      throw new DashboardCatalogueError('The post catalogue changed while loading.', 409);
    }
    return body.posts;
  }));
  const posts = dedupePosts(pages.flat()).sort((a, b) => {
    const left = Number(a?.timestamp) || Date.parse(a?.postDate) || 0;
    const right = Number(b?.timestamp) || Date.parse(b?.postDate) || 0;
    return right - left;
  });
  return { posts, summary: catalogueSummary(posts) };
}

async function fetchCompleteRevision(manifest, signal, onProgress) {
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

  const loadSource = async ({ source, upperBound }) => {
    const rows = [];
    let cursor = 0;
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

  // Each source advances one stable primary-key cursor. This avoids a burst
  // of COUNT/MAX scans and still guarantees that every row below its captured
  // high-water mark is loaded. Sources can safely progress in parallel.
  const rawPosts = (await Promise.all(sources.map(loadSource))).flat();
  const posts = dedupePosts(rawPosts);
  return {
    posts,
    summary: catalogueSummary(posts),
    rawTotal: rawPosts.length,
    revision: manifest.revision,
  };
}

export async function loadCompleteDashboardCatalogue({ signal, etag = '', onProgress, onPreview } = {}) {
  // A write can happen between page requests. Restart once from a newly read
  // manifest; returning a plausible but incomplete mix is never acceptable.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const manifestResult = await fetchManifest(signal, attempt === 0 ? etag : '');
    if (manifestResult.notModified) return manifestResult;
    try {
      if (onPreview) onPreview(await fetchRecentPreview(manifestResult.manifest, signal));
      const catalogue = await fetchCompleteRevision(manifestResult.manifest, signal, onProgress);
      return { ...catalogue, etag: manifestResult.etag };
    } catch (error) {
      if (!(error instanceof DashboardCatalogueError) || error.status !== 409 || attempt === 1) throw error;
    }
  }
  throw new DashboardCatalogueError('The complete post catalogue could not be verified.', 409);
}
