export function waitForRetry(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new DOMException('Request aborted.', 'AbortError'));
    };
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export function retryDelay(attempt, base = 800, maximum = 8000) {
  return Math.min(maximum, base * (2 ** Math.min(attempt, 10))) * (0.75 + Math.random() * 0.25);
}
