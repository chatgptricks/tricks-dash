// One navigation contract for React and the standalone tools.
export const productSections = [
  { id: 'home', label: 'Home', es: 'Inicio', path: 'home.html' },
  { id: 'research', label: 'Research', es: 'Investigar', path: 'index.html', target: 'sentient-dashboard' },
  { id: 'queue', label: 'Queue', es: 'Producción', path: 'queue.html', target: 'sentient-queue' },
  { id: 'tracker', label: 'Tracker', es: 'Tracker', path: 'tracker.html', restricted: true, target: 'sentient-tracker' },
  { id: 'insights', label: 'Insights', es: 'Insights', path: 'insights.html', restricted: true, target: 'sentient-insights' },
];
export function sectionHref(section) {
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
