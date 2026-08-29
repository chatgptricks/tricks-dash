import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { AlertTriangle, Archive, ArrowLeft, BarChart3, BellRing, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, History, LoaderCircle, LocateFixed, LogOut, Moon, Palette, Paperclip, Pencil, Radio, Send, Settings, Sun, WifiOff, X } from 'lucide-react';
import { browserPopupRedirectResolver, getRedirectResult, onAuthStateChanged, signOut } from 'firebase/auth';
import { describeSignInError, firebaseAuth as auth, startGoogleSignIn } from './firebase';
import { clearSsoCookie, startSsoRefresh, trySsoSignIn } from './sso';
import { API_BASE, apiFetch } from './api';
import { PrefsProvider } from './prefsContext';
import { SelectedPost, SlideDownload } from './postDetail';
import chatgptricksProfileImage from './assets/chatgptricks-profile.jpg';
import traselvelorealProfileImage from './assets/traselveloreal-profile.jpg';
import { QUEUE_DAY_END, QUEUE_DAY_START, planQueueDrop } from './queuePlanner';
import { followQueueLive } from './queueLive';
import './queue.css';

const DAY = (value = new Date()) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const shiftDay = (date, amount) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + amount); return DAY(value); };
const time = (minutes) => { const normalized = ((minutes % 1440) + 1440) % 1440; return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`; };
const currentMinutes = (value = new Date()) => value.getHours() * 60 + value.getMinutes();
const cover = (task) => task?.post?.coverUrl ? `${API_BASE}${task.post.coverUrl}` : '';
const locale = (language) => language === 'es' ? 'es-CR' : 'en-US';
const displayDate = (value, language) => new Date(`${value}T12:00:00`).toLocaleDateString(locale(language), { weekday: 'long', month: 'short', day: 'numeric' });
const displayTimestamp = (value, language) => new Date(value).toLocaleString(locale(language), { timeZone: 'America/Costa_Rica', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const DRAFT_KEY = 'sentient.queueDrafts.v2';
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
let activeQueueDragId = null;
const ACCOUNT_PROFILE_FALLBACKS = { chatgptricks: chatgptricksProfileImage, traselveloreal: traselvelorealProfileImage };

const COPY = {
  en: {
    productionQueue: 'Production Queue', dashboard: 'Dashboard', admin: 'Admin', coordinatorSchedule: 'Coordinator schedule', mySchedule: 'My production schedule', today: 'Today', submit: 'Submit', change: 'change', changes: 'changes', productionPool: 'Production pool', readyToSchedule: 'ready to schedule', visibleSchedule: 'The window shows 8 hours. Scroll to explore the full 24-hour day.', emptyPool: 'No requests are waiting in the pool.', myAssignedWork: 'My assigned work', upcomingProduction: 'Upcoming production', activeRequest: 'active request', activeRequests: 'active requests', noActiveAssignments: 'No active assignments', emptyAssignments: 'When a coordinator schedules work for you, it will appear here.', post: 'Post', scheduled: 'Scheduled', deadline: 'Deadline', scope: 'Scope', status: 'Status', noTags: 'No tags', designer: 'Designer', now: 'Now', centerNow: 'Center Now', loadingSchedule: 'Loading schedule…', tryAgain: 'Try again', queueAccess: 'Queue is available to every dashboard user.', rolePreview: 'Role preview', onlyEsteban: 'Only visible to Esteban.', activeRole: 'Active role', devFullAccess: 'Dev · full access', postDesigner: 'Post Designer', viralCoordinator: 'Viral Coordinator', salesRole: 'Sales', productionReports: 'Production reports', adminWorkspace: 'Admin workspace', loadingReport: 'Loading report…', inPool: 'In pool', inProgress: 'In progress', readyToClose: 'Ready to close', closed: 'Closed', cancelled: 'Cancelled', designerWorkload: 'Designer workload', workloadHelp: 'Active work, delivery health and actual production time.', allAssignedPosts: 'All assigned posts', assignedPostsCount: 'assigned posts', noAssignedPosts: 'No assigned posts yet.', openSettings: 'Open dashboard settings', startWork: 'Start work', markComplete: 'Mark complete', publishedLink: 'Published Instagram link', closeRequest: 'Close request', returnInProgress: 'Return to in progress', openPublished: 'Open published post', cancellationReason: 'Cancellation reason (optional)', cancelRequest: 'Cancel request', brief: 'Brief', notes: 'Notes', references: 'References', minutes: 'minutes', sourcePost: 'Source post', assignment: 'Assignment', recommendedAccounts: 'Recommended accounts', editRequest: 'Edit request', saveChanges: 'Save changes', cancel: 'Cancel', productionPoints: 'Production points', tags: 'Tags', referenceLinks: 'Reference links', oneLinkPerLine: 'One link per line', signIn: 'Sign in with Google', signingIn: 'Signing in…', signInHelp: 'Sign in with Google to open your production schedule.', allDesigners: 'All designers', allUsers: 'All users', noAccounts: 'No accounts yet', noRecommendedAccount: 'No recommended account', unsavedDrafts: 'Draft schedule changes are saved in this browser.', clearDrafts: 'Discard drafts', archive: 'Archive', liveQueue: 'Live Queue', noArchived: 'No cancelled requests.', extra: 'NEXT DAY', overdue: 'OVERDUE', atRisk: 'AT RISK', attachments: 'Files & references', uploadFiles: 'Upload files', noFiles: 'No files attached.', history: 'Activity history', noHistory: 'No activity yet.', resendSlack: 'Resend Slack DM', slackSent: 'Slack DM sent.', slackFailed: 'Slack DM failed. Check the user Slack ID and try again.', requestUpdated: 'Request updated.', scheduleSubmitted: 'Schedule submitted.', deliveryHealth: 'Delivery health', onTime: 'On-time rate', averageTime: 'Average actual time', completedJobs: 'Closed jobs', draftsSaved: 'Drafts saved', movedJobs: 'reflowed jobs', close: 'Close', filesUploaded: 'Files uploaded.', deadlineError: 'This request cannot fit before its deadline.', invalidDay: 'Requests can be scheduled on any day.', assignedView: 'Scheduler view', uploadFailed: 'Some files could not be uploaded.', sourceCaption: 'Source caption', cancelledReason: 'Cancellation reason', draftWarning: 'You have unsubmitted Queue changes.', movedAfterActive: 'Another post is already in progress. This request was moved after it and remains scheduled.', notQueueParticipant: 'Not a Queue participant',
    priority: 'Priority', priorityLow: 'Low', priorityMedium: 'Medium', priorityHigh: 'High', priorityUrgent: 'Urgent', priorityMix: 'Priority mix', highPriority: 'High priority', tentative: 'Pending submit', tentativeBy: 'Temporary placement by', liveConnected: 'Live', liveConnecting: 'Connecting', liveOffline: 'Reconnecting', sharedDrafts: 'Temporary changes are shared live with assigned designers.', draftSyncFailed: 'The temporary placement could not be shared. Queue was refreshed.', resizeBar: 'Resize production block', resizeLeft: 'from the left', resizeRight: 'from the right', adminOverview: 'Overview', userManagement: 'User Management', managedAccounts: 'Managed Sentient accounts', chooseSentientAccount: 'Choose Sentient account', assignAccount: 'Assign', removeAccount: 'Remove account', usersCount: 'users', loadingUsers: 'Loading users…', noUsers: 'No users available.', accountUpdateFailed: 'Could not update account ownership.',
  },
  es: {
    productionQueue: 'Cola de producción', dashboard: 'Dashboard', admin: 'Admin', coordinatorSchedule: 'Agenda de coordinación', mySchedule: 'Mi agenda de producción', today: 'Hoy', submit: 'Enviar', change: 'cambio', changes: 'cambios', productionPool: 'Pool de producción', readyToSchedule: 'listos para programar', visibleSchedule: 'La ventana muestra 8 horas. Desplázate para explorar las 24 horas del día.', emptyPool: 'No hay requests esperando en el pool.', myAssignedWork: 'Mi trabajo asignado', upcomingProduction: 'Próxima producción', activeRequest: 'request activo', activeRequests: 'requests activos', noActiveAssignments: 'No tienes asignaciones activas', emptyAssignments: 'Cuando un coordinador programe trabajo para ti, aparecerá aquí.', post: 'Post', scheduled: 'Programado', deadline: 'Deadline', scope: 'Alcance', status: 'Estado', noTags: 'Sin tags', designer: 'Designer', now: 'Ahora', centerNow: 'Centrar ahora', loadingSchedule: 'Cargando agenda…', tryAgain: 'Intentar de nuevo', queueAccess: 'Queue está disponible para todos los usuarios del dashboard.', rolePreview: 'Vista de rol', onlyEsteban: 'Visible solo para Esteban.', activeRole: 'Rol activo', devFullAccess: 'Dev · acceso completo', postDesigner: 'Post Designer', viralCoordinator: 'Viral Coordinator', salesRole: 'Sales', productionReports: 'Reportes de producción', adminWorkspace: 'Espacio Admin', loadingReport: 'Cargando reporte…', inPool: 'En pool', inProgress: 'En progreso', readyToClose: 'Listo para cerrar', closed: 'Cerrado', cancelled: 'Cancelado', designerWorkload: 'Carga por designer', workloadHelp: 'Trabajo activo, salud de entrega y tiempo real de producción.', allAssignedPosts: 'Todos los posts asignados', assignedPostsCount: 'posts asignados', noAssignedPosts: 'Todavía no hay posts asignados.', openSettings: 'Abrir Settings del dashboard', startWork: 'Empezar trabajo', markComplete: 'Marcar como completado', publishedLink: 'Link publicado de Instagram', closeRequest: 'Cerrar request', returnInProgress: 'Volver a en progreso', openPublished: 'Abrir post publicado', cancellationReason: 'Motivo de cancelación (opcional)', cancelRequest: 'Cancelar request', brief: 'Brief', notes: 'Notas', references: 'Referencias', minutes: 'minutos', sourcePost: 'Post original', assignment: 'Asignación', recommendedAccounts: 'Cuentas recomendadas', editRequest: 'Editar request', saveChanges: 'Guardar cambios', cancel: 'Cancelar', productionPoints: 'Puntos de producción', tags: 'Tags', referenceLinks: 'Links de referencia', oneLinkPerLine: 'Un link por línea', signIn: 'Iniciar sesión', signingIn: 'Iniciando sesión…', signInHelp: 'Inicia sesión con Google para abrir tu agenda de producción.', allDesigners: 'Todos los designers', allUsers: 'Todos los usuarios', noAccounts: 'Sin cuentas todavía', noRecommendedAccount: 'Sin cuenta recomendada', unsavedDrafts: 'Los cambios del scheduler se guardan en este navegador.', clearDrafts: 'Descartar cambios', archive: 'Archivo', liveQueue: 'Queue activo', noArchived: 'No hay requests cancelados.', extra: 'DÍA SIGUIENTE', overdue: 'VENCIDO', atRisk: 'EN RIESGO', attachments: 'Archivos y referencias', uploadFiles: 'Subir archivos', noFiles: 'No hay archivos adjuntos.', history: 'Historial de actividad', noHistory: 'Todavía no hay actividad.', resendSlack: 'Reenviar DM de Slack', slackSent: 'DM de Slack enviado.', slackFailed: 'Falló el DM de Slack. Revisa el Slack ID del usuario e intenta de nuevo.', requestUpdated: 'Request actualizado.', scheduleSubmitted: 'Scheduler enviado.', deliveryHealth: 'Salud de entrega', onTime: 'Entregas a tiempo', averageTime: 'Tiempo real promedio', completedJobs: 'Trabajos cerrados', draftsSaved: 'Cambios guardados', movedJobs: 'trabajos reacomodados', close: 'Cerrar', filesUploaded: 'Archivos subidos.', deadlineError: 'Este request no cabe antes de su deadline.', invalidDay: 'Los requests pueden programarse en cualquier día.', assignedView: 'Vista del scheduler', uploadFailed: 'Algunos archivos no pudieron subirse.', sourceCaption: 'Caption original', cancelledReason: 'Motivo de cancelación', draftWarning: 'Tienes cambios de Queue sin enviar.', movedAfterActive: 'Ya hay otro post en progreso. Este request se movió después y permanece programado.', notQueueParticipant: 'No participa en Queue',
    priority: 'Prioridad', priorityLow: 'Baja', priorityMedium: 'Media', priorityHigh: 'Alta', priorityUrgent: 'Urgente', priorityMix: 'Niveles de prioridad', highPriority: 'Prioridad alta', tentative: 'Pendiente de enviar', tentativeBy: 'Ubicación temporal por', liveConnected: 'En vivo', liveConnecting: 'Conectando', liveOffline: 'Reconectando', sharedDrafts: 'Los cambios temporales se comparten en vivo con los designers asignados.', draftSyncFailed: 'No se pudo compartir la ubicación temporal. Queue fue actualizado.', resizeBar: 'Redimensionar bloque de producción', resizeLeft: 'desde la izquierda', resizeRight: 'desde la derecha', adminOverview: 'Resumen', userManagement: 'Gestión de usuarios', managedAccounts: 'Cuentas Sentient administradas', chooseSentientAccount: 'Elegir cuenta de Sentient', assignAccount: 'Asignar', removeAccount: 'Quitar cuenta', usersCount: 'usuarios', loadingUsers: 'Cargando usuarios…', noUsers: 'No hay usuarios disponibles.', accountUpdateFailed: 'No se pudo actualizar la cuenta.',
  },
};

COPY.en.returnToPool = 'Return to pool';
COPY.en.poolDropHint = 'Drop a scheduled request here to return it to the pool.';
COPY.es.returnToPool = 'Devolver al pool';
COPY.es.poolDropHint = 'Suelta aquí un request programado para devolverlo al pool.';

const QueuePreferencesContext = createContext({ language: 'en', t: (key) => key });
const useQueuePreferences = () => useContext(QueuePreferencesContext);
const statusCopy = (status, t, isDraft = false) => isDraft ? t('tentative') : ({ pool: t('inPool'), scheduled: t('scheduled'), in_progress: t('inProgress'), completed: t('readyToClose'), closed: t('closed'), cancelled: t('cancelled') }[status] || status);
const priorityCopy = (priority, t) => ({ low: t('priorityLow'), medium: t('priorityMedium'), high: t('priorityHigh'), urgent: t('priorityUrgent') }[priority] || t('priorityMedium'));

async function json(path, options) {
  const response = await apiFetch(`${API_BASE}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || 'Queue could not complete that action.');
  return body;
}

