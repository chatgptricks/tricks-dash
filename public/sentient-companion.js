/* Same-origin host for the optional companion; no credentials cross this bridge. */
(function () {
  const allowed = /^\/(?:index\.html|queue\.html|tracker\.html|insights\.html|settings\.html|promos\.html|news\.html|hooks\.html|vault\.html|mobile\/(?:index\.html)?)?$/;
  if (window.parent !== window || !allowed.test(location.pathname) || document.getElementById('sentient-companion-frame')) return;
  const positions = ['top-left', 'middle-left', 'bottom-left', 'top-right', 'middle-right', 'bottom-right'];
  const frame = document.createElement('iframe');
  frame.id = 'sentient-companion-frame'; frame.title = 'Sentient';
  const scriptUrl = new URL(document.currentScript?.src || location.href);
  const version = scriptUrl.pathname.match(/sentient-companion-([a-f0-9]+)\.js$/)?.[1] || scriptUrl.searchParams.get('v') || '20261106.1';
  frame.src = '/companion.html?v=' + encodeURIComponent(version);
  frame.setAttribute('aria-label', 'Sentient companion');
  frame.style.cssText = 'position:fixed;left:12px;top:12px;width:1px;height:1px;border:0;background:transparent;z-index:2147483647;color-scheme:dark;visibility:hidden;pointer-events:none;';
  frame.tabIndex = -1;
  const backdrop = document.createElement('div');
  backdrop.id = 'sentient-companion-backdrop'; backdrop.setAttribute('aria-hidden', 'true');
  backdrop.style.cssText = 'position:fixed;inset:0;z-index:2147483646;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);background:rgba(0,0,0,.08);pointer-events:none;display:none;';
  document.body.append(backdrop, frame);
  let state = 'hidden', dock = 'bottom-left', geometry, drag, menu, resultCount = 0, pendingPointer = false, pointer;
  const clamp = (n, a, b) => Math.max(a, Math.min(Math.max(a, b), n));
  const send = value => frame.contentWindow?.postMessage({ source: 'sentient-host', ...value }, location.origin);
  const viewport = () => ({ w: window.visualViewport?.width || innerWidth, h: window.visualViewport?.height || innerHeight, left: window.visualViewport?.offsetLeft || 0, top: window.visualViewport?.offsetTop || 0, bottom: innerWidth <= 760 && location.pathname.startsWith('/mobile') ? 82 : 12 });
  const preferences = () => {
    const root = document.documentElement;
    frame.style.colorScheme = root.dataset.theme === 'light' ? 'light' : 'dark';
    const style = getComputedStyle(root);
    const tokens = Object.fromEntries(Object.entries({ surface: '--surface-1', raised: '--surface-2', line: '--line', muted: '--muted-strong', text: '--text', accent: '--accent', accentInk: '--accent-ink' }).map(([name, variable]) => [name, style.getPropertyValue(variable).trim()]));
    send({ type: 'context', page: location.pathname, pageUrl: location.href, language: root.lang.startsWith('es') ? 'es' : 'en', theme: root.dataset.theme === 'light' ? 'light' : 'dark', tokens, font: getComputedStyle(document.body).fontFamily, radius: style.getPropertyValue('--radius-xl').trim() });
  };
  const resize = () => {
    const { w, h, left, top, bottom } = viewport(), right = dock.endsWith('right');
    if (state === 'launch') {
      geometry = { x: left, y: top, width: w, height: h, ax: left, ay: top, aw: 0, ah: 0 };
      Object.assign(frame.style, { left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px', visibility: 'visible', pointerEvents: 'auto' });
      frame.tabIndex = 0; frame.dataset.dock = dock; frame.dataset.state = state;
      backdrop.style.display = 'block'; backdrop.style.pointerEvents = 'none';
      send({ type: 'geometry', dock, avatar: { x: 0, y: 0, w: 0, h: 0 }, panel: { x: 0, y: 0, w, h }, menu: null, results: null });
      return;
    }
    const aw = state === 'compact' ? 64 : 136, ah = state === 'compact' ? 68 : 146;
    const ax = right ? Math.max(left + 12, left + w - 12 - aw) : left + 12;
    let ay = dock.startsWith('top') ? top + 12 : dock.startsWith('middle') ? clamp(top + (h - ah) / 2, top + 12, top + h - bottom - ah) : Math.max(top + 12, top + h - bottom - ah);
    const showResults = state === 'closed' && !menu && resultCount > 0;
    const rw = showResults ? Math.min(384, Math.max(0, w - 24), Math.max(136, resultCount * 118 + 24)) : 0;
    const rh = showResults ? Math.min(72, Math.max(0, h - bottom - 12 - ah - 8)) : 0;
    if (showResults) ay = clamp(ay, top + 12, top + h - bottom - ah - rh - 8);
    const rx = showResults ? clamp(right ? ax + aw - rw : ax, left + 12, left + w - 12 - rw) : ax;
    const ry = showResults ? ay + ah + 8 : ay;
    let px = ax, py = ay, pw = 0, ph = 0;
    if (state === 'open') {
      pw = Math.max(0, Math.min(420, w - 24));
      if (dock.startsWith('middle') && w >= 620) {
        pw = Math.min(pw, w - aw - 36); ph = Math.min(540, h - bottom - 12);
        px = right ? ax - pw - 10 : ax + aw + 10;
        py = clamp(ay + ah / 2 - ph / 2, top + 12, top + h - bottom - ph);
      } else {
        px = right ? left + w - 12 - pw : left + 12;
        const above = !dock.startsWith('top');
        const available = above ? ay - top - 22 : top + h - bottom - ay - ah - 10;
        // A software keyboard can leave less room than the avatar plus a panel.
        // Keep the panel inside the visible viewport rather than forcing it above it.
        ph = Math.max(0, Math.min(540, available >= 200 ? available : h - bottom - 12));
        py = clamp(above ? ay - ph - 10 : ay + ah + 10, top + 12, top + h - bottom - ph);
      }
    }
    let mx = ax, my = ay, mw = 0, mh = 0;
    if (menu) {
      mw = Math.min(menu.width, Math.max(0, w - 24)); mh = Math.min(menu.height, Math.max(0, h - 24));
      const besideRoom = right ? ax - left - 20 : left + w - 12 - ax - aw - 8;
      if (besideRoom >= 200) {
        mw = Math.min(mw, besideRoom);
        mx = right ? ax - mw - 8 : ax + aw + 8;
        my = clamp(ay + ah / 2 - mh / 2, top + 12, top + h - 12 - mh);
      } else {
        mx = clamp(ax, left + 12, left + w - 12 - mw);
        const above = ay - top - 20, below = top + h - 12 - ay - ah - 8;
        my = clamp(above >= below ? ay - mh - 8 : ay + ah + 8, top + 12, top + h - 12 - mh);
      }
    }
    const x = Math.min(ax, px, mx, rx), y = Math.min(ay, py, my, ry);
    const width = Math.max(ax + aw, px + pw, mx + mw, rx + rw) - x, height = Math.max(ay + ah, py + ph, my + mh, ry + rh) - y;
    geometry = { x, y, width, height, ax, ay, aw, ah, extraHeight: showResults ? rh + 8 : 0 };
    Object.assign(frame.style, { left: x + 'px', top: y + 'px', width: width + 'px', height: height + 'px', visibility: state === 'hidden' ? 'hidden' : 'visible', pointerEvents: state === 'hidden' ? 'none' : 'auto' });
    frame.tabIndex = state === 'hidden' ? -1 : 0;
    backdrop.style.display = state === 'open' ? 'block' : 'none';
    backdrop.style.pointerEvents = state === 'open' ? 'auto' : 'none';
    frame.dataset.dock = dock; frame.dataset.state = state;
    send({ type: 'geometry', dock, avatar: { x: ax - x, y: ay - y, w: aw, h: ah }, panel: { x: px - x, y: py - y, w: pw, h: ph }, menu: menu ? { x: mx - x, y: my - y, w: mw, h: mh } : null, results: showResults ? { x: rx - x, y: ry - y, w: rw, h: rh } : null });
  };
  function dismissMenu() {
    if (!menu) return;
    menu = null; resize(); send({ type: 'dismiss-menu' });
  }
  function minimize() { if (state === 'launch') return; state = 'closed'; menu = null; drag = null; resize(); }
  backdrop.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); minimize(); send({ type: 'minimize' }); });
  function navigate(value) {
    if (typeof value !== 'string' || value.length > 8000) return;
    let target;
    try { target = new URL(value, location.origin); } catch { return; }
    if (target.origin !== location.origin || target.username || target.password || !allowed.test(target.pathname)) return;
    minimize();
    location.assign(target.href);
  }
  function showResearch(filters) {
    const fields = ['query', 'min_likes', 'min_comments', 'accounts', 'from_date', 'to_date', 'sort', 'post_type', 'promos_only', 'collabs_only'];
    if (!filters || typeof filters !== 'object' || Object.keys(filters).some(key => !fields.includes(key))) return;
    if (!['All posts', 'Carousel', 'Video', 'Image'].includes(filters.post_type) || !['newest', 'oldest', 'likes-desc', 'comments-desc', 'hot-rate'].includes(filters.sort)) return;
    minimize();
    const params = new URLSearchParams();
    if (typeof filters.query === 'string') params.set('q', filters.query.slice(0, 200));
    for (const [field, param] of [['min_likes', 'likes'], ['min_comments', 'comments']]) {
      if (Number.isSafeInteger(filters[field]) && filters[field] >= 0 && filters[field] <= 1e12) params.set(param, filters[field]);
    }
    if (Array.isArray(filters.accounts)) params.set('acc', filters.accounts.slice(0, 100).filter(a => typeof a === 'string' && /^[a-z\d_.]{1,64}$/i.test(a)).join(','));
    for (const [field, param] of [['from_date', 'from'], ['to_date', 'to']]) if (/^\d{4}-\d{2}-\d{2}$/.test(filters[field] || '')) params.set(param, filters[field]);
    params.set('sort', filters.sort);
    params.set('type', filters.post_type);
    if (filters.promos_only === true) params.set('promo', '1');
    if (filters.collabs_only === true) params.set('collab', '1');
    // Use the mounted controls without reloading the post library. Other tools
    // navigate to Research, whose controls restore the same shared URL values.
    if (/^\/(?:index\.html)?$/.test(location.pathname)) {
      const event = new CustomEvent('sentient:research-filters', { detail: filters, cancelable: true });
      if (!window.dispatchEvent(event)) return;
    }
    location.assign('/index.html?' + params.toString());
  }
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.source !== 'sentient-companion') return;
    const data = event.data;
    if (data.type === 'layout' && ['hidden', 'closed', 'open', 'compact', 'launch'].includes(data.state)) {
      state = data.state;
      menu = data.menu?.open && !['hidden', 'launch'].includes(state) ? { width: clamp(Number(data.menu.width) || 244, 160, 420), height: clamp(Number(data.menu.height) || 344, 100, 640) } : null;
      resultCount = data.results?.visible === true && Number.isFinite(data.results.count) && data.results.count > 0 ? clamp(Math.floor(data.results.count), 1, 10) : 0;
      if (state === 'launch') drag = null;
      resize(); preferences();
    }
    if (data.type === 'ready') { if (positions.includes(data.dock)) dock = data.dock; resize(); preferences(); }
    if (data.type === 'navigate') navigate(data.url);
    if (data.type === 'research_filters') showResearch(data.filters);
    if (data.type === 'dock' && positions.includes(data.dock)) { dock = data.dock; drag = null; dismissMenu(); resize(); send({ type: 'docked', dock }); }
    if (data.type === 'drag-start' && geometry && !['hidden', 'launch'].includes(state)) { dismissMenu(); drag = { ...geometry }; }
    if (data.type === 'drag-cancel' && drag) { drag = null; resize(); }
    if (data.type === 'drag-move' && drag && Number.isFinite(data.dx) && Number.isFinite(data.dy)) {
      const { w, h, left, top } = viewport();
      frame.style.left = clamp(drag.x + data.dx, left, left + w - drag.width) + 'px';
      frame.style.top = clamp(drag.y + data.dy, top, top + h - drag.height) + 'px';
    }
    if (data.type === 'drag-end' && drag && Number.isFinite(data.dx) && Number.isFinite(data.dy)) {
      const { w, h, left, top, bottom } = viewport();
      const x = drag.ax + drag.aw / 2 + data.dx, y = drag.ay + drag.ah / 2 + data.dy;
      const maxTop = top + h - bottom - drag.ah - drag.extraHeight;
      const ys = [top + 12, clamp(top + (h - drag.ah) / 2, top + 12, maxTop), Math.max(top + 12, maxTop)].map(value => value + drag.ah / 2);
      const vertical = ys.reduce((best, v, i) => Math.abs(v - y) <= Math.abs(ys[best] - y) ? i : best, 0);
      dock = ['top', 'middle', 'bottom'][vertical] + (x < left + w / 2 ? '-left' : '-right');
      drag = null; resize(); send({ type: 'docked', dock });
    }
  });
  window.addEventListener('resize', resize); window.visualViewport?.addEventListener('resize', resize); window.visualViewport?.addEventListener('scroll', resize);
  window.addEventListener('pointerdown', dismissMenu);
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (menu) dismissMenu();
    else if (state === 'open') { minimize(); send({ type: 'minimize' }); }
  });
  frame.addEventListener('load', () => { resize(); preferences(); });
  new MutationObserver(preferences).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'data-theme', 'style', 'class'] });
  window.addEventListener('pointermove', event => {
    if (!geometry) return;
    pointer = { x: clamp((event.clientX - geometry.ax - geometry.aw / 2) / 380, -1, 1), y: clamp((event.clientY - geometry.ay - geometry.ah / 2) / 320, -1, 1) };
    if (pendingPointer || !['open', 'closed'].includes(state)) return;
    pendingPointer = true; requestAnimationFrame(() => { pendingPointer = false; send({ type: 'pointer', ...pointer }); });
  }, { passive: true });
})();
