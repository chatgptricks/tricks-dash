import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { apiFetch, API_BASE } from './api';
import { firebaseAuth, startGoogleSignIn, describeSignInError } from './firebase';
import { clearSsoCookie, startSsoRefresh, trySsoSignIn } from './sso';
import { PrefsProvider } from './prefsContext';
import { SettingsMenu } from './App';
import ProductHeader from './ProductHeader';
import { encodeRouteState } from './urlCodec';
import './styles.css';
import './vault.css';

const isTweet = value => { try { const url = new URL(value); return ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(url.hostname) && /\/(?:[a-zA-Z0-9_]+|i\/web)\/status\/\d+\/?$/.test(url.pathname); } catch { return false; } };
const endpoint = `${API_BASE}/api/dashboard/vault`;
const safeUrl = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
const platform = url => { const host = new URL(url).hostname.replace(/^www\./, ''); return ['x.com', 'twitter.com', 'mobile.twitter.com'].includes(host) ? 'X' : host.includes('instagram.com') ? 'Instagram' : host === 'drive.google.com' ? 'Drive' : host === 'sentientdash.app' ? 'Research' : host; };
async function request(url, options) {
  const response = await apiFetch(url, options);
  if (!response.ok) { let message; try { const data = await response.json(); message = typeof data.detail === 'string' ? data.detail : ''; } catch {} throw new Error(message || `Request failed (${response.status}).`); }
  return response.json();
}
function Vault() {
  const [user, setUser] = useState(undefined), [viewer, setViewer] = useState(null), [items, setItems] = useState([]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('All'), [view, setView] = useState('collection');
  const discarded = view === 'discarded';
  const [adding, setAdding] = useState(false), [url, setUrl] = useState(''), [title, setTitle] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => { trySsoSignIn().catch(() => {}); return onAuthStateChanged(firebaseAuth, value => { setUser(value || null); setViewer(null); setItems([]); setLoaded(false); }); }, []);
  useEffect(() => user ? startSsoRefresh() : undefined, [user]);
  useEffect(() => {
    if (!user) return; let active = true; setError(''); setLoaded(false);
    (async () => { try {
      const me = await request(`${API_BASE}/api/dashboard/me`); if (!active) return; setViewer(me);
      if (!me.is_dev || me.queue_role_preview_active) return;
      const data = await request(endpoint); if (active) { setItems(data.items); setLoaded(true); }
    } catch (reason) { if (active) setError(reason.message); } })();
    return () => { active = false; };
  }, [user, revision]);
  async function mutate(path, method, body) {
    setBusy(true); setError('');
    try { const item = await request(endpoint + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); setItems(rows => [...rows.filter(row => row.id !== item.id), item]); return item; }
    catch (reason) { setError(reason.message); return null; } finally { setBusy(false); }
  }
  async function add(event) { event.preventDefault(); const item = await mutate('', 'POST', { url: url.trim(), title: title.trim() }); if (item) { setAdding(false); setUrl(''); setTitle(''); setQuery(''); setFilter('All'); setView(item.discarded ? 'discarded' : item.done ? 'done' : 'collection'); } }
  const ordered = [...items].sort((a, b) => a.priority - b.priority || b.shared_at.localeCompare(a.shared_at) || a.id.localeCompare(b.id));
  const activeItems = ordered.filter(item => !item.discarded && !item.done);
  const doneItems = ordered.filter(item => !item.discarded && item.done);
  async function move(item, direction) {
    const index = activeItems.findIndex(row => row.id === item.id), target = index + direction;
    if (target < 0 || target >= activeItems.length) return;
    const without = activeItems.filter(row => row.id !== item.id);
    const before = without[target - 1], after = without[target];
    const priority = before && after ? (before.priority + after.priority) / 2 : before ? before.priority + 1 : after.priority - 1;
    await mutate(`/${item.id}`, 'PATCH', { priority });
  }
  const rows = ordered.filter(item => (discarded ? Boolean(item.discarded) : !item.discarded && Boolean(item.done) === (view === 'done')) && safeUrl(item.url) && (filter === 'All' || platform(item.url) === filter) && `${item.title} ${item.url} ${item.source} ${item.tweet_text || ''}`.toLowerCase().includes(query.toLowerCase()));
  const login = async () => { try { const issue = await startGoogleSignIn(); if (issue) setError(describeSignInError(issue)); } catch (reason) { setError(reason.message); } };
  const allowed = viewer?.is_dev && !viewer?.queue_role_preview_active;
  if (!user || !allowed) return <main className="vault-gate"><span className="vault-eyebrow">SENTIENT DASH · DEV</span><h1>Vault</h1><p>{user === undefined ? 'Loading…' : !user ? 'Sign in to open your collection.' : !viewer ? 'Verifying access…' : 'Vault is available in DEV full access only.'}</p>{user === null && <button onClick={login}>Sign in with Google</button>}{error && <p role="alert">{error} <button onClick={() => setRevision(n => n + 1)}>Retry</button></p>}<a href="/index.html">Back to Research</a></main>;
  return <main className="vault-shell">
    <ProductHeader current="vault" coordinator isDev account={<SettingsMenu email={user.email} avatarUrl={user.photoURL || viewer.avatar_url} isDev isAdmin={Boolean(viewer.is_admin)} hideAppearanceControls onSignOut={() => { clearSsoCookie(); signOut(firebaseAuth); }} />} />
    <section className="vault-heading"><div><span className="vault-eyebrow">YOUR CREATIVE RESERVE · DEV ONLY</span><h1>Vault<span>↗</span></h1><p>Good links. Ready for the next idea.</p></div><button className="vault-primary" onClick={() => setAdding(value => !value)}>+ Add link</button></section>
    {adding && <form className="vault-add" onSubmit={add}><label>Link<input type="url" required maxLength={4096} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" /></label><label>Title<input maxLength={300} value={title} onChange={e => setTitle(e.target.value)} placeholder="Give this idea a name" /></label><button className="vault-primary" disabled={busy}>Save link</button><button type="button" onClick={() => setAdding(false)}>Cancel</button></form>}
    <section className="vault-toolbar"><div className="vault-tabs"><button aria-pressed={view === 'collection'} onClick={() => setView('collection')}>Collection <b>{activeItems.length}</b></button><button aria-pressed={view === 'done'} onClick={() => setView('done')}>Done! <b>{doneItems.length}</b></button><button aria-pressed={discarded} onClick={() => setView('discarded')}>Discarded <b>{items.filter(item => item.discarded).length}</b></button></div><input aria-label="Search links" placeholder="Search links or creators…" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Filter by source" value={filter} onChange={e => setFilter(e.target.value)}><option>All</option>{[...new Set(items.filter(item => safeUrl(item.url)).map(item => platform(item.url)))].sort().map(value => <option key={value}>{value}</option>)}</select></section>
    {error && <div className="vault-alert" role="alert">{error} <button onClick={() => setRevision(n => n + 1)}>Reload</button></div>}
    <div className="vault-caption"><span>{rows.length} links{view === 'collection' && ' · Highest priority first'}</span><span>{discarded ? 'Restore a link anytime' : view === 'done' ? 'Completed ideas · Undo anytime' : 'Use ↑ ↓ to change priority'}</span></div>
    <section className="vault-grid" aria-label="Saved links">{rows.map(item => { const rank = activeItems.findIndex(row => row.id === item.id); const site = platform(item.url); return <article className={`vault-card ${item.done ? 'is-done' : ''}`} key={item.id}>
      <div className={`vault-card-cover vault-platform-${site.toLowerCase()} ${safeUrl(item.tweet_image) ? 'has-media' : ''}`}><span className="vault-platform-mark">{site === 'X' ? '𝕏' : site === 'Drive' ? '△' : site === 'Instagram' ? '◎' : '↗'}</span>{safeUrl(item.tweet_image) && <a className="vault-media-link" href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer" aria-label={`Open media for ${item.title}`}><img src={safeUrl(item.tweet_image)} alt={`Media from ${item.tweet_author || item.title}`} loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none'; }} /></a>}<small className="vault-platform-badge">{site}</small>{!discarded && <b className="vault-priority-badge">{item.done ? '✓ Done!' : `#${rank + 1}`}</b>}{['video', 'animated_gif'].includes(item.tweet_media_type) && <span className="vault-play-badge">▶ <small>{item.tweet_media_type === 'video' ? 'Video' : 'GIF'}</small></span>}</div>
      <div className="vault-card-body"><div className="vault-author-row">{safeUrl(item.tweet_avatar) ? <img className="vault-avatar" src={safeUrl(item.tweet_avatar)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none'; }} /> : <span className="vault-avatar-placeholder">{site === 'X' ? '𝕏' : '↗'}</span>}<div><span className="vault-eyebrow">{site === 'X' ? item.title.replace('Post by ', '') : site}</span><h2><a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer">{item.tweet_author || item.title}</a></h2></div></div>{item.tweet_text ? <div className="vault-tweet"><p>{expanded[item.id] || item.tweet_text.length <= 600 ? item.tweet_text : `${item.tweet_text.slice(0, 600)}…`}</p>{item.tweet_text.length > 600 && <button className="vault-read-more" aria-expanded={Boolean(expanded[item.id])} onClick={() => setExpanded(current => ({ ...current, [item.id]: !current[item.id] }))}>{expanded[item.id] ? 'Show less' : 'Read more'}</button>}{item.tweet_author && <span className="vault-tweet-author">— {item.tweet_author}</span>}</div> : isTweet(item.url) && <div className="vault-tweet-unavailable"><p>{item.text_status === 'unavailable' ? 'X could not provide this tweet’s text.' : 'Tweet text has not been loaded yet.'}</p><button disabled={busy} onClick={() => mutate(`/${item.id}/text`, 'POST', {})}>{busy ? 'Loading…' : item.text_status === 'unavailable' ? 'Retry text' : 'Load tweet text'}</button></div>}<p className="vault-url">{item.url}</p><div className="vault-meta">{item.source ? `From ${item.source} · ` : ''}{new Date(item.shared_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div><div className="vault-links"><a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer">Open link ↗</a>{safeUrl(item.slack_url) && <a href={safeUrl(item.slack_url)} target="_blank" rel="noopener noreferrer">Slack ↗</a>}</div></div>
      <footer>{view === 'collection' && <div className="vault-order-actions"><button aria-label={`Move ${item.title} up`} disabled={busy || rank === 0} onClick={() => move(item, -1)}>↑</button><button aria-label={`Move ${item.title} down`} disabled={busy || rank === activeItems.length - 1} onClick={() => move(item, 1)}>↓</button></div>}{!discarded && <div className="vault-workflow-actions"><button className="vault-done" disabled={busy} onClick={() => mutate(`/${item.id}`, 'PATCH', { done: !item.done })}>{item.done ? 'Undo Done' : '✓ Done!'}</button>{item.pool_request_id ? <a className="vault-in-pool" href={`/queue.html?r=${encodeRouteState({ task: item.pool_request_id })}`} target="sentient-queue">✓ In Queue ↗</a> : <button className="vault-to-pool" disabled={busy} onClick={() => mutate(`/${item.id}/pool`, 'POST', {})}>Send to Pool ↗</button>}</div>}<button className="vault-discard" disabled={busy} onClick={() => mutate(`/${item.id}`, 'PATCH', { discarded: !discarded })}>{discarded ? 'Restore' : 'Discard'}</button></footer>
    </article>; })}</section>
    {!rows.length && <p className="vault-empty">{!loaded ? 'Loading your links…' : query || filter !== 'All' ? 'No matching links. Try another search or source.' : discarded ? 'No discarded links.' : view === 'done' ? 'No completed links yet. Mark a card Done! to move it here.' : 'Your collection is ready. Add your first link.'}</p>}
  </main>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<PrefsProvider lang="en" theme="dark"><Vault /></PrefsProvider>);
