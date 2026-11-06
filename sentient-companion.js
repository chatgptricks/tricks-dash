/* Same-origin host for the optional companion; no credentials cross this bridge. */
(function () {
  const allowed = /^\/(?:index\.html|queue\.html|tracker\.html|insights\.html|settings\.html|promos\.html|news\.html|hooks\.html|vault\.html|mobile\/(?:index\.html)?)?$/;
  if (window.parent !== window || !allowed.test(location.pathname) || document.getElementById('sentient-companion-frame')) return;
  const positions = ['top-left', 'middle-left', 'bottom-left', 'top-right', 'middle-right', 'bottom-right'];
  const frame = document.createElement('iframe');
  frame.id = 'sentient-companion-frame'; frame.title = 'Sentient';
  const version = new URL(document.currentScript?.src || location.href).searchParams.get('v') || '20261106.1';
  frame.src = '/companion.html?v=' + encodeURIComponent(version);
  frame.setAttribute('aria-label', 'Sentient companion');
  frame.style.cssText = 'position:fixed;left:12px;top:12px;width:1px;height:1px;border:0;background:transparent;z-index:2147483647;color-scheme:dark;visibility:hidden;pointer-events:none;';
  frame.tabIndex = -1;
  const backdrop = document.createElement('div');
  backdrop.id = 'sentient-companion-backdrop'; backdrop.setAttribute('aria-hidden', 'true');
  backdrop.style.cssText = 'position:fixed;inset:0;z-index:2147483646;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);background:rgba(0,0,0,.08);pointer-events:none;display:none;';
  document.body.append(backdrop, frame);
  let state = 'hidden', dock = 'bottom-left', geometry, drag, pendingPointer = false, pointer;
  const clamp = (n, a, b) => Math.max(a, Math.min(Math.max(a, b), n));
  const send = value => frame.contentWindow?.postMessage({ source: 'sentient-host', ...value }, location.origin);
  const viewport = () => ({ w: window.visualViewport?.width || innerWidth, h: window.visualViewport?.height || innerHeight, bottom: innerWidth <= 760 && location.pathname.startsWith('/mobile') ? 82 : 12 });
  const preferences = () => {
    const root = document.documentElement;
    frame.style.colorScheme = root.dataset.theme === 'light' ? 'light' : 'dark';
    const style = getComputedStyle(root);
    const tokens = Object.fromEntries(Object.entries({ surface: '--surface-1', raised: '--surface-2', line: '--line', muted: '--muted-strong', text: '--text', accent: '--accent', accentInk: '--accent-ink' }).map(([name, variable]) => [name, style.getPropertyValue(variable).trim()]));
    send({ type: 'context', page: location.pathname, language: root.lang.startsWith('es') ? 'es' : 'en', theme: root.dataset.theme === 'light' ? 'light' : 'dark', tokens, font: getComputedStyle(document.body).fontFamily, radius: style.getPropertyValue('--radius-xl').trim() });
  };
  const resize = () => {
    const { w, h, bottom } = viewport(), right = dock.endsWith('right');
    const aw = state === 'compact' ? 64 : 136, ah = state === 'compact' ? 68 : 146;
    const ax = right ? w - 12 - aw : 12;
    const ay = dock.startsWith('top') ? 12 : dock.startsWith('middle') ? clamp((h - ah) / 2, 12, h - bottom - ah) : Math.max(12, h - bottom - ah);
    let px = ax, py = ay, pw = 0, ph = 0;
    if (state === 'open') {
      pw = Math.min(420, w - 24);
      if (dock.startsWith('middle') && w >= 620) {
        pw = Math.min(pw, w - aw - 36); ph = Math.min(540, h - bottom - 12);
        px = right ? ax - pw - 10 : ax + aw + 10;
        py = clamp(ay + ah / 2 - ph / 2, 12, h - bottom - ph);
      } else {
        px = right ? w - 12 - pw : 12;
        const above = !dock.startsWith('top');
        ph = Math.min(540, above ? ay - 22 : h - bottom - ay - ah - 10);
        ph = Math.max(100, ph);
        py = above ? ay - ph - 10 : ay + ah + 10;
      }
    }
    const x = Math.min(ax, px), y = Math.min(ay, py);
    const width = Math.max(ax + aw, px + pw) - x, height = Math.max(ay + ah, py + ph) - y;
    geometry = { x, y, width, height, ax, ay, aw, ah };
    Object.assign(frame.style, { left: x + 'px', top: y + 'px', width: width + 'px', height: height + 'px', visibility: state === 'hidden' ? 'hidden' : 'visible', pointerEvents: state === 'hidden' ? 'none' : 'auto' });
    frame.tabIndex = state === 'hidden' ? -1 : 0;
    backdrop.style.display = state === 'open' ? 'block' : 'none';
    frame.dataset.dock = dock; frame.dataset.state = state;
    send({ type: 'geometry', dock, avatar: { x: ax - x, y: ay - y, w: aw, h: ah }, panel: { x: px - x, y: py - y, w: pw, h: ph } });
  };
  function showResearch(filters) {
    if (!filters || typeof filters !== 'object') return;
    const params = new URLSearchParams();
    if (typeof filters.query === 'string') params.set('q', filters.query.slice(0, 200));
    if (filters.text_scope === 'caption') params.set('scope', 'caption');
    for (const [field, param] of [['min_likes', 'likes'], ['min_comments', 'comments']]) {
      if (Number.isSafeInteger(filters[field]) && filters[field] >= 0 && filters[field] <= 1e12) params.set(param, filters[field]);
    }
    if (Array.isArray(filters.accounts)) params.set('acc', filters.accounts.slice(0, 100).filter(a => typeof a === 'string' && /^[a-z\d_.]{1,64}$/i.test(a)).join(','));
    for (const [field, param] of [['from_date', 'from'], ['to_date', 'to']]) if (/^\d{4}-\d{2}-\d{2}$/.test(filters[field] || '')) params.set(param, filters[field]);
    if (['newest', 'oldest', 'likes-desc', 'comments-desc'].includes(filters.sort)) params.set('sort', filters.sort);
    if (filters.promos_only === true) params.set('promo', '1');
    if (['video', 'static'].includes(filters.media)) params.set('media', filters.media);
    // The Research page already restores all its real controls from shared URLs.
    location.assign('/index.html?' + params.toString());
  }
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.source !== 'sentient-companion') return;
    const data = event.data;
    if (data.type === 'layout' && ['hidden', 'closed', 'open', 'compact'].includes(data.state)) { state = data.state; resize(); preferences(); }
    if (data.type === 'ready') { if (positions.includes(data.dock)) dock = data.dock; resize(); preferences(); }
    if (data.type === 'research_filters') showResearch(data.filters);
    if (data.type === 'drag-start' && geometry) drag = { ...geometry };
    if (data.type === 'drag-move' && drag && Number.isFinite(data.dx) && Number.isFinite(data.dy)) {
      const { w, h } = viewport();
      frame.style.left = clamp(drag.x + data.dx, 0, w - drag.width) + 'px';
      frame.style.top = clamp(drag.y + data.dy, 0, h - drag.height) + 'px';
    }
    if (data.type === 'drag-end' && drag && Number.isFinite(data.dx) && Number.isFinite(data.dy)) {
      const { w, h, bottom } = viewport();
      const x = drag.ax + drag.aw / 2 + data.dx, y = drag.ay + drag.ah / 2 + data.dy;
      const ys = [12 + drag.ah / 2, h / 2, h - bottom - drag.ah / 2];
      const vertical = ys.reduce((best, v, i) => Math.abs(v - y) < Math.abs(ys[best] - y) ? i : best, 0);
      dock = ['top', 'middle', 'bottom'][vertical] + (x < w / 2 ? '-left' : '-right');
      drag = null; resize(); send({ type: 'docked', dock });
    }
  });
  window.addEventListener('resize', resize); window.visualViewport?.addEventListener('resize', resize);
  frame.addEventListener('load', () => { resize(); preferences(); });
  new MutationObserver(preferences).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'data-theme', 'style', 'class'] });
  window.addEventListener('pointermove', event => {
    if (!geometry) return;
    pointer = { x: clamp((event.clientX - geometry.ax - geometry.aw / 2) / 380, -1, 1), y: clamp((event.clientY - geometry.ay - geometry.ah / 2) / 320, -1, 1) };
    if (pendingPointer || !['open', 'closed'].includes(state)) return;
    pendingPointer = true; requestAnimationFrame(() => { pendingPointer = false; send({ type: 'pointer', ...pointer }); });
  }, { passive: true });
})();
