import { validResearchFilters } from '../researchFilterOptions';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Character } from './Character';
import { loadConversation, saveConversation, listConversations, newConversation, deleteConversation } from './history';
import { LaunchSplash } from './LaunchSplash';
import { isLaunchSuppressed, setLaunchSuppressed, launchStorageKey } from './launch';
import { ResultPill, ResultPills } from './ResultPills';
import { extractPostResults, postKeyFromUrl, loadResults, saveResults, clearResults } from './results';
import { COMMANDS, parseCommand, suggestCommands, pendingNextContext, sanitizeNextContext } from './commands';
import { useVoice } from './useVoice';
import { claimVoiceHandoff, clearVoiceHandoff } from './voiceHandoff';
import './position.css';

const COPY = {
  es: { open: 'Hablar con Sentient', close: 'Minimizar chat', title: 'Sentient', subtitle: 'Tu dashboard, en conversación', greet: '¿Qué querés saber?', intro: 'Busco primero en los datos de tu dashboard para ayudarte a encontrar posts y decidir qué publicar.', placeholder: 'Preguntame sobre el dashboard…', send: 'Enviar pregunta', stop: 'Detener respuesta', thinking: 'Buscando en el dashboard…', hide: 'Cerrar asistente', show: 'Mostrar mascota', newChat: 'Nueva conversación', sources: 'Datos consultados', error: 'No pude completar la consulta. Intentá de nuevo.', timeout: 'La consulta tardó demasiado. Probá una pregunta más específica.', unsupported: 'Esos filtros no están disponibles en esta página.', unavailable: 'El chat todavía no está disponible. Intentá más tarde.', note: 'Las respuestas pueden contener errores. Revisá las fuentes.', prompts: [{ label: 'Carrusel con más likes · 24 h', question: '¿Cuál es el carrusel con más likes de las últimas 24 horas?' }, { label: 'Reel con más likes · 24 h', question: '¿Cuál es el reel con más likes de las últimas 24 horas?' }, { label: 'Top 3 reels históricos de una cuenta…', draft: '¿Cuáles son los 3 reels con más likes de toda la historia de @' }], partial: 'Muestra parcial', stopped: 'Consulta detenida.' },
  en: { open: 'Chat with Sentient', close: 'Minimize chat', title: 'Sentient', subtitle: 'Your dashboard, in conversation', greet: 'What would you like to know?', intro: 'I search your dashboard data first to help you find posts and decide what to publish.', placeholder: 'Ask me about the dashboard…', send: 'Send question', stop: 'Stop response', thinking: 'Searching the dashboard…', hide: 'Close assistant', show: 'Show companion', newChat: 'New conversation', sources: 'Data consulted', error: 'I couldn’t finish this query. Please try again.', timeout: 'This query took too long. Try a more specific question.', unsupported: 'Those filters are not available on this page.', unavailable: 'Chat is not available yet. Please try later.', note: 'Answers may contain mistakes. Check the sources.', prompts: [{ label: 'Most liked carousel · 24h', question: 'What is the most liked carousel in the last 24 hours?' }, { label: 'Most liked reel · 24h', question: 'What is the most liked reel in the last 24 hours?' }, { label: 'Top 3 reels ever from a page…', draft: 'What are the 3 most liked reels ever from @' }], partial: 'Partial sample', stopped: 'Query stopped.' },
};
const postHost = data => { if (parent !== window) parent.postMessage({ source: 'sentient-companion', ...data }, location.origin); };
Object.assign(COPY.es, { menu: 'Opciones de Sentient', history: 'Historial de chats', historyNote: 'Guardado en este navegador · Últimas 30 conversaciones', emptyHistory: 'Todavía no hay conversaciones guardadas.', back: 'Volver al chat', resume: 'Abrir conversación', delete: 'Eliminar conversación', confirmDelete: '¿Eliminar esta conversación?', cancel: 'Cancelar', position: 'Posición', current: 'Actual', dock: ['Arriba izquierda', 'Arriba derecha', 'Centro izquierda', 'Centro derecha', 'Abajo izquierda', 'Abajo derecha'], limited: 'Hay otra consulta en curso o alcanzaste el límite temporal. Intentá de nuevo en unos segundos.' });
Object.assign(COPY.en, { menu: 'Sentient options', history: 'Chat history', historyNote: 'Saved in this browser · Last 30 conversations', emptyHistory: 'No saved conversations yet.', back: 'Back to chat', resume: 'Open conversation', delete: 'Delete conversation', confirmDelete: 'Delete this conversation?', cancel: 'Cancel', position: 'Position', current: 'Current', dock: ['Top left', 'Top right', 'Middle left', 'Middle right', 'Bottom left', 'Bottom right'], limited: 'Another query is running or the temporary limit was reached. Try again in a few seconds.' });
const DOCKS = ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right'];
COPY.es.aboutBot = 'Conocé a Sentient Bot';
COPY.en.aboutBot = 'Meet Sentient Bot';
Object.assign(COPY.es, { commands: 'Comandos', useCommand: 'Usar', filterCommand: 'Aplicar filtros en el dashboard', researchCommand: 'Buscar datos y responder en el chat', nextCommand: 'Recomendar qué post recrear', commandRequired: 'Escribí una consulta después del comando.' });
Object.assign(COPY.en, { commands: 'Commands', useCommand: 'Use', filterCommand: 'Apply dashboard filters', researchCommand: 'Search data and answer in chat', nextCommand: 'Recommend the next post to recreate', commandRequired: 'Write a query after the command.' });
Object.assign(COPY.es, { voiceStart: 'Hablar por voz', voiceSend: 'Terminar y enviar audio', voiceCancel: 'Cancelar audio', voiceRequesting: 'Esperando permiso del micrófono…', voiceRecording: 'Te escucho', voiceAutoSend: 'Se envía cuando terminás de hablar', voiceTranscribing: 'Transcribiendo…', voiceRead: 'Leer respuestas de texto en voz alta', voicePlay: 'Escuchar respuesta', voiceStop: 'Detener audio', voiceLoading: 'Preparando audio…', voiceBlocked: 'Tocá para escuchar', voiceDisclosure: 'Voz generada por IA.', voicePermission: 'Permití el micrófono en tu navegador para hablar. También podés escribir.', voiceUnsupported: 'Este navegador no permite grabar audio. Podés escribir tu pregunta.', voiceRecordError: 'No pude grabar el audio. Revisá el micrófono e intentá de nuevo.', voiceTranscribeError: 'No pude transcribir el audio. Intentá de nuevo o escribí tu pregunta.', voiceEmpty: 'No detecté palabras. Intentá hablar de nuevo.', voiceTooLarge: 'El audio supera 10 MB. Grabá un mensaje más corto.', voicePlaybackError: 'No pude reproducir el audio. Podés volver a escucharlo con el botón de la respuesta.' });
Object.assign(COPY.en, { voiceStart: 'Ask by voice', voiceSend: 'Finish and send audio', voiceCancel: 'Cancel audio', voiceRequesting: 'Waiting for microphone permission…', voiceRecording: 'Listening', voiceAutoSend: 'Sends when you finish speaking', voiceTranscribing: 'Transcribing…', voiceRead: 'Read text replies aloud', voicePlay: 'Listen to reply', voiceStop: 'Stop audio', voiceLoading: 'Preparing audio…', voiceBlocked: 'Tap to listen', voiceDisclosure: 'AI-generated voice.', voicePermission: 'Allow microphone access in your browser to speak. You can also type.', voiceUnsupported: 'This browser cannot record audio. You can type your question.', voiceRecordError: 'I couldn’t record audio. Check your microphone and try again.', voiceTranscribeError: 'I couldn’t transcribe this audio. Try again or type your question.', voiceEmpty: 'No words were detected. Please try speaking again.', voiceTooLarge: 'The audio exceeds 10 MB. Record a shorter message.', voicePlaybackError: 'I couldn’t play this audio. Try the reply’s play button again.' });
function safeSource(url) {
  try { const target = new URL(url); return target.origin === 'https://sentientdash.app' && !target.username && !target.password ? target.href : null; } catch { return null; }
}
export function AnswerText({ text, onNavigate, results = [], currentUrl, locale = 'en' }) {
  // Replace a post link in place, keeping its likes beside it in the answer.
  // Ordinary prose and source links remain escaped, safe React text/anchors.
  const byPost = new Map(results.map((result, index) => [result.postKey, { result, index }]));
  const pattern = () => /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)|(https:\/\/sentientdash\.app\/[^\s<>\])"'`]+)/g;
  const source = String(text || '').split('\n').map(line => {
    const hasPill = [...line.matchAll(pattern())].some(match => byPost.has(postKeyFromUrl((match[2] || match[3]).replace(/[.,!?;:]+$/, ''))));
    return hasPill ? line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '') : line;
  }).join('\n');
  const chunks = [], rendered = new Set();
  let end = 0;
  for (const match of source.matchAll(pattern())) {
    chunks.push(source.slice(end, match.index));
    const rawUrl = match[2] || match[3], cleanUrl = match[3] ? rawUrl.replace(/[.,!?;:]+$/, '') : rawUrl;
    const url = safeSource(cleanUrl), post = byPost.get(postKeyFromUrl(url));
    if (url && post) {
      if (!rendered.has(post.result.postKey)) {
        rendered.add(post.result.postKey);
        chunks.push(<ResultPill key={match.index} {...post} currentUrl={currentUrl} locale={locale} onNavigate={event => onNavigate?.(event, results)}/>);
        // Some answers put the count inside the link label itself.
        const metric = match[1]?.match(/\b\d[\d.,\u00a0 ]*(?:[kmb])?\s*(?:likes?|me gusta)\b/i)?.[0];
        if (metric) {
          const lineStart = source.lastIndexOf('\n', match.index - 1) + 1;
          const nextBreak = source.indexOf('\n', match.index + match[0].length);
          const surroundings = source.slice(lineStart, match.index) + source.slice(match.index + match[0].length, nextBreak === -1 ? source.length : nextBreak);
          if (!surroundings.includes(metric)) chunks.push(' ' + metric);
        }
      }
    } else chunks.push(url ? <a key={match.index} href={url} target="_top" onClick={onNavigate} onAuxClick={onNavigate}>{match[1] || url}</a> : match[0]);
    if (match[3]) chunks.push(rawUrl.slice(cleanUrl.length));
    end = match.index + match[0].length;
  }
  chunks.push(source.slice(end));
  return chunks;
}
function Icon({ kind }) {
  const paths = { close: 'M5 12h14', send: 'm5 12 14-7-5 14-3-6-6-1Z M11 13l8-8', new: 'M12 5v14 M5 12h14', stop: 'M7 7h10v10H7Z', chat: 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z', hide: 'M3 3l18 18 M10 5h9a2 2 0 0 1 2 2v9 M7 7H5a2 2 0 0 0-2 2v9l6-4h5' };
  Object.assign(paths, { history: 'M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2', back: 'm12 5-7 7 7 7 M5 12h14', trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7' });
  Object.assign(paths, { mic: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M9 22h6', audio: 'M11 4 6 8H3v8h3l5 4V4Z M15 8a6 6 0 0 1 0 8 M18 5a10 10 0 0 1 0 14', cancel: 'm6 6 12 12 M18 6 6 18' });
  if (kind === 'menu') return <svg viewBox="0 0 24 24" aria-hidden="true">{[5, 12, 19].map(x => <circle key={x} cx={x} cy="12" r="1.5" fill="currentColor" stroke="none"/>)}</svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[kind] || paths.chat}/></svg>;
}

export function Companion({ session, request, apiBase, Avatar = Character }) {
  const [context, setContext] = useState({ page: '/', pageUrl: '', language: 'es', theme: 'dark' });
  const [contextReady, setContextReady] = useState(parent === window);
  const [launchVisible, setLaunchVisible] = useState(() => Boolean(session?.uid && session.configured && !isLaunchSuppressed(session.uid)));
  const [launchSuppressed, setLaunchSuppressedState] = useState(() => isLaunchSuppressed(session?.uid));
  const [activeResults, setActiveResults] = useState(() => loadResults(session?.uid));
  const [open, setOpen] = useState(() => { try { return sessionStorage.getItem('sentient.pet.open.' + session?.uid) === 'true' && localStorage.getItem('sentient.pet.enabled.' + session?.uid) !== 'false'; } catch { return false; } });
  const [geometry, setGeometry] = useState(null);
  const [enabled, setEnabled] = useState(() => { try { return localStorage.getItem('sentient.pet.enabled.' + session?.uid) !== 'false'; } catch { return true; } });
  const [conversation, setConversation] = useState(() => loadConversation(session?.uid));
  const [messages, setMessages] = useState(() => conversation.messages);
  const [view, setView] = useState('chat'), [menu, setMenu] = useState(false), [history, setHistory] = useState([]), [deleting, setDeleting] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [draft, setDraft] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [commandIndex, setCommandIndex] = useState(0), [commandMenuDismissed, setCommandMenuDismissed] = useState(false);
  const [reaction, setReaction] = useState('idle'), [unread, setUnread] = useState(0);
  const [readAloud, setReadAloud] = useState(() => { try { return localStorage.getItem('sentient.pet.voice.' + session?.uid) === 'true'; } catch { return false; } });
  const gesture = useRef(null), suppressClick = useRef(false);
  const input = useRef(null), list = useRef(null), controller = useRef(null), sequence = useRef(0), opened = useRef(open), settle = useRef(null), menuElement = useRef(null), launcher = useRef(null), menuTrigger = useRef(null);
  const copy = COPY[context.language];
  const voice = useVoice({ request, apiBase, uid: session?.uid, onTranscript: (text, meta) => {
    const mode = parseCommand(text).mode === 'auto' ? meta.mode : 'auto';
    ask((mode && mode !== 'auto' ? `/${mode} ${text}` : text).slice(0, 4000), { spoken: true });
  } });
  const voiceBusy = voice.phase !== 'idle';
  const draftCommand = parseCommand(draft);
  const composerMode = draftCommand.mode === 'auto' && pendingNextContext(messages, draft) ? 'next' : draftCommand.mode;
  const commandSuggestions = commandMenuDismissed ? [] : suggestCommands(draft);
  const currentVisual = useRef({ enabled, activeResults });
  currentVisual.current = { enabled, activeResults };
  useEffect(() => {
    if (!session?.uid || !session.configured || !contextReady || !context.pageUrl) return;
    const pending = claimVoiceHandoff(session.uid, context.pageUrl);
    if (!pending) return;
    setLaunchVisible(false); setOpen(false); setEnabled(true);
    void voice.speak(pending);
  }, [session?.uid, session?.configured, contextReady, context.pageUrl]);
  useLayoutEffect(() => {
    opened.current = open;
    try { if (session?.uid) sessionStorage.setItem('sentient.pet.open.' + session.uid, String(open)); } catch { /* optional persistence */ }
    postHost({ type: 'layout', state: !session || (launchVisible && !contextReady) ? 'hidden' : launchVisible ? 'launch' : open ? 'open' : enabled ? 'closed' : 'compact', menu: { open: menu && !launchVisible, width: 244, height: busy ? 416 : 380, anchor: menuAnchor }, results: { visible: !launchVisible && !open && enabled && !menu && activeResults.length > 0, count: activeResults.length } });
    if (open) setUnread(0);
  }, [open, enabled, session, menu, menuAnchor, busy, launchVisible, contextReady, activeResults.length]);
  useEffect(() => { if (open && view === 'chat' && !menu && !launchVisible && document.activeElement !== menuTrigger.current) input.current?.focus(); }, [open, view, menu, launchVisible]);
  useEffect(() => {
    const preferenceChanged = event => {
      if (event.key !== launchStorageKey(session?.uid)) return;
      const hidden = isLaunchSuppressed(session?.uid);
      setLaunchSuppressedState(hidden);
      if (hidden) setLaunchVisible(false);
    };
    window.addEventListener('storage', preferenceChanged);
    return () => window.removeEventListener('storage', preferenceChanged);
  }, [session?.uid]);
  useEffect(() => {
    if (!menu) return;
    menuElement.current?.querySelector('button:not(:disabled)')?.focus();
    const dismiss = event => { if (!menuElement.current?.contains(event.target) && !launcher.current?.contains(event.target) && !menuTrigger.current?.contains(event.target)) setMenu(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [menu]);
  const menuPositioned = Boolean(geometry?.menu);
  useEffect(() => { if (menu && menuPositioned) menuElement.current?.querySelector('button:not(:disabled)')?.focus(); }, [menu, menuPositioned]);
  useEffect(() => {
    let dock; try { dock = localStorage.getItem('sentient.pet.position.' + session?.uid); } catch { /* optional preference */ }
    postHost({ type: 'ready', dock });
    const receive = event => {
      if (event.origin !== location.origin || event.source !== parent || event.data?.source !== 'sentient-host' || !['context', 'geometry', 'docked', 'dismiss-menu', 'minimize'].includes(event.data.type)) return;
      const next = event.data;
      if (next.type === 'dismiss-menu') { setMenu(false); return; }
      if (next.type === 'minimize') { minimize(); return; }
      if (next.type === 'geometry') {
        if (['avatar', 'panel'].every(key => next[key] && ['x', 'y', 'w', 'h'].every(n => Number.isFinite(next[key][n]) && next[key][n] >= 0 && next[key][n] < 10000))) setGeometry(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
        return;
      }
      if (next.type === 'docked') {
        if (/^(top|middle|bottom)-(left|right)$/.test(next.dock)) try { localStorage.setItem('sentient.pet.position.' + session?.uid, next.dock); } catch { /* optional preference */ }
        return;
      }
      const variables = { surface: '--surface', raised: '--raised', line: '--line', muted: '--muted', text: '--text', accent: '--accent', accentInk: '--accent-ink' };
      for (const [name, variable] of Object.entries(variables)) {
        const value = next.tokens?.[name];
        if (typeof value === 'string' && value.length < 150 && window.CSS?.supports('color', value) && document.documentElement.style.getPropertyValue(variable) !== value) document.documentElement.style.setProperty(variable, value);
      }
      if (typeof next.font === 'string' && next.font.length < 180 && window.CSS?.supports('font-family', next.font) && document.documentElement.style.fontFamily !== next.font) document.documentElement.style.fontFamily = next.font;
      if (typeof next.radius === 'string' && window.CSS?.supports('border-radius', next.radius) && document.documentElement.style.getPropertyValue('--chat-radius') !== next.radius) document.documentElement.style.setProperty('--chat-radius', next.radius);
      const nextContext = { page: typeof next.page === 'string' ? next.page.slice(0, 100) : '/', pageUrl: typeof next.pageUrl === 'string' ? next.pageUrl.slice(0, 8000) : '', language: next.language === 'en' ? 'en' : 'es', theme: next.theme === 'light' ? 'light' : 'dark' };
      setContext(previous => Object.keys(nextContext).every(key => previous[key] === nextContext[key]) ? previous : nextContext);
      setContextReady(true);
    };
    window.addEventListener('message', receive);
    return () => { window.removeEventListener('message', receive); sequence.current++; controller.current?.abort(); clearTimeout(settle.current); };
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = context.theme; document.documentElement.lang = context.language; }, [context.theme, context.language]);
  useEffect(() => {
    if (!session?.uid) return;
    saveConversation(session.uid, { id: conversation.id, messages });
    if (view === 'history') setHistory(listConversations(session.uid));
    list.current?.scrollTo?.({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [messages, session, conversation.id]);
  useEffect(() => { if (busy) list.current?.scrollTo?.({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [busy]);

  function minimize(resultSet, { preserveVoice = false } = {}) {
    if (!preserveVoice) { voice.cancelAll(); clearVoiceHandoff(session?.uid); }
    const visual = currentVisual.current;
    const results = Array.isArray(resultSet) ? resultSet : visual.activeResults;
    setMenu(false); setOpen(false); opened.current = false;
    try { sessionStorage.setItem('sentient.pet.open.' + session?.uid, 'false'); } catch { /* persistence optional */ }
    postHost({ type: 'layout', state: visual.enabled ? 'closed' : 'compact', menu: { open: false }, results: { visible: visual.enabled && results.length > 0, count: results.length } });
  }
  function navigate(event, resultSet) {
    if (event.type === 'auxclick' && event.button !== 1) return;
    const nextResults = Array.isArray(resultSet) && resultSet.length ? saveResults(session.uid, resultSet) : currentVisual.current.activeResults;
    if (nextResults !== currentVisual.current.activeResults) setActiveResults(nextResults);
    const sameTab = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    const savedMessages = sameTab ? cancelledMessages() : messages;
    if (sameTab && busy) { stopPending(); setMessages(savedMessages); }
    minimize(nextResults);
    saveConversation(session.uid, { id: conversation.id, messages: savedMessages });
    // Other same-origin dashboard pages retain native navigation after the
    // minimized state is saved; the host only routes its supported tools.
    const hosted = /^\/(?:index\.html|queue\.html|tracker\.html|insights\.html|settings\.html|promos\.html|news\.html|hooks\.html|vault\.html|mobile\/(?:index\.html)?)?$/.test(new URL(event.currentTarget.href).pathname);
    if (sameTab && hosted && parent !== window) {
      event.preventDefault(); postHost({ type: 'navigate', url: event.currentTarget.href });
    }
  }
  function enable() { setEnabled(true); try { localStorage.setItem('sentient.pet.enabled.' + session.uid, 'true'); } catch { /* preference optional */ } }
  function dismissResults() { clearResults(session.uid); setActiveResults([]); }
  function dismissLaunch() { setLaunchVisible(false); }
  function changeLaunchPreference(hidden) {
    setLaunchSuppressed(session.uid, hidden);
    setLaunchSuppressedState(hidden);
  }
  function startFromLaunch() { dismissLaunch(); enable(); setMenu(false); setView('chat'); setOpen(true); setReaction('attentive'); }
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
  const menuStyle = boxStyle(geometry?.menu);
  if (menuStyle && geometry?.avatar) {
    const { menu: box, avatar } = geometry;
    const originX = Math.max(0, Math.min(box.w, Number.isFinite(box.origin?.x) ? box.origin.x : avatar.x + avatar.w / 2 - box.x));
    const originY = Math.max(0, Math.min(box.h, Number.isFinite(box.origin?.y) ? box.origin.y : avatar.y + avatar.h / 2 - box.y));
    Object.assign(menuStyle, {
      '--pet-menu-origin': `${originX}px ${originY}px`,
      '--pet-menu-enter-x': `${(originX / Math.max(1, box.w) - .5) * 20}px`,
      '--pet-menu-enter-y': `${(originY / Math.max(1, box.h) - .5) * 20}px`,
    });
  }
  function stopPending() { voice.cancelAll(); clearVoiceHandoff(session?.uid); sequence.current++; controller.current?.abort(); controller.current = null; clearTimeout(settle.current); setBusy(false); setReaction('idle'); }
  function cancelledMessages() { return messages.map((item, i) => busy && i === messages.length - 1 && item.role === 'user' ? { ...item, failed: true } : item); }
  function cancel() { stopPending(); setMessages(cancelledMessages()); setDraft(messages.at(-1)?.role === 'user' ? messages.at(-1).content : ''); setError(copy.stopped); setMenu(false); }
  function clear() {
    saveConversation(session.uid, { id: conversation.id, messages: cancelledMessages() });
    dismissResults();
    stopPending(); const next = newConversation(session.uid); setConversation(next); setMessages([]); setDraft(''); setError(''); setView('chat'); setMenu(false); enable(); setOpen(true);
  }
  function showHistory() { voice.cancelAll(); setHistory(listConversations(session.uid)); setDeleting(null); setView('history'); setMenu(false); enable(); setOpen(true); }
  function resume(entry) {
    const selected = entry.id === conversation.id ? { ...entry, messages: cancelledMessages() } : entry;
    saveConversation(session.uid, { id: conversation.id, messages: cancelledMessages() });
    stopPending(); saveConversation(session.uid, selected); setConversation(selected); setMessages(selected.messages); setDraft(''); setError(''); setView('chat'); setDeleting(null);
  }
  function removeHistory(id) {
    setHistory(deleteConversation(session.uid, id)); setDeleting(null);
    if (id === conversation.id) { stopPending(); setConversation(newConversation(session.uid)); setMessages([]); setDraft(''); setError(''); }
  }
  function openMenu(event, source) {
    event.preventDefault(); event.stopPropagation();
    menuTrigger.current = event.currentTarget;
    if (source === 'chat') {
      const trigger = event.currentTarget.getBoundingClientRect();
      const panel = event.currentTarget.closest('.companion-chat')?.getBoundingClientRect();
      setMenuAnchor(panel ? { source: 'chat', right: panel.right - trigger.right, top: trigger.top - panel.top, w: trigger.width, h: trigger.height } : null);
    } else setMenuAnchor(null);
    setMenu(value => !value);
  }
  function menuKeys(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setMenu(false); (menuTrigger.current || launcher.current)?.focus(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const buttons = [...menuElement.current.querySelectorAll('button:not(:disabled)')], index = buttons.indexOf(document.activeElement);
    buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }
  function chooseCommand(mode) {
    const query = suggestCommands(draft).length ? '' : parseCommand(draft).query;
    setDraft(`/${mode} ${query}`.slice(0, 4000));
    setCommandMenuDismissed(true); setCommandIndex(0); setError('');
    input.current?.focus();
  }
  function composerKeys(event) {
    if (event.nativeEvent.isComposing) return;
    if (commandSuggestions.length) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setCommandMenuDismissed(true); return; }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        setCommandIndex(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + commandSuggestions.length) % commandSuggestions.length);
        return;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
        event.preventDefault(); chooseCommand(commandSuggestions[commandIndex] || commandSuggestions[0]); return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(); }
  }
  async function ask(value = draft, { spoken = false } = {}) {
    const message = value.trim();
    if (!message || busy || controller.current || !session) return;
    const command = parseCommand(message);
    if (!command.query && command.mode !== 'next') { setError(copy.commandRequired); return; }
    const nextContext = command.mode === 'auto' ? pendingNextContext(messages, message) : null;
    const mode = nextContext ? 'next' : command.mode;
    if (!session.configured) { setError(copy.unavailable); return; }
    voice.cancelRecording(); voice.stopSpeech(); voice.clearError();
    clearVoiceHandoff(session.uid);
    if (!spoken && readAloud) voice.unlock();
    const speechPermit = voice.permit();
    const current = ++sequence.current;
    const abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort('timeout'), 125_000);
    clearTimeout(settle.current); setDraft(''); setCommandMenuDismissed(false); setCommandIndex(0); setError(''); setBusy(true); setReaction('thinking');
    const history = messages.filter(item => !item.failed).slice(-10).map(({ role, content }) => ({ role, content: content.slice(0, 8000) }));
    const userId = crypto.randomUUID();
    setMessages(items => [...items, { id: userId, role: 'user', content: message }]);
    try {
      const response = await request(apiBase + '/api/dashboard/assistant/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal, body: JSON.stringify({ message, history, language: context.language, input_mode: spoken ? 'voice' : 'text', page: context.page, ...(mode !== 'auto' ? { mode } : {}), ...(nextContext ? { next_context: nextContext } : {}) }) });
      if (current !== sequence.current) return;
      if (!response.ok) throw new Error(response.status === 504 ? 'timeout' : response.status === 429 ? 'limited' : 'unavailable');
      const result = await response.json();
      if (current !== sequence.current) return;
      if (!result.answer || typeof result.answer !== 'string') throw new Error('unavailable');
      const action = Array.isArray(result.ui_actions) ? result.ui_actions.find(item => item.type === 'research_filters') : null;
      if (action && (['research', 'next'].includes(mode) || !validResearchFilters(action.filters))) throw new Error('unsupported');
      const replyLanguage = ['en', 'es'].includes(result.language) ? result.language : context.language;
      const assistantMessage = { id: crypto.randomUUID(), role: 'assistant', content: result.answer, language: replyLanguage, sources: Array.isArray(result.sources) ? result.sources : [] };
      const pendingNext = mode === 'next' ? sanitizeNextContext(result.pending_next) : null;
      if (pendingNext) assistantMessage.pending_next = pendingNext;
      setMessages(items => [...items, assistantMessage]);
      const wantsSpeech = (spoken || readAloud) && voice.permit() === speechPermit;
      const spokenReply = { id: assistantMessage.id, text: result.answer.slice(0, 12000), question: message, language: replyLanguage, mode };
      if (action) {
        dismissResults();
        minimize(undefined, { preserveVoice: true }); setUnread(0);
        // Persist before navigation so both the request and answer survive it.
        saveConversation(session.uid, { id: conversation.id, messages: [...messages, { id: userId, role: 'user', content: message }, assistantMessage] });
        postHost({ type: 'research_filters', filters: action.filters, ...(wantsSpeech ? { voiceHandoff: { ...spokenReply, owner: session.uid } } : {}) });
      }
      setReaction('celebrate'); settle.current = setTimeout(() => setReaction('idle'), 2500);
      if (wantsSpeech && (!action || /^\/(?:index\.html)?$/.test(context.page))) void voice.speak(spokenReply, { permit: speechPermit });
      if (!opened.current && !action) setUnread(number => number + 1);
    } catch (reason) {
      if (current !== sequence.current) return;
      setMessages(items => items.map(item => item.id === userId ? { ...item, failed: true } : item));
      setDraft(message); setReaction('error'); setError(abort.signal.aborted || reason.message === 'timeout' ? copy.timeout : ['limited', 'unsupported'].includes(reason.message) ? copy[reason.message] : copy.error);
    } finally { clearTimeout(timer); if (current === sequence.current) { setBusy(false); controller.current = null; } }
  }
  function toggleReadAloud() {
    const next = !readAloud; setReadAloud(next);
    try { localStorage.setItem('sentient.pet.voice.' + session.uid, String(next)); } catch { /* Optional preference. */ }
    if (next) voice.unlock(); else voice.stopSpeech();
  }
  function playReply(item, index) {
    if (voice.speech.id === item.id && ['playing', 'loading'].includes(voice.speech.status)) { voice.stopSpeech(); return; }
    voice.unlock();
    const question = messages.slice(0, index).findLast(message => message.role === 'user')?.content || '';
    const command = parseCommand(question);
    const mode = command.mode === 'auto' && pendingNextContext(messages.slice(0, index - 1), question) ? 'next' : command.mode;
    void voice.speak({ id: item.id, text: item.content, question, language: item.language || context.language, mode });
  }
  if (!session) return null;
  if (launchVisible) return contextReady ? <LaunchSplash locale={context.language} dontShowAgain={launchSuppressed} onDontShowAgainChange={changeLaunchPreference} onStart={startFromLaunch} onDismiss={dismissLaunch} Avatar={Avatar}/> : null;
  return <div className={`companion ${open ? 'is-open' : ''} ${enabled ? '' : 'is-compact'}`} data-dock={geometry?.dock} onKeyDown={event => { if (event.key === 'Escape' && open && !menu) { event.stopPropagation(); minimize(); launcher.current?.focus(); } }} onPointerDown={event => { if (event.target === event.currentTarget) { if (open) minimize(); else setMenu(false); } }}>
    {open ? <section className="companion-chat" style={{ ...boxStyle(geometry?.panel), visibility: parent === window || (geometry?.panel?.w > 0 && geometry?.panel?.h > 0 && (!geometry.state || geometry.state === 'open')) ? undefined : 'hidden' }} role="dialog" aria-modal="false" aria-label={view === 'history' ? copy.history : copy.open} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); minimize(); launcher.current?.focus(); } }}>
      <header className="chat-header"><div className="chat-identity"><span className="chat-status-dot"/><div><strong>{view === 'history' ? copy.history : copy.title}</strong><small>{copy.subtitle}</small></div></div><div className="chat-header-actions"><button type="button" aria-label={copy.newChat} title={copy.newChat} onClick={clear}><Icon kind="new"/></button><button type="button" aria-label={copy.menu} title={copy.menu} aria-haspopup="menu" aria-expanded={menu} onClick={event => openMenu(event, 'chat')}><Icon kind="menu"/></button><button type="button" aria-label={copy.close} title={copy.close} onClick={minimize}><Icon kind="close"/></button></div></header>
      {view === 'history' ? <div className="chat-history">
        <button className="history-back" type="button" onClick={() => setView('chat')}><Icon kind="back"/>{copy.back}</button>
        <p className="history-note">{copy.historyNote}</p>
        {!history.length ? <p className="history-empty">{copy.emptyHistory}</p> : history.map(entry => <div className="history-entry" key={entry.id}>
          {deleting === entry.id ? <div className="history-confirm"><span>{copy.confirmDelete}</span><button type="button" onClick={() => removeHistory(entry.id)}>{copy.delete}</button><button type="button" onClick={() => setDeleting(null)}>{copy.cancel}</button></div> : <><button className="history-resume" type="button" onClick={() => resume(entry)} aria-label={`${copy.resume}: ${entry.title}`}><strong>{entry.title}</strong><small>{new Date(entry.updatedAt).toLocaleDateString(context.language, { month: 'short', day: 'numeric' })}{entry.id === conversation.id ? ` · ${copy.current}` : ''}</small></button><button className="history-delete" type="button" aria-label={`${copy.delete}: ${entry.title}`} onClick={() => setDeleting(entry.id)}><Icon kind="trash"/></button></>}
        </div>)}
      </div> : <><div className="chat-transcript" ref={list} role="log" aria-live="polite" aria-relevant="additions text">
        {!messages.length ? <div className="chat-welcome"><span className="welcome-spark">✦</span><h1>{copy.greet}</h1><p>{copy.intro}</p><div className="chat-prompts">{copy.prompts.map(prompt => <button type="button" disabled={busy || voiceBusy || !session.configured} key={prompt.label} onClick={() => { if (prompt.draft) { setDraft(prompt.draft); input.current?.focus(); } else ask(prompt.question); }}>{prompt.label}<span aria-hidden="true">↗</span></button>)}</div></div> : null}
        {messages.map((item, index) => {
          const postResults = item.role === 'assistant' ? extractPostResults(item.content) : [];
          const text = item.content;
          const playing = voice.speech.id === item.id;
          const audioActive = playing && ['loading', 'playing'].includes(voice.speech.status);
          return <article key={item.id} className={`chat-message from-${item.role} ${item.failed ? 'is-failed' : ''}`}><span className="sr-only">{item.role === 'assistant' ? 'Sentient' : context.language === 'es' ? 'Vos' : 'You'}: </span>{text ? <div className="chat-message-text">{item.role === 'assistant' ? <AnswerText text={text} onNavigate={navigate} results={postResults} currentUrl={context.pageUrl} locale={context.language}/> : text}</div> : null}{item.sources?.length ? <details className="chat-sources"><summary>{copy.sources} · {item.sources.length}</summary>{item.sources.map((source, index) => safeSource(source.url) ? <a key={index} href={safeSource(source.url)} target="_top" onClick={navigate} onAuxClick={navigate}><span>{source.label}</span>{source.partial ? <small>{copy.partial}</small> : null}<code>{source.endpoint}</code></a> : null)}</details> : null}{item.role === 'assistant' ? <div className="chat-audio-reply"><button type="button" disabled={voiceBusy || busy} aria-label={audioActive ? copy.voiceStop : copy.voicePlay} title={audioActive ? copy.voiceStop : copy.voicePlay} onClick={() => playReply(item, index)}><Icon kind={audioActive ? 'stop' : 'audio'}/></button>{playing && voice.speech.status === 'loading' ? <span role="status">{copy.voiceLoading}</span> : playing && voice.speech.status === 'blocked' ? <span role="status">{copy.voiceBlocked}</span> : null}</div> : null}</article>;
        })}
        {busy ? <div className="chat-thinking" role="status"><span/><span/><span/><small>{copy.thinking}</small></div> : null}
      </div>
      <form className="chat-composer" onSubmit={event => { event.preventDefault(); ask(); }}>
        {error ? <p className="chat-error" role="alert">{error}</p> : null}
        {voice.error ? <p className="chat-error" role="alert">{copy[voice.error]}</p> : null}
        {!session.configured ? <p className="chat-error" role="status">{copy.unavailable}</p> : null}
        <div className="chat-command-bar" aria-label={copy.commands}>
          {COMMANDS.map(mode => <button type="button" key={mode} aria-label={`${copy.useCommand} /${mode}`} aria-pressed={composerMode === mode} title={copy[mode + 'Command']} disabled={!session.configured || busy || voiceBusy} onClick={() => chooseCommand(mode)}><span>/{mode}</span></button>)}
          <span className="chat-command-hint">{composerMode === 'auto' ? '/' : copy[composerMode + 'Command']}</span>
        </div>
        {commandSuggestions.length && !voiceBusy ? <div className="chat-command-menu" id="chat-commands" role="listbox" aria-label={copy.commands}>{commandSuggestions.map((mode, index) => <button type="button" role="option" tabIndex={-1} id={`chat-command-${mode}`} aria-selected={index === commandIndex} key={mode} onMouseEnter={() => setCommandIndex(index)} onMouseDown={event => event.preventDefault()} onClick={() => chooseCommand(mode)}><strong>/{mode}</strong><span>{copy[mode + 'Command']}</span><kbd aria-hidden="true">↵</kbd></button>)}</div> : null}
        <div className="chat-input-row">{voiceBusy ? <>
          <div className="chat-voice-status" role="status"><span className={voice.phase === 'recording' ? 'voice-record-dot' : ''}/><div><strong>{copy[voice.phase === 'recording' ? 'voiceRecording' : voice.phase === 'requesting' ? 'voiceRequesting' : 'voiceTranscribing']}</strong>{voice.phase === 'recording' ? <small>{Math.floor(voice.seconds / 60)}:{String(voice.seconds % 60).padStart(2, '0')} / 1:00{voice.autoSend ? ` · ${copy.voiceAutoSend}` : ''}</small> : null}</div></div>
          <button className="chat-voice-button" type="button" aria-label={copy.voiceCancel} title={copy.voiceCancel} onClick={voice.cancelRecording}><Icon kind="cancel"/></button>
          {voice.phase === 'recording' ? <button className="chat-submit" type="button" aria-label={copy.voiceSend} title={copy.voiceSend} onClick={voice.stopAndSend}><Icon kind="send"/></button> : null}
        </> : <><textarea ref={input} aria-label={copy.placeholder} placeholder={copy.placeholder} aria-controls={commandSuggestions.length ? 'chat-commands' : undefined} aria-activedescendant={commandSuggestions.length ? `chat-command-${commandSuggestions[commandIndex] || commandSuggestions[0]}` : undefined} maxLength={4000} rows={2} value={draft} disabled={!session.configured} onChange={event => { setDraft(event.target.value); setCommandIndex(0); setCommandMenuDismissed(false); }} onKeyDown={composerKeys}/><button className="chat-voice-button" type="button" aria-label={copy.voiceStart} title={voice.supported ? copy.voiceStart : copy.voiceUnsupported} disabled={busy || !session.configured} onClick={() => voice.start({ mode: draftCommand.mode })}><Icon kind="mic"/></button>{busy ? <button className="chat-submit" type="button" aria-label={copy.stop} onClick={cancel}><Icon kind="stop"/></button> : <button className="chat-submit" type="submit" aria-label={copy.send} disabled={(!draftCommand.query && draftCommand.mode !== 'next') || !session.configured}><Icon kind="send"/></button>}</>}</div>
        <div className="chat-voice-options"><button type="button" aria-label={copy.voiceRead} aria-pressed={readAloud} onClick={toggleReadAloud}><Icon kind="audio"/><span>{copy.voiceRead}</span></button><small>{copy.voiceDisclosure}</small></div>
        <p className="chat-note">{copy.note}</p>
      </form></>}
    </section> : null}
    <button ref={launcher} type="button" className={`pet-launcher ${!enabled ? 'mini-launcher' : ''}`} aria-label={open ? copy.close : copy.open} aria-expanded={open} aria-haspopup="menu" style={boxStyle(geometry?.avatar)} title={context.language === 'es' ? 'Arrastrá para mover · Clic derecho para opciones' : 'Drag to move · Right-click for options'} onClick={launch} onContextMenu={openMenu} onKeyDown={event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) openMenu(event); }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
      <Avatar reaction={enabled ? voice.speech.status === 'playing' ? 'greeting' : voice.phase === 'recording' ? 'attentive' : voice.phase === 'transcribing' ? 'working' : open ? reaction : 'idle' : 'idle'} unread={enabled ? unread : 0} paused={!enabled}/>
      {!enabled && unread ? <span className="compact-count">{unread > 99 ? '99+' : unread}</span> : null}
    </button>
    {!open && enabled && !menu && voice.speech.id ? <button className="pet-voice-playback" style={geometry?.avatar ? { left: geometry.avatar.x + 8, top: geometry.avatar.y + geometry.avatar.h - 25, width: geometry.avatar.w - 16 } : undefined} type="button" aria-label={['loading', 'playing'].includes(voice.speech.status) ? copy.voiceStop : copy.voicePlay} onClick={() => { if (['loading', 'playing'].includes(voice.speech.status)) voice.stopSpeech(); else { voice.unlock(); voice.resumeSpeech(); } }}><Icon kind={['loading', 'playing'].includes(voice.speech.status) ? 'stop' : 'audio'}/><span>{voice.speech.status === 'loading' ? copy.voiceLoading : voice.speech.status === 'playing' ? copy.voiceStop : copy.voiceBlocked}</span></button> : null}
    {!open && enabled && !menu && activeResults.length ? <div className="pet-results-floating" style={{ ...boxStyle(geometry?.results), visibility: parent === window || geometry?.results ? undefined : 'hidden' }}><ResultPills results={activeResults} locale={context.language} currentUrl={context.pageUrl} onNavigate={event => navigate(event, activeResults)} onDismiss={dismissResults}/></div> : null}
    {menu ? <div className="pet-menu" ref={menuElement} style={menuStyle} data-positioned={Boolean(geometry?.menu)} role="menu" aria-label={copy.menu} onKeyDown={menuKeys}>
      <div className="pet-menu-title" aria-hidden="true">Sentient</div>
      <button type="button" role="menuitem" onClick={() => { setMenu(false); if (open) minimize(); else { enable(); setOpen(true); setView('chat'); } }}><Icon kind={open ? 'close' : 'chat'}/>{open ? copy.close : copy.open}</button>
      <button type="button" role="menuitem" onClick={clear}><Icon kind="new"/>{copy.newChat}</button>
      <button type="button" role="menuitem" onClick={showHistory}><Icon kind="history"/>{copy.history}</button>
      <button type="button" role="menuitem" onClick={() => { voice.cancelAll(); setMenu(false); setLaunchVisible(true); }}><Icon kind="chat"/>{copy.aboutBot}</button>
      {busy ? <button type="button" role="menuitem" onClick={cancel}><Icon kind="stop"/>{copy.stop}</button> : null}
      <div className="pet-menu-divider" role="separator"/>
      <div className="pet-menu-label">{copy.position}</div>
      <div className="pet-position-screen" role="group" aria-label={copy.position}>
        <span className="pet-position-chrome" aria-hidden="true"><i/><i/><i/></span>
        <span className="pet-position-content" aria-hidden="true"><i/><i/><i/></span>
        {DOCKS.map((dock, index) => <button className={`pet-position-zone zone-${dock}`} type="button" role="menuitemradio" aria-checked={geometry?.dock === dock} key={dock} aria-label={copy.dock[index]} title={copy.dock[index]} onClick={() => { postHost({ type: 'dock', dock }); setMenu(false); }}><span className="pet-position-dot" aria-hidden="true"/></button>)}
      </div>
      <div className="pet-menu-divider" role="separator"/>
      <button type="button" role="menuitem" onClick={togglePet}><Icon kind="hide"/>{copy.hide}</button>
    </div> : null}
  </div>;
}
