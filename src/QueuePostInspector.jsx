import React, { useLayoutEffect, useRef } from 'react';
import { PostCard } from './App';
import { SlideDownload } from './postDetail';
import { sendCardToSide } from './card-flight';
import { useInspectorModal } from './use-inspector-modal';

let queueOrigin=null;
export function captureQueueCardOrigin(event) {
  const candidate=event.target.closest('.scheduler-block,.queue-pool-card > button,.queue-assignment-card,.designer-assignment-row,.queue-admin-assignment-row,.queue-archive-list > button');
  if (candidate) queueOrigin=candidate;
}

export default function QueuePostInspector({post,onClose,children,...props}) {
  const fallback=useRef(null);
  const opened=useRef(null);
  useInspectorModal(true,onClose);
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
    <header className="obs-inspector-heading"><span>Selected post</span><small>Queue / Details</small></header>
    <section className="obs-card-slot" data-obs-sideview={post.postKey}>
      <div className="obs-card-fallback" ref={fallback}><PostCard post={post} onSelect={()=>{}} /></div>
    </section>
    <div className="obs-inspector-info">
      {post.permalink ? <a className="ghost-button obs-open-original" href={post.permalink} target="_blank" rel="noopener noreferrer">Open original ↗</a> : null}
      {detailActions}{info}
    </div>
  </aside>;
}
