import React, { useId, useLayoutEffect, useRef } from 'react';
import { InspectorCardSlot, PostCard } from './PostCard';
import { SlideDownload } from './postDetail';
import { sendCardToSide } from './card-flight';
import { useInspectorModal } from './use-inspector-modal';
import { usePrefs } from './prefsContext';
import { CoordinatorNotes, QueueNotesBadge } from './QueueNotes.jsx';
import { manualQueueNotes } from './queueNoteText.js';

let queueOrigin=null;
export function captureQueueCardOrigin(event) {
  const candidate=event.target.closest('.scheduler-block,.queue-pool-card > button,.queue-assignment-card,.designer-assignment-row,.queue-admin-assignment-row,.queue-archive-list > button');
  if (candidate) queueOrigin=candidate.querySelector('.designer-assignment-post > img,.designer-assignment-empty,.queue-admin-assignment-post > img,.queue-admin-assignment-empty,:scope > span > img') || candidate;
}

export default function QueuePostInspector({post,onClose,children,notes,notesCopyControl,...props}) {
  const { t } = usePrefs();
  const fallback=useRef(null);
  const cardFrame=useRef(null);
  const opened=useRef(null);
  const noteRef=useRef(null);
  const noteId=useId();
  const reviewNotes=()=>{
    if (noteRef.current) noteRef.current.parentElement.scrollTop=0;
    noteRef.current?.focus({preventScroll:true});
  };
  useInspectorModal(true,onClose,{inertSiblings:true});
  useLayoutEffect(()=>{
    const source=fallback.current?.querySelector('.post-card');
    const frame=cardFrame.current;
    const slot=source?.closest('.obs-card-slot');
    if (!source || !frame || !slot) return;
    const naturalWidth=source.offsetWidth;
    fallback.current.style.width=`${naturalWidth}px`;
    const fitFallback=()=>{
      if (slot.dataset.obsPersistent==='true' || !naturalWidth || !source.offsetHeight) return;
      const scale=Math.min(1,frame.clientWidth/naturalWidth,frame.clientHeight/source.offsetHeight);
      slot.style.width=`${naturalWidth*scale}px`;
      slot.style.height=`${source.offsetHeight*scale}px`;
      fallback.current.style.transform=`scale(${scale})`;
    };
    const origin=queueOrigin?.isConnected ? queueOrigin : null;
    if (origin && opened.current!==post.postKey) sendCardToSide(source,post.postKey,{allowSlot:true,origin,homeSource:origin,fitContainer:frame});
    opened.current=post.postKey;
    queueOrigin=null;
    fitFallback();
    const observer=new ResizeObserver(fitFallback);
    observer.observe(frame);
    observer.observe(source);
    return ()=>observer.disconnect();
  },[post.postKey]);
  const elements=React.Children.toArray(children);
  const close=elements.filter(child=>child.props?.className?.includes('rail-close-button'));
  const detail=elements.find(child=>child.props?.className==='panel detail');
  const detailActions=detail ? React.Children.toArray(detail.props.children).filter(child=>!child.props?.post || child.type===SlideDownload) : [];
  const info=elements.filter(child=>!close.includes(child) && child!==detail);
  return <aside {...props} className="right-rail obs-inspector is-open queue-request-rail obs-queue-inspector" role="dialog" aria-modal="true" aria-hidden="false">
    {close}
    <header className="obs-inspector-heading"><span>{t('Selected post')}</span><small>{t('Queue / Details')}</small></header>
    <div className="queue-inspector-notes-icon" ref={cardFrame}><div className="queue-inspector-card"><InspectorCardSlot post={post} sideview={post.postKey}>
      <div className="obs-card-fallback" ref={fallback}><PostCard post={post} priority onSelect={()=>{}} /></div>
    </InspectorCardSlot>{manualQueueNotes(notes) ? <button className="queue-inspector-notes-button" type="button" onClick={reviewNotes} title={t('Coordinator notes')} aria-label={t('Coordinator notes')} aria-controls={noteId}><QueueNotesBadge notes={notes} compact /></button> : null}</div></div>
    <div className="obs-inspector-info">
      <CoordinatorNotes notes={notes} copyControl={notesCopyControl} noteRef={noteRef} id={noteId} />
      {post.permalink ? <a className="ghost-button obs-open-original" href={post.permalink} target="_blank" rel="noopener noreferrer">{t('Open original')} ↗</a> : null}
      {detailActions}{info}
    </div>
  </aside>;
}
