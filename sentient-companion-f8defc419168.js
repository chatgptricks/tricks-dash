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
  frame.setAttribute('allow', 'microphone; autoplay');
  frame.style.cssText = 'position:fixed;left:12px;top:12px;width:1px;height:1px;border:0;background:transparent;z-index:2147483647;color-scheme:dark;visibility:hidden;pointer-events:none;';
  frame.tabIndex = -1;
  const backdrop = document.createElement('div');
  backdrop.id = 'sentient-companion-backdrop'; backdrop.setAttribute('aria-hidden', 'true');
  backdrop.style.cssText = 'position:fixed;inset:0;z-index:2147483646;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);background:rgba(0,0,0,.08);pointer-events:none;display:none;';
  document.body.append(backdrop, frame);
  let state = 'hidden', dock = 'bottom-left', geometry, drag, menu, resultCount = 0, resultsVisible = false, pendingPointer = false, pointer;
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
    frame.style.clipPath = 'none';
    if (state === 'launch') {
      geometry = { x: left, y: top, width: w, height: h, ax: left, ay: top, aw: 0, ah: 0 };
      Object.assign(frame.style, { left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px', visibility: 'visible', pointerEvents: 'auto' });
      frame.tabIndex = 0; frame.dataset.dock = dock; frame.dataset.state = state;
      backdrop.style.display = 'block'; backdrop.style.pointerEvents = 'none';
      send({ type: 'geometry', state, dock, avatar: { x: 0, y: 0, w: 0, h: 0 }, panel: { x: 0, y: 0, w, h }, menu: null, results: null });
      return;
    }
    const aw = state === 'compact' ? 64 : 136, ah = state === 'compact' ? 68 : 146;
    const ax = right ? Math.max(left + 12, left + w - 12 - aw) : left + 12;
    const ay = dock.startsWith('top') ? top + 12 : dock.startsWith('middle') ? clamp(top + (h - ah) / 2, top + 12, top + h - bottom - ah) : Math.max(top + 12, top + h - bottom - ah);
    const resultsAbove = dock.startsWith('bottom');
    const showResults = state === 'closed' && resultCount > 0 && !menu && resultsVisible;
    const rw = showResults ? Math.min(216, Math.max(0, w - 24)) : 0;
    // Keep the character at its dock. Bottom stacks grow upward; top and
    // middle stacks grow downward and scroll inside the remaining space.
    const resultSpace = resultsAbove ? ay - top - 12 - 8 : top + h - bottom - ay - ah - 8;
    const rh = showResults ? Math.min(resultCount * 39 - 10, Math.max(0, resultSpace)) : 0;
    const rx = showResults ? clamp(right ? ax + aw - rw : ax, left + 12, left + w - 12 - rw) : ax;
    const ry = showResults ? (resultsAbove ? ay - rh - 8 : ay + ah + 8) : ay;
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
    let mx = ax, my = ay, mw = 0, mh = 0, menuOrigin;
    if (menu) {
      mw = Math.min(menu.width, Math.max(0, w - 24)); mh = Math.min(menu.height, Math.max(0, h - 24));
      if (menu.anchor && state === 'open') {
        // Header offsets are relative to the chat panel's top/right edges, so
        // expanding the iframe or resizing the viewport cannot move the anchor.
        const triggerWidth = Math.min(menu.anchor.w, pw), triggerHeight = Math.min(menu.anchor.h, ph);
        const tx = px + clamp(pw - menu.anchor.right - triggerWidth, 0, pw - triggerWidth);
        const ty = py + clamp(menu.anchor.top, 0, ph - triggerHeight);
        const above = Math.max(0, ty - top - 18), below = Math.max(0, top + h - 18 - ty - triggerHeight);
        const placeBelow = below >= mh || below >= above;
        mh = Math.min(mh, placeBelow ? below : above);
        mx = clamp(tx + triggerWidth - mw, left + 12, left + w - 12 - mw);
        my = placeBelow ? ty + triggerHeight + 6 : ty - mh - 6;
        menuOrigin = { x: clamp(tx + triggerWidth / 2 - mx, 0, mw), y: placeBelow ? 0 : mh };
      } else {
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
        menuOrigin = { x: clamp(ax + aw / 2 - mx, 0, mw), y: clamp(ay + ah / 2 - my, 0, mh) };
      }
    }
    const x = Math.min(ax, px, mx, rx), y = Math.min(ay, py, my, ry);
    const width = Math.max(ax + aw, px + pw, mx + mw, rx + rw) - x, height = Math.max(ay + ah, py + ph, my + mh, ry + rh) - y;
    geometry = { x, y, width, height, ax, ay, aw, ah };
    Object.assign(frame.style, { left: x + 'px', top: y + 'px', width: width + 'px', height: height + 'px', visibility: state === 'hidden' ? 'hidden' : 'visible', pointerEvents: state === 'hidden' ? 'none' : 'auto' });
    // Clip hit testing as well as painting: transparent space beside the avatar
    // must leave dashboard controls clickable while a wider result tray is shown.
    if (showResults) frame.style.clipPath = 'path("M' + (ax - x) + ' ' + (ay - y) + 'h' + aw + 'v' + ah + 'h-' + aw + 'Z M' + (rx - x) + ' ' + (ry - y) + 'h' + rw + 'v' + rh + 'h-' + rw + 'Z")';
    frame.tabIndex = state === 'hidden' ? -1 : 0;
    backdrop.style.display = state === 'open' ? 'block' : 'none';
    backdrop.style.pointerEvents = state === 'open' ? 'auto' : 'none';
    frame.dataset.dock = dock; frame.dataset.state = state;
    send({ type: 'geometry', state, dock, avatar: { x: ax - x, y: ay - y, w: aw, h: ah }, panel: { x: px - x, y: py - y, w: pw, h: ph }, menu: menu ? { x: mx - x, y: my - y, w: mw, h: mh, origin: menuOrigin } : null, results: showResults ? { x: rx - x, y: ry - y, w: rw, h: rh } : null });
  };
  function dismissMenu() {
    if (!menu) return;
    menu = null; resize(); send({ type: 'dismiss-menu' });
  }
  function minimize() { if (state === 'launch') return; state = 'closed'; menu = null; drag = null; resize(); }
  backdrop.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); minimize(); send({ type: 'minimize' }); });
  function postKeyFor(target) {
    if (!/^\/(?:index\.html|mobile\/(?:index\.html)?)?$/.test(target.pathname)) return null;
    try {
      let key = target.searchParams.get('post');
      const route = target.searchParams.get('r');
      if (key === null && route && route.length <= 4000) {
        const normalized = route.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
        key = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), char => char.charCodeAt(0))))?.post;
      }
      if (typeof key !== 'string' || !/^[a-z\d_.]{1,64}:[a-z\d_-]{1,100}$/i.test(key)) return null;
      const [account, code] = key.split(':');
      return account.toLowerCase() + ':' + code;
    } catch { return null; }
  }
  function navigate(value) {
    if (typeof value !== 'string' || value.length > 8000) return;
    let target;
    try { target = new URL(value, location.origin); } catch { return; }
    if (target.origin !== location.origin || target.username || target.password || !allowed.test(target.pathname)) return;
    minimize();
    const postKey = postKeyFor(target);
    if (postKey && /^\/(?:index\.html|mobile\/(?:index\.html)?)?$/.test(location.pathname)) {
      // Research accepts posts in its authorized catalogue and switches its
      // existing inspector. Other pages or unhandled posts keep normal routing.
      const event = new CustomEvent('sentient:open-post', { detail: { postKey }, cancelable: true });
      if (!window.dispatchEvent(event)) return;
    }
    location.assign(target.href);
  }
  function showResearch(filters, voice) {
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
    const destination = '/index.html?' + params.toString();
    // Only a full automatic navigation needs a one-shot spoken continuation.
    // This is tab-local and owner-scoped; no token or audio crosses the bridge.
    if (voice && typeof voice.owner === 'string' && voice.owner.length > 0 && voice.owner.length <= 200
      && typeof voice.id === 'string' && voice.id.length > 0 && voice.id.length <= 200
      && typeof voice.text === 'string' && voice.text.trim() && voice.text.length <= 12000
      && typeof voice.question === 'string' && voice.question.length <= 4000
      && ['en', 'es'].includes(voice.language) && ['auto', 'filter', 'research', 'next'].includes(voice.mode)) {
      try {
        sessionStorage.setItem('sentient.pet.pendingVoice.' + voice.owner, JSON.stringify({
          version: 1, owner: voice.owner, id: voice.id, text: voice.text, question: voice.question,
          language: voice.language, mode: voice.mode, expectedDest: new URL(destination, location.origin).href,
          expiresAt: Date.now() + 90_000,
        }));
      } catch { /* Text and result history still survive without voice storage. */ }
    }
    location.assign(destination);
  }
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.source !== 'sentient-companion') return;
    const data = event.data;
    if (data.type === 'layout' && ['hidden', 'closed', 'open', 'compact', 'launch'].includes(data.state)) {
      state = data.state;
      menu = data.menu?.open && !['hidden', 'launch'].includes(state) ? { width: clamp(Number(data.menu.width) || 244, 160, 420), height: clamp(Number(data.menu.height) || 344, 100, 640) } : null;
      const anchor = data.menu?.anchor;
      if (menu && state === 'open' && anchor?.source === 'chat' && ['right', 'top', 'w', 'h'].every(key => Number.isFinite(anchor[key]) && anchor[key] >= 0 && anchor[key] < 10000) && anchor.w > 0 && anchor.h > 0) menu.anchor = { right: anchor.right, top: anchor.top, w: Math.min(anchor.w, 120), h: Math.min(anchor.h, 120) };
      resultCount = Number.isFinite(data.results?.count) && data.results.count > 0 ? clamp(Math.floor(data.results.count), 1, 10) : 0;
      resultsVisible = data.results?.visible === true;
      if (state === 'launch') drag = null;
      resize(); preferences();
    }
    if (data.type === 'ready') { if (positions.includes(data.dock)) dock = data.dock; resize(); preferences(); }
    if (data.type === 'navigate') navigate(data.url);
    if (data.type === 'research_filters') showResearch(data.filters, data.voiceHandoff);
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
      const maxTop = top + h - bottom - drag.ah;
      const ys = [top + 12, clamp(top + (h - drag.ah) / 2, top + 12, maxTop), Math.max(top + 12, maxTop)].map(value => value + drag.ah / 2);
      const vertical = ys.reduce((best, v, i) => Math.abs(v - y) <= Math.abs(ys[best] - y) ? i : best, 0);
      dock = ['top', 'middle', 'bottom'][vertical] + (x < left + w / 2 ? '-left' : '-right');
      drag = null; resize(); send({ type: 'docked', dock });
    }
  });
  window.addEventListener('resize', resize); window.visualViewport?.addEventListener('resize', resize); window.visualViewport?.addEventListener('scroll', resize);
  window.addEventListener('sentient:page-context', preferences);
  window.addEventListener('popstate', preferences);
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
