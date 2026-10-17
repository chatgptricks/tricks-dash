// Bound the whole read, including token refresh and response-body parsing.
// Those can remain pending even when fetch itself accepts an AbortSignal.
export async function runDashboardRead(read, { signal, timeoutMs = 120_000 } = {}) {
  const controller = new AbortController();
  let rejectCancelled;
  const cancelled = new Promise((_, reject) => { rejectCancelled = reject; });
  const cancel = (reason) => {
    rejectCancelled(reason);
    controller.abort(reason);
  };
  const onAbort = () => cancel(signal.reason || new DOMException('Request aborted.', 'AbortError'));
  let timer;
  if (signal?.aborted) onAbort();
  else {
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = globalThis.setTimeout(() => {
      cancel(new DOMException('The post library request timed out.', 'TimeoutError'));
    }, timeoutMs);
  }
  try {
    if (controller.signal.aborted) return await cancelled;
    return await Promise.race([
      Promise.resolve().then(() => read(controller.signal)),
      cancelled,
    ]);
  } finally {
    globalThis.clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    controller.abort();
  }
}
