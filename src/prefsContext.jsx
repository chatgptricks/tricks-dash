// Language + theme context -- a thin React wrapper around prefs.js's plain
// read/apply functions. Shared by the main dashboard and the Queue board so
// any component either app renders (including the ones in postDetail.jsx)
// can call usePrefs() without caring which entry point it's mounted in.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { applyLang, applyTheme, makeT, readLang, readTheme } from './prefs';

const PrefsContext = createContext({ lang: 'en', theme: 'dark', t: (x) => x, setLang: () => {}, setTheme: () => {} });
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
  const isLangControlled = controlledLang !== undefined;
  const isThemeControlled = controlledTheme !== undefined;
  const effectiveLang = isLangControlled ? controlledLang : lang;
  const effectiveTheme = isThemeControlled ? controlledTheme : theme;

  useEffect(() => { if (!isLangControlled) applyLang(effectiveLang); }, [effectiveLang, isLangControlled]);
  useEffect(() => { if (!isThemeControlled) applyTheme(effectiveTheme); }, [effectiveTheme, isThemeControlled]);

  const value = useMemo(() => ({
    lang: effectiveLang,
    theme: effectiveTheme,
    t: makeT(effectiveLang),
    setLang: isLangControlled ? () => {} : setLangState,
    setTheme: isThemeControlled ? () => {} : setThemeState,
  }), [effectiveLang, effectiveTheme, isLangControlled, isThemeControlled]);

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}
