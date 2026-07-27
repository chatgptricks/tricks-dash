#!/usr/bin/env node
/**
 * Sync @traselveloreal Instagram posts into a local-only DB for Tricks Dash.
 *
 * Source: Apify's "Instagram Scraper" actor (apify/instagram-scraper),
 *         same actor used by Predict's Post DB sync script, but for a
 *         different account.
 * Target: traselveloreal-db/traselveloreal_posts.xlsx ("Posts" + "Summary"
 *         sheets) and src/data/traselveloreal-posts.json (bundled into the
 *         Tricks Dash frontend build).
 *
 * IMPORTANT: this account is NOT part of Predict's canonical Post DB and
 * must never be written into "10 Predict/Post DB". It is a standalone data
 * source used only by Tricks Dash's account selector.
 *
 * Cover images are stored as direct Instagram CDN URLs (no local download,
 * no thumbnails) -- by design, per user decision. These URLs can expire
 * over time; re-running this script does not refresh URLs for existing
 * rows, only adds new posts.
 *
 * Because a full historical pull is a long-running Apify job (well beyond
 * a single short shell call), this script is split into two phases you
 * call repeatedly from the shell:
 *
 *   node scripts/sync-traselveloreal.mjs --start --limit 2500
 *   node scripts/sync-traselveloreal.mjs --poll      (repeat until it says "Done")
 *
 * State (run id / dataset id) is persisted to .traselveloreal-sync-state.json
 * between calls so --poll can be re-invoked from a fresh process.
 *
 * Idempotent: posts already present (matched by Instagram shortcode) are
 * skipped, so re-running is safe once a run has completed.
 */
import fs from 'node:fs';
import path from 'node:path';
import xlsx from 'xlsx';

const BASE_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DB_DIR = path.join(BASE_DIR, 'traselveloreal-db');
const XLSX_PATH = path.join(DB_DIR, 'traselveloreal_posts.xlsx');
const JSON_OUT_PATH = path.join(BASE_DIR, 'src', 'data', 'traselveloreal-posts.json');
const SUMMARY_OUT_PATH = path.join(BASE_DIR, 'src', 'data', 'traselveloreal-summary.json');
const STATE_PATH = path.join(BASE_DIR, '.traselveloreal-sync-state.json');

const IG_HANDLE = 'traselveloreal';
const ACTOR_ID = 'apify~instagram-scraper';

