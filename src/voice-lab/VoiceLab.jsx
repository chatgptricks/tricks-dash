import { useEffect, useRef, useState } from 'react';
import { BOT_VOICES, readVoicePreference, voicePreferenceKey, writeVoicePreference } from '../companion/voicePreference';
import { createPreviewPlayer } from './previewPlayer';

const COPY = {
  en: { back: 'Back to dashboard', lab: 'VOICE LAB', title: 'Find Sentient’s voice.', intro: 'Compare the same words across ten voices. Choose the one you want to hear from your bot.', language: 'Language', results: 'Search results', next: 'Next post', sample: 'Demo script', demo: 'A fixed example, not a live dashboard query.', current: 'Your bot voice', default: 'Default', selected: 'Selected', use: 'Use this voice', play: 'Listen', stop: 'Stop', loading: 'Preparing…', blocked: 'Tap to play', save: 'Saved for your account in this browser. Your bot will use it on its next spoken reply.', local: 'Your choice applies to your account in this browser. The shared default stays unchanged.', reset: 'Use default voice', resetDone: 'Default voice restored for this browser.', disclosure: 'AI-generated voices. Previews are created only when you press Listen.', checking: 'Checking your session…', signIn: 'Sign in with Google', signInTitle: 'Listen with your Sentient account.', signInNote: 'Use the same authorized account as your dashboard.', signOut: 'Sign out', loadingVoices: 'Loading the voices…', loadError: 'Couldn’t load the voice collection. Check your dashboard access and try again.', playError: 'This preview couldn’t play. Try Listen again.', saveError: 'This browser couldn’t save your choice. Check browser storage permissions.', retry: 'Try again' },
  es: { back: 'Volver al dashboard', lab: 'LABORATORIO DE VOZ', title: 'Elegí la voz de Sentient.', intro: 'Compará las mismas palabras con diez voces. Elegí la que querés escuchar en tu bot.', language: 'Idioma', results: 'Resultados de búsqueda', next: 'Siguiente post', sample: 'Guion de muestra', demo: 'Un ejemplo fijo, no una consulta real al dashboard.', current: 'La voz de tu bot', default: 'Predeterminada', selected: 'Seleccionada', use: 'Usar esta voz', play: 'Escuchar', stop: 'Detener', loading: 'Preparando…', blocked: 'Tocá para escuchar', save: 'Guardada para tu cuenta en este navegador. El bot la usará en su próxima respuesta de voz.', local: 'Tu elección se aplica a tu cuenta en este navegador. La voz predeterminada para todos no cambia.', reset: 'Usar voz predeterminada', resetDone: 'Se restauró la voz predeterminada para este navegador.', disclosure: 'Voces generadas por IA. Las muestras se crean solo al presionar Escuchar.', checking: 'Verificando tu sesión…', signIn: 'Ingresar con Google', signInTitle: 'Escuchá con tu cuenta de Sentient.', signInNote: 'Usá la misma cuenta autorizada de tu dashboard.', signOut: 'Cerrar sesión', loadingVoices: 'Cargando las voces…', loadError: 'No pude cargar las voces. Revisá tu acceso al dashboard e intentá de nuevo.', playError: 'No pude reproducir esta muestra. Intentá escucharla otra vez.', saveError: 'Este navegador no pudo guardar tu elección. Revisá los permisos de almacenamiento.', retry: 'Intentar de nuevo' },
};
function Icon({ stop = false, check = false }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{check ? <path d="m5 12 4 4L19 6"/> : stop ? <rect x="6" y="6" width="12" height="12" rx="2"/> : <path d="m9 5 11 7-11 7Z"/>}</svg>;
}

