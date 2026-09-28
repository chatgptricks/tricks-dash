import { useEffect, useRef } from 'react';

// `inertSiblings` is for pages whose inspector sits beside the page content
// (Queue renders it inside <main>) rather than next to a single background pane.
const BACKDROPS = '.sidebar-backdrop,.obs-modal-backdrop';

// The page behind an open inspector must not scroll (Queue scrolls the body).
// Counted so nested inspectors release the lock only when the last one closes.
let scrollLocks = 0;
let savedBody = null;
function lockPageScroll() {
  if (scrollLocks++ > 0) return;
  const { body } = document;
  const gutter = window.innerWidth - document.documentElement.clientWidth;
  savedBody = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
  body.style.overflow = 'hidden';
  // Keep the layout still when a classic scrollbar disappears.
  if (gutter > 0) body.style.paddingRight = `${(parseFloat(getComputedStyle(body).paddingRight) || 0) + gutter}px`;
}
function unlockPageScroll() {
  if (--scrollLocks > 0 || !savedBody) return;
  Object.assign(document.body.style, savedBody);
  savedBody = null;
}

export function useInspectorModal(open, close, { inertSiblings = false } = {}) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const modal = document.querySelector('.obs-inspector.is-open,.obs-preview-side');
    const background = inertSiblings
      ? [...(modal?.parentElement?.children || [])].filter(node => node !== modal && !node.matches(BACKDROPS) && !node.inert)
      : [document.querySelector('.left-pane,.obs-preview-grid')].filter(node => node && !node.inert);
    background.forEach(node => { node.inert = true; });
    lockPageScroll();
    const frame = requestAnimationFrame(() => modal?.querySelector('button')?.focus({preventScroll:true}));
    const onKey = event => {
      // Download, caption and assignment dialogs sit above the inspector, and an
      // open card menu inside it closes itself on Escape.
      const childDialog = [...document.querySelectorAll('.media-modal-backdrop,.queue-modal-backdrop,.modal-backdrop,.queue-create-backdrop,.obs-inspector .post-menu-panel')].some(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
      if (event.defaultPrevented || childDialog) return;
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab' || !modal) return;
      const nodes = [...modal.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el => !el.closest('[inert]') && el.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
      if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus();}
    };
    document.addEventListener('keydown',onKey);
    return () => { unlockPageScroll();cancelAnimationFrame(frame);document.removeEventListener('keydown',onKey);background.forEach(node => { node.inert = false; });previous?.focus?.({preventScroll:true}); };
  }, [open]);
}
