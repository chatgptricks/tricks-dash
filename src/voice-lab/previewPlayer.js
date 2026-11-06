import { waitForRetry } from '../retry';

const SILENCE = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==';
const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 20;

// One player and a bounded, owner-lifetime RAM cache. Nothing is generated
// until Play is clicked, and no preview audio is written to browser storage.
export function createPreviewPlayer({ request, apiBase, onChange }) {
  const cache = new Map();
  let bytes = 0, audio, current, objectUrl, disposed = false;
  const publish = value => { if (!disposed) onChange(value); };
  const active = item => !disposed && current === item && !item.controller.signal.aborted;
  function stop() {
    current?.controller.abort(); clearTimeout(current?.timeout); current = null;
    if (audio) {
      audio.onplay = audio.onpause = audio.onended = audio.onerror = null;
      audio.pause(); audio.removeAttribute('src');
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    publish({ key: null, status: 'idle' });
  }
  async function playAudio(item) {
    if (!active(item)) return;
    try { await audio.play(); }
    catch (error) {
      if (!active(item)) return;
      if (error?.name === 'NotAllowedError') publish({ key: item.key, status: 'blocked' });
      else { stop(); publish({ key: item.key, status: 'error' }); }
    }
  }
  async function play({ voice, language, sample }) {
    if (disposed) return;
    const key = [voice, language, sample].join(':');
    if (current?.key === key && objectUrl) { await playAudio(current); return; }
    stop();
    audio ||= new Audio();
    audio.src = SILENCE;
    try { audio.play()?.catch(() => {}); } catch { /* Explicit replay handles autoplay policies. */ }
    const item = { key, controller: new AbortController() };
    current = item;
    publish({ key, status: 'loading' });
    item.timeout = setTimeout(() => {
      if (current === item) { stop(); publish({ key, status: 'error' }); }
    }, 60_000);
    try {
      let blob = cache.get(key);
      if (blob) { cache.delete(key); cache.set(key, blob); }
      else {
        const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voice, language, sample }), signal: item.controller.signal };
        let response = await request(apiBase + '/api/dashboard/assistant/voice-preview', options);
        // A cancelled provider request can take a moment to release the
        // per-user slot. Retry that precise busy response once, then stop.
        if (response.status === 429 && active(item)) { await waitForRetry(450, item.controller.signal); response = await request(apiBase + '/api/dashboard/assistant/voice-preview', options); }
        if (!active(item)) return;
        if (!response.ok || !response.headers.get('Content-Type')?.startsWith('audio/')) throw new Error('preview');
        blob = await response.blob();
        if (!active(item)) return;
        if (!blob.size) throw new Error('empty');
        if (blob.size <= MAX_CACHE_BYTES) {
          while (cache.size && (cache.size >= MAX_CACHE_ENTRIES || bytes + blob.size > MAX_CACHE_BYTES)) {
            const first = cache.keys().next().value; bytes -= cache.get(first).size; cache.delete(first);
          }
          cache.set(key, blob); bytes += blob.size;
        }
      }
      if (!active(item)) return;
      objectUrl = URL.createObjectURL(blob); audio.src = objectUrl;
      audio.onplay = () => { if (active(item)) publish({ key, status: 'playing' }); };
      audio.onpause = () => { if (active(item)) publish({ key, status: 'paused' }); };
      audio.onended = () => { if (active(item)) stop(); };
      audio.onerror = () => { if (active(item)) { stop(); publish({ key, status: 'error' }); } };
      clearTimeout(item.timeout);
      await playAudio(item);
    } catch (error) {
      if (active(item)) { stop(); publish({ key, status: 'error' }); }
    } finally { clearTimeout(item.timeout); }
  }
  return { play, stop, dispose() { disposed = true; stop(); cache.clear(); bytes = 0; } };
}
