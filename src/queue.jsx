import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  Archive,
  ArrowLeft,
  Check,
  Clock3,
  ExternalLink,
  GripVertical,
  ListTodo,
  LoaderCircle,
  Pencil,
  Plus,
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

function TaskCard({ task, t, showOwner, onOpen, onEdit, onDragStart, onDropBefore, onContextMenu }) {
  const post = task.post || {};
  const [imageFailed, setImageFailed] = useState(false);
  const owner = showOwner ? task.assigneeEmail : null;
  return (
    <article
      className={`queue-thumb priority-${task.priority || 'none'}${owner ? ' has-owner' : ''}`}
      draggable
      title={post.caption || (post.missing ? t.noTasks : `@${post.account || 'unknown'}`)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(task.id));
        onDragStart(task.id);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDropBefore(task.status, task.id);
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
        <button type="button" className="queue-thumb-edit" onClick={() => onEdit(task)} aria-label={t.edit}><Pencil size={10} /></button>
      </div>
      {/* Full-width bar rather than a round avatar chip -- at thumbnail size
          a circle only has room for two letters, while a bar spanning the
          card can show enough of the owner's name to actually identify them
          in Team overview, where a card could belong to any teammate. */}
      {owner ? <span className="queue-thumb-owner" title={owner}>{owner.split('@')[0]}</span> : null}
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

function TaskEditor({ task, t, onClose, onSaved }) {
  const [status, setStatus] = useState(task.status);
  const [note, setNote] = useState(task.note || '');
  const [priority, setPriority] = useState(task.priority || '');
  const [dueDate, setDueDate] = useState(task.dueDate || '');
  const [tags, setTags] = useState(() => new Set(task.tags || []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const toggleTag = (tag) => setTags((current) => {
    const next = new Set(current);
    if (next.has(tag)) next.delete(tag); else next.add(tag);
    return next;
  });
  const save = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const body = new FormData();
      body.append('status', status); body.append('note', note); body.append('priority', priority);
      body.append('due_date', dueDate); body.append('tags', [...tags].join(','));
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
        </div>
        <label className="queue-editor-note"><span>{t.note}</span><textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <fieldset><legend>{t.tags}</legend><div className="queue-editor-tags">{TAGS.map((tag) => <button type="button" key={tag} className={tags.has(tag) ? 'is-on' : ''} onClick={() => toggleTag(tag)}>{tag}</button>)}</div></fieldset>
        {error ? <p className="queue-error">{error}</p> : null}
        <div className="queue-editor-actions"><button type="button" onClick={onClose} disabled={saving}>{t.cancel}</button><button type="submit" className="primary" disabled={saving}>{saving ? '…' : t.save}</button></div>
      </form>
    </div>
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
  const columns = useMemo(() => STATUS_COLUMNS.map((column) => ({ ...column, tasks: assignments.filter((task) => task.status === column.value) })), [assignments]);
  const isAdmin = Boolean(data?.viewer?.isAdmin);

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

      {error ? <section className="queue-state queue-error"><p>{error}</p><button type="button" onClick={() => load(scope, showArchive)}>{t.retry}</button></section> : null}
      {loading && !data ? <section className="queue-state"><LoaderCircle className="queue-spin" size={22} /><p>{t.loading}</p></section> : null}
      {data ? <section className="queue-board">{columns.map((column) => {
        const Icon = column.icon;
        return <section key={column.value} className={`queue-column ${column.color}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); move(column.value); }}>
          <header><div><Icon size={15} /><h3>{t[column.copyKey]}</h3><span>{column.tasks.length}</span></div>{column.value === 'posted' && !showArchive ? <p>{t.archived}</p> : null}</header>
          <div className="queue-task-list">{column.tasks.map((task) => <TaskCard key={task.id} task={task} t={t} showOwner={isAdmin && scope === 'all'} onOpen={setOpenTask} onEdit={setEditing} onDragStart={setDraggingId} onDropBefore={move} onContextMenu={openMenu} />)}{!column.tasks.length ? <p className="queue-empty">{t.noTasks}</p> : null}</div>
        </section>;
      })}</section> : null}
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
      {editing ? <TaskEditor task={editing} t={t} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(scope, showArchive); }} /> : null}
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
