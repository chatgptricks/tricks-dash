// Language + theme context -- a thin React wrapper around prefs.js's plain
// read/apply functions. Shared by the main dashboard and the Queue board so
// any component either app renders (including the ones in postDetail.jsx)
// can call usePrefs() without caring which entry point it's mounted in.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { LANGS, THEMES, applyAccent, applyLang, applyTheme, makeT, normalizeAccent, readAccent, readLang, readTheme } from './prefs';
import { onServerPreferences, savePreference, syncUserPreferences } from './userPreferences';

const PrefsContext = createContext({ lang: 'en', theme: 'dark', accent: 'lime', t: (x) => x, setLang: () => {}, setTheme: () => {}, setAccent: () => {} });
export const usePrefs = () => useContext(PrefsContext);

// lang/theme can be passed in as controlled props -- used by the Queue
// board's deep-dive sidebar, which already owns its own lang/theme state
// (its header toggle predates this shared context) and just needs the
// shared post-detail components to read the SAME live values rather than a
// second, independent copy that would silently go stale the moment the
// Queue's own toggle changes it.
export function PrefsProvider({ children, lang: controlledLang, theme: controlledTheme }) {
  const [lang, setLangState] = useState(() => controlledLang ?? readLang());
  const [theme, setThemeState] = useState(() => controlledTheme ?? readTheme());
  const [accent, setAccentState] = useState(() => readAccent());
  const isLangControlled = controlledLang !== undefined;
  const isThemeControlled = controlledTheme !== undefined;
  const effectiveLang = isLangControlled ? controlledLang : lang;
  const effectiveTheme = isThemeControlled ? controlledTheme : theme;

  useEffect(() => { if (!isLangControlled) applyLang(effectiveLang); }, [effectiveLang, isLangControlled]);
  useEffect(() => { if (!isThemeControlled) applyTheme(effectiveTheme); }, [effectiveTheme, isThemeControlled]);
  useEffect(() => { applyAccent(accent); }, [accent]);
  useEffect(() => {
    const changed = event => {
      if (!isLangControlled && ['sentient.lang', 'sentient.language'].includes(event.key)) setLangState(readLang());
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [isLangControlled]);
  // The server owns these per user; its values replace the first-paint copy.
  useEffect(() => {
    syncUserPreferences();
    return onServerPreferences((preferences) => {
      if (LANGS.includes(preferences.language)) setLangState(preferences.language);
      if (THEMES.includes(preferences.theme)) setThemeState(preferences.theme);
      if (preferences.accent) setAccentState(normalizeAccent(preferences.accent));
    });
  }, []);

  const setAccent = (value) => {
    const normalized = applyAccent(value);
    savePreference('accent', normalized);
    setAccentState(normalized);
  };
  const setLang = (value) => { savePreference('language', value); setLangState(value); };
  const setTheme = (value) => { savePreference('theme', value); setThemeState(value); };

  const value = useMemo(() => ({
    lang: effectiveLang,
    theme: effectiveTheme,
    accent,
    t: makeT(effectiveLang),
    setLang: isLangControlled ? () => {} : setLang,
    setTheme: isThemeControlled ? () => {} : setTheme,
    setAccent,
  }), [effectiveLang, effectiveTheme, accent, isLangControlled, isThemeControlled]);

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}
