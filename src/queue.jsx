import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  Archive,
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  GripVertical,
  ListTodo,
  LoaderCircle,
  Pencil,
  Square,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { browserPopupRedirectResolver, getRedirectResult, onAuthStateChanged, signOut } from 'firebase/auth';
import { describeSignInError, firebaseAuth as auth, startGoogleSignIn } from './firebase';
import { clearSsoCookie, startSsoRefresh, trySsoSignIn } from './sso';
import { applyLang, applyTheme, readLang, readTheme } from './prefs';
import { PrefsProvider } from './prefsContext';
import { PostDetailPanel, SelectedPost } from './postDetail';
import './queue.css';

const API_BASE = (import.meta.env.VITE_API_BASE || 'https://cortex-api-db2e.onrender.com').replace(/\/$/, '');

const COPY = {
  en: {
    queue: 'Queue', personal: 'My queue', team: 'Team overview', archive: 'Show archive', hideArchive: 'Hide archive',
    dashboard: 'Dashboard', signOut: 'Sign out', pending: 'pending', queueCol: 'Queue', progress: 'In progress',
    posted: 'Posted', noTasks: 'Nothing here yet.', assigned: 'Assigned posts', active: 'Active tasks',
    overview: 'Overview', due: 'Due', noDue: 'No due date', edit: 'Edit task', save: 'Save changes', cancel: 'Cancel',
    note: 'Brief or note', priority: 'Priority', tags: 'Tags', noPriority: 'No priority', low: 'Low', medium: 'Medium',
    high: 'High', urgent: 'Urgent', allUsers: 'Everyone', loading: 'Loading Queue…', retry: 'Try again',
    archived: 'Posted tasks auto-hide 24h after posting. Show archive to see older ones.', teamPending: 'team pending',
    close: 'Close', editTask: 'Edit task', moveTo: 'Move to', remove: 'Remove task',
    recommendedFor: 'Recommended for', noRecommendedAccount: 'No account', noRecommendedChange: 'Keep recommended account',
    board: 'Board', week: 'Week', filters: 'Filters', allPriorities: 'All priorities', allAccounts: 'All recommended accounts',
    allDueDates: 'All due dates', overdue: 'Overdue', noDate: 'No date', noRecommendation: 'No recommendation',
    risks: 'Needs attention', overloaded: 'Overloaded', activity: 'Activity', noActivity: 'No activity yet.',
    selectedTasks: 'selected', bulkEdit: 'Bulk edit', applyChanges: 'Apply changes', clearSelection: 'Clear', assignTo: 'Assign to',
    noAssigneeChange: 'Keep assignee', noChanges: 'Choose at least one field to update.', unscheduled: 'Unscheduled',
    confirmRemove: 'Remove this task for good? This cannot be undone.',
  },
  es: {
    queue: 'Queue', personal: 'Mi cola', team: 'Vista del equipo', archive: 'Ver archivo', hideArchive: 'Ocultar archivo',
    dashboard: 'Dashboard', signOut: 'Cerrar sesión', pending: 'pendientes', queueCol: 'Cola', progress: 'En progreso',
    posted: 'Publicado', noTasks: 'Todavía no hay tareas.', assigned: 'Posts asignados', active: 'Tareas activas',
    overview: 'Resumen', due: 'Fecha límite', noDue: 'Sin fecha límite', edit: 'Editar tarea', save: 'Guardar cambios', cancel: 'Cancelar',
    note: 'Brief o nota', priority: 'Prioridad', tags: 'Etiquetas', noPriority: 'Sin prioridad', low: 'Baja', medium: 'Media',
    high: 'Alta', urgent: 'Urgente', allUsers: 'Todo el equipo', loading: 'Cargando Queue…', retry: 'Reintentar',
    archived: 'Las tareas publicadas se ocultan solas 24h después. Activa "Ver archivo" para ver las más viejas.', teamPending: 'pendientes del equipo',
    close: 'Cerrar', editTask: 'Editar tarea', moveTo: 'Mover a', remove: 'Eliminar tarea',
    recommendedFor: 'Recomendado para', noRecommendedAccount: 'Sin cuenta', noRecommendedChange: 'Mantener cuenta recomendada',
    board: 'Tablero', week: 'Semana', filters: 'Filtros', allPriorities: 'Todas las prioridades', allAccounts: 'Todas las cuentas recomendadas',
    allDueDates: 'Todas las fechas', overdue: 'Vencidas', noDate: 'Sin fecha', noRecommendation: 'Sin recomendación',
    risks: 'Requiere atención', overloaded: 'Con demasiadas tareas', activity: 'Actividad', noActivity: 'Aún no hay actividad.',
    selectedTasks: 'seleccionadas', bulkEdit: 'Edición masiva', applyChanges: 'Aplicar cambios', clearSelection: 'Limpiar', assignTo: 'Asignar a',
    noAssigneeChange: 'Mantener responsable', noChanges: 'Elige al menos un campo para actualizar.', unscheduled: 'Sin fecha',
    confirmRemove: '¿Eliminar esta tarea para siempre? No se puede deshacer.',
  },
};

