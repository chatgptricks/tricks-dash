// Per-user interface preferences live on the server, so they follow the person
// to every device. localStorage keeps only a first-paint copy (no flash of the
// wrong theme or language); the server's values overwrite it on every load.
//
// Shared by the React pages (imported) and the static Tracker/Insights pages
// (loaded as a script). Pages call load() once signed in, save() on a user
// change, and listen for the `sentient-preferences` event to apply values.
(() => {
  if (window.SentientPreferences) return;
  const API = 'https://cortex-api-db2e.onrender.com';
  const PATH = '/api/dashboard/me/preferences';
  const HEX = /^#[0-9a-f]{6}$/;
  const HANDLE = /^[a-z0-9._]{1,60}$/;
  const text = (value) => String(value ?? '').trim().toLowerCase();
  // Server key -> first-paint cache keys, cache (de)serialization, and the
  // same validation the server applies, so a stale local value never blocks
  // the one-time upload of the others.
  const PREFERENCES = {
    language: { keys: ['sentient.lang', 'sentient.language'], valid: (v) => ['en', 'es'].includes(v) },
    theme: { keys: ['sentient.theme'], valid: (v) => ['dark', 'light'].includes(v) },
    accent: { keys: ['sentient.accent'], valid: (v) => ['green', 'lime', 'blue', 'coral'].includes(text(v)) || HEX.test(text(v)) },
    accentCustom: { keys: ['sentient.accentCustom'], valid: (v) => HEX.test(text(v)) },
    effects: { keys: ['sentient.effects'], valid: (v) => ['immersive', 'subtle', 'off'].includes(v) },
    queueGuideCompleted: {
      keys: ['sentient.queueGuide.v1'],
      toCache: (v) => (v ? 'completed' : null),
      fromCache: (raw) => (raw ? true : undefined),
      valid: (v) => typeof v === 'boolean',
    },
    trackerFavorites: {
      keys: ['sentient.tracker.favs'],
      toCache: (v) => JSON.stringify(v),
      fromCache: (raw) => { try { const list = JSON.parse(raw); return Array.isArray(list) ? list : undefined; } catch { return undefined; } },
      valid: (v) => Array.isArray(v) && v.length <= 500 && v.every((handle) => HANDLE.test(text(handle).replace(/^@/, ''))),
    },
    // Keyed per signed-in person, since a browser can be shared.
    queueDesignerScope: { perUser: 'sentient.queueDesignerScope.v1:', valid: (v) => typeof v === 'string' && v.length <= 200 },
  };

  let email = '';
  let transport = null;
  let loaded = false;
  let current = {};
  let pending = {};
  let timer = 0;
  const LANGUAGE_PENDING = 'sentient.language.pending';
  const pendingLanguage = () => {
    try { const value = localStorage.getItem(LANGUAGE_PENDING); return PREFERENCES.language.valid(value) ? value : undefined; } catch { return undefined; }
  };

  const cacheKeys = (key) => {
    const spec = PREFERENCES[key];
    if (spec.perUser) return email ? [spec.perUser + email] : [];
    return spec.keys;
  };
  const writeCache = (key, value) => {
    const spec = PREFERENCES[key];
    const cached = value == null ? null : spec.toCache ? spec.toCache(value) : String(value);
    for (const cacheKey of cacheKeys(key)) {
      try {
        if (cached == null || cached === '') localStorage.removeItem(cacheKey);
        else localStorage.setItem(cacheKey, cached);
      } catch { /* storage unavailable: the server still has it */ }
    }
  };
  const readCache = (key) => {
    const spec = PREFERENCES[key];
    for (const cacheKey of cacheKeys(key)) {
      let raw = null;
      try { raw = localStorage.getItem(cacheKey); } catch { return undefined; }
      if (raw == null || raw === '') continue;
      return spec.fromCache ? spec.fromCache(raw) : raw;
    }
    return undefined;
  };
  const authorizedFetch = (url, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (window.__firebaseIdToken) headers.Authorization = `Bearer ${window.__firebaseIdToken}`;
    return fetch(url, { ...options, headers });
  };

  const send = async (changes) => {
    try {
      const response = await transport.fetch(transport.base + PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: changes }),
      });
      // A rejected value will never succeed; only retry transient failures.
      if (!response.ok && response.status >= 500) throw new Error(String(response.status));
      if (response.ok && changes.language === pendingLanguage()) {
        try { localStorage.removeItem(LANGUAGE_PENDING); } catch { /* cache unavailable */ }
      }
    } catch {
      for (const [key, value] of Object.entries(changes)) if (!(key in pending)) pending[key] = value;
      schedule(5000);
    }
  };
  const flush = () => {
    timer = 0;
    if (!loaded || !transport || !Object.keys(pending).length) return;
    const changes = pending;
    pending = {};
    send(changes);
  };
  const schedule = (delay = 300) => {
    if (!timer) timer = window.setTimeout(flush, delay);
  };

  const save = (key, value) => {
    const spec = PREFERENCES[key];
    if (!spec) return;
    const cleared = value == null || value === '' || value === false;
    if (!cleared && !spec.valid(value)) return;
    const stored = cleared ? null : value;
    if (stored == null) delete current[key];
    else current[key] = stored;
    writeCache(key, stored);
    if (key === 'language' && stored) {
      try { localStorage.setItem(LANGUAGE_PENDING, stored); } catch { /* cache unavailable */ }
    }
    pending[key] = stored;
    schedule();
  };

  const load = async ({ fetch: fetchFn = authorizedFetch, base = API, email: owner = '' } = {}) => {
    email = text(owner);
    transport = { fetch: fetchFn, base: String(base).replace(/\/$/, '') };
    let server;
    try {
      const response = await transport.fetch(transport.base + PATH);
      if (!response.ok) return null;
      server = (await response.json())?.preferences || {};
    } catch {
      return null;
    }
    const selectedLanguage = pendingLanguage();
    if (selectedLanguage && !('language' in pending)) pending.language = selectedLanguage;
    // First sign-in after preferences moved to the server: keep this
    // browser's settings by uploading any the server does not have yet.
    for (const key of Object.keys(PREFERENCES)) {
      if (key in server || key in pending) continue;
      const local = readCache(key);
      if (local !== undefined && PREFERENCES[key].valid(local)) pending[key] = local;
    }
    // A change made in this tab before the server answered is newer.
    current = { ...server };
    for (const [key, value] of Object.entries(pending)) {
      if (value == null) delete current[key];
      else current[key] = value;
    }
    for (const [key, value] of Object.entries(server)) if (!(key in pending)) writeCache(key, value);
    loaded = true;
    schedule(0);
    window.dispatchEvent(new window.CustomEvent('sentient-preferences', { detail: { ...current } }));
    return { ...current };
  };

  // Former browser-only copies of server data (Queue schedule drafts and the
  // Settings import queue). The server owns both; drop the stale copies.
  const clearLegacyCopies = () => {
    try {
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index) || '';
        if (key.startsWith('sentient.queueDrafts.') || key === 'sentientdash.settings.accountBackfills.v1') localStorage.removeItem(key);
      }
    } catch { /* storage unavailable */ }
  };
  clearLegacyCopies();

  const get = (key) => (loaded ? current[key] : readCache(key));

  window.SentientPreferences = { load, save, get };
  window.addEventListener('storage', (event) => {
    if (event.key !== LANGUAGE_PENDING || !PREFERENCES.language.valid(event.newValue)) return;
    save('language', event.newValue);
    window.dispatchEvent(new window.CustomEvent('sentient-preferences', { detail: { ...current } }));
  });
})();