function queuePost(task) {
  const type = task.post?.type || 'Image';
  return { ...task.post, postKey: `${task.post?.account}:${task.post?.shortcode}`, account: task.post?.account, shortcode: task.post?.shortcode, coverUrl: task.post?.coverUrl, caption: task.post?.caption || '', postDate: task.post?.publishedAt, postType: type, type, isVideo: String(type).toLowerCase().includes('video') || String(type).toLowerCase().includes('reel'), showsHotBadge: false };
}

function AuthGate({ notice, setNotice }) {
  const { t } = useQueuePreferences();
  const [busy, setBusy] = useState(false);
  const signIn = async () => { setBusy(true); const error = await startGoogleSignIn(); if (error) setNotice(describeSignInError(error)); setBusy(false); };
  return <main className="queue-auth"><section><h1>{t('productionQueue')}</h1><p>{notice || t('signInHelp')}</p><button type="button" onClick={signIn} disabled={busy}>{busy ? t('signingIn') : t('signIn')}</button></section></main>;
}

function QueuePreferences() {
  const { language, setLanguage, theme, setTheme, accent, setAccent } = useQueuePreferences();
  return <div className="queue-preferences"><div className="queue-language" aria-label="Language"><button type="button" className={language === 'en' ? 'is-on' : ''} onClick={() => setLanguage('en')}>EN</button><button type="button" className={language === 'es' ? 'is-on' : ''} onClick={() => setLanguage('es')}>ES</button></div><button type="button" className="queue-theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}>{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}</button><div className="queue-accent-picker" title="Accent color"><Palette size={13} />{['lime', 'blue', 'coral'].map((value) => <button type="button" key={value} className={`accent-${value}${accent === value ? ' is-on' : ''}`} onClick={() => setAccent(value)} aria-label={`${value} accent`} />)}</div></div>;
}