const STATUS_COLUMNS = [
  { value: 'queue', icon: ListTodo, color: 'queue', copyKey: 'queueCol' },
  { value: 'in_progress', icon: Clock3, color: 'progress', copyKey: 'progress' },
  { value: 'posted', icon: Check, color: 'posted', copyKey: 'posted' },
];
const TAGS = ['content', 'design', 'copy', 'research', 'review', 'repurpose'];

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (auth.currentUser) headers.set('Authorization', `Bearer ${await auth.currentUser.getIdToken()}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${response.status}).`);
  }
  return response.json();
}

function themeIcon(theme) {
  return theme === 'light' ? '☀︎' : '◐';
}

function initials(email) {
  return (email || '?').trim().slice(0, 2).toUpperCase();
}

function isoDate(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function weekMonday(value = new Date()) {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date;
}

function addDays(value, days) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function eventDescription(event, t) {
  const fields = event.details?.fields || [];
  if (event.type === 'assigned') return t.assignTo;
  if (event.type === 'assignment_refreshed') return t.bulkEdit;
  if (event.type === 'moved') return `${t.moveTo} ${event.details?.status || ''}`;
  if (event.type === 'bulk_updated') return `${t.bulkEdit}${fields.length ? ` · ${fields.join(', ')}` : ''}`;
  if (event.type === 'updated') return `${t.edit}${fields.length ? ` · ${fields.join(', ')}` : ''}`;
  return event.type.replace(/_/g, ' ');
}

// Adapts a Queue assignment's embedded post (account, shortcode, caption,
// permalink, publishedAt, likes, comments, type, coverUrl, missing, plus the
// music fields the backend now projects onto it) into the shape postDetail.jsx's
// shared components expect, so a Queue thumbnail opens the exact same
// deep-dive view as the main dashboard's right rail.
function toDetailPost(task) {
  const post = task?.post || {};
  const type = post.type || 'Image';
  return {
    ...post,
    postKey: `${post.account || 'unknown'}:${post.shortcode || task?.id}`,
    postType: type,
    isVideo: /^video/i.test(String(type)),
    postDate: post.publishedAt,
  };
}

function AuthGate({ notice, setNotice }) {
  const [working, setWorking] = useState(false);
  const signIn = async () => {
    setWorking(true);
    const err = await startGoogleSignIn();
    if (err) setNotice(describeSignInError(err));
    setWorking(false);
  };
  return (
    <main className="queue-auth">
      <section>
        <ListTodo size={26} />
        <h1>Sentient Queue</h1>
        <p>{notice || 'Sign in with your Google account to view your assigned posts.'}</p>
        <button type="button" onClick={signIn} disabled={working}>{working ? 'Signing in…' : 'Sign in with Google'}</button>
      </section>
    </main>
  );
}

function Prefs({ lang, setLang, theme, setTheme }) {
  return (
    <div className="queue-prefs">
      <div className="queue-lang" role="group" aria-label="Language">
        {['en', 'es'].map((code) => <button key={code} type="button" className={lang === code ? 'is-on' : ''} onClick={() => setLang(code)}>{code === 'en' ? 'ENG' : 'ES'}</button>)}
      </div>
      <button type="button" className="queue-theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">{themeIcon(theme)}</button>
    </div>
  );
}

function TaskCard({ task, t, showOwner, selectable = false, selected = false, draggable = true, onToggleSelect, onOpen, onEdit, onDragStart, onDropBefore, onContextMenu }) {
  const post = task.post || {};
  const [imageFailed, setImageFailed] = useState(false);
  const owner = showOwner ? task.assigneeEmail : null;
  return (
    <article
      className={`queue-thumb priority-${task.priority || 'none'}${owner ? ' has-owner' : ''}${selected ? ' is-selected' : ''}`}
      draggable={draggable}
      title={post.caption || (post.missing ? t.noTasks : `@${post.account || 'unknown'}`)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(task.id));
        if (draggable) onDragStart(task.id);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (draggable) onDropBefore(task.status, task.id);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu(event, task);
      }}
    >
      {/* The image keeps its own square box (.queue-thumb-media) so the
          owner bar below is added height, not an overlay that crops the
          cover photo -- the whole point of showing it is to see the post,
          owner label included. */}
      <div className="queue-thumb-media">
        <button type="button" className="queue-thumb-open" onClick={() => onOpen(task)} aria-label={t.editTask}>
          {post.coverUrl && !imageFailed
            ? <img src={`${API_BASE}${post.coverUrl}`} alt="" onError={() => setImageFailed(true)} />
            : <div className="queue-cover-empty">@</div>}
        </button>
        <span className="queue-drag"><GripVertical size={12} /></span>
        {task.priority ? <span className={`queue-priority ${task.priority}`}>{t[task.priority]}</span> : null}
        {selectable ? (
          <button
            type="button"
            className="queue-thumb-select"
            aria-label={selected ? t.clearSelection : t.bulkEdit}
            onClick={(event) => { event.stopPropagation(); onToggleSelect(task.id); }}
          >
            {selected ? <CheckSquare size={13} /> : <Square size={13} />}
          </button>
        ) : null}
        <button type="button" className="queue-thumb-edit" onClick={() => onEdit(task)} aria-label={t.edit}><Pencil size={10} /></button>
      </div>
      {/* Full-width bar rather than a round avatar chip -- at thumbnail size
          a circle only has room for two letters, while a bar spanning the
          card can show enough of the owner's name to actually identify them
          in Team overview, where a card could belong to any teammate. */}
      {owner ? <span className="queue-thumb-owner" title={owner}>{owner.split('@')[0]}</span> : null}
      <div className="queue-thumb-objective">
        <span className={task.recommendedAccount ? '' : 'is-empty'}>{task.recommendedAccount ? `→ @${task.recommendedAccount}` : t.noRecommendation}</span>
        {task.note ? <small title={task.note}>{task.note}</small> : null}
      </div>
    </article>
  );
}

