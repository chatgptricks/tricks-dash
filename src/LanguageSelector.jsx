import './LanguageSelector.css';

export function LanguageSelector({ lang, setLang, t }) {
  return <div className="sentient-language-selector" role="group" aria-label={t ? t('Language') : lang === 'es' ? 'Idioma' : 'Language'}>
    <button className="sentient-language-option" type="button" lang="en" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
    <button className="sentient-language-option" type="button" lang="es" aria-pressed={lang === 'es'} onClick={() => setLang('es')}>ES</button>
  </div>;
}