function DevRolePreview({ isDev }) {
  const { t } = useQueuePreferences();
  const [open, setOpen] = useState(false);
  const active = window.sessionStorage.getItem('sentient.queueRolePreview') || '';
  if (!isDev) return null;
  const label = { sales: 'Sales', pd: t('postDesigner'), vc: t('viralCoordinator'), admin: t('admin') }[active] || 'Dev';
  const choose = (event) => { const role = event.target.value; if (role) window.sessionStorage.setItem('sentient.queueRolePreview', role); else window.sessionStorage.removeItem('sentient.queueRolePreview'); window.location.reload(); };
  return <div className="dev-role-preview"><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}><span>DEV</span>{label}</button>{open ? <div className="dev-role-preview-panel"><strong>{t('rolePreview')}</strong><p>{t('onlyEsteban')}</p><label>{t('activeRole')}<select value={active} onChange={choose}><option value="">{t('devFullAccess')}</option><option value="sales">Sales</option><option value="pd">{t('postDesigner')}</option><option value="vc">{t('viralCoordinator')}</option><option value="admin">{t('admin')}</option></select></label></div> : null}</div>;
}

function PriorityBadge({ priority = 'medium' }) {
  const { t } = useQueuePreferences();
  return <span className={`queue-priority-badge priority-${priority}`}>{priorityCopy(priority, t)}</span>;
}

function TaskBlock({ task, editable, onOpen, onResizeStart, accountAvatars = {} }) {
  const { t } = useQueuePreferences();
  const left = task.scheduledStartMinutes ?? QUEUE_DAY_START;
  const planned = task.durationMinutes || 10;
  let width = planned;
  if (['completed', 'closed'].includes(task.status) && task.actualStartedAt && task.completedAt) width = Math.min(planned, Math.max(10, Math.round((new Date(task.completedAt) - new Date(task.actualStartedAt)) / 60000)));
  const extra = (task.scheduledStartMinutes ?? 0) + width > QUEUE_DAY_END;
  const canResize = editable && task.status === 'scheduled';
  const accountImage = (account) => { const value = accountAvatars?.[account] || ACCOUNT_PROFILE_FALLBACKS[String(account).toLowerCase()]; return value ? (String(value).startsWith('http') || String(value).startsWith('/') && !String(value).startsWith('/api/') ? String(value) : `${API_BASE}${value}`) : ''; };
  return <button type="button" draggable={editable && task.status === 'scheduled'} className={`scheduler-block state-${task.status} priority-${task.priority || 'medium'}${task.isDraft ? ' is-draft' : ''}${extra ? ' is-extra' : ''}`} style={{ left: `${(left / QUEUE_DAY_END) * 100}%`, width: `${(width / QUEUE_DAY_END) * 100}%` }} onDragStart={(event) => { activeQueueDragId = task.id; event.dataTransfer.setData('queue-task', String(task.id)); }} onDragEnd={() => { activeQueueDragId = null; }} onClick={(event) => { if (event.target.closest('.scheduler-resize-handle')) return; onOpen(task); }} title={`${task.post.account} · ${priorityCopy(task.priority, t)} · ${task.productionPoints} PP · ${statusCopy(task.status, t, task.isDraft)}`}>
    {cover(task) ? <img src={cover(task)} alt="" /> : null}<span className="scheduler-block-copy"><b>@{task.post.account}</b><small>{task.isDraft ? `${t('tentative')} · ` : ''}{priorityCopy(task.priority, t)} · {task.productionPoints} PP · {time(task.scheduledStartMinutes ?? QUEUE_DAY_START)}</small></span>{task.isDraft ? <span className="scheduler-draft-badge">{t('tentative')}</span> : null}{extra ? <span className="scheduler-extra">{t('extra')}</span> : null}{task.recommendedAccounts?.length ? <span className="scheduler-account-badges">{task.recommendedAccounts.map((account) => <i key={account} title={`@${account}`}><span className="scheduler-account-avatar">{accountImage(account) ? <img src={accountImage(account)} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} /> : `@${account.slice(0, 1)}`}</span><b>@{account}</b></i>)}</span> : null}{canResize ? <><span className="scheduler-resize-handle scheduler-resize-handle-left" role="separator" aria-label={`${t('resizeBar')} ${t('resizeLeft')}`} onPointerDown={(event) => onResizeStart(event, task, 'left')} /><span className="scheduler-resize-handle scheduler-resize-handle-right" role="separator" aria-label={`${t('resizeBar')} ${t('resizeRight')}`} onPointerDown={(event) => onResizeStart(event, task, 'right')} /></> : null}
  </button>;
}

function PoolCard({ task, onOpen }) {
  const { t } = useQueuePreferences();
  return <article className={`queue-pool-card priority-${task.priority || 'medium'}${task.isDraft ? ' is-draft' : ''}`} draggable onDragStart={(event) => { activeQueueDragId = task.id; event.dataTransfer.setData('queue-task', String(task.id)); }} onDragEnd={() => { activeQueueDragId = null; }}><button type="button" onClick={() => onOpen(task)}>{cover(task) ? <img src={cover(task)} alt="" /> : <span className="queue-pool-empty">@</span>}<span><b>@{task.post.account}</b><small>{task.productionPoints} PP · {task.durationMinutes} min</small>{task.isDraft ? <em>{t('returnToPool')}</em> : null}</span><PriorityBadge priority={task.priority} /></button><div>{task.tags?.map((tag) => <i key={tag}>{tag}</i>)}</div></article>;
}

function DesignerAssignments({ tasks, onOpen }) {
  const { t, language } = useQueuePreferences();
  return <section className="designer-assignments"><header><div><p className="scheduler-eyebrow">{t('myAssignedWork')}</p><h2>{t('upcomingProduction')}</h2></div><small>{tasks.length} {tasks.length === 1 ? t('activeRequest') : t('activeRequests')}</small></header>{tasks.length ? <div className="designer-assignment-table" role="table"><div className="designer-assignment-head" role="row"><span>{t('post')}</span><span>{t('scheduled')}</span><span>{t('priority')}</span><span>{t('scope')}</span><span>{t('status')}</span></div>{tasks.map((task) => <button type="button" role="row" key={task.id} className={`designer-assignment-row state-${task.status} priority-${task.priority || 'medium'}${task.isDraft ? ' is-draft' : ''}`} onClick={() => onOpen(task)}><span className="designer-assignment-post">{cover(task) ? <img src={cover(task)} alt="" /> : <span className="designer-assignment-empty">@</span>}<span><b>@{task.post.account}</b><small>{task.brief || task.post.caption || t('post')}</small></span></span><span className="designer-assignment-time"><b>{displayDate(task.scheduledDate, language)}</b><small>{time(task.scheduledStartMinutes ?? QUEUE_DAY_START)} · {task.durationMinutes} {t('minutes')}</small></span><span className="designer-assignment-priority"><PriorityBadge priority={task.priority} /></span><span className="designer-assignment-pp"><b>{task.productionPoints} PP</b><small>{task.tags?.slice(0, 2).join(' · ') || t('noTags')}</small></span><span className="designer-assignment-status"><i>{statusCopy(task.status, t, task.isDraft)}</i>{task.isDraft ? <small>{t('tentativeBy')} {task.draftCoordinatorEmail?.split('@')[0]}</small> : null}</span></button>)}</div> : <div className="designer-assignments-empty"><CalendarDays size={18} /><strong>{t('noActiveAssignments')}</strong><span>{t('emptyAssignments')}</span></div>}</section>;
}