// Small right-click menu for a task thumbnail: jump straight to another
// stage (skipping drag-and-drop), open the full editor, or delete the task
// outright. Closes itself on an outside click, Escape, or scroll so it never
// lingers over a stale position.
function TaskContextMenu({ menu, t, onMove, onEdit, onRemove, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const handlePointer = (event) => { if (ref.current && !ref.current.contains(event.target)) onClose(); };
    const handleKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    document.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);
  const { task, x, y } = menu;
  const otherStages = STATUS_COLUMNS.filter((column) => column.value !== task.status);
  return (
    <div className="queue-context-menu" ref={ref} style={{ top: y, left: x }} role="menu">
      {otherStages.map((column) => {
        const Icon = column.icon;
        return (
          <button type="button" key={column.value} role="menuitem" onClick={() => onMove(task, column.value)}>
            <Icon size={13} />{t.moveTo} {t[column.copyKey]}
          </button>
        );
      })}
      <span className="queue-context-sep" />
      <button type="button" role="menuitem" onClick={() => onEdit(task)}><Pencil size={13} />{t.edit}</button>
      <span className="queue-context-sep" />
      <button type="button" role="menuitem" className="is-danger" onClick={() => onRemove(task)}><Trash2 size={13} />{t.remove}</button>
    </div>
  );
}

