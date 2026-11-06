/* Same-origin host for the optional companion; no credentials cross this bridge. */
(function () {
  const allowed = /^\/(?:index\.html|queue\.html|tracker\.html|insights\.html|settings\.html|promos\.html|news\.html|hooks\.html|vault\.html|mobile\/(?:index\.html)?)?$/;
  if (window.parent !== window || !allowed.test(location.pathname) || document.getElementById('sentient-companion-frame')) return;
  const frame = document.createElement('iframe');
  frame.id = 'sentient-companion-frame';
  frame.title = 'Sentient';
  frame.src = '/companion.html';
  frame.setAttribute('aria-label', 'Sentient companion');
  frame.style.cssText = 'position:fixed;left:12px;bottom:12px;width:1px;height:1px;border:0;background:transparent;z-index:850;color-scheme:dark;visibility:hidden;pointer-events:none;';
  frame.tabIndex = -1;
  document.body.append(frame);
  let state = 'hidden', pendingPointer = false, pointer;
  const send = value => frame.contentWindow?.postMessage({ source: 'sentient-host', ...value }, location.origin);
  const preferences = () => {
    const root = document.documentElement;
    frame.style.colorScheme = root.dataset.theme === 'light' ? 'light' : 'dark';
    const style = getComputedStyle(root);
    const tokens = Object.fromEntries(Object.entries({ surface: '--surface-1', raised: '--surface-2', line: '--line', muted: '--muted-strong', text: '--text', accent: '--accent', accentInk: '--accent-ink' }).map(([name, variable]) => [name, style.getPropertyValue(variable).trim()]));
    send({ type: 'context', page: location.pathname, language: root.lang.startsWith('es') ? 'es' : 'en', theme: root.dataset.theme === 'light' ? 'light' : 'dark', tokens, font: getComputedStyle(document.body).fontFamily, radius: style.getPropertyValue('--radius-xl').trim() });
  };
  const resize = () => {
    const mobile = innerWidth <= 760;
    const bottom = mobile && location.pathname.startsWith('/mobile') ? 82 : 12;
    const viewportHeight = window.visualViewport?.height || innerHeight;
    frame.style.bottom = bottom + 'px';
    frame.style.width = (state === 'open' ? Math.min(440, innerWidth - 24) : state === 'hidden' ? 1 : 64) + 'px';
    frame.style.height = (state === 'open' ? Math.min(690, viewportHeight - bottom - 12) : state === 'hidden' ? 1 : 68) + 'px';
    frame.style.visibility = state === 'hidden' ? 'hidden' : 'visible';
    frame.style.pointerEvents = state === 'hidden' ? 'none' : 'auto';
    frame.tabIndex = state === 'hidden' ? -1 : 0;
  };
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.source !== 'sentient-companion') return;
    if (event.data.type === 'layout' && ['hidden', 'closed', 'open', 'compact'].includes(event.data.state)) {
      state = event.data.state; resize(); preferences();
    }
    if (event.data.type === 'ready') preferences();
  });
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  frame.addEventListener('load', preferences);
  new MutationObserver(preferences).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'data-theme', 'style', 'class'] });
  window.addEventListener('pointermove', event => {
    pointer = { x: Math.max(-1, Math.min(1, (event.clientX - 80) / 380)), y: Math.max(-1, Math.min(1, (event.clientY - (innerHeight - 85)) / 320)) };
    if (pendingPointer || state !== 'open') return;
    pendingPointer = true;
    requestAnimationFrame(() => { pendingPointer = false; send({ type: 'pointer', ...pointer }); });
  }, { passive: true });
})();
