import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { apiFetch, API_BASE } from './api';
import { firebaseAuth, startGoogleSignIn, describeSignInError } from './firebase';
import { clearSsoCookie, startSsoRefresh, trySsoSignIn } from './sso';
import { PrefsProvider } from './prefsContext';
import { SettingsMenu } from './App';
import ProductHeader from './ProductHeader';
import './styles.css';
import './vault.css';

const endpoint = `${API_BASE}/api/dashboard/vault`;
const safeUrl = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
const platform = url => { const host = new URL(url).hostname.replace(/^www\./, ''); return host === 'x.com' ? 'X' : host.includes('instagram.com') ? 'Instagram' : host === 'drive.google.com' ? 'Drive' : host === 'sentientdash.app' ? 'Research' : host; };
async function request(url, options) {
  const response = await apiFetch(url, options);
  if (!response.ok) { let message; try { const data = await response.json(); message = typeof data.detail === 'string' ? data.detail : ''; } catch {} throw new Error(message || `Request failed (${response.status}).`); }
  return response.json();
}
function Vault() {
  const [user, setUser] = useState(undefined), [viewer, setViewer] = useState(null), [items, setItems] = useState([]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('All'), [discarded, setDiscarded] = useState(false);
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
  async function add(event) { event.preventDefault(); const item = await mutate('', 'POST', { url: url.trim(), title: title.trim() }); if (item) { setAdding(false); setUrl(''); setTitle(''); setQuery(''); setFilter('All'); setDiscarded(Boolean(item.discarded)); } }
  const ordered = [...items].sort((a, b) => a.priority - b.priority || b.shared_at.localeCompare(a.shared_at) || a.id.localeCompare(b.id));
  const activeItems = ordered.filter(item => !item.discarded);
  async function move(item, direction) {
    const index = activeItems.findIndex(row => row.id === item.id), target = index + direction;
    if (target < 0 || target >= activeItems.length) return;
    const without = activeItems.filter(row => row.id !== item.id);
    const before = without[target - 1], after = without[target];
    const priority = before && after ? (before.priority + after.priority) / 2 : before ? before.priority + 1 : after.priority - 1;
    await mutate(`/${item.id}`, 'PATCH', { priority });
  }
  const rows = ordered.filter(item => Boolean(item.discarded) === discarded && safeUrl(item.url) && (filter === 'All' || platform(item.url) === filter) && `${item.title} ${item.url} ${item.source}`.toLowerCase().includes(query.toLowerCase()));
  const login = async () => { try { const issue = await startGoogleSignIn(); if (issue) setError(describeSignInError(issue)); } catch (reason) { setError(reason.message); } };
  const allowed = viewer?.is_dev && !viewer?.queue_role_preview_active;
  if (!user || !allowed) return <main className="vault-gate"><span className="vault-eyebrow">SENTIENT DASH · DEV</span><h1>Vault</h1><p>{user === undefined ? 'Loading…' : !user ? 'Sign in to open your collection.' : !viewer ? 'Verifying access…' : 'Vault is available in DEV full access only.'}</p>{user === null && <button onClick={login}>Sign in with Google</button>}{error && <p role="alert">{error} <button onClick={() => setRevision(n => n + 1)}>Retry</button></p>}<a href="/index.html">Back to Research</a></main>;
  return <main className="vault-shell">
    <ProductHeader current="vault" coordinator isDev account={<SettingsMenu email={user.email} avatarUrl={user.photoURL || viewer.avatar_url} isDev isAdmin={Boolean(viewer.is_admin)} hideAppearanceControls onSignOut={() => { clearSsoCookie(); signOut(firebaseAuth); }} />} />
    <section className="vault-heading"><div><span className="vault-eyebrow">YOUR CREATIVE RESERVE · DEV ONLY</span><h1>Vault<span>↗</span></h1><p>Good links. Ready for the next idea.</p></div><button className="vault-primary" onClick={() => setAdding(value => !value)}>+ Add link</button></section>
    {adding && <form className="vault-add" onSubmit={add}><label>Link<input type="url" required maxLength={4096} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" /></label><label>Title<input maxLength={300} value={title} onChange={e => setTitle(e.target.value)} placeholder="Give this idea a name" /></label><button className="vault-primary" disabled={busy}>Save link</button><button type="button" onClick={() => setAdding(false)}>Cancel</button></form>}
    <section className="vault-toolbar"><div className="vault-tabs"><button aria-pressed={!discarded} onClick={() => setDiscarded(false)}>Collection <b>{activeItems.length}</b></button><button aria-pressed={discarded} onClick={() => setDiscarded(true)}>Discarded <b>{items.length - activeItems.length}</b></button></div><input aria-label="Search links" placeholder="Search links or creators…" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Filter by source" value={filter} onChange={e => setFilter(e.target.value)}><option>All</option>{[...new Set(items.filter(item => safeUrl(item.url)).map(item => platform(item.url)))].sort().map(value => <option key={value}>{value}</option>)}</select></section>
    {error && <div className="vault-alert" role="alert">{error} <button onClick={() => setRevision(n => n + 1)}>Reload</button></div>}
    <div className="vault-caption"><span>{rows.length} links{!discarded && ' · Highest priority first'}</span><span>{discarded ? 'Restore a link anytime' : 'Use ↑ ↓ to change priority'}</span></div>
    <section className="vault-grid" aria-label="Saved links">{rows.map(item => { const rank = activeItems.findIndex(row => row.id === item.id); const site = platform(item.url); return <article className="vault-card" key={item.id}>
      <div className={`vault-card-cover vault-platform-${site.toLowerCase()}`}><span>{site === 'X' ? '𝕏' : site === 'Drive' ? '↗' : site === 'Instagram' ? '◎' : '↗'}</span><small>{site}</small>{!discarded && <b>#{rank + 1}</b>}</div>
      <div className="vault-card-body"><span className="vault-eyebrow">{site}</span><h2><a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer">{item.title}</a></h2><p className="vault-url">{item.url}</p><div className="vault-meta">{item.source ? `From ${item.source} · ` : ''}{new Date(item.shared_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div><div className="vault-links"><a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer">Open link ↗</a>{safeUrl(item.slack_url) && <a href={safeUrl(item.slack_url)} target="_blank" rel="noopener noreferrer">Slack ↗</a>}</div></div>
      <footer>{!discarded && <div><button aria-label={`Move ${item.title} up`} disabled={busy || rank === 0} onClick={() => move(item, -1)}>↑</button><button aria-label={`Move ${item.title} down`} disabled={busy || rank === activeItems.length - 1} onClick={() => move(item, 1)}>↓</button></div>}<button className="vault-discard" disabled={busy} onClick={() => mutate(`/${item.id}`, 'PATCH', { discarded: !discarded })}>{discarded ? 'Restore' : 'Discard'}</button></footer>
    </article>; })}</section>
    {!rows.length && <p className="vault-empty">{!loaded ? 'Loading your links…' : query || filter !== 'All' ? 'No matching links. Try another search or source.' : discarded ? 'No discarded links.' : 'Your collection is ready. Add your first link.'}</p>}
  </main>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<PrefsProvider lang="en" theme="dark"><Vault /></PrefsProvider>);
