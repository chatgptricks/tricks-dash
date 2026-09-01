/* Sentient Dash global contextual menu.
 *
 * The React and standalone tools intentionally share this small, dependency-
 * free layer. Components opt into richer actions with data-context-* attrs;
 * otherwise the menu falls back to safe, useful actions for the current
 * surface. Queue's scheduler keeps its own purpose-built menu (its handlers
 * preventDefault before this document listener runs).
 */
(function () {
  'use strict';

  var MENU_ID = 'sentient-global-context-menu';
  var STYLE_ID = 'sentient-global-context-style';
  var activeTarget = null;

  var css = [
    '.sentient-context-menu{position:fixed;z-index:10000;min-width:208px;max-width:300px;padding:5px;border:1px solid rgba(var(--edge,255,255,255),.18);border-radius:12px;background:var(--panel,#151515);box-shadow:0 18px 44px rgba(0,0,0,.42),0 0 0 1px rgba(0,0,0,.2);color:var(--text,#f5f5f5);font:600 12px/1.25 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;backdrop-filter:blur(16px)}',
    '.sentient-context-menu[hidden]{display:none}',
    '.sentient-context-menu-label{padding:7px 9px 5px;color:var(--muted,#929292);font-size:9px;font-weight:850;letter-spacing:.09em;text-transform:uppercase;white-space:normal;overflow-wrap:anywhere;line-height:1.25}',
    '.sentient-context-menu button{display:flex;align-items:center;gap:9px;width:100%;min-height:34px;margin:1px 0;padding:7px 9px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--text,#f5f5f5);font:inherit;text-align:left;white-space:normal;overflow-wrap:anywhere;cursor:pointer}',
    '.sentient-context-menu button:hover,.sentient-context-menu button:focus-visible{border-color:rgba(var(--accent-rgb,176,255,0),.42);background:rgba(var(--accent-rgb,176,255,0),.12);outline:none}',
    '.sentient-context-menu button.is-primary{color:var(--accent-text,var(--accent,#d9ff00));}',
    '.sentient-context-menu button.is-danger{color:#ff9898}',
    '.sentient-context-menu button svg{width:14px;height:14px;flex:0 0 auto;opacity:.8}',
    '.sentient-context-menu-divider{height:1px;margin:5px 4px;background:rgba(var(--edge,255,255,255),.1)}',
    ':root[data-theme="light"] .sentient-context-menu{box-shadow:0 18px 44px rgba(0,0,0,.16)}'
  ].join('');

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function language() {
    var lang = document.documentElement.lang || '';
    try { lang = localStorage.getItem('sentient.language') || lang; } catch (_) {}
    return String(lang).toLowerCase().indexOf('es') === 0 ? 'es' : 'en';
  }

  function copyText(value) {
    var text = String(value || '').trim();
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {});
      return;
    }
    var helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    try { document.execCommand('copy'); } catch (_) {}
    helper.remove();
  }

  function closeMenu() {
    var existing = document.getElementById(MENU_ID);
    if (existing) existing.remove();
    activeTarget = null;
  }

  function dispatch(action, target, extra) {
    try {
      window.dispatchEvent(new CustomEvent('sentient:context-action', {
        detail: Object.assign({ action: action, target: target }, extra || {})
      }));
    } catch (_) {}
  }

  function textOf(target) {
    return String(target && target.innerText || target && target.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function resolveTarget(node) {
    if (!node || node.nodeType !== 1) return null;
    var explicit = node.closest('[data-context-type]');
    if (explicit) return explicit;
    var selectors = [
      ['post', '.post-card'],
      ['post', '.m-post-card'],
      ['pool', '.queue-pool-card'],
      ['task', '.scheduler-block'],
      ['task', '.m-task'],
      ['time', '.scheduler-time-block'],
      ['user', '.scheduler-row > header'],
      ['ticket', '.queue-ticket-list article,.queue-request-card,.queue-ticket'],
      ['account', '.side-item,.acct-cell,.accounts-row'],
      ['account', 'tbody tr']
    ];
    for (var i = 0; i < selectors.length; i += 1) {
      var hit = node.closest(selectors[i][1]);
      if (hit) {
        hit.dataset.contextType = selectors[i][0];
        return hit;
      }
    }
    return node.closest('main,section,article,header,nav') || node;
  }

  function contextFor(target) {
    var type = target.dataset.contextType || 'surface';
    var title = target.dataset.contextTitle || target.dataset.title || '';
    var account = target.dataset.contextAccount || target.dataset.account || target.dataset.handle || '';
    var permalink = target.dataset.contextPermalink || target.dataset.permalink || '';
    var postKey = target.dataset.contextPostKey || target.dataset.postKey || '';
    var shortcode = target.dataset.contextShortcode || target.dataset.shortcode || '';
    var requestId = target.dataset.contextRequestId || target.dataset.requestId || '';
    var duplicable = target.dataset.contextDuplicate === 'true';
    if (!title) title = textOf(target).slice(0, 120);
    if (!permalink) {
      var link = target.querySelector('a[href^="http"]');
      if (link) permalink = link.href;
    }
    if (!account) {
      var handleMatch = textOf(target).match(/@([a-z0-9._]+)/i);
      if (handleMatch) account = handleMatch[1];
    }
    return { type: type, title: title, account: account.replace(/^@/, ''), permalink: permalink, postKey: postKey, shortcode: shortcode, requestId: requestId, duplicable: duplicable };
  }

  function openTarget(target) {
    if (target.dataset && (target.dataset.contextType === 'post' || target.dataset.contextType === 'task')) {
      target.click();
      return;
    }
    var clickable = target.querySelector('button,a[href]');
    if (clickable && clickable !== target) clickable.click();
    else target.click();
  }

  function buildItems(target, context) {
    var es = language() === 'es';
    var items = [];
    var add = function (label, action, options) { items.push(Object.assign({ label: label, action: action }, options || {})); };
    var copyLabel = es ? 'Copiar texto' : 'Copy text';
    var openLabel = es ? 'Abrir' : 'Open';

    var findButton = function (pattern) {
      return Array.prototype.slice.call(target.querySelectorAll('button')).find(function (button) {
        return pattern.test(String(button.innerText || button.textContent || '').replace(/\s+/g, ' '));
      });
    };
    if (context.type === 'post' || context.type === 'pool' || context.type === 'task' || context.type === 'ticket') {
      add(context.type === 'post' ? (es ? 'Abrir post' : 'Open post') : openLabel, 'open', { primary: true });
      if (target.dataset.contextQuickAdd === 'true') add(es ? 'Agregar rápido al Queue' : 'Quick add to Queue', 'quick-add', { primary: true });
      var editButton = findButton(/\b(edit|editar)\b/i);
      var cancelButton = findButton(/\b(cancel|cancelar)\b/i);
      if (editButton && context.type === 'post') add(es ? 'Editar post' : 'Edit post', 'invoke', { primary: true, element: editButton });
      if (cancelButton && context.type === 'post') add(es ? 'Cancelar post' : 'Cancel post', 'invoke', { element: cancelButton, danger: true });
      if (context.duplicable && context.requestId) add(es ? 'Duplicar request' : 'Duplicate request', 'duplicate', { primary: true });
      if (context.permalink) add(es ? 'Copiar enlace del post' : 'Copy post link', 'copy-link');
      add(copyLabel, 'copy-text');
    } else if (context.type === 'account') {
      if (context.account) add(es ? 'Abrir cuenta en Instagram' : 'Open account on Instagram', 'open-account', { primary: true });
      if (context.account) add(es ? 'Copiar @usuario' : 'Copy @handle', 'copy-handle');
      add(copyLabel, 'copy-text');
    } else if (context.type === 'user') {
      add(es ? 'Copiar nombre' : 'Copy name', 'copy-text');
      if (target.dataset.contextHide === 'true') add(es ? 'Ocultar usuario' : 'Hide user', 'hide-user');
    } else {
      var selected = String(window.getSelection ? window.getSelection() : '').trim();
      if (selected) add(es ? 'Copiar selección' : 'Copy selection', 'copy-selection');
      add(copyLabel, 'copy-text');
      add(es ? 'Recargar vista' : 'Refresh view', 'reload');
    }
    return items;
  }

  function showMenu(event, target) {
    ensureStyle();
    closeMenu();
    activeTarget = target;
    var context = contextFor(target);
    var items = buildItems(target, context);
    if (!items.length) return;
    var es = language() === 'es';
    var menu = document.createElement('div');
    menu.id = MENU_ID;
    menu.className = 'sentient-context-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', es ? 'Acciones contextuales' : 'Contextual actions');
    var label = document.createElement('div');
    label.className = 'sentient-context-menu-label';
    label.textContent = context.title || (es ? 'Acciones' : 'Actions');
    menu.appendChild(label);
    items.forEach(function (item, index) {
      if (index && items[index - 1].separator) {
        var divider = document.createElement('div');
        divider.className = 'sentient-context-menu-divider';
        menu.appendChild(divider);
      }
      var button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      if (item.primary) button.classList.add('is-primary');
      if (item.danger) button.classList.add('is-danger');
      button.textContent = item.label;
      button.addEventListener('click', function () {
        if (item.action === 'open') openTarget(target);
        else if (item.action === 'quick-add') dispatch('quick-add', target, context);
        else if (item.action === 'duplicate') dispatch('duplicate', target, context);
        else if (item.action === 'invoke' && item.element) item.element.click();
        else if (item.action === 'open-account') window.open('https://www.instagram.com/' + encodeURIComponent(context.account) + '/', '_blank', 'noopener');
        else if (item.action === 'copy-link') copyText(context.permalink);
        else if (item.action === 'copy-handle') copyText('@' + context.account);
        else if (item.action === 'copy-selection') copyText(String(window.getSelection ? window.getSelection() : ''));
        else if (item.action === 'copy-text') copyText(textOf(target));
        else if (item.action === 'hide-user') dispatch('hide-user', target, context);
        else if (item.action === 'reload') window.location.reload();
        closeMenu();
      });
      menu.appendChild(button);
    });
    document.body.appendChild(menu);
    var x = Math.max(8, Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 8));
    var y = Math.max(8, Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 8));
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    var first = menu.querySelector('button');
    if (first) first.focus();
  }

  document.addEventListener('contextmenu', function (event) {
    if (event.defaultPrevented) return;
    var raw = event.target && event.target.nodeType === 1 ? event.target : event.target && event.target.parentElement;
    if (!raw) return;
    if (raw.closest('#' + MENU_ID + ',[data-context-native]')) return;
    if (/^(INPUT|TEXTAREA|SELECT|OPTION)$/i.test(raw.tagName) || raw.isContentEditable) return;
    var target = resolveTarget(raw);
    if (!target) return;
    event.preventDefault();
    showMenu(event, target);
  }, false);

  document.addEventListener('pointerdown', function (event) {
    var menu = document.getElementById(MENU_ID);
    if (menu && !menu.contains(event.target)) closeMenu();
  }, true);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeMenu();
  });
})();