function TaskEditor({ task, t, recommendedAccounts, onClose, onSaved }) {
  const [status, setStatus] = useState(task.status);
  const [note, setNote] = useState(task.note || '');
  const [priority, setPriority] = useState(task.priority || '');
  const [dueDate, setDueDate] = useState(task.dueDate || '');
  const [recommendedAccount, setRecommendedAccount] = useState(task.recommendedAccount || '');
  const [tags, setTags] = useState(() => new Set(task.tags || []));
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const toggleTag = (tag) => setTags((current) => {
    const next = new Set(current);
    if (next.has(tag)) next.delete(tag); else next.add(tag);
    return next;
  });
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/dashboard/queue/tasks/${task.id}/history`)
      .then((result) => { if (!cancelled) setHistory(result.events || []); })
      .catch(() => { if (!cancelled) setHistory([]); });
    return () => { cancelled = true; };
  }, [task.id]);
  const save = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const body = new FormData();
      body.append('status', status); body.append('note', note); body.append('priority', priority);
      body.append('due_date', dueDate); body.append('tags', [...tags].join(','));
      body.append('recommended_account', recommendedAccount);
      await apiFetch(`/api/dashboard/queue/tasks/${task.id}`, { method: 'POST', body });
      onSaved();
    } catch (reason) {
      setError(reason.message || 'Could not save this Queue task.');
    } finally { setSaving(false); }
  };
  return (
    <div className="queue-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form className="queue-editor" onSubmit={save}>
        <div className="queue-editor-head"><div><span>@{task.post.account}</span><h2>{t.edit}</h2></div><button type="button" onClick={onClose} disabled={saving}><X size={16} /></button></div>
        <div className="queue-editor-fields">
          <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="queue">{t.queueCol}</option><option value="in_progress">{t.progress}</option><option value="posted">{t.posted}</option></select></label>
          <label><span>{t.priority}</span><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">{t.noPriority}</option>{['low', 'medium', 'high', 'urgent'].map((value) => <option value={value} key={value}>{t[value]}</option>)}</select></label>
          <label><span>{t.due}</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          <label><span>{t.recommendedFor}</span><select value={recommendedAccount} onChange={(event) => setRecommendedAccount(event.target.value)}><option value="">{t.noRecommendedAccount}</option>{recommendedAccounts.map((account) => <option key={account.handle} value={account.handle}>@{account.handle}</option>)}</select></label>
        </div>
        <label className="queue-editor-note"><span>{t.note}</span><textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <fieldset><legend>{t.tags}</legend><div className="queue-editor-tags">{TAGS.map((tag) => <button type="button" key={tag} className={tags.has(tag) ? 'is-on' : ''} onClick={() => toggleTag(tag)}>{tag}</button>)}</div></fieldset>
        <section className="queue-history">
          <h3>{t.activity}</h3>
          {history.length ? history.slice(0, 8).map((event, index) => (
            <p key={`${event.createdAt}-${index}`}>
              <strong>{eventDescription(event, t)}</strong>
              <span>{event.actorEmail} · {new Date(event.createdAt).toLocaleString()}</span>
            </p>
          )) : <p className="queue-history-empty">{t.noActivity}</p>}
        </section>
        {error ? <p className="queue-error">{error}</p> : null}
        <div className="queue-editor-actions"><button type="button" onClick={onClose} disabled={saving}>{t.cancel}</button><button type="submit" className="primary" disabled={saving}>{saving ? '…' : t.save}</button></div>
      </form>
    </div>
  );
}

function WeekPlanner({ tasks, weekStart, onWeekChange, onOpen, t }) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const today = isoDate();
  const unscheduled = tasks.filter((task) => !task.dueDate);
  return (
    <section className="queue-week-plan">
      <header>
        <div><CalendarDays size={15} /><strong>{t.week}</strong><span>{weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {addDays(weekStart, 6).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div>
        <div className="queue-week-nav"><button type="button" onClick={() => onWeekChange(addDays(weekStart, -7))} aria-label="Previous week"><ChevronLeft size={15} /></button><button type="button" onClick={() => onWeekChange(weekMonday())}>Today</button><button type="button" onClick={() => onWeekChange(addDays(weekStart, 7))} aria-label="Next week"><ChevronRight size={15} /></button></div>
      </header>
      <div className="queue-week-grid">
        {days.map((day) => {
          const date = isoDate(day);
          const dueTasks = tasks.filter((task) => task.dueDate === date);
          return <section key={date} className={date === today ? 'is-today' : ''}>
            <h3>{day.toLocaleDateString(undefined, { weekday: 'short' })}<span>{day.getDate()}</span></h3>
            <div>{dueTasks.map((task) => <button type="button" key={task.id} className={`queue-week-task priority-${task.priority || 'none'}`} onClick={() => onOpen(task)}><strong>{task.recommendedAccount ? `→ @${task.recommendedAccount}` : `@${task.post?.account || '?'}`}</strong><span>{task.note || task.post?.caption || t.noRecommendation}</span></button>)}</div>
          </section>;
        })}
      </div>
      {unscheduled.length ? <div className="queue-unscheduled"><strong>{t.unscheduled}</strong>{unscheduled.map((task) => <button type="button" key={task.id} onClick={() => onOpen(task)}>@{task.recommendedAccount || task.post?.account || '?'}<span>{task.note || task.post?.caption || ''}</span></button>)}</div> : null}
    </section>
  );
}

function BulkEditor({ count, users, accounts, t, onApply, onClear }) {
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [recommendedAccount, setRecommendedAccount] = useState('');
  const [tags, setTags] = useState(() => new Set());
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const toggleTag = (tag) => setTags((current) => {
    const next = new Set(current);
    if (next.has(tag)) next.delete(tag); else next.add(tag);
    return next;
  });
  const submit = async (event) => {
    event.preventDefault();
    const changes = { assignee, priority, dueDate, recommendedAccount, tags: [...tags] };
    if (!assignee && !priority && !dueDate && !recommendedAccount && !tags.size) { setError(t.noChanges); return; }
    setWorking(true); setError('');
    try { await onApply(changes); } catch (reason) { setError(reason.message || 'Could not update the selected tasks.'); } finally { setWorking(false); }
  };
  return (
    <form className="queue-bulk-editor" onSubmit={submit}>
      <div className="queue-bulk-title"><CheckSquare size={16} /><strong>{count} {t.selectedTasks}</strong><span>{t.bulkEdit}</span><button type="button" onClick={onClear}>{t.clearSelection}</button></div>
      <div className="queue-bulk-fields">
        <label><span>{t.assignTo}</span><select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">{t.noAssigneeChange}</option>{users.map((user) => <option key={user.email} value={user.email}>{user.email}</option>)}</select></label>
        <label><span>{t.recommendedFor}</span><select value={recommendedAccount} onChange={(event) => setRecommendedAccount(event.target.value)}><option value="">{t.noRecommendedChange}</option>{accounts.map((account) => <option key={account.handle} value={account.handle}>@{account.handle}</option>)}</select></label>
        <label><span>{t.priority}</span><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">{t.allPriorities}</option>{['low', 'medium', 'high', 'urgent'].map((value) => <option key={value} value={value}>{t[value]}</option>)}</select></label>
        <label><span>{t.due}</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
      </div>
      <div className="queue-bulk-tags">{TAGS.map((tag) => <button type="button" key={tag} className={tags.has(tag) ? 'is-on' : ''} onClick={() => toggleTag(tag)}>{tag}</button>)}</div>
      {error ? <p className="queue-error">{error}</p> : null}
      <button className="queue-bulk-apply" type="submit" disabled={working}>{working ? '…' : t.applyChanges}</button>
    </form>
  );
}

function QueueApp({ user }) {
  const [lang, setLang] = useState(readLang);
  const [theme, setTheme] = useState(readTheme);
  const [data, setData] = useState(null);
  const [scope, setScope] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draggingId, setDraggingId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [openTask, setOpenTask] = useState(null);
  const [menu, setMenu] = useState(null);
  const [view, setView] = useState('board');
  const [filters, setFilters] = useState({ recommended: '', priority: '', due: 'all' });
  const [selectedTasks, setSelectedTasks] = useState(() => new Set());
  const [weekStart, setWeekStart] = useState(() => weekMonday());
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const t = COPY[lang];

  useEffect(() => { applyLang(lang); }, [lang]);
  useEffect(() => { applyTheme(theme); }, [theme]);

  const load = useCallback(async (nextScope = scopeRef.current, nextArchive = showArchive) => {
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams();
      if (nextScope) query.set('assignee', nextScope);
      if (nextArchive) query.set('include_posted', 'true');
      const result = await apiFetch(`/api/dashboard/queue${query.size ? `?${query}` : ''}`);
      setData(result);
      if (!scopeRef.current) setScope(result.scope || user.email);
    } catch (reason) {
      setError(reason.message || 'Could not load Queue.');
    } finally { setLoading(false); }
  }, [showArchive, user.email]);

  useEffect(() => { load(scope, showArchive); }, [load, scope, showArchive]);

  const assignments = data?.assignments || [];
  const today = isoDate();
  const activeAssignments = useMemo(() => assignments.filter((task) => task.status !== 'posted'), [assignments]);
  const riskSummary = useMemo(() => {
    const overdue = activeAssignments.filter((task) => task.dueDate && task.dueDate < today).length;
    const noDate = activeAssignments.filter((task) => !task.dueDate).length;
    const noRecommendation = activeAssignments.filter((task) => !task.recommendedAccount).length;
    const perUser = activeAssignments.reduce((all, task) => ({ ...all, [task.assigneeEmail]: (all[task.assigneeEmail] || 0) + 1 }), {});
    const overloaded = Object.values(perUser).filter((count) => count > 5).length;
    return { overdue, noDate, noRecommendation, overloaded };
  }, [activeAssignments, today]);
  const visibleAssignments = useMemo(() => assignments.filter((task) => {
    if (filters.recommended && task.recommendedAccount !== filters.recommended) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.due === 'overdue' && !(task.dueDate && task.dueDate < today && task.status !== 'posted')) return false;
    if (filters.due === 'no_date' && task.dueDate) return false;
    if (filters.due === 'no_recommendation' && task.recommendedAccount) return false;
    return true;
  }), [assignments, filters, today]);
  const columns = useMemo(() => STATUS_COLUMNS.map((column) => ({ ...column, tasks: visibleAssignments.filter((task) => task.status === column.value) })), [visibleAssignments]);
  const isAdmin = Boolean(data?.viewer?.isAdmin);

  const toggleTaskSelection = (taskId) => setSelectedTasks((current) => {
    const next = new Set(current);
    if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
    return next;
  });

  const bulkUpdate = async (changes) => {
    const body = new FormData();
    body.append('task_ids', [...selectedTasks].join(','));
    if (changes.assignee) body.append('assignee', changes.assignee);
    if (changes.priority) body.append('priority', changes.priority);
    if (changes.dueDate) body.append('due_date', changes.dueDate);
    if (changes.recommendedAccount) body.append('recommended_account', changes.recommendedAccount);
    if (changes.tags.length) body.append('tags', changes.tags.join(','));
    await apiFetch('/api/dashboard/queue/bulk-update', { method: 'POST', body });
    setSelectedTasks(new Set());
    await load(scope, showArchive);
  };

  const move = async (status, beforeId = null) => {
    if (!draggingId) return;
    const source = assignments.find((task) => task.id === draggingId);
    if (!source) return;
    const destination = assignments.filter((task) => task.status === status && task.id !== draggingId);
    const index = beforeId ? destination.findIndex((task) => task.id === beforeId) : destination.length;
    destination.splice(index < 0 ? destination.length : index, 0, { ...source, status });
    // Optimistic position makes the board feel immediate; a refresh restores
    // server order if another tab moved a task at the same moment.
    setData((current) => current ? {
      ...current,
      assignments: current.assignments.map((task) => task.id === draggingId ? { ...task, status } : task),
    } : current);
    setDraggingId(null);
    try {
      const body = new FormData(); body.append('status', status); body.append('task_ids', destination.map((task) => task.id).join(','));
      await apiFetch('/api/dashboard/queue/reorder', { method: 'POST', body });
      await load(scope, showArchive);
    } catch (reason) { setError(reason.message || 'Could not move that Queue task.'); await load(scope, showArchive); }
  };

  // Right-click menu: jumps a single task to another stage without going
  // through drag-and-drop, using the same update-task endpoint TaskEditor
  // already saves through (so no new backend route was needed for moves).
  const openMenu = (event, task) => {
    const width = 190;
    const height = 190;
    setMenu({
      task,
      x: Math.min(event.clientX, window.innerWidth - width - 8),
      y: Math.min(event.clientY, window.innerHeight - height - 8),
    });
  };
  const moveTaskStatus = async (task, status) => {
    setMenu(null);
    if (task.status === status) return;
    setData((current) => current ? {
      ...current,
      assignments: current.assignments.map((item) => item.id === task.id ? { ...item, status } : item),
    } : current);
    try {
      const body = new FormData(); body.append('status', status);
      await apiFetch(`/api/dashboard/queue/tasks/${task.id}`, { method: 'POST', body });
      await load(scope, showArchive);
    } catch (reason) { setError(reason.message || 'Could not move that Queue task.'); await load(scope, showArchive); }
  };
  const removeTask = async (task) => {
    setMenu(null);
    if (!window.confirm(t.confirmRemove)) return;
    setData((current) => current ? { ...current, assignments: current.assignments.filter((item) => item.id !== task.id) } : current);
    try {
      await apiFetch(`/api/dashboard/queue/tasks/${task.id}`, { method: 'DELETE' });
    } catch (reason) { setError(reason.message || 'Could not remove that Queue task.'); }
    await load(scope, showArchive);
  };

  const userName = (email) => email === user.email ? `${email} (${t.personal})` : email;
  const metrics = data?.metrics;
  return (
    <main className="queue-page">
      <header className="queue-topbar">
        <div className="queue-brand"><ListTodo size={23} /><div><span>sentientdash.app</span><h1>{t.queue}</h1></div></div>
        <div className="queue-actions"><a href={`${import.meta.env.BASE_URL}`}><ArrowLeft size={14} />{t.dashboard}</a><Prefs lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} /><button className="queue-avatar" type="button" title={user.email} onClick={() => { clearSsoCookie(); signOut(auth); }}>{initials(user.email)}</button></div>
      </header>

      <section className="queue-toolbar">
        <div><h2>{isAdmin && scope === 'all' ? t.team : t.personal}</h2><p>{metrics?.pending || 0} {isAdmin && scope === 'all' ? t.teamPending : t.pending}</p></div>
        <div className="queue-toolbar-actions">
          {isAdmin ? <label className="queue-scope"><Users size={14} /><select value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">{t.allUsers}</option>{data?.users?.map((entry) => <option key={entry.email} value={entry.email}>{userName(entry.email)}</option>)}</select></label> : null}
          <button type="button" className={showArchive ? 'is-on' : ''} onClick={() => setShowArchive((value) => !value)}><Archive size={14} />{showArchive ? t.hideArchive : t.archive}</button>
        </div>
      </section>

      {isAdmin && scope === 'all' && metrics ? <section className="queue-overview"><div><span>{t.active}</span><strong>{metrics.pending}</strong></div><div><span>{t.queueCol}</span><strong>{metrics.queue}</strong></div><div><span>{t.progress}</span><strong>{metrics.inProgress}</strong></div><div><span>{t.posted}</span><strong>{metrics.posted}</strong></div><div className="queue-overview-users"><span>{t.overview}</span>{metrics.byUser.slice(0, 8).map((entry) => <button type="button" key={entry.email} onClick={() => setScope(entry.email)}><i>{initials(entry.email)}</i>{entry.email}<b>{entry.pending}</b></button>)}</div></section> : null}

      {data ? <section className="queue-operations">
        <div className="queue-view-toggle"><button type="button" className={view === 'board' ? 'is-on' : ''} onClick={() => setView('board')}><ListTodo size={14} />{t.board}</button><button type="button" className={view === 'week' ? 'is-on' : ''} onClick={() => setView('week')}><CalendarDays size={14} />{t.week}</button></div>
        <div className="queue-filters" aria-label={t.filters}>
          <select value={filters.recommended} onChange={(event) => setFilters((current) => ({ ...current, recommended: event.target.value }))}><option value="">{t.allAccounts}</option>{data.recommendedAccounts?.map((account) => <option key={account.handle} value={account.handle}>@{account.handle}</option>)}</select>
          <select value={filters.priority} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}><option value="">{t.allPriorities}</option>{['low', 'medium', 'high', 'urgent'].map((value) => <option key={value} value={value}>{t[value]}</option>)}</select>
          <select value={filters.due} onChange={(event) => setFilters((current) => ({ ...current, due: event.target.value }))}><option value="all">{t.allDueDates}</option><option value="overdue">{t.overdue}</option><option value="no_date">{t.noDate}</option><option value="no_recommendation">{t.noRecommendation}</option></select>
        </div>
      </section> : null}

      {data ? <section className="queue-risks"><span><AlertTriangle size={14} />{t.risks}</span><button type="button" className={filters.due === 'overdue' ? 'is-on' : ''} onClick={() => setFilters((current) => ({ ...current, due: 'overdue' }))}>{riskSummary.overdue} {t.overdue}</button><button type="button" className={filters.due === 'no_date' ? 'is-on' : ''} onClick={() => setFilters((current) => ({ ...current, due: 'no_date' }))}>{riskSummary.noDate} {t.noDate}</button><button type="button" className={filters.due === 'no_recommendation' ? 'is-on' : ''} onClick={() => setFilters((current) => ({ ...current, due: 'no_recommendation' }))}>{riskSummary.noRecommendation} {t.noRecommendation}</button>{riskSummary.overloaded ? <span className="queue-risk-overload">{riskSummary.overloaded} {t.overloaded}</span> : null}</section> : null}

      {isAdmin && selectedTasks.size ? <BulkEditor count={selectedTasks.size} users={data?.users || []} accounts={data?.recommendedAccounts || []} t={t} onApply={bulkUpdate} onClear={() => setSelectedTasks(new Set())} /> : null}

      {error ? <section className="queue-state queue-error"><p>{error}</p><button type="button" onClick={() => load(scope, showArchive)}>{t.retry}</button></section> : null}
      {loading && !data ? <section className="queue-state"><LoaderCircle className="queue-spin" size={22} /><p>{t.loading}</p></section> : null}
      {data && view === 'board' ? <section className="queue-board">{columns.map((column) => {
        const Icon = column.icon;
        return <section key={column.value} className={`queue-column ${column.color}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); move(column.value); }}>
          <header><div><Icon size={15} /><h3>{t[column.copyKey]}</h3><span>{column.tasks.length}</span></div>{column.value === 'posted' && !showArchive ? <p>{t.archived}</p> : null}</header>
          <div className="queue-task-list">{column.tasks.map((task) => <TaskCard key={task.id} task={task} t={t} showOwner={isAdmin && scope === 'all'} selectable={isAdmin} selected={selectedTasks.has(task.id)} onToggleSelect={toggleTaskSelection} onOpen={setOpenTask} onEdit={setEditing} onDragStart={setDraggingId} onDropBefore={move} onContextMenu={openMenu} />)}{!column.tasks.length ? <p className="queue-empty">{t.noTasks}</p> : null}</div>
        </section>;
      })}</section> : null}
      {data && view === 'week' ? <WeekPlanner tasks={visibleAssignments.filter((task) => task.status !== 'posted')} weekStart={weekStart} onWeekChange={setWeekStart} onOpen={setOpenTask} t={t} /> : null}
      {/* Same right-rail markup/CSS classes as the main dashboard's post
          detail view (App.jsx), so a task's deep dive here looks and
          behaves identically -- fixed panel, backdrop, close button, cover
          + caption/stats grid. The only Queue-specific addition is the
          "Edit task" button, injected the same way App.jsx injects its
          chatgptricks-only Canva link: via PostDetailPanel's captionExtra
          slot, so the shared component itself stays untouched. */}
      {openTask ? (
        <button className="sidebar-backdrop" type="button" aria-label={t.close} onClick={() => setOpenTask(null)} />
      ) : null}
      {data ? (
        <aside className={openTask ? 'right-rail is-open' : 'right-rail'} aria-label={t.editTask} aria-hidden={!openTask}>
          {openTask ? (
            <button className="rail-close-button" type="button" aria-label={t.close} onClick={() => setOpenTask(null)}>
              <X size={14} />
            </button>
          ) : null}
          <section className="panel detail">
            {openTask ? <SelectedPost post={toDetailPost(openTask)} /> : null}
          </section>
          {openTask ? (
            <PrefsProvider lang={lang} theme={theme}>
              <PostDetailPanel
                post={toDetailPost(openTask)}
                captionExtra={
                  <button type="button" className="ghost-button" onClick={() => { setEditing(openTask); setOpenTask(null); }}>
                    <Pencil size={13} />{t.editTask}
                  </button>
                }
              />
            </PrefsProvider>
          ) : null}
        </aside>
      ) : null}
      {editing ? <TaskEditor task={editing} t={t} recommendedAccounts={data?.recommendedAccounts || []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(scope, showArchive); }} /> : null}
      {menu ? (
        <TaskContextMenu
          menu={menu}
          t={t}
          onMove={moveTaskStatus}
          onEdit={(task) => { setMenu(null); setEditing(task); }}
          onRemove={removeTask}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </main>
  );
}

function Root() {
  const [user, setUser] = useState(undefined);
  const [notice, setNotice] = useState('');
  const [ssoChecked, setSsoChecked] = useState(false);
  useEffect(() => { getRedirectResult(auth, browserPopupRedirectResolver).catch((error) => setNotice(describeSignInError(error))); }, []);
  // Same-session-everywhere: adopt the shared .sentientdash.app cookie
  // (minted by the main dashboard) before ever showing the Google gate here.
  useEffect(() => { trySsoSignIn().finally(() => setSsoChecked(true)); }, []);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => { if (user) return startSsoRefresh(); return undefined; }, [user]);
  // While the silent cookie-based sign-in is still in flight, show a blank
  // screen rather than flashing the "Sign in with Google" gate.
  if (user === undefined || (!user && !ssoChecked)) return <main className="queue-auth" />;
  if (!user) return <AuthGate notice={notice} setNotice={setNotice} />;
  return <QueueApp user={user} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><Root /></React.StrictMode>);
