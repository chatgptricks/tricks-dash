import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { AlertTriangle, Archive, ArrowLeft, BarChart3, BellRing, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, History, LoaderCircle, LogOut, Moon, Palette, Paperclip, Pencil, Send, Settings, Sun, X } from 'lucide-react';
import { browserPopupRedirectResolver, getRedirectResult, onAuthStateChanged, signOut } from 'firebase/auth';
import { describeSignInError, firebaseAuth as auth, startGoogleSignIn } from './firebase';
import { clearSsoCookie, startSsoRefresh, trySsoSignIn } from './sso';
import { API_BASE, apiFetch } from './api';
import { PrefsProvider } from './prefsContext';
import { SelectedPost, SlideDownload } from './postDetail';
import { QUEUE_DAY_END, QUEUE_DAY_START, isDeadlineRisk, planQueueDrop } from './queuePlanner';
import './queue.css';

const DAY = (value = new Date()) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const shiftDay = (date, amount) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + amount); return DAY(value); };
const time = (minutes) => { const normalized = ((minutes % 1440) + 1440) % 1440; return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`; };
const currentMinutes = (value = new Date()) => value.getHours() * 60 + value.getMinutes();
const cover = (task) => task?.post?.coverUrl ? `${API_BASE}${task.post.coverUrl}` : '';
const locale = (language) => language === 'es' ? 'es-CR' : 'en-US';
const displayDate = (value, language) => new Date(`${value}T12:00:00`).toLocaleDateString(locale(language), { weekday: 'long', month: 'short', day: 'numeric' });
const displayDeadline = (value, language) => new Date(value).toLocaleString(locale(language), { timeZone: 'America/Costa_Rica', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const DRAFT_KEY = 'sentient.queueDrafts.v2';

const COPY = {
  en: {
    productionQueue: 'Production Queue', dashboard: 'Dashboard', admin: 'Admin', coordinatorSchedule: 'Coordinator schedule', mySchedule: 'My production schedule', today: 'Today', submit: 'Submit', change: 'change', changes: 'changes', productionPool: 'Production pool', readyToSchedule: 'ready to schedule', visibleSchedule: 'Drag requests into the visible 12-hour schedule.', emptyPool: 'No requests are waiting in the pool.', myAssignedWork: 'My assigned work', upcomingProduction: 'Upcoming production', activeRequest: 'active request', activeRequests: 'active requests', noActiveAssignments: 'No active assignments', emptyAssignments: 'When a coordinator schedules work for you, it will appear here.', post: 'Post', scheduled: 'Scheduled', deadline: 'Deadline', scope: 'Scope', status: 'Status', noTags: 'No tags', designer: 'Designer', now: 'Now', loadingSchedule: 'Loading schedule…', tryAgain: 'Try again', queueAccess: 'Queue is available to production coordinators and designers.', rolePreview: 'Role preview', onlyEsteban: 'Only visible to Esteban.', activeRole: 'Active role', devFullAccess: 'Dev · full access', postDesigner: 'Post Designer', viralCoordinator: 'Viral Coordinator', productionReports: 'Production reports', adminWorkspace: 'Admin workspace', loadingReport: 'Loading report…', inPool: 'In pool', inProgress: 'In progress', readyToClose: 'Ready to close', closed: 'Closed', cancelled: 'Cancelled', designerWorkload: 'Designer workload', workloadHelp: 'Active work, delivery health and actual production time.', openSettings: 'Open dashboard settings', startWork: 'Start work', markComplete: 'Mark complete', publishedLink: 'Published Instagram link', closeRequest: 'Close request', returnInProgress: 'Return to in progress', openPublished: 'Open published post', cancellationReason: 'Cancellation reason (optional)', cancelRequest: 'Cancel request', brief: 'Brief', notes: 'Notes', references: 'References', minutes: 'minutes', sourcePost: 'Source post', assignment: 'Assignment', recommendedAccounts: 'Recommended accounts', editRequest: 'Edit request', saveChanges: 'Save changes', cancel: 'Cancel', productionPoints: 'Production points', tags: 'Tags', referenceLinks: 'Reference links', oneLinkPerLine: 'One link per line', signIn: 'Sign in with Google', signingIn: 'Signing in…', signInHelp: 'Sign in with Google to open your production schedule.', allDesigners: 'All designers', noAccounts: 'No accounts yet', noRecommendedAccount: 'No recommended account', unsavedDrafts: 'Draft schedule changes are saved in this browser.', clearDrafts: 'Discard drafts', archive: 'Archive', liveQueue: 'Live Queue', noArchived: 'No cancelled requests.', extra: 'EXTRA', overdue: 'OVERDUE', atRisk: 'AT RISK', attachments: 'Files & references', uploadFiles: 'Upload files', noFiles: 'No files attached.', history: 'Activity history', noHistory: 'No activity yet.', resendSlack: 'Resend Slack DM', slackSent: 'Slack DM sent.', slackFailed: 'Slack DM failed. Check the user Slack ID and try again.', requestUpdated: 'Request updated.', scheduleSubmitted: 'Schedule submitted.', deliveryHealth: 'Delivery health', onTime: 'On-time rate', averageTime: 'Average actual time', completedJobs: 'Closed jobs', draftsSaved: 'Drafts saved', movedJobs: 'reflowed jobs', close: 'Close', filesUploaded: 'Files uploaded.', deadlineError: 'This request cannot fit before its deadline.', invalidDay: 'Requests can be scheduled today through the next five days.', assignedView: 'Designer view', uploadFailed: 'Some files could not be uploaded.', sourceCaption: 'Source caption', cancelledReason: 'Cancellation reason', draftWarning: 'You have unsubmitted Queue changes.',
  },
  es: {
    productionQueue: 'Cola de producción', dashboard: 'Dashboard', admin: 'Admin', coordinatorSchedule: 'Agenda de coordinación', mySchedule: 'Mi agenda de producción', today: 'Hoy', submit: 'Enviar', change: 'cambio', changes: 'cambios', productionPool: 'Pool de producción', readyToSchedule: 'listos para programar', visibleSchedule: 'Arrastra los requests al horario visible de 12 horas.', emptyPool: 'No hay requests esperando en el pool.', myAssignedWork: 'Mi trabajo asignado', upcomingProduction: 'Próxima producción', activeRequest: 'request activo', activeRequests: 'requests activos', noActiveAssignments: 'No tienes asignaciones activas', emptyAssignments: 'Cuando un coordinador programe trabajo para ti, aparecerá aquí.', post: 'Post', scheduled: 'Programado', deadline: 'Deadline', scope: 'Alcance', status: 'Estado', noTags: 'Sin tags', designer: 'Designer', now: 'Ahora', loadingSchedule: 'Cargando agenda…', tryAgain: 'Intentar de nuevo', queueAccess: 'Queue está disponible para coordinadores y diseñadores de producción.', rolePreview: 'Vista de rol', onlyEsteban: 'Visible solo para Esteban.', activeRole: 'Rol activo', devFullAccess: 'Dev · acceso completo', postDesigner: 'Post Designer', viralCoordinator: 'Viral Coordinator', productionReports: 'Reportes de producción', adminWorkspace: 'Espacio Admin', loadingReport: 'Cargando reporte…', inPool: 'En pool', inProgress: 'En progreso', readyToClose: 'Listo para cerrar', closed: 'Cerrado', cancelled: 'Cancelado', designerWorkload: 'Carga por designer', workloadHelp: 'Trabajo activo, salud de entrega y tiempo real de producción.', openSettings: 'Abrir Settings del dashboard', startWork: 'Empezar trabajo', markComplete: 'Marcar como completado', publishedLink: 'Link publicado de Instagram', closeRequest: 'Cerrar request', returnInProgress: 'Volver a en progreso', openPublished: 'Abrir post publicado', cancellationReason: 'Motivo de cancelación (opcional)', cancelRequest: 'Cancelar request', brief: 'Brief', notes: 'Notas', references: 'Referencias', minutes: 'minutos', sourcePost: 'Post original', assignment: 'Asignación', recommendedAccounts: 'Cuentas recomendadas', editRequest: 'Editar request', saveChanges: 'Guardar cambios', cancel: 'Cancelar', productionPoints: 'Puntos de producción', tags: 'Tags', referenceLinks: 'Links de referencia', oneLinkPerLine: 'Un link por línea', signIn: 'Iniciar sesión con Google', signingIn: 'Iniciando sesión…', signInHelp: 'Inicia sesión con Google para abrir tu agenda de producción.', allDesigners: 'Todos los designers', noAccounts: 'Sin cuentas todavía', noRecommendedAccount: 'Sin cuenta recomendada', unsavedDrafts: 'Los cambios del scheduler se guardan en este navegador.', clearDrafts: 'Descartar cambios', archive: 'Archivo', liveQueue: 'Queue activo', noArchived: 'No hay requests cancelados.', extra: 'EXTRA', overdue: 'VENCIDO', atRisk: 'EN RIESGO', attachments: 'Archivos y referencias', uploadFiles: 'Subir archivos', noFiles: 'No hay archivos adjuntos.', history: 'Historial de actividad', noHistory: 'Todavía no hay actividad.', resendSlack: 'Reenviar DM de Slack', slackSent: 'DM de Slack enviado.', slackFailed: 'Falló el DM de Slack. Revisa el Slack ID del usuario e intenta de nuevo.', requestUpdated: 'Request actualizado.', scheduleSubmitted: 'Scheduler enviado.', deliveryHealth: 'Salud de entrega', onTime: 'Entregas a tiempo', averageTime: 'Tiempo real promedio', completedJobs: 'Trabajos cerrados', draftsSaved: 'Cambios guardados', movedJobs: 'trabajos reacomodados', close: 'Cerrar', filesUploaded: 'Archivos subidos.', deadlineError: 'Este request no cabe antes de su deadline.', invalidDay: 'Solo se puede programar desde hoy hasta los próximos cinco días.', assignedView: 'Vista de designer', uploadFailed: 'Algunos archivos no pudieron subirse.', sourceCaption: 'Caption original', cancelledReason: 'Motivo de cancelación', draftWarning: 'Tienes cambios de Queue sin enviar.',
  },
};

const QueuePreferencesContext = createContext({ language: 'en', t: (key) => key });
const useQueuePreferences = () => useContext(QueuePreferencesContext);
const statusCopy = (status, t) => ({ pool: t('inPool'), scheduled: t('scheduled'), in_progress: t('inProgress'), completed: t('readyToClose'), closed: t('closed'), cancelled: t('cancelled') }[status] || status);

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
  const active = window.localStorage.getItem('sentient.queueRolePreview') || '';
  if (!isDev) return null;
  const label = { sales: 'Sales', pd: t('postDesigner'), vc: t('viralCoordinator'), admin: t('admin') }[active] || 'Dev';
  const choose = (event) => { const role = event.target.value; if (role) window.localStorage.setItem('sentient.queueRolePreview', role); else window.localStorage.removeItem('sentient.queueRolePreview'); window.location.reload(); };
  return <div className="dev-role-preview"><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}><span>DEV</span>{label}</button>{open ? <div className="dev-role-preview-panel"><strong>{t('rolePreview')}</strong><p>{t('onlyEsteban')}</p><label>{t('activeRole')}<select value={active} onChange={choose}><option value="">{t('devFullAccess')}</option><option value="sales">Sales</option><option value="pd">{t('postDesigner')}</option><option value="vc">{t('viralCoordinator')}</option><option value="admin">{t('admin')}</option></select></label></div> : null}</div>;
}

function RiskBadge({ task }) {
  const { t } = useQueuePreferences();
  const risk = isDeadlineRisk(task);
  return risk ? <span className={`queue-risk-badge is-${risk}`}><AlertTriangle size={11} />{risk === 'overdue' ? t('overdue') : t('atRisk')}</span> : null;
}

function TaskBlock({ task, editable, onOpen, viewStart }) {
  const { t } = useQueuePreferences();
  const left = (task.scheduledStartMinutes ?? QUEUE_DAY_START) - viewStart;
  const planned = task.durationMinutes || 10;
  let width = planned;
  if (['completed', 'closed'].includes(task.status) && task.actualStartedAt && task.completedAt) width = Math.min(planned, Math.max(10, Math.round((new Date(task.completedAt) - new Date(task.actualStartedAt)) / 60000)));
  const extra = (task.scheduledStartMinutes ?? 0) + width > QUEUE_DAY_END;
  const risk = isDeadlineRisk(task);
  return <button type="button" draggable={editable && task.status === 'scheduled'} className={`scheduler-block state-${task.status}${extra ? ' is-extra' : ''}${risk ? ` is-${risk}` : ''}`} style={{ left: `${(left / 720) * 100}%`, width: `${(width / 720) * 100}%` }} onDragStart={(event) => event.dataTransfer.setData('queue-task', String(task.id))} onClick={() => onOpen(task)} title={`${task.post.account} · ${task.productionPoints} PP · ${statusCopy(task.status, t)}`}>
    {cover(task) ? <img src={cover(task)} alt="" /> : null}<span className="scheduler-block-copy"><b>@{task.post.account}</b><small>{task.productionPoints} PP · {time(task.scheduledStartMinutes || QUEUE_DAY_START)}</small></span>{extra ? <span className="scheduler-extra">{t('extra')}</span> : null}{task.recommendedAccounts?.length ? <span className="scheduler-account-bubbles">{task.recommendedAccounts.map((account) => <i key={account} title={`@${account}`}>@{account.slice(0, 1)}</i>)}</span> : null}
  </button>;
}

function PoolCard({ task, onOpen }) {
  const { language } = useQueuePreferences();
  const risk = isDeadlineRisk(task);
  return <article className={`queue-pool-card${risk ? ` is-${risk}` : ''}`} draggable onDragStart={(event) => event.dataTransfer.setData('queue-task', String(task.id))}><button type="button" onClick={() => onOpen(task)}>{cover(task) ? <img src={cover(task)} alt="" /> : <span className="queue-pool-empty">@</span>}<span><b>@{task.post.account}</b><small>{task.productionPoints} PP · {task.durationMinutes} min</small><em>{displayDeadline(task.deadlineAt, language)}</em></span><RiskBadge task={task} /></button><div>{task.tags?.map((tag) => <i key={tag}>{tag}</i>)}</div></article>;
}

function DesignerAssignments({ tasks, onOpen }) {
  const { t, language } = useQueuePreferences();
  return <section className="designer-assignments"><header><div><p className="scheduler-eyebrow">{t('myAssignedWork')}</p><h2>{t('upcomingProduction')}</h2></div><small>{tasks.length} {tasks.length === 1 ? t('activeRequest') : t('activeRequests')}</small></header>{tasks.length ? <div className="designer-assignment-table" role="table"><div className="designer-assignment-head" role="row"><span>{t('post')}</span><span>{t('scheduled')}</span><span>{t('deadline')}</span><span>{t('scope')}</span><span>{t('status')}</span></div>{tasks.map((task) => <button type="button" role="row" key={task.id} className={`designer-assignment-row state-${task.status}${isDeadlineRisk(task) ? ` is-${isDeadlineRisk(task)}` : ''}`} onClick={() => onOpen(task)}><span className="designer-assignment-post">{cover(task) ? <img src={cover(task)} alt="" /> : <span className="designer-assignment-empty">@</span>}<span><b>@{task.post.account}</b><small>{task.brief || task.post.caption || t('post')}</small></span></span><span className="designer-assignment-time"><b>{displayDate(task.scheduledDate, language)}</b><small>{time(task.scheduledStartMinutes ?? QUEUE_DAY_START)} · {task.durationMinutes} {t('minutes')}</small></span><span className="designer-assignment-deadline"><b>{displayDeadline(task.deadlineAt, language)}</b><RiskBadge task={task} /></span><span className="designer-assignment-pp"><b>{task.productionPoints} PP</b><small>{task.tags?.slice(0, 2).join(' · ') || t('noTags')}</small></span><span className="designer-assignment-status"><i>{statusCopy(task.status, t)}</i></span></button>)}</div> : <div className="designer-assignments-empty"><CalendarDays size={18} /><strong>{t('noActiveAssignments')}</strong><span>{t('emptyAssignments')}</span></div>}</section>;
}

function AdminTools({ report, loading, error, onClose }) {
  const { t } = useQueuePreferences();
  const totals = report?.totals || {};
  const metric = (status, label) => <div key={status}><span>{label}</span><strong>{totals[status]?.count || 0}</strong><small>{totals[status]?.points || 0} PP</small></div>;
  return <section className="queue-admin-tools"><header><div><p className="scheduler-eyebrow">{t('adminWorkspace')}</p><h2>{t('productionReports')}</h2></div><button type="button" onClick={onClose} aria-label={t('close')}><X size={16} /></button></header>{loading ? <div className="queue-admin-loading"><LoaderCircle className="queue-spin" />{t('loadingReport')}</div> : null}{error ? <p className="queue-admin-error">{error}</p> : null}{report ? <><div className="queue-admin-metrics">{metric('pool', t('inPool'))}{metric('scheduled', t('scheduled'))}{metric('in_progress', t('inProgress'))}{metric('completed', t('readyToClose'))}{metric('closed', t('closed'))}<div><span>{t('overdue')}</span><strong>{report.performance?.overdue || 0}</strong><small>{t('deliveryHealth')}</small></div><div><span>{t('onTime')}</span><strong>{report.performance?.onTimeRate == null ? '—' : `${report.performance.onTimeRate}%`}</strong><small>{t('completedJobs')}</small></div></div><div className="queue-admin-designers"><div><h3>{t('designerWorkload')}</h3><p>{t('workloadHelp')}</p></div><div className="queue-admin-designer-list">{report.designers.map((designer) => <span key={designer.email}><b>{designer.email.split('@')[0]}</b><small>{designer.activeRequests} {t('activeRequests')} · {designer.productionPoints} PP · {designer.overdueRequests} {t('overdue')}</small><em>{designer.closedRequests} {t('closed')} · {designer.onTimeRate == null ? '—' : `${designer.onTimeRate}%`} {t('onTime')} · {designer.averageActualMinutes == null ? '—' : `${designer.averageActualMinutes} min`} {t('averageTime')}</em></span>)}</div></div><a className="queue-admin-settings" href={`${import.meta.env.BASE_URL}?view=admin`} target="_blank" rel="noreferrer"><Settings size={14} />{t('openSettings')}</a></> : null}</section>;
}

function costaRicaInputDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value;
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}`;
}

