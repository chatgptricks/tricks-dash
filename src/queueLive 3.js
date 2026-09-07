import { API_BASE, apiFetch } from './api';
import { retryDelay, waitForRetry } from './retry';

function parseFrame(frame) {
  const data = frame.split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  if (!data) return null;
  try { return JSON.parse(data); } catch { return null; }
}

export async function followQueueLive({ after = 0, signal, onEvent, onStatus }) {
  let revision = Number(after) || 0;
  let failures = 0;
  while (!signal.aborted) {
    let reader;
    try {
      onStatus?.('connecting');
      const response = await apiFetch(`${API_BASE}/api/dashboard/queue/v2/live?after=${revision}`, {
        headers: { Accept: 'text/event-stream' }, signal,
      });
      if (response.status === 401 || response.status === 403) {
        onStatus?.('offline');
        return;
      }
      if (!response.ok || !response.body) throw new Error(`Queue live stream returned ${response.status}.`);
      onStatus?.('live');
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        failures = 0;
        buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n');
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const event = parseFrame(frame);
          if (event?.revision > revision) {
            revision = event.revision;
            onEvent?.(event);
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (error) {
      if (signal.aborted || error?.name === 'AbortError') break;
    } finally {
      if (reader) {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
    if (!signal.aborted) {
      onStatus?.('offline');
      try {
        await waitForRetry(retryDelay(failures++, 1200, 30000), signal);
      } catch (error) {
        if (signal.aborted || error?.name === 'AbortError') break;
        throw error;
      }
    }
  }
}
