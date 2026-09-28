let activeCleanup = null;
let activeReturn = null;
let returning = false;
let requestId = 0;
const enabled = () => document.documentElement.dataset.effects !== 'off' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function sendCardToSide(source, postKey, options = {}) {
  if (!source || typeof source.animate !== 'function' || source.closest('.obs-card-slot') && !options.allowSlot || source.closest('.post-stack') && !source.closest('.post-stack-modal')) return;
  const id = ++requestId;
  activeCleanup?.();
  const deckModal=source.closest('.post-stack-modal');
  const homeSource=options.homeSource || deckModal?.obsStackHome?.querySelector(':scope > .stack-card-shell .post-card,:scope > .post-card') || source;
  const rect = (options.origin || source).getBoundingClientRect();
  const sourceStyle=getComputedStyle(source);
  const width = parseFloat(sourceStyle.width) || source.offsetWidth;
  const height = parseFloat(sourceStyle.height) || source.offsetHeight;
  const footer=source.querySelector('.post-editorial-actions');
  let compactHeight=footer ? Math.min(height,footer.offsetTop) : height;
  let footerCut=height-compactHeight;
  // Keep the entire original visual, including its header, foil and footer.
  const front = source.cloneNode(true);
  let card = front;
  card.removeAttribute('id'); card.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  const originalNodes=[source,...source.querySelectorAll('*')];
  const snapshotNodes=[card,...card.querySelectorAll('*')];
  const geometry=['width','height','min-width','max-width','min-height','max-height','padding','margin','border-radius','font-size','line-height','font-family','font-weight','letter-spacing','box-sizing','aspect-ratio'];
  originalNodes.forEach((node,index)=>{const computed=getComputedStyle(node); geometry.forEach(property=>snapshotNodes[index].style.setProperty(property,computed.getPropertyValue(property)));});
  // Cloned covers do not retain React's onLoad handler.
  front.querySelectorAll('img.cover-image').forEach(image=>{
    const reveal=()=>{image.classList.add('is-loaded');image.parentElement?.querySelector('.cover-image-skeleton')?.remove();};
    if (image.complete && image.naturalWidth) reveal();
    else image.addEventListener('load',reveal,{once:true});
  });
  front.classList.add('obs-card-front');
  Object.assign(front.style, { position:'absolute', inset:'0', margin:'0', transform:'none', opacity:'1' });
  card = document.createElement('div');
  card.className = 'obs-card-turn';
  const computedSource = getComputedStyle(source);
  for (const property of ['--metal-rgb','--metal-light']) card.style.setProperty(property, computedSource.getPropertyValue(property));
  const back = document.createElement('div');
  back.className = 'obs-card-back';
  const pattern = document.createElement('div');
  pattern.className = 'obs-back-pattern';
  const avatar = source.querySelector('.post-avatar img');
  const account = source.dataset.contextAccount || source.querySelector('.post-user strong')?.textContent || 'Account';
  const avatarUrl = avatar && avatar.complete && avatar.naturalWidth ? avatar.currentSrc || avatar.src : null;
  for (let index=0; index<30; index++) {
    const tile = document.createElement('span');
    if (avatarUrl) {
      const image = document.createElement('img'); image.src=avatarUrl; image.alt='';
      tile.append(image);
    } else tile.textContent = account.slice(0,2).toUpperCase();
    pattern.append(tile);
  }
  const emblem = document.createElement('div'); emblem.className='obs-back-emblem';
  if (avatarUrl) { const image=document.createElement('img'); image.src=avatarUrl; image.alt=''; emblem.append(image); }
  else { const initials=document.createElement('span'); initials.textContent=account.slice(0,2).toUpperCase(); emblem.append(initials); }
  const label=document.createElement('strong'); label.textContent=source.dataset.contextAccount || !source.dataset.contextType ? `@${account}` : account; emblem.append(label);
  const bottomFrame=document.createElement('div');
  bottomFrame.className='obs-card-bottom-frame';
  bottomFrame.style.opacity='0';
  back.append(pattern,emblem); card.append(front,back,bottomFrame);
  card.classList.add('obs-persistent-card');
  card.setAttribute('aria-hidden', 'true'); card.inert = true;
  Object.assign(card.style, { position:'fixed', left:`${rect.left}px`, top:`${rect.top}px`, width:`${width}px`, height:`${height}px`, margin:'0', opacity:'1', transform:'none', zIndex:'45000', pointerEvents:'none', transition:'none', transformOrigin:'center center' });
  document.documentElement.style.setProperty('--obs-inspector-card-width', `${width}px`);
  document.documentElement.style.setProperty('--obs-inspector-card-height', `${height}px`);
  const deckSlot=deckModal ? source.closest('.post-stack-grid > div') : null;
  if (deckModal) deckModal.dispatchEvent(new CustomEvent('obs-stack-select',{detail:{card:deckSlot,flight:true}}));
  const start = performance.now();
  const seek = () => {
    if (id !== requestId) return;
    const slot = document.querySelector(`[data-obs-sideview="${CSS.escape(postKey)}"]`);
    const inspector = slot?.closest('.obs-inspector,.obs-preview-side');
    if (!slot || inspector?.getAttribute('aria-hidden') === 'true') { if (performance.now()-start < 1000) requestAnimationFrame(seek); return; }
    delete inspector.dataset.obsClosing;
    document.querySelector('.sidebar-backdrop,.obs-modal-backdrop')?.classList.remove('obs-backdrop-closing');
    inspector.dataset.obsPhase = 'travel';
    slot.dataset.obsPersistent = 'true';
    slot.style.width = `${width}px`; slot.style.height = `${height}px`;
    const to = slot.getBoundingClientRect();
    const destinationScale = Math.min(1, to.width / width);
    source.classList.add('obs-in-transit');
    // Hide the deck slot in the same frame the clone appears, never before.
    if (deckSlot) deckSlot.style.visibility='hidden';
    if (options.homeSource) homeSource.classList.add('obs-in-transit');
    document.body.append(card);
    const media=front.querySelector('.post-media');
    if (media) {
      const frontRect=front.getBoundingClientRect();
      const mediaRect=media.getBoundingClientRect();
      const bottomBorder=parseFloat(getComputedStyle(front).borderBottomWidth)||0;
      const imageEnd=mediaRect.bottom-frontRect.top+bottomBorder;
      compactHeight=imageEnd+14;
      footerCut=Math.max(0,frontRect.height-imageEnd);
    }
    let disposed = false;
    let resizeObserver;
    // The landed clone is a static snapshot. The inspector renders a live
    // "..." menu over the clone's own button (see InspectorCardSlot), so the
    // snapshot hides its copy while landed and shows it again for the return.
    const snapshotMenu = front.querySelector('.post-header .post-menu');
    const releaseMenu = () => {
      delete slot.dataset.obsMenuReady;
      if (snapshotMenu) snapshotMenu.style.visibility = '';
    };
    const cleanup = () => {
      if (disposed) return;
      disposed=true;
      resizeObserver?.disconnect();
      releaseMenu();
      const exiting=returning;
      card.getAnimations({subtree:true}).forEach(animation=>animation.cancel());
      card.remove(); source.classList.remove('obs-in-transit'); homeSource.classList.remove('obs-in-transit');
      // Keep the fallback and details hidden until React removes the modal.
      if (!exiting) { delete slot.dataset.obsPersistent; inspector.dataset.obsPhase='ready'; }
      if(activeCleanup===cleanup){activeCleanup=null;activeReturn=null;returning=false;}
    };
    activeCleanup = cleanup;
    const land = () => {
      if (disposed || id !== requestId || !slot.isConnected) { cleanup(); return; }
      // The SAME visual node remains after landing; no preview replacement.
      slot.append(card);
      Object.assign(card.style, { position:'absolute', left:'0', top:'0', zIndex:'auto', transformOrigin:'top left', height:`${compactHeight}px` });
      front.style.clipPath=`inset(0 0 ${footerCut}px 0 round 18px 18px 0px 0px)`;
      bottomFrame.style.opacity='1';
      const fit = () => {
        if (disposed || returning) return;
        const scale = Math.min(1, slot.getBoundingClientRect().width / width);
        card.style.transform = `scale(${scale})`;
        slot.style.height = `${compactHeight * scale}px`;
        if (snapshotMenu) {
          const menu = snapshotMenu.getBoundingClientRect(), frame = slot.getBoundingClientRect();
          slot.style.setProperty('--obs-menu-left', `${menu.left - frame.left}px`);
          slot.style.setProperty('--obs-menu-top', `${menu.top - frame.top}px`);
          slot.style.setProperty('--obs-menu-scale', String(scale));
          snapshotMenu.style.visibility = 'hidden';
          slot.dataset.obsMenuReady = 'true';
        }
      };
      fit();
      resizeObserver = new ResizeObserver(fit);
      resizeObserver.observe(slot);
      inspector.dataset.obsPhase = 'ready';
    };
    if (!enabled()) { land(); return; }
    const dx = to.left-rect.left + (to.width-width)/2, dy = to.top-rect.top + compactHeight*(destinationScale-1)/2;
    const subtle = document.documentElement.dataset.effects === 'subtle';
    // One continuous horizontal revolution per opening.
    const frames = [
      { transform:options.origin ? `perspective(1400px) translate3d(${(rect.width-width)/2}px,${(rect.height-height)/2}px,0) rotateY(0deg) scale(${rect.width/width},${rect.height/height})` : 'perspective(1400px) translate3d(0,0,0) rotateY(0deg)' },
      { transform:`perspective(1400px) translate3d(${dx}px,${dy}px,0) rotateY(360deg) scale(${destinationScale})` }
    ];
    const timing = { duration:subtle ? 900 : 1000, easing:'cubic-bezier(.4,0,.2,1)', iterations:1, fill:'both' };
    const animation = card.animate(frames, timing);
    // Morph the silhouette only during the hidden half of the revolution.
    const shape=card.animate([
      {height:`${height}px`,offset:0},{height:`${height}px`,offset:.25},
      {height:`${compactHeight}px`,offset:.75},{height:`${compactHeight}px`,offset:1}
    ],timing);
    const trim=front.animate([
      {clipPath:'inset(0 0 0px 0 round 18px)',offset:0},{clipPath:'inset(0 0 0px 0 round 18px)',offset:.25},
      {clipPath:`inset(0 0 ${footerCut}px 0 round 18px 18px 0px 0px)`,offset:.75},{clipPath:`inset(0 0 ${footerCut}px 0 round 18px 18px 0px 0px)`,offset:1}
    ],timing);
    animation.finished.then(() => { if (!disposed && !returning) { animation.cancel(); land(); } }, () => {});
    const frameReveal=bottomFrame.animate([{opacity:0,offset:0},{opacity:0,offset:.25},{opacity:1,offset:.75},{opacity:1,offset:1}],timing);
    activeReturn = (close) => {
      if (returning) return;
      returning = true;
      resizeObserver?.disconnect();
      releaseMenu();
      inspector.dataset.obsClosing='true';
      inspector.dataset.obsPhase='travel';
      document.querySelector('.sidebar-backdrop,.obs-modal-backdrop')?.classList.add('obs-backdrop-closing');
      if (homeSource !== source && homeSource.isConnected) homeSource.classList.add('obs-in-transit');
      let reverse;
      if (card.parentElement === slot) {
        document.body.append(card);
        const home=homeSource.isConnected ? homeSource.getBoundingClientRect() : rect;
        const current=slot.getBoundingClientRect();
        Object.assign(card.style,{position:'fixed',left:`${home.left}px`,top:`${home.top}px`,zIndex:'45000',transformOrigin:'center center'});
        const returnFrames=[
          {transform:`perspective(1400px) translate3d(${(home.width-width)/2}px,${(home.height-height)/2}px,0) rotateY(0deg) scale(${home.width/width},${home.height/height})`},
          {transform:`perspective(1400px) translate3d(${current.left-home.left+(current.width-width)/2}px,${current.top-home.top+(current.height-compactHeight)/2}px,0) rotateY(360deg) scale(${current.width/width})`}
        ];
        reverse = card.animate(returnFrames, timing);
        reverse.pause(); reverse.currentTime=timing.duration;
      } else reverse=animation;
      shape.reverse(); trim.reverse(); frameReveal.reverse();
      reverse.reverse();
      const complete = () => {
        cleanup(); ++requestId; close();
        requestAnimationFrame(()=> {
          if (!inspector.isConnected || inspector.getAttribute('aria-hidden') === 'true') {
            delete slot.dataset.obsPersistent; delete inspector.dataset.obsClosing; inspector.dataset.obsPhase='ready';
            slot.style.removeProperty('width'); slot.style.removeProperty('height');
            document.documentElement.style.removeProperty('--obs-inspector-card-width');
            document.documentElement.style.removeProperty('--obs-inspector-card-height');
          }
        });
      };
      const finish = async () => {
        // A quick close can arrive before the rest of the deck reaches home.
        // Keep this card visible until the gallery cover is available to shuffle.
        if (deckModal?.obsStackReturn) await deckModal.obsStackReturn;
        if (disposed) return;
        const needsShuffle=Boolean(deckModal) && homeSource!==source && homeSource.isConnected && homeSource.dataset.contextPostKey!==postKey;
        if (!needsShuffle) { complete(); return; }
        const home=homeSource.getBoundingClientRect();
        const cover=homeSource.cloneNode(true);
        cover.classList.remove('obs-in-transit');
        cover.classList.add('obs-return-cover');
        cover.removeAttribute('id');cover.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
        const originals=[homeSource,...homeSource.querySelectorAll('*')];
        const copies=[cover,...cover.querySelectorAll('*')];
        originals.forEach((node,index)=>{const style=getComputedStyle(node);geometry.forEach(property=>copies[index].style.setProperty(property,style.getPropertyValue(property)));});
        Object.assign(cover.style,{position:'fixed',left:`${home.left}px`,top:`${home.top}px`,width:`${home.width}px`,height:`${home.height}px`,opacity:'1',margin:'0',zIndex:'45001',pointerEvents:'none',transform:'none',transition:'none',transformOrigin:'50% 80%'});
        cover.inert=true;cover.setAttribute('aria-hidden','true');
        document.body.append(cover);
        const shuffle=cover.animate([
          {transform:'translate3d(0,-7px,0) rotate(0deg) scale(.98)',opacity:0},
          {transform:`translate3d(${home.width*.42}px,-24px,0) rotate(7deg) scale(1)`,opacity:1,offset:.42},
          {transform:'translate3d(0,0,0) rotate(0deg) scale(1)',opacity:1}
        ],{duration:560,easing:'cubic-bezier(.22,.61,.36,1)',fill:'both'});
        try { await shuffle.finished; } catch { /* Interrupted by a new selection. */ }
        if (!disposed) complete();
        cover.remove();
      };
      reverse.finished.then(finish,finish);
    };
  };
  requestAnimationFrame(seek);
}

export function returnCardFromSide(postKey, close) {
  if (activeReturn && enabled()) { activeReturn(close); return; }
  ++requestId;
  activeCleanup?.();
  close();
}