function AttachmentList({ task, busy, onUpload, onDownload }) {
  const { t } = useQueuePreferences();
  return <section className="queue-detail-section"><h3><Paperclip size={13} />{t('attachments')}</h3>{task.attachments?.length ? <div className="queue-attachments">{task.attachments.map((file) => <button type="button" key={file.id} disabled={busy} onClick={() => onDownload(file)}><Download size={13} /><span>{file.name}</span><small>{Math.max(1, Math.round(file.size / 1024))} KB</small></button>)}</div> : <p className="queue-detail-empty">{t('noFiles')}</p>}<label className="queue-upload-button"><Paperclip size={13} />{t('uploadFiles')}<input type="file" multiple disabled={busy} onChange={(event) => { onUpload([...event.target.files]); event.target.value = ''; }} /></label></section>;
}

function HistoryList({ events, loading }) {
  const { t, language } = useQueuePreferences();
  return <section className="queue-detail-section"><h3><History size={13} />{t('history')}</h3>{loading ? <LoaderCircle className="queue-spin" size={16} /> : events?.length ? <ol className="queue-history">{events.map((event, index) => <li key={`${event.createdAt}-${index}`}><span className={`history-dot type-${event.type}`} /><div><b>{event.type.replaceAll('_', ' ')}</b><small>{event.actorEmail?.split('@')[0]} · {displayDeadline(event.createdAt, language)}</small></div></li>)}</ol> : <p className="queue-detail-empty">{t('noHistory')}</p>}</section>;
}

