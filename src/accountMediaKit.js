import { API_BASE, apiFetch } from './api';

function pdfFilename(disposition, handle) {
  const fallback = `${String(handle).replace(/[^a-zA-Z0-9._-]/g, '') || 'account'}-media-kit.pdf`;
  const encoded = disposition?.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  const plain = disposition?.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i);
  let name = plain?.[1] || plain?.[2] || '';
  if (encoded) {
    try { name = decodeURIComponent(encoded[1].trim()); } catch { /* Fall back to a plain filename. */ }
  }
  name = Array.from(name.trim().split(/[\\/]/).pop()).filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('');
  name = name.replace(/[<>:"|?*]/g, '').replace(/^\.+/, '').slice(0, 180);
  return name && /\.pdf$/i.test(name) ? name : fallback;
}

// Each download requests a fresh server-rendered report. The server reads
// the stored account history; downloading never starts a paid refresh.
export async function downloadAccountMediaKit(handle, { signal, theme = 'light', accent = '#00A991' } = {}) {
  const selectedAccent = typeof accent === 'string' ? accent.trim() : '';
  const appearance = new URLSearchParams({
    theme: theme === 'dark' ? 'dark' : 'light',
    accent: /^#[0-9a-f]{6}$/i.test(selectedAccent) ? selectedAccent : '#00A991',
  });
  const response = await apiFetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(handle)}/media-kit.pdf?${appearance}`, {
    cache: 'no-store',
    headers: { Accept: 'application/pdf' },
    signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = typeof body.detail === 'string' ? body.detail : '';
    throw new Error(detail || `Could not generate the media kit (HTTP ${response.status}). Try again.`);
  }
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/pdf')) {
    throw new Error('The server did not return a PDF. Try again.');
  }
  const blob = await response.blob();
  if (!blob.size || await blob.slice(0, 5).text() !== '%PDF-') {
    throw new Error('The PDF could not be generated. Try again.');
  }
  if (signal?.aborted) throw new DOMException('Request aborted.', 'AbortError');
  const filename = pdfFilename(response.headers.get('content-disposition'), handle);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // Give the browser time to consume the Blob before releasing its URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return { filename };
}
