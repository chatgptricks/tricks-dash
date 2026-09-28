import { useMotionValue, useSpring, useTransform, useReducedMotion } from 'motion/react';

// Motion values update outside React renders: only the active card does work.
export function useObsidianCard() {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0), y = useMotionValue(0);
  const rotateX = useSpring(y, { stiffness: 180, damping: 22 });
  const rotateY = useSpring(x, { stiffness: 180, damping: 22 });
  const mx = useMotionValue(50), my = useMotionValue(50);
  const px = useTransform(mx, value => `${value}%`);
  const py = useTransform(my, value => `${value}%`);
  const reset = () => { x.set(0); y.set(0); mx.set(50); my.set(50); };
  return {
    style: { rotateX, rotateY, transformPerspective: 1000, '--foil-x': px, '--foil-y': py },
    onPointerMove(event) {
      if (event.target.closest('.post-header')) { reset(); return; }
      if (event.target.closest('button,a,.post-menu') || event.currentTarget.querySelector('.post-menu-panel')) return;
      if (reduceMotion || event.pointerType === 'touch' || document.documentElement.dataset.effects === 'off' || event.currentTarget.draggable && event.buttons) { reset(); return; }
      const rect = event.currentTarget.getBoundingClientRect();
      const u = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const v = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      const subtle = document.documentElement.dataset.effects === 'subtle';
      const angle = subtle ? 4 : 9;
      x.set((u - .5) * angle); y.set((.5 - v) * angle);
      mx.set(u * 100); my.set(v * 100);
    },
    onPointerLeave: reset,
  };
}

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
