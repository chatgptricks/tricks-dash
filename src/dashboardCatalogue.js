import { API_BASE, apiFetch } from './api';

const PAGE_SIZE = 1_000;
const MAX_CONCURRENT_PAGES = 4;

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

async function fetchCompleteRevision(manifest, signal, onProgress) {
  const jobs = [];
  for (const entry of manifest.sources) {
    const source = String(entry?.source || '');
    const total = Math.max(0, Number(entry?.total) || 0);
    if (!source) throw new DashboardCatalogueError('The post catalogue named an invalid source.');
    for (let offset = 0; offset < total; offset += PAGE_SIZE) jobs.push({ source, offset, total });
  }

  const pages = new Array(jobs.length);
  let next = 0;
  let received = 0;
  const totalRows = Math.max(0, Number(manifest.rawTotal) || jobs.reduce((sum, job) => sum + Math.min(PAGE_SIZE, job.total - job.offset), 0));
  onProgress?.({ received, total: totalRows });

  const worker = async () => {
    while (next < jobs.length) {
      const index = next;
      next += 1;
      const job = jobs[index];
      const params = new URLSearchParams({
        source: job.source,
        offset: String(job.offset),
        limit: String(PAGE_SIZE),
        revision: manifest.revision,
      });
      const response = await apiFetch(`${API_BASE}/api/dashboard/posts/page?${params}`, { signal });
      const body = await jsonOrError(response);
      if (body?.revision !== manifest.revision || !Array.isArray(body?.posts)) {
        throw new DashboardCatalogueError('The post catalogue changed while loading.', 409);
      }
      // A shrinking source while the revision is supposedly stable would make
      // a partial result look complete. Treat it as a changed catalogue and
      // retry from a fresh manifest instead.
      const expected = Math.min(PAGE_SIZE, Math.max(0, job.total - job.offset));
      if (body.posts.length !== expected) {
        throw new DashboardCatalogueError('The post catalogue changed while loading.', 409);
      }
      pages[index] = body.posts;
      received += body.posts.length;
      onProgress?.({ received, total: totalRows });
    }
  };

  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_PAGES, Math.max(1, jobs.length)) }, worker));
  const rawPosts = pages.flat();
  if (rawPosts.length !== totalRows) {
    throw new DashboardCatalogueError('The complete post catalogue could not be verified.', 409);
  }
  const posts = dedupePosts(rawPosts);
  const knownLikes = posts.map((post) => Number(post?.likes)).filter((likes) => Number.isFinite(likes));
  const totalLikes = knownLikes.reduce((sum, likes) => sum + likes, 0);
  return {
    posts,
    summary: {
      'Exported posts': posts.length,
      'Total likes': totalLikes,
      'Average likes': knownLikes.length ? Math.round(totalLikes / knownLikes.length) : 0,
    },
    rawTotal: totalRows,
    revision: manifest.revision,
  };
}

export async function loadCompleteDashboardCatalogue({ signal, etag = '', onProgress } = {}) {
  // A write can happen between page requests. Restart once from a newly read
  // manifest; returning a plausible but incomplete mix is never acceptable.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const manifestResult = await fetchManifest(signal, attempt === 0 ? etag : '');
    if (manifestResult.notModified) return manifestResult;
    try {
      const catalogue = await fetchCompleteRevision(manifestResult.manifest, signal, onProgress);
      return { ...catalogue, etag: manifestResult.etag };
    } catch (error) {
      if (!(error instanceof DashboardCatalogueError) || error.status !== 409 || attempt === 1) throw error;
    }
  }
  throw new DashboardCatalogueError('The complete post catalogue could not be verified.', 409);
}
