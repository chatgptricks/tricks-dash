import { Component, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { version } from '../package.json';
import { readLang } from './prefs';
import './mountApp.css';

const COPY = {
  en: {
    title: 'This page couldn’t load',
    explanation: 'Something interrupted Sentient Dash. Reload this page to try again.',
    unsaved: 'Unsaved changes may need to be entered again.',
    reload: 'Reload page',
    home: 'Open home',
  },
  es: {
    title: 'No se pudo cargar esta página',
    explanation: 'Algo interrumpió Sentient Dash. Recarga esta página para volver a intentarlo.',
    unsaved: 'Es posible que debas volver a ingresar los cambios sin guardar.',
    reload: 'Recargar página',
    home: 'Ir al inicio',
  },
};

function recoveryLanguage(lang) {
  if (lang === 'en' || lang === 'es') return lang;
  try { return readLang() === 'es' ? 'es' : 'en'; } catch { return 'en'; }
}

function PageRecovery({ lang }) {
  const heading = useRef(null);
  const language = recoveryLanguage(lang);
  const copy = COPY[language];
  const homePath = /^\/mobile(?:\/|$)/.test(window.location.pathname) ? '/mobile/' : '/';
  // Modal effects can leave the app root inert until their passive cleanup.
  // Focus only after those cleanups, when the recovery is interactive again.
  useEffect(() => { heading.current?.focus(); }, []);
  return <main className="app-recovery" lang={language} aria-labelledby="app-recovery-title">
    <section className="app-recovery-card">
      <p className="app-recovery-brand">Sentient Dash</p>
      <h1 id="app-recovery-title" ref={heading} tabIndex={-1}>{copy.title}</h1>
      <p className="app-recovery-explanation">{copy.explanation}</p>
      <p className="app-recovery-unsaved">{copy.unsaved}</p>
      <div className="app-recovery-actions">
        <button type="button" onClick={() => window.location.reload()}>{copy.reload}</button>
        <a href={homePath}>{copy.home}</a>
      </div>
      <p className="app-recovery-version">Sentient Dash · v{version}</p>
    </section>
  </main>;
}

class PageErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <PageRecovery lang={this.props.lang} /> : this.props.children;
  }
}

// Keep this boundary outside each entry's providers so their render/effect
// failures also recover. React unmounts the failed tree and its portal effects.
export function mountApp(children, { lang } = {}) {
  const root = createRoot(document.getElementById('root'), {
    // Do not expose errors containing API responses, captions, or credentials.
    onCaughtError: () => console.error(`Sentient Dash v${version}: page rendering failed.`),
  });
  root.render(<PageErrorBoundary lang={lang}>{children}</PageErrorBoundary>);
  return root;
}
