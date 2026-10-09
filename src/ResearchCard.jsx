import { useState } from 'react';
import { usePrefs } from './prefsContext';
import { ImageOff } from 'lucide-react';
import { obsidianCardHandlers } from './obsidian-card';

// The card frame follows Research; each tool owns its content and actions.
export default function ResearchCard({ className = '', source, meta, avatar, marker, media, actions, footer, children, ...articleProps }) {
  return <article className={`post-card obs-card product-card ${className}`} {...obsidianCardHandlers} {...articleProps}>
    <div className="post-header">
      <div className="post-user">
        <div className="post-avatar" aria-hidden="true">{avatar || String(source || '').replace(/^@/, '').slice(0, 2).toUpperCase()}</div>
        <div className="post-user-copy"><strong>{source}</strong><span>{meta}</span></div>
      </div>
      {marker && <div className="post-header-actions">{marker}</div>}
    </div>
    <div className="post-media product-card-media">{media}<span className="obs-soft-glare" aria-hidden="true" /></div>
    {actions && <div className="post-editorial-actions product-card-actions">{actions}</div>}
    <div className="post-copy product-card-body">{children}{footer && <footer className="post-footer product-card-footer">{footer}</footer>}</div>
  </article>;
}

export function CardMedia({ src, fallbackSrc, alt = '', label = 'No preview' }) {
  const { t } = usePrefs();
  // Remember failures by URL so replacing the source retries the new image
  // without an effect, and a failed fallback cannot create an error loop.
  const [failed, setFailed] = useState([]);
  const current = [src, fallbackSrc].find(url => url && !failed.includes(url));
  return current
    ? <img className="product-card-image" src={current} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(previous => [...previous, current])} />
    : <div className="product-card-placeholder" role="img" aria-label={t(label)}><ImageOff size={24} aria-hidden="true" /><span>{t(label)}</span></div>;
}
