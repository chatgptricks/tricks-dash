// Pointer tilt and foil for gallery cards. Plain handlers shared by every card:
// no per-card hooks or animation state, and nothing runs until a pointer moves.
// The inline transform is eased by the `.obs-card` CSS transition.
import { updateHotFoilLight } from './hot-foil';
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let activeCard = null;
let pendingFrame = 0;
let pendingMove = null;
let watchingPreferences = false;

function reset(card) {
  if (!card) return;
  if (pendingMove?.card === card) { cancelAnimationFrame(pendingFrame); pendingFrame = 0; pendingMove = null; }
  card.style.removeProperty('transform');
  card.style.removeProperty('--foil-x');
  card.style.removeProperty('--foil-y');
  delete card.dataset.foilActive;
  if (activeCard === card) activeCard = null;
}

function watchPreferences() {
  if (watchingPreferences) return;
  watchingPreferences = true;
  const stop = () => { if (reduceMotion() || document.documentElement.dataset.effects === 'off') reset(activeCard); };
  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', stop);
  new window.MutationObserver(stop).observe(document.documentElement, { attributes: true, attributeFilter: ['data-effects'] });
}

function paintTilt() {
  pendingFrame = 0;
  const move = pendingMove;
  pendingMove = null;
  if (!move) return;
  const { card, x, y } = move;
  const effects = document.documentElement.dataset.effects;
  if (!card.isConnected || reduceMotion() || effects === 'off') { reset(card); return; }
  const rect = card.getBoundingClientRect();
  if (!rect.width || !rect.height) { reset(card); return; }
  const u = Math.min(1, Math.max(0, (x - rect.left) / rect.width));
  const v = Math.min(1, Math.max(0, (y - rect.top) / rect.height));
  const angle = effects === 'subtle' ? 4 : 9;
  card.style.transform = `perspective(1000px) rotateX(${((0.5 - v) * angle).toFixed(2)}deg) rotateY(${((u - 0.5) * angle).toFixed(2)}deg)`;
  card.style.setProperty('--foil-x', `${(u * 100).toFixed(1)}%`);
  card.style.setProperty('--foil-y', `${(v * 100).toFixed(1)}%`);
  updateHotFoilLight(card, u, v);
}

export const obsidianCardHandlers = {
  onPointerMove(event) {
    const card = event.currentTarget;
    if (event.target.closest('.post-header,button,a,.post-menu') || card.querySelector('.post-menu-panel')) { reset(card); return; }
    const effects = document.documentElement.dataset.effects;
    if (reduceMotion() || event.pointerType === 'touch' || effects === 'off' || (card.draggable && event.buttons)) { reset(card); return; }
    watchPreferences();
    if (activeCard && activeCard !== card) reset(activeCard);
    activeCard = card;
    pendingMove = { card, x: event.clientX, y: event.clientY };
    if (!pendingFrame) pendingFrame = requestAnimationFrame(paintTilt);
  },
  onPointerLeave(event) { reset(event.currentTarget); },
};

// Same Rate thresholds as the existing HOT tiers; missing Rate uses copper.
export function hotMetalStyle(post) {
  if (!post.showsHotBadge) return {};
  const rate = Number(post.hotMultiplier ?? post.hotRateMultiplier);
  const stops = [[1,[139,76,47]],[2,[178,111,58]],[3,[207,155,66]],[5,[235,207,135]],[8,[232,233,224]]];
  const value = Number.isFinite(rate) ? Math.max(1, Math.min(8, rate)) : 1;
  const index = stops.findIndex(([threshold]) => threshold >= value);
  const right = stops[Math.max(0,index)], left = stops[Math.max(0,index-1)];
  const mix = right[0] === left[0] ? 0 : (value-left[0])/(right[0]-left[0]);
  const rgb = left[1].map((channel,i) => Math.round(channel+(right[1][i]-channel)*mix));
  return {'--metal-rgb':rgb.join(','),'--metal-light':rgb.map(channel=>Math.round(channel+(255-channel)*.65)).join(',')};
}
