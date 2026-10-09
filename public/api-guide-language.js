// Public documentation uses the dashboard's cached language preference.
// An explicit ?lang choice or the English filename wins over remembered values.
(() => {
  const valid = (language) => ['en', 'es'].includes(language);
  const current = document.documentElement.lang === 'en' ? 'en' : 'es';
  const location = new URL(window.location.href);
  const explicit = location.searchParams.get('lang');
  const englishPage = /\/api-guide\.en\.html$/.test(location.pathname);
  let remembered;
  try {
    remembered = [localStorage.getItem('sentient.lang'), localStorage.getItem('sentient.language')].find(valid);
  } catch { /* Documentation remains usable when storage is unavailable. */ }
  const language = valid(explicit) ? explicit : englishPage ? 'en' : remembered || (navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en');
  const remember = (value, selected = false) => {
    try {
      localStorage.setItem('sentient.lang', value);
      localStorage.setItem('sentient.language', value);
      if (selected) localStorage.setItem('sentient.language.pending', value);
    } catch { /* URL choices still work without storage. */ }
  };
  remember(language, valid(explicit));
  if (language !== current) {
    const target = new URL(language === 'en' ? 'api-guide.en.html' : 'api-guide.html', location);
    target.searchParams.set('lang', language);
    target.hash = location.hash;
    window.location.replace(target.href);
    return;
  }
  document.addEventListener('DOMContentLoaded', () => {
    for (const link of document.querySelectorAll('[data-guide-language]')) {
      const target = new URL(link.href);
      target.hash = location.hash;
      link.href = target.href;
      link.addEventListener('click', () => {
        const choice = new URL(link.href);
        choice.hash = window.location.hash;
        link.href = choice.href;
        remember(link.dataset.guideLanguage, true);
      });
    }
    // Keep anchored sections below the header when its actions wrap on mobile.
    const header = document.querySelector('.top');
    const updateOffset = () => document.documentElement.style.setProperty('--guide-header-offset', `${header.getBoundingClientRect().height + 24}px`);
    if (header) {
      updateOffset();
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(updateOffset).observe(header);
    }
  });
})();
