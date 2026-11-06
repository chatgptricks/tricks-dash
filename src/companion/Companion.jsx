import { useEffect, useRef, useState } from 'react';
import { Character } from './Character';

const COPY = {
  es: { open: 'Hablar con Sentient', close: 'Minimizar chat', title: 'Sentient', subtitle: 'Tu dashboard, en conversación', greet: '¿Qué querés saber?', intro: 'Puedo consultar tus datos de Cortex y ayudarte a entender el dashboard.', placeholder: 'Preguntame sobre el dashboard…', send: 'Enviar pregunta', stop: 'Detener respuesta', thinking: 'Consultando Cortex…', hide: 'Ocultar mascota', show: 'Mostrar mascota', newChat: 'Nueva conversación', sources: 'Datos consultados', error: 'No pude completar la consulta. Intentá de nuevo.', timeout: 'La consulta tardó demasiado. Probá una pregunta más específica.', unavailable: 'El chat todavía no está disponible. Intentá más tarde.', note: 'Las respuestas pueden contener errores. Revisá las fuentes.', prompts: ['¿Qué tengo pendiente hoy?', '¿Qué cuentas crecieron esta semana?', '¿Cómo uso esta pantalla?'], partial: 'Muestra parcial', stopped: 'Consulta detenida.' },
  en: { open: 'Chat with Sentient', close: 'Minimize chat', title: 'Sentient', subtitle: 'Your dashboard, in conversation', greet: 'What would you like to know?', intro: 'I can query your Cortex data and help you understand the dashboard.', placeholder: 'Ask me about the dashboard…', send: 'Send question', stop: 'Stop response', thinking: 'Checking Cortex…', hide: 'Hide companion', show: 'Show companion', newChat: 'New conversation', sources: 'Data consulted', error: 'I couldn’t finish this query. Please try again.', timeout: 'This query took too long. Try a more specific question.', unavailable: 'Chat is not available yet. Please try later.', note: 'Answers may contain mistakes. Check the sources.', prompts: ['What do I need to do today?', 'Which accounts grew this week?', 'How do I use this screen?'], partial: 'Partial sample', stopped: 'Query stopped.' },
};
const postHost = data => { if (parent !== window) parent.postMessage({ source: 'sentient-companion', ...data }, location.origin); };
const storageKey = uid => 'sentient.pet.chat.' + uid;
function initialMessages(uid) {
  if (!uid) return [];
  try { const values = JSON.parse(sessionStorage.getItem(storageKey(uid)) || '[]'); return Array.isArray(values) ? values.filter(value => ['user', 'assistant'].includes(value.role) && typeof value.content === 'string').slice(-12) : []; } catch { return []; }
}
function safeSource(url) {
  try { const target = new URL(url); return target.origin === 'https://sentientdash.app' && !target.username && !target.password ? target.href : null; } catch { return null; }
}
function Icon({ kind }) {
  const paths = { close: 'M5 12h14', send: 'm5 12 14-7-5 14-3-6-6-1Z M11 13l8-8', new: 'M12 5v14 M5 12h14', stop: 'M7 7h10v10H7Z', chat: 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z', hide: 'M3 3l18 18 M10 5h9a2 2 0 0 1 2 2v9 M7 7H5a2 2 0 0 0-2 2v9l6-4h5' };
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[kind] || paths.chat}/></svg>;
}

