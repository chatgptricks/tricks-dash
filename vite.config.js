import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const coverCache = new Map();
const require = createRequire(import.meta.url);

const imageTypes = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
]);

const localCoverFallbackDirs = [
  '/Users/tbnalfaro/Desktop/Codex Projects/10 Predict/Post DB/covers',
  '/Users/tbnalfaro/Desktop/Codex Projects/10 Predict/Post DB/thumbs',
  '/Users/tbnalfaro/Desktop/Codex Projects/10 Predict/data/uploads/imported-history',
];
const isGitHubPages = process.env.GITHUB_PAGES === 'true';

function resolveLocalCoverPath(filePath) {
  if (filePath && existsSync(filePath)) return filePath;

  const fileName = basename(filePath || '');
  if (!fileName) return '';

  for (const directory of localCoverFallbackDirs) {
    const candidate = join(directory, fileName);
    if (existsSync(candidate)) return candidate;
  }

  return '';
}

let browserPromise = null;
let contextPromise = null;

async function getBrowserContext() {
  if (!contextPromise) {
    contextPromise = (async () => {
      const { chromium } = require('playwright');
      if (!browserPromise) {
        browserPromise = chromium.launch({ headless: true });
      }
      const browser = await browserPromise;
      return browser.newContext({
        viewport: { width: 1280, height: 1600 },
      });
    })();
  }

  return contextPromise;
}

async function fetchImageBytes(url) {
  if (!url) return null;

  const context = await getBrowserContext();
  const response = await context.request.get(url, { timeout: 30000 });
  if (!response.ok()) return null;

  return {
    contentType: response.headers()['content-type'] || 'image/jpeg',
    buffer: await response.body(),
  };
}

function buildEmbedUrl(permalink) {
  try {
    const url = new URL(permalink);
    const trimmedPath = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
    url.pathname = `${trimmedPath}embed/captioned/`;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

async function resolveInstagramCover(permalink, fallback) {
  const cacheKey = `${permalink || ''}|${fallback || ''}`;
  if (coverCache.has(cacheKey)) {
    return coverCache.get(cacheKey);
  }

  const request = (async () => {
    const direct = await fetchImageBytes(fallback);
    if (direct) return direct;

    const embedUrl = buildEmbedUrl(permalink);
    if (!embedUrl) return null;

    const context = await getBrowserContext();
    const page = await context.newPage();
    try {
      await page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(6500);

      const imageSrc = await page.evaluate(() => {
        const candidates = Array.from(document.images)
          .map((img) => ({
            src: img.currentSrc || img.src,
            width: img.naturalWidth || img.width || 0,
            height: img.naturalHeight || img.height || 0,
            alt: img.alt || '',
          }))
          .filter((img) => img.src);

        candidates.sort((a, b) => b.width * b.height - a.width * a.height);
        return candidates.find((img) => img.width >= 600 || /Instagram post shared/i.test(img.alt))?.src ?? candidates[0]?.src ?? null;
      });

      if (!imageSrc) return null;

      const response = await context.request.get(imageSrc, { timeout: 30000 });
      if (!response.ok()) return null;

      return {
        contentType: response.headers()['content-type'] || 'image/jpeg',
        buffer: await response.body(),
      };
    } catch {
      return null;
    } finally {
      await page.close().catch(() => {});
    }
  })();

  coverCache.set(cacheKey, request);
  const resolved = await request;
  coverCache.set(cacheKey, resolved);
  return resolved;
}

function serveInstagramCovers() {
  const middleware = (req, res, next) => {
    if (!req.url) {
      next();
      return;
    }

    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      next();
      return;
    }

    if (url.pathname !== '/api/cover') {
      next();
      return;
    }

    const permalink = url.searchParams.get('permalink') || '';
    const fallback = url.searchParams.get('fallback') || '';

    (async () => {
      const resolved = await resolveInstagramCover(permalink, fallback);

      if (!resolved) {
        res.statusCode = 502;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.end('Cover image unavailable');
        return;
      }

      res.statusCode = 200;
      res.setHeader('content-type', resolved.contentType);
      res.setHeader('cache-control', 'public, max-age=86400');
      res.end(resolved.buffer);
    })().catch(() => {
      res.statusCode = 502;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('Cover image unavailable');
    });
  };

  return {
    name: 'serve-instagram-covers',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

function serveLocalCovers() {
  const middleware = (req, res, next) => {
    if (!req.url) {
      next();
      return;
    }

    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      next();
      return;
    }

    if (url.pathname !== '/api/local-cover') {
      next();
      return;
    }

    const requestedPath = url.searchParams.get('path') || '';
    const filePath = resolveLocalCoverPath(requestedPath);
    const extension = extname(filePath).toLowerCase();
    const contentType = imageTypes.get(extension);

    if (!filePath || !contentType || !existsSync(filePath)) {
      res.statusCode = 404;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('Cover image not found');
      return;
    }

    try {
      const stats = statSync(filePath);
      if (!stats.isFile()) {
        res.statusCode = 404;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.end('Cover image not found');
        return;
      }

      res.statusCode = 200;
      res.setHeader('content-type', contentType);
      res.setHeader('content-length', stats.size);
      res.setHeader('cache-control', 'public, max-age=86400');
      createReadStream(filePath).pipe(res);
    } catch {
      res.statusCode = 500;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('Cover image unavailable');
    }
  };

  return {
    name: 'serve-local-covers',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  base: isGitHubPages ? '/chatgptricks-archive/' : '/',
  plugins: [react(), serveLocalCovers(), serveInstagramCovers()],
  server: {
    host: '0.0.0.0',
    port: 4175,
  },
  preview: {
    host: '0.0.0.0',
    port: 4175,
  },
});
