import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { AlertTriangle, Archive, ArrowLeft, Ban, BarChart3, BellRing, CalendarDays, CalendarPlus, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock3, Coffee, Download, History, Link2, LoaderCircle, LocateFixed, LogOut, Moon, Paperclip, Pencil, Plus, Radio, Send, Settings, Sun, TimerReset, WifiOff, X } from 'lucide-react';
import { browserPopupRedirectResolver, getRedirectResult, onAuthStateChanged, signOut } from 'firebase/auth';
import { describeSignInError, firebaseAuth as auth, startGoogleSignIn } from './firebase';
import { clearSsoCookie, startSsoRefresh, trySsoSignIn } from './sso';
import { API_BASE, apiFetch } from './api';
import { PrefsProvider, usePrefs } from './prefsContext';
import { ACCENT_CHOICES, accentHex } from './prefs';
import { SelectedPost, SlideDownload, coverUrlForPost } from './postDetail';
import chatgptricksProfileImage from './assets/chatgptricks-profile.jpg';
import traselvelorealProfileImage from './assets/traselveloreal-profile.jpg';
import { QUEUE_DAY_END, QUEUE_DAY_START, minutesPerPPOf, planQueueDrop } from './queuePlanner';
import { followQueueLive } from './queueLive';
import { decodeRouteState } from './urlCodec';
import './queue.css';

const TIME_ZONE_PREVIEW_KEY = 'sentient.queueTimeZonePreview';
const TIME_ZONE_PREVIEW_EVENT = 'sentient:queue-time-zone-preview';
// Queue stores every placement on one shared Costa Rica timeline.  A viewer
// in Colombia sees that same instant one hour later, never a shifted bar.
const QUEUE_TIME_ZONE = 'America/Costa_Rica';
const DEV_TIME_ZONES = Object.freeze([
  { value: 'America/Costa_Rica', label: 'Costa Rica · UTC−6' },
  { value: 'America/Bogota', label: 'Colombia · UTC−5' },
]);
const readDevTimeZone = () => {
  const value = window.sessionStorage.getItem(TIME_ZONE_PREVIEW_KEY);
  return DEV_TIME_ZONES.some((zone) => zone.value === value) ? value : 'America/Costa_Rica';
};
const zonedParts = (value, timeZone) => {
  if (!timeZone) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(value);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
};
const DAY = (value = new Date(), timeZone = '') => {
  const parts = zonedParts(value, timeZone);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};
const shiftDay = (date, amount) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + amount); return DAY(value); };
const time = (minutes) => { const normalized = ((minutes % 1440) + 1440) % 1440; return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`; };
const minutesFromTime = (value) => { const [hour, minute] = String(value || '00:00').split(':').map(Number); return Math.max(0, Math.min(1430, hour * 60 + minute)); };
const currentMinutes = (value = new Date(), timeZone = '') => {
  const parts = zonedParts(value, timeZone);
  return parts ? Number(parts.hour) * 60 + Number(parts.minute) : value.getHours() * 60 + value.getMinutes();
};
const queueOffsetFor = (timeZone = '') => timeZone === 'America/Bogota' ? 60 : 0;
const queueScheduleClock = (date, minutes, timeZone = QUEUE_TIME_ZONE) => {
  const [year, month, day] = String(date || DAY(new Date(), QUEUE_TIME_ZONE)).split('-').map(Number);
  const value = new Date(Date.UTC(year, (month || 1) - 1, day || 1, 0, Number(minutes || 0) + queueOffsetFor(timeZone)));
  return {
    date: `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`,
    minutes: value.getUTCHours() * 60 + value.getUTCMinutes(),
  };
};
const scheduleTimeForViewer = (date, minutes, timeZone = QUEUE_TIME_ZONE) => time(queueScheduleClock(date, minutes, timeZone).minutes);
const scheduleDateForViewer = (date, minutes, timeZone = QUEUE_TIME_ZONE) => queueScheduleClock(date, minutes, timeZone).date;
const queueScheduleFromViewer = (date, minutes, timeZone = QUEUE_TIME_ZONE) => queueScheduleClock(date, Number(minutes || 0) - queueOffsetFor(timeZone), QUEUE_TIME_ZONE);
// Keep queue thumbnails in lockstep with Dashboard's cover resolution. In
// particular, never prefix an already-absolute Instagram CDN URL with the
// API origin (that produced an invalid URL), and use Cortex's cached cover
// route when a newly imported post has no usable CDN URL yet.
const cover = (task) => coverUrlForPost(task?.post);
const accountMention = (value) => { const clean = String(value || '').trim().replace(/^@/, ''); return clean ? `@${clean}` : ''; };
const locale = (language) => language === 'es' ? 'es-CR' : 'en-US';
const displayDate = (value, language) => new Date(`${value}T12:00:00`).toLocaleDateString(locale(language), { weekday: 'long', month: 'short', day: 'numeric' });
// Queue work remains scheduled at explicit local dates/times. The dev-only
// simulator can override the reference clock without changing that data.
const displayTimestamp = (value, language) => new Date(value).toLocaleString(locale(language), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const DRAFT_KEY = 'sentient.queueDrafts.v2';
const DESIGNER_SCOPE_KEY_PREFIX = 'sentient.queueDesignerScope.v1:';
const designerScopeKey = (email) => `${DESIGNER_SCOPE_KEY_PREFIX}${String(email || '').trim().toLowerCase()}`;
const readDesignerScope = (email) => {
  try { return window.localStorage.getItem(designerScopeKey(email)) || ''; } catch { return ''; }
};
// A hard browser reload used to reset React state before the Queue request
// returned, leaving people with an empty "Loading schedule" screen. Keep the
// most recent live view per signed-in user for the browser session, then
// reconcile it quietly with the server. Queue content can be sensitive, so
// this intentionally uses sessionStorage rather than a permanent cache.
const QUEUE_SNAPSHOT_KEY = 'sentient.queueSnapshot.v1';
const queueSnapshotKey = (email) => `${QUEUE_SNAPSHOT_KEY}:${String(email || '').trim().toLowerCase()}`;
const readQueueSnapshot = (email) => {
  try {
    const snapshot = JSON.parse(window.sessionStorage.getItem(queueSnapshotKey(email)) || 'null');
    if (!snapshot || snapshot.version !== 1 || !snapshot.data || !snapshot.date || snapshot.archive) return null;
    return snapshot;
  } catch {
    return null;
  }
};
const writeQueueSnapshot = (email, snapshot) => {
  try {
    window.sessionStorage.setItem(queueSnapshotKey(email), JSON.stringify(snapshot));
  } catch {
    // A full or unavailable session store should never stop Queue from loading.
  }
};
// Priority is intentionally binary. Older Queue rows can still contain the
// former four-level value, but only an explicit `urgent` gets special UI.
const PRIORITIES = ['normal', 'urgent'];
const DEV_EMAIL = 'esteban@sentientagency.io';
const ROLE_SWITCHER_DEFAULTS = Object.freeze({
  [DEV_EMAIL]: ['sales', 'pd', 'vc', 'trainee', 'admin'],
  'ivan@sentientagency.io': ['sales', 'pd', 'vc', 'trainee', 'admin'],
});
const ACTIVE_ROLE_PREVIEWS = new Set(['sales', 'pd', 'vc', 'trainee', 'admin']);
const hasActiveRolePreview = () => ACTIVE_ROLE_PREVIEWS.has(window.sessionStorage.getItem('sentient.queueRolePreview') || '');
let activeQueueDragId = null;
const ACCOUNT_PROFILE_FALLBACKS = { chatgptricks: chatgptricksProfileImage, traselveloreal: traselvelorealProfileImage };
const USER_DISPLAY_NAMES = Object.freeze({
  'esteban@sentientagency.io': 'Esteban',
  'louis@sentientagency.io': 'Louis',
  'ivan@sentientagency.io': 'Ivan',
  'sergio@sentientagency.io': 'Sergio',
  'victor@sentientagency.io': 'Victor',
  'egor@sentientagency.io': 'Egor',
  'santiagoflhi@gmail.com': 'Santiago',
  'dsflorezl@gmail.com': 'Florez',
  'sara1107giraldo@gmail.com': 'Sara',
  'sebastianruizurquijo@gmail.com': 'Sebastian',
  'tevi@sentientagency.io': 'Tevi',
  'gabo@sentientagency.io': 'Gabo',
  'trainee@sentientagency.io': 'Trainee',
});
const displayName = (value, preferred = '') => {
  if (String(preferred || '').trim()) return String(preferred).trim();
  const raw = String(value || '').trim();
  const key = raw.toLowerCase();
  if (USER_DISPLAY_NAMES[key]) return USER_DISPLAY_NAMES[key];
  const local = key.includes('@') ? key.split('@')[0] : key;
  const words = local.replace(/[0-9]+/g, '').replace(/[._-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  return words.length ? words.map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`).join(' ') : 'User';
};
const initialsFor = (value) => displayName(value).split(/\s+/).map((word) => word.slice(0, 1)).join('').slice(0, 2).toUpperCase();
const userAvatar = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/api/')) return `${API_BASE}${raw}`;
  return raw;
};

const COPY = {
  en: {
    productionQueue: 'Production Queue', dashboard: 'Dashboard', admin: 'Admin', coordinatorSchedule: 'Coordinator schedule', mySchedule: 'My production schedule', today: 'Today', submit: 'Submit', change: 'change', changes: 'changes', productionPool: 'Production pool', readyToSchedule: 'ready to schedule', visibleSchedule: 'The window shows 10 hours. Scroll to explore the full 24-hour day.', emptyPool: 'No requests are waiting in the pool.', myAssignedWork: 'My assigned work', upcomingProduction: 'Upcoming production', activeRequest: 'active request', activeRequests: 'active requests', noActiveAssignments: 'No active assignments', emptyAssignments: 'When a coordinator schedules work for you, it will appear here.', post: 'Post', postType: 'Post type', scheduled: 'Scheduled', deadline: 'Deadline', scope: 'Scope', status: 'Status', noTags: 'No tags', designer: 'Designer', now: 'Now', centerNow: 'Center Now', loadingSchedule: 'Loading schedule…', tryAgain: 'Try again', queueAccess: 'Queue is available to every dashboard user.', rolePreview: 'Role preview', onlyEsteban: 'Only visible to Esteban.', activeRole: 'Active role', devFullAccess: 'Dev · full access', postDesigner: 'Post Designer', viralCoordinator: 'Viral Coordinator', salesRole: 'Sales', productionReports: 'Production reports', adminWorkspace: 'Admin workspace', loadingReport: 'Loading report…', inPool: 'In pool', inProgress: 'In progress', readyToClose: 'Ready to close', closed: 'Closed', cancelled: 'Cancelled', designerWorkload: 'Designer workload', workloadHelp: 'Active work, delivery health and actual production time.', allAssignedPosts: 'All assigned posts', assignedPostsCount: 'assigned posts', noAssignedPosts: 'No assigned posts yet.', openSettings: 'Open dashboard settings', startWork: 'Start work', markComplete: 'Mark complete', publishedLink: 'Published Instagram link', closeRequest: 'Close request', returnInProgress: 'Return to in progress', openPublished: 'Open published post', cancellationReason: 'Cancellation reason (optional)', cancelRequest: 'Cancel request', brief: 'Brief', notes: 'Notes', references: 'References', minutes: 'minutes', sourcePost: 'Source post', assignment: 'Assignment', recommendedAccounts: 'Recommended accounts', editRequest: 'Edit request', saveChanges: 'Save changes', cancel: 'Cancel', productionPoints: 'Production points', tags: 'Tags', referenceLinks: 'Reference links', oneLinkPerLine: 'One link per line', signIn: 'Sign in with Google', signingIn: 'Signing in…', signInHelp: 'Sign in with Google to open your production schedule.', allDesigners: 'All designers', allUsers: 'All users', noAccounts: 'No accounts yet', noRecommendedAccount: 'No recommended account', unsavedDrafts: 'Draft schedule changes are saved in this browser.', clearDrafts: 'Discard drafts', archive: 'Archive', liveQueue: 'Live Queue', noArchived: 'No cancelled requests.', extra: 'NEXT DAY', overdue: 'OVERDUE', atRisk: 'AT RISK', attachments: 'Files & references', uploadFiles: 'Upload files', noFiles: 'No files attached.', history: 'Activity history', noHistory: 'No activity yet.', resendSlack: 'Resend Slack DM', slackSent: 'Slack DM sent.', slackFailed: 'Slack DM failed. Check the user Slack ID and try again.', requestUpdated: 'Request updated.', scheduleSubmitted: 'Schedule submitted.', deliveryHealth: 'Delivery health', onTime: 'On-time rate', averageTime: 'Average actual time', completedJobs: 'Closed jobs', draftsSaved: 'Drafts saved', movedJobs: 'reflowed jobs', close: 'Close', filesUploaded: 'Files uploaded.', deadlineError: 'This request cannot fit before its deadline.', invalidDay: 'Requests can be scheduled on any day.', assignedView: 'Scheduler view', uploadFailed: 'Some files could not be uploaded.', sourceCaption: 'Source caption', cancelledReason: 'Cancellation reason', draftWarning: 'You have unsubmitted Queue changes.', movedAfterActive: 'Another post is already in progress. This request was moved after it and remains scheduled.', notQueueParticipant: 'Not a Queue participant',
    priority: 'Priority', priorityUrgent: 'Urgent', markUrgent: 'Mark as urgent', priorityMix: 'Priority mix', tentative: 'Pending submit', tentativeBy: 'Temporary placement by', liveConnected: 'Live', liveConnecting: 'Connecting', liveOffline: 'Reconnecting', sharedDrafts: 'Temporary changes are shared live with assigned designers.', draftSyncFailed: 'The temporary placement could not be shared. Your change remains visible locally.', resizeBar: 'Resize production block', resizeLeft: 'from the left', resizeRight: 'from the right', adminOverview: 'Overview', userManagement: 'User Management', managedAccounts: 'Managed Sentient accounts', chooseSentientAccount: 'Choose Sentient account', assignAccount: 'Assign', removeAccount: 'Remove account', usersCount: 'users', loadingUsers: 'Loading users…', noUsers: 'No users available.', accountUpdateFailed: 'Could not update account ownership.',
    settings: 'Settings', accentColor: 'Accent color', customColor: 'Custom color', custom: 'Custom', theme: 'Theme', language: 'Language', signOut: 'Sign out', darkTheme: 'Dark', lightTheme: 'Light', signedInAs: 'Signed in as', adminSettings: 'Admin',
  },
  es: {
    productionQueue: 'Cola de producción', dashboard: 'Dashboard', admin: 'Admin', coordinatorSchedule: 'Agenda de coordinación', mySchedule: 'Mi agenda de producción', today: 'Hoy', submit: 'Enviar', change: 'cambio', changes: 'cambios', productionPool: 'Pool de producción', readyToSchedule: 'listos para programar', visibleSchedule: 'La ventana muestra 8 horas. Desplázate para explorar las 24 horas del día.', emptyPool: 'No hay requests esperando en el pool.', myAssignedWork: 'Mi trabajo asignado', upcomingProduction: 'Próxima producción', activeRequest: 'request activo', activeRequests: 'requests activos', noActiveAssignments: 'No tienes asignaciones activas', emptyAssignments: 'Cuando un coordinador programe trabajo para ti, aparecerá aquí.', post: 'Post', scheduled: 'Programado', deadline: 'Deadline', scope: 'Alcance', status: 'Estado', noTags: 'Sin tags', designer: 'Designer', now: 'Ahora', centerNow: 'Centrar ahora', loadingSchedule: 'Cargando agenda…', tryAgain: 'Intentar de nuevo', queueAccess: 'Queue está disponible para todos los usuarios del dashboard.', rolePreview: 'Vista de rol', onlyEsteban: 'Visible solo para Esteban.', activeRole: 'Rol activo', devFullAccess: 'Dev · acceso completo', postDesigner: 'Post Designer', viralCoordinator: 'Viral Coordinator', salesRole: 'Sales', productionReports: 'Reportes de producción', adminWorkspace: 'Espacio Admin', loadingReport: 'Cargando reporte…', inPool: 'En pool', inProgress: 'En progreso', readyToClose: 'Listo para cerrar', closed: 'Cerrado', cancelled: 'Cancelado', designerWorkload: 'Carga por designer', workloadHelp: 'Trabajo activo, salud de entrega y tiempo real de producción.', allAssignedPosts: 'Todos los posts asignados', assignedPostsCount: 'posts asignados', noAssignedPosts: 'Todavía no hay posts asignados.', openSettings: 'Abrir Settings del dashboard', startWork: 'Empezar trabajo', markComplete: 'Marcar como completado', publishedLink: 'Link publicado de Instagram', closeRequest: 'Cerrar request', returnInProgress: 'Volver a en progreso', openPublished: 'Abrir post publicado', cancellationReason: 'Motivo de cancelación (opcional)', cancelRequest: 'Cancelar request', brief: 'Brief', notes: 'Notas', references: 'Referencias', minutes: 'minutos', sourcePost: 'Post original', assignment: 'Asignación', recommendedAccounts: 'Cuentas recomendadas', editRequest: 'Editar request', saveChanges: 'Guardar cambios', cancel: 'Cancelar', productionPoints: 'Puntos de producción', tags: 'Tags', referenceLinks: 'Links de referencia', oneLinkPerLine: 'Un link por línea', signIn: 'Iniciar sesión', signingIn: 'Iniciando sesión…', signInHelp: 'Inicia sesión con Google para abrir tu agenda de producción.', allDesigners: 'Todos los designers', allUsers: 'Todos los usuarios', noAccounts: 'Sin cuentas todavía', noRecommendedAccount: 'Sin cuenta recomendada', unsavedDrafts: 'Los cambios del scheduler se guardan en este navegador.', clearDrafts: 'Descartar cambios', archive: 'Archivo', liveQueue: 'Queue activo', noArchived: 'No hay requests cancelados.', extra: 'DÍA SIGUIENTE', overdue: 'VENCIDO', atRisk: 'EN RIESGO', attachments: 'Archivos y referencias', uploadFiles: 'Subir archivos', noFiles: 'No hay archivos adjuntos.', history: 'Historial de actividad', noHistory: 'Todavía no hay actividad.', resendSlack: 'Reenviar DM de Slack', slackSent: 'DM de Slack enviado.', slackFailed: 'Falló el DM de Slack. Revisa el Slack ID del usuario e intenta de nuevo.', requestUpdated: 'Request actualizado.', scheduleSubmitted: 'Scheduler enviado.', deliveryHealth: 'Salud de entrega', onTime: 'Entregas a tiempo', averageTime: 'Tiempo real promedio', completedJobs: 'Trabajos cerrados', draftsSaved: 'Cambios guardados', movedJobs: 'trabajos reacomodados', close: 'Cerrar', filesUploaded: 'Archivos subidos.', deadlineError: 'Este request no cabe antes de su deadline.', invalidDay: 'Los requests pueden programarse en cualquier día.', assignedView: 'Vista del scheduler', uploadFailed: 'Algunos archivos no pudieron subirse.', sourceCaption: 'Caption original', cancelledReason: 'Motivo de cancelación', draftWarning: 'Tienes cambios de Queue sin enviar.', movedAfterActive: 'Ya hay otro post en progreso. Este request se movió después y permanece programado.', notQueueParticipant: 'No participa en Queue',
    priority: 'Prioridad', priorityUrgent: 'Urgente', markUrgent: 'Marcar como urgente', priorityMix: 'Niveles de prioridad', tentative: 'Pendiente de enviar', tentativeBy: 'Ubicación temporal por', liveConnected: 'En vivo', liveConnecting: 'Conectando', liveOffline: 'Reconectando', sharedDrafts: 'Los cambios temporales se comparten en vivo con los designers asignados.', draftSyncFailed: 'No se pudo compartir la ubicación temporal. Tu cambio sigue visible localmente.', resizeBar: 'Redimensionar bloque de producción', resizeLeft: 'desde la izquierda', resizeRight: 'desde la derecha', adminOverview: 'Resumen', userManagement: 'Gestión de usuarios', managedAccounts: 'Cuentas Sentient administradas', chooseSentientAccount: 'Elegir cuenta de Sentient', assignAccount: 'Asignar', removeAccount: 'Quitar cuenta', usersCount: 'usuarios', loadingUsers: 'Cargando usuarios…', noUsers: 'No hay usuarios disponibles.', accountUpdateFailed: 'No se pudo actualizar la cuenta.',
    settings: 'Ajustes', accentColor: 'Color de acento', customColor: 'Color personalizado', custom: 'Personalizado', theme: 'Tema', language: 'Idioma', signOut: 'Cerrar sesión', darkTheme: 'Oscuro', lightTheme: 'Claro', signedInAs: 'Sesión iniciada como', adminSettings: 'Admin',
  },
};

COPY.en.traineeRole = 'Trainee';
COPY.es.traineeRole = 'Trainee';

