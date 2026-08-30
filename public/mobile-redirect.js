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
  var path = location.pathname;
  var post = query.get('post');
  var task = query.get('task');
  var tab = task ? 'queue' : post ? 'dashboard' : path.includes('queue') ? 'queue' : path.includes('tracker') ? 'tracker' : path.includes('insights') ? 'insights' : path.includes('settings') ? 'settings' : 'home';
  var destination = new URL('/mobile/', location.origin);
  destination.searchParams.set('tab', tab);
  if (post) destination.searchParams.set('post', post);
  if (task) destination.searchParams.set('task', task);
  location.replace(destination.toString());
})();
