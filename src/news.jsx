import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { apiFetch, API_BASE } from './api';
import { firebaseAuth, startGoogleSignIn, describeSignInError } from './firebase';
import { clearSsoCookie, startSsoRefresh, trySsoSignIn } from './sso';
import ProductHeader from './ProductHeader';
import { SettingsMenu } from './App';
import { PrefsProvider } from './prefsContext';
import './styles.css';
import './news.css';

const NEWS_FEEDS = [
  ['AI General', 'https://rss.app/feeds/v1.1/ow6LmNtmgkH0e876.json'],
  ['Anthropic · Claude', 'https://rss.app/feeds/v1.1/iGJMgVDHBRIPxraA.json'],
  ['OpenAI · ChatGPT', 'https://rss.app/feeds/v1.1/Q48RJR9Y86VLB48k.json'],
  ['Robotics', 'https://rss.app/feeds/v1.1/cUiUbXPU5KD7L6u1.json'],
  ['Technology', 'https://rss.app/feeds/v1.1/tK7d10xMOEoFXoDr.json'],
];
const REDDIT_URL = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://old.reddit.com/user/diligent_run882/m/ai/.rss')}`;
const X_URL = 'https://rss.app/feeds/v1.1/_hL57mgTsWKN2ldbw.json';
const feedCache = new Map();

function Login({ error }) {
  const [busy, setBusy] = useState(false);
  async function login() { setBusy(true); try { const issue = await startGoogleSignIn(); if (issue) window.alert(describeSignInError(issue)); } finally { setBusy(false); } }
  return <main className="news-auth"><section><span className="news-kicker">Sentient Dash · DEV tool</span><h1>News</h1><p>Sign in with your authorized Sentient account to review sourcing candidates.</p><button onClick={login} disabled={busy}>{busy ? 'Signing in…' : 'Sign in with Google'}</button>{error && <p className="news-error">{error}</p>}</section></main>;
}

function normalize(item, label, sourceType) {
  const link = safeHttpUrl(item.url || item.link || item.guid || '');
  const published = item.date_published || item.date_modified || item.pubDate || item.isoDate || item.published || item.date || '';
  const image = item.image || item.thumbnail || item.attachments?.[0]?.url || item.enclosure?.thumbnail || item.enclosure?.link || item.image_url || '';
  const description = item.content_text || item.description || item.content || item.summary || item.content_html || '';
  const source = item.authors?.[0]?.name || item.author || item.creator || label;
  return { id: item.id || item.guid || link || `${label}:${item.title}`, title: decodeEntities(item.title || 'Untitled story'), description, link, image: safeHttpUrl(image), published, source, sourceType, author: item.author || item.authors?.[0]?.name || '', raw: item };
}