function AdminAssignmentTable({ tasks, onOpen, headingKey = 'allAssignedPosts', countKey = 'assignedPostsCount' }) {
  const { t, language } = useQueuePreferences();
  return <section className="queue-admin-assignments"><header><div><p className="scheduler-eyebrow">{t(headingKey)}</p><h3>{tasks.length} {t(countKey)}</h3></div></header>{tasks.length ? <div className="queue-admin-assignment-table" role="table"><div className="queue-admin-assignment-head" role="row"><span>{t('post')}</span><span>{t('designer')}</span><span>{t('scheduled')}</span><span>{t('priority')}</span><span>{t('productionPoints')}</span><span>{t('status')}</span></div>{tasks.map((task) => <button type="button" role="row" key={task.id} className={`queue-admin-assignment-row state-${task.status} priority-${task.priority || 'medium'}${task.isDraft ? ' is-draft' : ''}`} onClick={() => onOpen(task)}><span className="queue-admin-assignment-post">{cover(task) ? <img src={cover(task)} alt="" /> : <span className="queue-admin-assignment-empty">@</span>}<span><b>@{task.post.account}</b><small>{task.brief || task.post.caption || t('post')}</small>{task.recommendedAccounts?.length ? <em>{task.recommendedAccounts.map((account) => `@${account}`).join(' · ')}</em> : null}</span></span><span className="queue-admin-assignment-designer"><b>{task.designerEmail?.split('@')[0] || '—'}</b><small>{task.designerEmail || ''}</small></span><span className="queue-admin-assignment-time"><b>{task.scheduledDate ? displayDate(task.scheduledDate, language) : '—'}</b><small>{task.scheduledStartMinutes == null ? '—' : `${time(task.scheduledStartMinutes)} · ${task.durationMinutes} ${t('minutes')}`}</small></span><span className="queue-admin-assignment-priority"><PriorityBadge priority={task.priority} /></span><span className="queue-admin-assignment-pp"><b>{task.productionPoints} PP</b><small>{task.tags?.slice(0, 2).join(' · ') || t('noTags')}</small></span><span className="queue-admin-assignment-status"><i>{statusCopy(task.status, t, task.isDraft)}</i></span></button>)}</div> : <p className="queue-admin-assignment-empty-state">{t('noAssignedPosts')}</p>}</section>;
}

