import { validResearchFilters } from '../researchFilterOptions';
import { useEffect, useRef, useState } from 'react';
import { Character } from './Character';
import { loadConversation, saveConversation, listConversations, newConversation, deleteConversation } from './history';

const COPY = {
  es: { open: 'Hablar con Sentient', close: 'Minimizar chat', title: 'Sentient', subtitle: 'Tu dashboard, en conversación', greet: '¿Qué querés saber?', intro: 'Puedo consultar tus datos de Cortex y ayudarte a entender el dashboard.', placeholder: 'Preguntame sobre el dashboard…', send: 'Enviar pregunta', stop: 'Detener respuesta', thinking: 'Consultando Cortex…', hide: 'Cerrar asistente', show: 'Mostrar mascota', newChat: 'Nueva conversación', sources: 'Datos consultados', error: 'No pude completar la consulta. Intentá de nuevo.', timeout: 'La consulta tardó demasiado. Probá una pregunta más específica.', unsupported: 'Esos filtros no están disponibles en esta página.', unavailable: 'El chat todavía no está disponible. Intentá más tarde.', note: 'Las respuestas pueden contener errores. Revisá las fuentes.', prompts: [{ label: 'Carrusel con más likes · 24 h', question: '¿Cuál es el carrusel con más likes de las últimas 24 horas?' }, { label: 'Reel con más likes · 24 h', question: '¿Cuál es el reel con más likes de las últimas 24 horas?' }, { label: 'Top 3 reels históricos de una cuenta…', draft: '¿Cuáles son los 3 reels con más likes de toda la historia de @' }], partial: 'Muestra parcial', stopped: 'Consulta detenida.' },
  en: { open: 'Chat with Sentient', close: 'Minimize chat', title: 'Sentient', subtitle: 'Your dashboard, in conversation', greet: 'What would you like to know?', intro: 'I can query your Cortex data and help you understand the dashboard.', placeholder: 'Ask me about the dashboard…', send: 'Send question', stop: 'Stop response', thinking: 'Checking Cortex…', hide: 'Close assistant', show: 'Show companion', newChat: 'New conversation', sources: 'Data consulted', error: 'I couldn’t finish this query. Please try again.', timeout: 'This query took too long. Try a more specific question.', unsupported: 'Those filters are not available on this page.', unavailable: 'Chat is not available yet. Please try later.', note: 'Answers may contain mistakes. Check the sources.', prompts: [{ label: 'Most liked carousel · 24h', question: 'What is the most liked carousel in the last 24 hours?' }, { label: 'Most liked reel · 24h', question: 'What is the most liked reel in the last 24 hours?' }, { label: 'Top 3 reels ever from a page…', draft: 'What are the 3 most liked reels ever from @' }], partial: 'Partial sample', stopped: 'Query stopped.' },
};
const postHost = data => { if (parent !== window) parent.postMessage({ source: 'sentient-companion', ...data }, location.origin); };
Object.assign(COPY.es, { menu: 'Opciones de Sentient', history: 'Historial de chats', historyNote: 'Guardado en este navegador · Últimas 30 conversaciones', emptyHistory: 'Todavía no hay conversaciones guardadas.', back: 'Volver al chat', resume: 'Abrir conversación', delete: 'Eliminar conversación', confirmDelete: '¿Eliminar esta conversación?', cancel: 'Cancelar', position: 'Posición', current: 'Actual', dock: ['Arriba izquierda', 'Arriba derecha', 'Centro izquierda', 'Centro derecha', 'Abajo izquierda', 'Abajo derecha'], limited: 'Hay otra consulta en curso o alcanzaste el límite temporal. Intentá de nuevo en unos segundos.' });
Object.assign(COPY.en, { menu: 'Sentient options', history: 'Chat history', historyNote: 'Saved in this browser · Last 30 conversations', emptyHistory: 'No saved conversations yet.', back: 'Back to chat', resume: 'Open conversation', delete: 'Delete conversation', confirmDelete: 'Delete this conversation?', cancel: 'Cancel', position: 'Position', current: 'Current', dock: ['Top left', 'Top right', 'Middle left', 'Middle right', 'Bottom left', 'Bottom right'], limited: 'Another query is running or the temporary limit was reached. Try again in a few seconds.' });
const DOCKS = ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right'];
function safeSource(url) {
  try { const target = new URL(url); return target.origin === 'https://sentientdash.app' && !target.username && !target.password ? target.href : null; } catch { return null; }
}
export function AnswerText({ text, onNavigate }) {
  // Text stays escaped by React; only verified dashboard destinations become links.
  const chunks = [], pattern = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)|(https:\/\/sentientdash\.app\/[^\s<>]*)/g;
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    chunks.push(text.slice(end, match.index));
    const url = safeSource(match[2] || match[3]);
    chunks.push(url ? <a key={match.index} href={url} target="_top" onClick={onNavigate} onAuxClick={onNavigate}>{match[1] || url}</a> : match[0]);
    end = match.index + match[0].length;
  }
  chunks.push(text.slice(end));
  return chunks;
}
function Icon({ kind }) {
  const paths = { close: 'M5 12h14', send: 'm5 12 14-7-5 14-3-6-6-1Z M11 13l8-8', new: 'M12 5v14 M5 12h14', stop: 'M7 7h10v10H7Z', chat: 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z', hide: 'M3 3l18 18 M10 5h9a2 2 0 0 1 2 2v9 M7 7H5a2 2 0 0 0-2 2v9l6-4h5' };
  Object.assign(paths, { menu: 'M5 12h.01 M12 12h.01 M19 12h.01', history: 'M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2', back: 'm12 5-7 7 7 7 M5 12h14', trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7' });
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[kind] || paths.chat}/></svg>;
}

export function Companion({ session, request, apiBase, Avatar = Character }) {
  const [context, setContext] = useState({ page: '/', language: 'es', theme: 'dark' });
  const [open, setOpen] = useState(() => { try { return sessionStorage.getItem('sentient.pet.open.' + session?.uid) === 'true' && localStorage.getItem('sentient.pet.enabled.' + session?.uid) !== 'false'; } catch { return false; } });
  const [geometry, setGeometry] = useState(null);
  const [enabled, setEnabled] = useState(() => { try { return localStorage.getItem('sentient.pet.enabled.' + session?.uid) !== 'false'; } catch { return true; } });
  const [conversation, setConversation] = useState(() => loadConversation(session?.uid));
  const [messages, setMessages] = useState(() => conversation.messages);
  const [view, setView] = useState('chat'), [menu, setMenu] = useState(false), [history, setHistory] = useState([]), [deleting, setDeleting] = useState(null);
  const [draft, setDraft] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [reaction, setReaction] = useState('idle'), [unread, setUnread] = useState(0);
  const gesture = useRef(null), suppressClick = useRef(false);
  const input = useRef(null), list = useRef(null), controller = useRef(null), sequence = useRef(0), opened = useRef(open), settle = useRef(null), menuElement = useRef(null), launcher = useRef(null);
  const copy = COPY[context.language];
  useEffect(() => { opened.current = open; try { if (session?.uid) sessionStorage.setItem('sentient.pet.open.' + session.uid, String(open)); } catch { /* optional persistence */ } postHost({ type: 'layout', state: !session ? 'hidden' : open ? 'open' : enabled ? 'closed' : 'compact', menu: { open: menu, width: 244, height: busy ? 380 : 344 } }); if (open) setUnread(0); }, [open, enabled, session, menu, busy]);
  useEffect(() => { if (open && view === 'chat' && !menu) input.current?.focus(); }, [open, view, menu]);
  useEffect(() => {
    if (!menu) return;
    menuElement.current?.querySelector('button:not(:disabled)')?.focus();
    const dismiss = event => { if (!menuElement.current?.contains(event.target) && !launcher.current?.contains(event.target)) setMenu(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [menu]);
  useEffect(() => {
    let dock; try { dock = localStorage.getItem('sentient.pet.position.' + session?.uid); } catch { /* optional preference */ }
    postHost({ type: 'ready', dock });
    const receive = event => {
      if (event.origin !== location.origin || event.source !== parent || event.data?.source !== 'sentient-host' || !['context', 'geometry', 'docked', 'dismiss-menu', 'minimize'].includes(event.data.type)) return;
      const next = event.data;
      if (next.type === 'dismiss-menu') { setMenu(false); return; }
      if (next.type === 'minimize') { minimize(); return; }
      if (next.type === 'geometry') {
        if (['avatar', 'panel'].every(key => next[key] && ['x', 'y', 'w', 'h'].every(n => Number.isFinite(next[key][n]) && next[key][n] >= 0 && next[key][n] < 10000))) setGeometry(next);
        return;
      }
      if (next.type === 'docked') {
        if (/^(top|middle|bottom)-(left|right)$/.test(next.dock)) try { localStorage.setItem('sentient.pet.position.' + session?.uid, next.dock); } catch { /* optional preference */ }
        return;
      }
      const variables = { surface: '--surface', raised: '--raised', line: '--line', muted: '--muted', text: '--text', accent: '--accent', accentInk: '--accent-ink' };
      for (const [name, variable] of Object.entries(variables)) {
        const value = next.tokens?.[name];
        if (typeof value === 'string' && value.length < 150 && window.CSS?.supports('color', value)) document.documentElement.style.setProperty(variable, value);
      }
      if (typeof next.font === 'string' && next.font.length < 180 && window.CSS?.supports('font-family', next.font)) document.documentElement.style.fontFamily = next.font;
      if (typeof next.radius === 'string' && window.CSS?.supports('border-radius', next.radius)) document.documentElement.style.setProperty('--chat-radius', next.radius);
      setContext({ page: typeof next.page === 'string' ? next.page.slice(0, 100) : '/', language: next.language === 'en' ? 'en' : 'es', theme: next.theme === 'light' ? 'light' : 'dark' });
    };
    window.addEventListener('message', receive);
    return () => { window.removeEventListener('message', receive); sequence.current++; controller.current?.abort(); clearTimeout(settle.current); };
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = context.theme; document.documentElement.lang = context.language; }, [context]);
  useEffect(() => {
    if (!session?.uid) return;
    saveConversation(session.uid, { id: conversation.id, messages });
    if (view === 'history') setHistory(listConversations(session.uid));
    list.current?.scrollTo?.({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [messages, session, conversation.id]);
  useEffect(() => { if (busy) list.current?.scrollTo?.({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [busy]);

  function minimize() {
    setMenu(false); setOpen(false); opened.current = false;
    try { sessionStorage.setItem('sentient.pet.open.' + session?.uid, 'false'); } catch { /* persistence optional */ }
    postHost({ type: 'layout', state: 'closed', menu: { open: false } });
  }
  function navigate(event) {
    if (event.type === 'auxclick' && event.button !== 1) return;
    const sameTab = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    const savedMessages = sameTab ? cancelledMessages() : messages;
    if (sameTab && busy) { stopPending(); setMessages(savedMessages); }
    minimize();
    saveConversation(session.uid, { id: conversation.id, messages: savedMessages });
    // Other same-origin dashboard pages retain native navigation after the
    // minimized state is saved; the host only routes its supported tools.
    const hosted = /^\/(?:index\.html|queue\.html|tracker\.html|insights\.html|settings\.html|promos\.html|news\.html|hooks\.html|vault\.html|mobile\/(?:index\.html)?)?$/.test(new URL(event.currentTarget.href).pathname);
    if (sameTab && hosted && parent !== window) {
      event.preventDefault(); postHost({ type: 'navigate', url: event.currentTarget.href });
    }
  }
  function enable() { setEnabled(true); try { localStorage.setItem('sentient.pet.enabled.' + session.uid, 'true'); } catch { /* preference optional */ } }
  function togglePet() { minimize(); setEnabled(false); try { localStorage.setItem('sentient.pet.enabled.' + session.uid, 'false'); } catch { /* preference optional */ } }
  function launch() {
    if (suppressClick.current) { suppressClick.current = false; return; }
    setMenu(false);
    if (!enabled) enable();
    if (open) minimize(); else setOpen(true);
    if (!open && !busy) setReaction('attentive');
  }
  function pointerDown(event) {
    if (event.button !== 0) return;
    setMenu(false);
    gesture.current = { id: event.pointerId, x: event.screenX, y: event.screenY, moved: false };
    suppressClick.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function pointerMove(event) {
    const current = gesture.current;
    if (!current || event.pointerId !== current.id) return;
    const dx = event.screenX - current.x, dy = event.screenY - current.y;
    if (!current.moved && Math.hypot(dx, dy) > 6) { current.moved = true; postHost({ type: 'drag-start' }); }
    if (current.moved) { event.preventDefault(); postHost({ type: 'drag-move', dx, dy }); }
  }
  function pointerUp(event) {
    const current = gesture.current;
    if (!current || event.pointerId !== current.id) return;
    if (current.moved) { suppressClick.current = true; postHost({ type: event.type === 'pointercancel' ? 'drag-cancel' : 'drag-end', dx: event.screenX - current.x, dy: event.screenY - current.y }); }
    gesture.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }
  const boxStyle = box => box ? { left: box.x, top: box.y, width: box.w, height: box.h, right: 'auto', bottom: 'auto' } : undefined;
  function stopPending() { sequence.current++; controller.current?.abort(); controller.current = null; clearTimeout(settle.current); setBusy(false); setReaction('idle'); }
  function cancelledMessages() { return messages.map((item, i) => busy && i === messages.length - 1 && item.role === 'user' ? { ...item, failed: true } : item); }
  function cancel() { stopPending(); setMessages(cancelledMessages()); setDraft(messages.at(-1)?.role === 'user' ? messages.at(-1).content : ''); setError(copy.stopped); setMenu(false); }
  function clear() {
    saveConversation(session.uid, { id: conversation.id, messages: cancelledMessages() });
    stopPending(); const next = newConversation(session.uid); setConversation(next); setMessages([]); setDraft(''); setError(''); setView('chat'); setMenu(false); enable(); setOpen(true);
  }
  function showHistory() { setHistory(listConversations(session.uid)); setDeleting(null); setView('history'); setMenu(false); enable(); setOpen(true); }
  function resume(entry) {
    const selected = entry.id === conversation.id ? { ...entry, messages: cancelledMessages() } : entry;
    saveConversation(session.uid, { id: conversation.id, messages: cancelledMessages() });
    stopPending(); saveConversation(session.uid, selected); setConversation(selected); setMessages(selected.messages); setDraft(''); setError(''); setView('chat'); setDeleting(null);
  }
  function removeHistory(id) {
    setHistory(deleteConversation(session.uid, id)); setDeleting(null);
    if (id === conversation.id) { stopPending(); setConversation(newConversation(session.uid)); setMessages([]); setDraft(''); setError(''); }
  }
  function openMenu(event) { event.preventDefault(); event.stopPropagation(); setMenu(value => !value); }
  function menuKeys(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setMenu(false); launcher.current?.focus(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const buttons = [...menuElement.current.querySelectorAll('button:not(:disabled)')], index = buttons.indexOf(document.activeElement);
    buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }
  async function ask(value = draft) {
    const message = value.trim();
    if (!message || busy || controller.current || !session) return;
    if (!session.configured) { setError(copy.unavailable); return; }
    const current = ++sequence.current;
    const abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort('timeout'), 125_000);
    clearTimeout(settle.current); setDraft(''); setError(''); setBusy(true); setReaction('thinking');
    const history = messages.filter(item => !item.failed).slice(-10).map(({ role, content }) => ({ role, content: content.slice(0, 8000) }));
    const userId = crypto.randomUUID();
    setMessages(items => [...items, { id: userId, role: 'user', content: message }]);
    try {
      const response = await request(apiBase + '/api/dashboard/assistant/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal, body: JSON.stringify({ message, history, language: context.language, page: context.page }) });
      if (current !== sequence.current) return;
      if (!response.ok) throw new Error(response.status === 504 ? 'timeout' : response.status === 429 ? 'limited' : 'unavailable');
      const result = await response.json();
      if (current !== sequence.current) return;
      if (!result.answer || typeof result.answer !== 'string') throw new Error('unavailable');
      const action = Array.isArray(result.ui_actions) ? result.ui_actions.find(item => item.type === 'research_filters') : null;
      if (action && !validResearchFilters(action.filters)) throw new Error('unsupported');
      const assistantMessage = { id: crypto.randomUUID(), role: 'assistant', content: result.answer, sources: Array.isArray(result.sources) ? result.sources : [] };
      setMessages(items => [...items, assistantMessage]);
      if (action) {
        minimize(); setUnread(0);
        // Persist before navigation so both the request and answer survive it.
        saveConversation(session.uid, { id: conversation.id, messages: [...messages, { id: userId, role: 'user', content: message }, assistantMessage] });
        postHost({ type: 'research_filters', filters: action.filters });
      }
      setReaction('celebrate'); settle.current = setTimeout(() => setReaction('idle'), 2500);
      if (!opened.current && !action) setUnread(number => number + 1);
    } catch (reason) {
      if (current !== sequence.current) return;
      setMessages(items => items.map(item => item.id === userId ? { ...item, failed: true } : item));
      setDraft(message); setReaction('error'); setError(abort.signal.aborted || reason.message === 'timeout' ? copy.timeout : ['limited', 'unsupported'].includes(reason.message) ? copy[reason.message] : copy.error);
    } finally { clearTimeout(timer); if (current === sequence.current) { setBusy(false); controller.current = null; } }
  }
  if (!session) return null;
  return <div className={`companion ${open ? 'is-open' : ''} ${enabled ? '' : 'is-compact'}`} onPointerDown={event => { if (event.target === event.currentTarget) { if (open) minimize(); else setMenu(false); } }}>
    {open ? <section className="companion-chat" style={boxStyle(geometry?.panel)} role="dialog" aria-modal="false" aria-label={view === 'history' ? copy.history : copy.open} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); minimize(); launcher.current?.focus(); } }}>
      <header className="chat-header"><div className="chat-identity"><span className="chat-status-dot"/><div><strong>{view === 'history' ? copy.history : copy.title}</strong><small>{copy.subtitle}</small></div></div><div className="chat-header-actions"><button type="button" aria-label={copy.newChat} title={copy.newChat} onClick={clear}><Icon kind="new"/></button><button type="button" aria-label={copy.menu} title={copy.menu} aria-haspopup="menu" aria-expanded={menu} onClick={openMenu}><Icon kind="menu"/></button><button type="button" aria-label={copy.close} title={copy.close} onClick={minimize}><Icon kind="close"/></button></div></header>
      {view === 'history' ? <div className="chat-history">
        <button className="history-back" type="button" onClick={() => setView('chat')}><Icon kind="back"/>{copy.back}</button>
        <p className="history-note">{copy.historyNote}</p>
        {!history.length ? <p className="history-empty">{copy.emptyHistory}</p> : history.map(entry => <div className="history-entry" key={entry.id}>
          {deleting === entry.id ? <div className="history-confirm"><span>{copy.confirmDelete}</span><button type="button" onClick={() => removeHistory(entry.id)}>{copy.delete}</button><button type="button" onClick={() => setDeleting(null)}>{copy.cancel}</button></div> : <><button className="history-resume" type="button" onClick={() => resume(entry)} aria-label={`${copy.resume}: ${entry.title}`}><strong>{entry.title}</strong><small>{new Date(entry.updatedAt).toLocaleDateString(context.language, { month: 'short', day: 'numeric' })}{entry.id === conversation.id ? ` · ${copy.current}` : ''}</small></button><button className="history-delete" type="button" aria-label={`${copy.delete}: ${entry.title}`} onClick={() => setDeleting(entry.id)}><Icon kind="trash"/></button></>}
        </div>)}
      </div> : <><div className="chat-transcript" ref={list} role="log" aria-live="polite" aria-relevant="additions text">
        {!messages.length ? <div className="chat-welcome"><span className="welcome-spark">✦</span><h1>{copy.greet}</h1><p>{copy.intro}</p><div className="chat-prompts">{copy.prompts.map(prompt => <button type="button" disabled={busy || !session.configured} key={prompt.label} onClick={() => { if (prompt.draft) { setDraft(prompt.draft); input.current?.focus(); } else ask(prompt.question); }}>{prompt.label}<span aria-hidden="true">↗</span></button>)}</div></div> : null}
        {messages.map(item => <article key={item.id} className={`chat-message from-${item.role} ${item.failed ? 'is-failed' : ''}`}><span className="sr-only">{item.role === 'assistant' ? 'Sentient' : context.language === 'es' ? 'Vos' : 'You'}: </span><div className="chat-message-text">{item.role === 'assistant' ? <AnswerText text={item.content} onNavigate={navigate}/> : item.content}</div>{item.sources?.length ? <details className="chat-sources"><summary>{copy.sources} · {item.sources.length}</summary>{item.sources.map((source, index) => safeSource(source.url) ? <a key={index} href={safeSource(source.url)} target="_top" onClick={navigate} onAuxClick={navigate}><span>{source.label}</span>{source.partial ? <small>{copy.partial}</small> : null}<code>{source.endpoint}</code></a> : null)}</details> : null}</article>)}
        {busy ? <div className="chat-thinking" role="status"><span/><span/><span/><small>{copy.thinking}</small></div> : null}
      </div>
      <form className="chat-composer" onSubmit={event => { event.preventDefault(); ask(); }}>
        {error ? <p className="chat-error" role="alert">{error}</p> : null}
        {!session.configured ? <p className="chat-error" role="status">{copy.unavailable}</p> : null}
        <div className="chat-input-row"><textarea ref={input} aria-label={copy.placeholder} placeholder={copy.placeholder} maxLength={4000} rows={2} value={draft} disabled={!session.configured} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); ask(); } }}/>{busy ? <button className="chat-submit" type="button" aria-label={copy.stop} onClick={cancel}><Icon kind="stop"/></button> : <button className="chat-submit" type="submit" aria-label={copy.send} disabled={!draft.trim() || !session.configured}><Icon kind="send"/></button>}</div><p className="chat-note">{copy.note}</p>
      </form></>}
    </section> : null}
    <button ref={launcher} type="button" className={`pet-launcher ${!enabled ? 'mini-launcher' : ''}`} aria-label={open ? copy.close : copy.open} aria-expanded={open} aria-haspopup="menu" style={boxStyle(geometry?.avatar)} title={context.language === 'es' ? 'Arrastrá para mover · Clic derecho para opciones' : 'Drag to move · Right-click for options'} onClick={launch} onContextMenu={openMenu} onKeyDown={event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) openMenu(event); }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
      <Avatar reaction={open && enabled ? reaction : 'idle'} unread={enabled ? unread : 0} paused={!enabled}/>
      {!enabled && unread ? <span className="compact-count">{unread > 99 ? '99+' : unread}</span> : null}
    </button>
    {menu ? <div className="pet-menu" ref={menuElement} style={boxStyle(geometry?.menu)} role="menu" aria-label={copy.menu} onKeyDown={menuKeys}>
      <div className="pet-menu-title" aria-hidden="true">Sentient</div>
      <button type="button" role="menuitem" onClick={() => { setMenu(false); if (open) minimize(); else { enable(); setOpen(true); setView('chat'); } }}><Icon kind={open ? 'close' : 'chat'}/>{open ? copy.close : copy.open}</button>
      <button type="button" role="menuitem" onClick={clear}><Icon kind="new"/>{copy.newChat}</button>
      <button type="button" role="menuitem" onClick={showHistory}><Icon kind="history"/>{copy.history}</button>
      {busy ? <button type="button" role="menuitem" onClick={cancel}><Icon kind="stop"/>{copy.stop}</button> : null}
      <div className="pet-menu-divider" role="separator"/>
      <div className="pet-menu-label">{copy.position}</div><div className="pet-docks" role="group" aria-label={copy.position}>{DOCKS.map((dock, index) => <button type="button" role="menuitemradio" aria-checked={geometry?.dock === dock} key={dock} aria-label={copy.dock[index]} title={copy.dock[index]} onClick={() => { postHost({ type: 'dock', dock }); setMenu(false); }}><span className={`dock-dot dock-${dock}`}/></button>)}</div>
      <div className="pet-menu-divider" role="separator"/>
      <button type="button" role="menuitem" onClick={togglePet}><Icon kind="hide"/>{copy.hide}</button>
    </div> : null}
  </div>;
}