function safeHttpUrl(value) {
  try { const url = new URL(String(value || '')); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}

function decodeEntities(value) {
  const element = document.createElement('textarea'); element.innerHTML = String(value || ''); return element.value;
}

async function loadFeed(label, url, sourceType) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${label} returned ${response.status}`);
  const payload = await response.json();
  if (payload?.status === 'error' || payload?.success === false) throw new Error(payload.message || `${label} feed reported an error`);
  let items = Array.isArray(payload) ? payload : payload.items || payload.data?.items || payload.data || [];
  if (!Array.isArray(items) && Array.isArray(items.items)) items = items.items;
  if (!Array.isArray(items)) throw new Error(`${label} returned an invalid feed payload`);
  const normalized = items.map(item => normalize(item, label, sourceType)).filter(item => item.title && item.link);
  if (!normalized.length && items.length) throw new Error(`${label} contained no usable stories`);
  return normalized;
}

function stripHtml(value) { const element = document.createElement('div'); element.innerHTML = String(value || ''); element.querySelectorAll('script,style').forEach(node => node.remove()); return (element.textContent || element.innerText || '').replace(/\s+/g, ' ').trim(); }
const ANGLES = {
 practical_guide: 'Show a concrete workflow: who it helps, what they need, the steps, and the result. Verify each step in the original source.',
 comparison: 'Compare the supported capabilities side by side. Explain who should choose each option; verify costs and limitations.',
 what_changes: 'Explain what changed, who can use it, and one practical consequence. Separate the announcement from your own analysis.',
 visual_explainer: 'Explain the mechanism visually: the problem, how it works, and why it matters. Find original or licensed visuals.',
 needs_reporting: 'Read the original source and gather specific evidence before writing. The excerpt alone is insufficient.',
};
function discoveryPriority(item) { const text = `${item.title} ${stripHtml(item.description)}`.toLowerCase(); const relevant = /artificial intelligence|\bai\b|chatgpt|openai|claude|anthropic|robot|llm|machine learning/.test(text); const actionable = /how to|open.source|available|launch|release|free|tool|guide|workflow|tutorial|run locally/.test(text); return (relevant ? 10 : 0) + (actionable ? 3 : 0) + Math.min(stripHtml(item.description).length / 1000, 1); }
function dateLabel(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date); }

function ReviewBadge({ review }) {
  if (!review) return null;
  const golden = review.label === 'golden_nugget' || review.label === 'gold';
  const potential = review.label === 'potential' || review.label === 'promising';
  return <span className={`news-review-badge ${golden ? 'gold' : potential ? 'promising' : 'not-yet'}`}>{golden ? 'Golden nugget' : potential ? 'Potential' : 'Not a fit yet'} · {Math.round((review.score || 0) * 100)}%</span>;
}

function StoryCard({ item, review, onReview, busy, locked, saved, onSave, onBrief, failure }) {
  const human = value => value.replaceAll('_', ' ');
  return <article className={`news-card ${review?.label === 'golden_nugget' ? 'is-golden' : ''}`}>
    {item.image && <img src={item.image} alt="" loading="lazy" onError={event => { event.currentTarget.hidden = true; }} />}
    <div className="news-card-body"><div className="news-card-meta"><span>{item.sourceType.toUpperCase()} · {item.source}</span><span>{dateLabel(item.published)}</span></div><h2>{item.title}</h2><p>{stripHtml(item.description).slice(0, 300) || 'No excerpt available. Open the source to check its evidence.'}</p>
      <div className="news-card-actions"><ReviewBadge review={review} /><button disabled={busy || locked} onClick={() => onReview(item)}>{busy ? 'Reviewing…' : review ? 'Review again' : 'Review with JEV'}</button><button aria-pressed={saved} onClick={onSave}>{saved ? '★ Saved' : '☆ Save idea'}</button><button onClick={onBrief}>Create post brief</button><a href={item.link} target="_blank" rel="noreferrer">Read source ↗</a></div>
      {failure && <p role="status" className="news-error">Review failed: {failure}</p>}
      {review && <details className="news-evidence"><summary>{review.targetAccount ? `Suggested account: @${review.targetAccount}` : 'No account fit identified'} · See reasoning</summary><p>{ANGLES[review.editorialAngle] || ''} {review.postFormat && `Suggested format: ${human(review.postFormat)}.`}</p><p>Strongest: {(review.strengths || []).map(human).join(', ')}. Needs work: {(review.weaknesses || []).map(human).join(', ')}.</p><div className="news-dimensions">{Object.entries(review.dimensions || {}).map(([key, value]) => <label key={key}>{human(key)}<meter min="0" max="1" value={value.score} />{Math.round(value.score * 100)}%</label>)}</div><p>Based on {review.evidenceSource === 'article' ? 'extracted article text' : 'the feed excerpt'}. Compared with {review.existingCandidates?.length || 0} related stored posts; this is not a complete history check. Verify claims in the original source before publishing.</p></details>}
    </div></article>;
}

function NewsApp() {
  const [user, setUser] = useState(undefined); const [viewer, setViewer] = useState(null); const [authError, setAuthError] = useState(''); const [items, setItems] = useState([]); const [reviews, setReviews] = useState({}); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [feedErrors, setFeedErrors] = useState([]); const [reviewing, setReviewing] = useState('');
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('all'); const [saved, setSaved] = useState({}); const [failures, setFailures] = useState({}); const [scanning, setScanning] = useState(false); const [progress, setProgress] = useState({done:0,total:0}); const stopScan = useRef(false); const busyRef = useRef(false); const [brief, setBrief] = useState(null); const briefRef = useRef(null);
  useEffect(() => { if (brief) briefRef.current?.scrollIntoView({behavior:'smooth',block:'start'}); }, [brief?.item.id]); const [storageReady, setStorageReady] = useState(false);
  useEffect(() => { if (!user?.uid) return; setStorageReady(false); try { const data = JSON.parse(localStorage.getItem(`news-v4:${user.uid}`) || JSON.stringify({saved:JSON.parse(localStorage.getItem(`news-v3:${user.uid}`) || '{}').saved || {}})); setSaved(data.saved || {}); setReviews(Object.fromEntries(Object.entries(data.reviews || {}).filter(([,r]) => Date.now() - r.reviewedAt < 86400000))); } catch {} setStorageReady(user.uid); return () => { stopScan.current = true; }; }, [user?.uid]);
  useEffect(() => { if (storageReady !== user?.uid || !user?.uid) return; try { localStorage.setItem(`news-v4:${user.uid}`, JSON.stringify({saved,reviews})); } catch { setError('Browser storage is full. Saved ideas may not survive a reload.'); } }, [saved,reviews,storageReady,user?.uid]);
  function makeBrief(item) { const r = reviews[item.id]; setBrief({item,text: saved[item.id]?.brief || `WORKING POST BRIEF\n\nTitle: ${item.title}\nAccount: ${r?.targetAccount || 'Choose an account'}\nFormat: ${(r?.postFormat || 'Choose after reviewing').replaceAll('_',' ')}\n\nSource evidence:\n${r?.evidenceText || stripHtml(item.description)}\n\nOriginal angle:\n${ANGLES[r?.editorialAngle] || 'Review with JEV to select a source-supported angle, then explain what changes for the reader.'}\n\nSuggested structure:\n1. Hook: what changed and why it matters.\n2. Explain the supported facts.\n3. Show a practical example or comparison.\n4. Give the reader one useful takeaway.\n\nBefore publishing: verify dates, numbers, availability and claims in the source. Add original analysis; do not copy source wording.\n\nSource: ${item.link}`}); }

  useEffect(() => { trySsoSignIn().catch(() => {}); return onAuthStateChanged(firebaseAuth, value => { setUser(value || null); setViewer(null); }); }, []);
  useEffect(() => user ? startSsoRefresh() : undefined, [user]);
  const load = useCallback(async () => { if (!user) return; setLoading(true); setError(''); const feeds = [...NEWS_FEEDS.map(([label, url]) => [label, url, 'news']), ['Reddit · AI', REDDIT_URL, 'reddit'], ['X · AI', X_URL, 'x']]; const results = await Promise.allSettled(feeds.map(([label, url, kind]) => loadFeed(label, url, kind))); const next = []; const failures = []; results.forEach((result, index) => { const [label, url, kind] = feeds[index]; const key = `${kind}:${url}`; if (result.status === 'fulfilled') { feedCache.set(key, result.value); next.push(...result.value); } else { const cached = feedCache.get(key); if (cached?.length) next.push(...cached); failures.push(`${label}: ${result.reason?.message || 'feed unavailable'}${cached?.length ? ' (showing cached results)' : ''}`); } }); next.sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0)); if (next.length) { const seen = new Set(); setItems(next.filter(item => { const url = new URL(item.link); [...url.searchParams.keys()].filter(k => /^(utm_|fbclid|gclid)/i.test(k)).forEach(k => url.searchParams.delete(k)); url.hash = ''; item.id = url.href; const title = item.title.toLowerCase().replace(/[^a-z0-9]/g, ''); if (seen.has(item.id) || seen.has(title)) return false; seen.add(item.id); seen.add(title); return true; })); } setFeedErrors(failures); if (!next.length) setError(failures.length ? `No sourcing feeds responded. ${failures.join(' · ')}` : 'No sourcing candidates were returned.'); else if (failures.length) setError(`${failures.length} feed${failures.length === 1 ? '' : 's'} unavailable; showing results from available and cached feeds.`); setLoading(false); }, [user]);
  useEffect(() => { if (!user) return undefined; let active = true; apiFetch(`${API_BASE}/api/dashboard/me`).then(async response => { if (!response.ok) { let detail = ''; try { detail = (await response.json()).detail || ''; } catch {} throw new Error(detail || `Access check returned ${response.status}`); } return response.json(); }).then(data => { if (active) setViewer(data); }).catch(reason => { if (active) setViewer({ accessError: reason.message || 'Unable to verify access with Cortex.' }); }); return () => { active = false; }; }, [user]);
  useEffect(() => { if (user && (viewer?.is_dev || viewer?.isDev)) load(); }, [user, viewer, load]);
  async function review(item) { if (busyRef.current) return false; busyRef.current = true; setReviewing(item.id); setError(''); try { const response = await apiFetch(`${API_BASE}/api/dashboard/jev/news-review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceType: item.sourceType, headline: item.title, description: stripHtml(item.description).slice(0, 8000), source: item.source, author: item.author, url: item.link, published: item.published, image: item.image }) }); if (!response.ok) { let detail = ''; try { const body = await response.json(); detail = body.detail?.message || body.detail || ''; } catch {} throw new Error(response.status === 403 ? 'News JEV is DEV-only.' : detail || `JEV returned ${response.status}`); } const result = await response.json(); setReviews(current => ({ ...current, [item.id]: {...result, reviewedAt:Date.now()} })); setFailures(current => ({...current, [item.id]:null})); return true; } catch (e) { setFailures(current => ({...current, [item.id]:e.message})); setError(e.message); return false; } finally { busyRef.current = false; setReviewing(''); } }
  const candidates = useMemo(() => { const merged = new Map(items.map(item => [item.id,item])); Object.values(saved).forEach(value => { if (value.item && !merged.has(value.item.id)) merged.set(value.item.id,value.item); }); return [...merged.values()]; }, [items,saved]);
  const ranked = useMemo(() => candidates.filter(item => (!query || `${item.title} ${stripHtml(item.description)} ${item.source}`.toLowerCase().includes(query.toLowerCase())) && (filter === 'all' || (filter === 'saved' ? saved[item.id] : filter === 'unreviewed' ? !reviews[item.id] : filter === 'potential' ? ['potential','promising'].includes(reviews[item.id]?.label) : reviews[item.id]?.label === filter))).sort((a,b) => ({golden_nugget:3,potential:2,promising:2,not_yet:1}[reviews[b.id]?.label] || 0) - ({golden_nugget:3,potential:2,promising:2,not_yet:1}[reviews[a.id]?.label] || 0) || (reviews[b.id]?.score ?? -1) - (reviews[a.id]?.score ?? -1) || (Date.parse(b.published)||0) - (Date.parse(a.published)||0)), [candidates,reviews,saved,query,filter]);
  async function reviewTop() { if (scanning || busyRef.current) return; const pending = ranked.filter(item => !reviews[item.id]).sort((a,b) => discoveryPriority(b) - discoveryPriority(a)).slice(0,25); stopScan.current = false; setScanning(true); setProgress({done:0,total:pending.length}); let consecutiveErrors = 0; try { for (const item of pending) { if (stopScan.current) break; const ok = await review(item); consecutiveErrors = ok ? 0 : consecutiveErrors + 1; setProgress(p => ({...p,done:p.done+1})); if (consecutiveErrors >= 3) { setError('Scan paused after three failed reviews. Retry when the service is available; completed reviews are saved.'); break; } } } finally { setScanning(false); } }
  if (user === undefined) return <main className="news-loading">Loading News…</main>; if (!user) return <Login error={authError} />;
  const isDev = Boolean(viewer?.is_dev || viewer?.isDev); const handleSignOut = () => { clearSsoCookie(); signOut(firebaseAuth); };
  if (viewer?.accessError) return <main className="news-auth"><section><span className="news-kicker">Sentient Dash · DEV tool</span><h1>News</h1><p>News could not verify your DEV access: {viewer.accessError}</p><button onClick={() => { setViewer(null); apiFetch(`${API_BASE}/api/dashboard/me`).then(async response => { if (!response.ok) throw new Error(`Access check returned ${response.status}`); return response.json(); }).then(setViewer).catch(reason => setViewer({ accessError: reason.message })); }}>Retry access check</button></section></main>;
  if (viewer && !isDev) return <main className="news-auth"><section><span className="news-kicker">Sentient Dash · DEV tool</span><h1>News</h1><p>This tool is only available to DEV.</p></section></main>;
  const goldenCount = Object.values(reviews).filter(review => ['golden_nugget','gold'].includes(review.label)).length;
  const potentialCount = Object.values(reviews).filter(review => ['potential','promising'].includes(review.label)).length;
  return <main className="news-shell"><ProductHeader current="news" coordinator isDev account={<SettingsMenu email={user.email} avatarUrl={user.photoURL || viewer?.avatar_url} isAdmin={Boolean(viewer?.is_admin)} isDev onSignOut={handleSignOut} />}><h1>News</h1><span className="news-header-subtitle">Find → review → save → create</span><button className="news-refresh" onClick={load} disabled={loading}>Refresh feeds</button><button className="news-review-all" onClick={reviewTop} disabled={!items.length || scanning || Boolean(reviewing)}>Find nuggets · next 25</button></ProductHeader><section className="news-intro"><div><span className="news-kicker">DEV · sourcing lab</span><h1>Find the next post before everyone else.</h1><p>Golden requires 72% overall, a strong Jev signal, four strong signals, and no weak core dimension. Potential starts at 56% with evidence and at least two strong signals. Both tiers are based on Jev’s judgments.</p></div><div className="news-metric"><strong>{items.length}</strong><span>candidates loaded</span></div><div className="news-metric gold"><strong>{goldenCount}</strong><span>golden nuggets</span></div><div className="news-metric potential"><strong>{potentialCount}</strong><span>potential ideas</span></div></section>{error && <div className="news-alert" role="status">{error}</div>}{feedErrors.length > 0 && <details className="news-feed-errors"><summary>Feed details ({feedErrors.length})</summary><ul>{feedErrors.map(message => <li key={message}>{message}</li>)}</ul></details>}<section className="news-controls"><label>Search stories<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Topic, tool, publisher…" /></label><label>Show<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All · best reviewed first</option><option value="golden_nugget">Golden nuggets</option><option value="potential">Potential</option><option value="saved">Saved ideas</option><option value="unreviewed">Not reviewed</option></select></label><span aria-live="polite">{candidates.filter(i => reviews[i.id]).length}/{candidates.length} reviewed · {ranked.length} shown{progress.total > 0 && ` · Scan ${progress.done}/${progress.total}`}</span>{scanning && <button onClick={() => { stopScan.current = true; }}>Stop after current review</button>}</section>
      {brief && <section ref={briefRef} className="news-brief"><h2>Create an original post</h2><p>Edit the angle and evidence before handing this to production.</p><textarea aria-label="Post brief" value={brief.text} onChange={e => setBrief({...brief,text:e.target.value})} /><div className="news-card-actions"><button onClick={() => { setSaved(current => ({...current,[brief.item.id]:{item:brief.item,brief:brief.text}})); setError('Post brief saved in this browser.'); }}>Save brief</button><button onClick={async () => { try { await navigator.clipboard.writeText(brief.text); setError('Brief copied.'); } catch { setError('Copy failed. Select the brief text and copy it manually.'); } }}>Copy brief</button><button onClick={() => setBrief(null)}>Close</button></div></section>}
      <div className="news-results">{ranked.map(item => <StoryCard key={item.id} item={item} review={reviews[item.id]} busy={reviewing === item.id} locked={scanning || Boolean(reviewing)} onReview={review} failure={failures[item.id]} saved={Boolean(saved[item.id])} onSave={() => setSaved(current => { const next = {...current}; if (next[item.id]) delete next[item.id]; else next[item.id] = {item}; return next; })} onBrief={() => makeBrief(item)} />)}{!ranked.length && <p className="news-empty">No stories in this view. Try All, clear the search, or review more candidates. Unreviewed stories are not rejected stories.</p>}</div>{loading && <div className="news-loading-note">Refreshing RSS feeds…</div>}{!loading && !items.length && <button className="news-load-first" onClick={load}>Load sourcing feeds</button>}</main>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<PrefsProvider><NewsApp /></PrefsProvider>);
