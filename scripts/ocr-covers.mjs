import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_OCR_CACHE_PATH,
  clampInteger,
  getImageFingerprint,
  getPostCacheKey,
  normalizeOcrText,
  readOcrCache,
  writeOcrCache,
} from './ocr-utils.mjs';

const POSTS_PATH = path.resolve('src/data/posts.json');
const CACHE_PATH = process.env.OCR_CACHE_PATH ? path.resolve(process.env.OCR_CACHE_PATH) : DEFAULT_OCR_CACHE_PATH;
const PROVIDER = String(process.env.OCR_PROVIDER || 'google-vision').trim();
const GOOGLE_API_KEY = String(process.env.GOOGLE_CLOUD_VISION_API_KEY || '').trim();
const PRIMARY_FEATURE = String(process.env.OCR_GOOGLE_PRIMARY_FEATURE || 'TEXT_DETECTION').trim();
const SECONDARY_FEATURE = String(process.env.OCR_GOOGLE_SECONDARY_FEATURE || 'DOCUMENT_TEXT_DETECTION').trim();
const PRIMARY_MIN_CHARS = clampInteger(process.env.OCR_GOOGLE_PRIMARY_MIN_CHARS, 12, 0);
const OCR_CONCURRENCY = clampInteger(process.env.OCR_CONCURRENCY, 2, 1);
const OCR_LIMIT = clampInteger(process.env.OCR_LIMIT, 0, 0);
const OCR_FORCE = /^(1|true|yes)$/i.test(String(process.env.OCR_FORCE || ''));
const LANGUAGE_HINTS = String(process.env.OCR_GOOGLE_LANGUAGE_HINTS || 'en')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (PROVIDER !== 'google-vision') {
  throw new Error(`Unsupported OCR_PROVIDER "${PROVIDER}". Supported value: google-vision.`);
}

if (!GOOGLE_API_KEY) {
  throw new Error(
    'Missing GOOGLE_CLOUD_VISION_API_KEY. Add it to your environment or .env file before running OCR.',
  );
}

if (!fs.existsSync(POSTS_PATH)) {
  throw new Error(`Missing ${POSTS_PATH}. Run "pnpm generate:data" first.`);
}

const posts = JSON.parse(fs.readFileSync(POSTS_PATH, 'utf8'));
const cache = readOcrCache(CACHE_PATH);

function shouldSkip(post) {
  const cacheKey = getPostCacheKey(post);
  const existing = cache.items[cacheKey];
  if (!existing || OCR_FORCE) return false;

  return (
    existing.status === 'ok' &&
    existing.provider === PROVIDER &&
    existing.primaryFeature === PRIMARY_FEATURE &&
    existing.secondaryFeature === SECONDARY_FEATURE &&
    existing.imageFingerprint === getImageFingerprint(post)
  );
}

async function readImageBytes(post) {
  const coverFile = String(post.coverFile || '').trim();
  if (coverFile && fs.existsSync(coverFile)) {
    return {
      bytes: fs.readFileSync(coverFile),
      sourceType: 'coverFile',
      sourceValue: coverFile,
    };
  }

  const coverUrl = String(post.coverUrl || '').trim();
  if (!coverUrl) {
    throw new Error('Post has neither coverFile nor coverUrl');
  }

  const response = await fetch(coverUrl);
  if (!response.ok) {
    throw new Error(`Cover fetch failed with ${response.status} ${response.statusText}`);
  }

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    sourceType: 'coverUrl',
    sourceValue: coverUrl,
  };
}

