import { useEffect, useRef } from 'react';
import { Character } from './Character';
import './launch.css';

const COPY = {
  en: {
    badge: 'New in your dashboard', lead: 'Meet', name: 'Sentient Bot.',
    description: 'Ask about your posts and accounts, find what matters, and apply filters directly in your dashboard.',
    features: ['Find posts', 'Get answers', 'Apply filters'],
    start: 'Try Sentient Bot', later: 'Not now', close: 'Close introduction',
    hint: 'Click the character whenever you need a hand.',
    greeting: 'Your dashboard. Let’s talk.', question: 'Which reel performed best?',
    image: 'Sentient Bot, your animated dashboard companion',
  },
  es: {
    badge: 'Nuevo en tu dashboard', lead: 'Conocé a', name: 'Sentient Bot.',
    description: 'Preguntá por tus posts y cuentas, encontrá lo que buscás y aplicá filtros directamente en tu dashboard.',
    features: ['Encontrá posts', 'Hacé preguntas', 'Aplicá filtros'],
    start: 'Probar Sentient Bot', later: 'Ahora no', close: 'Cerrar presentación',
    hint: 'Cuando me necesités, hacé clic en el personaje.',
    greeting: 'Tu dashboard. Conversemos.', question: '¿Cuál fue el mejor reel?',
    image: 'Sentient Bot, tu compañero animado del dashboard',
  },
};

function LaunchIcon({ kind }) {
  const paths = {
    search: 'm16 16 4 4 M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z',
    chat: 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z',
    filter: 'M4 7h16 M4 17h16 M9 4v6 M15 14v6',
    arrow: 'M4 12h16 m-6-6 6 6-6 6',
    close: 'm6 6 12 12 M18 6 6 18',
    sparkle: 'm12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6Z',
  };
  return <svg className="sentient-launch-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[kind]}/></svg>;
}

export function LaunchSplash({ locale = 'en', onStart, onDismiss, Avatar = Character }) {
  const copy = COPY[locale === 'es' ? 'es' : 'en'];
  const dialog = useRef(null), primary = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    primary.current?.focus();
    return () => { if (previous?.isConnected && previous !== document.body) previous.focus?.(); };
  }, []);

  function keyboard(event) {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); onDismiss(); return;
    }
    if (event.key !== 'Tab') return;
    const controls = [...dialog.current.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]')];
    const first = controls[0], last = controls.at(-1), active = document.activeElement;
    if (!dialog.current.contains(active) || (event.shiftKey && active === first)) {
      event.preventDefault(); (event.shiftKey ? last : first)?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault(); first?.focus();
    }
  }

  return <div className="sentient-launch-overlay" onClick={event => { if (event.target === event.currentTarget) onDismiss(); }} onKeyDown={keyboard}>
    <section ref={dialog} className="sentient-launch-dialog" role="dialog" aria-modal="true" aria-labelledby="sentient-launch-title" aria-describedby="sentient-launch-description">
      <button className="sentient-launch-close" type="button" aria-label={copy.close} onClick={onDismiss}><LaunchIcon kind="close"/></button>
      <div className="sentient-launch-copy">
        <div className="sentient-launch-badge"><LaunchIcon kind="sparkle"/><span>{copy.badge}</span></div>
        <h1 id="sentient-launch-title"><span>{copy.lead}</span> {copy.name}</h1>
        <p id="sentient-launch-description" className="sentient-launch-description">{copy.description}</p>
        <ul className="sentient-launch-features">{copy.features.map((label, index) => <li key={label}><LaunchIcon kind={['search', 'chat', 'filter'][index]}/><span>{label}</span></li>)}</ul>
        <div className="sentient-launch-actions">
          <button ref={primary} className="sentient-launch-start" type="button" onClick={onStart}>{copy.start}<LaunchIcon kind="arrow"/></button>
          <button className="sentient-launch-later" type="button" onClick={onDismiss}>{copy.later}</button>
        </div>
        <p className="sentient-launch-hint">{copy.hint}</p>
      </div>
      <figure className="sentient-launch-art" role="img" aria-label={copy.image}>
        <div className="sentient-launch-orbit orbit-outer" aria-hidden="true"/>
        <div className="sentient-launch-orbit orbit-inner" aria-hidden="true"/>
        <div className="sentient-launch-hello" aria-hidden="true"><span/>{copy.greeting}</div>
        <div className="sentient-launch-character"><Avatar reaction="greeting" unread={0} paused={false}/></div>
        <div className="sentient-launch-question" aria-hidden="true"><LaunchIcon kind="chat"/><span>{copy.question}</span><span className="sentient-launch-question-arrow">↗</span></div>
        <div className="sentient-launch-art-caption" aria-hidden="true">SENTIENT BOT <span>✦</span></div>
      </figure>
    </section>
  </div>;
}