function readState() {
  if (!fs.existsSync(STATE_PATH)) return null;
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function writeState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function clearState() {
  try {
    if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
  } catch (err) {
    // Non-fatal: some mounted filesystems block unlink. Overwrite with an
    // empty marker instead so a stale runId is never reused.
    try {
      fs.writeFileSync(STATE_PATH, JSON.stringify({ done: true }));
    } catch {
      console.warn(`Warning: could not clear state file (${err.message}). Ignoring.`);
    }
  }
}

function classifyType(item) {
  const t = item.type || '';
  const productType = item.productType || (t === 'Sidecar' ? 'carousel_container' : 'feed');
  let label;
  if (t === 'Sidecar') label = 'Carousel';
  else if (t === 'Video') label = 'Video';
  else label = 'Image';
  const isVideo = t === 'Video' || productType === 'clips' ? 'Yes' : 'No';
  return { typeLabel: `${label} (${productType})`, isVideo };
}

// Returns an ISO date string (not a Date instance) -- xlsx's json_to_sheet
// silently converts JS Date objects into Excel serial numbers, and re-reading
// those with sheet_to_json (no cellDates option) yields epoch-adjacent
// garbage. Storing plain ISO strings sidesteps that round-trip bug entirely.
function parseTimestamp(ts) {
  if (!ts) return new Date().toISOString();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

async function startRun(token, limit, maxTotalChargeUsd) {
  const payload = {
    directUrls: [`https://www.instagram.com/${IG_HANDLE}/`],
    resultsType: 'posts',
    resultsLimit: limit,
    skipPinnedPosts: true,
  };
  // Apify silently caps a run's spend (e.g. ~$3) unless the caller sets
  // maxTotalChargeUsd explicitly -- without it, a full-history pull on a
  // large account aborts partway with "Reached max data limit" and no error.
  const resp = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${token}&maxTotalChargeUsd=${maxTotalChargeUsd}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!resp.ok) throw new Error(`Apify start failed: HTTP ${resp.status} ${await resp.text()}`);
  const data = (await resp.json()).data;
  writeState({ runId: data.id, datasetId: data.defaultDatasetId, startedAt: new Date().toISOString() });
  console.log(`Started Apify run ${data.id} (dataset ${data.defaultDatasetId})`);
  console.log('Run: node scripts/sync-traselveloreal.mjs --poll   (repeat until Done)');
}

async function pollRun(token) {
  const state = readState();
  if (!state || !state.runId) {
    console.log('No in-progress run found. Start one with --start --limit N.');
    return;
  }
  const statusResp = await fetch(`https://api.apify.com/v2/actor-runs/${state.runId}?token=${token}`);
  if (!statusResp.ok) throw new Error(`Apify status check failed: HTTP ${statusResp.status}`);
  const runData = (await statusResp.json()).data;
  console.log(`Run ${state.runId}: status=${runData.status}`);

  if (runData.status === 'FAILED' || runData.status === 'ABORTED' || runData.status === 'TIMED-OUT') {
    clearState();
    throw new Error(`Apify run ended with status ${runData.status}`);
  }
  if (runData.status !== 'SUCCEEDED') {
    console.log('Still running -- call --poll again shortly.');
    return;
  }

  console.log('Run succeeded. Fetching dataset items...');
  const itemsResp = await fetch(
    `https://api.apify.com/v2/datasets/${state.datasetId}/items?token=${token}&clean=true`,
  );
  if (!itemsResp.ok) throw new Error(`Apify dataset fetch failed: HTTP ${itemsResp.status}`);
  const items = await itemsResp.json();
  console.log(`${items.length} item(s) fetched`);
  ingest(items);
  clearState();
}

function loadOrCreateWorkbook() {
  if (fs.existsSync(XLSX_PATH)) {
    return xlsx.readFile(XLSX_PATH, { cellDates: true });
  }
  const wb = xlsx.utils.book_new();
  const postsHeader = [
    ['#', 'Post Date UTC', 'Likes', 'Comments', 'Type', 'Video', 'Shortcode', 'Permalink', 'Caption', 'Owner Username', 'Media ID', 'Cover URL'],
  ];
  const postsWs = xlsx.utils.aoa_to_sheet(postsHeader);
  xlsx.utils.book_append_sheet(wb, postsWs, 'Posts');
  const summaryWs = xlsx.utils.aoa_to_sheet([
    ['Metric', 'Value'],
    ['Exported posts', 0],
    ['Total likes', 0],
    ['Average likes', 0],
    ['Most liked shortcode', ''],
    ['Most liked likes', 0],
    ['Generated UTC', ''],
  ]);
  xlsx.utils.book_append_sheet(wb, summaryWs, 'Summary');
  return wb;
}

function ingest(items) {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const wb = loadOrCreateWorkbook();
  const postsWs = wb.Sheets['Posts'];
  const summaryWs = wb.Sheets['Summary'];

  const existingRows = xlsx.utils.sheet_to_json(postsWs, { defval: null });
  const existingShortcodes = new Set(existingRows.map((r) => r['Shortcode']).filter(Boolean));
  let maxRank = 0;
  for (const r of existingRows) {
    const rank = Number(r['#']);
    if (Number.isFinite(rank) && rank > maxRank) maxRank = rank;
  }

  const newItems = items
    .filter((it) => it.shortCode && !existingShortcodes.has(it.shortCode))
    .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

  console.log(`Existing: ${existingShortcodes.size}, new: ${newItems.length}`);

  let nextRank = maxRank + 1;
  const addedRows = [];
  for (const it of newItems) {
    const postDt = parseTimestamp(it.timestamp);
    const { typeLabel, isVideo } = classifyType(it);
    const likes = Number.isFinite(it.likesCount) && it.likesCount >= 0 ? it.likesCount : 0;
    const comments = it.commentsCount || 0;
    const coverUrl = it.displayUrl || (Array.isArray(it.images) ? it.images[0] : '') || '';
    const permalink = it.url || `https://www.instagram.com/p/${it.shortCode}/`;

    addedRows.push({
      '#': nextRank,
      'Post Date UTC': postDt,
      Likes: likes,
      Comments: comments,
      Type: typeLabel,
      Video: isVideo,
      Shortcode: it.shortCode,
      Permalink: permalink,
      Caption: it.caption || '',
      'Owner Username': it.ownerUsername || IG_HANDLE,
      'Media ID': `${it.id || ''}_${it.ownerId || ''}`,
      'Cover URL': coverUrl,
    });
    nextRank += 1;
  }

  if (addedRows.length) {
    const allRows = [...existingRows, ...addedRows];
    const newPostsWs = xlsx.utils.json_to_sheet(allRows, {
      header: ['#', 'Post Date UTC', 'Likes', 'Comments', 'Type', 'Video', 'Shortcode', 'Permalink', 'Caption', 'Owner Username', 'Media ID', 'Cover URL'],
    });
    wb.Sheets['Posts'] = newPostsWs;
  }

  // Recompute summary from the full sheet.
  const finalRows = xlsx.utils.sheet_to_json(wb.Sheets['Posts'], { defval: null });
  let totalLikes = 0;
  let mostLiked = [null, -1];
  for (const r of finalRows) {
    const likes = Number(r.Likes) || 0;
    totalLikes += likes;
    if (likes > mostLiked[1]) mostLiked = [r.Shortcode, likes];
  }
  const totalPosts = finalRows.length;
  const nowIso = new Date().toISOString();

  const summaryAoA = [
    ['Metric', 'Value'],
    ['Exported posts', totalPosts],
    ['Total likes', totalLikes],
    ['Average likes', totalPosts ? Math.round(totalLikes / totalPosts) : 0],
    ['Most liked shortcode', mostLiked[0] || ''],
    ['Most liked likes', mostLiked[1] < 0 ? 0 : mostLiked[1]],
    ['Generated UTC', nowIso],
  ];
  wb.Sheets['Summary'] = xlsx.utils.aoa_to_sheet(summaryAoA);

  if (addedRows.length || !fs.existsSync(XLSX_PATH)) {
    xlsx.writeFile(wb, XLSX_PATH);
    console.log(`Wrote ${XLSX_PATH}`);
  }

  // Export JSON consumed by the frontend build.
  const jsonPosts = finalRows.map((r) => {
    const dt = r['Post Date UTC'] instanceof Date ? r['Post Date UTC'] : new Date(r['Post Date UTC']);
    const caption = String(r.Caption || '').trim();
    const excerpt = caption.length > 180 ? `${caption.slice(0, 177)}…` : caption;
    return {
      rank: Number(r['#']),
      postDate: dt.toISOString(),
      likes: Number(r.Likes) || 0,
      comments: Number(r.Comments) || 0,
      type: String(r.Type || ''),
      video: String(r.Video || ''),
      shortcode: String(r.Shortcode || ''),
      permalink: String(r.Permalink || ''),
      caption,
      excerpt,
      coverUrl: String(r['Cover URL'] || ''),
      account: IG_HANDLE,
    };
  });
  fs.mkdirSync(path.dirname(JSON_OUT_PATH), { recursive: true });
  fs.writeFileSync(JSON_OUT_PATH, JSON.stringify(jsonPosts, null, 2));
  console.log(`Wrote ${JSON_OUT_PATH} (${jsonPosts.length} posts)`);

  const summaryObj = Object.fromEntries(summaryAoA.slice(1).map(([k, v]) => [k, v]));
  fs.writeFileSync(SUMMARY_OUT_PATH, JSON.stringify(summaryObj, null, 2));
  console.log(`Wrote ${SUMMARY_OUT_PATH}`);

  console.log(`\nDone. Added ${addedRows.length} new post(s). Total: ${totalPosts}.`);
}

async function main() {
  const args = process.argv.slice(2);
  const cacheIdx = args.indexOf('--from-cache');

  if (cacheIdx >= 0) {
    // Re-ingest a previously fetched dataset without re-billing Apify.
    // Useful for recovering from a bug in the local write path.
    const items = JSON.parse(fs.readFileSync(args[cacheIdx + 1], 'utf8'));
    console.log(`Loaded ${items.length} cached item(s) from ${args[cacheIdx + 1]}`);
    ingest(items);
    return;
  }

  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.error('Set APIFY_TOKEN in the environment.');
    process.exit(1);
  }

  if (args.includes('--start')) {
    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 2500;
    const chargeIdx = args.indexOf('--max-charge-usd');
    const maxTotalChargeUsd = chargeIdx >= 0 ? Number(args[chargeIdx + 1]) : 25;
    await startRun(token, limit, maxTotalChargeUsd);
  } else if (args.includes('--poll')) {
    await pollRun(token);
  } else {
    console.error('Usage: sync-traselveloreal.mjs --start --limit N [--max-charge-usd N] | --poll | --from-cache <file>');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
