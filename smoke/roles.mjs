import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const files = {
  app: read('src/App.jsx'),
  queue: read('src/queue.jsx'),
  settings: read('src/settings.jsx'),
  tracker: read('public/tracker.html'),
  insights: read('public/insights.html'),
  preview: read('public/role-preview.js'),
};

const checks = {
  'Dashboard Settings stays Admin or Dev only': files.app.includes('(isAdmin || isDev) && showSettingsLink'),
  'Dashboard Send to Pool stays VC or Admin only': files.app.includes("isAdmin || operatingRoles.includes('vc')"),
  'Dashboard role preview removes Dev-only coordinator access': files.app.includes("(isDev && !rolePreviewActive) || isAdmin || operatingRoles.includes('vc')"),
  'Queue role preview removes Dev-only coordinator access': files.queue.includes("const effectiveDevAccess = isDev && !rolePreviewActive"),
  'Settings role preview removes Dev-only command-center access': files.settings.includes("const effectiveDevAccess = Boolean(viewer?.is_dev) && !rolePreviewActive"),
  'Queue Settings stays Admin or Dev only': files.queue.includes('{isAdmin || isDev ? <section className="queue-settings-section queue-settings-admin">'),
  'Pick remains available to every PD-capable user': files.queue.includes('const pickAvailable = Boolean(data?.viewer);'),
  'Settings restricted page retains role switcher': files.settings.includes('<DevRolePreview'),
  'Tracker loads shared role preview': files.tracker.includes('<script src="/role-preview.js" defer></script>'),
  'Insights loads shared role preview': files.insights.includes('<script src="/role-preview.js" defer></script>'),
  'Tracker forwards preview role': files.tracker.includes('window.__sentientRolePreviewHeaders ? window.__sentientRolePreviewHeaders()'),
  'Insights forwards preview role': files.insights.includes('window.__sentientRolePreviewHeaders ? window.__sentientRolePreviewHeaders()'),
  'Shared preview uses per-tab session state': files.preview.includes("sessionStorage.getItem(ROLE_KEY)"),
  'Shared preview forwards backend header': files.preview.includes("headers['X-Queue-Role-Preview'] = role"),
  'Ivan can simulate every non-Dev role': files.app.includes("'ivan@sentientagency.io': ['sales', 'pd', 'vc', 'trainee', 'admin']")
    && files.queue.includes("'ivan@sentientagency.io': ['sales', 'pd', 'vc', 'trainee', 'admin']"),
};

for (const [label, pass] of Object.entries(checks)) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
}

process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