export function VoiceLab({ user, language = 'en', onLanguageChange, onSignIn, onSignOut, signInError, request, apiBase }) {
  const copy = COPY[language === 'es' ? 'es' : 'en'];
  const [catalogue, setCatalogue] = useState(null), [loadError, setLoadError] = useState(false), [attempt, setAttempt] = useState(0);
  const [sample, setSample] = useState('results'), [choice, setChoice] = useState(() => readVoicePreference(user?.uid)), [notice, setNotice] = useState('');
  const [playback, setPlayback] = useState({ key: null, status: 'idle' });
  const player = useRef(null);
  useEffect(() => {
    setCatalogue(null); setLoadError(false); setNotice(''); setChoice(readVoicePreference(user?.uid));
    setPlayback({ key: null, status: 'idle' });
    if (!user?.uid) return;
    const preview = createPreviewPlayer({ request, apiBase, onChange: setPlayback });
    player.current = preview;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 30_000);
    let active = true;
    (async () => {
      try {
        const response = await request(apiBase + '/api/dashboard/assistant/voices', { signal: abort.signal });
        if (!response.ok) throw new Error('voices');
        const data = await response.json();
        if (!active) return;
        const seen = new Set();
        const voices = Array.isArray(data.voices) ? data.voices.filter(voice => {
          if (!BOT_VOICES.includes(voice.id) || seen.has(voice.id) || typeof voice.name !== 'string' || voice.name.length > 40) return false;
          seen.add(voice.id); return true;
        }) : [];
        if (!voices.length || !['results', 'next'].every(key => ['en', 'es'].every(lang => typeof data.samples?.[key]?.[lang] === 'string' && data.samples[key][lang].length > 0 && data.samples[key][lang].length <= 3000))) throw new Error('catalogue');
        setCatalogue({ voices, defaultVoice: voices.some(voice => voice.id === data.default_voice) ? data.default_voice : 'marin', samples: data.samples });
      } catch { if (active) setLoadError(true); }
      finally { clearTimeout(timeout); }
    })();
    return () => { active = false; clearTimeout(timeout); abort.abort(); preview.dispose(); if (player.current === preview) player.current = null; };
  }, [user?.uid, attempt, request, apiBase]);
  useEffect(() => { player.current?.stop(); }, [language, sample]);
  useEffect(() => {
    const changed = event => { if (event.key === voicePreferenceKey(user?.uid)) { setChoice(readVoicePreference(user?.uid)); setNotice(''); } };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [user?.uid]);
  const select = voice => {
    if (!writeVoicePreference(user?.uid, voice)) { setNotice('saveError'); return; }
    setChoice(voice); setNotice(voice ? 'save' : 'resetDone');
  };
  const currentVoice = choice || catalogue?.defaultVoice;
  const currentName = catalogue?.voices.find(voice => voice.id === currentVoice)?.name || 'Marin';
  return <main className="voice-lab-page">
    <header className="voice-lab-header"><a href="/" className="voice-lab-brand">sentient<span>dash</span><small> / voice lab</small></a><nav aria-label={copy.language}><div className="voice-language" role="group" aria-label={copy.language}>{['en', 'es'].map(lang => <button key={lang} type="button" aria-pressed={language === lang} onClick={() => onLanguageChange(lang)}>{lang.toUpperCase()}</button>)}</div>{user ? <button className="voice-sign-out" type="button" onClick={onSignOut}>{copy.signOut}</button> : null}</nav></header>
    <a className="voice-lab-back" href="/">← {copy.back}</a>
    <div className="voice-lab-heading"><div><p className="voice-eyebrow">{copy.lab}</p><h1>{copy.title}</h1><p className="voice-lab-intro">{copy.intro}</p></div>{user && catalogue ? <div className="voice-current"><small>{copy.current}</small><strong>{currentName}<span>{choice ? copy.selected : copy.default}</span></strong><button type="button" disabled={!choice} onClick={() => select(null)}>{copy.reset}</button></div> : null}</div>
    {user === undefined ? <div className="voice-lab-gate" role="status">{copy.checking}</div> : !user ? <section className="voice-lab-gate"><h2>{copy.signInTitle}</h2><p>{copy.signInNote}</p><button type="button" className="voice-primary" onClick={onSignIn}>{copy.signIn}</button>{signInError ? <p className="voice-error" role="alert">{signInError}</p> : null}</section> : loadError ? <section className="voice-lab-gate"><p className="voice-error" role="alert">{copy.loadError}</p><button type="button" className="voice-primary" onClick={() => setAttempt(value => value + 1)}>{copy.retry}</button></section> : !catalogue ? <div className="voice-lab-gate" role="status">{copy.loadingVoices}</div> : <>
      <section className="voice-sample-panel" aria-label={copy.sample}><div className="voice-sample-top"><span className="voice-eyebrow">{copy.sample}</span><div className="voice-sample-tabs" role="group" aria-label={copy.sample}>{['results', 'next'].map(value => <button key={value} type="button" aria-pressed={sample === value} onClick={() => setSample(value)}>{copy[value]}</button>)}</div></div><p className="voice-sample-text">“{catalogue.samples[sample][language]}”</p><p className="voice-sample-note">{copy.demo}</p></section>
      <div className="voice-choice-notice" role="status">{notice ? copy[notice] : copy.local}</div>
      <section className="voice-card-grid" aria-label={copy.lab}>{catalogue.voices.map((voice, index) => {
        const key = [voice.id, language, sample].join(':');
        const active = playback.key === key, running = active && ['loading', 'playing'].includes(playback.status);
        const selected = currentVoice === voice.id;
        return <article className={`voice-card${selected ? ' is-selected' : ''}${active && playback.status === 'playing' ? ' is-playing' : ''}`} key={voice.id}>
          <div className="voice-card-top"><span className="voice-card-number">{String(index + 1).padStart(2, '0')}</span><span className="voice-card-badge">{selected ? <><Icon check/>{copy.selected}</> : voice.id === catalogue.defaultVoice ? copy.default : ''}</span></div>
          <div className="voice-card-name"><h2>{voice.name}</h2><div className="voice-wave" aria-hidden="true">{[8, 17, 25, 13, 21, 10, 18].map((height, n) => <i key={n} style={{ height, '--beat': `${n * .07}s` }}/>)}</div></div>
          <div className="voice-card-actions"><button className="voice-preview-button" type="button" aria-label={`${running ? copy.stop : copy.play} ${voice.name}`} disabled={playback.status === 'loading' && !active} onClick={() => running ? player.current?.stop() : player.current?.play({ voice: voice.id, language, sample })}><Icon stop={running}/><span>{active && playback.status === 'loading' ? copy.loading : active && playback.status === 'blocked' ? copy.blocked : running ? copy.stop : copy.play}</span></button><button className="voice-select-button" type="button" disabled={selected && Boolean(choice)} aria-label={`${copy.use}: ${voice.name}`} onClick={() => select(voice.id)}>{selected && choice ? <Icon check/> : <span aria-hidden="true">＋</span>}<span>{selected && choice ? copy.selected : copy.use}</span></button></div>
          {active && playback.status === 'error' ? <p className="voice-card-error" role="alert">{copy.playError}</p> : null}
        </article>;
      })}</section>
      <footer className="voice-lab-footer"><span>{copy.disclosure}</span><a href="/">{copy.back} ↗</a></footer>
    </>}
  </main>;
}
