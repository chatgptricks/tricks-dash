import { useEffect, useRef } from 'react';

// `inertSiblings` is for pages whose inspector sits beside the page content
// (Queue renders it inside <main>) rather than next to a single background pane.
const BACKDROPS = '.sidebar-backdrop,.obs-modal-backdrop';

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
    const frame = requestAnimationFrame(() => modal?.querySelector('button')?.focus({preventScroll:true}));
    const onKey = event => {
      // Download, caption and assignment dialogs sit above the inspector.
      const childDialog = [...document.querySelectorAll('.media-modal-backdrop,.queue-modal-backdrop,.modal-backdrop')].some(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
      if (event.defaultPrevented || childDialog) return;
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab' || !modal) return;
      const nodes = [...modal.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el => !el.closest('[inert]') && el.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
      if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus();}
    };
    document.addEventListener('keydown',onKey);
    return () => { cancelAnimationFrame(frame);document.removeEventListener('keydown',onKey);background.forEach(node => { node.inert = false; });previous?.focus?.({preventScroll:true}); };
  }, [open]);
}
