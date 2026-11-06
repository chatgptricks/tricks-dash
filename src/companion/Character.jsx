import { useEffect, useRef, useState } from 'react';

export function Character({ reaction, unread, paused = false }) {
  const root = useRef(null), instance = useRef(null);
  const [fallback, setFallback] = useState(false), [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import('./character/pet').then(({ SentientPet }) => {
      if (cancelled || !root.current) return;
      try {
        const element = root.current;
        instance.current = new SentientPet(element.querySelector('canvas'), element, element.querySelector('.face-anchor'), { background: 'transparent', intensity: 80, elasticity: 60, speed: 85, messageCount: 0 });
        instance.current.setPaused(true);
        setLoaded(true);
      } catch { setFallback(true); }
    }).catch(() => { if (!cancelled) setFallback(true); });
    const move = event => {
      if (event.origin !== location.origin || event.source !== parent || event.data?.source !== 'sentient-host' || event.data.type !== 'pointer' || !instance.current || instance.current.paused) return;
      instance.current.pointer.x = Math.max(-1, Math.min(1, Number(event.data.x) || 0));
      instance.current.pointer.y = Math.max(-1, Math.min(1, Number(event.data.y) || 0));
    };
    window.addEventListener('message', move);
    return () => { cancelled = true; instance.current?.dispose(); instance.current = null; window.removeEventListener('message', move); };
  }, []);
  useEffect(() => {
    const pet = instance.current;
    if (!pet) return;
    pet.setPaused(paused || matchMedia('(prefers-reduced-motion: reduce)').matches);
    pet.setConfig({ accentMode: unread ? 'message' : 'auto', messageCount: unread });
    pet.setReaction(reaction);
    if (pet.paused) {
      pet.pointer.x = 0; pet.pointer.y = 0;
      for (let n = 0; n < 60; n++) { pet.eyes.update(1 / 60, pet.time, pet.reaction, pet.config, pet.pointer, 0); pet.updateBody(1 / 60); }
      pet.render();
    }
  }, [reaction, unread, paused, loaded]);
  return <div className="pet-character" ref={root} aria-hidden="true">
    {fallback ? <svg viewBox="0 0 120 140" className="pet-fallback"><g fill="#f4f4f4" stroke="#b7b7b7" strokeWidth="1"><rect x="21" y="28" width="92" height="42" rx="21" transform="rotate(-30 67 49)"/><rect x="7" y="74" width="92" height="42" rx="21" transform="rotate(-30 53 95)"/></g><g fill="#050709"><rect x="36" y="54" width="18" height="33" rx="9"/><rect x="63" y="54" width="18" height="33" rx="9"/></g><g fill="#fff"><ellipse cx="42" cy="62" rx="3" ry="4"/><ellipse cx="69" cy="62" rx="3" ry="4"/></g></svg> : null}
    <canvas id="pet-canvas" />
    <div className="face-anchor"><svg id="pet-face" className="pet-face" viewBox="-120 -90 240 180" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="eye-clip-l"><path id="eye-mask-l"/></clipPath><clipPath id="eye-clip-r"><path id="eye-mask-r"/></clipPath></defs><g id="eyes-scale">{['l', 'r'].map(side => <g key={side} id={`eye-${side}`}><path id={`eye-shape-${side}`} fill="#050709"/><path id={`eye-closed-${side}`} fill="none" stroke="#050709" strokeLinecap="round" strokeLinejoin="round"/><g clipPath={`url(#eye-clip-${side})`}><ellipse id={`shine-${side}`} fill="#fff"/></g></g>)}</g></svg></div>
    <svg id="pet-accents" className="pet-accents" xmlns="http://www.w3.org/2000/svg" />
    <span id="stage-loading" hidden />
  </div>;
}