async function annotateWithGoogle(bytes, feature) {
  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(GOOGLE_API_KEY)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          image: {
            content: bytes.toString('base64'),
          },
          features: [
            {
              type: feature,
            },
          ],
          ...(LANGUAGE_HINTS.length
            ? {
                imageContext: {
                  languageHints: LANGUAGE_HINTS,
                },
              }
            : {}),
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Google Vision request failed with ${response.status}`);
  }

  const first = payload?.responses?.[0];
  if (first?.error?.message) {
    throw new Error(first.error.message);
  }

  return normalizeOcrText(first?.fullTextAnnotation?.text || first?.textAnnotations?.[0]?.description || '');
}

async function extractOcrText(post) {
  const image = await readImageBytes(post);
  const primaryText = await annotateWithGoogle(image.bytes, PRIMARY_FEATURE);

  let selectedText = primaryText;
  let selectedFeature = PRIMARY_FEATURE;
  let secondaryText = '';

  if (SECONDARY_FEATURE && SECONDARY_FEATURE !== PRIMARY_FEATURE && primaryText.length < PRIMARY_MIN_CHARS) {
    secondaryText = await annotateWithGoogle(image.bytes, SECONDARY_FEATURE);
    if (secondaryText.length > selectedText.length) {
      selectedText = secondaryText;
      selectedFeature = SECONDARY_FEATURE;
    }
  }

  return {
    image,
    ocrText: selectedText,
    selectedFeature,
    primaryTextLength: primaryText.length,
    secondaryTextLength: secondaryText.length,
  };
}

async function runPool(items, concurrency, worker) {
  let index = 0;

  async function next() {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
}

const candidates = posts.filter((post) => String(post.coverFile || post.coverUrl || '').trim()).filter((post) => !shouldSkip(post));
const queue = OCR_LIMIT > 0 ? candidates.slice(0, OCR_LIMIT) : candidates;

console.log(`OCR queue: ${queue.length} posts (${posts.length - queue.length} skipped from cache or missing covers).`);
console.log(`Provider: ${PROVIDER}`);
console.log(`Primary feature: ${PRIMARY_FEATURE}`);
console.log(`Secondary feature: ${SECONDARY_FEATURE || 'disabled'}`);

let completed = 0;
let failed = 0;

await runPool(queue, OCR_CONCURRENCY, async (post, index) => {
  const cacheKey = getPostCacheKey(post);
  const startedAt = new Date().toISOString();

  try {
    const result = await extractOcrText(post);
    cache.items[cacheKey] = {
      status: 'ok',
      provider: PROVIDER,
      primaryFeature: PRIMARY_FEATURE,
      secondaryFeature: SECONDARY_FEATURE,
      selectedFeature: result.selectedFeature,
      updatedAt: new Date().toISOString(),
      startedAt,
      imageFingerprint: getImageFingerprint(post),
      sourceType: result.image.sourceType,
      sourceValue: result.image.sourceValue,
      rank: Number(post.rank || 0),
      shortcode: String(post.shortcode || ''),
      primaryTextLength: result.primaryTextLength,
      secondaryTextLength: result.secondaryTextLength,
      ocrText: result.ocrText,
    };
    completed += 1;
    console.log(`[${index + 1}/${queue.length}] OCR ok ${post.shortcode || post.rank} (${result.ocrText.length} chars)`);
  } catch (error) {
    failed += 1;
    cache.items[cacheKey] = {
      status: 'error',
      provider: PROVIDER,
      primaryFeature: PRIMARY_FEATURE,
      secondaryFeature: SECONDARY_FEATURE,
      updatedAt: new Date().toISOString(),
      startedAt,
      imageFingerprint: getImageFingerprint(post),
      rank: Number(post.rank || 0),
      shortcode: String(post.shortcode || ''),
      error: error.message,
      ocrText: '',
    };
    console.error(`[${index + 1}/${queue.length}] OCR failed ${post.shortcode || post.rank}: ${error.message}`);
  }

  writeOcrCache(cache, CACHE_PATH);
});

console.log(`OCR finished: ${completed} success, ${failed} failed.`);
console.log(`Refreshing ${POSTS_PATH} from OCR cache...`);

const enrichedPosts = posts.map((post) => {
  const ocrEntry = cache.items[getPostCacheKey(post)];
  const ocrText = normalizeOcrText(ocrEntry?.ocrText);
  const cleanPost = {
    ...post,
  };

  delete cleanPost.ocrText;
  delete cleanPost.ocrProvider;
  delete cleanPost.ocrUpdatedAt;

  if (!ocrText) return cleanPost;

  return {
    ...cleanPost,
    ocrText,
    ocrProvider: String(ocrEntry.provider ?? ''),
    ocrUpdatedAt: String(ocrEntry.updatedAt ?? ''),
  };
});

fs.writeFileSync(POSTS_PATH, JSON.stringify(enrichedPosts, null, 2));
console.log(`OCR cache updated at ${CACHE_PATH}`);
