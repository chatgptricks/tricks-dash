import React, { useId, useLayoutEffect, useRef } from 'react';
import { InspectorCardSlot, PostCard } from './PostCard';
import { SlideDownload } from './postDetail';
import { sendCardToSide } from './card-flight';
import { useInspectorModal } from './use-inspector-modal';
import { usePrefs } from './prefsContext';
import { CoordinatorNotes, QueueNotesBadge, QueueNotesNotice } from './QueueNotes.jsx';
import { manualQueueNotes } from './queueNoteText.js';

let queueOrigin=null;
export function captureQueueCardOrigin(event) {
  const candidate=event.target.closest('.scheduler-block,.queue-pool-card > button,.queue-assignment-card,.designer-assignment-row,.queue-admin-assignment-row,.queue-archive-list > button');
  if (candidate) queueOrigin=candidate;
}

export default function QueuePostInspector({post,onClose,children,notes,notesCopyControl,...props}) {
  const { t } = usePrefs();
  const fallback=useRef(null);
  const opened=useRef(null);
  const noteRef=useRef(null);
  const noteId=useId();
  const reviewNotes=()=>{
    noteRef.current?.scrollIntoView?.({behavior:'auto',block:'nearest'});
    noteRef.current?.focus({preventScroll:true});
  };
  useInspectorModal(true,onClose,{inertSiblings:true});
  useLayoutEffect(()=>{
    if (opened.current===post.postKey) return;
    opened.current=post.postKey;
    const source=fallback.current?.querySelector('.post-card');
    const origin=queueOrigin?.isConnected ? queueOrigin : null;
    if (source && origin) sendCardToSide(source,post.postKey,{allowSlot:true,origin,homeSource:origin});
    queueOrigin=null;
  },[post.postKey]);
  const elements=React.Children.toArray(children);
  const close=elements.filter(child=>child.props?.className?.includes('rail-close-button'));
  const detail=elements.find(child=>child.props?.className==='panel detail');
  const detailActions=detail ? React.Children.toArray(detail.props.children).filter(child=>!child.props?.post || child.type===SlideDownload) : [];
  const info=elements.filter(child=>!close.includes(child) && child!==detail);
  return <aside {...props} className="right-rail obs-inspector is-open queue-request-rail obs-queue-inspector" role="dialog" aria-modal="true" aria-hidden="false">
    {close}
    <div className="queue-inspector-heading"><header className="obs-inspector-heading"><span>{t('Selected post')}</span><small>{t('Queue / Details')}</small></header>
    <QueueNotesNotice notes={notes} onReview={reviewNotes} noteId={noteId} /></div>
    <div className="queue-inspector-notes-icon"><InspectorCardSlot post={post} sideview={post.postKey}>
      <div className="obs-card-fallback" ref={fallback}><PostCard post={post} priority onSelect={()=>{}} /></div>
    </InspectorCardSlot>{manualQueueNotes(notes) ? <button className="queue-inspector-notes-button" type="button" onClick={reviewNotes} title={t('Coordinator notes')} aria-label={t('Coordinator notes')} aria-controls={noteId}><QueueNotesBadge notes={notes} compact /></button> : null}</div>
    <div className="obs-inspector-info">
      <CoordinatorNotes notes={notes} copyControl={notesCopyControl} noteRef={noteRef} id={noteId} />
      {post.permalink ? <a className="ghost-button obs-open-original" href={post.permalink} target="_blank" rel="noopener noreferrer">{t('Open original')} ↗</a> : null}
      {detailActions}{info}
    </div>
  </aside>;
}
