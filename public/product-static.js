import { productSections, sectionHref, coordinatorFor, devAccessFor, revealCurrentSection, openSection } from './product-navigation.js?v=20260910a';
const top = document.querySelector('.product-page > .product-header, .wrap > .top');
if (top) {
  const current = location.pathname.includes('tracker') ? 'tracker' : 'insights';
  const settings = top.querySelector('.settings-menu');
  const toolbar = top.querySelector('.product-toolbar') || document.createElement('div'); toolbar.className = 'product-toolbar';
  if (!toolbar.querySelector('h1')) {
    const title = document.createElement('h1'); title.textContent = current === 'tracker' ? 'Tracker' : 'Insights'; toolbar.append(title);
  }
  const scope = document.getElementById('scope'); if (scope) toolbar.append(scope);
  const actions = top.parentElement.querySelector('.product-page-actions') || document.createElement('div');
  actions.className = 'product-page-controls product-page-actions';
  actions.setAttribute('role', 'group'); actions.setAttribute('aria-label', `${current === 'tracker' ? 'Tracker' : 'Insights'} actions`);
  for (const id of ['shareBtn', 'pdfBtn']) { const item = document.getElementById(id); if (item) actions.append(item); }
  if (actions.childElementCount) top.after(actions);
  const brand = top.querySelector('.product-brand') || document.createElement('a'); brand.className = 'product-brand'; brand.href = '/index.html'; brand.innerHTML = 'sentient<span>dash</span><small>.app</small>'; brand.setAttribute('aria-label', 'Sentient home');
  brand.target = 'sentient-dashboard'; brand.addEventListener('click', (event) => openSection(event, productSections[0]));
  const nav = document.createElement('nav'); nav.className = 'product-nav'; nav.setAttribute('aria-label', 'Sentient tools');
  for (const item of productSections) { const a = document.createElement('a'); a.href = sectionHref(item); a.target = item.target; a.addEventListener('click', (event) => openSection(event, item)); a.textContent = item.label; if (item.restricted || item.devOnly) { a.hidden = true; a.style.display = 'none'; } if (current === item.id) a.setAttribute('aria-current', 'page'); nav.append(a); }
  const account = document.createElement('div'); account.className = 'product-account'; if (settings) account.append(settings);
  top.className = 'product-header'; top.dataset.section = current;
  top.parentElement.classList.add('product-page');
  top.replaceChildren(brand, toolbar, nav, account);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => revealCurrentSection(nav)).observe(nav);
}

// Resolve access for ordinary users as well as Dev role previews.
let attempts = 0, accessRun = 0;
function setStaticNavigation(viewer) {
  document.querySelectorAll('.product-nav a').forEach((link) => {
    const item = productSections.find(section => new URL(link.href).pathname.endsWith('/' + section.path));
    if (!item?.restricted && !item?.devOnly) return;
    const allowed = Boolean(viewer) && (!item.restricted || coordinatorFor(viewer))
      && (!item.devOnly || devAccessFor(viewer) || (item.id === 'news' && viewer.can_access_news));
    link.hidden = !allowed; link.style.display = allowed ? '' : 'none';
  });
  revealCurrentSection(document.querySelector('.product-nav'));
}
async function refreshStaticAccess() {
  const run = ++accessRun;
  const token = window.__firebaseIdToken;
  setStaticNavigation(null);
  if (!token) return;
  try {
    const headers = { Authorization: `Bearer ${token}` };
    const response = await fetch('https://cortex-api-db2e.onrender.com/api/dashboard/me', { headers: window.__sentientRolePreviewHeaders ? window.__sentientRolePreviewHeaders(headers) : headers });
    if (!response.ok) return;
    const viewer = await response.json();
    if (run !== accessRun || token !== window.__firebaseIdToken) return;
    // Tracker is open to everyone; only Insights stays coordinator-only.
    setStaticNavigation(viewer);
  } catch {}
}
window.addEventListener('sentient-auth-changed', refreshStaticAccess);
const accessTimer = setInterval(() => {
  if (++attempts > 120) { clearInterval(accessTimer); return; }
  if (!window.__firebaseIdToken) return;
  clearInterval(accessTimer);
  refreshStaticAccess();
}, 250);

function translateNavigation() {
  const spanish = document.documentElement.lang === 'es';
  document.querySelectorAll('.product-nav a').forEach((link, index) => { const item = productSections[index]; if (item) link.textContent = spanish ? item.es : item.label; });
  revealCurrentSection(document.querySelector('.product-nav'));
}
translateNavigation();
new MutationObserver(translateNavigation).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
