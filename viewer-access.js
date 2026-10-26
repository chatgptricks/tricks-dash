// The static navigation and role switcher need the same verified viewer.
// Share only a pending read: permissions are never persisted or reused after
// a request completes, and a changed session/role cancels its old consumers.
(() => {
  if (window.SentientViewerAccess) return;
  let pending = null;
  const role = () => {
    try { return window.sessionStorage.getItem('sentient.queueRolePreview') || ''; }
    catch { return ''; }
  };
  const context = () => ({ token: window.__firebaseIdToken || '', role: role() });
  const matches = (first, second) => first.token === second.token && first.role === second.role;
  const abortError = () => new DOMException('Session changed.', 'AbortError');
  const discardChangedSession = () => {
    if (pending && !matches(pending, context())) {
      pending.controller.abort();
      pending = null;
    }
  };
  window.addEventListener('sentient-auth-changed', discardChangedSession);

  const read = () => {
    discardChangedSession();
    const current = context();
    if (!current.token) return Promise.reject(abortError());
    if (pending) return pending.promise;
    const request = { ...current, controller: new AbortController() };
    pending = request;
    request.promise = (async () => {
      const headers = { Authorization: `Bearer ${request.token}` };
      if (request.role) headers['X-Queue-Role-Preview'] = request.role;
      const response = await fetch('https://cortex-api-db2e.onrender.com/api/dashboard/me', {
        headers, signal: request.controller.signal,
      });
      if (!response.ok) throw new Error(`Could not verify workspace access (${response.status}).`);
      const viewer = await response.json();
      if (request.controller.signal.aborted || !matches(request, context())) throw abortError();
      return viewer;
    })().finally(() => { if (pending === request) pending = null; });
    return request.promise;
  };
  window.SentientViewerAccess = { read };
})();