function AdminUserManagement() {
  const { t } = useQueuePreferences();
  const [users, setUsers] = useState([]);
  const [designerAccounts, setDesignerAccounts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [choices, setChoices] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [userBody, designerBody, accountBody] = await Promise.all([
        json('/api/admin/users'),
        json('/api/admin/queue/designer-accounts'),
        json('/api/admin/accounts'),
      ]);
      setUsers(userBody.users || []);
      setDesignerAccounts(designerBody.designers || []);
      setAccounts((accountBody.accounts || []).filter((account) => account.group === 'sentient' && account.is_active !== false));
    } catch (cause) {
      setError(cause.message || t('accountUpdateFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const updateAccount = async (designerEmail, accountHandle, method) => {
    const key = `${designerEmail}:${accountHandle}`;
    setBusy(key);
    setError('');
    try {
      const query = new URLSearchParams({ designer_email: designerEmail, account_handle: accountHandle });
      const body = method === 'POST' ? { method, body: query } : { method: 'DELETE', search: `?${query.toString()}` };
      const response = await json(`/api/admin/queue/designer-accounts${body.search || ''}`, body.method === 'POST' ? body : { method: body.method });
      setDesignerAccounts(response.designers || []);
      setChoices((current) => ({ ...current, [designerEmail]: '' }));
    } catch (cause) {
      setError(cause.message || t('accountUpdateFailed'));
    } finally {
      setBusy('');
    }
  };

  if (loading) return <div className="queue-user-management-loading"><LoaderCircle className="queue-spin" />{t('loadingUsers')}</div>;
  return <section className="queue-user-management"><header><div><p className="scheduler-eyebrow">{t('userManagement')}</p><h3>{t('managedAccounts')}</h3></div><small>{users.length} {t('usersCount')}</small></header>{error ? <p className="queue-user-management-error">{error}</p> : null}{users.length ? <div className="queue-user-management-list">{users.map((user) => {
    const managed = designerAccounts.find((item) => item.email === user.email) || { accounts: [] };
    const available = accounts.filter((account) => !managed.accounts.includes(account.handle));
    let explicitRoles = [];
    try { explicitRoles = JSON.parse(user.operating_roles || '[]'); } catch { explicitRoles = []; }
    if (!Array.isArray(explicitRoles) || !explicitRoles.length) explicitRoles = [user.operating_role || 'sales'];
    const roleLabels = explicitRoles.filter((role) => String(role).toLowerCase() !== 'pd').map((role) => ({ vc: t('viralCoordinator'), sales: t('salesRole') }[String(role).toLowerCase()] || String(role).toUpperCase()));
    if (user.is_admin) roleLabels.push(t('admin'));
    const displayRole = roleLabels.join(' · ');
    return <article key={user.email}><header><b>{user.email.split('@')[0]}</b><small>{user.email}{displayRole ? ` · ${displayRole}` : ''}</small></header><div className="queue-user-management-accounts">{managed.accounts.map((handle) => <button type="button" key={handle} title={t('removeAccount')} onClick={() => updateAccount(user.email, handle, 'DELETE')} disabled={Boolean(busy)}>@{handle} <X size={11} /></button>)}{!managed.accounts.length ? <em>—</em> : null}</div><div className="queue-user-management-add"><select value={choices[user.email] || ''} aria-label={`${t('chooseSentientAccount')} ${user.email}`} onChange={(event) => setChoices((current) => ({ ...current, [user.email]: event.target.value }))} disabled={Boolean(busy)}><option value="">{t('chooseSentientAccount')}</option>{available.map((account) => <option key={account.handle} value={account.handle}>@{account.handle}</option>)}</select><button type="button" onClick={() => updateAccount(user.email, choices[user.email], 'POST')} disabled={!choices[user.email] || Boolean(busy)}>{t('assignAccount')}</button></div></article>;
  })}</div> : <p className="queue-user-management-empty">{t('noUsers')}</p>}</section>;
}

function AdminTools({ report, loading, error, onClose, onOpen }) {
  const { t } = useQueuePreferences();
  const [tab, setTab] = useState('overview');
  const totals = report?.totals || {};
  const metric = (status, label) => <div key={status}><span>{label}</span><strong>{totals[status]?.count || 0}</strong><small>{totals[status]?.points || 0} PP</small></div>;
  const priorityMetric = (priority) => <div key={priority} className={`priority-${priority}`}><span>{priorityCopy(priority, t)}</span><strong>{report?.priorities?.[priority]?.count || 0}</strong><small>{report?.priorities?.[priority]?.points || 0} PP</small></div>;
  return <section className="queue-admin-tools"><header><div><p className="scheduler-eyebrow">{t('adminWorkspace')}</p><h2>{t('productionReports')}</h2></div><button type="button" onClick={onClose} aria-label={t('close')}><X size={16} /></button></header><nav className="queue-admin-tabs" role="tablist" aria-label={t('adminWorkspace')}><button type="button" role="tab" aria-selected={tab === 'overview'} className={tab === 'overview' ? 'is-active' : ''} onClick={() => setTab('overview')}>{t('adminOverview')}</button><button type="button" role="tab" aria-selected={tab === 'users'} className={tab === 'users' ? 'is-active' : ''} onClick={() => setTab('users')}>{t('userManagement')}</button></nav>{tab === 'users' ? <AdminUserManagement /> : <>{loading ? <div className="queue-admin-loading"><LoaderCircle className="queue-spin" />{t('loadingReport')}</div> : null}{error ? <p className="queue-admin-error">{error}</p> : null}{report ? <><div className="queue-admin-metrics">{metric('pool', t('inPool'))}{metric('scheduled', t('scheduled'))}{metric('in_progress', t('inProgress'))}{metric('completed', t('readyToClose'))}{metric('closed', t('closed'))}{['low', 'medium', 'high', 'urgent'].map(priorityMetric)}</div><div className="queue-admin-designers"><div><h3>{t('designerWorkload')}</h3><p>{t('workloadHelp')}</p></div><div className="queue-admin-designer-list">{report.designers.map((designer) => <span key={designer.email}><b>{designer.email.split('@')[0]}</b><small>{designer.activeRequests} {t('activeRequests')} · {designer.productionPoints} PP · {designer.urgentRequests} {t('priorityUrgent')}</small><em>{designer.highPriorityRequests} {t('highPriority')} · {designer.closedRequests} {t('closed')} · {designer.averageActualMinutes == null ? '—' : `${designer.averageActualMinutes} min`} {t('averageTime')}</em></span>)}</div></div><a className="queue-admin-settings" href={`${import.meta.env.BASE_URL}?view=admin`} target="_blank" rel="noreferrer"><Settings size={14} />{t('openSettings')}</a><AdminAssignmentTable tasks={report.assignedPosts || []} onOpen={onOpen} /></> : null}</>}</section>;
}

function AttachmentList({ task, busy, onUpload, onDownload }) {
  const { t } = useQueuePreferences();
  return <section className="queue-detail-section"><h3><Paperclip size={13} />{t('attachments')}</h3>{task.attachments?.length ? <div className="queue-attachments">{task.attachments.map((file) => <button type="button" key={file.id} disabled={busy} onClick={() => onDownload(file)}><Download size={13} /><span>{file.name}</span><small>{Math.max(1, Math.round(file.size / 1024))} KB</small></button>)}</div> : <p className="queue-detail-empty">{t('noFiles')}</p>}<label className="queue-upload-button"><Paperclip size={13} />{t('uploadFiles')}<input type="file" multiple disabled={busy} onChange={(event) => { onUpload([...event.target.files]); event.target.value = ''; }} /></label></section>;
}

function HistoryList({ events, loading }) {
  const { t, language } = useQueuePreferences();
  return <section className="queue-detail-section"><h3><History size={13} />{t('history')}</h3>{loading ? <LoaderCircle className="queue-spin" size={16} /> : events?.length ? <ol className="queue-history">{events.map((event, index) => <li key={`${event.createdAt}-${index}`}><span className={`history-dot type-${event.type}`} /><div><b>{event.type.replaceAll('_', ' ')}</b><small>{event.actorEmail?.split('@')[0]} · {displayTimestamp(event.createdAt, language)}</small></div></li>)}</ol> : <p className="queue-detail-empty">{t('noHistory')}</p>}</section>;
}

function Detail({ task, tags, canCoordinate, isOwner, notice, history, historyLoading, onClose, onAction, onCancel, onEdit, onNotify, onUpload, onDownload }) {
  const { t } = useQueuePreferences();
  const [link, setLink] = useState(task?.finalPermalink || '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  useEffect(() => { setLink(task?.finalPermalink || ''); setReason(''); setEditing(false); setForm({ productionPoints: task?.productionPoints || 1, priority: task?.priority || 'medium', tags: task?.tags || [], brief: task?.brief || '', notes: task?.notes || '', references: task?.references?.join('\n') || '' }); }, [task?.id]);
  useEffect(() => { if (!task) return undefined; const close = (event) => { if (event.key === 'Escape') onClose(); }; document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, [task, onClose]);
  if (!task) return null;
  const run = async (callback) => { setBusy(true); try { await callback(); } finally { setBusy(false); } };
  const save = () => run(async () => { const saved = await onEdit({ ...form, productionPoints: Number(form.productionPoints), references: form.references.split('\n').map((item) => item.trim()).filter(Boolean) }); if (saved) setEditing(false); });
  const metric = (label, value) => <div className="metric" key={label}><span>{label}</span><strong>{value || '—'}</strong></div>;
  const toggleTag = (tag) => setForm((current) => ({ ...current, tags: current.tags.includes(tag) ? current.tags.filter((item) => item !== tag) : [...current.tags, tag] }));
  return <><button className="sidebar-backdrop" type="button" onClick={onClose} aria-label={t('close')} /><aside className="right-rail is-open queue-request-rail" role="dialog" aria-modal="true" aria-label="Queue request details"><button className="rail-close-button" type="button" onClick={onClose} aria-label={t('close')}><X size={16} /></button><section className="panel detail"><SelectedPost post={queuePost(task)} /><span className={`queue-detail-status${task.isDraft ? ' is-draft' : ''}`}>{statusCopy(task.status, t, task.isDraft)}</span></section><section className="panel caption-panel queue-rail-caption"><header className="panel-header caption-header"><div><p className="section-label">{editing ? t('editRequest') : t('sourceCaption')}</p><h2>@{task.post.account}</h2></div>{canCoordinate && !editing && task.status !== 'cancelled' ? <button type="button" className="ghost-button" onClick={() => setEditing(true)} title={t('editRequest')}><Pencil size={15} />{t('editRequest')}</button> : null}</header>{task.isDraft ? <p className="queue-detail-notice is-draft">{t('tentativeBy')} {task.draftCoordinatorEmail?.split('@')[0]}. {t('sharedDrafts')}</p> : null}{notice ? <p className={`queue-detail-notice is-${notice.type || 'success'}`}>{notice.message}</p> : null}{editing ? <div className="queue-detail-editor"><label>{t('productionPoints')}<input type="number" min="1" value={form.productionPoints || ''} onChange={(event) => setForm((current) => ({ ...current, productionPoints: event.target.value }))} /></label><label>{t('priority')}<select value={form.priority || 'medium'} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{priorityCopy(priority, t)}</option>)}</select></label><fieldset><legend>{t('tags')}</legend><div className="queue-tag-picker">{tags.map((tag) => <button type="button" key={tag} className={form.tags.includes(tag) ? 'is-on' : ''} onClick={() => toggleTag(tag)}>{tag}</button>)}</div></fieldset><label>{t('brief')}<textarea value={form.brief || ''} onChange={(event) => setForm((current) => ({ ...current, brief: event.target.value }))} /></label><label>{t('notes')}<textarea value={form.notes || ''} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label><label>{t('referenceLinks')}<textarea value={form.references || ''} onChange={(event) => setForm((current) => ({ ...current, references: event.target.value }))} placeholder={t('oneLinkPerLine')} /></label></div> : <div className="queue-detail-scroll"><div className="queue-detail-copy"><p>{task.brief || task.post.caption || '—'}</p>{task.notes ? <section><h3>{t('notes')}</h3><p>{task.notes}</p></section> : null}{task.references?.length ? <section><h3>{t('references')}</h3>{task.references.map((item) => <a key={item} href={item} target="_blank" rel="noreferrer">{item}</a>)}</section> : null}{task.cancellationReason ? <section><h3>{t('cancelledReason')}</h3><p>{task.cancellationReason}</p></section> : null}</div><SlideDownload post={queuePost(task)} /><AttachmentList task={task} busy={busy} onUpload={(files) => run(() => onUpload(files))} onDownload={(file) => run(() => onDownload(file))} /><HistoryList events={history} loading={historyLoading} /></div>}<footer className="queue-detail-actions">{editing ? <><button className="scheduler-primary" disabled={busy || !form.productionPoints || !form.priority} onClick={save}>{t('saveChanges')}</button><button className="scheduler-secondary" disabled={busy} onClick={() => setEditing(false)}>{t('cancel')}</button></> : <>{task.status === 'scheduled' && isOwner && !task.isDraft ? <button className="scheduler-primary" disabled={busy} onClick={() => run(() => onAction('start'))}>{t('startWork')}</button> : null}{task.status === 'in_progress' && isOwner ? <button className="scheduler-primary" disabled={busy} onClick={() => run(() => onAction('complete'))}>{t('markComplete')}</button> : null}{task.status === 'completed' && isOwner ? <div className="scheduler-close-form"><label>{t('publishedLink')}<input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://instagram.com/p/..." /></label><button className="scheduler-primary" disabled={busy || !link.trim()} onClick={() => run(() => onAction('close', link))}>{t('closeRequest')}</button><button className="scheduler-secondary" disabled={busy} onClick={() => run(() => onAction('start'))}>{t('returnInProgress')}</button></div> : null}{task.status === 'closed' && task.finalPermalink ? <a className="scheduler-primary" href={task.finalPermalink} target="_blank" rel="noreferrer">{t('openPublished')}</a> : null}{canCoordinate && task.designerEmail && task.status !== 'cancelled' && !task.isDraft ? <button className="scheduler-secondary" disabled={busy} onClick={() => run(onNotify)}><BellRing size={14} />{t('resendSlack')}</button> : null}{canCoordinate && !['closed', 'cancelled'].includes(task.status) ? <div className="scheduler-cancel"><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('cancellationReason')} /><button className="scheduler-danger" disabled={busy} onClick={() => run(() => onCancel(reason))}>{t('cancelRequest')}</button></div> : null}</>}</footer></section><section className="panel stats-panel">{metric(t('assignment'), task.designerEmail?.split('@')[0] || statusCopy(task.status, t, task.isDraft))}{metric(t('priority'), priorityCopy(task.priority, t))}{metric(t('scope'), `${task.productionPoints} PP · ${task.durationMinutes} ${t('minutes')}`)}{metric(t('recommendedAccounts'), task.recommendedAccounts?.map((account) => `@${account}`).join(' · '))}</section></aside></>;
}

function schedulerUserRole(user, t) {
  const roles = user?.roles || user?.operatingRoles || [];
  const labels = [];
  if (roles.includes('vc')) labels.push(t('viralCoordinator'));
  if (roles.includes('sales')) labels.push(t('salesRole'));
  if (user?.isAdmin) labels.push(t('admin'));
  return labels.join(' · ');
}

function Scheduler({ data, draft, setDraft, onDraftChange, selectedDate, designerScope, onOpen, onError }) {
  const { t, language } = useQueuePreferences();
  const coordinator = data.viewer.isAdmin || data.viewer.operatingRoles?.includes('vc');
  const [now, setNow] = useState(() => new Date());
  const [dropPreview, setDropPreview] = useState(null);
  const [resizeState, setResizeState] = useState(null);
  const scrollRef = useRef(null);
  const resizeRef = useRef(null);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 15000); return () => window.clearInterval(timer); }, []);
  const today = selectedDate === DAY(now);
  const allTasks = useMemo(() => {
    const byId = new Map();
    [...(data.planningRequests || []), ...data.requests, ...(data.liveDrafts || []), ...draft].forEach((task) => byId.set(task.id, task));
    return [...byId.values()];
  }, [data.planningRequests, data.requests, data.liveDrafts, draft]);
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
  const planForEvent = (event, designer) => {
    const id = Number(activeQueueDragId || event.dataTransfer.getData('queue-task'));
    const source = allTasks.find((task) => task.id === id);
    if (!source || source.status === 'in_progress') return { ok: false, error: 'This request cannot be moved.' };
    const targetUser = schedulerUsers.find((user) => user.email === designer);
    if (!targetUser?.isQueueDesigner) return { ok: false, error: 'Only Post Designers can receive Queue work.' };
    const rect = event.currentTarget.getBoundingClientRect();
    const pointer = Math.min(1430, Math.max(0, Math.round((((event.clientX - rect.left) / rect.width) * QUEUE_DAY_END) / 10) * 10));
    const result = planQueueDrop({ tasks: allTasks, target: source, designerEmail: designer, scheduledDate: selectedDate, desiredStart: pointer });
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
    const baseDuration = Math.max(10, Number(task.durationMinutes || Number(task.productionPoints || 1) * 10));
    const nextState = { task, edge, track, baseStart, baseEnd: baseStart + baseDuration, baseDuration, preview: { ...task, isDraft: true, draftCoordinatorEmail: data.viewer.email } };
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
      const others = allTasks.filter((item) => item.id !== current.task.id && item.designerEmail === current.task.designerEmail && item.scheduledDate === current.task.scheduledDate && !['pool', 'cancelled'].includes(item.status)).map((item) => ({ start: Number(item.scheduledStartMinutes ?? 0), end: Number(item.scheduledStartMinutes ?? 0) + Math.max(10, Number(item.durationMinutes || Number(item.productionPoints || 1) * 10)) }));
      const previousEnd = Math.max(0, ...others.filter((item) => item.end <= current.baseStart).map((item) => item.end));
      const nextStart = Math.min(QUEUE_DAY_END, ...others.filter((item) => item.start >= current.baseEnd).map((item) => item.start));
      let start = current.baseStart;
      let end = current.baseEnd;
      if (current.edge === 'right') {
        end = Math.max(current.baseStart + 10, Math.min(pointer, Number.isFinite(nextStart) ? nextStart : QUEUE_DAY_END));
      } else {
        start = Math.max(previousEnd, Math.min(pointer, current.baseEnd - 10));
        end = current.baseEnd;
      }
      start = Math.round(start / 10) * 10;
      end = Math.max(start + 10, Math.round(end / 10) * 10);
      const duration = end - start;
      const preview = { ...current.task, scheduledStartMinutes: start, durationMinutes: duration, productionPoints: Math.max(1, duration / 10), status: 'scheduled', isDraft: true, draftCoordinatorEmail: data.viewer.email };
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
  }, [resizeState, allTasks, data.viewer.email, draft, onDraftChange, setDraft]);
  const merged = (designer) => allTasks.filter((task) => {
    if (task.designerEmail !== designer || task.scheduledDate !== selectedDate || ['pool', 'cancelled'].includes(task.status)) return false;
    return true;
  });
  const nowPosition = (currentMinutes(now) / QUEUE_DAY_END) * 100;
  const previewNextDay = dropPreview && dropPreview.target.scheduledDate !== selectedDate;
  const previewWidth = dropPreview ? Math.max(0.8, (dropPreview.target.durationMinutes / QUEUE_DAY_END) * 100) : 0;
  const previewLeft = dropPreview ? (previewNextDay ? Math.max(0, 100 - previewWidth) : (dropPreview.target.scheduledStartMinutes / QUEUE_DAY_END) * 100) : 0;
  return <div className="scheduler-shell"><section className="scheduler" ref={scrollRef}><div className="scheduler-canvas"><div className="scheduler-time-head"><span>{t('designer')}</span><div>{Array.from({ length: 24 }, (_, hour) => <b key={hour} style={{ left: `${hour * (100 / 24)}%` }}>{time(hour * 60)}</b>)}</div></div>{visibleDesigners.map((designer) => { const queueEligible = designer.isQueueDesigner !== false; const initials = designer.email.split('@')[0].slice(0, 2).toUpperCase(); const role = schedulerUserRole(designer, t); const accounts = designer.accounts?.map((account) => `@${account}`).join(' · ') || t('noAccounts'); const accountAvatars = designer.accountAvatars || {}; const tasks = merged(designer.email); return <div className={`scheduler-row${queueEligible ? '' : ' is-non-queue-user'}`} key={designer.email}><header><div className="scheduler-user-identity"><span className="scheduler-user-avatar"><span aria-hidden="true">{initials}</span>{designer.avatarUrl ? <img src={designer.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} /> : null}</span><span className="scheduler-user-copy"><b>{designer.email.split('@')[0]}</b><small>{[role, accounts].filter(Boolean).join(' · ')}</small></span></div></header><div className="scheduler-track" onDragOver={(event) => previewDrop(event, designer.email)} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropPreview(null); }} onDrop={(event) => drop(event, designer.email)}>{Array.from({ length: 25 }, (_, hour) => <i key={hour} style={{ left: `${hour * (100 / 24)}%` }} />)}{dropPreview?.designer === designer.email ? <span className={`scheduler-drop-preview${previewNextDay ? ' is-next-day' : ''}`} style={{ left: `${previewLeft}%`, width: `${previewWidth}%` }}><b>@{dropPreview.target.post.account}</b><small>{previewNextDay ? `${displayDate(dropPreview.target.scheduledDate, language)} · ` : ''}{time(dropPreview.target.scheduledStartMinutes)} · {dropPreview.target.durationMinutes} min</small></span> : null}{tasks.map((task) => { const renderTask = resizeState?.preview?.id === task.id ? resizeState.preview : task; return <TaskBlock key={task.id} task={renderTask} editable={coordinator && (!renderTask.isDraft || renderTask.draftCoordinatorEmail === data.viewer.email)} accountAvatars={accountAvatars} onResizeStart={startResize} onOpen={onOpen} />; })}</div></div>; })}{today ? <div className="scheduler-day-overlay"><span className="scheduler-now-global" style={{ left: `${nowPosition}%` }}><b>{t('now')}</b></span></div> : null}</div></section><button type="button" className="scheduler-center-now" onClick={centerNow} title={t('centerNow')} aria-label={t('centerNow')}><LocateFixed size={15} /><span>{t('centerNow')}</span></button></div>;
}