COPY.en.returnToPool = 'Return to pool';
COPY.en.poolDropHint = 'Drop a scheduled request here to return it to the pool.';
COPY.en.returnedToPool = 'Request returned to the pool.';
COPY.en.duplicateRequest = 'Duplicate request';
COPY.en.duplicateCreated = 'Duplicate created in the production pool.';
COPY.es.returnToPool = 'Devolver al pool';
COPY.es.poolDropHint = 'Suelta aquí un request programado para devolverlo al pool.';
COPY.es.returnedToPool = 'Request devuelto al pool.';
COPY.es.duplicateRequest = 'Duplicar request';
COPY.es.duplicateCreated = 'La copia se creó en el pool de producción.';
COPY.en.targetAccountsHelp = 'Choose every account this assigned post must be published to.';
COPY.en.publishedLinksHelp = 'Add the published Instagram link for every destination account before closing.';
COPY.en.publishedLinkFor = 'Published link for';
COPY.es.targetAccountsHelp = 'Elige cada cuenta en la que debe publicarse este post asignado.';
COPY.es.publishedLinksHelp = 'Agrega el link publicado de Instagram para cada cuenta destino antes de cerrar.';
COPY.es.publishedLinkFor = 'Link publicado para';
Object.assign(COPY.en, {
  tickets: 'Requests', ticketInbox: 'Approval inbox', myRequests: 'My requests', ticketsPending: 'Pending', ticketsApproved: 'Approved', ticketsRejected: 'Rejected', approve: 'Approve', reject: 'Reject',
  pick: 'Pick', pickTitle: 'Pick a request', pickHelp: 'Choose a request from the production pool.', hotPickHelp: 'HOT posts are available for temporary test assignments. You can also continue to regular pool work.', nextRequest: 'Next', assignRequest: 'Assign', noPickRequests: 'There are no requests available in the pool or HOT list.', pickedRequest: 'Request assigned to your schedule.', pickPriority: 'Priority', hotRate: 'HOT rate',
  meeting: 'Meeting', break: 'Break', promo: 'Promo', focus: 'Focus time', other: 'Other', addTime: 'Add personal time', blockTitle: 'Title',
  startTime: 'Start time', duration: 'Duration', noteOptional: 'Note (optional)', requestApproval: 'Request approval', pendingApproval: 'Pending approval',
  approved: 'Approved', rejected: 'Rejected', ppRevision: 'PP revision', cancellationRequest: 'Cancellation', requestPPChange: 'Request PP change',
  requestCancellation: 'Request cancellation', requestMove: 'Request move', moveRequest: 'Move request', moveTo: 'Move to', moveHelp: 'Choose an earlier or later time for this block.', requestedPP: 'Requested PP', requestReason: 'Reason (optional)', sendRequest: 'Send request',
  ticketCreated: 'Request sent for approval.', ticketReviewed: 'Request reviewed.', noPendingTickets: 'No pending requests.', noApprovedTickets: 'No approved requests.', noRejectedTickets: 'No rejected requests.',
  rightClickHint: 'Right-click your scheduler row to add meetings, breaks, promos, or focus time.', personalTime: 'Personal time',
  managedAccounts: 'Managed Sentient accounts', manageAccounts: 'Manage accounts', accountSetupTitle: 'Set up your managed accounts', accountSetupHelp: 'Choose every Sentient account you can create for. Coordinators can then recommend the right account when they assign work.', saveManagedAccounts: 'Save my accounts', managedAccountsSaved: 'Managed accounts saved.', accountRequestTitle: 'Need another account?', accountRequestHelp: 'Request a missing account or one that has not been added to Sentient Dash yet. Admins and VCs will review it in Queue.', requestedAccounts: 'Account handles', accountRequestPlaceholder: 'e.g. @newaccount, @anotheraccount', accountAccessRequest: 'Account access request', accountRequestSent: 'Account request sent for approval.', accountRequestReason: 'Note for coordinators (optional)',
  howQueueWorks: 'How Queue works', startGuide: 'Start guided tour', guideWelcome: 'Welcome to Queue', guideLanguage: 'Choose your language first. The tour and Queue will use this language.', guideEnglish: 'English', guideSpanish: 'Español', guideContinue: 'Continue', guideSkip: 'Skip tour', guideBack: 'Back', guideNext: 'Next', guideFinish: 'Finish', guideStep: 'Step', guideSettingsTitle: 'Personalize Queue', guideSettingsBody: 'Change language, theme, accent color, or reopen your managed-account setup here.', guideRequestsTitle: 'Requests & approvals', guideRequestsBody: 'Open this inbox to review your requests. VCs and admins approve account access, time blocks, PP changes, moves, and cancellations here.', guideScheduleTitle: 'Your production day', guideScheduleBody: 'Use the date controls to review any day. The scheduler shows every planned block and the current time.', guidePoolTitle: 'The production pool', guidePoolBody: 'VCs and admins drag work from this pool onto a designer’s row. A draft is shared live before it is submitted.', guidePlannerTitle: 'Schedule blocks', guidePlannerBody: 'Open a block for its full brief, files, references, activity history, and the actions available to your role.', guideSubmitTitle: 'Submit planned work', guideSubmitBody: 'For coordinators, Submit confirms drafts and sends the assignment notifications. Designers see temporary placements live before then.', guideRoleTitle: 'Your work flow', guideRoleBody: 'Open an assigned block to start it, mark it complete, then close it with the published Instagram link.', guideUpcomingTitle: 'Upcoming work', guideUpcomingBody: 'This table keeps your next assignments in chronological order. Open any row to review the post, its priority, scheduled time, PP scope, and current status.', guideDashboardTitle: 'Return to Dashboard', guideDashboardBody: 'Use Dashboard to return to research, discover posts, and send the right ones into the production pool.',
  resetQueue: 'Reset Queue', resetQueueTitle: 'Reset all Queue data', resetQueueHelp: 'This permanently deletes every Queue assignment, pool request, draft, ticket, attachment, managed-account selection, and Queue event. Users, roles, accounts, Dashboard posts, Tracker, and Settings are preserved.', resetQueueConfirm: 'Type RESET_QUEUE to continue', resetQueueAction: 'Delete Queue data', queueResetDone: 'Queue was reset. All operational Queue data was removed.',
});
Object.assign(COPY.es, {
  tickets: 'Solicitudes', ticketInbox: 'Bandeja de aprobación', myRequests: 'Mis solicitudes', ticketsPending: 'Pendientes', ticketsApproved: 'Aprobadas', ticketsRejected: 'Rechazadas', approve: 'Aprobar', reject: 'Rechazar',
  pick: 'Pick', pickTitle: 'Elegir un request', pickHelp: 'Elige un request del pool de producción.', hotPickHelp: 'Los posts HOT están disponibles para asignaciones de prueba temporales. También puedes continuar con el trabajo regular del pool.', nextRequest: 'Siguiente', assignRequest: 'Asignar', noPickRequests: 'No hay requests disponibles en el pool ni en HOT.', pickedRequest: 'Request asignado a tu agenda.', pickPriority: 'Prioridad', hotRate: 'Rate HOT',
  meeting: 'Meeting', break: 'Break', promo: 'Promo', focus: 'Tiempo de enfoque', other: 'Otro', addTime: 'Agregar tiempo personal', blockTitle: 'Título',
  startTime: 'Hora de inicio', duration: 'Duración', noteOptional: 'Nota (opcional)', requestApproval: 'Solicitar aprobación', pendingApproval: 'Pendiente de aprobación',
  approved: 'Aprobado', rejected: 'Rechazado', ppRevision: 'Revisión de PPs', cancellationRequest: 'Cancelación', requestPPChange: 'Solicitar cambio de PPs',
  requestCancellation: 'Solicitar cancelación', requestMove: 'Solicitar mover', moveRequest: 'Solicitud de movimiento', moveTo: 'Mover a', moveHelp: 'Elige una hora más temprana o más tarde para este bloque.', requestedPP: 'PPs solicitados', requestReason: 'Motivo (opcional)', sendRequest: 'Enviar solicitud',
  ticketCreated: 'Solicitud enviada para aprobación.', ticketReviewed: 'Solicitud revisada.', noPendingTickets: 'No hay solicitudes pendientes.', noApprovedTickets: 'No hay solicitudes aprobadas.', noRejectedTickets: 'No hay solicitudes rechazadas.',
  rightClickHint: 'Haz click derecho en tu fila para agregar meetings, breaks, promos o tiempo de enfoque.', personalTime: 'Tiempo personal',
  managedAccounts: 'Cuentas Sentient que manejas', manageAccounts: 'Gestionar cuentas', accountSetupTitle: 'Configura las cuentas que manejas', accountSetupHelp: 'Elige todas las cuentas Sentient para las que puedes crear. Así los coordinadores podrán recomendar la cuenta correcta al asignarte trabajo.', saveManagedAccounts: 'Guardar mis cuentas', managedAccountsSaved: 'Cuentas administradas guardadas.', accountRequestTitle: '¿Necesitas otra cuenta?', accountRequestHelp: 'Solicita una cuenta que falte o que aún no se haya agregado a Sentient Dash. Los admins y VCs la revisarán en Queue.', requestedAccounts: 'Handles de cuentas', accountRequestPlaceholder: 'ej. @nuevacuenta, @otracuenta', accountAccessRequest: 'Solicitud de acceso a cuenta', accountRequestSent: 'Solicitud de cuenta enviada para aprobación.', accountRequestReason: 'Nota para coordinadores (opcional)',
  howQueueWorks: 'Cómo funciona Queue', startGuide: 'Iniciar guía', guideWelcome: 'Bienvenido a Queue', guideLanguage: 'Primero elige tu idioma. La guía y Queue usarán este idioma.', guideEnglish: 'English', guideSpanish: 'Español', guideContinue: 'Continuar', guideSkip: 'Omitir guía', guideBack: 'Atrás', guideNext: 'Siguiente', guideFinish: 'Finalizar', guideStep: 'Paso', guideSettingsTitle: 'Personaliza Queue', guideSettingsBody: 'Cambia el idioma, tema, color de acento o vuelve a abrir la configuración de tus cuentas aquí.', guideRequestsTitle: 'Solicitudes y aprobaciones', guideRequestsBody: 'Abre esta bandeja para revisar tus solicitudes. VCs y admins aprueban aquí accesos a cuentas, bloques de tiempo, cambios de PP, movimientos y cancelaciones.', guideScheduleTitle: 'Tu día de producción', guideScheduleBody: 'Usa los controles de fecha para revisar cualquier día. El scheduler muestra cada bloque planeado y la hora actual.', guidePoolTitle: 'El pool de producción', guidePoolBody: 'Los VCs y admins arrastran trabajo desde este pool a la fila de un designer. Un borrador se comparte en vivo antes de enviarse.', guidePlannerTitle: 'Bloques del scheduler', guidePlannerBody: 'Abre un bloque para ver su brief, archivos, referencias, historial y las acciones disponibles para tu rol.', guideSubmitTitle: 'Enviar trabajo planeado', guideSubmitBody: 'Para coordinadores, Enviar confirma borradores y manda las notificaciones. Los designers ven las ubicaciones temporales en vivo antes de eso.', guideRoleTitle: 'Tu flujo de trabajo', guideRoleBody: 'Abre un bloque asignado para empezarlo, marcarlo como completado y cerrarlo con el link publicado de Instagram.', guideUpcomingTitle: 'Próximo trabajo', guideUpcomingBody: 'Esta tabla mantiene tus asignaciones en orden cronológico. Abre cualquier fila para revisar el post, su prioridad, hora programada, alcance en PP y estado actual.', guideDashboardTitle: 'Volver al Dashboard', guideDashboardBody: 'Usa Dashboard para volver al research, descubrir posts y enviar los adecuados al pool de producción.',
  resetQueue: 'Reiniciar Queue', resetQueueTitle: 'Reiniciar toda la data de Queue', resetQueueHelp: 'Esto elimina permanentemente todas las asignaciones, requests del pool, borradores, tickets, archivos adjuntos, selecciones de cuentas y eventos de Queue. Conserva usuarios, roles, cuentas, posts del Dashboard, Tracker y Settings.', resetQueueConfirm: 'Escribe RESET_QUEUE para continuar', resetQueueAction: 'Eliminar data de Queue', queueResetDone: 'Queue fue reiniciado. Toda la data operativa fue eliminada.',
});

Object.assign(COPY.en, {
  createPost: 'Create Post', createPostTitle: 'Create a Queue post', createPostHelp: 'Start a production request without a dashboard post.', targetAccount: 'Publishing account', accountToSelect: 'Account selected when assigned', chooseAccountLater: 'Choose later (optional)', postTitle: 'Post title', postTitlePlaceholder: 'e.g. AI tools carousel for next week', postType: 'Post type', postTypeImage: 'Image', postTypeCarousel: 'Carousel', postTypeReel: 'Reel', postTypePromo: 'Promo', postTypeStory: 'Story', postTypeOther: 'Other', titleRequired: 'Add a title for this post.', accountRequired: 'Choose a Sentient account.', postCreated: 'Post created in the production pool.', sourceLink: 'Source link', sourceLinkHelp: 'Paste a public Reddit, X, Canva, LinkedIn, Facebook, Instagram, or other source link. Queue will try to bring in its title, description, and thumbnail.', getSourceDetails: 'Get details', gettingSourceDetails: 'Getting details…', sourcePreview: 'Source preview', sourceDetected: 'Details added without replacing fields you already edited.',
});
Object.assign(COPY.es, {
  createPost: 'Crear post', createPostTitle: 'Crear un post en Queue', createPostHelp: 'Inicia un request de producción sin un post del dashboard.', targetAccount: 'Cuenta de publicación', accountToSelect: 'Cuenta se elige al asignar', chooseAccountLater: 'Elegir después (opcional)', postTitle: 'Título del post', postTitlePlaceholder: 'ej. Carrusel de herramientas de IA para la próxima semana', postType: 'Tipo de post', postTypeImage: 'Imagen', postTypeCarousel: 'Carrusel', postTypeReel: 'Reel', postTypePromo: 'Promo', postTypeStory: 'Story', postTypeOther: 'Otro', titleRequired: 'Agrega un título para este post.', accountRequired: 'Elige una cuenta de Sentient.', postCreated: 'Post creado en el pool de producción.', sourceLink: 'Link de origen', sourceLinkHelp: 'Pega un link público de Reddit, X, Canva, LinkedIn, Facebook, Instagram u otra fuente. Queue intentará traer su título, descripción y miniatura.', getSourceDetails: 'Traer detalles', gettingSourceDetails: 'Obteniendo detalles…', sourcePreview: 'Vista previa del origen', sourceDetected: 'Se agregaron los detalles sin reemplazar campos que ya editaste.',
});
Object.assign(COPY.en, {
  traineeReview: 'Trainee review', sendForReview: 'Send for review', canvaLink: 'Canva design link',
  traineeReviewHelp: 'A VC or Admin must approve your Canva design before you can post and close this request.',
  traineeReviewPending: 'Waiting for VC/Admin review', traineeReviewApproved: 'Canva design approved', traineeReviewRejected: 'Changes requested — send an updated design for review.',
  traineeReviewSent: 'Canva design sent for review.', openCanva: 'Open Canva design',
  assignMultipleAccounts: 'Assign to multiple accounts', assignMultipleAccountsTitle: 'Assign to multiple accounts', assignMultipleAccountsHelp: 'Choose the Sentient accounts. Queue will create one scheduled copy for each user who manages a selected account.', assignMultipleAccountsSubmit: 'Assign copies', assignMultipleAccountsSuccess: 'Independent copies assigned.', assignMultipleAccountsNoManagers: 'No Queue users manage this account yet.', assignMultipleAccountsNoneSelected: 'Choose at least one account.',
});
Object.assign(COPY.es, {
  traineeReview: 'Revisión de trainee', sendForReview: 'Enviar a revisión', canvaLink: 'Link del diseño en Canva',
  traineeReviewHelp: 'Un VC o Admin debe aprobar tu diseño de Canva antes de que puedas postear y cerrar este request.',
  traineeReviewPending: 'Esperando revisión de VC/Admin', traineeReviewApproved: 'Diseño de Canva aprobado', traineeReviewRejected: 'Cambios solicitados — envía el diseño actualizado a revisión.',
  traineeReviewSent: 'Diseño de Canva enviado a revisión.', openCanva: 'Abrir diseño de Canva',
  assignMultipleAccounts: 'Asignar a varias cuentas', assignMultipleAccountsTitle: 'Asignar a varias cuentas', assignMultipleAccountsHelp: 'Elige las cuentas Sentient. Queue creará una copia programada para cada usuario que administre una cuenta seleccionada.', assignMultipleAccountsSubmit: 'Asignar copias', assignMultipleAccountsSuccess: 'Copias independientes asignadas.', assignMultipleAccountsNoManagers: 'Todavía no hay usuarios de Queue asignados a esta cuenta.', assignMultipleAccountsNoneSelected: 'Elige al menos una cuenta.',
});

const QueuePreferencesContext = createContext({ language: 'en', t: (key) => key });
const useQueuePreferences = () => useContext(QueuePreferencesContext);
const statusCopy = (status, t, isDraft = false) => isDraft ? t('tentative') : ({ pool: t('inPool'), scheduled: t('scheduled'), in_progress: t('inProgress'), completed: t('readyToClose'), closed: t('closed'), cancelled: t('cancelled') }[status] || status);
const isUrgent = (priority) => String(priority || '').toLowerCase() === 'urgent';
const priorityClass = (priority) => isUrgent(priority) ? 'priority-urgent' : 'priority-normal';
const priorityCopy = (priority, t) => isUrgent(priority) ? t('priorityUrgent') : '';
const hotIntensity = (value) => {
  const multiplier = Number(value);
  if (!Number.isFinite(multiplier) || multiplier < 3.5) return 'low';
  if (multiplier < 4.5) return 'medium';
  if (multiplier < 6) return 'high';
  return 'critical';
};
const isHotTask = (task) => Boolean(task?.isHot || task?.tags?.includes('hot'));
const hotClass = (task) => isHotTask(task) ? ` hot-intensity-${hotIntensity(task.hotMultiplier)}` : '';
const hotText = (task) => {
  const multiplier = Number(task?.hotMultiplier);
  return Number.isFinite(multiplier) && multiplier > 0 ? `HOT ${multiplier.toFixed(2)}×` : 'HOT';
};

