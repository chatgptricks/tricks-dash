import { Users } from 'lucide-react';
import './post-collaboration.css';

export default function PostCollaboration({ post, t }) {
  if (post?.isCollab !== true) return null;
  const owner = String(post.account || '').trim().replace(/^@/, '').toLowerCase();
  const handles = [...new Set((Array.isArray(post.collaborators) ? post.collaborators : [])
    .filter(value => typeof value === 'string')
    .map(value => value.trim().replace(/^@/, '').toLowerCase())
    .filter(handle => /^[a-z0-9._]{1,30}$/.test(handle) && handle !== owner))];
  return (
    <section className="post-collaboration" aria-label={t('Collaboration')}>
      <span className="post-collaboration-label"><Users size={15} aria-hidden="true" />{t(handles.length ? 'Collaboration with' : 'Collaboration')}</span>
      {handles.length ? <ul className="post-collaboration-list">
        {handles.map(handle => <li key={handle}><a href={`https://www.instagram.com/${handle}/`} target="_blank" rel="noopener noreferrer">@{handle}</a></li>)}
      </ul> : <span className="post-collaboration-unavailable">{t('Collaborators unavailable')}</span>}
    </section>
  );
}
