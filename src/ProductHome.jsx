import { useEffect, useState } from 'react';
import { API_BASE, apiFetch } from './api';
import { encodeRouteState } from './urlCodec';
import { usePrefs } from './prefsContext';
import { editorialStates } from './topicGroups';
const taskHref = (task) => `/queue.html?r=${encodeRouteState({ task: task.id })}`;
export default function ProductHome({ coordinator, email }) {
  const { language } = usePrefs(); const es = language === 'es';
  const [data, setData] = useState(null); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; const controller = new AbortController();
    async function load() {
      try {
        const date = new Date().toLocaleDateString('en-CA');
        const response = await apiFetch(`${API_BASE}/api/dashboard/queue/v2?date=${date}`, { signal: controller.signal });
        if (!response.ok) throw new Error(es ? 'No pudimos cargar tu trabajo.' : 'Could not load your work.');
        const body = await response.json(); if (active) { setData(body); setError(''); }
      } catch (err) { if (active && err.name !== 'AbortError') setError(err.message); }
    }
    load(); const timer = setInterval(load, 30000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [retry, es, coordinator, email]);
  const source = coordinator ? data?.planningRequests : data?.assignedRequests;
  const tasks = (source || []).filter((task) => ['scheduled', 'in_progress', 'completed'].includes(task.status) && (coordinator || task.designerEmail === email));
  const priority = { in_progress: 0, scheduled: 1, completed: 2 };
  const ordered = [...tasks].sort((a, b) => priority[a.status] - priority[b.status] || `${a.scheduledDate}-${String(a.scheduledStartMinutes || 0).padStart(4, '0')}`.localeCompare(`${b.scheduledDate}-${String(b.scheduledStartMinutes || 0).padStart(4, '0')}`));
  const pool = (data?.requests || []).filter((task) => task.status === 'pool').length;
  const name = data?.viewer?.displayName || email?.split('@')[0];
  return <section className="product-home">
    <span className="home-kicker">{es ? 'Tu espacio de trabajo' : 'Your workspace'}</span>
    <h1>{es ? 'Hola' : 'Hello'}, {name}</h1>
    <p>{coordinator ? (es ? 'Conecta las oportunidades con el trabajo de tu equipo.' : 'Connect content opportunities with your team’s work.') : (es ? 'Tu trabajo, tus referencias y tu siguiente paso, en un solo lugar.' : 'Your work, references and next step, in one place.')}</p>
    {error ? <div className="home-error" role="status">{error} <button type="button" onClick={() => setRetry((n) => n + 1)}>{es ? 'Reintentar' : 'Retry'}</button></div> : null}
    {!data && !error ? <p className="home-loading" role="status">{es ? 'Cargando tu espacio…' : 'Loading your workspace…'}</p> : null}
    {data ? <>
      <div className="home-metrics">
        <a href="/queue.html"><span>{coordinator ? (es ? 'Producción activa' : 'Active production') : (es ? 'Mi trabajo' : 'My work')}</span><b>{tasks.length}</b><small>{es ? 'Abrir Queue →' : 'Open Queue →'}</small></a>
        <a href={tasks.find((task) => task.status === 'completed') ? taskHref(tasks.find((task) => task.status === 'completed')) : '/queue.html'}><span>{es ? 'Producción terminada' : 'Production finished'}</span><b>{tasks.filter((task) => task.status === 'completed').length}</b><small>{es ? 'Registrar publicación →' : 'Register publication →'}</small></a>
        <a href={coordinator ? '/queue.html?inbox=1' : '/queue.html'}><span>{coordinator ? (es ? 'Aprobaciones' : 'Approvals') : (es ? 'En producción' : 'In production')}</span><b>{coordinator ? (data.pendingTicketCount || 0) : tasks.filter((task) => task.status === 'in_progress').length}</b><small>{coordinator ? `${pool} ${es ? 'posts en Pool' : 'posts in Pool'}` : (es ? 'Continuar trabajo →' : 'Continue work →')}</small></a>
      </div>
      <h2 className="home-section-title">{coordinator ? (es ? 'En el equipo' : 'Across the team') : (es ? 'Continúa aquí' : 'Continue here')}</h2>
      {ordered.slice(0, 4).map((task) => <a className="home-task" key={task.id} href={taskHref(task)}><span><strong>{task.title || task.post?.title || task.brief || `@${task.post?.account || 'Post'}`}</strong><small>{task.recommendedAccounts?.map((account) => '@' + account).join(' · ') || (es ? 'Cuenta por definir' : 'Account to be selected')}{coordinator && task.designerEmail ? ` · ${task.designerEmail.split('@')[0]}` : ''}</small><small>{task.scheduledDate} · {task.productionPoints} PP</small></span><em>{editorialStates[task.status] || task.status} →</em></a>)}
      {!ordered.length ? <p>{es ? 'No tienes trabajo activo en esta vista. Puedes explorar referencias o abrir Queue.' : 'No active work in this view. Explore references or open Queue.'}</p> : null}
    </> : null}
    <a className="home-discover" href="/index.html"><strong>{es ? 'Descubre tu próxima idea →' : 'Discover your next idea →'}</strong><p>{es ? 'Explora posts y compara las mejores versiones de cada tema.' : 'Explore posts and compare the best versions of each topic.'}</p></a>
  </section>;
}
