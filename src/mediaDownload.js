import { API_BASE, IG_HANDLE, apiFetch } from './api';

const mediaTypes = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/avif': 'avif', 'image/heic': 'heic',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
};
const mediaExtension = /\.(jpe?g|png|webp|gif|avif|heic|mp4|webm|mov)$/i;
const mediaUrl = (post, query) => `${API_BASE}/api/dashboard/posts/media?${new URLSearchParams({ account: post.account || IG_HANDLE, shortcode: post.shortcode, ...query })}`;
const assertActive = signal => { if (signal?.aborted) throw new DOMException('Request aborted.', 'AbortError'); };

async function readError(response) {
  try { return (await response.json())?.detail || `HTTP ${response.status}`; }
  catch { return `HTTP ${response.status}`; }
}

export async function listPostMedia(post, { signal } = {}) {
  const response = await apiFetch(mediaUrl(post, { list: '1' }), { signal });
  if (!response.ok) throw new Error(await readError(response));
  const result = await response.json();
  assertActive(signal);
  return { ...result, items: Array.isArray(result.items) ? result.items : [] };
}

function responseName(response) {
  const disposition = response.headers.get('Content-Disposition') || '';
  const encoded = /filename\*\s*=\s*UTF-8'[^']*'([^;]+)/i.exec(disposition);
  if (encoded) {
    try { return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, '')); }
    catch { /* Fall through to the ordinary filename. */ }
  }
  const named = /filename\s*=\s*(?:"([^"]+)"|([^;]+))/i.exec(disposition);
  return (named?.[1] || named?.[2] || '').trim();
}

function fileName(post, item, name, type) {
  const suffix = mediaTypes[type] || mediaExtension.exec(name)?.[1]?.toLowerCase()
    || mediaExtension.exec(item.filename || '')?.[1]?.toLowerCase()
    || (item.kind === 'video' ? 'mp4' : 'jpg');
  // A missing/unexposed disposition must never turn native bytes into .zip.
  const fallback = `${post.account || IG_HANDLE}-${post.shortcode}-${String(item.index).padStart(2, '0')}`;
  // Strip control characters as well as characters forbidden in filenames.
  // eslint-disable-next-line no-control-regex
  const safe = (name.split(/[\\/]/).pop() || fallback).replace(/[\x00-\x1f\x7f<>:"|?*]/g, '_').replace(/^\.+/, '') || fallback;
  const extension = mediaExtension.exec(safe)?.[1]?.toLowerCase();
  if (extension === suffix || (suffix === 'jpg' && extension === 'jpeg')) return safe;
  // Dots in account handles belong to the generated stem, not an extension.
  return `${name ? safe.replace(/\.[^.]*$/, '') : safe}.${suffix}`;
}

async function mediaBlob(response) {
  const type = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  const name = responseName(response);
  const blob = await response.blob();
  const payloadType = type || blob.type;
  // Do not disguise an archive or a successful HTTP error page as an image.
  let zipBytes = false;
  const prefix = blob.slice(0, 4);
  if (typeof prefix.arrayBuffer === 'function') {
    const bytes = new Uint8Array(await prefix.arrayBuffer());
    zipBytes = bytes[0] === 0x50 && bytes[1] === 0x4b &&
      ((bytes[2] === 3 && bytes[3] === 4) || (bytes[2] === 5 && bytes[3] === 6) || (bytes[2] === 7 && bytes[3] === 8));
  }
  if (zipBytes || /zip/i.test(payloadType) || (/\.zip$/i.test(name) && !mediaTypes[payloadType])) {
    throw new Error('The server returned an archive instead of the media file. Please retry.');
  }
  if (!blob.size || /^(text\/|application\/(?:json|problem\+json))/i.test(payloadType)) {
    throw new Error('The server did not return a media file. Please retry.');
  }
  return { blob, type: payloadType, name };
}

function saveMedia(blob, name) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  try { document.body.appendChild(link); link.click(); }
  finally {
    link.remove();
    // Immediate revocation can cancel a download in Safari.
    setTimeout(() => URL.revokeObjectURL(href), 30000);
  }
}

// A single `only` index is the API's native-file route. Request each selected
// item separately: both the no-index and comma-separated routes create ZIPs.
export async function downloadPostMedia({ post, items, indexes, signal, onProgress }) {
  let downloadedCount = 0;
  let selected = [];
  try {
    const available = items ?? (await listPostMedia(post, { signal })).items;
    const wanted = indexes == null ? null : new Set(indexes);
    selected = available.filter(item => !wanted || wanted.has(item.index));
    if (!selected.length) throw new Error('No media found for this post.');
    if (selected.some(item => !Number.isInteger(item.index) || item.index < 1)) throw new Error('Could not read the media list. Please retry.');
    for (const item of selected) {
      assertActive(signal);
      const response = await apiFetch(mediaUrl(post, { only: String(item.index) }), { signal });
      if (!response.ok) throw new Error(await readError(response));
      const { blob, type, name } = await mediaBlob(response);
      assertActive(signal);
      saveMedia(blob, fileName(post, item, name, type));
      downloadedCount += 1;
      onProgress?.(downloadedCount, selected.length);
    }
    return downloadedCount;
  } catch (error) {
    error.downloadedCount = downloadedCount;
    error.totalCount = selected.length;
    throw error;
  }
}
