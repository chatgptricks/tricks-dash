import './topicStack.css';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Clock3, X } from 'lucide-react';
import { StackCard, postIdentity } from './StackActions';
import { rankTopicPosts } from './topicGroups';

function postTime(post) { return Number(post?.timestamp) || Date.parse(post?.publishedAt || post?.postDate) || 0; }
function elapsed(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return { label: `+${minutes}m`, exact: `${minutes} minutes` };
  const hours = ms / 3600000;
  if (hours < 24) return { label: `+${hours.toFixed(1).replace(/\.0$/, '')}h`, exact: `${Math.floor(hours)} hours and ${minutes % 60} minutes` };
  const days = ms / 86400000;
  return { label: `+${days.toFixed(1).replace(/\.0$/, '')}d`, exact: `${Math.floor(days)} days and ${Math.floor((minutes % 1440) / 60)} hours` };
}
export default function TopicStack({ posts, visiblePosts = posts, renderCard, total = posts.length }) {
  const [expanded, setExpanded] = useState(false);
  const ranked = rankTopicPosts(posts, 'likes');
  const filtered = visiblePosts.length < posts.length;
  const coverPool = filtered ? visiblePosts : posts;
  const newest = [...coverPool].sort((a, b) => (postTime(b) - postTime(a)) || postIdentity(a).localeCompare(postIdentity(b)))[0];
  const oldestTime = Math.min(...posts.map(postTime));
  const cardWithTiming = (post, child) => { const isOldest = postTime(post) === oldestTime; const info = isOldest ? null : elapsed(postTime(post) - oldestTime); return <div className="stack-card-timing">{child}{isOldest ? <span className="stack-time-mark" title="Oldest post"><Clock3 size={13} /></span> : <span className="stack-time-mark" title={info.exact}><Clock3 size={13} /><b>{info.label}</b></span>}</div>; };
  const dialog = useRef(null);
  const cardsRef = useRef(null);
  const stackRef = useRef(null);
  const dealRef = useRef([]);
  const closingRef = useRef(false);
  const closeStack = (selectedCard = null) => {
    if (!(selectedCard instanceof HTMLElement)) selectedCard=null;
    if (closingRef.current) return;
    closingRef.current=true;
    const selectedIndex=selectedCard ? [...(cardsRef.current?.children || [])].indexOf(selectedCard) : -1;
    if (selectedCard) { selectedCard.style.visibility='hidden'; dialog.current?.setAttribute('data-handoff','true'); }
    const cards=[...(cardsRef.current?.children || [])];
    if (!cards.length || (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || typeof Element.prototype.animate !== 'function') || document.documentElement.dataset.effects === 'off') { setExpanded(false); closingRef.current=false; return; }
    dialog.current?.setAttribute('data-closing','true');
    [...(cardsRef.current?.children || [])].forEach(card => { card.inert = true; });
    const coverIndex=ranked.findIndex(post=>postIdentity(post)===postIdentity(newest));
    const order=cards.map((card,index)=>({card,animation:dealRef.current[index],index}))
      .filter(({index})=>index!==selectedIndex)
      .sort((a,b)=>(a.index===coverIndex ? 1 : 0)-(b.index===coverIndex ? 1 : 0) || b.index-a.index);
    const duration=900+Math.max(0,order.length-1)*85;
    dialog.current?.style.setProperty('--deck-exit-duration',`${duration}ms`);
    const exits=order.map(({animation,index},position)=>{
      const card=cardsRef.current.children[index];
      const current=getComputedStyle(card).transform;
      animation?.cancel();
      const target=card.getBoundingClientRect();
      const homeCard=stackRef.current?.querySelector(':scope > .stack-card-shell .post-card,:scope > .post-card,:scope > .m-post-card');
      const home=homeCard?.getBoundingClientRect() || stackRef.current.getBoundingClientRect();
      const dx=home.left+home.width/2-target.left-target.width/2;
      const dy=home.top+home.height/2-target.top-target.height/2;
      card.style.zIndex=String(index===coverIndex ? 2000 : 1000-position);
      const exit=card.animate([
        {transform:current,opacity:1},
        // Retrace the dealing arc: slide beside the deck, then tuck into it.
        {transform:`translate(${dx+70}px,${dy-28}px) rotate(-7deg) scale(${home.width/target.width},${home.height/target.height})`,opacity:1,offset:.68},
        {transform:`translate(${dx}px,${dy}px) rotate(0deg) scale(${home.width/target.width},${home.height/target.height})`,opacity:1,offset:.9},
        {transform:`translate(${dx}px,${dy}px) rotate(0deg) scale(${home.width/target.width},${home.height/target.height})`,opacity:1}
      ],{duration:900,delay:position*85,easing:'cubic-bezier(.4,0,.2,1)',fill:'both'});
      // Keep returned cards opaque until React swaps the overlay for the gallery.
      // Hiding/fading each finished card creates a gap before the deck is restored.
      return exit;
    });
    dealRef.current=exits;
    const returned = Promise.allSettled(exits.map(animation=>animation.finished)).then(async () => {
      if (!selectedCard && dialog.current?.isConnected) {
        // Settle the last few physical cards before replacing the overlay.
        // Keep every layer opaque; the cover stays above the small fan.
        const settling = order.slice(-3).map(({card,index},position) => {
          const base = getComputedStyle(card).transform;
          const shifted = new DOMMatrix(base);
          const isCover = index === coverIndex;
          shifted.e += isCover ? 44 : -18 + position * 10;
          shifted.f -= isCover ? 12 : 5 + position * 3;
          shifted.rotateSelf(0, 0, isCover ? 4 : -3 + position);
          return card.animate([
            {transform:base,opacity:1},
            {transform:shifted.toString(),opacity:1,offset:.42},
            {transform:base,opacity:1}
          ], {duration:520,delay:isCover ? 45 : 0,easing:'cubic-bezier(.22,.61,.36,1)',fill:'both'});
        });
        dealRef.current = [...exits,...settling];
        await Promise.allSettled(settling.map(animation => animation.finished));
      }
      setExpanded(false); closingRef.current=false;
      return new Promise(resolve => requestAnimationFrame(resolve));
    });
    if (dialog.current) dialog.current.obsStackReturn = returned;
  };
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const modal=dialog.current;
    if (modal) modal.obsStackHome=stackRef.current;
    const handoff=event=>closeStack(event.detail.card);
    modal?.addEventListener('obs-stack-select',handoff);
    let animations = [];
    closingRef.current=false;
    const frame = requestAnimationFrame(() => {
      if ((window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || typeof Element.prototype.animate !== 'function') || document.documentElement.dataset.effects === 'off') return;
      const origin = stackRef.current?.getBoundingClientRect();
      if (!origin) return;
      animations = [...(cardsRef.current?.children || [])].map((card,index) => {
        const target = card.getBoundingClientRect();
        const depth = Math.min(index,4)*3;
        const dx = origin.left + origin.width/2 - target.left - target.width/2;
        const dy = origin.top + origin.height/2 - target.top - target.height/2 - depth;
        card.style.zIndex=String(1000-index);
        card.inert = true;
        const deal = card.animate([
          { transform:`translate(${dx}px,${dy}px) rotate(0deg) scale(${origin.width/target.width},${origin.height/target.height})` },
          { transform:`translate(${dx+70}px,${dy-28}px) rotate(-7deg) scale(${origin.width/target.width},${origin.height/target.height})`, offset:.22 },
          { transform:'translate(0,0) rotate(0deg) scale(1)' }
        ], { duration:780, delay:Math.min(index, 6)*100, easing:'cubic-bezier(.4,0,.2,1)', fill:'both' });
        deal.finished.then(() => { if (!closingRef.current) card.inert = false; }, () => {});
        return deal;
      });
      dealRef.current=animations;
    });
    const keydown = (event) => {
      if (document.querySelector('.obs-persistent-card,.obs-preview-side,.obs-inspector[aria-hidden="false"]')) return;
      if (event.key === 'Escape') closeStack();
      if (event.key === 'Tab') {
        const controls = [...(dialog.current?.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]') || [])];
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { modal?.removeEventListener('obs-stack-select',handoff); cancelAnimationFrame(frame); animations.forEach(animation=>animation.cancel()); dealRef.current.forEach(animation=>animation.cancel()); dealRef.current=[]; document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); if (!document.querySelector('.obs-preview-side,.obs-inspector.is-open')) previous?.focus?.({ preventScroll: true }); };
  }, [expanded]);
  if (!newest) return null;
  if (total === 1) return <StackCard posts={posts}>{renderCard(newest)}</StackCard>;
  return <section ref={stackRef} className={`post-stack${expanded ? ' obs-stack-open' : ''}`} aria-label={`${ranked.length} posts about the same topic`}>
    <span className="obs-deck-edge" aria-hidden="true" />
    {Array.from({length:Math.min(Math.max(total-1,0),4)},(_,index) => {
      const post = ranked.filter(post => postIdentity(post) !== postIdentity(newest))[index];
      return <div className="obs-deck-layer" style={{'--layer':index+1,'--layer-angle':`${index%2 ? 1 : -1}deg`,zIndex:-(index+1)}} key={index} aria-hidden="true" inert>{renderCard(post || newest, () => {})}</div>;
    })}
    {total > 5 ? <span className="obs-deck-overflow" aria-hidden="true">+{total-5} more</span> : null}
    <>
      {/* Keep relative clocks inside the expanded stack. The dashboard cover
          should stay clear for the image, menu, and primary post badges. */}
      <StackCard posts={posts}>{renderCard(newest, () => setExpanded(true))}</StackCard>
      <button type="button" className="post-stack-trigger" aria-expanded={expanded} onClick={() => setExpanded(true)} aria-label={`Open ${total} posts in this group`}>+{total}</button>
      {expanded ? createPortal(<div className="post-stack-modal" role="dialog" aria-modal="true" aria-label="Posts in this stack" tabIndex={-1} ref={dialog} onClick={closeStack}><div className="post-stack-modal-inner" style={{ '--deck-visible': Math.min(ranked.length, 3) }} onClick={(event) => event.stopPropagation()}><div className="post-stack-heading"><span><b>{total} versions</b><small>{posts.length < total ? `${posts.length} match the filters · ` : ''}Explore this collection</small></span><div className="obs-deck-controls"><button type="button" aria-label="Close stack" onClick={closeStack}><X size={16} /></button></div></div><div className="post-stack-grid" ref={cardsRef} tabIndex={0} aria-label="Stack versions">{ranked.map((post, index) => <div className={index === 0 ? 'stack-champion' : ''} key={postIdentity(post)} style={{ '--deck-delay': `${Math.min(index, 4) * 35}ms` }}>{index === 0 && <span className="stack-champion-label">👑 Champion · Most likes</span>}<StackCard posts={[post]}>{cardWithTiming(post, <div onClick={(event) => {
        // Native PostCard selections dispatch the animated handoff themselves.
        // Keep the shared component's selection contract for other card renderers.
        if (!event.target.closest('.post-card,.m-post-card')) closeStack(event.currentTarget.closest('.post-stack-grid > div'));
      }}>{renderCard(post)}</div>)}</StackCard></div>)}</div></div></div>, document.body) : null}
    </>
  </section>;
}
