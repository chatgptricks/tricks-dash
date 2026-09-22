(function () {
  var query = new URLSearchParams(location.search);
  var mobilePath = /^\/mobile(?:\/|$)/.test(location.pathname);
  // Window size, coarse pointers and touch support also occur on laptops.
  // Only an explicit mobile operating-system/device signal selects this app.
  var userAgent = navigator.userAgent || '';
  var platform = navigator.userAgentData && navigator.userAgentData.platform || '';
  var mobileDevice = /iPhone|iPad|iPod|Android|Windows Phone/i.test(userAgent)
    || /^(?:Android|iOS)$/i.test(platform);
  var forceDesktop = false;
  if (query.get('desktop') === '1') {
    try { sessionStorage.setItem('sentient.forceDesktop', '1'); } catch (_) {}
    forceDesktop = true;
  } else if (query.get('mobile') === '1') {
    try { sessionStorage.removeItem('sentient.forceDesktop'); } catch (_) {}
  } else {
    try { forceDesktop = sessionStorage.getItem('sentient.forceDesktop') === '1'; } catch (_) {}
  }
  var useMobile = mobileDevice && !forceDesktop;
  if (mobilePath === useMobile) return;
  if (useMobile && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return;
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
  var tab = state.tab || query.get('tab') || query.get('view') || (task ? 'queue' : post ? 'dashboard' : path.includes('queue') ? 'queue' : path.includes('tracker') ? 'tracker' : path.includes('insights') ? 'insights' : path.includes('settings') ? 'settings' : 'home');
  if (post) state.post = post;
  if (task) state.task = task;
  var desktopPaths = { home: '/', dashboard: '/', queue: '/queue.html', tracker: '/tracker.html', insights: '/insights.html', settings: '/settings.html' };
  var destination = new URL(useMobile ? '/mobile/' : desktopPaths[tab] || '/', location.origin);
  if (useMobile) state.tab = tab;
  else delete state.tab;
  query.forEach(function (value, key) {
    if (!['r', 'tab', 'view', 'post', 'task', 'mobile', 'desktop'].includes(key)) destination.searchParams.append(key, value);
  });
  if (forceDesktop) destination.searchParams.set('desktop', '1');
  destination.hash = location.hash;
  var route = Object.keys(state).length ? encodeRoute(state) : '';
  if (route) destination.searchParams.set('r', route);
  location.replace(destination.toString());
})();
