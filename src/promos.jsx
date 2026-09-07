import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { apiFetch, API_BASE } from './api';
import { firebaseAuth, startGoogleSignIn, describeSignInError } from './firebase';
import { clearSsoCookie, startSsoRefresh, trySsoSignIn } from './sso';
import ProductHeader from './ProductHeader';
import { SettingsMenu } from './App';
import { PrefsProvider } from './prefsContext';
import './styles.css';
import './promos.css';

const EMPTY = { items: [], next_cursor: null };

function Login({ error }) {
  const [busy, setBusy] = useState(false);
  async function login() { setBusy(true); try { const issue = await startGoogleSignIn(); if (issue) window.alert(describeSignInError(issue)); } finally { setBusy(false); } }
  return <main className="promo-auth"><section><span className="promo-kicker">Sentient Dash · hidden tool</span><h1>Promos</h1><p>Sign in with an authorized Sentient account to review competitor promotion signals.</p><button className="promo-primary" onClick={login} disabled={busy}>{busy ? 'Signing in…' : 'Sign in with Google'}</button>{error && <p className="promo-error">{error}</p>}</section></main>;
}

function Badge({ value }) { return <span className={`promo-badge ${value}`}>{value === 'disclosed' ? 'Disclosed promotion' : value === 'likely' ? 'Likely promotion' : 'Needs review'}</span>; }

function Card({ item, onSelect }) {
  const evidence = item.evidence?.[0]?.text || item.signals?.join(' · ') || 'No evidence excerpt';
  return <article className="promo-card" onClick={() => onSelect(item)}>
    <div className="promo-cover">{item.cover_url || item.cover_source_url ? <img src={item.cover_url ? `${API_BASE}${item.cover_url}` : item.cover_source_url} alt="" /> : <span>◎</span>}</div>
    <div className="promo-card-body"><div className="promo-card-top"><Badge value={item.classification} /><span className="promo-review">{item.review_status}</span></div>
      <h2>{item.client || 'Unknown client'}</h2><p className="promo-product">{item.product || 'Product not specified'}</p>
      <dl><div><dt>Posted by</dt><dd>@{item.account}</dd></div><div><dt>Detected</dt><dd>{item.first_detected_at ? new Date(item.first_detected_at).toLocaleDateString() : '—'}</dd></div></dl>
      <p className="promo-evidence">“{evidence}”</p><div className="promo-card-foot">{item.cta?.keyword ? `Keyword: ${item.cta.keyword}` : item.promo_code ? `Code: ${item.promo_code}` : item.links?.length ? 'Commercial link found' : 'Open details'}<span>↗</span></div>
    </div></article>;
}