function Detail({ task, tags, canCoordinate, isOwner, notice, history, historyLoading, onClose, onAction, onCancel, onEdit, onNotify, onUpload, onDownload }) {
  const { t, language } = useQueuePreferences();
  const [link, setLink] = useState(task?.finalPermalink || '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  useEffect(() => { setLink(task?.finalPermalink || ''); setReason(''); setEditing(false); setForm({ productionPoints: task?.productionPoints || 1, deadlineAt: costaRicaInputDate(task?.deadlineAt), tags: task?.tags || [], brief: task?.brief || '', notes: task?.notes || '', references: task?.references?.join('\n') || '' }); }, [task?.id]);
  useEffect(() => { if (!task) return undefined; const close = (event) => { if (event.key === 'Escape') onClose(); }; document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, [task, onClose]);
  if (!task) return null;
  const run = async (callback) => { setBusy(true); try { await callback(); } finally { setBusy(false); } };
  const save = () => run(async () => { const saved = await onEdit({ ...form, productionPoints: Number(form.productionPoints), references: form.references.split('\n').map((item) => item.trim()).filter(Boolean) }); if (saved) setEditing(false); });
  const metric = (label, value) => <div className="metric" key={label}><span>{label}</span><strong>{value || '—'}</strong></div>;
  const toggleTag = (tag) => setForm((current) => ({ ...current, tags: current.tags.includes(tag) ? current.tags.filter((item) => item !== tag) : [...current.tags, tag] }));
  return <><button className="sidebar-backdrop" type="button" onClick={onClose} aria-label={t('close')} /><aside className="right-rail is-open queue-request-rail" role="dialog" aria-modal="true" aria-label="Queue request details"><button className="rail-close-button" type="button" onClick={onClose} aria-label={t('close')}><X size={16} /></button><section className="panel detail"><SelectedPost post={queuePost(task)} /><span className="queue-detail-status">{statusCopy(task.status, t)}</span></section><section className="panel caption-panel queue-rail-caption"><header className="panel-header caption-header"><div><p className="section-label">{editing ? t('editRequest') : t('sourceCaption')}</p><h2>@{task.post.account}</h2></div>{canCoordinate && !editing && task.status !== 'cancelled' ? <button type="button" className="ghost-button" onClick={() => setEditing(true)} title={t('editRequest')}><Pencil size={15} />{t('editRequest')}</button> : null}</header>{notice ? <p className={`queue-detail-notice is-${notice.type || 'success'}`}>{notice.message}</p> : null}{editing ? <div className="queue-detail-editor"><label>{t('productionPoints')}<input type="number" min="1" value={form.productionPoints || ''} onChange={(event) => setForm((current) => ({ ...current, productionPoints: event.target.value }))} /></label><label>{t('deadline')}<input type="datetime-local" value={form.deadlineAt || ''} onChange={(event) => setForm((current) => ({ ...current, deadlineAt: event.target.value }))} /></label><fieldset><legend>{t('tags')}</legend><div className="queue-tag-picker">{tags.map((tag) => <button type="button" key={tag} className={form.tags.includes(tag) ? 'is-on' : ''} onClick={() => toggleTag(tag)}>{tag}</button>)}</div></fieldset><label>{t('brief')}<textarea value={form.brief || ''} onChange={(event) => setForm((current) => ({ ...current, brief: event.target.value }))} /></label><label>{t('notes')}<textarea value={form.notes || ''} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label><label>{t('referenceLinks')}<textarea value={form.references || ''} onChange={(event) => setForm((current) => ({ ...current, references: event.target.value }))} placeholder={t('oneLinkPerLine')} /></label></div> : <div className="queue-detail-scroll"><div className="queue-detail-copy"><p>{task.brief || task.post.caption || '—'}</p>{task.notes ? <section><h3>{t('notes')}</h3><p>{task.notes}</p></section> : null}{task.references?.length ? <section><h3>{t('references')}</h3>{task.references.map((item) => <a key={item} href={item} target="_blank" rel="noreferrer">{item}</a>)}</section> : null}{task.cancellationReason ? <section><h3>{t('cancelledReason')}</h3><p>{task.cancellationReason}</p></section> : null}</div><SlideDownload post={queuePost(task)} /><AttachmentList task={task} busy={busy} onUpload={(files) => run(() => onUpload(files))} onDownload={(file) => run(() => onDownload(file))} /><HistoryList events={history} loading={historyLoading} /></div>}<footer className="queue-detail-actions">{editing ? <><button className="scheduler-primary" disabled={busy || !form.productionPoints || !form.deadlineAt} onClick={save}>{t('saveChanges')}</button><button className="scheduler-secondary" disabled={busy} onClick={() => setEditing(false)}>{t('cancel')}</button></> : <>{task.status === 'scheduled' && isOwner ? <button className="scheduler-primary" disabled={busy} onClick={() => run(() => onAction('start'))}>{t('startWork')}</button> : null}{task.status === 'in_progress' && isOwner ? <button className="scheduler-primary" disabled={busy} onClick={() => run(() => onAction('complete'))}>{t('markComplete')}</button> : null}{task.status === 'completed' && isOwner ? <div className="scheduler-close-form"><label>{t('publishedLink')}<input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://instagram.com/p/..." /></label><button className="scheduler-primary" disabled={busy || !link.trim()} onClick={() => run(() => onAction('close', link))}>{t('closeRequest')}</button><button className="scheduler-secondary" disabled={busy} onClick={() => run(() => onAction('start'))}>{t('returnInProgress')}</button></div> : null}{task.status === 'closed' && task.finalPermalink ? <a className="scheduler-primary" href={task.finalPermalink} target="_blank" rel="noreferrer">{t('openPublished')}</a> : null}{canCoordinate && task.designerEmail && task.status !== 'cancelled' ? <button className="scheduler-secondary" disabled={busy} onClick={() => run(onNotify)}><BellRing size={14} />{t('resendSlack')}</button> : null}{canCoordinate && !['closed', 'cancelled'].includes(task.status) ? <div className="scheduler-cancel"><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('cancellationReason')} /><button className="scheduler-danger" disabled={busy} onClick={() => run(() => onCancel(reason))}>{t('cancelRequest')}</button></div> : null}</>}</footer></section><section className="panel stats-panel">{metric(t('assignment'), task.designerEmail?.split('@')[0] || statusCopy(task.status, t))}{metric(t('deadline'), displayDeadline(task.deadlineAt, language))}{metric(t('scope'), `${task.productionPoints} PP · ${task.durationMinutes} ${t('minutes')}`)}{metric(t('recommendedAccounts'), task.recommendedAccounts?.map((account) => `@${account}`).join(' · '))}</section></aside></>;
}

function Scheduler({ data, draft, setDraft, selectedDate, designerScope, onOpen, onError }) {
  const { t } = useQueuePreferences();
  const coordinator = data.viewer.isAdmin || data.viewer.operatingRoles?.includes('vc');
  const [now, setNow] = useState(() => new Date());
  const [dropPreview, setDropPreview] = useState(null);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 15000); return () => window.clearInterval(timer); }, []);
  const today = selectedDate === DAY(now);
  const viewStart = currentMinutes(now) - 180;
  const earliestStart = today ? Math.ceil(currentMinutes(now) / 10) * 10 : QUEUE_DAY_START;
  const allTasks = [...data.requests.filter((task) => !draft.some((entry) => entry.id === task.id)), ...draft];
  const visibleDesigners = designerScope ? data.designers.filter((designer) => designer.email === designerScope) : data.designers;
  const planForEvent = (event, designer) => {
    const id = Number(event.dataTransfer.getData('queue-task'));
    const source = allTasks.find((task) => task.id === id);
    if (!source || source.status === 'in_progress') return { ok: false, error: 'This request cannot be moved.' };
    const rect = event.currentTarget.getBoundingClientRect();
    const pointer = Math.round(((((event.clientX - rect.left) / rect.width) * 720) + viewStart) / 10) * 10;
    return planQueueDrop({ tasks: allTasks, target: source, designerEmail: designer, scheduledDate: selectedDate, desiredStart: pointer, notBefore: earliestStart });
  };
  const previewDrop = (event, designer) => { event.preventDefault(); if (!coordinator) return; const result = planForEvent(event, designer); setDropPreview(result.ok ? { designer, ...result } : null); };
  const drop = (event, designer) => {
    event.preventDefault(); if (!coordinator) return;
    if (selectedDate < DAY() || selectedDate > shiftDay(DAY(), 5)) { setDropPreview(null); onError(t('invalidDay')); return; }
    const result = planForEvent(event, designer); setDropPreview(null);
    if (!result.ok) { onError(result.error || t('deadlineError')); return; }
    setDraft((current) => {
      const currentById = new Map(current.map((task) => [task.id, task]));
      result.tasks.forEach((task) => {
        const previous = allTasks.find((item) => item.id === task.id);
        if (!previous || previous.designerEmail !== task.designerEmail || previous.scheduledDate !== task.scheduledDate || previous.scheduledStartMinutes !== task.scheduledStartMinutes || task.id === result.target.id) currentById.set(task.id, task);
      });
      return [...currentById.values()];
    });
  };
  const merged = (designer) => allTasks.filter((task) => task.designerEmail === designer && task.scheduledDate === selectedDate && !['pool', 'cancelled'].includes(task.status));
  const nowPosition = ((currentMinutes(now) - viewStart) / 720) * 100;
  return <section className="scheduler"><div className="scheduler-time-head"><span>{t('designer')}</span><div>{Array.from({ length: 13 }, (_, hour) => <b key={hour} style={{ left: `${hour * (100 / 12)}%` }}>{time(viewStart + hour * 60)}</b>)}</div></div>{visibleDesigners.map((designer) => <div className="scheduler-row" key={designer.email}><header><b>{designer.email.split('@')[0]}</b><small>{designer.accounts?.map((account) => `@${account}`).join(' · ') || t('noAccounts')}</small></header><div className="scheduler-track" onDragOver={(event) => previewDrop(event, designer.email)} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropPreview(null); }} onDrop={(event) => drop(event, designer.email)}>{Array.from({ length: 13 }, (_, hour) => <i key={hour} style={{ left: `${hour * (100 / 12)}%` }} />)}{today ? <span className="scheduler-now" style={{ left: `${nowPosition}%` }}><b>{t('now')}</b></span> : null}{dropPreview?.designer === designer.email ? <span className="scheduler-drop-preview" style={{ left: `${((dropPreview.target.scheduledStartMinutes - viewStart) / 720) * 100}%`, width: `${(dropPreview.target.durationMinutes / 720) * 100}%` }}><b>@{dropPreview.target.post.account}</b><small>{time(dropPreview.target.scheduledStartMinutes)} · {dropPreview.target.durationMinutes} min{dropPreview.tasks.length > 1 ? ` · ${dropPreview.tasks.length - 1} ${t('movedJobs')}` : ''}</small></span> : null}{merged(designer.email).map((task) => <TaskBlock key={task.id} task={task} editable={coordinator} onOpen={onOpen} viewStart={viewStart} />)}</div></div>)}</section>;
}

