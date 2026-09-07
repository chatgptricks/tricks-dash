// Opaque, shareable route state used by every React entry point.
//
// This is intentionally obfuscation, not encryption: the browser must be able
// to decode the state without a secret so a copied link remains portable. It
// keeps account handles, post keys, task ids, and UI labels out of the address
// bar while preserving backwards compatibility with the old query parameters.

function bytesToBinary(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return binary;
}
function binaryToBytes(binary) {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function encodeRouteState(state) {
  try {
    const json = JSON.stringify(state || {});
    const bytes = new TextEncoder().encode(json);
    return btoa(bytesToBinary(bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch {
    return '';
  }
}

export function decodeRouteState(token) {
  if (!token) return null;
  try {
    const normalized = String(token).replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = new TextDecoder().decode(binaryToBytes(atob(padded)));
    const value = JSON.parse(json);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