function DraftAccounts({ draft, designers, onAccountsChange }) {
  const { t, language } = useQueuePreferences();
  const toggle = (task, account) => { const selected = task.recommendedAccounts || []; onAccountsChange(task.id, selected.includes(account) ? selected.filter((item) => item !== account) : [...selected, account]); };
  return <section className="scheduler-drafts"><header><div><b>{t('draftsSaved')}</b><small>{t('sharedDrafts')}</small></div></header>{draft.map((task) => { const designer = designers.find((item) => item.email === task.designerEmail); const selected = task.recommendedAccounts || []; return <article key={task.id}><div><b>@{task.post.account} → {designer?.email.split('@')[0]}</b><small>{displayDate(task.scheduledDate, language)} · {time(task.scheduledStartMinutes)} · {task.productionPoints} PP</small></div><fieldset><legend>{t('recommendedAccounts')}</legend>{designer?.accounts?.length ? designer.accounts.map((account) => <label key={account}><input type="checkbox" checked={selected.includes(account)} onChange={() => toggle(task, account)} /><span>@{account}</span></label>) : <small>{t('noRecommendedAccount')}</small>}</fieldset></article>; })}</section>;
}

function QueueApp({ user }) {
  const { t, language } = useQueuePreferences();
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
  const [adminOpen, setAdminOpen] = useState(false);
  const [archive, setArchive] = useState(false);
  const [poolDropActive, setPoolDropActive] = useState(false);
  const [designerScope, setDesignerScope] = useState('');
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
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
  const adminOpenRef = useRef(adminOpen);
  const loadedOnceRef = useRef(false);

  const notify = useCallback((message, type = 'success') => { setToast({ message, type }); window.setTimeout(() => setToast(null), 6000); }, []);
  const applyDraft = useCallback((next) => { draftRef.current = next; setDraft(next); if (next.length) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); else window.localStorage.removeItem(DRAFT_KEY); }, []);
  const load = useCallback(async ({ silent = false } = {}) => {
    const showLoader = !silent && !loadedOnceRef.current;
    if (showLoader) setLoading(true);
    try {
      const next = await json(`/api/dashboard/queue/v2?date=${date}&archive=${archive ? 'true' : 'false'}`);
      setData(next);
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
  useEffect(() => { adminOpenRef.current = adminOpen; }, [adminOpen]);
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

  const loadReport = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setReportLoading(true);
    setReportError('');
    try { setReport(await json('/api/dashboard/queue/v2/admin-report')); }
    catch (err) { setReportError(err.message || 'Could not load the admin report.'); }
    finally { if (!silent) setReportLoading(false); }
  }, []);

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
          if (adminOpenRef.current) loadReport({ silent: true });
        }, 90);
      },
    });
    return () => { controller.abort(); window.clearTimeout(liveRefreshTimerRef.current); };
  }, [data?.viewer?.email, loadReport]);

  const coordinator = data?.viewer && (data.viewer.isAdmin || data.viewer.operatingRoles?.includes('vc'));
  const pool = useMemo(() => {
    const byId = new Map();
    (data?.requests || []).filter((task) => task.status === 'pool').forEach((task) => byId.set(task.id, task));
    (data?.liveDrafts || []).filter((task) => task.status === 'pool').forEach((task) => byId.set(task.id, task));
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
  const toggleAdminTools = async () => { const next = !adminOpen; setAdminOpen(next); if (next && !reportLoading) await loadReport(); };
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
  const poolDrop = (event) => {
    event.preventDefault();
    if (!coordinator) return;
    const source = dragTask(event);
    setPoolDropActive(false);
    activeQueueDragId = null;
    if (!source || source.status !== 'scheduled') return;
    const returned = { ...source, status: 'pool', designerEmail: null, scheduledDate: null, scheduledStartMinutes: null, isDraft: true, draftCoordinatorEmail: data.viewer.email };
    persistDrafts([...draftRef.current.filter((task) => task.id !== source.id), returned]);
  };
  const closeDetail = () => { openRef.current = null; setOpen(null); };
  const action = async (actionName, value) => { try { const body = value ? new URLSearchParams(actionName === 'close' ? { final_permalink: value } : {}) : undefined; const result = await json(`/api/dashboard/queue/v2/requests/${open.id}/${actionName}`, { method: 'POST', body }); closeDetail(); await load({ silent: true }); notify(result.deferred ? `${t('movedAfterActive')} ${result.scheduledDate} · ${time(result.scheduledStartMinutes)}.` : t('requestUpdated'), result.deferred ? 'warning' : 'success'); } catch (err) { setDetailNotice({ message: err.message, type: 'error' }); } };
  const cancel = async (reason) => { try { await json(`/api/dashboard/queue/v2/requests/${open.id}/cancel`, { method: 'POST', body: new URLSearchParams({ reason }) }); closeDetail(); await load({ silent: true }); notify(t('requestUpdated')); } catch (err) { setDetailNotice({ message: err.message, type: 'error' }); } };
  const edit = async (values) => { try { const result = await json(`/api/dashboard/queue/v2/requests/${open.id}/edit`, { method: 'POST', body: new URLSearchParams({ production_points: String(values.productionPoints), priority: values.priority, tags: values.tags.join(','), brief: values.brief, notes: values.notes, references: JSON.stringify(values.references) }) }); setOpen(result.request); await load({ silent: true }); setDetailNotice({ message: t('requestUpdated'), type: 'success' }); return true; } catch (err) { setDetailNotice({ message: err.message, type: 'error' }); return false; } };
  const resend = async () => { try { const result = await json(`/api/dashboard/queue/v2/requests/${open.id}/notify`, { method: 'POST' }); setDetailNotice({ message: result.sent ? t('slackSent') : t('slackFailed'), type: result.sent ? 'success' : 'error' }); const events = await json(`/api/dashboard/queue/v2/requests/${open.id}/history`); setHistory(events.events || []); } catch (err) { setDetailNotice({ message: err.message, type: 'error' }); } };
  const upload = async (files) => { let current = open; let failures = 0; for (const file of files) { const body = new FormData(); body.append('file', file); try { const result = await json(`/api/dashboard/queue/v2/requests/${open.id}/attachments`, { method: 'POST', body }); current = result.request; } catch { failures += 1; } } setOpen(current); setDetailNotice({ message: failures ? t('uploadFailed') : t('filesUploaded'), type: failures ? 'error' : 'success' }); await load({ silent: true }); };
  const download = async (file) => { const response = await apiFetch(`${API_BASE}/api/dashboard/queue/v2/requests/${open.id}/attachments/${file.id}`); if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || 'Download failed.'); const blob = await response.blob(); const href = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = href; link.download = file.name; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(href), 30000); };

  return <main className="queue-page scheduler-page">
    <header className="queue-topbar"><div className="queue-brand"><CalendarDays size={22} /><div><span>sentientdash.app</span><h1>{t('productionQueue')}</h1></div></div><div className="queue-actions"><span className={`queue-live-status is-${liveStatus}`} title={liveStatus === 'live' ? t('liveConnected') : liveStatus === 'offline' ? t('liveOffline') : t('liveConnecting')}>{liveStatus === 'offline' ? <WifiOff size={12} /> : <Radio size={12} />}<b>{liveStatus === 'live' ? t('liveConnected') : liveStatus === 'offline' ? t('liveOffline') : t('liveConnecting')}</b></span><QueuePreferences />{data?.viewer?.isAdmin ? <button type="button" className={`queue-admin-button${adminOpen ? ' is-active' : ''}`} onClick={toggleAdminTools}><BarChart3 size={14} />{t('admin')}</button> : null}<a href={`${import.meta.env.BASE_URL}tracker.html`} target="_blank" rel="noreferrer">Tracker</a><a href={`${import.meta.env.BASE_URL}insights.html`} target="_blank" rel="noreferrer">Insights</a><span className="queue-nav-current" aria-current="page">Queue</span><a href={import.meta.env.BASE_URL} target="_blank" rel="noreferrer"><ArrowLeft size={14} />{t('dashboard')}</a><button type="button" className="queue-avatar" title={user.email} onClick={() => { clearSsoCookie(); signOut(auth); }}><LogOut size={14} /></button></div></header>
    {toast ? <div className={`queue-toast is-${toast.type}`} role="status">{toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}<span>{toast.message}</span><button type="button" onClick={() => setToast(null)}><X size={14} /></button></div> : null}
    {loading ? <section className="queue-state"><LoaderCircle className="queue-spin" /><p>{t('loadingSchedule')}</p></section> : null}
    {error ? <section className="queue-state queue-error"><p>{error}</p><button type="button" onClick={load}>{t('tryAgain')}</button></section> : null}
    {data ? <>{adminOpen ? <AdminTools report={report} loading={reportLoading} error={reportError} onClose={() => setAdminOpen(false)} onOpen={setOpen} /> : null}
      <section className="scheduler-toolbar"><div><p className="scheduler-eyebrow">{coordinator ? t('coordinatorSchedule') : t('mySchedule')}</p><h2>{displayDate(date, language)}</h2></div>{coordinator ? <label className="scheduler-designer-filter">{t('assignedView')}<select value={designerScope} onChange={(event) => setDesignerScope(event.target.value)}><option value="">{t('allUsers')}</option>{(data.schedulerUsers || data.designers).map((person) => <option key={person.email} value={person.email}>{person.email.split('@')[0]}</option>)}</select></label> : null}<div className="scheduler-nav"><button type="button" aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))}><ChevronLeft size={17} /></button><button type="button" onClick={() => setDate(DAY())}>{t('today')}</button><button type="button" aria-label="Next day" onClick={() => setDate(shiftDay(date, 1))}><ChevronRight size={17} /></button></div><button type="button" className={`scheduler-archive-toggle${archive ? ' is-on' : ''}`} onClick={() => setArchive((value) => !value)}><Archive size={14} />{archive ? t('liveQueue') : t('archive')}</button>{coordinator && draft.length ? <button type="button" className="scheduler-submit" onClick={submit}><Send size={14} />{t('submit')} {draft.length} {draft.length > 1 ? t('changes') : t('change')}</button> : null}</section>
      {coordinator && !archive ? <section className={`scheduler-pool${poolDropActive ? ' is-drop-target' : ''}`} onDragOver={poolDragOver} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPoolDropActive(false); }} onDrop={poolDrop} aria-label={t('poolDropHint')}><header><div><p className="scheduler-eyebrow">{t('productionPool')}</p><h2>{pool.length} {t('readyToSchedule')}</h2></div><small>{poolDropActive ? t('poolDropHint') : t('visibleSchedule')}</small></header><div className="scheduler-pool-list">{pool.map((task) => <PoolCard key={task.id} task={task} onOpen={setOpen} />)}{!pool.length ? <p className="scheduler-empty">{t('emptyPool')}</p> : null}</div></section> : null}
      {archive ? <section className="queue-archive-list"><header><p className="scheduler-eyebrow">{t('archive')}</p><h2>{archived.length} {t('cancelled')}</h2></header>{archived.length ? archived.map((task) => <button type="button" key={task.id} onClick={() => setOpen(task)}><span>{cover(task) ? <img src={cover(task)} alt="" /> : '@'}</span><div><b>@{task.post.account}</b><small>{task.cancellationReason || t('cancelled')}</small></div><em>{displayTimestamp(task.updatedAt, language)}</em></button>) : <p className="scheduler-empty">{t('noArchived')}</p>}</section> : <>{coordinator && draft.length ? <><DraftAccounts draft={draft} designers={data.designers} onAccountsChange={changeDraftAccounts} /><div className="scheduler-draft-actions"><span><Clock3 size={13} />{t('sharedDrafts')}</span><button type="button" onClick={clearDrafts}>{t('clearDrafts')}</button></div></> : null}<Scheduler data={data} draft={draft} setDraft={setDraft} onDraftChange={persistDrafts} selectedDate={date} designerScope={designerScope} onOpen={setOpen} onError={(message) => notify(message, 'error')} />{coordinator ? <AdminAssignmentTable tasks={upcoming} onOpen={setOpen} headingKey="upcomingProduction" countKey="activeRequests" /> : <DesignerAssignments tasks={assigned} onOpen={setOpen} />}</>}
    </> : null}
    <Detail task={open} tags={data?.tags || []} canCoordinate={coordinator} isOwner={open?.designerEmail === data?.viewer.email || data?.viewer.isAdmin} notice={detailNotice} history={history} historyLoading={historyLoading} onClose={closeDetail} onAction={action} onCancel={cancel} onEdit={edit} onNotify={resend} onUpload={upload} onDownload={download} />
    <DevRolePreview isDev={Boolean(viewer?.is_dev || data?.viewer?.isDev)} />
  </main>;
}