function DraftAccounts({ draft, designers, accountChoice, setAccountChoice }) {
  const { t, language } = useQueuePreferences();
  const toggle = (task, account) => setAccountChoice((current) => { const selected = current[task.id] || task.recommendedAccounts || []; return { ...current, [task.id]: selected.includes(account) ? selected.filter((item) => item !== account) : [...selected, account] }; });
  return <section className="scheduler-drafts"><header><div><b>{t('draftsSaved')}</b><small>{t('unsavedDrafts')}</small></div></header>{draft.map((task) => { const designer = designers.find((item) => item.email === task.designerEmail); const selected = accountChoice[task.id] || task.recommendedAccounts || []; return <article key={task.id}><div><b>@{task.post.account} → {designer?.email.split('@')[0]}</b><small>{displayDate(task.scheduledDate, language)} · {time(task.scheduledStartMinutes)} · {task.productionPoints} PP</small></div><fieldset><legend>{t('recommendedAccounts')}</legend>{designer?.accounts?.length ? designer.accounts.map((account) => <label key={account}><input type="checkbox" checked={selected.includes(account)} onChange={() => toggle(task, account)} /><span>@{account}</span></label>) : <small>{t('noRecommendedAccount')}</small>}</fieldset></article>; })}</section>;
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
  const [accountChoice, setAccountChoice] = useState({});
  const [adminOpen, setAdminOpen] = useState(false);
  const [archive, setArchive] = useState(false);
  const [designerScope, setDesignerScope] = useState('');
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');

  const notify = useCallback((message, type = 'success') => { setToast({ message, type }); window.setTimeout(() => setToast(null), 6000); }, []);
  const load = useCallback(async () => { setLoading(true); try { const next = await json(`/api/dashboard/queue/v2?date=${date}&archive=${archive ? 'true' : 'false'}`); setData(next); setError(''); } catch (err) { setError(err.message || 'Queue could not load.'); } finally { setLoading(false); } }, [date, archive]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { json('/api/dashboard/me').then(setViewer).catch(() => {}); }, []);
  useEffect(() => { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); }, [draft]);
  useEffect(() => { const warn = (event) => { if (!draft.length) return; event.preventDefault(); event.returnValue = t('draftWarning'); }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [draft.length, t]);
  useEffect(() => { const id = Number(new URLSearchParams(window.location.search).get('task')); if (!id) return; json(`/api/dashboard/queue/v2/requests/${id}`).then(({ request }) => { setOpen(request); if (request.scheduledDate) setDate(request.scheduledDate); }).catch((err) => notify(err.message, 'error')); }, [notify]);
  useEffect(() => { if (!open?.id) { setHistory([]); return; } setDetailNotice(null); setHistoryLoading(true); json(`/api/dashboard/queue/v2/requests/${open.id}/history`).then((result) => setHistory(result.events || [])).catch(() => setHistory([])).finally(() => setHistoryLoading(false)); }, [open?.id]);

  const coordinator = data?.viewer && (data.viewer.isAdmin || data.viewer.operatingRoles?.includes('vc'));
  const pool = useMemo(() => data?.requests.filter((task) => task.status === 'pool') || [], [data]);
  const archived = useMemo(() => data?.requests.filter((task) => task.status === 'cancelled') || [], [data]);
  const assigned = data?.assignedRequests || [];
  const toggleAdminTools = async () => { const next = !adminOpen; setAdminOpen(next); if (!next || reportLoading) return; setReportLoading(true); setReportError(''); try { setReport(await json('/api/dashboard/queue/v2/admin-report')); } catch (err) { setReportError(err.message || 'Could not load the admin report.'); } finally { setReportLoading(false); } };
  const submit = async () => { try { const changes = draft.map((task) => ({ id: task.id, designerEmail: task.designerEmail, scheduledDate: task.scheduledDate, scheduledStartMinutes: task.scheduledStartMinutes, recommendedAccounts: accountChoice[task.id] || task.recommendedAccounts || [] })); const result = await json('/api/dashboard/queue/v2/submit', { method: 'POST', body: new URLSearchParams({ changes: JSON.stringify(changes) }) }); setDraft([]); setAccountChoice({}); window.localStorage.removeItem(DRAFT_KEY); await load(); const sent = result.notifications?.sent || 0; const failed = result.notifications?.failed || 0; notify(`${t('scheduleSubmitted')} ${sent} DM${sent === 1 ? '' : 's'} sent${failed ? ` · ${failed} failed` : ''}.`, failed ? 'warning' : 'success'); } catch (err) { notify(err.message, 'error'); } };
  const action = async (actionName, value) => { try { const body = value ? new URLSearchParams(actionName === 'close' ? { final_permalink: value } : {}) : undefined; await json(`/api/dashboard/queue/v2/requests/${open.id}/${actionName}`, { method: 'POST', body }); setOpen(null); await load(); notify(t('requestUpdated')); } catch (err) { setDetailNotice({ message: err.message, type: 'error' }); } };
  const cancel = async (reason) => { try { await json(`/api/dashboard/queue/v2/requests/${open.id}/cancel`, { method: 'POST', body: new URLSearchParams({ reason }) }); setOpen(null); await load(); notify(t('requestUpdated')); } catch (err) { setDetailNotice({ message: err.message, type: 'error' }); } };
  const edit = async (values) => { try { const result = await json(`/api/dashboard/queue/v2/requests/${open.id}/edit`, { method: 'POST', body: new URLSearchParams({ production_points: String(values.productionPoints), deadline_at: values.deadlineAt, tags: values.tags.join(','), brief: values.brief, notes: values.notes, references: JSON.stringify(values.references) }) }); setOpen(result.request); await load(); setDetailNotice({ message: t('requestUpdated'), type: 'success' }); return true; } catch (err) { setDetailNotice({ message: err.message, type: 'error' }); return false; } };
  const resend = async () => { try { const result = await json(`/api/dashboard/queue/v2/requests/${open.id}/notify`, { method: 'POST' }); setDetailNotice({ message: result.sent ? t('slackSent') : t('slackFailed'), type: result.sent ? 'success' : 'error' }); const events = await json(`/api/dashboard/queue/v2/requests/${open.id}/history`); setHistory(events.events || []); } catch (err) { setDetailNotice({ message: err.message, type: 'error' }); } };
  const upload = async (files) => { let current = open; let failures = 0; for (const file of files) { const body = new FormData(); body.append('file', file); try { const result = await json(`/api/dashboard/queue/v2/requests/${open.id}/attachments`, { method: 'POST', body }); current = result.request; } catch { failures += 1; } } setOpen(current); setDetailNotice({ message: failures ? t('uploadFailed') : t('filesUploaded'), type: failures ? 'error' : 'success' }); await load(); };
  const download = async (file) => { const response = await apiFetch(`${API_BASE}/api/dashboard/queue/v2/requests/${open.id}/attachments/${file.id}`); if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || 'Download failed.'); const blob = await response.blob(); const href = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = href; link.download = file.name; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(href), 30000); };

  return <main className="queue-page scheduler-page">
    <header className="queue-topbar"><div className="queue-brand"><CalendarDays size={22} /><div><span>sentientdash.app</span><h1>{t('productionQueue')}</h1></div></div><div className="queue-actions"><QueuePreferences />{data?.viewer?.isAdmin ? <button type="button" className={`queue-admin-button${adminOpen ? ' is-active' : ''}`} onClick={toggleAdminTools}><BarChart3 size={14} />{t('admin')}</button> : null}<a href={`${import.meta.env.BASE_URL}tracker.html`} target="_blank" rel="noreferrer">Tracker</a><a href={`${import.meta.env.BASE_URL}insights.html`} target="_blank" rel="noreferrer">Insights</a><span className="queue-nav-current" aria-current="page">Queue</span><a href={import.meta.env.BASE_URL} target="_blank" rel="noreferrer"><ArrowLeft size={14} />{t('dashboard')}</a><button type="button" className="queue-avatar" title={user.email} onClick={() => { clearSsoCookie(); signOut(auth); }}><LogOut size={14} /></button></div></header>
    {toast ? <div className={`queue-toast is-${toast.type}`} role="status">{toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}<span>{toast.message}</span><button type="button" onClick={() => setToast(null)}><X size={14} /></button></div> : null}
    {loading ? <section className="queue-state"><LoaderCircle className="queue-spin" /><p>{t('loadingSchedule')}</p></section> : null}
    {error ? <section className="queue-state queue-error"><p>{error}</p><button type="button" onClick={load}>{t('tryAgain')}</button></section> : null}
    {data ? <>{adminOpen ? <AdminTools report={report} loading={reportLoading} error={reportError} onClose={() => setAdminOpen(false)} /> : null}
      <section className="scheduler-toolbar"><div><p className="scheduler-eyebrow">{coordinator ? t('coordinatorSchedule') : t('mySchedule')}</p><h2>{displayDate(date, language)}</h2></div>{coordinator ? <label className="scheduler-designer-filter">{t('assignedView')}<select value={designerScope} onChange={(event) => setDesignerScope(event.target.value)}><option value="">{t('allDesigners')}</option>{data.designers.map((designer) => <option key={designer.email} value={designer.email}>{designer.email.split('@')[0]}</option>)}</select></label> : null}<div className="scheduler-nav"><button type="button" aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))}><ChevronLeft size={17} /></button><button type="button" onClick={() => setDate(DAY())}>{t('today')}</button><button type="button" aria-label="Next day" onClick={() => setDate(shiftDay(date, 1))}><ChevronRight size={17} /></button></div><button type="button" className={`scheduler-archive-toggle${archive ? ' is-on' : ''}`} onClick={() => setArchive((value) => !value)}><Archive size={14} />{archive ? t('liveQueue') : t('archive')}</button>{coordinator && draft.length ? <button type="button" className="scheduler-submit" onClick={submit}><Send size={14} />{t('submit')} {draft.length} {draft.length > 1 ? t('changes') : t('change')}</button> : null}</section>
      {coordinator && !archive ? <section className="scheduler-pool"><header><div><p className="scheduler-eyebrow">{t('productionPool')}</p><h2>{pool.length} {t('readyToSchedule')}</h2></div><small>{t('visibleSchedule')}</small></header><div className="scheduler-pool-list">{pool.map((task) => <PoolCard key={task.id} task={task} onOpen={setOpen} />)}{!pool.length ? <p className="scheduler-empty">{t('emptyPool')}</p> : null}</div></section> : null}
      {archive ? <section className="queue-archive-list"><header><p className="scheduler-eyebrow">{t('archive')}</p><h2>{archived.length} {t('cancelled')}</h2></header>{archived.length ? archived.map((task) => <button type="button" key={task.id} onClick={() => setOpen(task)}><span>{cover(task) ? <img src={cover(task)} alt="" /> : '@'}</span><div><b>@{task.post.account}</b><small>{task.cancellationReason || t('cancelled')}</small></div><em>{displayDeadline(task.updatedAt, language)}</em></button>) : <p className="scheduler-empty">{t('noArchived')}</p>}</section> : <>{coordinator && draft.length ? <><DraftAccounts draft={draft} designers={data.designers} accountChoice={accountChoice} setAccountChoice={setAccountChoice} /><div className="scheduler-draft-actions"><span><Clock3 size={13} />{t('unsavedDrafts')}</span><button type="button" onClick={() => { setDraft([]); setAccountChoice({}); }}>{t('clearDrafts')}</button></div></> : null}<Scheduler data={data} draft={draft} setDraft={setDraft} selectedDate={date} designerScope={designerScope} onOpen={setOpen} onError={(message) => notify(message, 'error')} />{!coordinator ? <DesignerAssignments tasks={assigned} onOpen={setOpen} /> : null}</>}
    </> : null}
    <Detail task={open} tags={data?.tags || []} canCoordinate={coordinator} isOwner={open?.designerEmail === data?.viewer.email || data?.viewer.isAdmin} notice={detailNotice} history={history} historyLoading={historyLoading} onClose={() => setOpen(null)} onAction={action} onCancel={cancel} onEdit={edit} onNotify={resend} onUpload={upload} onDownload={download} />
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
