(() => {
  const ROLE_KEY = 'sentient.queueRolePreview';
  const API = 'https://cortex-api-db2e.onrender.com';
  const ALL_ROLES = ['sales', 'pd', 'vc', 'trainee', 'admin'];
  const LABELS = { sales: 'Sales', pd: 'Post Designer', vc: 'Viral Coordinator', trainee: 'Trainee', admin: 'Admin' };
  let mountRun = 0, mountedRoot = null, mountedStyle = null, outsideHandler = null, navTimer = null;
  const clearMount = () => {
    mountedRoot?.remove(); mountedRoot = null;
    mountedStyle?.remove(); mountedStyle = null;
    if (outsideHandler) document.removeEventListener('click', outsideHandler);
    outsideHandler = null;
    if (navTimer) window.clearInterval(navTimer);
    navTimer = null;
  };

  window.__sentientRolePreviewHeaders = (input = {}) => {
    const headers = { ...input };
    const role = window.sessionStorage.getItem(ROLE_KEY);
    if (role) headers['X-Queue-Role-Preview'] = role;
    return headers;
  };

  const waitForToken = async (run) => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (run !== mountRun) return '';
      if (window.__firebaseIdToken) return window.__firebaseIdToken;
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    return '';
  };

  const mount = async (wait = false) => {
    const run = ++mountRun;
    clearMount();
    const token = wait ? await waitForToken(run) : window.__firebaseIdToken;
    if (!token) return;
    const headers = window.__sentientRolePreviewHeaders({ Authorization: `Bearer ${token}` });
    let viewer;
    try {
      const response = await fetch(`${API}/api/dashboard/me`, { headers });
      if (!response.ok) return;
      viewer = await response.json();
    } catch {
      return;
    }
    if (run !== mountRun || token !== window.__firebaseIdToken) return;
    const isDev = Boolean(viewer.is_dev);
    if (!isDev && !viewer.can_role_switch) return;
    const allowed = isDev ? ALL_ROLES : (viewer.available_operating_roles || viewer.operating_roles || []);
    const options = [...new Set(allowed.filter((role) => ALL_ROLES.includes(role)))];
    const requestedRole = window.sessionStorage.getItem(ROLE_KEY) || '';
    const selected = options.includes(requestedRole) ? requestedRole : '';

    // Standalone Tracker/Insights pages do not share React's header. Keep the
    // same navigation contract here: Tracker is open to everyone, Insights is
    // coordinator-only, including when the page builds its header
    // asynchronously after this script has mounted.
    const applyCoordinatorNavigation = () => {
      if (run !== mountRun) return;
      const requested = window.sessionStorage.getItem(ROLE_KEY) || '';
      const activeRole = options.includes(requested) ? requested : '';
      const effectiveCoordinator = activeRole
        ? ['vc', 'admin'].includes(activeRole)
        : Boolean(viewer.is_dev || viewer.is_admin || (viewer.operating_roles || []).includes('vc'));
      document.querySelectorAll('a[href]').forEach((link) => {
        try {
          const path = new URL(link.href, window.location.href).pathname;
          if (/\/insights\.html$/i.test(path)) {
            link.hidden = !effectiveCoordinator;
            // Standalone styles assign `display:flex` to .linkbtn, which can
            // override the browser's default [hidden] rule. Set the inline
            // display explicitly so restricted links are actually invisible.
            link.style.display = effectiveCoordinator ? '' : 'none';
          }
        } catch {
          // An unrelated malformed link should never block the role switcher.
        }
      });
    };
    applyCoordinatorNavigation();
    // The standalone page creates its header after the data bootstrap. Poll
    // briefly instead of relying on MutationObserver, which is unavailable in
    // a few embedded browser contexts used by the static pages.
    const timer = window.setInterval(applyCoordinatorNavigation, 250);
    navTimer = timer;
    window.setTimeout(() => window.clearInterval(timer), 30000);

    const style = document.createElement('style');
    style.textContent = `
      a[hidden][href$="/insights.html"]{display:none!important}
      .sentient-role-preview{position:fixed;right:18px;bottom:18px;z-index:100;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
      .sentient-role-preview>button{display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:0 11px;border:1px solid rgba(var(--accent-rgb),.48);border-radius:9px;background:var(--panel);box-shadow:0 12px 30px rgba(var(--shade),.3);color:var(--text);font-size:12px;font-weight:760;cursor:pointer}
      .sentient-role-preview>button span{padding:2px 5px;border-radius:4px;background:var(--accent);color:var(--accent-ink);font-size:9px;font-weight:900;letter-spacing:.08em}
      .sentient-role-preview-panel{position:absolute;right:0;bottom:calc(100% + 8px);display:none;width:220px;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--panel);box-shadow:0 20px 50px rgba(var(--shade),.42)}
      .sentient-role-preview.is-open .sentient-role-preview-panel{display:block}
      .sentient-role-preview-panel strong{display:block;font-size:12px}.sentient-role-preview-panel p{margin:3px 0 12px;color:var(--muted);font-size:11px;line-height:1.35}
      .sentient-role-preview-panel label{display:grid;gap:5px;color:var(--muted);font-size:10px;font-weight:750;letter-spacing:.05em;text-transform:uppercase}
      .sentient-role-preview-panel select{width:100%;height:32px;border:1px solid var(--line);border-radius:7px;background:var(--panel-2);color:var(--text);font-size:12px;font-family:inherit;text-transform:none;letter-spacing:normal}
    `;
    document.head.append(style);
    mountedStyle = style;

    const root = document.createElement('div');
    root.className = 'sentient-role-preview';
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = `<span>${isDev ? 'DEV' : 'ROLE'}</span>${LABELS[selected] || (isDev ? 'Dev' : 'Role')}`;
    const panel = document.createElement('div');
    panel.className = 'sentient-role-preview-panel';
    panel.innerHTML = `<strong>${isDev ? 'Role preview' : 'Active role'}</strong><p>${isDev ? 'Preview any operating role.' : 'Switch among your assigned roles.'}</p><label>Active role<select><option value="">${isDev ? 'Dev · full access' : 'Use my default role'}</option>${options.map((role) => `<option value="${role}">${LABELS[role]}</option>`).join('')}</select></label>`;
    const select = panel.querySelector('select');
    select.value = options.includes(selected) ? selected : '';
    select.addEventListener('change', () => {
      if (select.value) window.sessionStorage.setItem(ROLE_KEY, select.value);
      else window.sessionStorage.removeItem(ROLE_KEY);
      window.location.reload();
    });
    button.addEventListener('click', () => {
      const open = root.classList.toggle('is-open');
      button.setAttribute('aria-expanded', String(open));
    });
    outsideHandler = (event) => {
      if (root.contains(event.target)) return;
      root.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
    };
    document.addEventListener('click', outsideHandler);
    root.append(button, panel);
    document.body.append(root);
    mountedRoot = root;
  };

  window.addEventListener('sentient-auth-changed', () => mount());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(true), { once: true });
  else mount(true);
})();
