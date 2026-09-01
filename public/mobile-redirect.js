(function () {
  if (location.pathname.startsWith('/mobile/')) return;
  var query = new URLSearchParams(location.search);
  if (query.get('desktop') === '1') {
    try { sessionStorage.setItem('sentient.forceDesktop', '1'); } catch (_) {}
    return;
  }
  if (query.get('mobile') === '1') {
    try { sessionStorage.removeItem('sentient.forceDesktop'); } catch (_) {}
  } else {
    try { if (sessionStorage.getItem('sentient.forceDesktop') === '1') return; } catch (_) {}
  }
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return;
  var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var narrow = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
  var phone = /iPhone|iPod|Android.+Mobile|Windows Phone/i.test(navigator.userAgent || '');
  if (!(phone || (coarse && narrow))) return;
  function decodeRoute(token) {
    if (!token) return null;
    try {
      var normalized = String(token).replace(/-/g, '+').replace(/_/g, '/');
      normalized += '='.repeat((4 - (normalized.length % 4)) % 4);
      var binary = atob(normalized);
      var bytes = Uint8Array.from(binary, function (c) { return c.charCodeAt(0); });
      var value = JSON.parse(new TextDecoder().decode(bytes));
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch (_) { return null; }
  }
  function encodeRoute(state) {
    try {
      var bytes = new TextEncoder().encode(JSON.stringify(state || {}));
      var binary = ''; bytes.forEach(function (byte) { binary += String.fromCharCode(byte); });
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    } catch (_) { return ''; }
  }
  var path = location.pathname;
  var state = decodeRoute(query.get('r')) || {};
  var post = query.get('post') || state.post;
  var task = query.get('task') || state.task;
  var tab = state.tab || (task ? 'queue' : post ? 'dashboard' : path.includes('queue') ? 'queue' : path.includes('tracker') ? 'tracker' : path.includes('insights') ? 'insights' : path.includes('settings') ? 'settings' : 'home');
  state.tab = tab;
  if (post) state.post = post;
  if (task) state.task = task;
  var destination = new URL('/mobile/', location.origin);
  var route = encodeRoute(state);
  if (route) destination.searchParams.set('r', route);
  location.replace(destination.toString());
})();
