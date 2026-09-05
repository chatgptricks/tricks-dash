import './topicStack.css';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { StackCard, postIdentity } from './StackActions';
import { rankTopicPosts } from './topicGroups';

export default function TopicStack({ posts, renderCard, total = posts.length }) {
  const [expanded, setExpanded] = useState(false);
  const ranked = rankTopicPosts(posts, 'likes');
  const newest = [...posts].sort((a, b) => (Number(b.timestamp) || Date.parse(b.postDate) || 0) - (Number(a.timestamp) || Date.parse(a.postDate) || 0) || postIdentity(a).localeCompare(postIdentity(b)))[0];
  const dialog = useRef(null);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const keydown = (event) => {
      if (event.key === 'Escape') setExpanded(false);
      if (event.key === 'Tab') {
        const controls = [...(dialog.current?.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]') || [])];
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus?.({ preventScroll: true }); };
  }, [expanded]);
  if (!newest) return null;
  if (total === 1) return <StackCard posts={posts}>{renderCard(newest)}</StackCard>;
  return <section className="post-stack" aria-label={`${ranked.length} posts about the same topic`}>
    <>
      <StackCard posts={posts}>{renderCard(newest, () => setExpanded(true))}</StackCard>
      <button type="button" className="post-stack-trigger" aria-expanded={expanded} onClick={() => setExpanded(true)} aria-label={`Open ${total} posts in this group`}>{total}</button>
      {expanded ? createPortal(<div className="post-stack-modal" role="dialog" aria-modal="true" aria-label="Posts in this stack" tabIndex={-1} ref={dialog} onClick={() => setExpanded(false)}><div className="post-stack-modal-inner" onClick={(event) => event.stopPropagation()}><div className="post-stack-heading"><span><b>{total} posts</b><small>{posts.length < total ? `${posts.length} match the current filters · ` : ''}Choose a version · click outside to close</small></span></div><div className="post-stack-grid">{ranked.map((post, index) => <div className={index === 0 ? 'stack-champion' : ''} key={postIdentity(post)}>{index === 0 && <span className="stack-champion-label">👑 Champion · Most likes</span>}<StackCard posts={[post]}><div onClick={() => setExpanded(false)}>{renderCard(post)}</div></StackCard></div>)}</div></div></div>, document.body) : null}
    </>
  </section>;
}