async function json(path, options) {
  const response = await apiFetch(`${API_BASE}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || 'Queue could not complete that action.');
  return body;
}

function queuePost(task) {
  const type = task.post?.type || 'Image';
  return { ...task.post, postKey: `${task.post?.account}:${task.post?.shortcode}`, account: task.post?.account, shortcode: task.post?.shortcode, title: task.post?.title || task.title || '', isCustom: Boolean(task.post?.isCustom || task.isCustom), coverUrl: task.post?.coverUrl, caption: task.post?.caption || '', postDate: task.post?.publishedAt, postType: type, type, isVideo: String(type).toLowerCase().includes('video') || String(type).toLowerCase().includes('reel'), showsHotBadge: false };
}

function AuthGate({ notice, setNotice }) {
  const { t } = useQueuePreferences();
  const [busy, setBusy] = useState(false);
  const signIn = async () => { setBusy(true); const error = await startGoogleSignIn(); if (error) setNotice(describeSignInError(error)); setBusy(false); };
  return <main className="queue-auth"><section><h1>{t('productionQueue')}</h1><p>{notice || t('signInHelp')}</p><button type="button" onClick={signIn} disabled={busy}>{busy ? t('signingIn') : t('signIn')}</button></section></main>;
}

/* Queue keeps one compact preferences entry point, now anchored on the
   signed-in person's profile image rather than an anonymous settings gear. */
function QueueSettings({ isAdmin, isDev, userEmail, avatarUrl, displayLabel, onManageAccounts, onStartGuide, onResetQueue, onSignOut }) {
  const { t, language, setLanguage, theme, setTheme } = useQueuePreferences();
  const { accent, setAccent } = usePrefs();
  const [open, setOpen] = useState(false);
  const name = displayName(userEmail, displayLabel);
  const avatar = userAvatar(avatarUrl);
  return <div className="queue-settings">
    <button type="button" className={`queue-settings-trigger${open ? ' is-active' : ''}`} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={`${t('settings')} · ${name}`} title={`${t('settings')} · ${name}`}><span aria-hidden="true">{initialsFor(name)}</span>{avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} /> : null}</button>
    {open ? <><button type="button" className="queue-overlay-backdrop" onClick={() => setOpen(false)} aria-label={t('close')} /><div className="queue-settings-panel" role="dialog" aria-label={t('settings')}>
      <header><p className="scheduler-eyebrow">{t('settings')}</p><button type="button" onClick={() => setOpen(false)} aria-label={t('close')}><X size={14} /></button></header>
      <section className="queue-settings-section"><span>{t('accentColor')}</span><div className="queue-accent-picker">{ACCENT_CHOICES.map((value) => <button type="button" key={value} className={`accent-${value}${accent === value ? ' is-on' : ''}`} onClick={() => setAccent(value)} aria-label={`${value} accent`} />)}<label className="queue-custom-color" title={t('customColor')}><input type="color" value={accentHex(accent)} onChange={(event) => setAccent(event.target.value)} aria-label={t('customColor')} /><span>{t('custom')}</span></label></div></section>
      <section className="queue-settings-section"><span>{t('theme')}</span><div className="queue-settings-segment"><button type="button" className={theme === 'dark' ? 'is-on' : ''} onClick={() => setTheme('dark')}><Moon size={13} />{t('darkTheme')}</button><button type="button" className={theme === 'light' ? 'is-on' : ''} onClick={() => setTheme('light')}><Sun size={13} />{t('lightTheme')}</button></div></section>
      <section className="queue-settings-section"><span>{t('language')}</span><div className="queue-language" aria-label="Language"><button type="button" className={language === 'en' ? 'is-on' : ''} onClick={() => setLanguage('en')}>EN</button><button type="button" className={language === 'es' ? 'is-on' : ''} onClick={() => setLanguage('es')}>ES</button></div></section>
      {onManageAccounts ? <section className="queue-settings-section queue-settings-managed"><span>{t('managedAccounts')}</span><button type="button" className="queue-settings-link" onClick={() => { setOpen(false); onManageAccounts(); }}><Settings size={13} />{t('manageAccounts')}</button></section> : null}
      {onStartGuide ? <section className="queue-settings-section queue-settings-managed"><span>{t('howQueueWorks')}</span><button type="button" className="queue-settings-link" onClick={() => { setOpen(false); onStartGuide(); }}><ClipboardList size={13} />{t('startGuide')}</button></section> : null}
      {isAdmin || isDev ? <section className="queue-settings-section queue-settings-admin"><span>{t('adminOverview')}</span><a className="queue-settings-link" href={`${import.meta.env.BASE_URL}settings.html`}><Settings size={13} />{t('settings')}</a>{onResetQueue ? <button type="button" className="queue-settings-danger" onClick={() => { setOpen(false); onResetQueue(); }}><TimerReset size={13} />{t('resetQueue')}</button> : null}</section> : null}
      <footer><small>{t('signedInAs')} {userEmail}</small><button type="button" className="queue-settings-signout" onClick={onSignOut}><LogOut size={13} />{t('signOut')}</button></footer>
    </div></> : null}
  </div>;
}

function DevRolePreview({ isDev, canSwitchRoles = false, availableRoles = [] }) {
  const { t } = useQueuePreferences();
  const [open, setOpen] = useState(false);
  const [timeZone, setTimeZone] = useState(readDevTimeZone);
  const requestedRole = window.sessionStorage.getItem('sentient.queueRolePreview') || '';
  const options = [...new Set((isDev ? ROLE_SWITCHER_DEFAULTS[DEV_EMAIL] : availableRoles).filter((role) => ['sales', 'pd', 'vc', 'trainee', 'admin'].includes(role)))];
  const active = options.includes(requestedRole) ? requestedRole : '';
  if (!isDev && !canSwitchRoles) return null;
  const label = { sales: 'Sales', pd: t('postDesigner'), vc: t('viralCoordinator'), trainee: t('traineeRole'), admin: t('admin') }[active] || (isDev ? 'Dev' : t('activeRole'));
  const choose = (event) => { const role = event.target.value; if (role) window.sessionStorage.setItem('sentient.queueRolePreview', role); else window.sessionStorage.removeItem('sentient.queueRolePreview'); window.location.reload(); };
  const chooseTimeZone = (event) => { const next = event.target.value; window.sessionStorage.setItem(TIME_ZONE_PREVIEW_KEY, next); setTimeZone(next); window.dispatchEvent(new window.Event(TIME_ZONE_PREVIEW_EVENT)); };
  return <div className="dev-role-preview"><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}><span>{isDev ? 'DEV' : 'ROLE'}</span>{label}</button>{open ? <div className="dev-role-preview-panel"><strong>{isDev ? t('rolePreview') : t('activeRole')}</strong><p>{isDev ? t('onlyEsteban') : 'Switch among your assigned roles.'}</p><label>{t('activeRole')}<select value={active} onChange={choose}><option value="">{isDev ? t('devFullAccess') : 'Use my default role'}</option>{options.map((role) => <option key={role} value={role}>{({ sales: 'Sales', pd: t('postDesigner'), vc: t('viralCoordinator'), trainee: t('traineeRole'), admin: t('admin') })[role]}</option>)}</select></label>{isDev ? <label>Simulated time<select className="dev-timezone-preview" value={timeZone} onChange={chooseTimeZone}>{DEV_TIME_ZONES.map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}</select></label> : null}</div> : null}</div>;
}

function PriorityBadge({ priority }) {
  const { t } = useQueuePreferences();
  return isUrgent(priority) ? <span className="queue-priority-badge priority-urgent">{t('priorityUrgent')}</span> : null;
}

function TaskBlock({ task, editable, onOpen, onResizeStart, onContextMenu, accountAvatars = {}, timeZone = QUEUE_TIME_ZONE }) {
  const { t } = useQueuePreferences();
  const pendingTickets = Array.isArray(task.pendingTickets) ? task.pendingTickets : [];
  const pendingTicketLabel = pendingTickets.map((ticket) => ticket.type === 'pp_revision' ? t('ppRevision') : ticket.type === 'move' ? t('moveRequest') : t('cancellationRequest')).join(' · ');
  const left = task.scheduledStartMinutes ?? QUEUE_DAY_START;
  const planned = task.durationMinutes || 10;
  let width = planned;
  if (['completed', 'closed'].includes(task.status) && task.actualStartedAt && task.completedAt) width = Math.min(planned, Math.max(10, Math.round((new Date(task.completedAt) - new Date(task.actualStartedAt)) / 60000)));
  const extra = (task.scheduledStartMinutes ?? 0) + width > QUEUE_DAY_END;
  const canResize = editable && task.status === 'scheduled';
  const accountImage = (account) => { const value = accountAvatars?.[account] || ACCOUNT_PROFILE_FALLBACKS[String(account).toLowerCase()]; return value ? (String(value).startsWith('http') || String(value).startsWith('/') && !String(value).startsWith('/api/') ? String(value) : `${API_BASE}${value}`) : ''; };
  const isPromo = task.tags?.some((tag) => String(tag).toLowerCase() === 'promo') || task.post?.isPromo;
  return <button type="button" draggable={editable && task.status === 'scheduled'} className={`scheduler-block state-${task.status} ${priorityClass(task.priority)}${hotClass(task)}${task.isDraft ? ' is-draft' : ''}${isPromo ? ' is-promo' : ''}${extra ? ' is-extra' : ''}${pendingTickets.length ? ' has-pending-ticket' : ''}`} style={{ left: `${(left / QUEUE_DAY_END) * 100}%`, width: `${(width / QUEUE_DAY_END) * 100}%` }} onDragStart={(event) => { activeQueueDragId = task.id; event.dataTransfer.setData('queue-task', String(task.id)); }} onDragEnd={() => { activeQueueDragId = null; }} onContextMenu={(event) => onContextMenu?.(event, task)} onClick={(event) => { if (event.target.closest('.scheduler-resize-handle')) return; onOpen(task); }} title={`${accountMention(task.post.account) || task.post.title || t('post')}${isUrgent(task.priority) ? ` · ${priorityCopy(task.priority, t)}` : ''} · ${task.productionPoints} PP · ${statusCopy(task.status, t, task.isDraft)}${pendingTicketLabel ? ` · ${pendingTicketLabel}` : ''}`}>
    {cover(task) ? <img src={cover(task)} alt="" /> : null}<span className="scheduler-block-copy"><b>{task.post.title || accountMention(task.post.account) || t('post')}</b><small>{task.post.type || t('post')} · {task.isDraft ? `${t('tentative')} · ` : ''}{task.productionPoints} PP · {scheduleTimeForViewer(task.scheduledDate, task.scheduledStartMinutes ?? QUEUE_DAY_START, timeZone)}</small></span>{isUrgent(task.priority) ? <span className="scheduler-priority-mark priority-urgent">{priorityCopy(task.priority, t)}</span> : null}{pendingTickets.length ? <span className="scheduler-ticket-marker" title={pendingTicketLabel}><ClipboardList size={11} /><b>{pendingTickets.length}</b></span> : null}{isHotTask(task) ? <span className="queue-hot-badge">🔥 {hotText(task)}</span> : null}{task.isDraft ? <span className="scheduler-draft-badge">{t('tentative')}</span> : null}{extra ? <span className="scheduler-extra">{t('extra')}</span> : null}{task.recommendedAccounts?.length ? <span className="scheduler-account-badges">{task.recommendedAccounts.map((account) => <i key={account} title={`@${account}`}><span className="scheduler-account-avatar">{accountImage(account) ? <img src={accountImage(account)} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} /> : `@${account.slice(0, 1)}`}</span><b>@{account}</b></i>)}</span> : null}{canResize ? <><span className="scheduler-resize-handle scheduler-resize-handle-left" role="separator" aria-label={`${t('resizeBar')} ${t('resizeLeft')}`} onPointerDown={(event) => onResizeStart(event, task, 'left')} /><span className="scheduler-resize-handle scheduler-resize-handle-right" role="separator" aria-label={`${t('resizeBar')} ${t('resizeRight')}`} onPointerDown={(event) => onResizeStart(event, task, 'right')} /></> : null}
  </button>;
}

function TimeBlock({ block, onContextMenu, timeZone = QUEUE_TIME_ZONE }) {
  const { t } = useQueuePreferences();
  const Icon = ({ meeting: CalendarDays, break: Coffee, promo: TimerReset, focus: Clock3, other: CalendarPlus }[block.category] || CalendarPlus);
  const start = Number(block.scheduledStartMinutes || 0);
  const duration = Math.max(10, Number(block.durationMinutes || 10));
  const displayTime = scheduleTimeForViewer(block.scheduledDate, start, timeZone);
  return <div className={`scheduler-time-block category-${block.category || 'other'} status-${block.status}`} onContextMenu={(event) => onContextMenu?.(event, block)} style={{ left: `${(start / QUEUE_DAY_END) * 100}%`, width: `${(duration / QUEUE_DAY_END) * 100}%` }} title={`${block.title} · ${displayTime} · ${duration} min · ${block.status === 'pending' ? t('pendingApproval') : t('approved')}`}><Icon size={13} /><span><b>{block.title || t(block.category || 'other')}</b><small>{displayTime} · {duration} min</small></span>{block.status === 'pending' ? <i>{t('pendingApproval')}</i> : null}</div>;
}

function TimeBlockForm({ form, setForm, busy, onClose, onSubmit, users = [], canChooseUser = false, timeZone = QUEUE_TIME_ZONE }) {
  const { t, language } = useQueuePreferences();
  if (!form) return null;
  const valid = form.durationMinutes >= 10 && form.durationMinutes % 10 === 0 && form.startMinutes + form.durationMinutes <= QUEUE_DAY_END;
  const viewerClock = queueScheduleClock(form.scheduledDate, form.startMinutes, timeZone);
  const setViewerStart = (value) => setForm((current) => {
    const currentClock = queueScheduleClock(current.scheduledDate, current.startMinutes, timeZone);
    const canonical = queueScheduleFromViewer(currentClock.date, Math.round(minutesFromTime(value) / 10) * 10, timeZone);
    return { ...current, scheduledDate: canonical.date, startMinutes: canonical.minutes };
  });
  return <><button type="button" className="scheduler-context-backdrop" aria-label={t('close')} onClick={onClose} /><form className="scheduler-time-form" style={{ left: form.x, top: form.y }} onSubmit={(event) => { event.preventDefault(); if (valid) onSubmit(); }}><header><div><p className="scheduler-eyebrow">{t('personalTime')}</p><h3>{form.ticketId ? t('editRequest') : t('addTime')}</h3><small>{displayDate(viewerClock.date, language)}</small></div><button type="button" onClick={onClose} aria-label={t('close')}><X size={14} /></button></header><div className="scheduler-time-form-grid">{canChooseUser ? <label className="is-wide">{t('designer')}<select value={form.designerEmail || ''} onChange={(event) => setForm((current) => ({ ...current, designerEmail: event.target.value }))}>{users.map((user) => <option key={user.email} value={user.email}>{displayName(user.email, user.displayName)}</option>)}</select></label> : null}<label>{t('meeting')} / {t('break')}<select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}><option value="meeting">{t('meeting')}</option><option value="break">{t('break')}</option><option value="promo">{t('promo')}</option><option value="focus">{t('focus')}</option><option value="other">{t('other')}</option></select></label><label>{t('startTime')}<input type="time" step="600" value={time(viewerClock.minutes)} onChange={(event) => setViewerStart(event.target.value)} /></label><label>{t('duration')}<input type="number" min="10" max={Math.max(10, QUEUE_DAY_END - form.startMinutes)} step="10" value={form.durationMinutes} onChange={(event) => setForm((current) => ({ ...current, durationMinutes: Number(event.target.value) }))} /></label><label>{t('blockTitle')}<input value={form.title} maxLength="80" placeholder={t(form.category)} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label><label className="is-wide">{t('noteOptional')}<textarea value={form.note} maxLength="500" onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></label></div><button type="submit" className="scheduler-primary" disabled={busy || !valid}>{busy ? <LoaderCircle className="queue-spin" size={14} /> : <CalendarPlus size={14} />}{form.ticketId ? t('saveChanges') : (canChooseUser ? t('addTime') : t('requestApproval'))}</button></form></>;
}

function AccountSetupModal({ onboarding, accounts = [], onClose, onSave, onRequest }) {
  const { t } = useQueuePreferences();
  const selectedKey = (onboarding?.selectedAccounts || []).join('|');
  const [selected, setSelected] = useState(() => new Set(onboarding?.selectedAccounts || []));
  const [requested, setRequested] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setSelected(new Set(onboarding?.selectedAccounts || [])); }, [selectedKey]);
  const toggle = (handle) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(handle)) next.delete(handle); else next.add(handle);
    return next;
  });
  const save = async () => {
    setSaving(true); setError('');
    try { await onSave([...selected]); onClose(); }
    catch (err) { setError(err.message || 'Could not save managed accounts.'); }
    finally { setSaving(false); }
  };
  const requestAccess = async () => {
    const handles = requested.split(/[\n,]/).map((value) => value.trim()).filter(Boolean);
    if (!handles.length) { setError(t('accountRequestPlaceholder')); return; }
    setRequesting(true); setError('');
    try { await onRequest(handles, reason); setRequested(''); setReason(''); }
    catch (err) { setError(err.message || 'Could not send account request.'); }
    finally { setRequesting(false); }
  };
  return <div className="queue-create-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving && !requesting) onClose(); }}>
    <section className="queue-create-modal queue-account-setup-modal" role="dialog" aria-modal="true" aria-labelledby="queue-account-setup-title">
      <header className="queue-create-head"><div><p className="scheduler-eyebrow">Queue</p><h2 id="queue-account-setup-title">{t('accountSetupTitle')}</h2><small>{t('accountSetupHelp')}</small></div><button type="button" onClick={onClose} aria-label={t('close')} disabled={saving || requesting}><X size={16} /></button></header>
      <div className="queue-account-choice-grid">{accounts.map((account) => <label key={account.handle} className={`queue-account-choice${selected.has(account.handle) ? ' is-selected' : ''}`}><input type="checkbox" checked={selected.has(account.handle)} onChange={() => toggle(account.handle)} /><span><b>@{account.handle}</b><small>{account.label || account.handle}</small></span><Check size={14} /></label>)}{!accounts.length ? <p className="scheduler-empty">{t('noAccounts')}</p> : null}</div>
      <section className="queue-account-request"><header><h3>{t('accountRequestTitle')}</h3><p>{t('accountRequestHelp')}</p></header><label className="queue-create-note"><span>{t('requestedAccounts')}</span><input value={requested} onChange={(event) => setRequested(event.target.value)} placeholder={t('accountRequestPlaceholder')} /></label><label className="queue-create-note"><span>{t('accountRequestReason')}</span><textarea value={reason} rows={2} onChange={(event) => setReason(event.target.value)} /></label><button type="button" className="scheduler-secondary" disabled={requesting || !requested.trim()} onClick={requestAccess}>{requesting ? <LoaderCircle className="queue-spin" size={14} /> : <Send size={14} />}{t('sendRequest')}</button></section>
      {error ? <p className="queue-create-error" role="alert">{error}</p> : null}
      <footer className="queue-create-actions"><button type="button" className="scheduler-secondary" onClick={onClose} disabled={saving || requesting}>{t('cancel')}</button><button type="button" className="scheduler-primary" onClick={save} disabled={saving || requesting}>{saving ? <LoaderCircle className="queue-spin" size={14} /> : <Check size={14} />}{t('saveManagedAccounts')}</button></footer>
    </section>
  </div>;
}

function QueueGuide({ coordinator, step, setStep, onChooseLanguage, onComplete }) {
  const { t } = useQueuePreferences();
  const [rect, setRect] = useState(null);
  const steps = useMemo(() => [
    { selector: '.queue-settings-trigger', title: 'guideSettingsTitle', body: 'guideSettingsBody' },
    { selector: '.queue-ticket-button', title: 'guideRequestsTitle', body: 'guideRequestsBody' },
    { selector: '.scheduler-toolbar', title: 'guideScheduleTitle', body: 'guideScheduleBody' },
    ...(coordinator ? [{ selector: '.scheduler-pool', title: 'guidePoolTitle', body: 'guidePoolBody' }] : []),
    { selector: '.scheduler-canvas', title: 'guidePlannerTitle', body: 'guidePlannerBody', extraBody: coordinator ? 'guideSubmitBody' : 'guideRoleBody' },
    { selector: coordinator ? '.queue-admin-assignments' : '.designer-assignments', title: 'guideUpcomingTitle', body: 'guideUpcomingBody' },
    { selector: '.queue-dashboard-link', title: 'guideDashboardTitle', body: 'guideDashboardBody' },
  ], [coordinator]);
  const active = step >= 0 ? steps[step] : null;
  useEffect(() => {
    if (!active) { setRect(null); return undefined; }
    const update = () => {
      const target = document.querySelector(active.selector);
      if (!target) { setRect(null); return; }
      target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
      const bounds = target.getBoundingClientRect();
      setRect({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [active]);
  useEffect(() => {
    if (active && !rect) {
      const timer = window.setTimeout(() => {
        const target = document.querySelector(active.selector);
        if (!target) setStep((current) => Math.min(current + 1, steps.length - 1));
      }, 120);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [active, rect, setStep, steps.length]);
  if (step < 0) return <div className="queue-guide-layer" role="presentation"><div className="queue-guide-dim" /><section className="queue-guide-card queue-guide-welcome" role="dialog" aria-modal="true" aria-labelledby="queue-guide-title"><p className="scheduler-eyebrow">Queue</p><h2 id="queue-guide-title">{t('guideWelcome')}</h2><p>{t('guideLanguage')}</p><div className="queue-guide-language"><button type="button" onClick={() => { onChooseLanguage('en'); setStep(0); }}>{t('guideEnglish')}</button><button type="button" onClick={() => { onChooseLanguage('es'); setStep(0); }}>{t('guideSpanish')}</button></div><button type="button" className="queue-guide-skip" onClick={onComplete}>{t('guideSkip')}</button></section></div>;
  const pad = 7;
  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight;
  const cardWidth = Math.min(350, viewportWidth - 32);
  const cardLeft = rect ? Math.max(16, Math.min(rect.left, viewportWidth - cardWidth - 16)) : 16;
  const wantsBelow = !rect || rect.top + rect.height + 18 + 210 < viewportHeight;
  const cardTop = rect ? Math.max(16, Math.min(wantsBelow ? rect.top + rect.height + 16 : rect.top - 220, viewportHeight - 200)) : 16;
  const next = () => { if (step >= steps.length - 1) onComplete(); else setStep(step + 1); };
  const spotlight = rect ? { left: Math.max(0, rect.left - pad), top: Math.max(0, rect.top - pad), right: Math.min(viewportWidth, rect.left + rect.width + pad), bottom: Math.min(viewportHeight, rect.top + rect.height + pad) } : null;
  // The veils surround the target instead of covering it, so the rest of the
  // screen can soften while the current control stays completely readable.
  const veils = spotlight ? [
    { left: 0, top: 0, width: viewportWidth, height: spotlight.top },
    { left: 0, top: spotlight.bottom, width: viewportWidth, height: viewportHeight - spotlight.bottom },
    { left: 0, top: spotlight.top, width: spotlight.left, height: spotlight.bottom - spotlight.top },
    { left: spotlight.right, top: spotlight.top, width: viewportWidth - spotlight.right, height: spotlight.bottom - spotlight.top },
  ] : [];
  return <div className="queue-guide-layer" role="presentation">{veils.map((style, index) => <span key={index} className="queue-guide-veil" style={style} />)}{rect ? <span className="queue-guide-highlight" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} /> : null}<section className="queue-guide-card" role="dialog" aria-modal="true" aria-live="polite" style={{ left: cardLeft, top: cardTop, width: cardWidth }}><p className="scheduler-eyebrow">{t('guideStep')} {step + 1} / {steps.length}</p><h2>{t(active?.title)}</h2><p>{t(active?.body)}</p>{active?.extraBody ? <p>{t(active.extraBody)}</p> : null}<footer><button type="button" className="queue-guide-skip" onClick={onComplete}>{t('guideSkip')}</button><div>{step > 0 ? <button type="button" className="scheduler-secondary" onClick={() => setStep(step - 1)}>{t('guideBack')}</button> : null}<button type="button" className="scheduler-primary" onClick={next}>{step >= steps.length - 1 ? t('guideFinish') : t('guideNext')}</button></div></footer></section></div>;
}

function ResetQueueModal({ onClose, onReset }) {
  const { t } = useQueuePreferences();
  const [confirmation, setConfirmation] = useState('');
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  const canReset = confirmation.trim() === 'RESET_QUEUE';

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !resetting) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, resetting]);

  const submit = async (event) => {
    event.preventDefault();
    if (!canReset) return;
    setResetting(true);
    setError('');
    try {
      await onReset(confirmation.trim());
    } catch (reason) {
      setError(reason.message || 'Queue could not be reset.');
      setResetting(false);
    }
  };

  return <div className="queue-create-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !resetting) onClose(); }}>
    <form className="queue-create-modal queue-reset-modal" onSubmit={submit} aria-labelledby="queue-reset-title">
      <header className="queue-create-head"><div><p className="scheduler-eyebrow">Queue</p><h2 id="queue-reset-title">{t('resetQueueTitle')}</h2><small>{t('resetQueueHelp')}</small></div><button type="button" onClick={onClose} aria-label={t('close')} disabled={resetting}><X size={16} /></button></header>
      <label className="queue-create-note"><span>{t('resetQueueConfirm')}</span><input value={confirmation} autoFocus autoComplete="off" spellCheck="false" onChange={(event) => setConfirmation(event.target.value)} placeholder="RESET_QUEUE" /></label>
      {error ? <p className="queue-create-error" role="alert">{error}</p> : null}
      <footer className="queue-create-actions"><button type="button" className="scheduler-secondary" onClick={onClose} disabled={resetting}>{t('cancel')}</button><button type="submit" className="scheduler-danger" disabled={!canReset || resetting}>{resetting ? <LoaderCircle className="queue-spin" size={14} /> : <TimerReset size={14} />}{t('resetQueueAction')}</button></footer>
    </form>
  </div>;
}

function CreatePostModal({ tags = [], onClose, onCreated }) {
  const { t } = useQueuePreferences();
  const [form, setForm] = useState({ title: '', postType: 'Image', productionPoints: 3, brief: '', notes: '', references: '' });
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourcePreview, setSourcePreview] = useState(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [titleEdited, setTitleEdited] = useState(false);
  const [briefEdited, setBriefEdited] = useState(false);
  const [tagSet, setTagSet] = useState(() => new Set());
  const [attachmentFiles, setAttachmentFiles] = useState([]);
  const [createdRequestId, setCreatedRequestId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const toggleTag = (tag) => setTagSet((current) => {
    const next = new Set(current);
    if (next.has(tag)) next.delete(tag); else next.add(tag);
    return next;
  });

  const fetchSource = async () => {
    const candidate = sourceUrl.trim();
    if (!candidate || sourceLoading) return;
    setSourceLoading(true);
    setError('');
    try {
      const result = await json('/api/dashboard/queue/v2/source-preview', { method: 'POST', body: new URLSearchParams({ source_url: candidate }) });
      const preview = result.preview || {};
      const extractedTitle = preview.title && String(preview.title).trim().toLowerCase() !== String(preview.platform || '').trim().toLowerCase() ? preview.title : '';
      setSourcePreview(preview);
      setSourceUrl(preview.sourceUrl || candidate);
      setForm((current) => {
        const references = current.references.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
        const reference = preview.sourceUrl || candidate;
        if (reference && !references.includes(reference)) references.unshift(reference);
        return {
          ...current,
          title: !titleEdited || !current.title.trim() ? (extractedTitle || current.title) : current.title,
          brief: !briefEdited || !current.brief.trim() ? (preview.description || current.brief) : current.brief,
          references: references.join('\n'),
        };
      });
    } catch (reason) {
      setSourcePreview(null);
      setError(reason.message || 'Could not get source details.');
    } finally {
      setSourceLoading(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) { setError(t('titleRequired')); return; }
    if (!Number.isInteger(Number(form.productionPoints)) || Number(form.productionPoints) < 1) { setError('Production points must be at least 1.'); return; }
    setSaving(true);
    setError('');
    try {
      let requestId = createdRequestId;
      let createdRequest = null;
      if (!requestId) {
        const body = new FormData();
        body.append('title', form.title.trim());
        body.append('post_type', form.postType);
        body.append('production_points', String(form.productionPoints));
        body.append('brief', form.brief);
        body.append('notes', form.notes);
        body.append('references', JSON.stringify(form.references.split(/\n|,/).map((item) => item.trim()).filter(Boolean)));
        body.append('tags', [...tagSet].join(','));
        body.append('source_url', sourcePreview?.sourceUrl || sourceUrl.trim());
        body.append('source_title', sourcePreview?.title || '');
        body.append('source_description', sourcePreview?.description || '');
        body.append('source_image_url', sourcePreview?.imageUrl || '');
        const response = await apiFetch(`${API_BASE}/api/dashboard/queue/v2/create`, { method: 'POST', body });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.detail || 'Could not create this Queue post.');
        createdRequest = result.request;
        requestId = createdRequest?.id;
        setCreatedRequestId(requestId);
      }
      const failed = [];
      for (const file of attachmentFiles) {
        try {
          const fileBody = new FormData();
          fileBody.append('file', file);
          const response = await apiFetch(`${API_BASE}/api/dashboard/queue/v2/requests/${requestId}/attachments`, { method: 'POST', body: fileBody });
          if (!response.ok) failed.push(file);
        } catch { failed.push(file); }
      }
      if (failed.length) {
        setAttachmentFiles(failed);
        throw new Error(`The post is already in the Pool, but ${failed.length} file${failed.length === 1 ? '' : 's'} failed to upload. Send again to retry only those files.`);
      }
      await onCreated(createdRequest || { id: requestId });
    } catch (reason) {
      setError(reason.message || 'Could not create this Queue post.');
    } finally {
      setSaving(false);
    }
  };

  const tagOptions = tags.filter((tag) => tag !== 'hot');
  const typeOptions = [
    ['Image', 'postTypeImage'], ['Carousel', 'postTypeCarousel'], ['Reel', 'postTypeReel'],
    ['Promo', 'postTypePromo'], ['Story', 'postTypeStory'], ['Other', 'postTypeOther'],
  ];

  return <div className="queue-create-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <form className="queue-create-modal" onSubmit={submit} aria-labelledby="queue-create-title">
      <header className="queue-create-head"><div><p className="scheduler-eyebrow">Queue</p><h2 id="queue-create-title">{t('createPostTitle')}</h2><small>{t('createPostHelp')}</small></div><button type="button" onClick={onClose} aria-label={t('close')} disabled={saving}><X size={16} /></button></header>
      <section className="queue-source-link"><header><div><span>{t('sourceLink')} <i>optional</i></span><small>{t('sourceLinkHelp')}</small></div></header><div><input type="url" value={sourceUrl} placeholder="https://www.reddit.com/..." onChange={(event) => { setSourceUrl(event.target.value); setSourcePreview(null); }} onBlur={() => { if (sourceUrl.trim() && !sourcePreview) fetchSource(); }} /><button type="button" className="scheduler-secondary" disabled={!sourceUrl.trim() || sourceLoading} onClick={fetchSource}>{sourceLoading ? <LoaderCircle className="queue-spin" size={14} /> : <Link2 size={14} />}{sourceLoading ? t('gettingSourceDetails') : t('getSourceDetails')}</button></div>{sourcePreview ? <article className="queue-source-preview"><div>{sourcePreview.imageUrl ? <img src={sourcePreview.imageUrl} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.parentElement.hidden = true; }} /> : null}</div><span><b>{sourcePreview.platform || t('sourcePreview')}</b><strong>{sourcePreview.title || sourcePreview.sourceUrl}</strong>{sourcePreview.description ? <small>{sourcePreview.description}</small> : null}</span></article> : null}</section>
      <div className="queue-create-grid">
        <label className="is-wide"><span>{t('postTitle')} <i>required</i></span><input value={form.title} maxLength="160" autoFocus onChange={(event) => { setTitleEdited(true); setForm((current) => ({ ...current, title: event.target.value })); }} placeholder={t('postTitlePlaceholder')} /></label>
        <label><span>{t('postType')}</span><select value={form.postType} onChange={(event) => setForm((current) => ({ ...current, postType: event.target.value }))}>{typeOptions.map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</select></label>
        <label><span>{t('productionPoints')} <i>required</i></span><input type="number" min="1" step="1" value={form.productionPoints} onChange={(event) => setForm((current) => ({ ...current, productionPoints: event.target.value }))} /></label>
      </div>
      <label className="queue-create-note"><span>{t('brief')} <i>optional</i></span><textarea value={form.brief} onChange={(event) => { setBriefEdited(true); setForm((current) => ({ ...current, brief: event.target.value })); }} rows={3} /></label>
      <label className="queue-create-note"><span>{t('notes')} <i>optional</i></span><textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={2} /></label>
      <label className="queue-create-note"><span>{t('referenceLinks')} <i>optional</i></span><textarea value={form.references} onChange={(event) => setForm((current) => ({ ...current, references: event.target.value }))} placeholder={t('oneLinkPerLine')} rows={2} /></label>
      <label className="queue-create-files"><span>{t('attachments')} <i>optional · up to 20 MB each</i></span><input type="file" multiple onChange={(event) => setAttachmentFiles([...event.target.files])} />{attachmentFiles.length ? <small>{attachmentFiles.map((file) => file.name).join(' · ')}</small> : null}</label>
      {tagOptions.length ? <fieldset className="queue-create-fieldset"><legend>{t('tags')} <i>optional</i></legend><div className="queue-tag-picker">{tagOptions.map((tag) => <button type="button" key={tag} className={tagSet.has(tag) ? 'is-on' : ''} onClick={() => toggleTag(tag)}>{tag}</button>)}</div></fieldset> : null}
      {error ? <p className="queue-create-error" role="alert">{error}</p> : null}
      <footer className="queue-create-actions"><button type="button" className="scheduler-secondary" onClick={onClose} disabled={saving}>{t('cancel')}</button><button type="submit" className="scheduler-primary" disabled={saving}>{saving ? <LoaderCircle className="queue-spin" size={14} /> : <Plus size={14} />}{t('createPost')}</button></footer>
    </form>
  </div>;
}

function AssignMultipleAccountsModal({ task, accounts = [], designers = [], busy = false, onClose, onSubmit }) {
  const { t } = useQueuePreferences();
  const [selected, setSelected] = useState(() => new Set());
  const sentientAccounts = useMemo(() => accounts
    .filter((account) => account?.handle)
    .map((account) => ({ ...account, handle: String(account.handle).replace(/^@/, '').toLowerCase() }))
    .filter((account, index, list) => list.findIndex((item) => item.handle === account.handle) === index)
    .sort((a, b) => a.handle.localeCompare(b.handle)), [accounts]);
  const toggle = (handle) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(handle)) next.delete(handle); else next.add(handle);
    return next;
  });
  const submit = async () => {
    if (!selected.size || busy) return;
    await onSubmit([...selected]);
  };
  return <div className="queue-create-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="queue-create-modal queue-multi-account-modal" role="dialog" aria-modal="true" aria-labelledby="queue-multi-account-title">
      <header className="queue-create-head"><div><p className="scheduler-eyebrow">Queue</p><h2 id="queue-multi-account-title">{t('assignMultipleAccountsTitle')}</h2><small>{t('assignMultipleAccountsHelp')}</small></div><button type="button" onClick={onClose} aria-label={t('close')} disabled={busy}><X size={16} /></button></header>
      <div className="queue-multi-account-source"><span>{task?.post?.title || accountMention(task?.post?.account) || t('post')}</span><small>{task?.productionPoints || 1} PP · {task?.durationMinutes || 10} {t('minutes')}</small></div>
      <div className="queue-multi-account-list">{sentientAccounts.map((account) => {
        const managerCount = designers.filter((designer) => (designer.accounts || []).some((value) => String(value).replace(/^@/, '').toLowerCase() === account.handle)).length;
        return <label key={account.handle} className={`queue-multi-account-option${selected.has(account.handle) ? ' is-selected' : ''}`}><input type="checkbox" checked={selected.has(account.handle)} onChange={() => toggle(account.handle)} /><span><b>@{account.handle}</b><small>{managerCount ? `${managerCount} ${t('usersCount')}` : t('assignMultipleAccountsNoManagers')}</small></span><Check size={14} /></label>;
      })}{!sentientAccounts.length ? <p className="scheduler-empty">{t('noAccounts')}</p> : null}</div>
      <footer className="queue-create-actions"><button type="button" className="scheduler-secondary" onClick={onClose} disabled={busy}>{t('cancel')}</button><button type="button" className="scheduler-primary" onClick={submit} disabled={busy || !selected.size}>{busy ? <LoaderCircle className="queue-spin" size={14} /> : <Check size={14} />}{t('assignMultipleAccountsSubmit')}</button></footer>
    </section>
  </div>;
}

function PoolCard({ task, onOpen, canMultiAssign = false }) {
  const { t } = useQueuePreferences();
  return <article className={`queue-pool-card ${priorityClass(task.priority)}${hotClass(task)}${task.isDraft ? ' is-draft' : ''}`} draggable data-context-type="pool" data-context-title={task.post.title || accountMention(task.post.account) || t('post')} data-context-post-key={task.postKey || task.id} data-context-request-id={task.id} data-context-duplicate="true" data-context-multi-assign={canMultiAssign ? 'true' : 'false'} data-context-account={task.post.account || ''} data-context-shortcode={task.post.shortcode || ''} data-context-permalink={task.post.permalink || ''} onDragStart={(event) => { activeQueueDragId = task.id; event.dataTransfer.setData('queue-task', String(task.id)); }} onDragEnd={() => { activeQueueDragId = null; }}><button type="button" onClick={() => onOpen(task)}>{cover(task) ? <img src={cover(task)} alt="" /> : <span className="queue-pool-empty">@</span>}<span><b>{task.post.title || accountMention(task.post.account) || t('post')}</b><small>{task.post.title && task.post.account ? `${accountMention(task.post.account)} · ` : task.post.account ? `${accountMention(task.post.account)} · ` : `${t('accountToSelect')} · `}{task.productionPoints} PP · {task.durationMinutes} min</small>{task.isDraft ? <em>{t('returnToPool')}</em> : null}</span><span className="queue-pool-card-badges"><PriorityBadge priority={task.priority} />{isHotTask(task) ? <i className="queue-hot-badge">🔥 {hotText(task)}</i> : null}</span></button><div>{task.tags?.filter((tag) => tag !== 'hot').map((tag) => <i key={tag}>{tag}</i>)}</div></article>;
}

function DesignerAssignments({ tasks, onOpen, timeZone = QUEUE_TIME_ZONE }) {
  const { t, language } = useQueuePreferences();
  return <section className="designer-assignments"><header><div><p className="scheduler-eyebrow">{t('myAssignedWork')}</p><h2>{t('upcomingProduction')}</h2></div><small>{tasks.length} {tasks.length === 1 ? t('activeRequest') : t('activeRequests')}</small></header>{tasks.length ? <div className="designer-assignment-table" role="table"><div className="designer-assignment-head" role="row"><span>{t('post')}</span><span>{t('scheduled')}</span><span>{t('priority')}</span><span>{t('scope')}</span><span>{t('status')}</span></div>{tasks.map((task) => <button type="button" role="row" key={task.id} className={`designer-assignment-row state-${task.status} ${priorityClass(task.priority)}${hotClass(task)}${task.isDraft ? ' is-draft' : ''}`} onClick={() => onOpen(task)}><span className="designer-assignment-post">{cover(task) ? <img src={cover(task)} alt="" /> : <span className="designer-assignment-empty">@</span>}<span><b>{task.post.title || accountMention(task.post.account) || t('post')}</b><small>{task.post.account ? accountMention(task.post.account) : t('accountToSelect')} · {task.brief || task.post.caption || t('post')}</small></span></span><span className="designer-assignment-time"><b>{displayDate(scheduleDateForViewer(task.scheduledDate, task.scheduledStartMinutes ?? QUEUE_DAY_START, timeZone), language)}</b><small>{scheduleTimeForViewer(task.scheduledDate, task.scheduledStartMinutes ?? QUEUE_DAY_START, timeZone)} · {task.durationMinutes} {t('minutes')}</small></span><span className="designer-assignment-priority"><PriorityBadge priority={task.priority} />{isHotTask(task) ? <i className="queue-hot-badge">🔥 {hotText(task)}</i> : null}</span><span className="designer-assignment-pp"><b>{task.productionPoints} PP</b><small>{task.tags?.filter((tag) => tag !== 'hot').slice(0, 2).join(' · ') || t('noTags')}</small></span><span className="designer-assignment-status"><i>{statusCopy(task.status, t, task.isDraft)}</i>{task.isDraft ? <small>{t('tentativeBy')} {displayName(task.draftCoordinatorEmail)}</small> : null}</span></button>)}</div> : <div className="designer-assignments-empty"><CalendarDays size={18} /><strong>{t('noActiveAssignments')}</strong><span>{t('emptyAssignments')}</span></div>}</section>;
}

function AdminAssignmentTable({ tasks, onOpen, headingKey = 'allAssignedPosts', countKey = 'assignedPostsCount' }) {
  const { t, language } = useQueuePreferences();
  return <section className="queue-admin-assignments"><header><div><p className="scheduler-eyebrow">{t(headingKey)}</p><h3>{tasks.length} {t(countKey)}</h3></div></header>{tasks.length ? <div className="queue-admin-assignment-table" role="table"><div className="queue-admin-assignment-head" role="row"><span>{t('post')}</span><span>{t('designer')}</span><span>{t('scheduled')}</span><span>{t('priority')}</span><span>{t('productionPoints')}</span><span>{t('status')}</span></div>{tasks.map((task) => <button type="button" role="row" key={task.id} className={`queue-admin-assignment-row state-${task.status} ${priorityClass(task.priority)}${hotClass(task)}${task.isDraft ? ' is-draft' : ''}`} data-context-type="task" data-context-request-id={task.id} data-context-duplicate="true" onClick={() => onOpen(task)}><span className="queue-admin-assignment-post">{cover(task) ? <img src={cover(task)} alt="" /> : <span className="queue-admin-assignment-empty">@</span>}<span><b>{task.post.title || accountMention(task.post.account) || t('post')}</b><small>{task.post.account ? accountMention(task.post.account) : t('accountToSelect')} · {task.brief || task.post.caption || t('post')}</small>{task.recommendedAccounts?.length ? <em>{task.recommendedAccounts.map((account) => `@${account}`).join(' · ')}</em> : null}{isHotTask(task) ? <i className="queue-hot-badge">🔥 {hotText(task)}</i> : null}</span></span><span className="queue-admin-assignment-designer"><b>{task.designerEmail ? displayName(task.designerEmail) : '—'}</b><small>{task.designerEmail || ''}</small></span><span className="queue-admin-assignment-time"><b>{task.scheduledDate ? displayDate(task.scheduledDate, language) : '—'}</b><small>{task.scheduledStartMinutes == null ? '—' : `${time(task.scheduledStartMinutes)} · ${task.durationMinutes} ${t('minutes')}`}</small></span><span className="queue-admin-assignment-priority"><PriorityBadge priority={task.priority} /></span><span className="queue-admin-assignment-pp"><b>{task.productionPoints} PP</b><small>{task.tags?.filter((tag) => tag !== 'hot').slice(0, 2).join(' · ') || t('noTags')}</small></span><span className="queue-admin-assignment-status"><i>{statusCopy(task.status, t, task.isDraft)}</i></span></button>)}</div> : <p className="queue-admin-assignment-empty-state">{t('noAssignedPosts')}</p>}</section>;
}

function QueueOverview({ report, loading, error, onRetry, onOpen }) {
  const { t } = useQueuePreferences();
  const totals = report?.totals || {};
  const metric = (status, label) => <article className={`queue-overview-metric status-${status}`} key={status}><span>{label}</span><strong>{Number(totals[status]?.count || 0)}</strong><small>{Number(totals[status]?.points || 0)} PP</small></article>;
  if (loading) return <section className="queue-overview-page"><header className="queue-overview-header"><div><p className="scheduler-eyebrow">{t('adminOverview')}</p><h2>{t('loadingReport')}</h2></div></header><div className="queue-overview-loading"><LoaderCircle className="queue-spin" size={20} />{t('loadingReport')}</div></section>;
  if (error) return <section className="queue-overview-page"><header className="queue-overview-header"><div><p className="scheduler-eyebrow">{t('adminOverview')}</p><h2>{t('productionReports')}</h2></div><button type="button" className="scheduler-secondary" onClick={onRetry}>{t('tryAgain')}</button></header><p className="queue-overview-error">{error}</p></section>;
  const designers = report?.designers || [];
  const assignedPosts = report?.assignedPosts || [];
  return <section className="queue-overview-page"><header className="queue-overview-header"><div><p className="scheduler-eyebrow">{t('adminOverview')}</p><h2>{t('productionReports')}</h2><small>{t('workloadHelp')}</small></div><div className="queue-overview-header-meta"><span>{assignedPosts.length} {t('assignedPostsCount')}</span><span>{designers.length} {t('designer')}</span></div></header><div className="queue-overview-metrics">{metric('pool', t('inPool'))}{metric('scheduled', t('scheduled'))}{metric('in_progress', t('inProgress'))}{metric('completed', t('readyToClose'))}{metric('closed', t('closed'))}</div><section className="queue-overview-designers"><header><div><p className="scheduler-eyebrow">{t('designerWorkload')}</p><h3>{designers.length} {t('allUsers')}</h3></div></header><div className="queue-overview-designer-grid">{designers.map((designer) => <article key={designer.email}><div><b>{displayName(designer.email, designer.displayName)}</b><small>{designer.activeRequests} {t('activeRequests')}</small></div><strong>{designer.productionPoints} PP</strong><span>{designer.closedRequests} {t('closed')}</span></article>)}{!designers.length ? <p className="scheduler-empty">{t('noAssignedPosts')}</p> : null}</div></section><AdminAssignmentTable tasks={assignedPosts} onOpen={onOpen} headingKey="allAssignedPosts" countKey="assignedPostsCount" /></section>;
}

function TicketPanel({ tickets, loading, error, onClose, onReview, canReview }) {
  const { t, language } = useQueuePreferences();
  const [tab, setTab] = useState('pending');
  const [busy, setBusy] = useState('');
  const items = tickets.filter((ticket) => ticket.status === tab);
  const counts = {
    pending: tickets.filter((ticket) => ticket.status === 'pending').length,
    approved: tickets.filter((ticket) => ticket.status === 'approved').length,
    rejected: tickets.filter((ticket) => ticket.status === 'rejected').length,
  };
  const tabs = [
    { status: 'pending', label: 'ticketsPending', empty: 'noPendingTickets' },
    { status: 'approved', label: 'ticketsApproved', empty: 'noApprovedTickets' },
    { status: 'rejected', label: 'ticketsRejected', empty: 'noRejectedTickets' },
  ];
  const emptyMessage = tabs.find((item) => item.status === tab)?.empty || 'noPendingTickets';
  const review = async (ticket, action) => { setBusy(`${ticket.id}:${action}`); try { await onReview(ticket.id, action); } finally { setBusy(''); } };
  const ticketTitle = (ticket) => ticket.type === 'account_access' ? t('accountAccessRequest') : ticket.type === 'move' ? t('moveRequest') : ticket.type === 'time_block' ? (ticket.title || t(ticket.category || 'other')) : ticket.type === 'pp_revision' ? t('ppRevision') : ticket.type === 'trainee_review' ? t('traineeReview') : t('cancellationRequest');
  const ticketMeta = (ticket) => {
    if (ticket.type === 'account_access') return (ticket.requestedAccounts || []).map((account) => `@${account}`).join(' · ') || t('noAccounts');
    if (ticket.type === 'move') {
      const account = ticket.request?.post?.account ? `@${ticket.request.post.account}` : t('post');
      return `${account} · ${ticket.scheduledDate || '—'} · ${time(ticket.scheduledStartMinutes ?? 0)}`;
    }
    if (ticket.type === 'time_block') return `${displayDate(ticket.scheduledDate, language)} · ${time(ticket.scheduledStartMinutes)} · ${ticket.durationMinutes} min`;
    const account = ticket.request?.post?.account ? `@${ticket.request.post.account}` : t('post');
    if (ticket.type === 'pp_revision') return `${account} · ${ticket.request?.productionPoints || '—'} PP → ${ticket.requestedProductionPoints} PP`;
    if (ticket.type === 'trainee_review') return `${account} · ${t('canvaLink')}`;
    return `${account} · ${statusCopy(ticket.request?.status, t)}`;
  };
  return <><button type="button" className="queue-overlay-backdrop" onClick={onClose} aria-label={t('close')} /><aside className="queue-ticket-panel" aria-label={t(canReview ? 'ticketInbox' : 'myRequests')}>
    <header><div><p className="scheduler-eyebrow">{t('tickets')}</p><h2>{t(canReview ? 'ticketInbox' : 'myRequests')}</h2></div><button type="button" onClick={onClose} aria-label={t('close')}><X size={16} /></button></header>
    <nav role="tablist">{tabs.map((item) => <button key={item.status} type="button" role="tab" aria-selected={tab === item.status} className={tab === item.status ? 'is-active' : ''} onClick={() => setTab(item.status)}>{t(item.label)} <b>{counts[item.status]}</b></button>)}</nav>
    <div className="queue-ticket-list">
      {loading ? <div className="queue-ticket-state"><LoaderCircle className="queue-spin" />{t('loadingSchedule')}</div> : null}
      {error ? <p className="queue-ticket-error">{error}</p> : null}
      {!loading && !items.length ? <div className="queue-ticket-empty"><ClipboardList size={20} /><span>{t(emptyMessage)}</span></div> : null}
      {items.map((ticket) => <article key={ticket.id} className={`ticket-${ticket.type} status-${ticket.status}`}><header><span>{ticket.type === 'account_access' ? <Settings size={14} /> : ticket.type === 'time_block' ? <CalendarPlus size={14} /> : ticket.type === 'pp_revision' ? <TimerReset size={14} /> : ticket.type === 'move' ? <TimerReset size={14} /> : ticket.type === 'trainee_review' ? <Pencil size={14} /> : <Ban size={14} />}</span><div><b>{ticketTitle(ticket)}</b><small>{displayName(ticket.requesterEmail)} · {displayTimestamp(ticket.createdAt, language)}</small></div><i>{ticket.status === 'pending' ? t('ticketsPending') : t(ticket.status)}</i></header><p>{ticketMeta(ticket)}</p>{ticket.reason ? ticket.type === 'trainee_review' ? <a className="queue-ticket-link" href={ticket.reason} target="_blank" rel="noreferrer">{t('openCanva')}</a> : <blockquote>{ticket.reason}</blockquote> : null}{ticket.status === 'pending' && canReview ? <footer><button type="button" className="is-approve" disabled={Boolean(busy)} onClick={() => review(ticket, 'approve')}>{busy === `${ticket.id}:approve` ? <LoaderCircle className="queue-spin" size={13} /> : <Check size={13} />}{t('approve')}</button><button type="button" className="is-reject" disabled={Boolean(busy)} onClick={() => review(ticket, 'reject')}>{busy === `${ticket.id}:reject` ? <LoaderCircle className="queue-spin" size={13} /> : <X size={13} />}{t('reject')}</button></footer> : ticket.status === 'pending' ? <small className="ticket-reviewer">{t('pendingApproval')}</small> : <small className="ticket-reviewer">{ticket.reviewerEmail ? displayName(ticket.reviewerEmail) : '—'} · {ticket.reviewedAt ? displayTimestamp(ticket.reviewedAt, language) : ''}</small>}</article>)}
    </div>
  </aside></>;
}

function AttachmentList({ task, busy, onUpload, onDownload }) {
  const { t } = useQueuePreferences();
  return <section className="queue-detail-section"><h3><Paperclip size={13} />{t('attachments')}</h3>{task.attachments?.length ? <div className="queue-attachments">{task.attachments.map((file) => <button type="button" key={file.id} disabled={busy} onClick={() => onDownload(file)}><Download size={13} /><span>{file.name}</span><small>{Math.max(1, Math.round(file.size / 1024))} KB</small></button>)}</div> : <p className="queue-detail-empty">{t('noFiles')}</p>}<label className="queue-upload-button"><Paperclip size={13} />{t('uploadFiles')}<input type="file" multiple disabled={busy} onChange={(event) => { onUpload([...event.target.files]); event.target.value = ''; }} /></label></section>;
}

function HistoryList({ events, loading }) {
  const { t, language } = useQueuePreferences();
  return <section className="queue-detail-section"><h3><History size={13} />{t('history')}</h3>{loading ? <LoaderCircle className="queue-spin" size={16} /> : events?.length ? <ol className="queue-history">{events.map((event, index) => <li key={`${event.createdAt}-${index}`}><span className={`history-dot type-${event.type}`} /><div><b>{event.type.replaceAll('_', ' ')}</b><small>{displayName(event.actorEmail)} · {displayTimestamp(event.createdAt, language)}</small></div></li>)}</ol> : <p className="queue-detail-empty">{t('noHistory')}</p>}</section>;
}

function TraineeReviewAction({ task, isTrainee, isOwner, busy, onSend }) {
  const { t } = useQueuePreferences();
  const review = task?.traineeReview;
  const [canvaLink, setCanvaLink] = useState(review?.canvaLink || '');
  useEffect(() => { setCanvaLink(review?.canvaLink || ''); }, [task?.id, review?.ticketId]);
  if (!isTrainee || !isOwner || task?.status !== 'completed') return null;
  if (review?.status === 'approved') return <section className="queue-trainee-review is-approved"><strong>{t('traineeReviewApproved')}</strong>{review.canvaLink ? <a href={review.canvaLink} target="_blank" rel="noreferrer">{t('openCanva')}</a> : null}</section>;
  const pending = review?.status === 'pending';
  return <section className={`queue-trainee-review${pending ? ' is-pending' : review?.status === 'rejected' ? ' is-rejected' : ''}`}><strong>{pending ? t('traineeReviewPending') : review?.status === 'rejected' ? t('traineeReviewRejected') : t('sendForReview')}</strong><small>{t('traineeReviewHelp')}</small>{!pending ? <><label>{t('canvaLink')}<input value={canvaLink} onChange={(event) => setCanvaLink(event.target.value)} placeholder="https://www.canva.com/design/..." /></label><button type="button" className="scheduler-primary" disabled={busy || !canvaLink.trim()} onClick={() => onSend(canvaLink)}><Send size={13} />{t('sendForReview')}</button></> : review?.canvaLink ? <a href={review.canvaLink} target="_blank" rel="noreferrer">{t('openCanva')}</a> : null}</section>;
}

function Detail({ task, tags, availableAccounts = [], canCoordinate, canDuplicate = false, isOwner, isTrainee, pendingTickets = [], onReviewTicket, notice, history, historyLoading, onClose, onAction, onCancel, onEdit, onNotify, onUpload, onDownload, onRequestPP, onRequestCancellation, onRequestMove, onRequestTraineeReview, onDuplicate, timeZone = QUEUE_TIME_ZONE }) {
  const { t } = useQueuePreferences();
  const [publishedLinks, setPublishedLinks] = useState({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [requestMode, setRequestMode] = useState('');
  const [requestedPP, setRequestedPP] = useState(task?.productionPoints || 1);
  const [moveDate, setMoveDate] = useState(scheduleDateForViewer(task?.scheduledDate, task?.scheduledStartMinutes ?? QUEUE_DAY_START, timeZone));
  const [moveStart, setMoveStart] = useState(scheduleTimeForViewer(task?.scheduledDate, task?.scheduledStartMinutes ?? QUEUE_DAY_START, timeZone));
  const [requestReason, setRequestReason] = useState('');
  const [form, setForm] = useState({});
  useEffect(() => {
    const destinations = task?.recommendedAccounts?.length ? task.recommendedAccounts : task?.post?.account ? [task.post.account] : ['instagram'];
    const saved = Object.fromEntries((task?.finalPermalinks || []).map((item) => [item.account, item.url]));
    if (task?.finalPermalink && !saved[destinations[0]]) saved[destinations[0]] = task.finalPermalink;
    setPublishedLinks(saved); setReason(''); setEditing(false); setRequestMode(''); setRequestedPP(task?.productionPoints || 1); setMoveDate(scheduleDateForViewer(task?.scheduledDate, task?.scheduledStartMinutes ?? QUEUE_DAY_START, timeZone)); setMoveStart(scheduleTimeForViewer(task?.scheduledDate, task?.scheduledStartMinutes ?? QUEUE_DAY_START, timeZone)); setRequestReason(''); setForm({ productionPoints: task?.productionPoints || 1, priority: isUrgent(task?.priority) ? 'urgent' : 'normal', tags: task?.tags || [], brief: task?.brief || '', notes: task?.notes || '', references: task?.references?.join('\n') || '', recommendedAccounts: task?.recommendedAccounts || [] });
  }, [task?.id, timeZone]);
  useEffect(() => { if (!task) return undefined; const close = (event) => { if (event.key === 'Escape') onClose(); }; document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, [task, onClose]);
  if (!task) return null;
  const run = async (callback) => { setBusy(true); try { await callback(); } finally { setBusy(false); } };
  const save = () => run(async () => { const saved = await onEdit({ ...form, productionPoints: Number(form.productionPoints), references: form.references.split('\n').map((item) => item.trim()).filter(Boolean) }); if (saved) setEditing(false); });
  const sendDesignerRequest = () => run(async () => { const move = queueScheduleFromViewer(moveDate, minutesFromTime(moveStart), timeZone); const sent = requestMode === 'pp' ? await onRequestPP(Number(requestedPP), requestReason) : requestMode === 'move' ? await onRequestMove(move.date, move.minutes, requestReason) : await onRequestCancellation(requestReason); if (sent) { setRequestMode(''); setRequestReason(''); } });
  const canRequestChange = !canCoordinate && isOwner && !task.isDraft && ['scheduled', 'in_progress', 'completed'].includes(task.status);
  const designerRequestActions = canRequestChange ? <div className="queue-designer-ticket-actions">{!requestMode ? <><button type="button" disabled={busy || !['scheduled', 'in_progress'].includes(task.status)} onClick={() => { setRequestedPP(task.productionPoints); setRequestMode('pp'); }}><TimerReset size={13} /><span>{t('requestPPChange')}</span></button><button type="button" disabled={busy || task.status !== 'scheduled'} onClick={() => { setMoveDate(scheduleDateForViewer(task.scheduledDate, task.scheduledStartMinutes ?? QUEUE_DAY_START, timeZone)); setMoveStart(scheduleTimeForViewer(task.scheduledDate, task.scheduledStartMinutes ?? QUEUE_DAY_START, timeZone)); setRequestMode('move'); }}><Clock3 size={13} /><span>{t('requestMove')}</span></button><button type="button" disabled={busy} onClick={() => setRequestMode('cancel')}><Ban size={13} /><span>{t('requestCancellation')}</span></button></> : <div className="queue-designer-ticket-form">{requestMode === 'pp' ? <label>{t('requestedPP')}<input type="number" min="1" value={requestedPP} onChange={(event) => setRequestedPP(event.target.value)} /></label> : requestMode === 'move' ? <><strong>{t('moveRequest')}</strong><small>{t('moveHelp')}</small><label>{t('moveTo')}<input type="date" value={moveDate} onChange={(event) => setMoveDate(event.target.value)} /><input type="time" step="600" value={moveStart} onChange={(event) => setMoveStart(event.target.value)} /></label></> : <strong>{t('requestCancellation')}</strong>}<label>{t('requestReason')}<textarea value={requestReason} onChange={(event) => setRequestReason(event.target.value)} /></label><div><button type="button" className="is-send" disabled={busy || (requestMode === 'pp' && (!requestedPP || Number(requestedPP) === Number(task.productionPoints))) || (requestMode === 'move' && (!moveDate || !moveStart || (moveDate === scheduleDateForViewer(task.scheduledDate, task.scheduledStartMinutes ?? QUEUE_DAY_START, timeZone) && minutesFromTime(moveStart) === queueScheduleClock(task.scheduledDate, task.scheduledStartMinutes ?? QUEUE_DAY_START, timeZone).minutes)))} onClick={sendDesignerRequest}>{busy ? <LoaderCircle className="queue-spin" size={13} /> : <Send size={13} />}<span>{t('sendRequest')}</span></button><button type="button" disabled={busy} onClick={() => { setRequestMode(''); setRequestReason(''); }}><span>{t('cancel')}</span></button></div></div>}</div> : null;
  const coordinatorTicketActions = canCoordinate && pendingTickets.length ? <div className="queue-coordinator-ticket-actions"><strong>{t('ticketInbox')}</strong>{pendingTickets.map((ticket) => <article key={ticket.id}><span>{ticket.type === 'pp_revision' ? t('ppRevision') : ticket.type === 'move' ? t('moveRequest') : ticket.type === 'trainee_review' ? t('traineeReview') : t('cancellationRequest')}</span><small>{ticket.type === 'pp_revision' ? `${task.productionPoints} PP → ${ticket.requestedProductionPoints} PP` : ticket.type === 'move' ? `${ticket.scheduledDate || '—'} · ${time(ticket.scheduledStartMinutes ?? 0)}` : ticket.type === 'trainee_review' ? t('openCanva') : t('requestCancellation')}{ticket.reason ? ` · ${ticket.reason}` : ''}</small><div><button type="button" className="is-approve" disabled={busy} onClick={() => run(() => onReviewTicket(ticket.id, 'approve'))}><Check size={12} />{t('approve')}</button><button type="button" className="is-reject" disabled={busy} onClick={() => run(() => onReviewTicket(ticket.id, 'reject'))}><X size={12} />{t('reject')}</button></div></article>)}</div> : null;
  const traineeReviewAction = <TraineeReviewAction task={task} isTrainee={isTrainee} isOwner={isOwner} busy={busy} onSend={(canvaLink) => run(() => onRequestTraineeReview(canvaLink))} />;
  const traineeNeedsApproval = isTrainee && isOwner && task.status === 'completed' && task.traineeReview?.status !== 'approved';
  const metric = (label, value) => <React.Fragment key={label}><div className="metric"><span>{label}</span><strong>{value || '—'}</strong></div>{label === t('recommendedAccounts') ? <>{designerRequestActions}{coordinatorTicketActions}{traineeReviewAction}</> : null}</React.Fragment>;
  const toggleTag = (tag) => setForm((current) => ({ ...current, tags: current.tags.includes(tag) ? current.tags.filter((item) => item !== tag) : [...current.tags, tag] }));
  const destinations = task.recommendedAccounts?.length ? task.recommendedAccounts : task.post.account ? [task.post.account] : ['instagram'];
  const publishedLinksReady = destinations.every((account) => String(publishedLinks[account] || '').trim());
  const toggleAccount = (account) => setForm((current) => ({ ...current, recommendedAccounts: current.recommendedAccounts.includes(account) ? current.recommendedAccounts.filter((item) => item !== account) : [...current.recommendedAccounts, account] }));
  if (task.status === 'completed' && isOwner && !traineeNeedsApproval) return <><button className="sidebar-backdrop" type="button" onClick={onClose} aria-label={t('close')} /><aside className="right-rail is-open queue-request-rail" role="dialog" aria-modal="true" aria-label={t('closeRequest')}><button className="rail-close-button" type="button" onClick={onClose} aria-label={t('close')}><X size={16} /></button><section className="panel caption-panel queue-rail-caption"><header className="panel-header caption-header"><div><p className="section-label">{t('closeRequest')}</p><h2>{task.post.title || `@${task.post.account}`}</h2><small>{t('publishedLinksHelp')}</small></div></header><div className="scheduler-close-form queue-multi-link-form">{destinations.map((account) => <label key={account}>{t('publishedLinkFor')} @{account}<input value={publishedLinks[account] || ''} onChange={(event) => setPublishedLinks((current) => ({ ...current, [account]: event.target.value }))} placeholder="https://instagram.com/p/..." /></label>)}<button className="scheduler-primary" disabled={busy || !publishedLinksReady} onClick={() => run(() => onAction('close', destinations.map((account) => ({ account, url: publishedLinks[account].trim() }))))}>{t('closeRequest')}</button><button className="scheduler-secondary" disabled={busy} onClick={() => run(() => onAction('start'))}>{t('returnInProgress')}</button></div></section></aside></>;
  if (editing) return <><button className="sidebar-backdrop" type="button" onClick={onClose} aria-label={t('close')} /><aside className="right-rail is-open queue-request-rail" role="dialog" aria-modal="true" aria-label={t('editRequest')}><button className="rail-close-button" type="button" onClick={onClose} aria-label={t('close')}><X size={16} /></button><section className="panel caption-panel queue-rail-caption"><header className="panel-header caption-header"><div><p className="section-label">{t('editRequest')}</p><h2>{task.post.title || `@${task.post.account}`}</h2></div></header><div className="queue-detail-editor"><label>{t('productionPoints')}<input type="number" min="1" value={form.productionPoints || ''} onChange={(event) => setForm((current) => ({ ...current, productionPoints: event.target.value }))} /></label><label className="queue-urgent-toggle"><input type="checkbox" checked={isUrgent(form.priority)} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.checked ? 'urgent' : 'normal' }))} /><span>{t('markUrgent')}</span></label><fieldset><legend>{t('recommendedAccounts')}</legend><small>{t('targetAccountsHelp')}</small><div className="queue-account-picker">{availableAccounts.length ? availableAccounts.map((account) => <label key={account}><input type="checkbox" checked={form.recommendedAccounts.includes(account)} onChange={() => toggleAccount(account)} /><span>@{account}</span></label>) : <small>{t('noRecommendedAccount')}</small>}</div></fieldset><fieldset><legend>{t('tags')}</legend><div className="queue-tag-picker">{tags.map((tag) => <button type="button" key={tag} className={form.tags.includes(tag) ? 'is-on' : ''} onClick={() => toggleTag(tag)}>{tag}</button>)}</div></fieldset><label>{t('brief')}<textarea value={form.brief || ''} onChange={(event) => setForm((current) => ({ ...current, brief: event.target.value }))} /></label><label>{t('notes')}<textarea value={form.notes || ''} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label><label>{t('referenceLinks')}<textarea value={form.references || ''} onChange={(event) => setForm((current) => ({ ...current, references: event.target.value }))} placeholder={t('oneLinkPerLine')} /></label></div><footer className="queue-detail-actions"><button className="scheduler-primary" disabled={busy || !form.productionPoints} onClick={save}>{t('saveChanges')}</button><button className="scheduler-secondary" disabled={busy} onClick={() => setEditing(false)}>{t('cancel')}</button></footer></section></aside></>;
  return <><button className="sidebar-backdrop" type="button" onClick={onClose} aria-label={t('close')} /><aside className="right-rail is-open queue-request-rail" role="dialog" aria-modal="true" aria-label="Queue request details" data-context-type="post" data-context-title={task.post.title || `@${task.post.account}`} data-context-request-id={task.id} data-context-duplicate={canDuplicate ? 'true' : 'false'} data-context-account={task.post.account || ''} data-context-shortcode={task.post.shortcode || ''} data-context-permalink={task.post.permalink || ''}><button className="rail-close-button" type="button" onClick={onClose} aria-label={t('close')}><X size={16} /></button><section className="panel detail"><SelectedPost post={queuePost(task)} /><span className={`queue-detail-status${task.isDraft ? ' is-draft' : ''}`}>{statusCopy(task.status, t, task.isDraft)}</span></section><section className="panel caption-panel queue-rail-caption"><header className="panel-header caption-header"><div><p className="section-label">{editing ? t('editRequest') : task.isCustom ? t('createPost') : t('sourceCaption')}</p><h2>{task.post.title || `@${task.post.account}`}</h2>{task.post.title ? <small className="queue-custom-account">@{task.post.account}</small> : null}</div><div className="queue-detail-header-actions">{canCoordinate && !editing && task.status !== 'cancelled' ? <button type="button" className="ghost-button" onClick={() => setEditing(true)} title={t('editRequest')}><Pencil size={15} />{t('editRequest')}</button> : null}{canDuplicate && !editing && !task.isDraft ? <button type="button" className="ghost-button" onClick={() => onDuplicate?.(task)} title={t('duplicateRequest')}><Plus size={15} />{t('duplicateRequest')}</button> : null}</div></header>{task.isDraft ? <p className="queue-detail-notice is-draft">{t('tentativeBy')} {displayName(task.draftCoordinatorEmail)}. {t('sharedDrafts')}</p> : null}{notice ? <p className={`queue-detail-notice is-${notice.type || 'success'}`}>{notice.message}</p> : null}{editing ? <div className="queue-detail-editor"><label>{t('productionPoints')}<input type="number" min="1" value={form.productionPoints || ''} onChange={(event) => setForm((current) => ({ ...current, productionPoints: event.target.value }))} /></label><label className="queue-urgent-toggle"><input type="checkbox" checked={isUrgent(form.priority)} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.checked ? 'urgent' : 'normal' }))} /><span>{t('markUrgent')}</span></label><fieldset><legend>{t('tags')}</legend><div className="queue-tag-picker">{tags.map((tag) => <button type="button" key={tag} className={form.tags.includes(tag) ? 'is-on' : ''} onClick={() => toggleTag(tag)}>{tag}</button>)}</div></fieldset><label>{t('brief')}<textarea value={form.brief || ''} onChange={(event) => setForm((current) => ({ ...current, brief: event.target.value }))} /></label><label>{t('notes')}<textarea value={form.notes || ''} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label><label>{t('referenceLinks')}<textarea value={form.references || ''} onChange={(event) => setForm((current) => ({ ...current, references: event.target.value }))} placeholder={t('oneLinkPerLine')} /></label></div> : <div className="queue-detail-scroll"><div className="queue-detail-copy"><p>{task.title || task.brief || task.post.caption || '—'}</p>{task.notes ? <section><h3>{t('notes')}</h3><p>{task.notes}</p></section> : null}{task.references?.length ? <section><h3>{t('references')}</h3>{task.references.map((item) => <a key={item} href={item} target="_blank" rel="noreferrer">{item}</a>)}</section> : null}{task.cancellationReason ? <section><h3>{t('cancelledReason')}</h3><p>{task.cancellationReason}</p></section> : null}</div>{!task.isCustom ? <SlideDownload post={queuePost(task)} /> : null}<AttachmentList task={task} busy={busy} onUpload={(files) => run(() => onUpload(files))} onDownload={(file) => run(() => onDownload(file))} /><HistoryList events={history} loading={historyLoading} /></div>}<footer className="queue-detail-actions">{editing ? <><button className="scheduler-primary" disabled={busy || !form.productionPoints} onClick={save}>{t('saveChanges')}</button><button className="scheduler-secondary" disabled={busy} onClick={() => setEditing(false)}>{t('cancel')}</button></> : <>{task.status === 'scheduled' && isOwner && !task.isDraft ? <button className="scheduler-primary" disabled={busy} onClick={() => run(() => onAction('start'))}>{t('startWork')}</button> : null}{task.status === 'in_progress' && isOwner ? <button className="scheduler-primary" disabled={busy} onClick={() => run(() => onAction('complete'))}>{t('markComplete')}</button> : null}{task.status === 'completed' && isOwner && !traineeNeedsApproval ? <div className="scheduler-close-form"><label>{t('publishedLink')}<input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://instagram.com/p/..." /></label><button className="scheduler-primary" disabled={busy || !link.trim()} onClick={() => run(() => onAction('close', link))}>{t('closeRequest')}</button><button className="scheduler-secondary" disabled={busy} onClick={() => run(() => onAction('start'))}>{t('returnInProgress')}</button></div> : null}{task.status === 'closed' && task.finalPermalink ? <a className="scheduler-primary" href={task.finalPermalink} target="_blank" rel="noreferrer">{t('openPublished')}</a> : null}{canCoordinate && task.designerEmail && task.status !== 'cancelled' && !task.isDraft ? <button className="scheduler-secondary" disabled={busy} onClick={() => run(onNotify)}><BellRing size={14} />{t('resendSlack')}</button> : null}{canCoordinate && !['closed', 'cancelled'].includes(task.status) ? <div className="scheduler-cancel"><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('cancellationReason')} /><button className="scheduler-danger" disabled={busy} onClick={() => run(() => onCancel(reason))}>{t('cancelRequest')}</button></div> : null}</>}</footer></section><section className="panel stats-panel">{metric(t('assignment'), task.designerEmail ? displayName(task.designerEmail) : statusCopy(task.status, t, task.isDraft))}{isUrgent(task.priority) ? metric(t('priority'), t('priorityUrgent')) : null}{metric(t('scope'), `${task.productionPoints} PP · ${task.durationMinutes} ${t('minutes')}`)}{metric(t('recommendedAccounts'), task.recommendedAccounts?.map((account) => `@${account}`).join(' · '))}</section></aside></>;
}

function schedulerUserRole(user, t) {
  const roles = user?.roles || user?.operatingRoles || [];
  if (user?.isAdmin || roles.includes('admin')) return t('admin');
  if (roles.includes('vc')) return t('viralCoordinator');
  if (roles.includes('trainee')) return t('traineeRole');
  if (roles.includes('sales')) return t('salesRole');
  return '';
}

function Scheduler({ data, draft, setDraft, onDraftChange, selectedDate, designerScope, timeZone = '', onOpen, onError, onCreateTimeBlock, onEditTimeBlock, onDeleteTimeBlock, onReturnToPool, onCancelTask, onDuplicateTask, onSavePreferences, addTimeNonce = 0 }) {
  const { t, language } = useQueuePreferences();
  const coordinator = data.viewer.isAdmin || data.viewer.operatingRoles?.includes('vc');
  const selfPlanner = coordinator || Boolean(data.viewer.canSelfAssign);
  const [now, setNow] = useState(() => new Date());
  const [dropPreview, setDropPreview] = useState(null);
  const [resizeState, setResizeState] = useState(null);
  const [timeBlockForm, setTimeBlockForm] = useState(null);
  const [timeBlockBusy, setTimeBlockBusy] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const scrollRef = useRef(null);
  const resizeRef = useRef(null);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 15000); return () => window.clearInterval(timer); }, []);
  const queueToday = selectedDate === DAY(now, QUEUE_TIME_ZONE);
  const queueNowMinutes = currentMinutes(now, QUEUE_TIME_ZONE);
  const allTasks = useMemo(() => {
    const byId = new Map();
    [...(data.planningRequests || []), ...data.requests, ...(data.liveDrafts || []), ...draft].forEach((task) => byId.set(task.id, task));
    return [...byId.values()];
  }, [data.planningRequests, data.requests, data.liveDrafts, draft]);
  const planningTasks = useMemo(() => [
    ...allTasks,
    ...(data.timeBlocks || []).map((block) => ({
      id: `time-${block.id}`,
      status: 'in_progress',
      designerEmail: block.requesterEmail,
      scheduledDate: block.scheduledDate,
      scheduledStartMinutes: block.scheduledStartMinutes,
      durationMinutes: block.durationMinutes,
    })),
  ], [allTasks, data.timeBlocks]);
  const schedulerUsers = data.schedulerUsers || data.designers;
  const preferences = data.schedulerPreferences || {};
  const hiddenUsers = new Set(preferences.hiddenUsers || []);
  const orderedUsers = useMemo(() => {
    const positions = new Map((preferences.rowOrder || []).map((email, index) => [email, index]));
    return [...schedulerUsers].sort((a, b) => (positions.get(a.email) ?? 9999) - (positions.get(b.email) ?? 9999) || displayName(a.email, a.displayName).localeCompare(displayName(b.email, b.displayName)));
  }, [schedulerUsers, preferences.hiddenUsers, preferences.rowOrder]);
  // A scoped row is still a row in the VC's layout. Hiding it must win over
  // the selector as well; previously the selected-user scope bypassed this
  // filter and made Hide appear to do nothing.
  const visibleDesigners = (designerScope ? orderedUsers.filter((designer) => designer.email === designerScope) : orderedUsers)
    .filter((designer) => !hiddenUsers.has(designer.email));
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      const track = scroller?.querySelector('.scheduler-track');
      if (!scroller || !track) return;
      const preferred = queueToday ? queueNowMinutes - 180 : 8 * 60;
      const firstMinute = Math.min(16 * 60, Math.max(0, preferred));
      scroller.scrollLeft = (firstMinute / QUEUE_DAY_END) * track.offsetWidth;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedDate, schedulerUsers.length, queueToday, queueNowMinutes]);
  const centerNow = () => {
    const scroller = scrollRef.current;
    const track = scroller?.querySelector('.scheduler-track');
    if (!scroller || !track) return;
    const minute = queueToday ? queueNowMinutes : 12 * 60;
    const trackStart = track.offsetLeft;
    const target = trackStart + (minute / QUEUE_DAY_END) * track.offsetWidth - scroller.clientWidth / 2;
    const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const left = Math.max(0, Math.min(maxScroll, target));
    if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ left, behavior: 'smooth' });
    else scroller.scrollLeft = left;
  };
  const openTimeBlockForm = (event, designer, block = null) => {
    if ((!coordinator && designer.email !== data.viewer.email) || event.target.closest('.scheduler-block,.scheduler-time-block')) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const startMinutes = Math.min(1430, Math.max(0, Math.round((((event.clientX - rect.left) / rect.width) * QUEUE_DAY_END) / 10) * 10));
    const panelWidth = 326;
    const panelHeight = 390;
    setTimeBlockForm({ ticketId: block?.id, designerEmail: block?.requesterEmail || designer.email, category: block?.category || 'meeting', title: block?.title || '', note: block?.note || '', scheduledDate: block?.scheduledDate || selectedDate, startMinutes: block?.scheduledStartMinutes ?? startMinutes, durationMinutes: block?.durationMinutes || 30, x: Math.max(12, Math.min(window.innerWidth - panelWidth - 12, event.clientX)), y: Math.max(12, Math.min(window.innerHeight - panelHeight - 12, event.clientY)) });
  };
  const submitTimeBlock = async () => {
    if (!timeBlockForm) return;
    setTimeBlockBusy(true);
    try {
      const saved = await (timeBlockForm.ticketId ? onEditTimeBlock?.(timeBlockForm) : onCreateTimeBlock(timeBlockForm));
      if (saved) setTimeBlockForm(null);
    } finally {
      setTimeBlockBusy(false);
    }
  };
  useEffect(() => { setTimeBlockForm(null); }, [selectedDate]);
  useEffect(() => {
    if (!addTimeNonce || !coordinator) return;
    const designer = schedulerUsers.find((user) => user.email === data.viewer.email) || schedulerUsers[0];
    if (!designer) return;
    const initialStart = queueToday ? Math.min(1430, Math.ceil(queueNowMinutes / 10) * 10) : 9 * 60;
    setTimeBlockForm({ designerEmail: designer.email, category: 'meeting', title: '', note: '', scheduledDate: selectedDate, startMinutes: initialStart, durationMinutes: 30, x: Math.max(12, window.innerWidth - 350), y: 112 });
  }, [addTimeNonce]);
  const planForEvent = (event, designer) => {
    const id = Number(activeQueueDragId || event.dataTransfer.getData('queue-task'));
    const source = allTasks.find((task) => task.id === id);
    if (!source || source.status === 'in_progress') return { ok: false, error: 'This request cannot be moved.' };
    if (!coordinator && (source.coordinatorEmail !== data.viewer.email || designer !== data.viewer.email)) return { ok: false, error: 'You can only schedule work from your own Pool.' };
    const targetUser = schedulerUsers.find((user) => user.email === designer);
    if (!targetUser?.isQueueDesigner) return { ok: false, error: 'Only Post Designers can receive Queue work.' };
    const rect = event.currentTarget.getBoundingClientRect();
    const pointer = Math.min(1430, Math.max(0, Math.round((((event.clientX - rect.left) / rect.width) * QUEUE_DAY_END) / 10) * 10));
    const targetNow = Math.min(1430, Math.ceil(queueNowMinutes / 10) * 10);
    if (selectedDate < DAY(now, QUEUE_TIME_ZONE) || (selectedDate === DAY(now, QUEUE_TIME_ZONE) && pointer < targetNow)) return { ok: false, error: 'Queue work cannot be scheduled before the current Queue time.' };
    const result = planQueueDrop({
      tasks: planningTasks,
      target: source,
      designerEmail: designer,
      scheduledDate: selectedDate,
      desiredStart: pointer,
      minutesPerPP: Number(targetUser.minutesPerPP || 10),
    });
    if (!result.ok) return result;
    const allowedAccounts = new Set((targetUser.accounts || []).map((account) => String(account).toLowerCase()));
    const target = { ...result.target, recommendedAccounts: (result.target.recommendedAccounts || []).filter((account) => allowedAccounts.has(String(account).replace(/^@/, '').toLowerCase())) };
    return { ...result, target, tasks: result.tasks.map((task) => task.id === target.id ? target : task) };
  };
  const isUserRowDrag = (event) => Array.from(event.dataTransfer?.types || []).includes('scheduler-user');
  const previewDrop = (event, designer) => {
    if (isUserRowDrag(event)) return;
    event.preventDefault(); if (!selfPlanner) return; event.dataTransfer.dropEffect = 'move'; const result = planForEvent(event, designer); setDropPreview(result.ok ? { designer, ...result } : null);
  };
  const drop = (event, designer) => {
    if (isUserRowDrag(event)) return;
    event.preventDefault(); if (!selfPlanner) return;
    const result = planForEvent(event, designer); setDropPreview(null);
    activeQueueDragId = null;
    if (!result.ok) { onError(result.error || 'This request cannot be moved.'); return; }
    const currentById = new Map(draft.map((task) => [task.id, task]));
    result.tasks.forEach((task) => {
      const previous = allTasks.find((item) => item.id === task.id);
      if (!previous || previous.designerEmail !== task.designerEmail || previous.scheduledDate !== task.scheduledDate || previous.scheduledStartMinutes !== task.scheduledStartMinutes || task.id === result.target.id) currentById.set(task.id, { ...task, isDraft: true, draftCoordinatorEmail: data.viewer.email });
    });
    const nextDraft = [...currentById.values()];
    setDraft(nextDraft);
    onDraftChange(nextDraft);
  };
  const startResize = (event, task, edge) => {
    if (!coordinator || task.status !== 'scheduled') return;
    const track = event.currentTarget.closest('.scheduler-track');
    if (!track) return;
    event.preventDefault();
    event.stopPropagation();
    const baseStart = Number(task.scheduledStartMinutes ?? 0);
    const minutesPerPP = minutesPerPPOf(task);
    const baseDuration = Math.max(minutesPerPP, Number(task.durationMinutes || Number(task.productionPoints || 1) * minutesPerPP));
    const nextState = { task, edge, track, minutesPerPP, baseStart, baseEnd: baseStart + baseDuration, baseDuration, preview: { ...task, isDraft: true, draftCoordinatorEmail: data.viewer.email } };
    resizeRef.current = nextState;
    setResizeState(nextState);
  };
  useEffect(() => {
    if (!resizeState) return undefined;
    const onMove = (event) => {
      const current = resizeRef.current;
      if (!current?.track) return;
      const rect = current.track.getBoundingClientRect();
      if (!rect.width) return;
      const rawMinute = ((event.clientX - rect.left) / rect.width) * QUEUE_DAY_END;
      const pointer = Math.max(0, Math.min(QUEUE_DAY_END, Math.round(rawMinute / 10) * 10));
      const others = planningTasks.filter((item) => item.id !== current.task.id && item.designerEmail === current.task.designerEmail && item.scheduledDate === current.task.scheduledDate && !['pool', 'cancelled'].includes(item.status)).map((item) => { const unit = minutesPerPPOf(item); return { start: Number(item.scheduledStartMinutes ?? 0), end: Number(item.scheduledStartMinutes ?? 0) + Math.max(unit, Number(item.durationMinutes || Number(item.productionPoints || 1) * unit)) }; });
      const previousEnd = Math.max(0, ...others.filter((item) => item.end <= current.baseStart).map((item) => item.end));
      const nextStart = Math.min(QUEUE_DAY_END, ...others.filter((item) => item.start >= current.baseEnd).map((item) => item.start));
      const unit = current.minutesPerPP;
      let start = current.baseStart;
      let productionPoints = Math.max(1, Number(current.task.productionPoints || Math.round(current.baseDuration / unit)));
      if (current.edge === 'right') {
        const maxPoints = Math.max(1, Math.floor(((Number.isFinite(nextStart) ? nextStart : QUEUE_DAY_END) - start) / unit));
        productionPoints = Math.max(1, Math.min(maxPoints, Math.round((pointer - start) / unit)));
      } else {
        const minimumStart = Math.ceil(previousEnd / 10) * 10;
        start = Math.max(minimumStart, Math.min(pointer, current.baseEnd - 10));
        start = Math.round(start / 10) * 10;
        const maxPoints = Math.max(1, Math.floor(((Number.isFinite(nextStart) ? nextStart : QUEUE_DAY_END) - start) / unit));
        productionPoints = Math.max(1, Math.min(maxPoints, Math.round((current.baseEnd - start) / unit)));
      }
      const duration = productionPoints * unit;
      const preview = { ...current.task, scheduledStartMinutes: start, minutesPerPP: unit, durationMinutes: duration, productionPoints, status: 'scheduled', isDraft: true, draftCoordinatorEmail: data.viewer.email };
      const next = { ...current, preview };
      resizeRef.current = next;
      setResizeState(next);
    };
    const onUp = () => {
      const current = resizeRef.current;
      resizeRef.current = null;
      setResizeState(null);
      if (!current?.preview) return;
      const currentById = new Map(draft.map((task) => [task.id, task]));
      currentById.set(current.preview.id, current.preview);
      const nextDraft = [...currentById.values()];
      setDraft(nextDraft);
      onDraftChange(nextDraft);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [resizeState, planningTasks, data.viewer.email, draft, onDraftChange, setDraft]);
  const merged = (designer) => allTasks.filter((task) => {
    if (task.designerEmail !== designer || task.scheduledDate !== selectedDate || ['pool', 'cancelled'].includes(task.status)) return false;
    return true;
  });
  const previewNextDay = dropPreview && dropPreview.target.scheduledDate !== selectedDate;
  const previewWidth = dropPreview ? Math.max(0.8, (dropPreview.target.durationMinutes / QUEUE_DAY_END) * 100) : 0;
  const previewLeft = dropPreview ? (previewNextDay ? Math.max(0, 100 - previewWidth) : (dropPreview.target.scheduledStartMinutes / QUEUE_DAY_END) * 100) : 0;
  return <div className="scheduler-shell">
    <section className="scheduler" ref={scrollRef}>
      <div className="scheduler-canvas">
        <div className="scheduler-time-head"><span>{t('designer')}</span><div>{Array.from({ length: 24 }, (_, hour) => <b key={hour} style={{ left: `${hour * (100 / 24)}%` }}>{scheduleTimeForViewer(selectedDate, hour * 60, timeZone)}</b>)}</div></div>
        {queueToday ? <div className="scheduler-day-overlay"><span className="scheduler-now-global" style={{ left: `${(queueNowMinutes / QUEUE_DAY_END) * 100}%` }} title={time(currentMinutes(now, timeZone))}><b>{t('now')}</b></span></div> : null}
        {visibleDesigners.map((designer) => {
          const queueEligible = designer.isQueueDesigner !== false;
          const initials = displayName(designer.email, designer.displayName).split(/\s+/).map((word) => word.slice(0, 1)).join('').slice(0, 2).toUpperCase();
          const role = schedulerUserRole(designer, t);
          const accounts = designer.accounts?.map((account) => `@${account}`).join(' · ') || t('noAccounts');
          const accountAvatars = designer.accountAvatars || {};
          const tasks = merged(designer.email);
          const timeBlocks = (data.timeBlocks || []).filter((block) => block.requesterEmail === designer.email && block.scheduledDate === selectedDate);
          return <div className={`scheduler-row${queueEligible ? '' : ' is-non-queue-user'}`} key={designer.email} onDragOver={(event) => { if (coordinator && isUserRowDrag(event)) event.preventDefault(); }} onDrop={(event) => { const dragged = event.dataTransfer?.getData('scheduler-user'); if (!coordinator || !dragged || dragged === designer.email) return; event.preventDefault(); const rowOrder = orderedUsers.map((person) => person.email).filter((email) => email !== dragged); rowOrder.splice(Math.max(0, rowOrder.indexOf(designer.email)), 0, dragged); onSavePreferences?.({ hiddenUsers: [...hiddenUsers], rowOrder }); }}>
            <header draggable={coordinator} onDragStart={(event) => { event.dataTransfer?.setData('scheduler-user', designer.email); event.dataTransfer.effectAllowed = 'move'; }} onContextMenu={(event) => { if (!coordinator) return; event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY, type: 'user', designer }); }}><div className="scheduler-user-identity"><span className="scheduler-user-avatar"><span aria-hidden="true">{initials}</span>{userAvatar(designer.avatarUrl) ? <img src={userAvatar(designer.avatarUrl)} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} /> : null}</span><span className="scheduler-user-copy"><b>{displayName(designer.email, designer.displayName)}</b><small>{role}</small><span className="scheduler-user-accounts" title={accounts}>{designer.accounts?.map((account) => <i key={account}>{accountAvatars[account] ? <img src={accountAvatars[account].startsWith('/api/') ? `${API_BASE}${accountAvatars[account]}` : accountAvatars[account]} alt={`@${account}`} /> : account.slice(0, 1).toUpperCase()}</i>)}</span></span></div></header>
            <div className="scheduler-track" onContextMenu={(event) => openTimeBlockForm(event, designer)} onDragOver={(event) => previewDrop(event, designer.email)} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropPreview(null); }} onDrop={(event) => drop(event, designer.email)}>
              {Array.from({ length: 25 }, (_, hour) => <i key={hour} style={{ left: `${hour * (100 / 24)}%` }} />)}
              {timeBlocks.map((block) => <TimeBlock key={block.id} block={block} timeZone={timeZone} onContextMenu={(event, item) => { if (!coordinator && item.requesterEmail !== data.viewer.email) return; event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY, type: 'time', designer, block: item }); }} />)}
              {dropPreview?.designer === designer.email ? <span className={`scheduler-drop-preview${previewNextDay ? ' is-next-day' : ''}`} style={{ left: `${previewLeft}%`, width: `${previewWidth}%` }}><b>@{dropPreview.target.post.account}</b><small>{previewNextDay ? `${displayDate(scheduleDateForViewer(dropPreview.target.scheduledDate, dropPreview.target.scheduledStartMinutes, timeZone), language)} · ` : ''}{scheduleTimeForViewer(dropPreview.target.scheduledDate, dropPreview.target.scheduledStartMinutes, timeZone)} · {dropPreview.target.durationMinutes} min</small></span> : null}
              {tasks.map((task) => { const renderTask = resizeState?.preview?.id === task.id ? resizeState.preview : task; return <TaskBlock key={task.id} task={renderTask} timeZone={timeZone} editable={selfPlanner && (coordinator || renderTask.coordinatorEmail === data.viewer.email) && (!renderTask.isDraft || renderTask.draftCoordinatorEmail === data.viewer.email)} accountAvatars={accountAvatars} onResizeStart={startResize} onContextMenu={(event, item) => { if (!coordinator) return; event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY, type: 'task', task: item }); }} onOpen={onOpen} />; })}
            </div>
          </div>;
        })}
      </div>
    </section>
    <button type="button" className="scheduler-center-now" onClick={centerNow} title={t('centerNow')} aria-label={t('centerNow')}><LocateFixed size={15} /><span>{t('centerNow')}</span></button>
    {contextMenu ? <><button type="button" className="scheduler-context-backdrop" onClick={() => setContextMenu(null)} aria-label={t('close')} /><div className="scheduler-context-menu" style={{ left: Math.min(window.innerWidth - 210, contextMenu.x), top: Math.min(window.innerHeight - 180, contextMenu.y) }}>{contextMenu.type === 'user' ? <button type="button" onClick={() => { onSavePreferences?.({ hiddenUsers: [...hiddenUsers, contextMenu.designer.email], rowOrder: preferences.rowOrder || [] }); setContextMenu(null); }}>Hide {displayName(contextMenu.designer.email, contextMenu.designer.displayName)}</button> : null}{contextMenu.type === 'task' ? <><button type="button" onClick={() => { onOpen(contextMenu.task); setContextMenu(null); }}>Open post</button><button type="button" onClick={() => { onDuplicateTask?.(contextMenu.task); setContextMenu(null); }}>{t('duplicateRequest')}</button><button type="button" onClick={() => { onReturnToPool?.(contextMenu.task); setContextMenu(null); }}>Return to Pool</button><button type="button" className="is-danger" onClick={() => { onCancelTask?.(contextMenu.task); setContextMenu(null); }}>Cancel post</button></> : null}{contextMenu.type === 'time' ? <><button type="button" onClick={(event) => { setContextMenu(null); openTimeBlockForm(event, contextMenu.designer, contextMenu.block); }}>Edit personal time</button><button type="button" className="is-danger" onClick={() => { onDeleteTimeBlock?.(contextMenu.block); setContextMenu(null); }}>Delete personal time</button></> : null}</div></> : null}
    <TimeBlockForm form={timeBlockForm} setForm={setTimeBlockForm} busy={timeBlockBusy} onClose={() => setTimeBlockForm(null)} onSubmit={submitTimeBlock} users={schedulerUsers} canChooseUser={coordinator} timeZone={timeZone} />
  </div>;
}

function DraftAccounts({ draft, designers, onAccountsChange }) {
  const { t, language } = useQueuePreferences();
  const toggle = (task, account) => { const selected = task.recommendedAccounts || []; onAccountsChange(task.id, selected.includes(account) ? selected.filter((item) => item !== account) : [...selected, account]); };
  return <section className="scheduler-drafts"><header><div><b>{t('draftsSaved')}</b><small>{t('sharedDrafts')}</small></div></header>{draft.map((task) => { const designer = designers.find((item) => item.email === task.designerEmail); const selected = task.recommendedAccounts || []; return <article key={task.id}><div><b>@{task.post.account} → {displayName(designer?.email)}</b><small>{displayDate(task.scheduledDate, language)} · {time(task.scheduledStartMinutes)} · {task.productionPoints} PP</small></div><fieldset><legend>{t('recommendedAccounts')}</legend>{designer?.accounts?.length ? designer.accounts.map((account) => <label key={account}><input type="checkbox" checked={selected.includes(account)} onChange={() => toggle(task, account)} /><span>@{account}</span></label>) : <small>{t('noRecommendedAccount')}</small>}</fieldset></article>; })}</section>;
}

function PickModal({ requests, hotFallback = false, busy, onClose, onAssign }) {
  const { t } = useQueuePreferences();
  const [index, setIndex] = useState(0);
  const candidate = requests[index % Math.max(1, requests.length)];
  if (!candidate) return <div className="queue-pick-backdrop" role="presentation"><section className="queue-pick-modal" role="dialog" aria-modal="true" aria-label={t('pickTitle')}><header><div><p className="scheduler-eyebrow">{t('pick')}</p><h2>{t('pickTitle')}</h2></div><button type="button" onClick={onClose} aria-label={t('close')}><X size={16} /></button></header><div className="queue-pick-empty"><ClipboardList size={24} /><p>{t('noPickRequests')}</p></div></section></div>;
  const thumbnail = cover(candidate);
  const hotMultiplier = Number(candidate.hotMultiplier);
  return <div className="queue-pick-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="queue-pick-modal" role="dialog" aria-modal="true" aria-label={t('pickTitle')}><header><div><p className="scheduler-eyebrow">{t('pick')}</p><h2>{t('pickTitle')}</h2><small>{hotFallback ? t('hotPickHelp') : t('pickHelp')} · {index + 1}/{requests.length}</small></div><button type="button" onClick={onClose} aria-label={t('close')}><X size={16} /></button></header><article className={`queue-pick-card ${priorityClass(candidate.priority)}${hotClass(candidate)}`}>{thumbnail ? <img src={thumbnail} alt="" /> : <span className="queue-pick-empty-image">@</span>}<div className="queue-pick-content"><div className="queue-pick-account"><b>@{candidate.post.account}</b><PriorityBadge priority={candidate.priority} />{isHotTask(candidate) ? <span className="queue-hot-badge">🔥 {hotText(candidate)}</span> : null}</div><p>{candidate.brief || candidate.post.caption || t('post')}</p><div className="queue-pick-meta"><span>{candidate.productionPoints} PP</span><span>{candidate.durationMinutes} {t('minutes')}</span>{candidate.tags?.filter((tag) => tag !== 'hot').slice(0, 3).map((tag) => <i key={tag}>{tag}</i>)}</div></div></article><footer><button type="button" className="scheduler-secondary" disabled={busy || requests.length < 2} onClick={() => setIndex((current) => (current + 1) % requests.length)}><ChevronRight size={14} />{t('nextRequest')}</button><button type="button" className="scheduler-primary" disabled={busy} onClick={() => onAssign(candidate)}>{busy ? <LoaderCircle className="queue-spin" size={14} /> : <Check size={14} />}{t('assignRequest')}</button></footer></section></div>;
}

function QueueApp({ user }) {
  const { t, language, setLanguage } = useQueuePreferences();
  const initialSnapshotRef = useRef(readQueueSnapshot(user?.email));
  const [data, setData] = useState(() => initialSnapshotRef.current?.data || null);
  const [viewer, setViewer] = useState(null);
  const [timeZonePreview, setTimeZonePreview] = useState(readDevTimeZone);
  const [date, setDate] = useState(() => initialSnapshotRef.current?.date || DAY(new Date(), QUEUE_TIME_ZONE));
  const [loading, setLoading] = useState(() => !initialSnapshotRef.current?.data);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [open, setOpen] = useState(null);
  const [detailNotice, setDetailNotice] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [draft, setDraft] = useState(() => { try { return JSON.parse(window.localStorage.getItem(DRAFT_KEY) || '[]'); } catch { return []; } });
  const [liveStatus, setLiveStatus] = useState('connecting');
  const [archive, setArchive] = useState(false);
  const [poolDropActive, setPoolDropActive] = useState(false);
  const [designerScope, setDesignerScope] = useState(() => readDesignerScope(user?.email));
  const [ticketsOpen, setTicketsOpen] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState('');
  const [pickOpen, setPickOpen] = useState(false);
  const [pickBusy, setPickBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [multiAssignRequest, setMultiAssignRequest] = useState(null);
  const [multiAssignBusy, setMultiAssignBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [accountSetupOpen, setAccountSetupOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(() => !window.localStorage.getItem('sentient.queueGuide.v1'));
  const [guideStep, setGuideStep] = useState(-1);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [addTimeNonce, setAddTimeNonce] = useState(0);
  const draftRef = useRef(draft);
  const draftSyncingRef = useRef(false);
  const draftHydratedRef = useRef(false);
  const draftSaveVersionRef = useRef(0);
  const selectDesignerScope = useCallback((event) => {
    const next = event.target.value;
    setDesignerScope(next);
    try {
      if (next) window.localStorage.setItem(designerScopeKey(user?.email), next);
      else window.localStorage.removeItem(designerScopeKey(user?.email));
    } catch {}
  }, [user?.email]);
  const draftSavePromiseRef = useRef(Promise.resolve());
  const persistDraftsRef = useRef(null);
  const openRef = useRef(open);
  const loadRef = useRef(null);
  const liveRevisionRef = useRef(0);
  const liveRefreshTimerRef = useRef(null);
  const deferredLiveRefreshRef = useRef(false);
  const quietMutationUntilRef = useRef(0);
  const schedulerPreferencesRef = useRef(null);
  const ticketsOpenRef = useRef(ticketsOpen);
  const loadedOnceRef = useRef(Boolean(initialSnapshotRef.current?.data));
  const accountSetupDismissedRef = useRef(false);
  const guideCompletedRef = useRef(Boolean(window.localStorage.getItem('sentient.queueGuide.v1')));

  const notify = useCallback((message, type = 'success') => { setToast({ message, type }); window.setTimeout(() => setToast(null), 6000); }, []);
  const saveQuietly = useCallback(() => { quietMutationUntilRef.current = Date.now() + 8000; }, []);
  const applyDraft = useCallback((next) => { draftRef.current = next; setDraft(next); if (next.length) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); else window.localStorage.removeItem(DRAFT_KEY); }, []);
  const load = useCallback(async ({ silent = false } = {}) => {
    const showLoader = !silent && !loadedOnceRef.current;
    if (showLoader) setLoading(true);
    else if (loadedOnceRef.current) setRefreshing(true);
    try {
      const next = await json(`/api/dashboard/queue/v2?date=${date}&archive=${archive ? 'true' : 'false'}`);
      setData(schedulerPreferencesRef.current ? { ...next, schedulerPreferences: schedulerPreferencesRef.current } : next);
      if (!next.accountOnboarding?.completed && guideCompletedRef.current && !accountSetupDismissedRef.current) setAccountSetupOpen(true);
      loadedOnceRef.current = true;
      liveRevisionRef.current = Math.max(liveRevisionRef.current, Number(next.liveRevision) || 0);
      const ownDrafts = (next.liveDrafts || []).filter((task) => task.draftCoordinatorEmail === next.viewer.email);
      if (!draftSyncingRef.current) {
        if (!draftHydratedRef.current && draftRef.current.length && !ownDrafts.length && (next.viewer.isAdmin || next.viewer.operatingRoles?.includes('vc'))) {
          window.setTimeout(() => persistDraftsRef.current?.(draftRef.current), 0);
        } else {
          applyDraft(ownDrafts);
        }
      }
      draftHydratedRef.current = true;
      if (openRef.current?.id) {
        const byId = new Map([...(next.requests || []), ...(next.planningRequests || []), ...(next.assignedRequests || []), ...(next.liveDrafts || [])].map((task) => [task.id, task]));
        const refreshed = byId.get(openRef.current.id);
        if (refreshed) setOpen(refreshed);
        else setOpen(null);
      }
      setError('');
      return next;
    } catch (err) {
      if (!silent) setError(err.message || 'Queue could not load.');
      throw err;
    } finally {
      if (showLoader) setLoading(false);
      setRefreshing(false);
    }
  }, [date, archive, applyDraft]);
  loadRef.current = load;
  useEffect(() => { load().catch(() => {}); }, [load]);
  useEffect(() => {
    if (!data || archive) return;
    writeQueueSnapshot(user?.email, { version: 1, date, archive: false, savedAt: Date.now(), data });
  }, [data, date, archive, user?.email]);
  useEffect(() => { json('/api/dashboard/me').then(setViewer).catch(() => {}); }, []);
  useEffect(() => {
    const sync = () => setTimeZonePreview(readDevTimeZone());
    window.addEventListener(TIME_ZONE_PREVIEW_EVENT, sync);
    return () => window.removeEventListener(TIME_ZONE_PREVIEW_EVENT, sync);
  }, []);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { ticketsOpenRef.current = ticketsOpen; }, [ticketsOpen]);
  useEffect(() => { const params = new URLSearchParams(window.location.search); const id = Number(decodeRouteState(params.get('r'))?.task || params.get('task')); if (!id) return; json(`/api/dashboard/queue/v2/requests/${id}`).then(({ request }) => { setOpen(request); if (request.scheduledDate) setDate(request.scheduledDate); }).catch((err) => notify(err.message, 'error')); }, [notify]);
  useEffect(() => { if (!open?.id) { setHistory([]); return; } setDetailNotice(null); setHistoryLoading(true); json(`/api/dashboard/queue/v2/requests/${open.id}/history`).then((result) => setHistory(result.events || [])).catch(() => setHistory([])).finally(() => setHistoryLoading(false)); }, [open?.id]);

  const persistDrafts = useCallback((nextDraft) => {
    saveQuietly();
    const optimistic = nextDraft.map((task) => ({ ...task, isDraft: true }));
    applyDraft(optimistic);
    const version = ++draftSaveVersionRef.current;
    draftSyncingRef.current = true;
    const changes = optimistic.map((task) => ({
      id: task.id, status: task.status, designerEmail: task.designerEmail, scheduledDate: task.scheduledDate,
      scheduledStartMinutes: task.scheduledStartMinutes, productionPoints: task.productionPoints,
      recommendedAccounts: task.recommendedAccounts || [],
    }));
    const request = draftSavePromiseRef.current.catch(() => {}).then(() => json('/api/dashboard/queue/v2/drafts', {
      method: 'POST', body: new URLSearchParams({ changes: JSON.stringify(changes) }),
    }));
    draftSavePromiseRef.current = request;
    request.then((result) => {
      if (version !== draftSaveVersionRef.current) return;
      applyDraft(result.drafts || []);
      liveRevisionRef.current = Math.max(liveRevisionRef.current, Number(result.liveRevision) || 0);
      setData((current) => current ? {
        ...current,
        liveDrafts: [...(current.liveDrafts || []).filter((task) => task.draftCoordinatorEmail !== current.viewer.email), ...(result.drafts || [])],
      } : current);
    }).catch(() => {
      if (version !== draftSaveVersionRef.current) return;
      notify(t('draftSyncFailed'), 'error');
    }).finally(() => {
      if (version !== draftSaveVersionRef.current) return;
      draftSyncingRef.current = false;
      if (deferredLiveRefreshRef.current) {
        deferredLiveRefreshRef.current = false;
        loadRef.current?.({ silent: true }).catch(() => {});
      }
    });
    return request;
  }, [applyDraft, notify, saveQuietly, t]);
  persistDraftsRef.current = persistDrafts;

  const loadTickets = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setTicketsLoading(true);
    setTicketsError('');
    try {
      const result = await json('/api/dashboard/queue/v2/tickets');
      setTickets(result.tickets || []);
    } catch (err) {
      setTicketsError(err.message || 'Could not load requests.');
    } finally {
      if (!silent) setTicketsLoading(false);
    }
  }, []);
  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError('');
    try {
      const result = await json('/api/dashboard/queue/v2/admin-report');
      setOverview(result);
    } catch (err) {
      setOverviewError(err.message || 'Could not load Queue overview.');
    } finally {
      setOverviewLoading(false);
    }
  }, []);
  const toggleOverview = async () => {
    if (!coordinator) return;
    const next = !overviewOpen;
    setOverviewOpen(next);
    if (next && !overview) await loadOverview();
  };

  useEffect(() => {
    if (!data?.viewer?.email) return undefined;
    if (import.meta.env.MODE === 'test') { setLiveStatus('live'); return undefined; }
    const controller = new AbortController();
    followQueueLive({
      after: liveRevisionRef.current,
      signal: controller.signal,
      onStatus: setLiveStatus,
      onEvent: (event) => {
        const revision = Number(event.revision) || 0;
        if (revision <= liveRevisionRef.current) return;
        liveRevisionRef.current = revision;
        // The browser that created a draft already painted it synchronously and
        // receives the authoritative draft response below. Reloading this same
        // view on its own SSE event made each drag look like a full refresh.
        // Other tabs/users have no active draft sync, so they still receive the
        // event and refresh from the shared live state.
        if (draftSyncingRef.current || (event.actorEmail === data.viewer.email && Date.now() < quietMutationUntilRef.current)) {
          if (event.actorEmail !== data.viewer.email) deferredLiveRefreshRef.current = true;
          return;
        }
        window.clearTimeout(liveRefreshTimerRef.current);
        liveRefreshTimerRef.current = window.setTimeout(async () => {
          await loadRef.current?.({ silent: true }).catch(() => {});
          if (openRef.current?.id) {
            json(`/api/dashboard/queue/v2/requests/${openRef.current.id}/history`).then((result) => setHistory(result.events || [])).catch(() => {});
          }
          if (ticketsOpenRef.current) loadTickets({ silent: true });
        }, 90);
      },
    });
    return () => { controller.abort(); window.clearTimeout(liveRefreshTimerRef.current); };
  }, [data?.viewer?.email, loadTickets]);

  const isDev = Boolean(viewer?.is_dev || data?.viewer?.isDev || String(user?.email || '').trim().toLowerCase() === DEV_EMAIL);
  const rolePreviewActive = hasActiveRolePreview();
  const effectiveDevAccess = isDev && !rolePreviewActive;
  const coordinator = data?.viewer && (effectiveDevAccess || data.viewer.isAdmin || data.viewer.operatingRoles?.includes('vc'));
  const simulatedTimeZone = isDev ? timeZonePreview : (data?.viewer?.timeZone || 'America/Costa_Rica');
  const canSelfAssign = Boolean(data?.viewer?.canSelfAssign);
  const pool = useMemo(() => {
    const byId = new Map();
    (data?.requests || []).filter((task) => task.status === 'pool').forEach((task) => byId.set(task.id, task));
    // A live draft is the authoritative temporary state for its request. A
    // scheduled draft must therefore remove the committed pool copy before
    // Submit; a return-to-pool draft replaces it with the provisional card.
    (data?.liveDrafts || []).forEach((task) => {
      if (task.status === 'pool') byId.set(task.id, task);
      else byId.delete(task.id);
    });
    return [...byId.values()];
  }, [data]);
  const selfPool = useMemo(() => (data?.selfPoolRequests || []).filter((task) => task.status === 'pool'), [data]);
  const archived = useMemo(() => data?.requests.filter((task) => task.status === 'cancelled') || [], [data]);
  useEffect(() => {
    if (!designerScope || !data) return;
    const users = data.schedulerUsers || data.designers || [];
    if (users.some((person) => person.email === designerScope)) return;
    setDesignerScope('');
    try { window.localStorage.removeItem(designerScopeKey(user?.email)); } catch {}
  }, [data, designerScope, user?.email]);
  const upcoming = useMemo(() => {
    if (!coordinator) return [];
    const byId = new Map();
    [...(data?.planningRequests || []), ...(data?.liveDrafts || [])].forEach((task) => {
      if (
        task.designerEmail
        && (!designerScope || task.designerEmail === designerScope)
        && ['scheduled', 'in_progress', 'completed'].includes(task.status)
      ) byId.set(task.id, task);
    });
    return [...byId.values()].sort((a, b) => `${a.scheduledDate || ''}-${String(a.scheduledStartMinutes ?? 0).padStart(4, '0')}-${a.id}`.localeCompare(`${b.scheduledDate || ''}-${String(b.scheduledStartMinutes ?? 0).padStart(4, '0')}-${b.id}`));
  }, [coordinator, data, designerScope]);
  useEffect(() => {
    if (!coordinator) return undefined;
    const openUpcomingContext = (event) => {
      const row = event.target.closest?.('.queue-admin-assignment-row');
      if (!row) return;
      const task = upcoming.find((item) => String(item.id) === String(row.dataset.contextRequestId));
      if (!task) return;
      event.preventDefault();
      setOpen(task);
    };
    document.addEventListener('contextmenu', openUpcomingContext);
    return () => document.removeEventListener('contextmenu', openUpcomingContext);
  }, [coordinator, upcoming]);
  const assigned = useMemo(() => { const byId = new Map((data?.assignedRequests || []).map((task) => [task.id, task])); (data?.liveDrafts || []).filter((task) => task.designerEmail === data?.viewer?.email).forEach((task) => byId.set(task.id, task)); return [...byId.values()].sort((a, b) => `${a.scheduledDate}-${String(a.scheduledStartMinutes).padStart(4, '0')}`.localeCompare(`${b.scheduledDate}-${String(b.scheduledStartMinutes).padStart(4, '0')}`)); }, [data]);
  const pickPool = useMemo(() => {
    const minutesPerPP = Number(data?.viewer?.minutesPerPP || 10);
    const forViewer = (task) => ({ ...task, minutesPerPP, durationMinutes: Number(task.productionPoints || 1) * minutesPerPP });
    const poolRequests = (data?.pickRequests || []).filter((task) => task.status === 'pool').map(forViewer);
    const hotRequests = (data?.hotPickRequests || []).filter((task) => task.status === 'pool').map(forViewer)
      .sort((a, b) => (Number(b.hotMultiplier) || 0) - (Number(a.hotMultiplier) || 0));
    const hotIds = new Set(hotRequests.map((task) => String(task.id)));
    const regularRequests = poolRequests.filter((task) => !hotIds.has(String(task.id)) && !(task.isHot || task.tags?.includes('hot')));
    return [...hotRequests, ...regularRequests];
  }, [data]);
  const pickHotFallback = useMemo(() => {
    return (data?.hotPickRequests || []).some((task) => task.status === 'pool') && pickPool.length > 0;
  }, [data, pickPool]);
  // Pick is a permanent PD tool, not an empty-state escape hatch. A designer
  // can always open it to review what is available, even with scheduled work
  // already on their calendar or when the Pool is currently empty.
  const pickAvailable = Boolean(data?.viewer);
  const toggleTickets = async () => { const next = !ticketsOpen; setTicketsOpen(next); if (next) await loadTickets(); };
  const patchQueueTask = useCallback((taskId, patch) => {
    const applyPatch = (task) => task.id === taskId ? { ...task, ...patch } : task;
    setData((current) => current ? {
      ...current,
      requests: (current.requests || []).map(applyPatch),
      planningRequests: (current.planningRequests || []).map(applyPatch),
      assignedRequests: (current.assignedRequests || []).map(applyPatch),
      pickRequests: (current.pickRequests || []).map(applyPatch),
      selfPoolRequests: (current.selfPoolRequests || []).map(applyPatch),
      liveDrafts: (current.liveDrafts || []).map(applyPatch),
    } : current);
    setOpen((current) => current?.id === taskId ? { ...current, ...patch } : current);
  }, []);
  const duplicateRequest = useCallback(async (requestId) => {
    const id = Number(requestId);
    if (!Number.isInteger(id) || id < 1) return null;
    try {
      const result = await json(`/api/dashboard/queue/v2/requests/${id}/duplicate`, { method: 'POST' });
      const duplicate = result.request;
      setData((current) => {
        if (!current || !duplicate) return current;
        const add = (items = []) => [duplicate, ...items.filter((item) => item.id !== duplicate.id)];
        return {
          ...current,
          requests: add(current.requests),
          pickRequests: add(current.pickRequests),
          selfPoolRequests: current.viewer?.canSelfAssign ? add(current.selfPoolRequests) : current.selfPoolRequests,
        };
      });
      setOpen(duplicate);
      notify(t('duplicateCreated'));
      return duplicate;
    } catch (err) {
      notify(err.message || t('draftSyncFailed'), 'error');
      return null;
    }
  }, [notify, t]);
  const assignToMultipleAccounts = useCallback(async (requestId, selectedAccounts) => {
    const id = Number(requestId);
    if (!Number.isInteger(id) || id < 1 || !selectedAccounts?.length || multiAssignBusy) return null;
    setMultiAssignBusy(true);
    try {
      const result = await json(`/api/dashboard/queue/v2/requests/${id}/assign-accounts`, {
        method: 'POST',
        body: new URLSearchParams({ accounts: JSON.stringify(selectedAccounts) }),
      });
      const copies = result.requests || [];
      setData((current) => {
        if (!current || !copies.length) return current;
        const merge = (items = [], additions = copies) => {
          const byId = new Map(items.map((item) => [item.id, item]));
          additions.forEach((item) => byId.set(item.id, item));
          return [...byId.values()];
        };
        const ownCopies = copies.filter((item) => item.designerEmail === current.viewer?.email);
        const assignedIds = new Set(copies.map((item) => item.id));
        const removeAssigned = (items = []) => items.filter((item) => !assignedIds.has(item.id));
        return {
          ...current,
          requests: merge(current.requests),
          planningRequests: merge(current.planningRequests),
          assignedRequests: merge(current.assignedRequests, ownCopies),
          pickRequests: removeAssigned(current.pickRequests),
          selfPoolRequests: removeAssigned(current.selfPoolRequests),
          liveDrafts: removeAssigned(current.liveDrafts),
        };
      });
      setMultiAssignRequest(null);
      const skipped = result.unassignedAccounts?.length ? ` · ${result.unassignedAccounts.length} account${result.unassignedAccounts.length === 1 ? '' : 's'} without a manager` : '';
      notify(`${t('assignMultipleAccountsSuccess')} ${copies.length}${skipped}.`, skipped ? 'warning' : 'success');
      return result;
    } catch (err) {
      notify(err.message || t('draftSyncFailed'), 'error');
      return null;
    } finally {
      setMultiAssignBusy(false);
    }
  }, [multiAssignBusy, notify, t]);
  useEffect(() => {
    const handleContextAction = (event) => {
      const action = event.detail?.action;
      const requestId = event.detail?.requestId || event.detail?.target?.dataset?.contextRequestId;
      if (!requestId) return;
      if (action === 'duplicate') duplicateRequest(requestId);
      if (action === 'assign-multiple' && coordinator) {
        const id = Number(requestId);
        const target = [...(data?.requests || []), ...(data?.liveDrafts || [])].find((item) => Number(item.id) === id && item.status === 'pool');
        if (target) setMultiAssignRequest(target);
      }
    };
    window.addEventListener('sentient:context-action', handleContextAction);
    return () => window.removeEventListener('sentient:context-action', handleContextAction);
  }, [coordinator, data, duplicateRequest]);
  const showScheduledLocally = useCallback((task, placement) => {
    const scheduled = { ...task, ...placement, status: 'scheduled', isDraft: false, draftCoordinatorEmail: null };
    setData((current) => {
      if (!current) return current;
      const without = (items = []) => items.filter((item) => item.id !== task.id);
      const withScheduled = (items = []) => [scheduled, ...without(items)];
      const forViewer = scheduled.designerEmail === current.viewer?.email ? withScheduled(current.assignedRequests) : without(current.assignedRequests);
      return {
        ...current,
        requests: withScheduled(current.requests),
        planningRequests: withScheduled(current.planningRequests),
        assignedRequests: forViewer,
        pickRequests: without(current.pickRequests),
        selfPoolRequests: without(current.selfPoolRequests),
        liveDrafts: without(current.liveDrafts),
      };
    });
    return scheduled;
  }, []);
  const pickRequest = async (task) => {
    saveQuietly();
    setPickBusy(true);
    try {
      const now = new Date();
      const placement = { scheduled_date: DAY(now, QUEUE_TIME_ZONE), scheduled_start_minutes: String(Math.min(1430, Math.ceil(currentMinutes(now, QUEUE_TIME_ZONE) / 10) * 10)) };
      const localPlacement = { designerEmail: data?.viewer?.email || '', scheduledDate: placement.scheduled_date, scheduledStartMinutes: Number(placement.scheduled_start_minutes) };
      if (!task.isHotCandidate) showScheduledLocally(task, localPlacement);
      setPickOpen(false);
      const body = task.isHotCandidate
        ? new URLSearchParams({ hot_account: task.post.account, hot_shortcode: task.post.shortcode, ...placement })
        : new URLSearchParams({ request_id: String(task.id), ...placement });
      const result = await json('/api/dashboard/queue/v2/pick', { method: 'POST', body });
      showScheduledLocally(result.request, { designerEmail: result.request.designerEmail, scheduledDate: result.request.scheduledDate, scheduledStartMinutes: result.request.scheduledStartMinutes });
      notify(t('pickedRequest'));
      return result;
    } catch (err) {
      notify(err.message || t('draftSyncFailed'), 'error');
      return null;
    } finally { setPickBusy(false); }
  };
  const submit = () => {
    saveQuietly();
    const pendingDrafts = [...draftRef.current];
    const changes = pendingDrafts.map((task) => ({ id: task.id, status: task.status, designerEmail: task.designerEmail, scheduledDate: task.scheduledDate, scheduledStartMinutes: task.scheduledStartMinutes, productionPoints: task.productionPoints, recommendedAccounts: task.recommendedAccounts || [] }));
    pendingDrafts.forEach((task) => {
      if (task.status === 'pool') showReturnedInPool(task);
      else showScheduledLocally(task, task);
    });
    applyDraft([]);
    draftSavePromiseRef.current.catch(() => {}).then(() => json('/api/dashboard/queue/v2/submit', { method: 'POST', body: new URLSearchParams({ changes: JSON.stringify(changes) }) })).then((result) => {
      (result.adjustments || []).forEach((adjustment) => patchQueueTask(adjustment.id, adjustment));
      const sent = result.notifications?.sent || 0; const failed = result.notifications?.failed || 0;
      notify(`${t('scheduleSubmitted')} ${sent} DM${sent === 1 ? '' : 's'} sent${failed ? ` · ${failed} failed` : ''}.`, failed ? 'warning' : 'success');
    }).catch((err) => { notify(err.message || t('draftSyncFailed'), 'error'); loadRef.current?.({ silent: true }).catch(() => {}); });
  };
  const clearDrafts = () => { saveQuietly(); applyDraft([]); json('/api/dashboard/queue/v2/drafts/clear', { method: 'POST', body: new URLSearchParams() }).catch((err) => { notify(err.message, 'error'); }); };
  const resetQueue = async (confirmation) => {
    await json('/api/admin/queue/reset', { method: 'POST', body: new URLSearchParams({ confirmation }) });
    applyDraft([]);
    closeDetail();
    setTickets([]);
    setTicketsOpen(false);
    setOverview(null);
    setOverviewOpen(false);
    setResetOpen(false);
    notify(t('queueResetDone'));
    await load({ silent: true }).catch(() => {});
  };
  const changeDraftAccounts = (requestId, accounts) => persistDrafts(draftRef.current.map((task) => task.id === requestId ? { ...task, recommendedAccounts: accounts } : task));
  // Returning work to the Pool is intentionally instant. Keep the local
  // schedule authoritative while the durable submit finishes in background;
  // otherwise a slow Queue refresh makes a simple drop feel broken.
  const showReturnedInPool = useCallback((task) => {
    const returned = { ...task, status: 'pool', designerEmail: null, scheduledDate: null, scheduledStartMinutes: null, isDraft: false, draftCoordinatorEmail: null };
    applyDraft(draftRef.current.filter((draftTask) => draftTask.id !== task.id));
    setData((current) => {
      if (!current) return current;
      const without = (items = []) => items.filter((item) => item.id !== task.id);
      const withReturned = (items = []) => [returned, ...without(items)];
      return {
        ...current,
        requests: withReturned(current.requests),
        planningRequests: without(current.planningRequests),
        assignedRequests: without(current.assignedRequests),
        liveDrafts: without(current.liveDrafts),
        pickRequests: withReturned(current.pickRequests),
        selfPoolRequests: withReturned(current.selfPoolRequests),
      };
    });
    return returned;
  }, [applyDraft]);
  const persistPoolReturn = useCallback((task) => {
    saveQuietly();
    const returned = showReturnedInPool(task);
    // A prior draft write may already be in flight. Sequence the durable
    // mutation after it, but never make the person wait to see the result.
    draftSavePromiseRef.current.catch(() => {}).then(() => json('/api/dashboard/queue/v2/submit', {
      method: 'POST', body: new URLSearchParams({ changes: JSON.stringify([{
        id: returned.id, status: 'pool', designerEmail: null, scheduledDate: null,
        scheduledStartMinutes: null, productionPoints: returned.productionPoints,
        recommendedAccounts: returned.recommendedAccounts || [],
      }]) }),
    })).then(() => {
      notify(t('returnedToPool'));
    }).catch((err) => {
      notify(err.message || t('draftSyncFailed'), 'error');
    });
  }, [notify, saveQuietly, showReturnedInPool, t]);
  const dragTask = (event) => {
    const id = Number(activeQueueDragId || event.dataTransfer?.getData('queue-task'));
    return [...draftRef.current, ...(data?.liveDrafts || []), ...(data?.planningRequests || []), ...(data?.requests || [])].find((task) => task.id === id);
  };
  const poolDragOver = (event) => {
    if (!coordinator || dragTask(event)?.status !== 'scheduled') return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setPoolDropActive(true);
  };
  const poolDrop = (event) => {
    event.preventDefault();
    if (!coordinator) return;
    const source = dragTask(event);
    setPoolDropActive(false);
    activeQueueDragId = null;
    if (!source || source.status !== 'scheduled') return;
    persistPoolReturn(source);
  };
  const closeDetail = () => { openRef.current = null; setOpen(null); };
  const action = (actionName, value) => {
    const target = open;
    if (!target) return;
    saveQuietly();
    const now = new Date().toISOString();
    const optimistic = actionName === 'start'
      ? { status: 'in_progress', actualStartedAt: now, completedAt: null, scheduledDate: DAY(new Date(), QUEUE_TIME_ZONE), scheduledStartMinutes: Math.floor(currentMinutes(new Date(), QUEUE_TIME_ZONE) / 10) * 10 }
      : actionName === 'complete' ? { status: 'completed', completedAt: now }
      : actionName === 'close' ? { status: 'closed', finalPermalink: value?.[0]?.url || '', finalPermalinks: value || [], closedAt: now }
      : {};
    patchQueueTask(target.id, optimistic);
    closeDetail();
    const body = value ? new URLSearchParams(actionName === 'close' ? { final_permalinks: JSON.stringify(value) } : {}) : undefined;
    json(`/api/dashboard/queue/v2/requests/${target.id}/${actionName}`, { method: 'POST', body }).then((result) => {
      if (result.deferred) patchQueueTask(target.id, { status: 'scheduled', actualStartedAt: null, completedAt: null, scheduledDate: result.scheduledDate, scheduledStartMinutes: result.scheduledStartMinutes });
      notify(result.deferred ? `${t('movedAfterActive')} ${result.scheduledDate} · ${time(result.scheduledStartMinutes)}.` : t('requestUpdated'), result.deferred ? 'warning' : 'success');
    }).catch((err) => { patchQueueTask(target.id, target); notify(err.message, 'error'); });
  };
  const cancel = (reason) => {
    const target = open;
    if (!target) return;
    saveQuietly();
    patchQueueTask(target.id, { status: 'cancelled', cancellationReason: reason || '' });
    closeDetail();
    json(`/api/dashboard/queue/v2/requests/${target.id}/cancel`, { method: 'POST', body: new URLSearchParams({ reason }) }).then(() => notify(t('requestUpdated'))).catch((err) => { patchQueueTask(target.id, target); notify(err.message, 'error'); });
  };
  const edit = (values) => {
    const target = open;
    if (!target) return false;
    saveQuietly();
    const optimistic = { productionPoints: Number(values.productionPoints), durationMinutes: Number(values.productionPoints) * Number(target.minutesPerPP || 10), priority: values.priority, tags: values.tags, brief: values.brief, notes: values.notes, references: values.references, recommendedAccounts: values.recommendedAccounts };
    patchQueueTask(target.id, optimistic);
    setDetailNotice({ message: t('requestUpdated'), type: 'success' });
    json(`/api/dashboard/queue/v2/requests/${target.id}/edit`, { method: 'POST', body: new URLSearchParams({ production_points: String(values.productionPoints), priority: values.priority, tags: values.tags.join(','), brief: values.brief, notes: values.notes, references: JSON.stringify(values.references), recommended_accounts: JSON.stringify(values.recommendedAccounts) }) }).then((result) => {
      patchQueueTask(target.id, result.request);
    }).catch((err) => { patchQueueTask(target.id, target); setDetailNotice({ message: err.message, type: 'error' }); });
    return true;
  };
  const resend = async () => { try { const result = await json(`/api/dashboard/queue/v2/requests/${open.id}/notify`, { method: 'POST' }); setDetailNotice({ message: result.sent ? t('slackSent') : t('slackFailed'), type: result.sent ? 'success' : 'error' }); const events = await json(`/api/dashboard/queue/v2/requests/${open.id}/history`); setHistory(events.events || []); } catch (err) { setDetailNotice({ message: err.message, type: 'error' }); } };
  const upload = async (files) => { let current = open; let failures = 0; for (const file of files) { const body = new FormData(); body.append('file', file); try { const result = await json(`/api/dashboard/queue/v2/requests/${open.id}/attachments`, { method: 'POST', body }); current = result.request; } catch { failures += 1; } } setOpen(current); if (current?.id) patchQueueTask(current.id, current); setDetailNotice({ message: failures ? t('uploadFailed') : t('filesUploaded'), type: failures ? 'error' : 'success' }); };
  const download = async (file) => { const response = await apiFetch(`${API_BASE}/api/dashboard/queue/v2/requests/${open.id}/attachments/${file.id}`); if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || 'Download failed.'); const blob = await response.blob(); const href = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = href; link.download = file.name; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(href), 30000); };
  const createTimeBlock = async (form) => {
    try {
      saveQuietly();
      const result = await json('/api/dashboard/queue/v2/tickets/time-block', { method: 'POST', body: new URLSearchParams({ designer_email: form.designerEmail || data.viewer.email, category: form.category, scheduled_date: form.scheduledDate, scheduled_start_minutes: String(form.startMinutes), duration_minutes: String(form.durationMinutes), title: form.title, note: form.note }) });
      setData((current) => current ? { ...current, timeBlocks: [result.ticket, ...(current.timeBlocks || [])], pendingTicketCount: (current.pendingTicketCount || 0) + (result.ticket.status === 'pending' ? 1 : 0) } : current);
      if (ticketsOpen) setTickets((current) => [result.ticket, ...current]);
      notify(t('ticketCreated'));
      return true;
    } catch (err) {
      notify(err.message, 'error');
      return false;
    }
  };
  const editTimeBlock = async (form) => {
    try {
      saveQuietly();
      const result = await json(`/api/dashboard/queue/v2/tickets/time-block/${form.ticketId}`, { method: 'POST', body: new URLSearchParams({ designer_email: form.designerEmail || data.viewer.email, category: form.category, scheduled_date: form.scheduledDate, scheduled_start_minutes: String(form.startMinutes), duration_minutes: String(form.durationMinutes), title: form.title, note: form.note }) });
      setData((current) => current ? { ...current, timeBlocks: (current.timeBlocks || []).map((block) => block.id === result.ticket.id ? result.ticket : block) } : current);
      setTickets((current) => current.map((ticket) => ticket.id === result.ticket.id ? result.ticket : ticket));
      notify(t('requestUpdated')); return true;
    } catch (err) { notify(err.message, 'error'); return false; }
  };
  const deleteTimeBlock = (block) => {
    saveQuietly();
    setData((current) => current ? { ...current, timeBlocks: (current.timeBlocks || []).filter((item) => item.id !== block.id), pendingTicketCount: Math.max(0, (current.pendingTicketCount || 0) - (block.status === 'pending' ? 1 : 0)) } : current);
    setTickets((current) => current.filter((ticket) => ticket.id !== block.id));
    json(`/api/dashboard/queue/v2/tickets/time-block/${block.id}`, { method: 'POST', body: new URLSearchParams({ delete: 'true' }) }).then(() => notify(t('requestUpdated'))).catch((err) => { notify(err.message, 'error'); });
  };
  const saveSchedulerPreferences = (preferences) => {
    saveQuietly();
    const optimistic = { hiddenUsers: preferences.hiddenUsers || [], rowOrder: preferences.rowOrder || [] };
    // Preserve the chosen layout even if a live Queue request that started
    // earlier completes after this click. The server response then replaces
    // this local overlay once it is authoritative.
    schedulerPreferencesRef.current = optimistic;
    setData((current) => current ? { ...current, schedulerPreferences: optimistic } : current);
    json('/api/dashboard/queue/v2/scheduler-preferences', {
      method: 'POST', body: new URLSearchParams({ hidden_users: JSON.stringify(optimistic.hiddenUsers), row_order: JSON.stringify(optimistic.rowOrder) }),
    }).then((result) => {
      const saved = result.schedulerPreferences || optimistic;
      schedulerPreferencesRef.current = saved;
      setData((current) => current ? { ...current, schedulerPreferences: saved } : current);
    }).catch((err) => {
      notify(err.message, 'error');
      // Keep the local layout in place. A transient save failure must not make
      // a just-hidden row jump back into view.
    });
  };
  const returnTaskToPool = (task) => persistPoolReturn(task);
  const cancelTask = (task) => {
    saveQuietly();
    patchQueueTask(task.id, { status: 'cancelled', cancellationReason: 'Cancelled by coordinator' });
    json(`/api/dashboard/queue/v2/requests/${task.id}/cancel`, { method: 'POST', body: new URLSearchParams({ reason: 'Cancelled by coordinator' }) }).then(() => notify(t('requestUpdated'))).catch((err) => { patchQueueTask(task.id, task); notify(err.message, 'error'); });
  };
  const saveManagedAccounts = async (accounts) => {
    saveQuietly();
    const result = await json('/api/dashboard/queue/v2/account-onboarding', { method: 'POST', body: new URLSearchParams({ accounts: JSON.stringify(accounts) }) });
    accountSetupDismissedRef.current = true;
    setData((current) => current ? { ...current, accountOnboarding: result.accountOnboarding, schedulerUsers: (current.schedulerUsers || []).map((item) => item.email === current.viewer?.email ? { ...item, accounts: result.accountOnboarding.selectedAccounts } : item) } : current);
    notify(t('managedAccountsSaved'));
    return result;
  };
  const requestAccountAccess = async (accounts, reason) => {
    const result = await json('/api/dashboard/queue/v2/tickets/account-access', { method: 'POST', body: new URLSearchParams({ accounts: JSON.stringify(accounts), reason }) });
    notify(t('accountRequestSent'));
    return result;
  };
  const finishGuide = () => {
    window.localStorage.setItem('sentient.queueGuide.v1', 'completed');
    guideCompletedRef.current = true;
    setGuideOpen(false);
    if (!data?.accountOnboarding?.completed && !accountSetupDismissedRef.current) setAccountSetupOpen(true);
  };
  const requestPP = async (productionPoints, reason) => {
    try {
      await json('/api/dashboard/queue/v2/tickets/pp-revision', { method: 'POST', body: new URLSearchParams({ request_id: String(open.id), production_points: String(productionPoints), reason }) });
      notify(t('ticketCreated'));
      return true;
    } catch (err) {
      setDetailNotice({ message: err.message, type: 'error' });
      return false;
    }
  };
  const requestCancellation = async (reason) => {
    try {
      await json('/api/dashboard/queue/v2/tickets/cancellation', { method: 'POST', body: new URLSearchParams({ request_id: String(open.id), reason }) });
      notify(t('ticketCreated'));
      return true;
    } catch (err) {
      setDetailNotice({ message: err.message, type: 'error' });
      return false;
    }
  };
  const requestMove = async (scheduledDate, scheduledStartMinutes, reason) => {
    try {
      await json('/api/dashboard/queue/v2/tickets/move', { method: 'POST', body: new URLSearchParams({ request_id: String(open.id), scheduled_date: scheduledDate, scheduled_start_minutes: String(scheduledStartMinutes), reason }) });
      notify(t('ticketCreated'));
      return true;
    } catch (err) {
      setDetailNotice({ message: err.message, type: 'error' });
      return false;
    }
  };
  const requestTraineeReview = async (canvaLink) => {
    try {
      await json('/api/dashboard/queue/v2/tickets/trainee-review', {
        method: 'POST',
        body: new URLSearchParams({ request_id: String(open.id), canva_link: canvaLink }),
      });
      const result = await json(`/api/dashboard/queue/v2/requests/${open.id}`);
      setOpen(result.request);
      await Promise.all([load({ silent: true }), loadTickets({ silent: true })]);
      notify(t('traineeReviewSent'));
      return true;
    } catch (err) {
      setDetailNotice({ message: err.message || 'Could not send the Canva design for review.', type: 'error' });
      return false;
    }
  };
  const reviewTicket = async (ticketId, reviewAction) => {
    try {
      await json(`/api/dashboard/queue/v2/tickets/${ticketId}/review`, { method: 'POST', body: new URLSearchParams({ action: reviewAction }) });
      await Promise.all([load({ silent: true }), loadTickets({ silent: true })]);
      if (open?.id) {
        const result = await json(`/api/dashboard/queue/v2/requests/${open.id}`);
        setOpen(result.request);
      }
      notify(t('ticketReviewed'));
    } catch (err) {
      setTicketsError(err.message || 'Could not review request.');
      throw err;
    }
  };
  const openPendingTickets = useMemo(() => {
    if (!open?.id) return [];
    const fromTask = (open.pendingTickets || []).map((ticket) => ({ ...ticket }));
    const fromInbox = tickets.filter((ticket) => ticket.status === 'pending' && Number(ticket.requestId) === Number(open.id)).map((ticket) => ({
      id: ticket.id, type: ticket.type, requestedProductionPoints: ticket.requestedProductionPoints,
      scheduledDate: ticket.scheduledDate, scheduledStartMinutes: ticket.scheduledStartMinutes, reason: ticket.reason,
    }));
    return [...new Map([...fromTask, ...fromInbox].map((ticket) => [ticket.id, ticket])).values()];
  }, [open, tickets]);
  useEffect(() => {
    if (open?.id && coordinator) loadTickets({ silent: true }).catch(() => {});
  }, [open?.id, coordinator, loadTickets]);

  return <main className="queue-page scheduler-page">
    <header className="queue-topbar">
      <div className="queue-brand"><CalendarDays size={22} /><div><span>sentientdash.app</span><h1>{t('productionQueue')}</h1></div></div>
      <div className="queue-actions">
        <div className="queue-actions-group queue-actions-primary">
          <span className={`queue-live-status is-${liveStatus}`} title={liveStatus === 'live' ? t('liveConnected') : liveStatus === 'offline' ? t('liveOffline') : t('liveConnecting')}>{liveStatus === 'offline' ? <WifiOff size={12} /> : <Radio size={12} />}<b>{liveStatus === 'live' ? t('liveConnected') : liveStatus === 'offline' ? t('liveOffline') : t('liveConnecting')}</b></span>
          {(coordinator || canSelfAssign) ? <button type="button" className="queue-create-button" onClick={() => setCreateOpen(true)}><Plus size={14} />{t('createPost')}</button> : null}
          {coordinator ? <button type="button" className="scheduler-add-time" onClick={() => setAddTimeNonce((value) => value + 1)}><CalendarPlus size={13} />{t('addTime')}</button> : null}
          {coordinator ? <button type="button" className={`queue-overview-button${overviewOpen ? ' is-active' : ''}`} onClick={toggleOverview}><BarChart3 size={14} />{t('adminOverview')}</button> : null}
          {data?.viewer ? <button type="button" className={`queue-ticket-button${ticketsOpen ? ' is-active' : ''}`} onClick={toggleTickets}><ClipboardList size={14} />{t('tickets')}{data.pendingTicketCount ? <b>{data.pendingTicketCount}</b> : null}</button> : null}
          {pickAvailable ? <button type="button" className={`queue-pick-button${pickOpen ? ' is-active' : ''}`} onClick={() => setPickOpen(true)}><Check size={14} />{t('pick')}</button> : null}
        </div>
        <nav className="queue-actions-nav" aria-label={t('dashboard')}>
          <span className="queue-nav-current" aria-current="page">Queue</span>{coordinator ? <><a href={`${import.meta.env.BASE_URL}tracker.html`}>Tracker</a><a href={`${import.meta.env.BASE_URL}insights.html`}>Insights</a></> : null}<a className="queue-dashboard-link" href={import.meta.env.BASE_URL}><ArrowLeft size={14} />{t('dashboard')}</a>
        </nav>
        <div className="queue-actions-group queue-actions-account">
          <QueueSettings isAdmin={Boolean(data?.viewer?.isAdmin)} isDev={effectiveDevAccess} userEmail={user.email} avatarUrl={user?.photoURL || data?.viewer?.avatarUrl} displayLabel={user?.displayName || data?.viewer?.displayName} onManageAccounts={() => { accountSetupDismissedRef.current = false; setAccountSetupOpen(true); }} onStartGuide={() => { setGuideStep(-1); setGuideOpen(true); }} onResetQueue={(data?.viewer?.isAdmin || effectiveDevAccess) ? () => setResetOpen(true) : null} onSignOut={() => { clearSsoCookie(); signOut(auth); }} />
        </div>
      </div>
    </header>
    {refreshing ? <div className="queue-refresh-progress" aria-label="Refreshing Queue" /> : null}
    {toast ? <div className={`queue-toast is-${toast.type}`} role="status">{toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}<span>{toast.message}</span><button type="button" onClick={() => setToast(null)}><X size={14} /></button></div> : null}
    {loading && !data ? <section className="queue-state"><LoaderCircle className="queue-spin" /><p>{t('loadingSchedule')}</p></section> : null}
    {error && !data ? <section className="queue-state queue-error"><p>{error}</p><button type="button" onClick={load}>{t('tryAgain')}</button></section> : null}
    {data ? <>
      {overviewOpen ? <QueueOverview report={overview} loading={overviewLoading} error={overviewError} onRetry={loadOverview} onOpen={setOpen} /> : null}
      {!overviewOpen ? <>
      <section className="scheduler-toolbar"><div><p className="scheduler-eyebrow">{coordinator ? t('coordinatorSchedule') : t('mySchedule')}</p><h2>{displayDate(date, language)}</h2></div>{coordinator ? <label className="scheduler-designer-filter">{t('assignedView')}<select value={designerScope} onChange={selectDesignerScope}><option value="">{t('allUsers')}</option>{(data.schedulerUsers || data.designers).map((person) => <option key={person.email} value={person.email}>{displayName(person.email, person.displayName)}</option>)}</select></label> : null}<div className="scheduler-nav"><button type="button" aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))}><ChevronLeft size={17} /></button><button type="button" onClick={() => setDate(DAY(new Date(), QUEUE_TIME_ZONE))}>{t('today')}</button><button type="button" aria-label="Next day" onClick={() => setDate(shiftDay(date, 1))}><ChevronRight size={17} /></button></div><button type="button" className={`scheduler-archive-toggle${archive ? ' is-on' : ''}`} onClick={() => setArchive((value) => !value)}><Archive size={14} />{archive ? t('liveQueue') : t('archive')}</button></section>
      {coordinator && !archive ? <section className={`scheduler-pool${poolDropActive ? ' is-drop-target' : ''}`} onDragOver={poolDragOver} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPoolDropActive(false); }} onDrop={poolDrop} aria-label={t('poolDropHint')}><header><div><p className="scheduler-eyebrow">{t('productionPool')}</p><h2>{pool.length} {t('readyToSchedule')}</h2></div><small>{poolDropActive ? t('poolDropHint') : t('visibleSchedule')}</small></header><div className="scheduler-pool-list">{pool.map((task) => <PoolCard key={task.id} task={task} onOpen={setOpen} canMultiAssign={Boolean(coordinator)} />)}{!pool.length ? <p className="scheduler-empty">{t('emptyPool')}</p> : null}</div></section> : null}
      {!coordinator && canSelfAssign && !archive ? <section className="scheduler-pool"><header><div><p className="scheduler-eyebrow">My Pool</p><h2>{selfPool.length} {t('readyToSchedule')}</h2></div><small>Drag your request onto your own schedule.</small></header><div className="scheduler-pool-list">{selfPool.map((task) => <PoolCard key={task.id} task={task} onOpen={setOpen} />)}{!selfPool.length ? <p className="scheduler-empty">Create a post to start your own Pool.</p> : null}</div></section> : null}
      {(coordinator || canSelfAssign) && draft.length ? <div className="scheduler-draft-float"><button type="button" className="scheduler-secondary" onClick={clearDrafts}>{t('clearDrafts')}</button><button type="button" className="scheduler-submit" onClick={submit}><Send size={14} />{t('submit')} {draft.length}</button></div> : null}
      {archive ? <section className="queue-archive-list"><header><p className="scheduler-eyebrow">{t('archive')}</p><h2>{archived.length} {t('cancelled')}</h2></header>{archived.length ? archived.map((task) => <button type="button" key={task.id} className={`${priorityClass(task.priority)}${hotClass(task)}`} onClick={() => setOpen(task)}><span>{cover(task) ? <img src={cover(task)} alt="" /> : '@'}</span><div><b>@{task.post.account}</b><small>{task.cancellationReason || t('cancelled')}</small>{isHotTask(task) ? <i className="queue-hot-badge">🔥 {hotText(task)}</i> : null}</div><em>{displayTimestamp(task.updatedAt, language)}</em></button>) : <p className="scheduler-empty">{t('noArchived')}</p>}</section> : <>{coordinator && draft.length ? <DraftAccounts draft={draft} designers={data.designers} onAccountsChange={changeDraftAccounts} /> : null}<Scheduler data={data} draft={draft} setDraft={setDraft} onDraftChange={persistDrafts} selectedDate={date} designerScope={designerScope} timeZone={simulatedTimeZone} onOpen={setOpen} onError={(message) => notify(message, 'error')} onCreateTimeBlock={createTimeBlock} onEditTimeBlock={editTimeBlock} onDeleteTimeBlock={deleteTimeBlock} onReturnToPool={returnTaskToPool} onCancelTask={cancelTask} onDuplicateTask={(task) => duplicateRequest(task.id)} onSavePreferences={saveSchedulerPreferences} addTimeNonce={addTimeNonce} />{coordinator ? <AdminAssignmentTable tasks={upcoming} onOpen={setOpen} headingKey="upcomingProduction" countKey="activeRequests" /> : <DesignerAssignments tasks={assigned} timeZone={simulatedTimeZone} onOpen={setOpen} />}</>}
      </> : null}
    </> : null}
    {ticketsOpen && data?.viewer ? <TicketPanel tickets={tickets} loading={ticketsLoading} error={ticketsError} onClose={() => setTicketsOpen(false)} onReview={reviewTicket} canReview={Boolean(coordinator)} /> : null}
    {pickOpen ? <PickModal requests={pickPool} hotFallback={pickHotFallback} busy={pickBusy} onClose={() => setPickOpen(false)} onAssign={pickRequest} /> : null}
    {createOpen ? <CreatePostModal tags={data?.tags || []} onClose={() => setCreateOpen(false)} onCreated={(request) => { saveQuietly(); setData((current) => current ? { ...current, requests: [request, ...(current.requests || []).filter((task) => task.id !== request.id)], pickRequests: [request, ...(current.pickRequests || []).filter((task) => task.id !== request.id)] } : current); setCreateOpen(false); notify(t('postCreated')); }} /> : null}
    {multiAssignRequest ? <AssignMultipleAccountsModal key={multiAssignRequest.id} task={multiAssignRequest} accounts={data?.accounts || []} designers={data?.schedulerUsers || data?.designers || []} busy={multiAssignBusy} onClose={() => { if (!multiAssignBusy) setMultiAssignRequest(null); }} onSubmit={(selectedAccounts) => assignToMultipleAccounts(multiAssignRequest.id, selectedAccounts)} /> : null}
    {resetOpen ? <ResetQueueModal onClose={() => setResetOpen(false)} onReset={resetQueue} /> : null}
    {accountSetupOpen && data ? <AccountSetupModal onboarding={data.accountOnboarding} accounts={data.accounts || []} onClose={() => { accountSetupDismissedRef.current = true; setAccountSetupOpen(false); }} onSave={saveManagedAccounts} onRequest={requestAccountAccess} /> : null}
    {guideOpen ? <QueueGuide coordinator={Boolean(coordinator)} step={guideStep} setStep={setGuideStep} onChooseLanguage={setLanguage} onComplete={finishGuide} /> : null}
    <Detail
      task={open}
      tags={data?.tags || []}
      availableAccounts={(data?.schedulerUsers || data?.designers || []).find((person) => person.email === open?.designerEmail)?.accounts || open?.recommendedAccounts || []}
      canCoordinate={coordinator}
      canDuplicate={Boolean(coordinator || (canSelfAssign && open?.designerEmail === data?.viewer?.email))}
      isOwner={open?.designerEmail === data?.viewer.email || data?.viewer.isAdmin}
      isTrainee={Boolean(data?.viewer?.operatingRoles?.includes('trainee') && !data?.viewer?.isAdmin)}
      pendingTickets={openPendingTickets}
      onReviewTicket={reviewTicket}
      notice={detailNotice}
      history={history}
      historyLoading={historyLoading}
      onClose={closeDetail}
      onAction={action}
      onCancel={cancel}
      onEdit={edit}
      onNotify={resend}
      onUpload={upload}
      onDownload={download}
      onRequestPP={requestPP}
      onRequestCancellation={requestCancellation}
      onRequestMove={requestMove}
      onRequestTraineeReview={requestTraineeReview}
      onDuplicate={(task) => duplicateRequest(task.id)}
      timeZone={simulatedTimeZone}
    />
    <DevRolePreview isDev={isDev} canSwitchRoles={Boolean(viewer?.can_role_switch || data?.viewer?.canRoleSwitch || ROLE_SWITCHER_DEFAULTS[String(user?.email || '').trim().toLowerCase()])} availableRoles={data?.viewer?.availableOperatingRoles || viewer?.available_operating_roles || ROLE_SWITCHER_DEFAULTS[String(user?.email || '').trim().toLowerCase()] || []} />
  </main>;
}

function Root() {
  const [user, setUser] = useState(undefined);
  const [notice, setNotice] = useState('');
  const [checked, setChecked] = useState(false);
  const [language, setLanguageState] = useState(() => window.localStorage.getItem('sentient.lang') || (navigator.language.startsWith('es') ? 'es' : 'en'));
  const [theme, setThemeState] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');
  const setLanguage = (value) => { window.localStorage.setItem('sentient.lang', value); setLanguageState(value); };
  const setTheme = (value) => { window.localStorage.setItem('sentient.theme', value); document.documentElement.setAttribute('data-theme', value); setThemeState(value); };
  useEffect(() => { getRedirectResult(auth, browserPopupRedirectResolver).catch((error) => setNotice(describeSignInError(error))); }, []);
  useEffect(() => { trySsoSignIn().finally(() => setChecked(true)); }, []);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => user ? startSsoRefresh() : undefined, [user]);
  const value = useMemo(() => ({ language, theme, t: (key) => COPY[language]?.[key] || COPY.en[key] || key, setLanguage, setTheme }), [language, theme]);
  const content = user === undefined || (!user && !checked) ? <main className="queue-auth" /> : user ? <QueueApp user={user} /> : <AuthGate notice={notice} setNotice={setNotice} />;
  return <QueuePreferencesContext.Provider value={value}><PrefsProvider lang={language} theme={theme}>{content}</PrefsProvider></QueuePreferencesContext.Provider>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><Root /></React.StrictMode>);