function Root() {
  const [user, setUser] = useState(undefined);
  const [notice, setNotice] = useState('');
  const [checked, setChecked] = useState(false);
  const [language, setLanguageState] = useState(() => window.localStorage.getItem('sentient.language') || (navigator.language.startsWith('es') ? 'es' : 'en'));
  const [theme, setThemeState] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');
  const [accent, setAccentState] = useState(() => window.localStorage.getItem('sentient.accent') || 'lime');
  const setLanguage = (value) => { window.localStorage.setItem('sentient.language', value); setLanguageState(value); };
  const setTheme = (value) => { window.localStorage.setItem('sentient.theme', value); document.documentElement.setAttribute('data-theme', value); setThemeState(value); };
  const setAccent = (value) => { window.localStorage.setItem('sentient.accent', value); document.documentElement.setAttribute('data-accent', value); setAccentState(value); };
  useEffect(() => { document.documentElement.setAttribute('data-accent', accent); }, [accent]);
  useEffect(() => { getRedirectResult(auth, browserPopupRedirectResolver).catch((error) => setNotice(describeSignInError(error))); }, []);
  useEffect(() => { trySsoSignIn().finally(() => setChecked(true)); }, []);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => user ? startSsoRefresh() : undefined, [user]);
  const value = useMemo(() => ({ language, theme, accent, setLanguage, setTheme, setAccent, t: (key) => COPY[language]?.[key] || COPY.en[key] || key }), [language, theme, accent]);
  const content = user === undefined || (!user && !checked) ? <main className="queue-auth" /> : user ? <QueueApp user={user} /> : <AuthGate notice={notice} setNotice={setNotice} />;
  return <QueuePreferencesContext.Provider value={value}><PrefsProvider lang={language} theme={theme}>{content}</PrefsProvider></QueuePreferencesContext.Provider>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><Root /></React.StrictMode>);
