import fs from 'node:fs';
import path from 'node:path';
import xlsx from 'xlsx';
import { getPostCacheKey, normalizeOcrText, readOcrCache } from './ocr-utils.mjs';

const workbookPath = process.env.WORKBOOK_PATH || '/Users/tbnalfaro/Downloads/chatgptricks_posts.xlsx';
const outDir = path.resolve('src/data');
const ocrCachePath = process.env.OCR_CACHE_PATH ? path.resolve(process.env.OCR_CACHE_PATH) : undefined;
fs.mkdirSync(outDir, { recursive: true });

if (!fs.existsSync(workbookPath)) {
  throw new Error(
    `Workbook not found at ${workbookPath}. Set WORKBOOK_PATH to the current .xlsx export before regenerating data.`,
  );
}

const workbook = xlsx.readFile(workbookPath, { cellDates: true });
const postsSheet = workbook.Sheets.Posts;
const summarySheet = workbook.Sheets.Summary;
const ocrCache = readOcrCache(ocrCachePath);

const rows = xlsx.utils.sheet_to_json(postsSheet, { defval: null });
const posts = rows.map((row) => {
  const postDate = row['Post Date UTC'];
  const date = postDate instanceof Date ? postDate.toISOString() : new Date(postDate).toISOString();
  const caption = String(row.Caption ?? '').trim();
  const excerpt = caption.length > 180 ? `${caption.slice(0, 177)}…` : caption;

  const basePost = {
    rank: Number(row['#']),
    postDate: date,
    likes: Number(row.Likes ?? 0),
    comments: Number(row.Comments ?? 0),
    type: String(row.Type ?? ''),
    video: String(row.Video ?? ''),
    shortcode: String(row.Shortcode ?? ''),
    permalink: String(row.Permalink ?? ''),
    caption,
    excerpt,
    coverUrl: String(row['Cover URL'] ?? ''),
    coverFile: String(row['Cover File'] ?? ''),
  };

  const ocrEntry = ocrCache.items[getPostCacheKey(basePost)];
  const ocrText = normalizeOcrText(ocrEntry?.ocrText);
  if (!ocrText) return basePost;

  return {
    ...basePost,
    ocrText,
    ocrProvider: String(ocrEntry.provider ?? ''),
    ocrUpdatedAt: String(ocrEntry.updatedAt ?? ''),
  };
});

fs.writeFileSync(path.join(outDir, 'posts.json'), JSON.stringify(posts, null, 2));

const summaryRows = xlsx.utils.sheet_to_json(summarySheet, { header: 1, defval: null });
const summary = Object.fromEntries(summaryRows.filter((row) => row?.[0]).map((row) => [String(row[0]), row[1]]));

fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
