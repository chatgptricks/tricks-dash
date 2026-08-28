import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, LoaderCircle, LogOut, Send, X } from 'lucide-react';
import { browserPopupRedirectResolver, getRedirectResult, onAuthStateChanged, signOut } from 'firebase/auth';
import { describeSignInError, firebaseAuth as auth, startGoogleSignIn } from './firebase';
import { clearSsoCookie, startSsoRefresh, trySsoSignIn } from './sso';
import { API_BASE, apiFetch } from './api';
import './queue.css';

const START = 480;
const DAY = (value = new Date()) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const shiftDay = (date, amount) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + amount); return DAY(value); };
const time = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const displayDate = (value) => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const cover = (task) => task?.post?.coverUrl ? `${API_BASE}${task.post.coverUrl}` : '';

async function json(path, options) {
  const response = await apiFetch(`${API_BASE}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || 'Queue could not complete that action.');
  return body;
}

function AuthGate({ notice, setNotice }) {
  const [busy, setBusy] = useState(false);
  const signIn = async () => { setBusy(true); const error = await startGoogleSignIn(); if (error) setNotice(describeSignInError(error)); setBusy(false); };
  return <main className="queue-auth"><section><h1>Sentient Queue</h1><p>{notice || 'Sign in with Google to open your production schedule.'}</p><button type="button" onClick={signIn} disabled={busy}>{busy ? 'Signing in…' : 'Sign in with Google'}</button></section></main>;
}

function TaskBlock({ task, editable, onOpen, onDragStart }) {
  const left = Math.max(0, (task.scheduledStartMinutes || START) - START);
  const planned = task.durationMinutes || 10;
  let width = planned;
  if (['completed', 'closed'].includes(task.status) && task.actualStartedAt && task.completedAt) width = Math.min(planned, Math.max(10, Math.round((new Date(task.completedAt) - new Date(task.actualStartedAt)) / 60000)));
  return <button type="button" draggable={editable && task.status !== 'in_progress'} className={`scheduler-block state-${task.status}${left + width > 720 ? ' is-extra' : ''}`} style={{ left, width }} onDragStart={(event) => { event.dataTransfer.setData('queue-task', String(task.id)); onDragStart(task.id); }} onClick={() => onOpen(task)} title={`${task.post.account} · ${task.productionPoints} PP · ${task.status}`}>
    {cover(task) ? <img src={cover(task)} alt="" /> : null}<span className="scheduler-block-copy"><b>@{task.post.account}</b><small>{task.productionPoints} PP · {time(task.scheduledStartMinutes || START)}</small></span>{task.recommendedAccounts?.length ? <span className="scheduler-account-bubbles">{task.recommendedAccounts.map((account) => <i key={account}>@{account.slice(0, 1)}</i>)}</span> : null}
  </button>;
}

function PoolCard({ task, onOpen, onDragStart }) {
  return <article className="queue-pool-card" draggable onDragStart={(event) => { event.dataTransfer.setData('queue-task', String(task.id)); onDragStart(task.id); }}><button type="button" onClick={() => onOpen(task)}>{cover(task) ? <img src={cover(task)} alt="" /> : <span className="queue-pool-empty">@</span>}<span><b>@{task.post.account}</b><small>{task.productionPoints} PP · {task.durationMinutes} min</small><em>{new Date(task.deadlineAt).toLocaleString()}</em></span></button><div>{task.tags?.map((tag) => <i key={tag}>{tag}</i>)}</div></article>;
}

function Detail({ task, canCoordinate, isOwner, onClose, onAction, onCancel }) {
  const [link, setLink] = useState(task?.finalPermalink || ''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  if (!task) return null;
  const run = async (action, value) => { setBusy(true); try { await onAction(action, value); } finally { setBusy(false); } };
  return <><button className="scheduler-detail-backdrop" type="button" onClick={onClose} aria-label="Close" /><aside className="scheduler-detail"><button className="scheduler-close" type="button" onClick={onClose}><X size={17} /></button>{cover(task) ? <img className="scheduler-detail-cover" src={cover(task)} alt="" /> : null}<p className="scheduler-eyebrow">{task.status.replace('_', ' ')}</p><h2>@{task.post.account}</h2><p className="scheduler-detail-meta">{task.productionPoints} PP · {task.durationMinutes} minutes<br />Deadline {new Date(task.deadlineAt).toLocaleString()}</p>{task.brief ? <section><h3>Brief</h3><p>{task.brief}</p></section> : null}{task.notes ? <section><h3>Notes</h3><p>{task.notes}</p></section> : null}{task.references?.length ? <section><h3>References</h3>{task.references.map((item) => <a key={item} href={item} target="_blank" rel="noreferrer">{item}</a>)}</section> : null}{task.status === 'scheduled' && isOwner ? <button className="scheduler-primary" disabled={busy} onClick={() => run('start')}>Start work</button> : null}{task.status === 'in_progress' && isOwner ? <button className="scheduler-primary" disabled={busy} onClick={() => run('complete')}>Mark complete</button> : null}{task.status === 'completed' && isOwner ? <div className="scheduler-close-form"><label>Published Instagram link<input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://instagram.com/p/..." /></label><button className="scheduler-primary" disabled={busy || !link.trim()} onClick={() => run('close', link)}>Close request</button><button className="scheduler-secondary" disabled={busy} onClick={() => run('start')}>Return to in progress</button></div> : null}{task.status === 'closed' && task.finalPermalink ? <a className="scheduler-primary" href={task.finalPermalink} target="_blank" rel="noreferrer">Open published post</a> : null}{canCoordinate && !['closed', 'cancelled'].includes(task.status) ? <div className="scheduler-cancel"><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Cancellation reason (optional)" /><button className="scheduler-danger" disabled={busy} onClick={() => onCancel(reason)}>Cancel request</button></div> : null}</aside></>;
}

function Scheduler({ data, draft, setDraft, selectedDate, onOpen, onDragStart }) {
  const coordinator = data.viewer.isAdmin || data.viewer.operatingRole === 'vc';
  const tasks = data.requests.filter((task) => task.scheduledDate === selectedDate && task.status !== 'pool');
  const drop = (event, designer) => { event.preventDefault(); if (!coordinator) return; const id = Number(event.dataTransfer.getData('queue-task')); const source = data.requests.find((task) => task.id === id) || draft.find((task) => task.id === id); if (!source || source.status === 'in_progress') return; const rect = event.currentTarget.getBoundingClientRect(); const start = Math.max(START, Math.round((event.clientX - rect.left) / 10) * 10 + START); setDraft((current) => [...current.filter((item) => item.id !== id), { ...source, designerEmail: designer, scheduledDate: selectedDate, scheduledStartMinutes: start, status: 'scheduled' }]); };
  const merged = (designer) => [...tasks.filter((task) => task.designerEmail === designer && !draft.some((entry) => entry.id === task.id)), ...draft.filter((task) => task.designerEmail === designer && task.scheduledDate === selectedDate)];
  return <section className="scheduler"><div className="scheduler-time-head"><span>Designer</span><div>{Array.from({ length: 12 }, (_, hour) => <b key={hour} style={{ left: hour * 60 }}>{String(hour + 8).padStart(2, '0')}:00</b>)}</div></div>{data.designers.map((designer) => <div className="scheduler-row" key={designer.email}><header><b>{designer.email.split('@')[0]}</b><small>{designer.accounts?.map((account) => `@${account}`).join(' · ') || 'No accounts yet'}</small></header><div className="scheduler-track" onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, designer.email)}>{Array.from({ length: 13 }, (_, hour) => <i key={hour} style={{ left: hour * 60 }} />)}{merged(designer.email).map((task) => <TaskBlock key={task.id} task={task} editable={coordinator} onOpen={onOpen} onDragStart={onDragStart} />)}</div></div>)}</section>;
}

function QueueApp({ user }) {
  const [data, setData] = useState(null); const [date, setDate] = useState(DAY()); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [open, setOpen] = useState(null); const [draft, setDraft] = useState([]); const [accountChoice, setAccountChoice] = useState({});
  const load = useCallback(async () => { setLoading(true); try { const next = await json(`/api/dashboard/queue/v2?date=${date}`); setData(next); setDraft([]); setError(''); } catch (err) { setError(err.message || 'Queue could not load.'); } finally { setLoading(false); } }, [date]);
  useEffect(() => { load(); }, [load]);
  const coordinator = data?.viewer && (data.viewer.isAdmin || data.viewer.operatingRole === 'vc'); const pool = useMemo(() => data?.requests.filter((task) => task.status === 'pool') || [], [data]);
  const submit = async () => { try { const changes = draft.map((task) => ({ id: task.id, designerEmail: task.designerEmail, scheduledDate: task.scheduledDate, scheduledStartMinutes: task.scheduledStartMinutes, recommendedAccounts: accountChoice[task.id] || task.recommendedAccounts || [] })); await json('/api/dashboard/queue/v2/submit', { method: 'POST', body: new URLSearchParams({ changes: JSON.stringify(changes) }) }); await load(); } catch (err) { setError(err.message); } };
  const action = async (actionName, value) => { try { const body = value ? new URLSearchParams(actionName === 'close' ? { final_permalink: value } : {}) : undefined; await json(`/api/dashboard/queue/v2/requests/${open.id}/${actionName}`, { method: 'POST', body }); setOpen(null); await load(); } catch (err) { setError(err.message); } };
  const cancel = async (reason) => { try { await json(`/api/dashboard/queue/v2/requests/${open.id}/cancel`, { method: 'POST', body: new URLSearchParams({ reason }) }); setOpen(null); await load(); } catch (err) { setError(err.message); } };
  return <main className="queue-page scheduler-page"><header className="queue-topbar"><div className="queue-brand"><CalendarDays size={22} /><div><span>sentientdash.app</span><h1>Production Queue</h1></div></div><div className="queue-actions"><a href={import.meta.env.BASE_URL}><ArrowLeft size={14} />Dashboard</a><button type="button" className="queue-avatar" title={user.email} onClick={() => { clearSsoCookie(); signOut(auth); }}><LogOut size={14} /></button></div></header>{loading ? <section className="queue-state"><LoaderCircle className="queue-spin" /><p>Loading schedule…</p></section> : null}{error ? <section className="queue-state queue-error"><p>{error}</p><button type="button" onClick={load}>Try again</button></section> : null}{data ? <><section className="scheduler-toolbar"><div><p className="scheduler-eyebrow">{coordinator ? 'Coordinator schedule' : 'My production schedule'}</p><h2>{displayDate(date)}</h2></div><div className="scheduler-nav"><button type="button" onClick={() => setDate(shiftDay(date, -1))}><ChevronLeft size={17} /></button><button type="button" onClick={() => setDate(DAY())}>Today</button><button type="button" onClick={() => setDate(shiftDay(date, 1))}><ChevronRight size={17} /></button></div>{coordinator && draft.length ? <button type="button" className="scheduler-submit" onClick={submit}><Send size={14} />Submit {draft.length} change{draft.length > 1 ? 's' : ''}</button> : null}</section>{coordinator ? <section className="scheduler-pool"><header><div><p className="scheduler-eyebrow">Production pool</p><h2>{pool.length} ready to schedule</h2></div><small>Drag requests to a designer’s 08:00–20:00 day.</small></header><div className="scheduler-pool-list">{pool.map((task) => <PoolCard key={task.id} task={task} onOpen={setOpen} onDragStart={() => {}} />)}{!pool.length ? <p className="scheduler-empty">No requests are waiting in the pool.</p> : null}</div></section> : null}{coordinator && draft.length ? <section className="scheduler-drafts">{draft.map((task) => { const designer = data.designers.find((item) => item.email === task.designerEmail); return <label key={task.id}>@{task.post.account} → {designer?.email.split('@')[0]}<select value={(accountChoice[task.id] || task.recommendedAccounts || [])[0] || ''} onChange={(event) => setAccountChoice((current) => ({ ...current, [task.id]: event.target.value ? [event.target.value] : [] }))}><option value="">No recommended account</option>{designer?.accounts?.map((account) => <option key={account} value={account}>@{account}</option>)}</select></label>; })}</section> : null}<Scheduler data={data} draft={draft} setDraft={setDraft} selectedDate={date} onOpen={setOpen} onDragStart={() => {}} /></> : null}<Detail task={open} canCoordinate={coordinator} isOwner={open?.designerEmail === data?.viewer.email || data?.viewer.isAdmin} onClose={() => setOpen(null)} onAction={action} onCancel={cancel} /></main>;
}

function Root() { const [user, setUser] = useState(undefined); const [notice, setNotice] = useState(''); const [checked, setChecked] = useState(false); useEffect(() => { getRedirectResult(auth, browserPopupRedirectResolver).catch((error) => setNotice(describeSignInError(error))); }, []); useEffect(() => { trySsoSignIn().finally(() => setChecked(true)); }, []); useEffect(() => onAuthStateChanged(auth, setUser), []); useEffect(() => user ? startSsoRefresh() : undefined, [user]); if (user === undefined || (!user && !checked)) return <main className="queue-auth" />; return user ? <QueueApp user={user} /> : <AuthGate notice={notice} setNotice={setNotice} />; }
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><Root /></React.StrictMode>);
