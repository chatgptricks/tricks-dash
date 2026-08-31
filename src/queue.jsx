import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { AlertTriangle, Archive, ArrowLeft, Ban, BarChart3, BellRing, CalendarDays, CalendarPlus, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock3, Coffee, Download, History, LoaderCircle, LocateFixed, LogOut, Moon, Paperclip, Pencil, Plus, Radio, Send, Settings, Sun, TimerReset, WifiOff, X } from 'lucide-react';
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
import './queue.css';

const DAY = (value = new Date()) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const shiftDay = (date, amount) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + amount); return DAY(value); };
const time = (minutes) => { const normalized = ((minutes % 1440) + 1440) % 1440; return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`; };
const minutesFromTime = (value) => { const [hour, minute] = String(value || '00:00').split(':').map(Number); return Math.max(0, Math.min(1430, hour * 60 + minute)); };
const currentMinutes = (value = new Date()) => value.getHours() * 60 + value.getMinutes();
// Keep queue thumbnails in lockstep with Dashboard's cover resolution. In
// particular, never prefix an already-absolute Instagram CDN URL with the
// API origin (that produced an invalid URL), and use Cortex's cached cover
// route when a newly imported post has no usable CDN URL yet.
const cover = (task) => coverUrlForPost(task?.post);
const accountMention = (value) => { const clean = String(value || '').trim().replace(/^@/, ''); return clean ? `@${clean}` : ''; };
const locale = (language) => language === 'es' ? 'es-CR' : 'en-US';
const displayDate = (value, language) => new Date(`${value}T12:00:00`).toLocaleDateString(locale(language), { weekday: 'long', month: 'short', day: 'numeric' });
const displayTimestamp = (value, language) => new Date(value).toLocaleString(locale(language), { timeZone: 'America/Costa_Rica', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const DRAFT_KEY = 'sentient.queueDrafts.v2';
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
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
    productionQueue: 'Production Queue', dashboard: 'Dashboard', admin: 'Admin', coordinatorSchedule: 'Coordinator schedule', mySchedule: 'My production schedule', today: 'Today', submit: 'Submit', change: 'change', changes: 'changes', productionPool: 'Production pool', readyToSchedule: 'ready to schedule', visibleSchedule: 'The window shows 8 hours. Scroll to explore the full 24-hour day.', emptyPool: 'No requests are waiting in the pool.', myAssignedWork: 'My assigned work', upcomingProduction: 'Upcoming production', activeRequest: 'active request', activeRequests: 'active requests', noActiveAssignments: 'No active assignments', emptyAssignments: 'When a coordinator schedules work for you, it will appear here.', post: 'Post', scheduled: 'Scheduled', deadline: 'Deadline', scope: 'Scope', status: 'Status', noTags: 'No tags', designer: 'Designer', now: 'Now', centerNow: 'Center Now', loadingSchedule: 'Loading schedule…', tryAgain: 'Try again', queueAccess: 'Queue is available to every dashboard user.', rolePreview: 'Role preview', onlyEsteban: 'Only visible to Esteban.', activeRole: 'Active role', devFullAccess: 'Dev · full access', postDesigner: 'Post Designer', viralCoordinator: 'Viral Coordinator', salesRole: 'Sales', productionReports: 'Production reports', adminWorkspace: 'Admin workspace', loadingReport: 'Loading report…', inPool: 'In pool', inProgress: 'In progress', readyToClose: 'Ready to close', closed: 'Closed', cancelled: 'Cancelled', designerWorkload: 'Designer workload', workloadHelp: 'Active work, delivery health and actual production time.', allAssignedPosts: 'All assigned posts', assignedPostsCount: 'assigned posts', noAssignedPosts: 'No assigned posts yet.', openSettings: 'Open dashboard settings', startWork: 'Start work', markComplete: 'Mark complete', publishedLink: 'Published Instagram link', closeRequest: 'Close request', returnInProgress: 'Return to in progress', openPublished: 'Open published post', cancellationReason: 'Cancellation reason (optional)', cancelRequest: 'Cancel request', brief: 'Brief', notes: 'Notes', references: 'References', minutes: 'minutes', sourcePost: 'Source post', assignment: 'Assignment', recommendedAccounts: 'Recommended accounts', editRequest: 'Edit request', saveChanges: 'Save changes', cancel: 'Cancel', productionPoints: 'Production points', tags: 'Tags', referenceLinks: 'Reference links', oneLinkPerLine: 'One link per line', signIn: 'Sign in with Google', signingIn: 'Signing in…', signInHelp: 'Sign in with Google to open your production schedule.', allDesigners: 'All designers', allUsers: 'All users', noAccounts: 'No accounts yet', noRecommendedAccount: 'No recommended account', unsavedDrafts: 'Draft schedule changes are saved in this browser.', clearDrafts: 'Discard drafts', archive: 'Archive', liveQueue: 'Live Queue', noArchived: 'No cancelled requests.', extra: 'NEXT DAY', overdue: 'OVERDUE', atRisk: 'AT RISK', attachments: 'Files & references', uploadFiles: 'Upload files', noFiles: 'No files attached.', history: 'Activity history', noHistory: 'No activity yet.', resendSlack: 'Resend Slack DM', slackSent: 'Slack DM sent.', slackFailed: 'Slack DM failed. Check the user Slack ID and try again.', requestUpdated: 'Request updated.', scheduleSubmitted: 'Schedule submitted.', deliveryHealth: 'Delivery health', onTime: 'On-time rate', averageTime: 'Average actual time', completedJobs: 'Closed jobs', draftsSaved: 'Drafts saved', movedJobs: 'reflowed jobs', close: 'Close', filesUploaded: 'Files uploaded.', deadlineError: 'This request cannot fit before its deadline.', invalidDay: 'Requests can be scheduled on any day.', assignedView: 'Scheduler view', uploadFailed: 'Some files could not be uploaded.', sourceCaption: 'Source caption', cancelledReason: 'Cancellation reason', draftWarning: 'You have unsubmitted Queue changes.', movedAfterActive: 'Another post is already in progress. This request was moved after it and remains scheduled.', notQueueParticipant: 'Not a Queue participant',
    priority: 'Priority', priorityLow: 'Low', priorityMedium: 'Medium', priorityHigh: 'High', priorityUrgent: 'Urgent', priorityMix: 'Priority mix', highPriority: 'High priority', tentative: 'Pending submit', tentativeBy: 'Temporary placement by', liveConnected: 'Live', liveConnecting: 'Connecting', liveOffline: 'Reconnecting', sharedDrafts: 'Temporary changes are shared live with assigned designers.', draftSyncFailed: 'The temporary placement could not be shared. Queue was refreshed.', resizeBar: 'Resize production block', resizeLeft: 'from the left', resizeRight: 'from the right', adminOverview: 'Overview', userManagement: 'User Management', managedAccounts: 'Managed Sentient accounts', chooseSentientAccount: 'Choose Sentient account', assignAccount: 'Assign', removeAccount: 'Remove account', usersCount: 'users', loadingUsers: 'Loading users…', noUsers: 'No users available.', accountUpdateFailed: 'Could not update account ownership.',
    settings: 'Settings', accentColor: 'Accent color', customColor: 'Custom color', custom: 'Custom', theme: 'Theme', language: 'Language', signOut: 'Sign out', darkTheme: 'Dark', lightTheme: 'Light', signedInAs: 'Signed in as', adminSettings: 'Admin',
  },
  es: {
    productionQueue: 'Cola de producción', dashboard: 'Dashboard', admin: 'Admin', coordinatorSchedule: 'Agenda de coordinación', mySchedule: 'Mi agenda de producción', today: 'Hoy', submit: 'Enviar', change: 'cambio', changes: 'cambios', productionPool: 'Pool de producción', readyToSchedule: 'listos para programar', visibleSchedule: 'La ventana muestra 8 horas. Desplázate para explorar las 24 horas del día.', emptyPool: 'No hay requests esperando en el pool.', myAssignedWork: 'Mi trabajo asignado', upcomingProduction: 'Próxima producción', activeRequest: 'request activo', activeRequests: 'requests activos', noActiveAssignments: 'No tienes asignaciones activas', emptyAssignments: 'Cuando un coordinador programe trabajo para ti, aparecerá aquí.', post: 'Post', scheduled: 'Programado', deadline: 'Deadline', scope: 'Alcance', status: 'Estado', noTags: 'Sin tags', designer: 'Designer', now: 'Ahora', centerNow: 'Centrar ahora', loadingSchedule: 'Cargando agenda…', tryAgain: 'Intentar de nuevo', queueAccess: 'Queue está disponible para todos los usuarios del dashboard.', rolePreview: 'Vista de rol', onlyEsteban: 'Visible solo para Esteban.', activeRole: 'Rol activo', devFullAccess: 'Dev · acceso completo', postDesigner: 'Post Designer', viralCoordinator: 'Viral Coordinator', salesRole: 'Sales', productionReports: 'Reportes de producción', adminWorkspace: 'Espacio Admin', loadingReport: 'Cargando reporte…', inPool: 'En pool', inProgress: 'En progreso', readyToClose: 'Listo para cerrar', closed: 'Cerrado', cancelled: 'Cancelado', designerWorkload: 'Carga por designer', workloadHelp: 'Trabajo activo, salud de entrega y tiempo real de producción.', allAssignedPosts: 'Todos los posts asignados', assignedPostsCount: 'posts asignados', noAssignedPosts: 'Todavía no hay posts asignados.', openSettings: 'Abrir Settings del dashboard', startWork: 'Empezar trabajo', markComplete: 'Marcar como completado', publishedLink: 'Link publicado de Instagram', closeRequest: 'Cerrar request', returnInProgress: 'Volver a en progreso', openPublished: 'Abrir post publicado', cancellationReason: 'Motivo de cancelación (opcional)', cancelRequest: 'Cancelar request', brief: 'Brief', notes: 'Notas', references: 'Referencias', minutes: 'minutos', sourcePost: 'Post original', assignment: 'Asignación', recommendedAccounts: 'Cuentas recomendadas', editRequest: 'Editar request', saveChanges: 'Guardar cambios', cancel: 'Cancelar', productionPoints: 'Puntos de producción', tags: 'Tags', referenceLinks: 'Links de referencia', oneLinkPerLine: 'Un link por línea', signIn: 'Iniciar sesión', signingIn: 'Iniciando sesión…', signInHelp: 'Inicia sesión con Google para abrir tu agenda de producción.', allDesigners: 'Todos los designers', allUsers: 'Todos los usuarios', noAccounts: 'Sin cuentas todavía', noRecommendedAccount: 'Sin cuenta recomendada', unsavedDrafts: 'Los cambios del scheduler se guardan en este navegador.', clearDrafts: 'Descartar cambios', archive: 'Archivo', liveQueue: 'Queue activo', noArchived: 'No hay requests cancelados.', extra: 'DÍA SIGUIENTE', overdue: 'VENCIDO', atRisk: 'EN RIESGO', attachments: 'Archivos y referencias', uploadFiles: 'Subir archivos', noFiles: 'No hay archivos adjuntos.', history: 'Historial de actividad', noHistory: 'Todavía no hay actividad.', resendSlack: 'Reenviar DM de Slack', slackSent: 'DM de Slack enviado.', slackFailed: 'Falló el DM de Slack. Revisa el Slack ID del usuario e intenta de nuevo.', requestUpdated: 'Request actualizado.', scheduleSubmitted: 'Scheduler enviado.', deliveryHealth: 'Salud de entrega', onTime: 'Entregas a tiempo', averageTime: 'Tiempo real promedio', completedJobs: 'Trabajos cerrados', draftsSaved: 'Cambios guardados', movedJobs: 'trabajos reacomodados', close: 'Cerrar', filesUploaded: 'Archivos subidos.', deadlineError: 'Este request no cabe antes de su deadline.', invalidDay: 'Los requests pueden programarse en cualquier día.', assignedView: 'Vista del scheduler', uploadFailed: 'Algunos archivos no pudieron subirse.', sourceCaption: 'Caption original', cancelledReason: 'Motivo de cancelación', draftWarning: 'Tienes cambios de Queue sin enviar.', movedAfterActive: 'Ya hay otro post en progreso. Este request se movió después y permanece programado.', notQueueParticipant: 'No participa en Queue',
    priority: 'Prioridad', priorityLow: 'Baja', priorityMedium: 'Media', priorityHigh: 'Alta', priorityUrgent: 'Urgente', priorityMix: 'Niveles de prioridad', highPriority: 'Prioridad alta', tentative: 'Pendiente de enviar', tentativeBy: 'Ubicación temporal por', liveConnected: 'En vivo', liveConnecting: 'Conectando', liveOffline: 'Reconectando', sharedDrafts: 'Los cambios temporales se comparten en vivo con los designers asignados.', draftSyncFailed: 'No se pudo compartir la ubicación temporal. Queue fue actualizado.', resizeBar: 'Redimensionar bloque de producción', resizeLeft: 'desde la izquierda', resizeRight: 'desde la derecha', adminOverview: 'Resumen', userManagement: 'Gestión de usuarios', managedAccounts: 'Cuentas Sentient administradas', chooseSentientAccount: 'Elegir cuenta de Sentient', assignAccount: 'Asignar', removeAccount: 'Quitar cuenta', usersCount: 'usuarios', loadingUsers: 'Cargando usuarios…', noUsers: 'No hay usuarios disponibles.', accountUpdateFailed: 'No se pudo actualizar la cuenta.',
    settings: 'Ajustes', accentColor: 'Color de acento', customColor: 'Color personalizado', custom: 'Personalizado', theme: 'Tema', language: 'Idioma', signOut: 'Cerrar sesión', darkTheme: 'Oscuro', lightTheme: 'Claro', signedInAs: 'Sesión iniciada como', adminSettings: 'Admin',
  },
};

COPY.en.traineeRole = 'Trainee';
COPY.es.traineeRole = 'Trainee';

COPY.en.returnToPool = 'Return to pool';
COPY.en.poolDropHint = 'Drop a scheduled request here to return it to the pool.';
COPY.en.returnedToPool = 'Request returned to the pool.';
COPY.es.returnToPool = 'Devolver al pool';
COPY.es.poolDropHint = 'Suelta aquí un request programado para devolverlo al pool.';
COPY.es.returnedToPool = 'Request devuelto al pool.';
Object.assign(COPY.en, {
  tickets: 'Requests', ticketInbox: 'Approval inbox', myRequests: 'My requests', ticketsPending: 'Pending', ticketsApproved: 'Approved', ticketsRejected: 'Rejected', approve: 'Approve', reject: 'Reject',
  pick: 'Pick', pickTitle: 'Pick a request', pickHelp: 'Choose a request from the production pool.', hotPickHelp: 'There are no regular pool requests. Choose the highest-rate HOT post.', nextRequest: 'Next', assignRequest: 'Assign', noPickRequests: 'There are no requests available in the pool or HOT list.', pickedRequest: 'Request assigned to your schedule.', pickPriority: 'Priority', hotRate: 'HOT rate',
  meeting: 'Meeting', break: 'Break', promo: 'Promo', focus: 'Focus time', other: 'Other', addTime: 'Add personal time', blockTitle: 'Title',
  startTime: 'Start time', duration: 'Duration', noteOptional: 'Note (optional)', requestApproval: 'Request approval', pendingApproval: 'Pending approval',
  approved: 'Approved', rejected: 'Rejected', ppRevision: 'PP revision', cancellationRequest: 'Cancellation', requestPPChange: 'Request PP change',
  requestCancellation: 'Request cancellation', requestMove: 'Request move', moveRequest: 'Move request', moveTo: 'Move to', moveHelp: 'Choose an earlier or later time for this block.', requestedPP: 'Requested PP', requestReason: 'Reason (optional)', sendRequest: 'Send request',
  ticketCreated: 'Request sent for approval.', ticketReviewed: 'Request reviewed.', noPendingTickets: 'No pending requests.', noApprovedTickets: 'No approved requests.', noRejectedTickets: 'No rejected requests.',
  rightClickHint: 'Right-click your scheduler row to add meetings, breaks, promos, or focus time.', personalTime: 'Personal time',
  managedAccounts: 'Managed Sentient accounts', manageAccounts: 'Manage accounts', accountSetupTitle: 'Set up your managed accounts', accountSetupHelp: 'Choose every Sentient account you can create for. Coordinators can then recommend the right account when they assign work.', saveManagedAccounts: 'Save my accounts', managedAccountsSaved: 'Managed accounts saved.', accountRequestTitle: 'Need another account?', accountRequestHelp: 'Request a missing account or one that has not been added to Sentient Dash yet. Admins and VCs will review it in Queue.', requestedAccounts: 'Account handles', accountRequestPlaceholder: 'e.g. @newaccount, @anotheraccount', accountAccessRequest: 'Account access request', accountRequestSent: 'Account request sent for approval.', accountRequestReason: 'Note for coordinators (optional)',
  howQueueWorks: 'How Queue works', startGuide: 'Start guided tour', guideWelcome: 'Welcome to Queue', guideLanguage: 'Choose your language first. The tour and Queue will use this language.', guideEnglish: 'English', guideSpanish: 'Español', guideContinue: 'Continue', guideSkip: 'Skip tour', guideBack: 'Back', guideNext: 'Next', guideFinish: 'Finish', guideStep: 'Step', guideSettingsTitle: 'Personalize Queue', guideSettingsBody: 'Change language, theme, accent color, or reopen your managed-account setup here.', guideRequestsTitle: 'Requests & approvals', guideRequestsBody: 'Open this inbox to review your requests. VCs and admins approve account access, time blocks, PP changes, moves, and cancellations here.', guideScheduleTitle: 'Your production day', guideScheduleBody: 'Use the date controls to review any day. The scheduler shows every planned block and the current time.', guidePoolTitle: 'The production pool', guidePoolBody: 'VCs and admins drag work from this pool onto a designer’s row. A draft is shared live before it is submitted.', guidePlannerTitle: 'Schedule blocks', guidePlannerBody: 'Open a block for its full brief, files, references, activity history, and the actions available to your role.', guideSubmitTitle: 'Submit planned work', guideSubmitBody: 'For coordinators, Submit confirms drafts and sends the assignment notifications. Designers see temporary placements live before then.', guideRoleTitle: 'Your work flow', guideRoleBody: 'Open an assigned block to start it, mark it complete, then close it with the published Instagram link.',
  resetQueue: 'Reset Queue', resetQueueTitle: 'Reset all Queue data', resetQueueHelp: 'This permanently deletes every Queue assignment, pool request, draft, ticket, attachment, managed-account selection, and Queue event. Users, roles, accounts, Dashboard posts, Tracker, and Settings are preserved.', resetQueueConfirm: 'Type RESET_QUEUE to continue', resetQueueAction: 'Delete Queue data', queueResetDone: 'Queue was reset. All operational Queue data was removed.',
});
Object.assign(COPY.es, {
  tickets: 'Solicitudes', ticketInbox: 'Bandeja de aprobación', myRequests: 'Mis solicitudes', ticketsPending: 'Pendientes', ticketsApproved: 'Aprobadas', ticketsRejected: 'Rechazadas', approve: 'Aprobar', reject: 'Rechazar',
  pick: 'Pick', pickTitle: 'Elegir un request', pickHelp: 'Elige un request del pool de producción.', hotPickHelp: 'No hay requests regulares en el pool. Elige el post HOT con mayor rate.', nextRequest: 'Siguiente', assignRequest: 'Asignar', noPickRequests: 'No hay requests disponibles en el pool ni en HOT.', pickedRequest: 'Request asignado a tu agenda.', pickPriority: 'Prioridad', hotRate: 'Rate HOT',
  meeting: 'Meeting', break: 'Break', promo: 'Promo', focus: 'Tiempo de enfoque', other: 'Otro', addTime: 'Agregar tiempo personal', blockTitle: 'Título',
  startTime: 'Hora de inicio', duration: 'Duración', noteOptional: 'Nota (opcional)', requestApproval: 'Solicitar aprobación', pendingApproval: 'Pendiente de aprobación',
  approved: 'Aprobado', rejected: 'Rechazado', ppRevision: 'Revisión de PPs', cancellationRequest: 'Cancelación', requestPPChange: 'Solicitar cambio de PPs',
  requestCancellation: 'Solicitar cancelación', requestMove: 'Solicitar mover', moveRequest: 'Solicitud de movimiento', moveTo: 'Mover a', moveHelp: 'Elige una hora más temprana o más tarde para este bloque.', requestedPP: 'PPs solicitados', requestReason: 'Motivo (opcional)', sendRequest: 'Enviar solicitud',
  ticketCreated: 'Solicitud enviada para aprobación.', ticketReviewed: 'Solicitud revisada.', noPendingTickets: 'No hay solicitudes pendientes.', noApprovedTickets: 'No hay solicitudes aprobadas.', noRejectedTickets: 'No hay solicitudes rechazadas.',
  rightClickHint: 'Haz click derecho en tu fila para agregar meetings, breaks, promos o tiempo de enfoque.', personalTime: 'Tiempo personal',
  managedAccounts: 'Cuentas Sentient que manejas', manageAccounts: 'Gestionar cuentas', accountSetupTitle: 'Configura las cuentas que manejas', accountSetupHelp: 'Elige todas las cuentas Sentient para las que puedes crear. Así los coordinadores podrán recomendar la cuenta correcta al asignarte trabajo.', saveManagedAccounts: 'Guardar mis cuentas', managedAccountsSaved: 'Cuentas administradas guardadas.', accountRequestTitle: '¿Necesitas otra cuenta?', accountRequestHelp: 'Solicita una cuenta que falte o que aún no se haya agregado a Sentient Dash. Los admins y VCs la revisarán en Queue.', requestedAccounts: 'Handles de cuentas', accountRequestPlaceholder: 'ej. @nuevacuenta, @otracuenta', accountAccessRequest: 'Solicitud de acceso a cuenta', accountRequestSent: 'Solicitud de cuenta enviada para aprobación.', accountRequestReason: 'Nota para coordinadores (opcional)',
  howQueueWorks: 'Cómo funciona Queue', startGuide: 'Iniciar guía', guideWelcome: 'Bienvenido a Queue', guideLanguage: 'Primero elige tu idioma. La guía y Queue usarán este idioma.', guideEnglish: 'English', guideSpanish: 'Español', guideContinue: 'Continuar', guideSkip: 'Omitir guía', guideBack: 'Atrás', guideNext: 'Siguiente', guideFinish: 'Finalizar', guideStep: 'Paso', guideSettingsTitle: 'Personaliza Queue', guideSettingsBody: 'Cambia el idioma, tema, color de acento o vuelve a abrir la configuración de tus cuentas aquí.', guideRequestsTitle: 'Solicitudes y aprobaciones', guideRequestsBody: 'Abre esta bandeja para revisar tus solicitudes. VCs y admins aprueban aquí accesos a cuentas, bloques de tiempo, cambios de PP, movimientos y cancelaciones.', guideScheduleTitle: 'Tu día de producción', guideScheduleBody: 'Usa los controles de fecha para revisar cualquier día. El scheduler muestra cada bloque planeado y la hora actual.', guidePoolTitle: 'El pool de producción', guidePoolBody: 'Los VCs y admins arrastran trabajo desde este pool a la fila de un designer. Un borrador se comparte en vivo antes de enviarse.', guidePlannerTitle: 'Bloques del scheduler', guidePlannerBody: 'Abre un bloque para ver su brief, archivos, referencias, historial y las acciones disponibles para tu rol.', guideSubmitTitle: 'Enviar trabajo planeado', guideSubmitBody: 'Para coordinadores, Enviar confirma borradores y manda las notificaciones. Los designers ven las ubicaciones temporales en vivo antes de eso.', guideRoleTitle: 'Tu flujo de trabajo', guideRoleBody: 'Abre un bloque asignado para empezarlo, marcarlo como completado y cerrarlo con el link publicado de Instagram.',
  resetQueue: 'Reiniciar Queue', resetQueueTitle: 'Reiniciar toda la data de Queue', resetQueueHelp: 'Esto elimina permanentemente todas las asignaciones, requests del pool, borradores, tickets, archivos adjuntos, selecciones de cuentas y eventos de Queue. Conserva usuarios, roles, cuentas, posts del Dashboard, Tracker y Settings.', resetQueueConfirm: 'Escribe RESET_QUEUE para continuar', resetQueueAction: 'Eliminar data de Queue', queueResetDone: 'Queue fue reiniciado. Toda la data operativa fue eliminada.',
});

Object.assign(COPY.en, {
  createPost: 'Create Post', createPostTitle: 'Create a Queue post', createPostHelp: 'Start a production request without a dashboard post.', targetAccount: 'Publishing account', accountToSelect: 'Account selected when assigned', chooseAccountLater: 'Choose later (optional)', postTitle: 'Post title', postTitlePlaceholder: 'e.g. AI tools carousel for next week', postType: 'Post type', postTypeImage: 'Image', postTypeCarousel: 'Carousel', postTypeReel: 'Reel', postTypePromo: 'Promo', postTypeStory: 'Story', postTypeOther: 'Other', titleRequired: 'Add a title for this post.', accountRequired: 'Choose a Sentient account.', postCreated: 'Post created in the production pool.',
});
Object.assign(COPY.es, {
  createPost: 'Crear post', createPostTitle: 'Crear un post en Queue', createPostHelp: 'Inicia un request de producción sin un post del dashboard.', targetAccount: 'Cuenta de publicación', accountToSelect: 'Cuenta se elige al asignar', chooseAccountLater: 'Elegir después (opcional)', postTitle: 'Título del post', postTitlePlaceholder: 'ej. Carrusel de herramientas de IA para la próxima semana', postType: 'Tipo de post', postTypeImage: 'Imagen', postTypeCarousel: 'Carrusel', postTypeReel: 'Reel', postTypePromo: 'Promo', postTypeStory: 'Story', postTypeOther: 'Otro', titleRequired: 'Agrega un título para este post.', accountRequired: 'Elige una cuenta de Sentient.', postCreated: 'Post creado en el pool de producción.',
});

const QueuePreferencesContext = createContext({ language: 'en', t: (key) => key });
const useQueuePreferences = () => useContext(QueuePreferencesContext);
const statusCopy = (status, t, isDraft = false) => isDraft ? t('tentative') : ({ pool: t('inPool'), scheduled: t('scheduled'), in_progress: t('inProgress'), completed: t('readyToClose'), closed: t('closed'), cancelled: t('cancelled') }[status] || status);
const priorityCopy = (priority, t) => ({ low: t('priorityLow'), medium: t('priorityMedium'), high: t('priorityHigh'), urgent: t('priorityUrgent') }[priority] || t('priorityMedium'));
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

/* One Settings entry point instead of a bare prefs strip plus a separate
   avatar/sign-out button: accent, theme and language live together with the
   account info, and (for admins) the same account-assignment tool that used
   to only be reachable inside Admin Tools -> User Management. Meant to be
   the same shape as the Settings button on Dashboard/Tracker/Insights. */
function QueueSettings({ isAdmin, isDev, userEmail, onManageAccounts, onStartGuide, onResetQueue, onSignOut }) {
  const { t, language, setLanguage, theme, setTheme } = useQueuePreferences();
  const { accent, setAccent } = usePrefs();
  const [open, setOpen] = useState(false);
  return <div className="queue-settings">
    <button type="button" className={`queue-settings-trigger${open ? ' is-active' : ''}`} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={t('settings')} title={t('settings')}><Settings size={16} /></button>
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

function DevRolePreview({ isDev }) {
  const { t } = useQueuePreferences();
  const [open, setOpen] = useState(false);
  const active = window.sessionStorage.getItem('sentient.queueRolePreview') || '';
  if (!isDev) return null;
  const label = { sales: 'Sales', pd: t('postDesigner'), vc: t('viralCoordinator'), trainee: t('traineeRole'), admin: t('admin') }[active] || 'Dev';
  const choose = (event) => { const role = event.target.value; if (role) window.sessionStorage.setItem('sentient.queueRolePreview', role); else window.sessionStorage.removeItem('sentient.queueRolePreview'); window.location.reload(); };
  return <div className="dev-role-preview"><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}><span>DEV</span>{label}</button>{open ? <div className="dev-role-preview-panel"><strong>{t('rolePreview')}</strong><p>{t('onlyEsteban')}</p><label>{t('activeRole')}<select value={active} onChange={choose}><option value="">{t('devFullAccess')}</option><option value="sales">Sales</option><option value="pd">{t('postDesigner')}</option><option value="vc">{t('viralCoordinator')}</option><option value="trainee">{t('traineeRole')}</option><option value="admin">{t('admin')}</option></select></label></div> : null}</div>;
}

function PriorityBadge({ priority = 'medium' }) {
  const { t } = useQueuePreferences();
  return <span className={`queue-priority-badge priority-${priority}`}>{priorityCopy(priority, t)}</span>;
}

function TaskBlock({ task, editable, onOpen, onResizeStart, accountAvatars = {} }) {
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
  return <button type="button" draggable={editable && task.status === 'scheduled'} className={`scheduler-block state-${task.status} priority-${task.priority || 'medium'}${hotClass(task)}${task.isDraft ? ' is-draft' : ''}${extra ? ' is-extra' : ''}${pendingTickets.length ? ' has-pending-ticket' : ''}`} style={{ left: `${(left / QUEUE_DAY_END) * 100}%`, width: `${(width / QUEUE_DAY_END) * 100}%` }} onDragStart={(event) => { activeQueueDragId = task.id; event.dataTransfer.setData('queue-task', String(task.id)); }} onDragEnd={() => { activeQueueDragId = null; }} onClick={(event) => { if (event.target.closest('.scheduler-resize-handle')) return; onOpen(task); }} title={`${accountMention(task.post.account) || task.post.title || t('post')} · ${priorityCopy(task.priority, t)} · ${task.productionPoints} PP · ${statusCopy(task.status, t, task.isDraft)}${pendingTicketLabel ? ` · ${pendingTicketLabel}` : ''}`}>
    {cover(task) ? <img src={cover(task)} alt="" /> : null}<span className="scheduler-block-copy"><b>{task.post.title || accountMention(task.post.account) || t('post')}</b><small>{task.post.title && task.post.account ? `${accountMention(task.post.account)} · ` : ''}{task.isDraft ? `${t('tentative')} · ` : ''}{priorityCopy(task.priority, t)} · {task.productionPoints} PP · {time(task.scheduledStartMinutes ?? QUEUE_DAY_START)}</small></span><span className={`scheduler-priority-mark priority-${task.priority || 'medium'}`}>{priorityCopy(task.priority, t)}</span>{pendingTickets.length ? <span className="scheduler-ticket-marker" title={pendingTicketLabel}><ClipboardList size={11} /><b>{pendingTickets.length}</b></span> : null}{isHotTask(task) ? <span className="queue-hot-badge">🔥 {hotText(task)}</span> : null}{task.isDraft ? <span className="scheduler-draft-badge">{t('tentative')}</span> : null}{extra ? <span className="scheduler-extra">{t('extra')}</span> : null}{task.recommendedAccounts?.length ? <span className="scheduler-account-badges">{task.recommendedAccounts.map((account) => <i key={account} title={`@${account}`}><span className="scheduler-account-avatar">{accountImage(account) ? <img src={accountImage(account)} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} /> : `@${account.slice(0, 1)}`}</span><b>@{account}</b></i>)}</span> : null}{canResize ? <><span className="scheduler-resize-handle scheduler-resize-handle-left" role="separator" aria-label={`${t('resizeBar')} ${t('resizeLeft')}`} onPointerDown={(event) => onResizeStart(event, task, 'left')} /><span className="scheduler-resize-handle scheduler-resize-handle-right" role="separator" aria-label={`${t('resizeBar')} ${t('resizeRight')}`} onPointerDown={(event) => onResizeStart(event, task, 'right')} /></> : null}
  </button>;
}

function TimeBlock({ block }) {
  const { t } = useQueuePreferences();
  const Icon = ({ meeting: CalendarDays, break: Coffee, promo: TimerReset, focus: Clock3, other: CalendarPlus }[block.category] || CalendarPlus);
  const start = Number(block.scheduledStartMinutes || 0);
  const duration = Math.max(10, Number(block.durationMinutes || 10));
  return <div className={`scheduler-time-block category-${block.category || 'other'} status-${block.status}`} style={{ left: `${(start / QUEUE_DAY_END) * 100}%`, width: `${(duration / QUEUE_DAY_END) * 100}%` }} title={`${block.title} · ${time(start)} · ${duration} min · ${block.status === 'pending' ? t('pendingApproval') : t('approved')}`}><Icon size={13} /><span><b>{block.title || t(block.category || 'other')}</b><small>{time(start)} · {duration} min</small></span>{block.status === 'pending' ? <i>{t('pendingApproval')}</i> : null}</div>;
}

function TimeBlockForm({ form, setForm, busy, onClose, onSubmit }) {
  const { t, language } = useQueuePreferences();
  if (!form) return null;
  const valid = form.durationMinutes >= 10 && form.durationMinutes % 10 === 0 && form.startMinutes + form.durationMinutes <= QUEUE_DAY_END;
  return <><button type="button" className="scheduler-context-backdrop" aria-label={t('close')} onClick={onClose} /><form className="scheduler-time-form" style={{ left: form.x, top: form.y }} onSubmit={(event) => { event.preventDefault(); if (valid) onSubmit(); }}><header><div><p className="scheduler-eyebrow">{t('personalTime')}</p><h3>{t('addTime')}</h3><small>{displayDate(form.scheduledDate, language)}</small></div><button type="button" onClick={onClose} aria-label={t('close')}><X size={14} /></button></header><div className="scheduler-time-form-grid"><label>{t('meeting')} / {t('break')}<select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}><option value="meeting">{t('meeting')}</option><option value="break">{t('break')}</option><option value="promo">{t('promo')}</option><option value="focus">{t('focus')}</option><option value="other">{t('other')}</option></select></label><label>{t('startTime')}<input type="time" step="600" value={time(form.startMinutes)} onChange={(event) => setForm((current) => ({ ...current, startMinutes: Math.round(minutesFromTime(event.target.value) / 10) * 10 }))} /></label><label>{t('duration')}<input type="number" min="10" max={Math.max(10, QUEUE_DAY_END - form.startMinutes)} step="10" value={form.durationMinutes} onChange={(event) => setForm((current) => ({ ...current, durationMinutes: Number(event.target.value) }))} /></label><label>{t('blockTitle')}<input value={form.title} maxLength="80" placeholder={t(form.category)} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label><label className="is-wide">{t('noteOptional')}<textarea value={form.note} maxLength="500" onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></label></div><button type="submit" className="scheduler-primary" disabled={busy || !valid}>{busy ? <LoaderCircle className="queue-spin" size={14} /> : <CalendarPlus size={14} />}{t('requestApproval')}</button></form></>;
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
  ], [coordinator]);
  const active = step >= 0 ? steps[step] : null;
  useEffect(() => {
    if (!active) { setRect(null); return undefined; }
    const update = () => {
      const target = document.querySelector(active.selector);
      if (!target) { setRect(null); return; }
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
  // The spotlight itself supplies the outside dimming via its huge shadow.
  // Do not add the welcome screen's full-page dimmer here: it would sit over
  // the highlighted control and make the exact thing being explained unreadable.
  return <div className="queue-guide-layer" role="presentation">{rect ? <span className="queue-guide-highlight" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} /> : null}<section className="queue-guide-card" role="dialog" aria-modal="true" aria-live="polite" style={{ left: cardLeft, top: cardTop, width: cardWidth }}><p className="scheduler-eyebrow">{t('guideStep')} {step + 1} / {steps.length}</p><h2>{t(active?.title)}</h2><p>{t(active?.body)}</p>{active?.extraBody ? <p>{t(active.extraBody)}</p> : null}<footer><button type="button" className="queue-guide-skip" onClick={onComplete}>{t('guideSkip')}</button><div>{step > 0 ? <button type="button" className="scheduler-secondary" onClick={() => setStep(step - 1)}>{t('guideBack')}</button> : null}<button type="button" className="scheduler-primary" onClick={next}>{step >= steps.length - 1 ? t('guideFinish') : t('guideNext')}</button></div></footer></section></div>;
}

function QueueResetModal({ onClose, onReset }) {
  const { t } = useQueuePreferences();
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    try { await onReset(confirmation); onClose(); }
    catch (err) { setError(err.message || 'Queue reset failed.'); }
    finally { setBusy(false); }
  };
  return <div className="queue-create-backdrop" role="presentation"><form className="queue-create-modal queue-reset-modal" onSubmit={submit} aria-labelledby="queue-reset-title"><header className="queue-create-head"><div><p className="scheduler-eyebrow">Admin</p><h2 id="queue-reset-title">{t('resetQueueTitle')}</h2><small>{t('resetQueueHelp')}</small></div><button type="button" onClick={onClose} aria-label={t('close')} disabled={busy}><X size={16} /></button></header><label className="queue-create-note"><span>{t('resetQueueConfirm')}</span><input value={confirmation} autoFocus onChange={(event) => setConfirmation(event.target.value)} placeholder="RESET_QUEUE" /></label>{error ? <p className="queue-create-error" role="alert">{error}</p> : null}<footer className="queue-create-actions"><button type="button" className="scheduler-secondary" onClick={onClose} disabled={busy}>{t('cancel')}</button><button type="submit" className="scheduler-danger" disabled={busy || confirmation !== 'RESET_QUEUE'}>{busy ? <LoaderCircle className="queue-spin" size={14} /> : <TimerReset size={14} />}{t('resetQueueAction')}</button></footer></form></div>;
}

function CreatePostModal({ tags = [], onClose, onCreated }) {
  const { t } = useQueuePreferences();
  const [form, setForm] = useState({ title: '', postType: 'Image', productionPoints: 3, priority: 'medium', brief: '', notes: '', references: '' });
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
        body.append('priority', form.priority);
        body.append('brief', form.brief);
        body.append('notes', form.notes);
        body.append('references', JSON.stringify(form.references.split(/\n|,/).map((item) => item.trim()).filter(Boolean)));
        body.append('tags', [...tagSet].join(','));
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
      <div className="queue-create-grid">
        <label className="is-wide"><span>{t('postTitle')} <i>required</i></span><input value={form.title} maxLength="160" autoFocus onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder={t('postTitlePlaceholder')} /></label>
        <label><span>{t('postType')}</span><select value={form.postType} onChange={(event) => setForm((current) => ({ ...current, postType: event.target.value }))}>{typeOptions.map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</select></label>
        <label><span>{t('productionPoints')} <i>required</i></span><input type="number" min="1" step="1" value={form.productionPoints} onChange={(event) => setForm((current) => ({ ...current, productionPoints: event.target.value }))} /></label>
        <label><span>{t('priority')} <i>required</i></span><select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{priorityCopy(priority, t)}</option>)}</select></label>
      </div>
      <label className="queue-create-note"><span>{t('brief')} <i>optional</i></span><textarea value={form.brief} onChange={(event) => setForm((current) => ({ ...current, brief: event.target.value }))} rows={3} /></label>
      <label className="queue-create-note"><span>{t('notes')} <i>optional</i></span><textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={2} /></label>
      <label className="queue-create-note"><span>{t('referenceLinks')} <i>optional</i></span><textarea value={form.references} onChange={(event) => setForm((current) => ({ ...current, references: event.target.value }))} placeholder={t('oneLinkPerLine')} rows={2} /></label>
      <label className="queue-create-files"><span>{t('attachments')} <i>optional · up to 20 MB each</i></span><input type="file" multiple onChange={(event) => setAttachmentFiles([...event.target.files])} />{attachmentFiles.length ? <small>{attachmentFiles.map((file) => file.name).join(' · ')}</small> : null}</label>
      {tagOptions.length ? <fieldset className="queue-create-fieldset"><legend>{t('tags')} <i>optional</i></legend><div className="queue-tag-picker">{tagOptions.map((tag) => <button type="button" key={tag} className={tagSet.has(tag) ? 'is-on' : ''} onClick={() => toggleTag(tag)}>{tag}</button>)}</div></fieldset> : null}
      {error ? <p className="queue-create-error" role="alert">{error}</p> : null}
      <footer className="queue-create-actions"><button type="button" className="scheduler-secondary" onClick={onClose} disabled={saving}>{t('cancel')}</button><button type="submit" className="scheduler-primary" disabled={saving}>{saving ? <LoaderCircle className="queue-spin" size={14} /> : <Plus size={14} />}{t('createPost')}</button></footer>
    </form>
  </div>;
}

function PoolCard({ task, onOpen }) {
  const { t } = useQueuePreferences();
  return <article className={`queue-pool-card priority-${task.priority || 'medium'}${hotClass(task)}${task.isDraft ? ' is-draft' : ''}`} draggable onDragStart={(event) => { activeQueueDragId = task.id; event.dataTransfer.setData('queue-task', String(task.id)); }} onDragEnd={() => { activeQueueDragId = null; }}><button type="button" onClick={() => onOpen(task)}>{cover(task) ? <img src={cover(task)} alt="" /> : <span className="queue-pool-empty">@</span>}<span><b>{task.post.title || accountMention(task.post.account) || t('post')}</b><small>{task.post.title && task.post.account ? `${accountMention(task.post.account)} · ` : task.post.account ? `${accountMention(task.post.account)} · ` : `${t('accountToSelect')} · `}{task.productionPoints} PP · {task.durationMinutes} min</small>{task.isDraft ? <em>{t('returnToPool')}</em> : null}</span><span className="queue-pool-card-badges"><PriorityBadge priority={task.priority} />{isHotTask(task) ? <i className="queue-hot-badge">🔥 {hotText(task)}</i> : null}</span></button><div>{task.tags?.filter((tag) => tag !== 'hot').map((tag) => <i key={tag}>{tag}</i>)}</div></article>;
}

function DesignerAssignments({ tasks, onOpen }) {
  const { t, language } = useQueuePreferences();
  return <section className="designer-assignments"><header><div><p className="scheduler-eyebrow">{t('myAssignedWork')}</p><h2>{t('upcomingProduction')}</h2></div><small>{tasks.length} {tasks.length === 1 ? t('activeRequest') : t('activeRequests')}</small></header>{tasks.length ? <div className="designer-assignment-table" role="table"><div className="designer-assignment-head" role="row"><span>{t('post')}</span><span>{t('scheduled')}</span><span>{t('priority')}</span><span>{t('scope')}</span><span>{t('status')}</span></div>{tasks.map((task) => <button type="button" role="row" key={task.id} className={`designer-assignment-row state-${task.status} priority-${task.priority || 'medium'}${hotClass(task)}${task.isDraft ? ' is-draft' : ''}`} onClick={() => onOpen(task)}><span className="designer-assignment-post">{cover(task) ? <img src={cover(task)} alt="" /> : <span className="designer-assignment-empty">@</span>}<span><b>{task.post.title || accountMention(task.post.account) || t('post')}</b><small>{task.post.account ? accountMention(task.post.account) : t('accountToSelect')} · {task.brief || task.post.caption || t('post')}</small></span></span><span className="designer-assignment-time"><b>{displayDate(task.scheduledDate, language)}</b><small>{time(task.scheduledStartMinutes ?? QUEUE_DAY_START)} · {task.durationMinutes} {t('minutes')}</small></span><span className="designer-assignment-priority"><PriorityBadge priority={task.priority} />{isHotTask(task) ? <i className="queue-hot-badge">🔥 {hotText(task)}</i> : null}</span><span className="designer-assignment-pp"><b>{task.productionPoints} PP</b><small>{task.tags?.filter((tag) => tag !== 'hot').slice(0, 2).join(' · ') || t('noTags')}</small></span><span className="designer-assignment-status"><i>{statusCopy(task.status, t, task.isDraft)}</i>{task.isDraft ? <small>{t('tentativeBy')} {displayName(task.draftCoordinatorEmail)}</small> : null}</span></button>)}</div> : <div className="designer-assignments-empty"><CalendarDays size={18} /><strong>{t('noActiveAssignments')}</strong><span>{t('emptyAssignments')}</span></div>}</section>;
}

function AdminAssignmentTable({ tasks, onOpen, headingKey = 'allAssignedPosts', countKey = 'assignedPostsCount' }) {
  const { t, language } = useQueuePreferences();
  return <section className="queue-admin-assignments"><header><div><p className="scheduler-eyebrow">{t(headingKey)}</p><h3>{tasks.length} {t(countKey)}</h3></div></header>{tasks.length ? <div className="queue-admin-assignment-table" role="table"><div className="queue-admin-assignment-head" role="row"><span>{t('post')}</span><span>{t('designer')}</span><span>{t('scheduled')}</span><span>{t('priority')}</span><span>{t('productionPoints')}</span><span>{t('status')}</span></div>{tasks.map((task) => <button type="button" role="row" key={task.id} className={`queue-admin-assignment-row state-${task.status} priority-${task.priority || 'medium'}${hotClass(task)}${task.isDraft ? ' is-draft' : ''}`} onClick={() => onOpen(task)}><span className="queue-admin-assignment-post">{cover(task) ? <img src={cover(task)} alt="" /> : <span className="queue-admin-assignment-empty">@</span>}<span><b>{task.post.title || accountMention(task.post.account) || t('post')}</b><small>{task.post.account ? accountMention(task.post.account) : t('accountToSelect')} · {task.brief || task.post.caption || t('post')}</small>{task.recommendedAccounts?.length ? <em>{task.recommendedAccounts.map((account) => `@${account}`).join(' · ')}</em> : null}{isHotTask(task) ? <i className="queue-hot-badge">🔥 {hotText(task)}</i> : null}</span></span><span className="queue-admin-assignment-designer"><b>{task.designerEmail ? displayName(task.designerEmail) : '—'}</b><small>{task.designerEmail || ''}</small></span><span className="queue-admin-assignment-time"><b>{task.scheduledDate ? displayDate(task.scheduledDate, language) : '—'}</b><small>{task.scheduledStartMinutes == null ? '—' : `${time(task.scheduledStartMinutes)} · ${task.durationMinutes} ${t('minutes')}`}</small></span><span className="queue-admin-assignment-priority"><PriorityBadge priority={task.priority} /></span><span className="queue-admin-assignment-pp"><b>{task.productionPoints} PP</b><small>{task.tags?.filter((tag) => tag !== 'hot').slice(0, 2).join(' · ') || t('noTags')}</small></span><span className="queue-admin-assignment-status"><i>{statusCopy(task.status, t, task.isDraft)}</i></span></button>)}</div> : <p className="queue-admin-assignment-empty-state">{t('noAssignedPosts')}</p>}</section>;
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
  const ticketTitle = (ticket) => ticket.type === 'account_access' ? t('accountAccessRequest') : ticket.type === 'move' ? t('moveRequest') : ticket.type === 'time_block' ? (ticket.title || t(ticket.category || 'other')) : ticket.type === 'pp_revision' ? t('ppRevision') : t('cancellationRequest');
  const ticketMeta = (ticket) => {
    if (ticket.type === 'account_access') return (ticket.requestedAccounts || []).map((account) => `@${account}`).join(' · ') || t('noAccounts');
    if (ticket.type === 'move') {
      const account = ticket.request?.post?.account ? `@${ticket.request.post.account}` : t('post');
      return `${account} · ${ticket.scheduledDate || '—'} · ${time(ticket.scheduledStartMinutes ?? 0)}`;
    }
    if (ticket.type === 'time_block') return `${displayDate(ticket.scheduledDate, language)} · ${time(ticket.scheduledStartMinutes)} · ${ticket.durationMinutes} min`;
    const account = ticket.request?.post?.account ? `@${ticket.request.post.account}` : t('post');
    if (ticket.type === 'pp_revision') return `${account} · ${ticket.request?.productionPoints || '—'} PP → ${ticket.requestedProductionPoints} PP`;
    return `${account} · ${statusCopy(ticket.request?.status, t)}`;
  };
  return <><button type="button" className="queue-overlay-backdrop" onClick={onClose} aria-label={t('close')} /><aside className="queue-ticket-panel" aria-label={t(canReview ? 'ticketInbox' : 'myRequests')}>
    <header><div><p className="scheduler-eyebrow">{t('tickets')}</p><h2>{t(canReview ? 'ticketInbox' : 'myRequests')}</h2></div><button type="button" onClick={onClose} aria-label={t('close')}><X size={16} /></button></header>
    <nav role="tablist">{tabs.map((item) => <button key={item.status} type="button" role="tab" aria-selected={tab === item.status} className={tab === item.status ? 'is-active' : ''} onClick={() => setTab(item.status)}>{t(item.label)} <b>{counts[item.status]}</b></button>)}</nav>
    <div className="queue-ticket-list">
      {loading ? <div className="queue-ticket-state"><LoaderCircle className="queue-spin" />{t('loadingSchedule')}</div> : null}
      {error ? <p className="queue-ticket-error">{error}</p> : null}
      {!loading && !items.length ? <div className="queue-ticket-empty"><ClipboardList size={20} /><span>{t(emptyMessage)}</span></div> : null}
      {items.map((ticket) => <article key={ticket.id} className={`ticket-${ticket.type} status-${ticket.status}`}><header><span>{ticket.type === 'account_access' ? <Settings size={14} /> : ticket.type === 'time_block' ? <CalendarPlus size={14} /> : ticket.type === 'pp_revision' ? <TimerReset size={14} /> : ticket.type === 'move' ? <TimerReset size={14} /> : <Ban size={14} />}</span><div><b>{ticketTitle(ticket)}</b><small>{displayName(ticket.requesterEmail)} · {displayTimestamp(ticket.createdAt, language)}</small></div><i>{ticket.status === 'pending' ? t('ticketsPending') : t(ticket.status)}</i></header><p>{ticketMeta(ticket)}</p>{ticket.reason ? <blockquote>{ticket.reason}</blockquote> : null}{ticket.status === 'pending' && canReview ? <footer><button type="button" className="is-approve" disabled={Boolean(busy)} onClick={() => review(ticket, 'approve')}>{busy === `${ticket.id}:approve` ? <LoaderCircle className="queue-spin" size={13} /> : <Check size={13} />}{t('approve')}</button><button type="button" className="is-reject" disabled={Boolean(busy)} onClick={() => review(ticket, 'reject')}>{busy === `${ticket.id}:reject` ? <LoaderCircle className="queue-spin" size={13} /> : <X size={13} />}{t('reject')}</button></footer> : ticket.status === 'pending' ? <small className="ticket-reviewer">{t('pendingApproval')}</small> : <small className="ticket-reviewer">{ticket.reviewerEmail ? displayName(ticket.reviewerEmail) : '—'} · {ticket.reviewedAt ? displayTimestamp(ticket.reviewedAt, language) : ''}</small>}</article>)}
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

function Detail({ task, tags, canCoordinate, isOwner, pendingTickets = [], onReviewTicket, notice, history, historyLoading, onClose, onAction, onCancel, onEdit, onNotify, onUpload, onDownload, onRequestPP, onRequestCancellation, onRequestMove }) {
  const { t } = useQueuePreferences();
  const [link, setLink] = useState(task?.finalPermalink || '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [requestMode, setRequestMode] = useState('');
  const [requestedPP, setRequestedPP] = useState(task?.productionPoints || 1);
  const [moveDate, setMoveDate] = useState(task?.scheduledDate || '');
  const [moveStart, setMoveStart] = useState(time(task?.scheduledStartMinutes ?? QUEUE_DAY_START));
  const [requestReason, setRequestReason] = useState('');
  const [form, setForm] = useState({});
  useEffect(() => { setLink(task?.finalPermalink || ''); setReason(''); setEditing(false); setRequestMode(''); setRequestedPP(task?.productionPoints || 1); setMoveDate(task?.scheduledDate || ''); setMoveStart(time(task?.scheduledStartMinutes ?? QUEUE_DAY_START)); setRequestReason(''); setForm({ productionPoints: task?.productionPoints || 1, priority: task?.priority || 'medium', tags: task?.tags || [], brief: task?.brief || '', notes: task?.notes || '', references: task?.references?.join('\n') || '' }); }, [task?.id]);
  useEffect(() => { if (!task) return undefined; const close = (event) => { if (event.key === 'Escape') onClose(); }; document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, [task, onClose]);
  if (!task) return null;
  const run = async (callback) => { setBusy(true); try { await callback(); } finally { setBusy(false); } };
  const save = () => run(async () => { const saved = await onEdit({ ...form, productionPoints: Number(form.productionPoints), references: form.references.split('\n').map((item) => item.trim()).filter(Boolean) }); if (saved) setEditing(false); });
  const sendDesignerRequest = () => run(async () => { const sent = requestMode === 'pp' ? await onRequestPP(Number(requestedPP), requestReason) : requestMode === 'move' ? await onRequestMove(moveDate, minutesFromTime(moveStart), requestReason) : await onRequestCancellation(requestReason); if (sent) { setRequestMode(''); setRequestReason(''); } });
  const canRequestChange = !canCoordinate && isOwner && !task.isDraft && ['scheduled', 'in_progress', 'completed'].includes(task.status);
  const designerRequestActions = canRequestChange ? <div className="queue-designer-ticket-actions">{!requestMode ? <><button type="button" disabled={busy || !['scheduled', 'in_progress'].includes(task.status)} onClick={() => { setRequestedPP(task.productionPoints); setRequestMode('pp'); }}><TimerReset size={13} />{t('requestPPChange')}</button><button type="button" disabled={busy || task.status !== 'scheduled'} onClick={() => { setMoveDate(task.scheduledDate || ''); setMoveStart(time(task.scheduledStartMinutes ?? QUEUE_DAY_START)); setRequestMode('move'); }}><Clock3 size={13} />{t('requestMove')}</button><button type="button" disabled={busy} onClick={() => setRequestMode('cancel')}><Ban size={13} />{t('requestCancellation')}</button></> : <div className="queue-designer-ticket-form">{requestMode === 'pp' ? <label>{t('requestedPP')}<input type="number" min="1" value={requestedPP} onChange={(event) => setRequestedPP(event.target.value)} /></label> : requestMode === 'move' ? <><strong>{t('moveRequest')}</strong><small>{t('moveHelp')}</small><label>{t('moveTo')}<input type="date" value={moveDate} onChange={(event) => setMoveDate(event.target.value)} /><input type="time" step="600" value={moveStart} onChange={(event) => setMoveStart(event.target.value)} /></label></> : <strong>{t('requestCancellation')}</strong>}<label>{t('requestReason')}<textarea value={requestReason} onChange={(event) => setRequestReason(event.target.value)} /></label><div><button type="button" className="is-send" disabled={busy || (requestMode === 'pp' && (!requestedPP || Number(requestedPP) === Number(task.productionPoints))) || (requestMode === 'move' && (!moveDate || !moveStart || (moveDate === task.scheduledDate && minutesFromTime(moveStart) === Number(task.scheduledStartMinutes))))} onClick={sendDesignerRequest}>{busy ? <LoaderCircle className="queue-spin" size={13} /> : <Send size={13} />}{t('sendRequest')}</button><button type="button" disabled={busy} onClick={() => { setRequestMode(''); setRequestReason(''); }}>{t('cancel')}</button></div></div>}</div> : null;
  const coordinatorTicketActions = canCoordinate && pendingTickets.length ? <div className="queue-coordinator-ticket-actions"><strong>{t('ticketInbox')}</strong>{pendingTickets.map((ticket) => <article key={ticket.id}><span>{ticket.type === 'pp_revision' ? t('ppRevision') : ticket.type === 'move' ? t('moveRequest') : t('cancellationRequest')}</span><small>{ticket.type === 'pp_revision' ? `${task.productionPoints} PP → ${ticket.requestedProductionPoints} PP` : ticket.type === 'move' ? `${ticket.scheduledDate || '—'} · ${time(ticket.scheduledStartMinutes ?? 0)}` : t('requestCancellation')}{ticket.reason ? ` · ${ticket.reason}` : ''}</small><div><button type="button" className="is-approve" disabled={busy} onClick={() => run(() => onReviewTicket(ticket.id, 'approve'))}><Check size={12} />{t('approve')}</button><button type="button" className="is-reject" disabled={busy} onClick={() => run(() => onReviewTicket(ticket.id, 'reject'))}><X size={12} />{t('reject')}</button></div></article>)}</div> : null;
  const metric = (label, value) => <React.Fragment key={label}><div className="metric"><span>{label}</span><strong>{value || '—'}</strong></div>{label === t('recommendedAccounts') ? <>{designerRequestActions}{coordinatorTicketActions}</> : null}</React.Fragment>;
  const toggleTag = (tag) => setForm((current) => ({ ...current, tags: current.tags.includes(tag) ? current.tags.filter((item) => item !== tag) : [...current.tags, tag] }));
  return <><button className="sidebar-backdrop" type="button" onClick={onClose} aria-label={t('close')} /><aside className="right-rail is-open queue-request-rail" role="dialog" aria-modal="true" aria-label="Queue request details"><button className="rail-close-button" type="button" onClick={onClose} aria-label={t('close')}><X size={16} /></button><section className="panel detail"><SelectedPost post={queuePost(task)} /><span className={`queue-detail-status${task.isDraft ? ' is-draft' : ''}`}>{statusCopy(task.status, t, task.isDraft)}</span></section><section className="panel caption-panel queue-rail-caption"><header className="panel-header caption-header"><div><p className="section-label">{editing ? t('editRequest') : task.isCustom ? t('createPost') : t('sourceCaption')}</p><h2>{task.post.title || `@${task.post.account}`}</h2>{task.post.title ? <small className="queue-custom-account">@{task.post.account}</small> : null}</div>{canCoordinate && !editing && task.status !== 'cancelled' ? <button type="button" className="ghost-button" onClick={() => setEditing(true)} title={t('editRequest')}><Pencil size={15} />{t('editRequest')}</button> : null}</header>{task.isDraft ? <p className="queue-detail-notice is-draft">{t('tentativeBy')} {displayName(task.draftCoordinatorEmail)}. {t('sharedDrafts')}</p> : null}{notice ? <p className={`queue-detail-notice is-${notice.type || 'success'}`}>{notice.message}</p> : null}{editing ? <div className="queue-detail-editor"><label>{t('productionPoints')}<input type="number" min="1" value={form.productionPoints || ''} onChange={(event) => setForm((current) => ({ ...current, productionPoints: event.target.value }))} /></label><label>{t('priority')}<select value={form.priority || 'medium'} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{priorityCopy(priority, t)}</option>)}</select></label><fieldset><legend>{t('tags')}</legend><div className="queue-tag-picker">{tags.map((tag) => <button type="button" key={tag} className={form.tags.includes(tag) ? 'is-on' : ''} onClick={() => toggleTag(tag)}>{tag}</button>)}</div></fieldset><label>{t('brief')}<textarea value={form.brief || ''} onChange={(event) => setForm((current) => ({ ...current, brief: event.target.value }))} /></label><label>{t('notes')}<textarea value={form.notes || ''} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label><label>{t('referenceLinks')}<textarea value={form.references || ''} onChange={(event) => setForm((current) => ({ ...current, references: event.target.value }))} placeholder={t('oneLinkPerLine')} /></label></div> : <div className="queue-detail-scroll"><div className="queue-detail-copy"><p>{task.title || task.brief || task.post.caption || '—'}</p>{task.notes ? <section><h3>{t('notes')}</h3><p>{task.notes}</p></section> : null}{task.references?.length ? <section><h3>{t('references')}</h3>{task.references.map((item) => <a key={item} href={item} target="_blank" rel="noreferrer">{item}</a>)}</section> : null}{task.cancellationReason ? <section><h3>{t('cancelledReason')}</h3><p>{task.cancellationReason}</p></section> : null}</div>{!task.isCustom ? <SlideDownload post={queuePost(task)} /> : null}<AttachmentList task={task} busy={busy} onUpload={(files) => run(() => onUpload(files))} onDownload={(file) => run(() => onDownload(file))} /><HistoryList events={history} loading={historyLoading} /></div>}<footer className="queue-detail-actions">{editing ? <><button className="scheduler-primary" disabled={busy || !form.productionPoints || !form.priority} onClick={save}>{t('saveChanges')}</button><button className="scheduler-secondary" disabled={busy} onClick={() => setEditing(false)}>{t('cancel')}</button></> : <>{task.status === 'scheduled' && isOwner && !task.isDraft ? <button className="scheduler-primary" disabled={busy} onClick={() => run(() => onAction('start'))}>{t('startWork')}</button> : null}{task.status === 'in_progress' && isOwner ? <button className="scheduler-primary" disabled={busy} onClick={() => run(() => onAction('complete'))}>{t('markComplete')}</button> : null}{task.status === 'completed' && isOwner ? <div className="scheduler-close-form"><label>{t('publishedLink')}<input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://instagram.com/p/..." /></label><button className="scheduler-primary" disabled={busy || !link.trim()} onClick={() => run(() => onAction('close', link))}>{t('closeRequest')}</button><button className="scheduler-secondary" disabled={busy} onClick={() => run(() => onAction('start'))}>{t('returnInProgress')}</button></div> : null}{task.status === 'closed' && task.finalPermalink ? <a className="scheduler-primary" href={task.finalPermalink} target="_blank" rel="noreferrer">{t('openPublished')}</a> : null}{canCoordinate && task.designerEmail && task.status !== 'cancelled' && !task.isDraft ? <button className="scheduler-secondary" disabled={busy} onClick={() => run(onNotify)}><BellRing size={14} />{t('resendSlack')}</button> : null}{canCoordinate && !['closed', 'cancelled'].includes(task.status) ? <div className="scheduler-cancel"><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('cancellationReason')} /><button className="scheduler-danger" disabled={busy} onClick={() => run(() => onCancel(reason))}>{t('cancelRequest')}</button></div> : null}</>}</footer></section><section className="panel stats-panel">{metric(t('assignment'), task.designerEmail ? displayName(task.designerEmail) : statusCopy(task.status, t, task.isDraft))}{metric(t('priority'), priorityCopy(task.priority, t))}{metric(t('scope'), `${task.productionPoints} PP · ${task.durationMinutes} ${t('minutes')}`)}{metric(t('recommendedAccounts'), task.recommendedAccounts?.map((account) => `@${account}`).join(' · '))}</section></aside></>;
}

function schedulerUserRole(user, t) {
  const roles = user?.roles || user?.operatingRoles || [];
  const labels = [];
  if (roles.includes('vc')) labels.push(t('viralCoordinator'));
  if (roles.includes('sales')) labels.push(t('salesRole'));
  if (roles.includes('trainee')) labels.push(t('traineeRole'));
  if (user?.isAdmin) labels.push(t('admin'));
  return labels.join(' · ');
}

function Scheduler({ data, draft, setDraft, onDraftChange, selectedDate, designerScope, onOpen, onError, onCreateTimeBlock }) {
  const { t, language } = useQueuePreferences();
  const coordinator = data.viewer.isAdmin || data.viewer.operatingRoles?.includes('vc');
  const [now, setNow] = useState(() => new Date());
  const [dropPreview, setDropPreview] = useState(null);
  const [resizeState, setResizeState] = useState(null);
  const [timeBlockForm, setTimeBlockForm] = useState(null);
  const [timeBlockBusy, setTimeBlockBusy] = useState(false);
  const scrollRef = useRef(null);
  const resizeRef = useRef(null);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 15000); return () => window.clearInterval(timer); }, []);
  const today = selectedDate === DAY(now);
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
  const visibleDesigners = designerScope ? schedulerUsers.filter((designer) => designer.email === designerScope) : schedulerUsers;
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      const track = scroller?.querySelector('.scheduler-track');
      if (!scroller || !track) return;
      const preferred = selectedDate === DAY() ? currentMinutes() - 180 : 8 * 60;
      const firstMinute = Math.min(16 * 60, Math.max(0, preferred));
      scroller.scrollLeft = (firstMinute / QUEUE_DAY_END) * track.offsetWidth;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedDate, schedulerUsers.length]);
  const centerNow = () => {
    const scroller = scrollRef.current;
    const track = scroller?.querySelector('.scheduler-track');
    if (!scroller || !track) return;
    const minute = selectedDate === DAY() ? currentMinutes() : 12 * 60;
    const trackStart = track.offsetLeft;
    const target = trackStart + (minute / QUEUE_DAY_END) * track.offsetWidth - scroller.clientWidth / 2;
    const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const left = Math.max(0, Math.min(maxScroll, target));
    if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ left, behavior: 'smooth' });
    else scroller.scrollLeft = left;
  };
  const openTimeBlockForm = (event, designer) => {
    if (designer.email !== data.viewer.email || event.target.closest('.scheduler-block,.scheduler-time-block')) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const startMinutes = Math.min(1430, Math.max(0, Math.round((((event.clientX - rect.left) / rect.width) * QUEUE_DAY_END) / 10) * 10));
    const panelWidth = 326;
    const panelHeight = 390;
    setTimeBlockForm({ category: 'meeting', title: '', note: '', scheduledDate: selectedDate, startMinutes, durationMinutes: 30, x: Math.max(12, Math.min(window.innerWidth - panelWidth - 12, event.clientX)), y: Math.max(12, Math.min(window.innerHeight - panelHeight - 12, event.clientY)) });
  };
  const submitTimeBlock = async () => {
    if (!timeBlockForm) return;
    setTimeBlockBusy(true);
    try {
      const saved = await onCreateTimeBlock(timeBlockForm);
      if (saved) setTimeBlockForm(null);
    } finally {
      setTimeBlockBusy(false);
    }
  };
  useEffect(() => { setTimeBlockForm(null); }, [selectedDate]);
  const planForEvent = (event, designer) => {
    const id = Number(activeQueueDragId || event.dataTransfer.getData('queue-task'));
    const source = allTasks.find((task) => task.id === id);
    if (!source || source.status === 'in_progress') return { ok: false, error: 'This request cannot be moved.' };
    const targetUser = schedulerUsers.find((user) => user.email === designer);
    if (!targetUser?.isQueueDesigner) return { ok: false, error: 'Only Post Designers can receive Queue work.' };
    const rect = event.currentTarget.getBoundingClientRect();
    const pointer = Math.min(1430, Math.max(0, Math.round((((event.clientX - rect.left) / rect.width) * QUEUE_DAY_END) / 10) * 10));
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
  const previewDrop = (event, designer) => { event.preventDefault(); if (!coordinator) return; event.dataTransfer.dropEffect = 'move'; const result = planForEvent(event, designer); setDropPreview(result.ok ? { designer, ...result } : null); };
  const drop = (event, designer) => {
    event.preventDefault(); if (!coordinator) return;
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
  const nowPosition = (currentMinutes(now) / QUEUE_DAY_END) * 100;
  const previewNextDay = dropPreview && dropPreview.target.scheduledDate !== selectedDate;
  const previewWidth = dropPreview ? Math.max(0.8, (dropPreview.target.durationMinutes / QUEUE_DAY_END) * 100) : 0;
  const previewLeft = dropPreview ? (previewNextDay ? Math.max(0, 100 - previewWidth) : (dropPreview.target.scheduledStartMinutes / QUEUE_DAY_END) * 100) : 0;
  return <div className="scheduler-shell">
    <section className="scheduler" ref={scrollRef}>
      <div className="scheduler-canvas">
        <div className="scheduler-time-head"><span>{t('designer')}</span><div>{Array.from({ length: 24 }, (_, hour) => <b key={hour} style={{ left: `${hour * (100 / 24)}%` }}>{time(hour * 60)}</b>)}</div></div>
        {visibleDesigners.map((designer) => {
          const queueEligible = designer.isQueueDesigner !== false;
          const initials = displayName(designer.email, designer.displayName).split(/\s+/).map((word) => word.slice(0, 1)).join('').slice(0, 2).toUpperCase();
          const role = schedulerUserRole(designer, t);
          const ppUnit = Number(designer.minutesPerPP || 10) !== 10 ? `${designer.minutesPerPP} min/PP` : '';
          const accounts = designer.accounts?.map((account) => `@${account}`).join(' · ') || t('noAccounts');
          const accountAvatars = designer.accountAvatars || {};
          const tasks = merged(designer.email);
          const timeBlocks = (data.timeBlocks || []).filter((block) => block.requesterEmail === designer.email && block.scheduledDate === selectedDate);
          return <div className={`scheduler-row${queueEligible ? '' : ' is-non-queue-user'}`} key={designer.email}>
            <header><div className="scheduler-user-identity"><span className="scheduler-user-avatar"><span aria-hidden="true">{initials}</span>{userAvatar(designer.avatarUrl) ? <img src={userAvatar(designer.avatarUrl)} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} /> : null}</span><span className="scheduler-user-copy"><b>{displayName(designer.email, designer.displayName)}</b><small>{[role, ppUnit, accounts].filter(Boolean).join(' · ')}</small></span></div></header>
            <div className="scheduler-track" onContextMenu={(event) => openTimeBlockForm(event, designer)} onDragOver={(event) => previewDrop(event, designer.email)} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropPreview(null); }} onDrop={(event) => drop(event, designer.email)}>
              {Array.from({ length: 25 }, (_, hour) => <i key={hour} style={{ left: `${hour * (100 / 24)}%` }} />)}
              {timeBlocks.map((block) => <TimeBlock key={block.id} block={block} />)}
              {dropPreview?.designer === designer.email ? <span className={`scheduler-drop-preview${previewNextDay ? ' is-next-day' : ''}`} style={{ left: `${previewLeft}%`, width: `${previewWidth}%` }}><b>@{dropPreview.target.post.account}</b><small>{previewNextDay ? `${displayDate(dropPreview.target.scheduledDate, language)} · ` : ''}{time(dropPreview.target.scheduledStartMinutes)} · {dropPreview.target.durationMinutes} min</small></span> : null}
              {tasks.map((task) => { const renderTask = resizeState?.preview?.id === task.id ? resizeState.preview : task; return <TaskBlock key={task.id} task={renderTask} editable={coordinator && (!renderTask.isDraft || renderTask.draftCoordinatorEmail === data.viewer.email)} accountAvatars={accountAvatars} onResizeStart={startResize} onOpen={onOpen} />; })}
            </div>
          </div>;
        })}
        {today ? <div className="scheduler-day-overlay"><span className="scheduler-now-global" style={{ left: `${nowPosition}%` }}><b>{t('now')}</b></span></div> : null}
      </div>
    </section>
    <button type="button" className="scheduler-center-now" onClick={centerNow} title={t('centerNow')} aria-label={t('centerNow')}><LocateFixed size={15} /><span>{t('centerNow')}</span></button>
    <TimeBlockForm form={timeBlockForm} setForm={setTimeBlockForm} busy={timeBlockBusy} onClose={() => setTimeBlockForm(null)} onSubmit={submitTimeBlock} />
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
  return <div className="queue-pick-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="queue-pick-modal" role="dialog" aria-modal="true" aria-label={t('pickTitle')}><header><div><p className="scheduler-eyebrow">{t('pick')}</p><h2>{t('pickTitle')}</h2><small>{hotFallback ? t('hotPickHelp') : t('pickHelp')} · {index + 1}/{requests.length}</small></div><button type="button" onClick={onClose} aria-label={t('close')}><X size={16} /></button></header><article className={`queue-pick-card priority-${candidate.priority || 'medium'}${hotClass(candidate)}`}>{thumbnail ? <img src={thumbnail} alt="" /> : <span className="queue-pick-empty-image">@</span>}<div className="queue-pick-content"><div className="queue-pick-account"><b>@{candidate.post.account}</b><span className={`queue-pick-priority priority-${candidate.priority || 'medium'}`}>{t(`priority${(candidate.priority || 'medium').slice(0, 1).toUpperCase()}${(candidate.priority || 'medium').slice(1)}`)}</span>{isHotTask(candidate) ? <span className="queue-hot-badge">🔥 {hotText(candidate)}</span> : null}</div><p>{candidate.brief || candidate.post.caption || t('post')}</p><div className="queue-pick-meta"><span>{candidate.productionPoints} PP</span><span>{candidate.durationMinutes} {t('minutes')}</span>{candidate.tags?.filter((tag) => tag !== 'hot').slice(0, 3).map((tag) => <i key={tag}>{tag}</i>)}</div></div></article><footer><button type="button" className="scheduler-secondary" disabled={busy || requests.length < 2} onClick={() => setIndex((current) => (current + 1) % requests.length)}><ChevronRight size={14} />{t('nextRequest')}</button><button type="button" className="scheduler-primary" disabled={busy} onClick={() => onAssign(candidate)}>{busy ? <LoaderCircle className="queue-spin" size={14} /> : <Check size={14} />}{t('assignRequest')}</button></footer></section></div>;
}

function QueueApp({ user }) {
  const { t, language, setLanguage } = useQueuePreferences();
  const [data, setData] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [date, setDate] = useState(DAY());
  const [loading, setLoading] = useState(true);
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
  const [designerScope, setDesignerScope] = useState('');
  const [ticketsOpen, setTicketsOpen] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState('');
  const [pickOpen, setPickOpen] = useState(false);
  const [pickBusy, setPickBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [accountSetupOpen, setAccountSetupOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(() => !window.localStorage.getItem('sentient.queueGuide.v1'));
  const [guideStep, setGuideStep] = useState(-1);
  const [resetOpen, setResetOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const draftRef = useRef(draft);
  const draftSyncingRef = useRef(false);
  const draftHydratedRef = useRef(false);
  const draftSaveVersionRef = useRef(0);
  const draftSavePromiseRef = useRef(Promise.resolve());
  const persistDraftsRef = useRef(null);
  const openRef = useRef(open);
  const loadRef = useRef(null);
  const liveRevisionRef = useRef(0);
  const liveRefreshTimerRef = useRef(null);
  const ticketsOpenRef = useRef(ticketsOpen);
  const loadedOnceRef = useRef(false);
  const accountSetupDismissedRef = useRef(false);
  const guideCompletedRef = useRef(Boolean(window.localStorage.getItem('sentient.queueGuide.v1')));

  const notify = useCallback((message, type = 'success') => { setToast({ message, type }); window.setTimeout(() => setToast(null), 6000); }, []);
  const applyDraft = useCallback((next) => { draftRef.current = next; setDraft(next); if (next.length) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); else window.localStorage.removeItem(DRAFT_KEY); }, []);
  const load = useCallback(async ({ silent = false } = {}) => {
    const showLoader = !silent && !loadedOnceRef.current;
    if (showLoader) setLoading(true);
    try {
      const next = await json(`/api/dashboard/queue/v2?date=${date}&archive=${archive ? 'true' : 'false'}`);
      setData(next);
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
    }
  }, [date, archive, applyDraft]);
  loadRef.current = load;
  useEffect(() => { load().catch(() => {}); }, [load]);
  useEffect(() => { json('/api/dashboard/me').then(setViewer).catch(() => {}); }, []);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { ticketsOpenRef.current = ticketsOpen; }, [ticketsOpen]);
  useEffect(() => { const id = Number(new URLSearchParams(window.location.search).get('task')); if (!id) return; json(`/api/dashboard/queue/v2/requests/${id}`).then(({ request }) => { setOpen(request); if (request.scheduledDate) setDate(request.scheduledDate); }).catch((err) => notify(err.message, 'error')); }, [notify]);
  useEffect(() => { if (!open?.id) { setHistory([]); return; } setDetailNotice(null); setHistoryLoading(true); json(`/api/dashboard/queue/v2/requests/${open.id}/history`).then((result) => setHistory(result.events || [])).catch(() => setHistory([])).finally(() => setHistoryLoading(false)); }, [open?.id]);

  const persistDrafts = useCallback((nextDraft) => {
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
      loadRef.current?.({ silent: true }).catch(() => {});
    }).finally(() => {
      if (version === draftSaveVersionRef.current) draftSyncingRef.current = false;
    });
    return request;
  }, [applyDraft, notify, t]);
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
        liveRevisionRef.current = Math.max(liveRevisionRef.current, Number(event.revision) || 0);
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

  const coordinator = data?.viewer && (data.viewer.isAdmin || data.viewer.operatingRoles?.includes('vc'));
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
  const archived = useMemo(() => data?.requests.filter((task) => task.status === 'cancelled') || [], [data]);
  const upcoming = useMemo(() => {
    if (!coordinator) return [];
    const byId = new Map();
    [...(data?.planningRequests || []), ...(data?.liveDrafts || [])].forEach((task) => {
      if (task.designerEmail && ['scheduled', 'in_progress', 'completed'].includes(task.status)) byId.set(task.id, task);
    });
    return [...byId.values()].sort((a, b) => `${a.scheduledDate || ''}-${String(a.scheduledStartMinutes ?? 0).padStart(4, '0')}-${a.id}`.localeCompare(`${b.scheduledDate || ''}-${String(b.scheduledStartMinutes ?? 0).padStart(4, '0')}-${b.id}`));
  }, [coordinator, data]);
  const assigned = useMemo(() => { const byId = new Map((data?.assignedRequests || []).map((task) => [task.id, task])); (data?.liveDrafts || []).filter((task) => task.designerEmail === data?.viewer?.email).forEach((task) => byId.set(task.id, task)); return [...byId.values()].sort((a, b) => `${a.scheduledDate}-${String(a.scheduledStartMinutes).padStart(4, '0')}`.localeCompare(`${b.scheduledDate}-${String(b.scheduledStartMinutes).padStart(4, '0')}`)); }, [data]);
  const pickPool = useMemo(() => {
    const minutesPerPP = Number(data?.viewer?.minutesPerPP || 10);
    const forViewer = (task) => ({ ...task, minutesPerPP, durationMinutes: Number(task.productionPoints || 1) * minutesPerPP });
    const poolRequests = (data?.pickRequests || []).filter((task) => task.status === 'pool').map(forViewer);
    const regularRequests = poolRequests.filter((task) => !(task.isHot || task.tags?.includes('hot')));
    if (regularRequests.length) return poolRequests;
    if (poolRequests.length) return [...poolRequests].sort((a, b) => (Number(b.hotMultiplier) || 0) - (Number(a.hotMultiplier) || 0));
    return (data?.hotPickRequests || []).filter((task) => task.status === 'pool').map(forViewer).sort((a, b) => (Number(b.hotMultiplier) || 0) - (Number(a.hotMultiplier) || 0));
  }, [data]);
  const pickHotFallback = useMemo(() => {
    const poolRequests = (data?.pickRequests || []).filter((task) => task.status === 'pool');
    return poolRequests.length > 0 && poolRequests.every((task) => task.isHot || task.tags?.includes('hot')) && pickPool.length > 0;
  }, [data, pickPool]);
  const pickAvailable = !coordinator && !assigned.some((task) => ['scheduled', 'in_progress'].includes(task.status)) && pickPool.length > 0;
  const toggleTickets = async () => { const next = !ticketsOpen; setTicketsOpen(next); if (next) await loadTickets(); };
  const pickRequest = async (task) => {
    setPickBusy(true);
    try {
      const result = await json('/api/dashboard/queue/v2/pick', { method: 'POST', body: new URLSearchParams({ request_id: String(task.id) }) });
      setPickOpen(false);
      await load({ silent: true });
      notify(t('pickedRequest'));
      return result;
    } catch (err) {
      notify(err.message || t('draftSyncFailed'), 'error');
      await load({ silent: true }).catch(() => {});
      return null;
    } finally { setPickBusy(false); }
  };
  const submit = async () => { try { await draftSavePromiseRef.current.catch(() => {}); const changes = draftRef.current.map((task) => ({ id: task.id, status: task.status, designerEmail: task.designerEmail, scheduledDate: task.scheduledDate, scheduledStartMinutes: task.scheduledStartMinutes, productionPoints: task.productionPoints, recommendedAccounts: task.recommendedAccounts || [] })); const result = await json('/api/dashboard/queue/v2/submit', { method: 'POST', body: new URLSearchParams({ changes: JSON.stringify(changes) }) }); applyDraft([]); await load({ silent: true }); const sent = result.notifications?.sent || 0; const failed = result.notifications?.failed || 0; notify(`${t('scheduleSubmitted')} ${sent} DM${sent === 1 ? '' : 's'} sent${failed ? ` · ${failed} failed` : ''}.`, failed ? 'warning' : 'success'); } catch (err) { notify(err.message, 'error'); } };
  const clearDrafts = async () => { try { await draftSavePromiseRef.current.catch(() => {}); await json('/api/dashboard/queue/v2/drafts/clear', { method: 'POST', body: new URLSearchParams() }); applyDraft([]); await load({ silent: true }); } catch (err) { notify(err.message, 'error'); } };
  const changeDraftAccounts = (requestId, accounts) => persistDrafts(draftRef.current.map((task) => task.id === requestId ? { ...task, recommendedAccounts: accounts } : task));
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
  const poolDrop = async (event) => {
    event.preventDefault();
    if (!coordinator) return;
    const source = dragTask(event);
    setPoolDropActive(false);
    activeQueueDragId = null;
    if (!source || source.status !== 'scheduled') return;
    const remainingDrafts = draftRef.current.filter((task) => task.id !== source.id);
    const returned = { id: source.id, status: 'pool', designerEmail: null, scheduledDate: null, scheduledStartMinutes: null, productionPoints: source.productionPoints, recommendedAccounts: source.recommendedAccounts || [] };
    try {
      await draftSavePromiseRef.current.catch(() => {});
      await json('/api/dashboard/queue/v2/submit', { method: 'POST', body: new URLSearchParams({ changes: JSON.stringify([returned]) }) });
      applyDraft(remainingDrafts);
      await load({ silent: true });
      notify(t('returnedToPool'));
    } catch (err) {
      await load({ silent: true }).catch(() => {});
      notify(err.message, 'error');
    }
  };
  const closeDetail = () => { openRef.current = null; setOpen(null); };
  const action = async (actionName, value) => { try { const body = value ? new URLSearchParams(actionName === 'close' ? { final_permalink: value } : {}) : undefined; const result = await json(`/api/dashboard/queue/v2/requests/${open.id}/${actionName}`, { method: 'POST', body }); closeDetail(); await load({ silent: true }); notify(result.deferred ? `${t('movedAfterActive')} ${result.scheduledDate} · ${time(result.scheduledStartMinutes)}.` : t('requestUpdated'), result.deferred ? 'warning' : 'success'); } catch (err) { setDetailNotice({ message: err.message, type: 'error' }); } };
  const cancel = async (reason) => { try { await json(`/api/dashboard/queue/v2/requests/${open.id}/cancel`, { method: 'POST', body: new URLSearchParams({ reason }) }); closeDetail(); await load({ silent: true }); notify(t('requestUpdated')); } catch (err) { setDetailNotice({ message: err.message, type: 'error' }); } };
  const edit = async (values) => { try { const result = await json(`/api/dashboard/queue/v2/requests/${open.id}/edit`, { method: 'POST', body: new URLSearchParams({ production_points: String(values.productionPoints), priority: values.priority, tags: values.tags.join(','), brief: values.brief, notes: values.notes, references: JSON.stringify(values.references) }) }); setOpen(result.request); await load({ silent: true }); setDetailNotice({ message: t('requestUpdated'), type: 'success' }); return true; } catch (err) { setDetailNotice({ message: err.message, type: 'error' }); return false; } };
  const resend = async () => { try { const result = await json(`/api/dashboard/queue/v2/requests/${open.id}/notify`, { method: 'POST' }); setDetailNotice({ message: result.sent ? t('slackSent') : t('slackFailed'), type: result.sent ? 'success' : 'error' }); const events = await json(`/api/dashboard/queue/v2/requests/${open.id}/history`); setHistory(events.events || []); } catch (err) { setDetailNotice({ message: err.message, type: 'error' }); } };
  const upload = async (files) => { let current = open; let failures = 0; for (const file of files) { const body = new FormData(); body.append('file', file); try { const result = await json(`/api/dashboard/queue/v2/requests/${open.id}/attachments`, { method: 'POST', body }); current = result.request; } catch { failures += 1; } } setOpen(current); setDetailNotice({ message: failures ? t('uploadFailed') : t('filesUploaded'), type: failures ? 'error' : 'success' }); await load({ silent: true }); };
  const download = async (file) => { const response = await apiFetch(`${API_BASE}/api/dashboard/queue/v2/requests/${open.id}/attachments/${file.id}`); if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || 'Download failed.'); const blob = await response.blob(); const href = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = href; link.download = file.name; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(href), 30000); };
  const createTimeBlock = async (form) => {
    try {
      await json('/api/dashboard/queue/v2/tickets/time-block', { method: 'POST', body: new URLSearchParams({ category: form.category, scheduled_date: form.scheduledDate, scheduled_start_minutes: String(form.startMinutes), duration_minutes: String(form.durationMinutes), title: form.title, note: form.note }) });
      await load({ silent: true });
      notify(t('ticketCreated'));
      return true;
    } catch (err) {
      notify(err.message, 'error');
      return false;
    }
  };
  const saveManagedAccounts = async (accounts) => {
    const result = await json('/api/dashboard/queue/v2/account-onboarding', { method: 'POST', body: new URLSearchParams({ accounts: JSON.stringify(accounts) }) });
    accountSetupDismissedRef.current = true;
    await load({ silent: true });
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
  const resetQueue = async (confirmation) => {
    const result = await json('/api/admin/queue/reset', { method: 'POST', body: new URLSearchParams({ confirmation }) });
    applyDraft([]);
    accountSetupDismissedRef.current = false;
    await load({ silent: true });
    notify(t('queueResetDone'), 'warning');
    return result;
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
  const reviewTicket = async (ticketId, reviewAction) => {
    try {
      await json(`/api/dashboard/queue/v2/tickets/${ticketId}/review`, { method: 'POST', body: new URLSearchParams({ action: reviewAction }) });
      await Promise.all([load({ silent: true }), loadTickets({ silent: true })]);
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
          {coordinator ? <button type="button" className="queue-create-button" onClick={() => setCreateOpen(true)}><Plus size={14} />{t('createPost')}</button> : null}
          {(data?.viewer?.isAdmin || data?.viewer?.isDev || viewer?.is_dev) ? <button type="button" className={`queue-overview-button${overviewOpen ? ' is-active' : ''}`} onClick={toggleOverview}><BarChart3 size={14} />{t('adminOverview')}</button> : null}
          {data?.viewer ? <button type="button" className={`queue-ticket-button${ticketsOpen ? ' is-active' : ''}`} onClick={toggleTickets}><ClipboardList size={14} />{t('tickets')}{data.pendingTicketCount ? <b>{data.pendingTicketCount}</b> : null}</button> : null}
          {pickAvailable ? <button type="button" className={`queue-pick-button${pickOpen ? ' is-active' : ''}`} onClick={() => setPickOpen(true)}><Check size={14} />{t('pick')}</button> : null}
        </div>
        <nav className="queue-actions-nav" aria-label={t('dashboard')}>
          <a href={`${import.meta.env.BASE_URL}tracker.html`}>Tracker</a><a href={`${import.meta.env.BASE_URL}insights.html`}>Insights</a><span className="queue-nav-current" aria-current="page">Queue</span><a href={import.meta.env.BASE_URL}><ArrowLeft size={14} />{t('dashboard')}</a>
        </nav>
        <div className="queue-actions-group queue-actions-account">
          <QueueSettings isAdmin={Boolean(data?.viewer?.isAdmin)} isDev={Boolean(viewer?.is_dev || data?.viewer?.isDev)} userEmail={user.email} onManageAccounts={() => { accountSetupDismissedRef.current = false; setAccountSetupOpen(true); }} onStartGuide={() => { setGuideStep(-1); setGuideOpen(true); }} onResetQueue={(data?.viewer?.isAdmin || data?.viewer?.isDev || viewer?.is_dev) ? () => setResetOpen(true) : null} onSignOut={() => { clearSsoCookie(); signOut(auth); }} />
        </div>
      </div>
    </header>
    {toast ? <div className={`queue-toast is-${toast.type}`} role="status">{toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}<span>{toast.message}</span><button type="button" onClick={() => setToast(null)}><X size={14} /></button></div> : null}
    {loading ? <section className="queue-state"><LoaderCircle className="queue-spin" /><p>{t('loadingSchedule')}</p></section> : null}
    {error ? <section className="queue-state queue-error"><p>{error}</p><button type="button" onClick={load}>{t('tryAgain')}</button></section> : null}
    {data ? <>
      {overviewOpen ? <QueueOverview report={overview} loading={overviewLoading} error={overviewError} onRetry={loadOverview} onOpen={setOpen} /> : null}
      {!overviewOpen ? <>
      <section className="scheduler-toolbar"><div><p className="scheduler-eyebrow">{coordinator ? t('coordinatorSchedule') : t('mySchedule')}</p><h2>{displayDate(date, language)}</h2></div>{coordinator ? <label className="scheduler-designer-filter">{t('assignedView')}<select value={designerScope} onChange={(event) => setDesignerScope(event.target.value)}><option value="">{t('allUsers')}</option>{(data.schedulerUsers || data.designers).map((person) => <option key={person.email} value={person.email}>{displayName(person.email, person.displayName)}</option>)}</select></label> : null}<div className="scheduler-nav"><button type="button" aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))}><ChevronLeft size={17} /></button><button type="button" onClick={() => setDate(DAY())}>{t('today')}</button><button type="button" aria-label="Next day" onClick={() => setDate(shiftDay(date, 1))}><ChevronRight size={17} /></button></div><button type="button" className={`scheduler-archive-toggle${archive ? ' is-on' : ''}`} onClick={() => setArchive((value) => !value)}><Archive size={14} />{archive ? t('liveQueue') : t('archive')}</button>{coordinator && draft.length ? <button type="button" className="scheduler-submit" onClick={submit}><Send size={14} />{t('submit')} {draft.length} {draft.length > 1 ? t('changes') : t('change')}</button> : null}</section>
      {coordinator && !archive ? <section className={`scheduler-pool${poolDropActive ? ' is-drop-target' : ''}`} onDragOver={poolDragOver} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPoolDropActive(false); }} onDrop={poolDrop} aria-label={t('poolDropHint')}><header><div><p className="scheduler-eyebrow">{t('productionPool')}</p><h2>{pool.length} {t('readyToSchedule')}</h2></div><small>{poolDropActive ? t('poolDropHint') : t('visibleSchedule')}</small></header><div className="scheduler-pool-list">{pool.map((task) => <PoolCard key={task.id} task={task} onOpen={setOpen} />)}{!pool.length ? <p className="scheduler-empty">{t('emptyPool')}</p> : null}</div></section> : null}
      {archive ? <section className="queue-archive-list"><header><p className="scheduler-eyebrow">{t('archive')}</p><h2>{archived.length} {t('cancelled')}</h2></header>{archived.length ? archived.map((task) => <button type="button" key={task.id} className={`priority-${task.priority || 'medium'}${hotClass(task)}`} onClick={() => setOpen(task)}><span>{cover(task) ? <img src={cover(task)} alt="" /> : '@'}</span><div><b>@{task.post.account}</b><small>{task.cancellationReason || t('cancelled')}</small>{isHotTask(task) ? <i className="queue-hot-badge">🔥 {hotText(task)}</i> : null}</div><em>{displayTimestamp(task.updatedAt, language)}</em></button>) : <p className="scheduler-empty">{t('noArchived')}</p>}</section> : <>{coordinator && draft.length ? <><DraftAccounts draft={draft} designers={data.designers} onAccountsChange={changeDraftAccounts} /><div className="scheduler-draft-actions"><span><Clock3 size={13} />{t('sharedDrafts')}</span><button type="button" onClick={clearDrafts}>{t('clearDrafts')}</button></div></> : null}<Scheduler data={data} draft={draft} setDraft={setDraft} onDraftChange={persistDrafts} selectedDate={date} designerScope={designerScope} onOpen={setOpen} onError={(message) => notify(message, 'error')} onCreateTimeBlock={createTimeBlock} />{coordinator ? <AdminAssignmentTable tasks={upcoming} onOpen={setOpen} headingKey="upcomingProduction" countKey="activeRequests" /> : <DesignerAssignments tasks={assigned} onOpen={setOpen} />}</>}
      </> : null}
    </> : null}
    {ticketsOpen && data?.viewer ? <TicketPanel tickets={tickets} loading={ticketsLoading} error={ticketsError} onClose={() => setTicketsOpen(false)} onReview={reviewTicket} canReview={Boolean(coordinator)} /> : null}
    {pickOpen ? <PickModal requests={pickPool} hotFallback={pickHotFallback} busy={pickBusy} onClose={() => setPickOpen(false)} onAssign={pickRequest} /> : null}
    {createOpen ? <CreatePostModal tags={data?.tags || []} onClose={() => setCreateOpen(false)} onCreated={async () => { await load({ silent: true }); setCreateOpen(false); notify(t('postCreated')); }} /> : null}
    {accountSetupOpen && data ? <AccountSetupModal onboarding={data.accountOnboarding} accounts={data.accounts || []} onClose={() => { accountSetupDismissedRef.current = true; setAccountSetupOpen(false); }} onSave={saveManagedAccounts} onRequest={requestAccountAccess} /> : null}
    {resetOpen ? <QueueResetModal onClose={() => setResetOpen(false)} onReset={resetQueue} /> : null}
    {guideOpen ? <QueueGuide coordinator={Boolean(coordinator)} step={guideStep} setStep={setGuideStep} onChooseLanguage={setLanguage} onComplete={finishGuide} /> : null}
    <Detail task={open} tags={data?.tags || []} canCoordinate={coordinator} isOwner={open?.designerEmail === data?.viewer.email || data?.viewer.isAdmin} pendingTickets={openPendingTickets} onReviewTicket={reviewTicket} notice={detailNotice} history={history} historyLoading={historyLoading} onClose={closeDetail} onAction={action} onCancel={cancel} onEdit={edit} onNotify={resend} onUpload={upload} onDownload={download} onRequestPP={requestPP} onRequestCancellation={requestCancellation} onRequestMove={requestMove} />
    <DevRolePreview isDev={Boolean(viewer?.is_dev || data?.viewer?.isDev)} />
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
