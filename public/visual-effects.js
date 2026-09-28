// Presentation only: existing authentication, themes and API calls stay page-owned.
(() => {
  let effects = 'immersive';
  try {
    const saved = localStorage.getItem('sentient.effects');
    if (['immersive', 'subtle', 'off'].includes(saved)) effects = saved;
  } catch { /* Storage may be unavailable in private contexts. */ }
  document.documentElement.dataset.effects = effects;
})();