export function Companion({ session, request, apiBase, Avatar = Character }) {
  const [context, setContext] = useState({ page: '/', language: 'es', theme: 'dark' });
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(() => { try { return localStorage.getItem('sentient.pet.enabled.' + session?.uid) !== 'false'; } catch { return true; } });
  const [messages, setMessages] = useState(() => initialMessages(session?.uid));
  const [draft, setDraft] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [reaction, setReaction] = useState('idle'), [unread, setUnread] = useState(0);
  const input = useRef(null), list = useRef(null), controller = useRef(null), sequence = useRef(0), opened = useRef(open), settle = useRef(null);
  const copy = COPY[context.language];
  useEffect(() => { opened.current = open; postHost({ type: 'layout', state: !session ? 'hidden' : open ? 'open' : enabled ? 'closed' : 'compact' }); if (open) { setUnread(0); setTimeout(() => input.current?.focus(), 80); } }, [open, enabled, session]);
  useEffect(() => {
    postHost({ type: 'ready' });
    const receive = event => {
      if (event.origin !== location.origin || event.source !== parent || event.data?.source !== 'sentient-host' || event.data.type !== 'context') return;
      const next = event.data;
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
    try { sessionStorage.setItem(storageKey(session.uid), JSON.stringify(messages.slice(-12))); } catch { /* conversation can remain in memory */ }
    list.current?.scrollTo?.({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [messages, session]);
  useEffect(() => { if (busy) list.current?.scrollTo?.({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [busy]);

  function togglePet() { const next = !enabled; setEnabled(next); try { localStorage.setItem('sentient.pet.enabled.' + session.uid, String(next)); } catch { /* preference optional */ } }
  function cancel() { sequence.current++; controller.current?.abort(); controller.current = null; setBusy(false); setReaction('idle'); setError(copy.stopped); }
  function clear() { sequence.current++; controller.current?.abort(); controller.current = null; clearTimeout(settle.current); setBusy(false); setMessages([]); setDraft(''); setError(''); setReaction('idle'); input.current?.focus(); }
  async function ask(value = draft) {
    const message = value.trim();
    if (!message || busy || !session) return;
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
      if (!response.ok) throw new Error(response.status === 504 ? 'timeout' : 'unavailable');
      const result = await response.json();
      if (current !== sequence.current) return;
      if (!result.answer || typeof result.answer !== 'string') throw new Error('unavailable');
      setMessages(items => [...items, { id: crypto.randomUUID(), role: 'assistant', content: result.answer, sources: Array.isArray(result.sources) ? result.sources : [] }]);
      setReaction('celebrate'); settle.current = setTimeout(() => setReaction('idle'), 2500);
      if (!opened.current) setUnread(number => number + 1);
    } catch (reason) {
      if (current !== sequence.current) return;
      setMessages(items => items.map(item => item.id === userId ? { ...item, failed: true } : item));
      setDraft(message); setReaction('error'); setError(abort.signal.aborted || reason.message === 'timeout' ? copy.timeout : copy.error);
    } finally { clearTimeout(timer); if (current === sequence.current) { setBusy(false); controller.current = null; } }
  }
  if (!session) return null;
  return <div className={`companion ${open ? 'is-open' : ''} ${enabled ? '' : 'is-compact'}`}>
    {open ? <section className="companion-chat" role="dialog" aria-modal="false" aria-label={copy.open} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } }}>
      <header className="chat-header"><div className="chat-identity"><span className="chat-status-dot"/><div><strong>{copy.title}</strong><small>{copy.subtitle}</small></div></div><div className="chat-header-actions"><button type="button" aria-label={copy.newChat} title={copy.newChat} onClick={clear}><Icon kind="new"/></button><button type="button" aria-label={enabled ? copy.hide : copy.show} title={enabled ? copy.hide : copy.show} onClick={togglePet}><Icon kind="hide"/></button><button type="button" aria-label={copy.close} title={copy.close} onClick={() => setOpen(false)}><Icon kind="close"/></button></div></header>
      <div className="chat-transcript" ref={list} role="log" aria-live="polite" aria-relevant="additions text">
        {!messages.length ? <div className="chat-welcome"><span className="welcome-spark">✦</span><h1>{copy.greet}</h1><p>{copy.intro}</p><div className="chat-prompts">{copy.prompts.map(prompt => <button type="button" disabled={busy || !session.configured} key={prompt} onClick={() => ask(prompt)}>{prompt}<span aria-hidden="true">↗</span></button>)}</div></div> : null}
        {messages.map(item => <article key={item.id} className={`chat-message from-${item.role} ${item.failed ? 'is-failed' : ''}`}><span className="sr-only">{item.role === 'assistant' ? 'Sentient' : context.language === 'es' ? 'Vos' : 'You'}: </span><div className="chat-message-text">{item.content}</div>{item.sources?.length ? <details className="chat-sources"><summary>{copy.sources} · {item.sources.length}</summary>{item.sources.map((source, index) => safeSource(source.url) ? <a key={index} href={safeSource(source.url)} target="_top"><span>{source.label}</span>{source.partial ? <small>{copy.partial}</small> : null}<code>{source.endpoint}</code></a> : null)}</details> : null}</article>)}
        {busy ? <div className="chat-thinking" role="status"><span/><span/><span/><small>{copy.thinking}</small></div> : null}
      </div>
      <form className="chat-composer" onSubmit={event => { event.preventDefault(); ask(); }}>
        {error ? <p className="chat-error" role="alert">{error}</p> : null}
        {!session.configured ? <p className="chat-error" role="status">{copy.unavailable}</p> : null}
        <div className="chat-input-row"><textarea ref={input} aria-label={copy.placeholder} placeholder={copy.placeholder} maxLength={4000} rows={2} value={draft} disabled={!session.configured} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); ask(); } }}/>{busy ? <button className="chat-submit" type="button" aria-label={copy.stop} onClick={cancel}><Icon kind="stop"/></button> : <button className="chat-submit" type="submit" aria-label={copy.send} disabled={!draft.trim() || !session.configured}><Icon kind="send"/></button>}</div><p className="chat-note">{copy.note}</p>
      </form>
    </section> : null}
    <button type="button" className={`pet-launcher ${!open || !enabled ? 'mini-launcher' : ''}`} aria-label={open ? copy.close : copy.open} aria-expanded={open} onClick={() => { setOpen(value => !value); if (!open && !busy) setReaction('attentive'); }}>
      <Avatar reaction={open && enabled ? reaction : 'idle'} unread={open && enabled ? unread : 0} paused={!open || !enabled}/>
      {(!open || !enabled) && unread ? <span className="compact-count">{unread > 99 ? '99+' : unread}</span> : null}
    </button>
  </div>;
}
