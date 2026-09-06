import './topicStack.css';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Clock3 } from 'lucide-react';
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
      <StackCard posts={posts}>{cardWithTiming(newest, renderCard(newest, () => setExpanded(true)))}</StackCard>
      <button type="button" className="post-stack-trigger" aria-expanded={expanded} onClick={() => setExpanded(true)} aria-label={`Open ${total} posts in this group`}>+{total}</button>
      {expanded ? createPortal(<div className="post-stack-modal" role="dialog" aria-modal="true" aria-label="Posts in this stack" tabIndex={-1} ref={dialog} onClick={() => setExpanded(false)}><div className="post-stack-modal-inner" onClick={(event) => { if (!event.target.closest('.stack-card-shell')) setExpanded(false); else event.stopPropagation(); }}><div className="post-stack-heading"><span><b>{total} posts</b><small>{posts.length < total ? `${posts.length} match the current filters · ` : ''}Choose a version</small></span></div><div className="post-stack-grid">{ranked.map((post, index) => <div className={index === 0 ? 'stack-champion' : ''} key={postIdentity(post)}>{index === 0 && <span className="stack-champion-label">👑 Champion · Most likes</span>}<StackCard posts={[post]}>{cardWithTiming(post, <div onClick={() => setExpanded(false)}>{renderCard(post)}</div>)}</StackCard></div>)}</div></div></div>, document.body) : null}
    </>
  </section>;
}
