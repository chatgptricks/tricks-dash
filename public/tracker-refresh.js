/* Both Tracker interfaces wait for the actual Instagram reading before showing
   success. A queued response acknowledges a job; it is not a fresh snapshot. */
(function (root) {
  const pause = (ms, signal) => new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(Object.assign(new Error('Refresh cancelled.'), { name: 'AbortError' })); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
  function validResult(result) {
    if (!result || typeof result !== 'object') return false;
    if (Array.isArray(result.snapshotted) && result.snapshotted.every(handle => typeof handle === 'string') && result.failed && typeof result.failed === 'object' && !Array.isArray(result.failed)) return true;
    const count = result.followers ?? result.followers_count;
    return typeof result.handle === 'string' && result.handle.length > 0 && typeof count === 'number' && Number.isSafeInteger(count) && count >= 0;
  }
  async function bounded(action, { signal, timeoutMs = 30000 } = {}) {
    const controller = new AbortController();
    let timer, abort;
    const deadline = new Promise((_, reject) => {
      abort = () => { controller.abort(); reject(Object.assign(new Error('Refresh cancelled.'), { name: 'AbortError' })); };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      timer = setTimeout(() => { controller.abort(); reject(new Error('The Tracker connection timed out. Try again.')); }, timeoutMs);
    });
    try { return await Promise.race([deadline, Promise.resolve().then(() => { if (controller.signal.aborted) throw Object.assign(new Error('Refresh cancelled.'), { name: 'AbortError' }); return action(controller.signal); })]); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  async function wait(job, { read, onProgress = () => {}, isCurrent = () => true, signal, delay = pause, maxWaitMs = 15 * 60 * 1000 } = {}) {
    if (!job?.job_id) {
      if (validResult(job)) return job;
      throw new Error('Could not verify the follower refresh. Try again.');
    }
    const started = Date.now();
    let current = job, failures = 0;
    while (true) {
      if (!isCurrent() || signal?.aborted) throw Object.assign(new Error('Refresh cancelled.'), { name: 'AbortError' });
      onProgress(current);
      if (current.status === 'done') {
        if (!validResult(current.result)) throw new Error('Could not verify the follower refresh result. Try again.');
        return current.result;
      }
      if (current.status === 'error') throw new Error(current.error || 'Could not update followers. Try again.');
      // A sleeping tab may resume after its wait budget with an already
      // finished job. Read once more before reporting that it is still running.
      const atDeadline = Date.now() - started >= maxWaitMs;
      try {
        current = await bounded(readSignal => read('/api/tracker/refresh-jobs/' + encodeURIComponent(job.job_id), { signal: readSignal }), { signal });
        failures = 0;
      } catch (error) {
        if (!isCurrent() || signal?.aborted || error?.name === 'AbortError' || atDeadline || Date.now() - started >= maxWaitMs || [401, 403, 404].includes(error?.status) || ++failures >= 5) throw error;
        onProgress({ ...current, reconnecting: true });
        await delay(Math.min(1000 * failures, 5000), signal);
        continue;
      }
      if (!isCurrent() || signal?.aborted) throw Object.assign(new Error('Refresh cancelled.'), { name: 'AbortError' });
      if (!['queued', 'running', 'done', 'error'].includes(current?.status)) throw new Error('Could not verify the follower refresh. Try again.');
      if (current.status === 'done' || current.status === 'error') continue;
      if (atDeadline || Date.now() - started >= maxWaitMs) throw new Error('The follower refresh is still running. Retry to reconnect to its progress.');
      await delay(1500, signal);
    }
  }
  function describe(job, language = 'en') {
    const es = language === 'es';
    if (job?.reconnecting) return es ? 'Reconectando con la actualización…' : 'Reconnecting to the refresh…';
    if (job?.status === 'submitting') return es ? 'Iniciando actualización de seguidores…' : 'Starting the follower refresh…';
    if (job?.status === 'queued') return es ? 'Actualización en cola…' : 'Follower refresh queued…';
    const progress = job?.progress || {};
    const total = Number(progress.total) || 0;
    const completed = Number(progress.completed) || 0;
    const failed = Number(progress.failed) || 0;
    if (total) return (es ? `Actualizando seguidores · ${completed}/${total} cuentas` : `Updating followers · ${completed}/${total} accounts`) + (failed ? (es ? ` · ${failed} sin actualizar` : ` · ${failed} not updated`) : '');
    return es ? 'Consultando seguidores en Instagram…' : 'Checking followers on Instagram…';
  }
  function buttonLabel(job, language = 'en') {
    const es = language === 'es';
    if (job?.reconnecting) return es ? 'Reconectando…' : 'Reconnecting…';
    if (job?.status === 'submitting') return es ? 'Iniciando…' : 'Starting…';
    if (job?.status === 'queued') return es ? 'En cola…' : 'Queued…';
    const total = Number(job?.progress?.total) || 0;
    const completed = Number(job?.progress?.completed) || 0;
    return (es ? 'Actualizando' : 'Updating') + (total ? ` ${completed}/${total}` : '') + '…';
  }
  function outcome(result = {}, language = 'en', handle = '') {
    const es = language === 'es';
    if (!validResult(result)) return { error: true, message: es ? 'No se pudo verificar la actualización. Volvé a intentar.' : 'Could not verify the refresh. Try again.' };
    const failed = Object.keys(result.failed || {}).filter(value => !handle || value === handle);
    const updated = Array.isArray(result.snapshotted) ? result.snapshotted.length : null;
    if (failed.length) {
      const accounts = failed.map(value => '@' + value).join(', ');
      return { error: true, message: (es ? 'No se pudieron actualizar ' : 'Could not update ') + accounts + (es ? '. Se conserva su última lectura; volvé a intentar.' : '. Their last reading is retained; try again.') };
    }
    if (handle && (updated === null ? result.handle !== handle : !result.snapshotted.includes(handle))) return { error: true, message: es ? `No se pudo verificar la actualización de @${handle}. Volvé a intentar.` : `Could not verify the refresh for @${handle}. Try again.` };
    if (updated === 0) return { error: true, message: es ? 'No se actualizó ninguna cuenta. Volvé a intentar.' : 'No accounts were updated. Try again.' };
    return { error: false, message: handle ? (es ? `Seguidores de @${handle} actualizados` : `Followers for @${handle} updated`) : (es ? 'Seguidores actualizados' : 'Followers updated') };
  }
  function readingDate(value, language = 'en') {
    if (!value) return '—';
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T12:00:00Z' : value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(language === 'es' ? 'es-CR' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Costa_Rica' }).format(date);
  }
  root.SentientTrackerRefresh = { wait, describe, buttonLabel, outcome, bounded, readingDate };
})(typeof window === 'undefined' ? globalThis : window);
