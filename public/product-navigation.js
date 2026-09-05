// One navigation contract for React and the standalone tools.
export const productSections = [
  { id: 'home', label: 'Home', es: 'Inicio', path: 'home.html' },
  { id: 'research', label: 'Research', es: 'Investigar', path: 'index.html', target: 'sentient-dashboard' },
  { id: 'queue', label: 'Queue', es: 'Producción', path: 'queue.html', target: 'sentient-queue' },
  { id: 'tracker', label: 'Tracker', es: 'Tracker', path: 'tracker.html', restricted: true, target: 'sentient-tracker' },
  { id: 'insights', label: 'Insights', es: 'Insights', path: 'insights.html', restricted: true, target: 'sentient-insights' },
];
function routeContext() {
  try {
    const params = new URLSearchParams(window.location.search); const token = params.get('r');
    const normalized = (token || '').replace(/-/g, '+').replace(/_/g, '/');
    const state = token ? JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)), (char) => char.charCodeAt(0)))) : {};
    for (const key of ['acc', 'from', 'to']) if (params.has(key)) state[key] = params.get(key);
    return state;
  } catch { return {}; }
}
function contextHref(section, context) {
  const bytes = new TextEncoder().encode(JSON.stringify(context));
  let binary = ''; bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return '/' + section.path + '?r=' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
export function sectionHref(section) {
  const fromResearch = /\/(?:index\.html)?$/.test(window.location.pathname);
  const fromAnalytics = /\/(tracker|insights)\.html$/.test(window.location.pathname);
  if ((fromResearch || fromAnalytics) && ['research', 'tracker', 'insights'].includes(section.id)) {
    const source = routeContext(); const context = {};
    if (typeof source.acc === 'string' && /^[a-zA-Z0-9_.,]+$/.test(source.acc)) context.acc = source.acc;
    if (section.id !== 'tracker') for (const key of ['from', 'to']) if (/^\d{4}-\d{2}-\d{2}$/.test(source[key] || '')) context[key] = source[key];
    if (section.id === 'tracker' && context.acc?.includes(',')) delete context.acc;
    if (section.id === 'research' && fromAnalytics && (context.from || context.to)) context.range = 'custom';
    if ((section.id !== 'research' || fromAnalytics) && Object.keys(context).length) return contextHref(section, context);
  }
  if (section.id === 'research') {
    try {
      const saved = sessionStorage.getItem('sentient.research.return');
      if (saved && /^\/index\.html\?r=[a-zA-Z0-9_-]+$/.test(saved)) return saved;
    } catch {}
  }
  return '/' + section.path;
}
export function coordinatorFor(viewer) {
  const role = sessionStorage.getItem('sentient.queueRolePreview');
  if (['sales', 'pd', 'vc', 'trainee', 'admin'].includes(role)) return ['vc', 'admin'].includes(role);
  return Boolean(viewer?.is_dev || viewer?.is_admin || viewer?.operating_roles?.includes('vc'));
}