function Detail({ item, onClose, onUpdate }) {
  const [saving, setSaving] = useState(false);
  async function update(payload) { setSaving(true); try { const response = await apiFetch(`${API_BASE}/api/admin/promos/${encodeURIComponent(item.account)}/${encodeURIComponent(item.shortcode)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (response.ok) onUpdate(await response.json()); } finally { setSaving(false); } }
  return <div className="promo-modal" role="dialog" aria-modal="true"><div className="promo-dialog"><button className="promo-close" onClick={onClose}>×</button><Badge value={item.classification} /><h2>{item.client || 'Unknown client'}</h2><p className="promo-product">{item.product || 'Product not specified'}</p><p className="promo-by">@{item.account} · {item.published_at ? new Date(item.published_at).toLocaleString() : 'date unavailable'}</p><div className="promo-caption">{item.caption || 'Caption unavailable.'}</div><div className="promo-evidence-list">{(item.evidence || []).map((e, index) => <div key={`${e.rule}-${index}`}><strong>{e.rule}</strong><span>{e.text}</span></div>)}</div>{item.cta?.keyword && <p><strong>Automation keyword:</strong> {item.cta.keyword}</p>}{item.links?.map(link => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.url}</a>)}<div className="promo-actions"><button disabled={saving} onClick={() => update({ review_status: 'reviewed' })}>Mark reviewed</button><button disabled={saving} onClick={() => update({ review_status: 'dismissed' })}>Dismiss</button><a className="promo-primary" href={item.permalink} target="_blank" rel="noreferrer">Open post</a></div></div></div>;
}

function PromosApp() {
  const [user, setUser] = useState(undefined); const [viewer, setViewer] = useState(null); const [authError, setAuthError] = useState(''); const [data, setData] = useState(EMPTY); const [selected, setSelected] = useState(null); const [filters, setFilters] = useState({ search: '', classification: '', review: 'new' }); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [jobNotice, setJobNotice] = useState('');
  useEffect(() => { trySsoSignIn().catch(() => {}); return onAuthStateChanged(firebaseAuth, value => { setUser(value || null); setViewer(null); }); }, []);
  useEffect(() => user ? startSsoRefresh() : undefined, [user]);
  useEffect(() => { if (!user) return undefined; let active = true; apiFetch(`${API_BASE}/api/dashboard/me`).then(async response => { if (!response.ok) throw new Error('Unable to verify account access.'); return response.json(); }).then(next => { if (active) setViewer(next); }).catch(() => { if (active) setViewer({}); }); return () => { active = false; }; }, [user]);
  const load = useCallback(async () => { if (!user) return; setLoading(true); setError(''); try { const params = new URLSearchParams({ limit: '100' }); if (filters.classification) params.set('classification', filters.classification); if (filters.review) params.set('review', filters.review); const response = await apiFetch(`${API_BASE}/api/admin/promos?${params}`); if (!response.ok) throw new Error(response.status === 403 ? 'Promos is restricted to Admin or Dev access.' : `Unable to load Promos (${response.status}).`); setData(await response.json()); } catch (e) { setError(e.message); } finally { setLoading(false); } }, [user, filters.classification, filters.review]);
  useEffect(() => { load(); const timer = document.visibilityState === 'visible' ? setInterval(load, 45000) : null; return () => timer && clearInterval(timer); }, [load]);
  async function openDetail(item) { try { const response = await apiFetch(`${API_BASE}/api/admin/promos/${encodeURIComponent(item.account)}/${encodeURIComponent(item.shortcode)}`); if (!response.ok) throw new Error(`Unable to load opportunity (${response.status}).`); setSelected(await response.json()); } catch (e) { setError(e.message); } }
  async function scanStoredPosts() { setJobNotice('Starting stored-post scan…'); try { const from = new Date(Date.now() - 30 * 86400000).toISOString(); const response = await apiFetch(`${API_BASE}/api/admin/promos/backfill`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from_date: from, limit: 2000 }) }); if (!response.ok) throw new Error(`Unable to start scan (${response.status}).`); const { job_id: jobId } = await response.json(); setJobNotice('Scanning stored competitor posts…'); const poll = async () => { const statusResponse = await apiFetch(`${API_BASE}/api/admin/promos/jobs/${jobId}`); if (!statusResponse.ok) throw new Error(`Unable to read scan status (${statusResponse.status}).`); const status = await statusResponse.json(); if (status.status === 'done') { setJobNotice(`Scan complete · ${status.processed} posts analyzed.`); await load(); return; } if (status.status === 'failed') throw new Error(status.error || 'Stored-post scan failed.'); setJobNotice(`Scanning stored competitor posts · ${status.processed || 0}/${status.total || '…'}`); window.setTimeout(poll, 1500); }; await poll(); } catch (e) { setJobNotice(''); setError(e.message); } }
  function handleUpdated(next) { setSelected(next.review_status === 'dismissed' || (filters.review && next.review_status !== filters.review) ? null : next); setData(current => ({ ...current, items: current.items.filter(item => item.account !== next.account || item.shortcode !== next.shortcode || !filters.review || filters.review === next.review_status).map(item => item.account === next.account && item.shortcode === next.shortcode ? next : item) })); }
  const items = useMemo(() => data.items.filter(item => !filters.search || `${item.client || ''} ${item.product || ''} ${item.account} ${item.caption || ''}`.toLowerCase().includes(filters.search.toLowerCase())), [data.items, filters.search]);
  if (user === undefined) return <main className="promo-loading">Loading Promos…</main>; if (!user) return <Login error={authError} />;
  const handleSignOut = () => { clearSsoCookie(); signOut(firebaseAuth); };
  const isCoordinator = Boolean(viewer?.is_admin || viewer?.isAdmin || viewer?.is_dev || viewer?.isDev || viewer?.operating_roles?.includes('vc'));
  return <main className="promo-shell"><ProductHeader current="promos" coordinator={isCoordinator} account={<SettingsMenu email={user.email} avatarUrl={user.photoURL || viewer?.avatar_url || viewer?.avatarUrl} isAdmin={Boolean(viewer?.is_admin || viewer?.isAdmin)} isDev={Boolean(viewer?.is_dev || viewer?.isDev)} onSignOut={handleSignOut} />}><h1>Promos</h1><span className="promo-header-subtitle">Paid partnership and promotion signals</span><button className="promo-scan" onClick={scanStoredPosts}>Scan stored posts</button></ProductHeader>{jobNotice && <div className="promo-job">{jobNotice}</div>}<section className="promo-toolbar"><input placeholder="Search client, product, page…" value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} /><select value={filters.classification} onChange={e => setFilters({ ...filters, classification: e.target.value })}><option value="">All signals</option><option value="disclosed">Disclosed</option><option value="likely">Likely</option><option value="needs_review">Needs review</option></select><select value={filters.review} onChange={e => setFilters({ ...filters, review: e.target.value })}><option value="">All reviews</option><option value="new">New</option><option value="reviewed">Reviewed</option><option value="dismissed">Dismissed</option></select><span className="promo-count">{items.length} opportunities</span></section>{error && <div className="promo-alert">{error}<button onClick={load}>Retry</button></div>}{loading && !data.items.length ? <div className="promo-empty">Loading opportunity signals…</div> : items.length ? <section className="promo-grid">{items.map(item => <Card key={`${item.account}:${item.shortcode}`} item={item} onSelect={openDetail} />)}</section> : <div className="promo-empty"><strong>No promotion signals yet.</strong><span>New competitor posts will appear here after ingestion and analysis.</span></div>}{selected && <Detail item={selected} onClose={() => setSelected(null)} onUpdate={handleUpdated} />}</main>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<PrefsProvider><PromosApp /></PrefsProvider>);
