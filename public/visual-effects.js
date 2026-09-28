// Presentation only: existing authentication, themes and API calls stay page-owned.
(() => {
  let effects = 'immersive';
  try {
    const saved = localStorage.getItem('sentient.effects');
    if (['immersive', 'subtle', 'off'].includes(saved)) effects = saved;
  } catch { /* Storage may be unavailable in private contexts. */ }
  document.documentElement.dataset.effects = effects;
})();
// The effects level is a per-user preference stored on the server.
window.addEventListener('sentient-preferences', (event) => {
  const effects = event.detail?.effects;
  if (['immersive', 'subtle', 'off'].includes(effects)) document.documentElement.dataset.effects = effects;
});
