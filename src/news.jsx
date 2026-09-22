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

function Login({ error }) {
  const [busy, setBusy] = useState(false);
  async function login() { setBusy(true); try { const issue = await startGoogleSignIn(); if (issue) window.alert(describeSignInError(issue)); } finally { setBusy(false); } }
  return <main className="news-auth"><section><span className="news-kicker">Sentient Dash · DEV tool</span><h1>News</h1><p>Sign in with your authorized Sentient account to review sourcing candidates.</p><button onClick={login} disabled={busy}>{busy ? 'Signing in…' : 'Sign in with Google'}</button>{error && <p className="news-error">{error}</p>}</section></main>;
}

function normalize(item, label, sourceType) {
  return { id: item.guid || item.link || item.url || `${label}:${item.title}`, title: item.title || 'Untitled story', description: item.description || item.content || '', link: item.link || item.url || '', image: item.thumbnail || item.enclosure?.link || item.image || '', published: item.pubDate || item.isoDate || item.date || '', source: label, sourceType };
}

async function loadFeed(label, url, sourceType) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label} returned ${response.status}`);
  const payload = await response.json();
  const items = Array.isArray(payload) ? payload : payload.items || payload.data?.items || payload.data || [];
  return items.map(item => normalize(item, label, sourceType));
}

function stripHtml(value) { return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function dateLabel(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date); }

function ReviewBadge({ review }) {
  if (!review) return null;
  const golden = review.label === 'golden_nugget' || review.label === 'gold';
  return <span className={`news-review-badge ${golden ? 'gold' : 'promising'}`}>{golden ? 'Golden nugget' : 'Promising'} · {Math.round((review.score || 0) * 100)}%</span>;
}

function StoryCard({ item, review, onReview, busy }) {
  return <article className={`news-card ${review?.label === 'golden_nugget' || review?.label === 'gold' ? 'is-golden' : ''}`}>
    {item.image ? <img src={item.image} alt="" loading="lazy" onError={event => { event.currentTarget.hidden = true; }} /> : <div className="news-card-image">{item.sourceType === 'x' ? '𝕏' : item.sourceType === 'reddit' ? '●' : '✦'}</div>}
    <div className="news-card-body"><div className="news-card-meta"><span>{item.source}</span><span>{dateLabel(item.published)}</span></div><h2>{item.title}</h2><p>{stripHtml(item.description).slice(0, 220) || 'No excerpt available.'}</p><div className="news-card-actions"><ReviewBadge review={review} /><button disabled={busy} onClick={() => onReview(item)}>{busy ? 'Reviewing…' : review ? 'Refresh JEV' : 'Review with JEV'}</button>{item.link && <a href={item.link} target="_blank" rel="noreferrer">Open ↗</a>}</div></div>
  </article>;
}

function FeedColumn({ title, items, reviews, onReview, reviewing }) {
  return <section className="news-column"><div className="news-section-heading"><h2>{title}</h2><span>{items.length}</span></div>{items.length ? items.map(item => <StoryCard key={item.id} item={item} review={reviews[item.id]} onReview={onReview} busy={reviewing === item.id} />) : <p className="news-empty">No stories loaded.</p>}</section>;
}

function NewsApp() {
  const [user, setUser] = useState(undefined); const [viewer, setViewer] = useState(null); const [authError, setAuthError] = useState(''); const [items, setItems] = useState([]); const [reviews, setReviews] = useState({}); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [reviewing, setReviewing] = useState('');
  useEffect(() => { trySsoSignIn().catch(() => {}); return onAuthStateChanged(firebaseAuth, value => { setUser(value || null); setViewer(null); }); }, []);
  useEffect(() => user ? startSsoRefresh() : undefined, [user]);
  const load = useCallback(async () => { if (!user) return; setLoading(true); setError(''); try { const groups = await Promise.all([...NEWS_FEEDS.map(([label, url]) => loadFeed(label, url, 'news')), loadFeed('Reddit · AI', REDDIT_URL, 'reddit'), loadFeed('X · AI', X_URL, 'x')]); const next = groups.flat().filter(item => item.title).sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0)); setItems(next); } catch (e) { setError(`Unable to load sourcing feeds: ${e.message}`); } finally { setLoading(false); } }, [user]);
  useEffect(() => { if (!user) return undefined; apiFetch(`${API_BASE}/api/dashboard/me`).then(async response => { if (!response.ok) throw new Error('Unable to verify account access.'); return response.json(); }).then(setViewer).catch(() => setViewer({})); }, [user]);
  useEffect(() => { if (user && (viewer?.is_dev || viewer?.isDev)) load(); }, [user, viewer, load]);
  async function review(item) { setReviewing(item.id); setError(''); try { const response = await apiFetch(`${API_BASE}/api/dashboard/jev/news-review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceType: item.sourceType, headline: item.title, description: stripHtml(item.description), source: item.source }) }); if (!response.ok) throw new Error(response.status === 403 ? 'News JEV is DEV-only.' : `JEV returned ${response.status}`); const result = await response.json(); setReviews(current => ({ ...current, [item.id]: result })); } catch (e) { setError(e.message); } finally { setReviewing(''); } }
  async function reviewTop() { for (const item of items.slice(0, 18)) await review(item); }
  const news = useMemo(() => items.filter(item => item.sourceType === 'news'), [items]); const reddit = useMemo(() => items.filter(item => item.sourceType === 'reddit').slice(0, 12), [items]); const x = useMemo(() => items.filter(item => item.sourceType === 'x').slice(0, 12), [items]);
  if (user === undefined) return <main className="news-loading">Loading News…</main>; if (!user) return <Login error={authError} />;
  const isDev = Boolean(viewer?.is_dev || viewer?.isDev); const handleSignOut = () => { clearSsoCookie(); signOut(firebaseAuth); };
  if (viewer && !isDev) return <main className="news-auth"><section><span className="news-kicker">Sentient Dash · DEV tool</span><h1>News</h1><p>This tool is only available to DEV.</p></section></main>;
  return <main className="news-shell"><ProductHeader current="news" coordinator isDev account={<SettingsMenu email={user.email} avatarUrl={user.photoURL || viewer?.avatar_url} isAdmin={Boolean(viewer?.is_admin)} isDev onSignOut={handleSignOut} />}><h1>News</h1><span className="news-header-subtitle">RSS sourcing · Reddit · X · JEV prospect review</span><button className="news-refresh" onClick={load}>Refresh feeds</button><button className="news-review-all" onClick={reviewTop} disabled={!items.length || Boolean(reviewing)}>Review top candidates</button></ProductHeader><section className="news-intro"><div><span className="news-kicker">DEV · sourcing lab</span><h1>Find the next post before everyone else.</h1><p>Stories from Schedulr’s News sourcing flow, scored against stored dashboard posts so novelty can raise a real golden nugget.</p></div><div className="news-metric"><strong>{items.length}</strong><span>candidates loaded</span></div><div className="news-metric gold"><strong>{Object.values(reviews).filter(review => review.label === 'golden_nugget' || review.label === 'gold').length}</strong><span>golden nuggets</span></div></section>{error && <div className="news-alert">{error}</div>}<div className="news-layout"><FeedColumn title="News" items={news} reviews={reviews} onReview={review} reviewing={reviewing} /><aside className="news-sidebar"><FeedColumn title="Reddit" items={reddit} reviews={reviews} onReview={review} reviewing={reviewing} /><FeedColumn title="X" items={x} reviews={reviews} onReview={review} reviewing={reviewing} /></aside></div>{loading && <div className="news-loading-note">Refreshing RSS feeds…</div>}{!loading && !items.length && <button className="news-load-first" onClick={load}>Load sourcing feeds</button>}</main>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<PrefsProvider><NewsApp /></PrefsProvider>);
