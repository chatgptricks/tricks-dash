// Coalesce bursts while guaranteeing a fresh read after an in-flight read.
// Every caller waits until the queue has caught up, including mutations.
export function createQueueRefresh() {
  let pending;
  let running;
  return function refresh(read) {
    pending = read;
    if (!running) {
      running = Promise.resolve().then(async () => {
        let result;
        while (pending) {
          const next = pending;
          pending = null;
          try { result = await next(); }
          catch (error) { if (!pending) throw error; }
        }
        return result;
      }).finally(() => { running = null; });
    }
    return running;
  };
}
