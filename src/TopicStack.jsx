import './topicStack.css';
import React, { useState } from 'react';
import { rankTopicPosts } from './topicGroups';

export default function TopicStack({ posts, renderCard }) {
  const [expanded, setExpanded] = useState(false);
  const ranked = rankTopicPosts(posts, 'likes');
  if (ranked.length === 1) return renderCard(ranked[0]);
  return <section className={`post-stack${expanded ? ' is-expanded' : ''}`} aria-label={`${ranked.length} posts about the same topic`}>
    {expanded ? <>
      <div className="post-stack-heading"><span><b>{ranked.length} posts · Same topic</b><small>Choose a version · Most liked first</small></span><button type="button" onClick={() => setExpanded(false)} aria-expanded="true">Collapse group ↑</button></div>
      <div className="post-stack-grid">{ranked.map((post) => <React.Fragment key={post.postKey || `${post.account}:${post.shortcode}`}>{renderCard(post)}</React.Fragment>)}</div>
    </> : <>
      {renderCard(ranked[0], () => setExpanded(true))}
      <button type="button" className="post-stack-trigger" aria-expanded="false" onClick={() => setExpanded(true)}><span aria-hidden="true">▱</span> {ranked.length} posts · Same topic <span aria-hidden="true">↗</span></button>
    </>}
  </section>;
}
