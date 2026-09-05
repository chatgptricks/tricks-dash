import { productSections, sectionHref, coordinatorFor } from './product-navigation.js';
const top = document.querySelector('.wrap > .top');
if (top) {
  const current = location.pathname.includes('tracker') ? 'tracker' : 'insights';
  const settings = top.querySelector('.settings-menu');
  const toolbar = document.createElement('div'); toolbar.className = 'product-toolbar';
  const title = document.createElement('h1'); title.textContent = current === 'tracker' ? 'Tracker' : 'Insights'; toolbar.append(title);
  for (const id of ['scope', 'shareBtn', 'pdfBtn']) { const item = document.getElementById(id); if (item) toolbar.append(item); }
  const brand = document.createElement('a'); brand.className = 'product-brand'; brand.href = '/home.html'; brand.innerHTML = 'sentient<span>dash</span><small>.app</small>';
  const nav = document.createElement('nav'); nav.className = 'product-nav'; nav.setAttribute('aria-label', 'Sentient tools');
  for (const item of productSections) { const a = document.createElement('a'); a.href = sectionHref(item); a.textContent = item.label; if (item.restricted) { a.hidden = true; a.style.display = 'none'; } if (current === item.id) a.setAttribute('aria-current', 'page'); nav.append(a); }
  const account = document.createElement('div'); account.className = 'product-account'; if (settings) account.append(settings);
  top.className = 'product-header'; top.replaceChildren(brand, nav, account, toolbar);
}

// Resolve access for ordinary users as well as Dev role previews.
let attempts = 0;
const accessTimer = setInterval(async () => {
  if (++attempts > 120) { clearInterval(accessTimer); return; }
  if (!window.__firebaseIdToken) return;
  clearInterval(accessTimer);
  try {
    const headers = { Authorization: `Bearer ${window.__firebaseIdToken}` };
    const response = await fetch('https://cortex-api-db2e.onrender.com/api/dashboard/me', { headers: window.__sentientRolePreviewHeaders ? window.__sentientRolePreviewHeaders(headers) : headers });
    if (!response.ok) return;
    const viewer = await response.json(); const allowed = coordinatorFor(viewer);
    document.querySelectorAll('.product-nav a').forEach((link) => { if (/\/(tracker|insights)\.html$/.test(new URL(link.href).pathname)) { link.hidden = !allowed; link.style.display = allowed ? '' : 'none'; } });
  } catch {}
}, 250);
