import fs from 'node:fs';
import path from 'node:path';

export const OCR_CACHE_VERSION = 1;
export const DEFAULT_OCR_CACHE_PATH = path.resolve('outputs/ocr-cache.json');

export function clampInteger(value, fallback, min = 1) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return parsed;
}

export function normalizeOcrText(value) {
  return String(value ?? '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function getPostCacheKey(post) {
  const shortcode = String(post.shortcode ?? '').trim();
  if (shortcode) return `shortcode:${shortcode}`;

  const rank = Number(post.rank ?? 0);
  if (Number.isFinite(rank) && rank > 0) return `rank:${rank}`;

  const coverFile = String(post.coverFile ?? '').trim();
  if (coverFile) return `file:${path.resolve(coverFile)}`;

  const coverUrl = String(post.coverUrl ?? '').trim();
  if (coverUrl) return `url:${coverUrl}`;

  return 'unknown';
}

export function getImageFingerprint(post) {
  const coverFile = String(post.coverFile ?? '').trim();
  if (coverFile && fs.existsSync(coverFile)) {
    const stats = fs.statSync(coverFile);
    return `file:${path.resolve(coverFile)}:${stats.size}:${Math.round(stats.mtimeMs)}`;
  }

  const coverUrl = String(post.coverUrl ?? '').trim();
  if (coverUrl) return `url:${coverUrl}`;

  return 'missing';
}

export function readOcrCache(cachePath = DEFAULT_OCR_CACHE_PATH) {
  if (!fs.existsSync(cachePath)) {
    return {
      version: OCR_CACHE_VERSION,
      items: {},
    };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (!raw || typeof raw !== 'object') {
      throw new Error('OCR cache is not a JSON object');
    }

    return {
      version: Number(raw.version) || OCR_CACHE_VERSION,
      items: raw.items && typeof raw.items === 'object' ? raw.items : {},
    };
  } catch (error) {
    throw new Error(`Failed to read OCR cache at ${cachePath}: ${error.message}`);
  }
}

export function writeOcrCache(cache, cachePath = DEFAULT_OCR_CACHE_PATH) {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(
    cachePath,
    JSON.stringify(
      {
        version: OCR_CACHE_VERSION,
        ...cache,
      },
      null,
      2,
    ),
  );
}
