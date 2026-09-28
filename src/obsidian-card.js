// Pointer tilt and foil for gallery cards. Plain handlers shared by every card:
// no per-card hooks or animation state, and nothing runs until a pointer moves.
// The inline transform is eased by the `.obs-card` CSS transition.
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function reset(card) {
  card.style.removeProperty('transform');
  card.style.removeProperty('--foil-x');
  card.style.removeProperty('--foil-y');
}

export const obsidianCardHandlers = {
  onPointerMove(event) {
    const card = event.currentTarget;
    if (event.target.closest('.post-header')) { reset(card); return; }
    if (event.target.closest('button,a,.post-menu') || card.querySelector('.post-menu-panel')) return;
    const effects = document.documentElement.dataset.effects;
    if (reduceMotion() || event.pointerType === 'touch' || effects === 'off' || (card.draggable && event.buttons)) { reset(card); return; }
    const rect = card.getBoundingClientRect();
    const u = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const v = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    const angle = effects === 'subtle' ? 4 : 9;
    card.style.transform = `perspective(1000px) rotateX(${((0.5 - v) * angle).toFixed(2)}deg) rotateY(${((u - 0.5) * angle).toFixed(2)}deg)`;
    card.style.setProperty('--foil-x', `${(u * 100).toFixed(1)}%`);
    card.style.setProperty('--foil-y', `${(v * 100).toFixed(1)}%`);
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
