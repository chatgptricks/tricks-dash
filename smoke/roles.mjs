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
  'Legacy dev preview value keeps full Dev access': files.app.includes('ACTIVE_ROLE_PREVIEWS.has(readRolePreview())')
    && files.queue.includes('ACTIVE_ROLE_PREVIEWS.has(role)')
    && files.settings.includes("ACTIVE_ROLE_PREVIEWS.has(window.sessionStorage.getItem('sentient.queueRolePreview') || '')"),
  'Queue Settings stays Admin or Dev only': /\{isAdmin \|\| isDev \? <section className="[^"\n]*\bqueue-settings-admin\b/.test(files.queue),
  'Pick remains available to every PD-capable user': files.queue.includes('const pickAvailable = Boolean(data?.viewer);'),
  'Settings restricted page retains role switcher': files.settings.includes('<DevRolePreview'),
  'Tracker loads shared role preview': files.tracker.includes('role-preview.js') && files.tracker.includes('defer'),
  'Insights loads shared role preview': files.insights.includes('role-preview.js') && files.insights.includes('defer'),
  'Tracker forwards preview role': files.tracker.includes('window.__sentientRolePreviewHeaders ? window.__sentientRolePreviewHeaders()'),
  'Insights forwards preview role': files.insights.includes('window.__sentientRolePreviewHeaders ? window.__sentientRolePreviewHeaders()'),
  'Shared preview uses per-tab session state': files.preview.includes("sessionStorage.getItem(ROLE_KEY)"),
  'Shared preview forwards backend header': files.preview.includes("headers['X-Queue-Role-Preview'] = role"),
  'Dashboard capabilities are initialized from the authorized server response': files.app.includes('useState(Boolean(initialAccess.is_dev))')
    && files.app.includes('useState(Boolean(initialAccess.can_role_switch))'),
  'User emails never grant Dev or role-switching access': ![files.app, files.queue].some((source) => /DEV_EMAIL|ROLE_SWITCHER_DEFAULTS|knownDev|knownRoleSwitcher/.test(source)),
  'Developers can preview every operating role without an identity allowlist': [files.app, files.queue].every((source) => source.includes("const PREVIEW_ROLES = Object.freeze(['sales', 'pd', 'vc', 'trainee', 'admin'])")),
  'Non-Dev role choices come from server capabilities': files.app.includes('initialAccess.available_operating_roles')
    && files.queue.includes('viewer?.available_operating_roles'),
};

for (const [label, pass] of Object.entries(checks)) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
}

process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
