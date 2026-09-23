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

const REVIEW_VERSION = 'news-story-discovery-v2';
const NEWS_FEEDS = [
  { id: '1FY0ugZC3knghvvL', label: 'AI fraud & warnings', group: 'AI SAFETY', type: 'news' },
  { id: 'Zyy4J7XWhoLMzBmL', label: 'AI risk & policy', group: 'AI SAFETY', type: 'news' },
  { id: 'JMbNxa8xGDcmpSTc', label: 'AI safety reporting', group: 'AI SAFETY', type: 'news' },
  { id: 'gP8DNYC9zVn4dekp', label: 'X · NIK', group: 'X', type: 'x' },
  { id: 'YLbs1Dc5bqIt8lbu', label: 'X · ChatGPT', group: 'X', type: 'x', socialSignal: 'This RSS.app search uses a filter of at least 250 likes and 15 replies. It is a feed eligibility rule, not a verified metric included with this individual post.' },
  { id: 'MImFpPWSCXpWseSP', label: 'X · AI & robotics', group: 'X', type: 'x', socialSignal: 'This RSS.app search uses a filter of at least 300 likes and 20 replies. It is a feed eligibility rule, not a verified metric included with this individual post.' },
  { id: 'tK7d10xMOEoFXoDr', label: 'Technology', group: 'All', type: 'news' },
  { id: 'iGJMgVDHBRIPxraA', label: 'Claude · Anthropic', group: 'Ticker', type: 'news' },
  { id: 'Q48RJR9Y86VLB48k', label: 'OpenAI · ChatGPT', group: 'Ticker', type: 'news' },
  { id: 'cUiUbXPU5KD7L6u1', label: 'Robots & robotics', group: 'Ticker', type: 'news' },
  { id: 'ow6LmNtmgkH0e876', label: 'Artificial intelligence', group: 'Ticker', type: 'news' },
].map(feed => ({ ...feed, url: `https://rss.app/feeds/v1.1/${feed.id}.json` }));
const feedCache = new Map();
const ANGLES = {
  practical_guide: 'Turn the confirmed idea into a short workflow someone can try.',
  comparison: 'Show the supported differences and explain when each one matters.',
  what_changes: 'Explain what changed and the practical consequence for the audience.',
  visual_explainer: 'Show the mechanism or surprising detail with a simple visual.',
  needs_reporting: 'Get more evidence from the original source before drafting.',
};
const STOP_WORDS = new Set('about after also been from have into just more news that their this with will what when where which while your says said how why new latest their says'.split(' '));

function Login({ error }) {
  const [busy, setBusy] = useState(false);
  async function login() { setBusy(true); try { const issue = await startGoogleSignIn(); if (issue) window.alert(describeSignInError(issue)); } finally { setBusy(false); } }
  return <main className="news-auth"><section><span className="news-kicker">Sentient Dash · DEV tool</span><h1>News</h1><p>Sign in with your authorized Sentient account to review story ideas.</p><button onClick={login} disabled={busy}>{busy ? 'Signing in…' : 'Sign in with Google'}</button>{error && <p className="news-error">{error}</p>}</section></main>;
}

function safeHttpUrl(value) {
  try { const url = new URL(String(value || '')); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
function decodeEntities(value) { const element = document.createElement('textarea'); element.innerHTML = String(value || ''); return element.value; }
function stripHtml(value) { const element = document.createElement('div'); element.innerHTML = String(value || ''); element.querySelectorAll('script,style').forEach(node => node.remove()); return (element.textContent || element.innerText || '').replace(/\s+/g, ' ').trim(); }
function canonicalUrl(value) {
  try { const url = new URL(value); [...url.searchParams.keys()].filter(key => /^(utm_|fbclid|gclid)/i.test(key)).forEach(key => url.searchParams.delete(key)); url.hash = ''; url.pathname = url.pathname.replace(/\/+$/, '') || '/'; return url.href; } catch { return value; }
}
function normalize(item, feed) {
  const link = safeHttpUrl(item.url || item.link || item.guid || '');
  const published = item.date_published || item.date_modified || item.pubDate || item.isoDate || item.published || item.date || '';
  const image = safeHttpUrl(item.image || item.thumbnail || item.attachments?.[0]?.url || item.enclosure?.thumbnail || item.enclosure?.link || item.image_url || '');
  const description = item.content_text || item.description || item.content || item.summary || item.content_html || '';
  const author = item.authors?.[0]?.name || item.author || item.creator || '';
  let publisher = feed.label;
  try { publisher = new URL(link).hostname.replace(/^www\./, ''); } catch {}
  return { id: canonicalUrl(link), title: decodeEntities(item.title || 'Untitled story'), description, link, image, published, source: author || feed.label, publisher, author, sourceType: feed.type, feedLabel: feed.label, feedGroup: feed.group, socialSignal: feed.socialSignal || '', raw: item };
}
async function loadFeed(feed) {
  const response = await fetch(feed.url, { signal: AbortSignal.timeout(18000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`RSS.app returned ${response.status}`);
  const payload = await response.json();
  if (payload?.status === 'error' || payload?.success === false) throw new Error(payload.message || 'RSS.app reported an error');
  let rows = Array.isArray(payload) ? payload : payload.items || payload.data?.items || payload.data || [];
  if (!Array.isArray(rows) && Array.isArray(rows.items)) rows = rows.items;
  if (!Array.isArray(rows)) throw new Error('Invalid feed response');
  const stories = rows.map(item => normalize(item, feed)).filter(item => item.title && item.link);
  if (!stories.length && rows.length) throw new Error('Feed contained no usable stories');
  return stories;
}
function titleTokens(title) { return new Set(String(title || '').toLowerCase().match(/[a-z0-9]{3,}/g)?.filter(token => !STOP_WORDS.has(token)) || []); }
function sameStory(left, right) {
  if (left.id === right.id) return true;
  const a = titleTokens(left.title); const b = titleTokens(right.title);
  if (Math.min(a.size, b.size) < 3) return false;
  let shared = 0; a.forEach(token => { if (b.has(token)) shared += 1; });
  return shared / Math.min(a.size, b.size) >= 0.78;
}
function storyClusters(stories) {
  const groups = [];
  for (const story of stories) {
    const group = groups.find(candidate => candidate.stories.some(existing => sameStory(existing, story)));
    if (group) group.stories.push(story); else groups.push({ stories: [story] });
  }
  return groups.map(({ stories: group }) => {
    group.sort((a,b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0));
    const primary = group[0];
    const relatedStories = [...group.slice(1), ...(primary.relatedStories || [])].map(item => ({ title: item.title, description: stripHtml(item.description).slice(0, 500), source: item.source, publisher: item.publisher, feedLabel: item.feedLabel, link: item.link }));
    const feeds = [...new Set([...group.map(item => item.feedLabel), ...(primary.duplicateCoverage || []).map(item => item.feedLabel)])];
    const publishers = [...new Set([...group.map(item => item.publisher), ...(primary.duplicateCoverage || []).map(item => item.publisher)])];
    return { ...primary, relatedStories, coverageCount: publishers.length, coverageFeeds: feeds, publishers, searchText: group.map(item => `${item.title} ${stripHtml(item.description)} ${item.source} ${item.feedLabel}`).join(' ') };
  }).sort((a,b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0));
}
function dateLabel(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date); }
function relativeAge(value) { const age = Date.now() - Date.parse(value); if (!Number.isFinite(age) || age < 0) return ''; const hours = Math.floor(age / 3600000); return hours < 1 ? 'Just now' : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`; }
function normalizeCachedReview(review) {
  if (!review || review.reviewVersion !== REVIEW_VERSION) return null;
  return review;
}
function discoveryPriority(item) {
  const text = `${item.title} ${stripHtml(item.description)}`.toLowerCase();
  const relevant = /artificial intelligence|\bai\b|chatgpt|openai|claude|anthropic|robot|llm|machine learning/.test(text);
  const publishedAt = Date.parse(item.published || '');
  const recent = Number.isFinite(publishedAt) ? Math.max(0, Math.min(1, 1 - (Date.now() - publishedAt) / (72 * 3600000))) : 0;
  const richEvidence = Math.min(stripHtml(item.description).length / 700, 1);
  const discussionSignal = item.socialSignal ? 0.35 : 0;
  const coverage = Math.min((item.coverageCount || 1) / 4, 1) * 0.3;
  return (relevant ? 0.8 : 0) + recent * 0.7 + richEvidence * 0.35 + discussionSignal + coverage;
}
function human(value) { return String(value || '').replaceAll('_', ' '); }

function ReviewBadge({ review }) {
  if (!review) return null;
  const golden = review.label === 'golden_nugget' || review.label === 'gold';
  const potential = review.label === 'potential' || review.label === 'promising';
  return <span className={`news-review-badge ${golden ? 'gold' : potential ? 'promising' : 'not-yet'}`}>{golden ? 'Golden nugget' : potential ? 'Potential' : 'Explore later'} · {Math.round((review.score || 0) * 100)}%</span>;
}

function StoryCard({ item, review, onReview, busy, locked, saved, onSave, onBrief, failure }) {
  const dimensions = review?.dimensions || {};
  const mainSignals = [['Viral potential', review?.viralPotential ?? dimensions.viral_potential?.score], ['Story freshness', dimensions.timeliness?.score], ['Evidence', review?.evidenceQuality ?? dimensions.evidence_quality?.score]];
  return <article className={`news-story ${review?.label === 'golden_nugget' ? 'is-golden' : review?.label === 'potential' ? 'is-potential' : ''}`}>
    {item.image ? <img className="news-story-image" src={item.image} alt="" loading="lazy" onError={event => { event.currentTarget.hidden = true; }} /> : <div className="news-story-image news-no-image" aria-hidden="true">✳</div>}
    <div className="news-story-content">
      <div className="news-story-meta"><span className="news-source-pill">{item.sourceType === 'x' ? 'X' : 'NEWS'} · {item.source}</span><span>{relativeAge(item.published)}{item.published && ` · ${dateLabel(item.published)}`}</span></div>
      <h2>{item.title}</h2>
      <p className="news-story-excerpt">{stripHtml(item.description).slice(0, 420) || 'The feed has no excerpt. Read the original source before developing this story.'}</p>
      <div className="news-story-tags"><span>{item.feedLabel}</span>{item.coverageCount > 1 && <span className="news-coverage">Seen across {item.coverageCount} source sites · {item.coverageFeeds.length} feeds</span>}{item.socialSignal && <span className="news-social-hint">Filtered X discussion</span>}</div>
      {review && <div className="news-signal-grid">{mainSignals.filter(([,value]) => value != null).map(([label,value]) => <div className="news-signal" key={label}><span>{label}</span><strong>{Math.round(value * 100)}%</strong><meter min="0" max="1" value={value} /></div>)}</div>}
      <div className="news-story-actions"><ReviewBadge review={review} /><button className="news-primary-action" disabled={busy || locked} onClick={() => onReview(item)}>{busy ? 'Reviewing…' : review ? 'Review with JEV again' : 'Assess with JEV'}</button><button aria-pressed={saved} onClick={onSave}>{saved ? '★ Saved' : '☆ Save'}</button><button onClick={onBrief}>Make post brief</button><a href={item.link} target="_blank" rel="noreferrer">Original ↗</a></div>
      {failure && <p role="status" className="news-error">Review failed: {failure}</p>}
      {review?.strengths?.length > 0 && <details className="news-review-details"><summary>Why JEV ranked this story</summary><p><strong>Strongest signals:</strong> {review.strengths.slice(0, 4).map(human).join(' · ')}. {review.weaknesses?.length ? <><strong>Needs work:</strong> {review.weaknesses.map(human).join(' · ')}.</> : null}</p>{review.editorialAngle && <p><strong>Post angle:</strong> {ANGLES[review.editorialAngle] || human(review.editorialAngle)} {review.postFormat && `Best format: ${human(review.postFormat)}.`}</p>}{review.targetAccount && <p><strong>Optional account fit:</strong> @{review.targetAccount}</p>}<p>Evidence: {review.evidenceSource === 'article' ? 'article text extracted from the publisher' : 'RSS excerpt only'}. Viral potential is an editorial estimate, not a promise of reach or a verified engagement count.</p></details>}
      {item.relatedStories?.length > 0 && <details className="news-review-details"><summary>Other coverage ({item.relatedStories.length})</summary><ul>{item.relatedStories.map((source,index) => <li key={`${source.link}-${index}`}><a href={source.link} target="_blank" rel="noreferrer">{source.title} · {source.source} ↗</a></li>)}</ul></details>}
    </div>
  </article>;
}

function NewsApp() {
  const [user, setUser] = useState(undefined); const [viewer, setViewer] = useState(null); const [authError] = useState(''); const [items, setItems] = useState([]); const [reviews, setReviews] = useState({}); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [feedStatuses, setFeedStatuses] = useState([]); const [reviewing, setReviewing] = useState('');
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('best'); const [feedFilter, setFeedFilter] = useState('all'); const [saved, setSaved] = useState({}); const [failures, setFailures] = useState({}); const [scanning, setScanning] = useState(false); const [progress, setProgress] = useState({ done: 0, total: 0 }); const stopScan = useRef(false); const busyRef = useRef(false); const loadingRef = useRef(false); const [brief, setBrief] = useState(null); const [storageReady, setStorageReady] = useState(false);
  useEffect(() => { if (brief) document.getElementById('news-brief')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [brief?.item.id]);
  useEffect(() => { if (!user?.uid) return; setStorageReady(false); try { const old = JSON.parse(localStorage.getItem(`news-v4:${user.uid}`) || '{}'); const data = JSON.parse(localStorage.getItem(`news-v5:${user.uid}`) || '{}'); setSaved(data.saved || old.saved || {}); setReviews(Object.fromEntries(Object.entries(data.reviews || {}).map(([id, review]) => [id, normalizeCachedReview(review)]).filter(([, review]) => review))); } catch { setSaved({}); setReviews({}); } setStorageReady(user.uid); return () => { stopScan.current = true; }; }, [user?.uid]);
  useEffect(() => { if (storageReady !== user?.uid || !user?.uid) return; try { localStorage.setItem(`news-v5:${user.uid}`, JSON.stringify({ saved, reviews })); } catch { setError('Browser storage is full. Some saved ideas may not survive a reload.'); } }, [saved, reviews, storageReady, user?.uid]);
  useEffect(() => { trySsoSignIn().catch(() => {}); return onAuthStateChanged(firebaseAuth, value => { setUser(value || null); setViewer(null); }); }, []);
  useEffect(() => user ? startSsoRefresh() : undefined, [user]);

  const load = useCallback(async () => {
    if (!user || loadingRef.current) return;
    loadingRef.current = true; setLoading(true); setError('');
    const results = await Promise.allSettled(NEWS_FEEDS.map(feed => loadFeed(feed)));
    const next = []; const statuses = [];
    results.forEach((result,index) => {
      const feed = NEWS_FEEDS[index]; const key = feed.id;
      if (result.status === 'fulfilled') { feedCache.set(key, result.value); next.push(...result.value); statuses.push({ feed, count: result.value.length, ok: true }); }
      else { const cached = feedCache.get(key) || []; next.push(...cached); statuses.push({ feed, count: cached.length, ok: false, error: result.reason?.message || 'Feed unavailable', cached: cached.length > 0 }); }
    });
    const unique = new Map();
    next.forEach(item => { if (!item.id) return; const existing = unique.get(item.id); if (!existing) unique.set(item.id, item); else existing.duplicateCoverage = [...(existing.duplicateCoverage || []), item]; });
    const candidates = storyClusters([...unique.values()].map(item => ({ ...item, relatedStories: [...(item.duplicateCoverage || []).map(extra => ({ title: extra.title, description: stripHtml(extra.description).slice(0, 500), source: extra.source, publisher: extra.publisher, feedLabel: extra.feedLabel, link: extra.link }))] })));
    setItems(candidates); setFeedStatuses(statuses);
    const failed = statuses.filter(status => !status.ok).length;
    if (!candidates.length) setError(failed ? `No stories loaded. ${failed} of ${NEWS_FEEDS.length} feeds failed.` : 'No stories were returned by these feeds.');
    else if (failed) setError(`${NEWS_FEEDS.length - failed} of ${NEWS_FEEDS.length} feeds loaded. Failed feeds are listed below.`);
    loadingRef.current = false; setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return undefined; let active = true;
    apiFetch(`${API_BASE}/api/dashboard/me`).then(async response => { if (!response.ok) { let detail = ''; try { detail = (await response.json()).detail || ''; } catch {} throw new Error(detail || `Access check returned ${response.status}`); } return response.json(); }).then(data => { if (active) setViewer(data); }).catch(reason => { if (active) setViewer({ accessError: reason.message || 'Unable to verify DEV access.' }); });
    return () => { active = false; };
  }, [user]);
  useEffect(() => { if (user && (viewer?.is_dev || viewer?.isDev)) load(); }, [user, viewer, load]);

  async function review(item) {
    if (busyRef.current) return false; busyRef.current = true; setReviewing(item.id); setError('');
    try {
      const response = await apiFetch(`${API_BASE}/api/dashboard/jev/news-review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceType: item.sourceType, headline: item.title, description: stripHtml(item.description).slice(0, 8000), source: item.source, author: item.author, url: item.link, published: item.published, image: item.image, feedLabel: item.feedLabel, feedGroup: item.feedGroup, socialSignal: item.socialSignal, relatedStories: item.relatedStories || [] }) });
      if (!response.ok) { let detail = ''; try { const body = await response.json(); detail = body.detail?.message || body.detail || ''; } catch {} throw new Error(response.status === 403 ? 'News JEV is DEV-only.' : detail || `JEV returned ${response.status}`); }
      const result = await response.json(); const checked = { ...result, reviewedAt: Date.now() }; setReviews(current => ({ ...current, [item.id]: checked })); setFailures(current => ({ ...current, [item.id]: null })); return true;
    } catch (reason) { setFailures(current => ({ ...current, [item.id]: reason.message })); setError(reason.message); return false; }
    finally { busyRef.current = false; setReviewing(''); }
  }

  const candidates = useMemo(() => { const merged = new Map(items.map(item => [item.id, item])); Object.values(saved).forEach(value => { if (value.item && !merged.has(value.item.id)) merged.set(value.item.id, value.item); }); return [...merged.values()]; }, [items, saved]);
  const pendingCount = candidates.filter(item => !reviews[item.id]).length;
  const ranked = useMemo(() => {
    let rows = candidates.filter(item => (!query || `${item.searchText || `${item.title} ${stripHtml(item.description)} ${item.source}`}`.toLowerCase().includes(query.toLowerCase())) && (feedFilter === 'all' || item.feedGroup === feedFilter));
    rows = rows.filter(item => {
      const label = reviews[item.id]?.label;
      if (filter === 'golden_nugget') return label === 'golden_nugget' || label === 'gold';
      if (filter === 'potential') return label === 'potential' || label === 'promising';
      if (filter === 'saved') return Boolean(saved[item.id]);
      if (filter === 'unreviewed') return !reviews[item.id];
      if (filter === 'x') return item.sourceType === 'x';
      return true;
    });
    return rows.sort((a,b) => {
      const labelRank = item => ({ golden_nugget: 4, potential: 3, promising: 3, not_yet: 1 }[reviews[item.id]?.label] || 0);
      return labelRank(b) - labelRank(a) || (reviews[b.id]?.viralPotential ?? 0) - (reviews[a.id]?.viralPotential ?? 0) || (reviews[b.id]?.score ?? 0) - (reviews[a.id]?.score ?? 0) || discoveryPriority(b) - discoveryPriority(a) || (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0);
    });
  }, [candidates, reviews, saved, query, feedFilter, filter]);

  async function reviewTop() {
    if (scanning || busyRef.current) return;
    const pending = candidates.filter(item => (!query || `${item.searchText || `${item.title} ${stripHtml(item.description)} ${item.source}`}`.toLowerCase().includes(query.toLowerCase())) && (feedFilter === 'all' || item.feedGroup === feedFilter) && !reviews[item.id]).sort((a,b) => discoveryPriority(b) - discoveryPriority(a)).slice(0, 40);
    if (!pending.length) { setError('All matching stories have a current JEV review. Change the feed or filter to discover more.'); return; }
    stopScan.current = false; setScanning(true); setProgress({ done: 0, total: pending.length }); let consecutiveErrors = 0;
    try { for (const item of pending) { if (stopScan.current) break; const ok = await review(item); consecutiveErrors = ok ? 0 : consecutiveErrors + 1; setProgress(current => ({ ...current, done: current.done + 1 })); if (consecutiveErrors >= 3) { setError('Scan paused after three failed reviews. Completed reviews are saved; retry when the service is available.'); break; } } }
    finally { setScanning(false); }
  }

  function makeBrief(item) {
    const reviewResult = reviews[item.id];
    const text = `WORKING POST BRIEF\n\nStory: ${item.title}\nEditorial angle: ${ANGLES[reviewResult?.editorialAngle] || 'Find the surprising, useful consequence for our audience.'}\nFormat: ${human(reviewResult?.postFormat || 'choose after reporting')}\n\nWhy it may travel: ${Math.round((reviewResult?.viralPotential || reviewResult?.dimensions?.viral_potential?.score || 0) * 100)}% estimated share potential. ${reviewResult?.strengths?.length ? `Strongest signals: ${reviewResult.strengths.map(human).join(', ')}.` : ''}\n\nEvidence to verify:\n${reviewResult?.evidenceText || stripHtml(item.description) || 'Read the original source before drafting.'}\n\nCoverage to compare:\n${(item.relatedStories || []).map(source => `- ${source.title} (${source.source})`).join('\n') || 'No closely matching coverage was found in the other loaded feeds.'}\n\nDraft structure:\n1. Lead with one clear, surprising or relatable fact.\n2. Explain what happened in plain language.\n3. Show the practical consequence or useful takeaway.\n4. Attribute the source and verify claims, dates, and numbers.\n\nDo not copy source wording. Do not present allegations as established facts.\n\nSource: ${item.link}`;
    setBrief({ item, text });
  }

  if (user === undefined) return <main className="news-loading">Loading News…</main>;
  if (!user) return <Login error={authError} />;
  const isDev = Boolean(viewer?.is_dev || viewer?.isDev); const handleSignOut = () => { clearSsoCookie(); signOut(firebaseAuth); };
  if (viewer?.accessError) return <main className="news-auth"><section><span className="news-kicker">Sentient Dash · DEV tool</span><h1>News</h1><p>News could not verify your DEV access: {viewer.accessError}</p><button onClick={() => { setViewer(null); apiFetch(`${API_BASE}/api/dashboard/me`).then(async response => { if (!response.ok) throw new Error(`Access check returned ${response.status}`); return response.json(); }).then(setViewer).catch(reason => setViewer({ accessError: reason.message })); }}>Retry access check</button></section></main>;
  if (viewer && !isDev) return <main className="news-auth"><section><span className="news-kicker">Sentient Dash · DEV tool</span><h1>News</h1><p>This tool is only available to DEV.</p></section></main>;

  const goldenCount = Object.values(reviews).filter(review => review?.label === 'golden_nugget' || review?.label === 'gold').length;
  const potentialCount = Object.values(reviews).filter(review => review?.label === 'potential' || review?.label === 'promising').length;
  const reviewedCount = candidates.filter(item => reviews[item.id]).length;
  const healthyFeeds = feedStatuses.filter(status => status.ok).length;
  const filters = [['best','Best opportunities'],['all','All stories'],['golden_nugget','Golden'],['potential','Potential'],['x','X signals'],['unreviewed','To review'],['saved','Saved']];
  const feedGroups = [...new Set(NEWS_FEEDS.map(feed => feed.group))];
  return <main className="news-shell">
    <ProductHeader current="news" coordinator isDev account={<SettingsMenu email={user.email} avatarUrl={user.photoURL || viewer?.avatar_url} isAdmin={Boolean(viewer?.is_admin)} isDev onSignOut={handleSignOut} />}>
      <h1>News</h1><span className="news-header-subtitle">RSS → story clusters → JEV → post brief</span><button className="news-refresh" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh 11 feeds'}</button><button className="news-review-all" onClick={reviewTop} disabled={!pendingCount || scanning || Boolean(reviewing)}>{scanning ? `JEV ${progress.done}/${progress.total}` : `Assess best ${Math.min(40, pendingCount)} with JEV`}</button>
    </ProductHeader>
    <section className="news-hero">
      <div className="news-hero-copy"><span className="news-kicker">SENTIENT · STORY DISCOVERY</span><h1>Find the story people will want to share.</h1><p>JEV looks for a strong social hook, useful angle, fresh conversation and evidence you can build a post around. The score estimates editorial potential; it does not promise reach.</p></div>
      <div className="news-stat"><strong>{candidates.length}</strong><span>story clusters</span></div><div className="news-stat"><strong>{goldenCount}</strong><span>golden</span></div><div className="news-stat"><strong>{potentialCount}</strong><span>potential</span></div>
      <div className="news-hero-action"><span>{pendingCount} stories ready for review</span><button onClick={reviewTop} disabled={!pendingCount || scanning || Boolean(reviewing)}>Find post ideas</button></div>
    </section>
    <section className="news-source-health" aria-live="polite"><div><strong>{loading ? 'Connecting to RSS.app…' : feedStatuses.length ? `${healthyFeeds}/${NEWS_FEEDS.length} feeds online` : `${NEWS_FEEDS.length} RSS.app feeds configured`}</strong><span>{feedStatuses.length ? ` · ${feedStatuses.reduce((sum,status) => sum + status.count, 0)} items loaded · ${feedStatuses.filter(status => status.cached).length} cached` : ' · Ready to load stories'}</span></div><details><summary>Feeds</summary><div className="news-feed-grid">{NEWS_FEEDS.map(feed => { const status = feedStatuses.find(item => item.feed.id === feed.id); return <span key={feed.id} className={status?.ok === false ? 'feed-down' : status?.ok ? 'feed-up' : ''}><i />{feed.label}{status ? ` · ${status.count}` : ''}{status?.error ? ` · ${status.error}` : ''}</span>; })}</div></details></section>
    {error && <div className="news-alert" role="status">{error}</div>}
    <section className="news-toolbar"><div className="news-filter-tabs" role="tablist" aria-label="Story filters">{filters.map(([key,label]) => <button key={key} role="tab" aria-selected={filter === key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}{key === 'unreviewed' && pendingCount > 0 ? <b>{pendingCount}</b> : null}</button>)}</div><div className="news-search-row"><label className="news-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search a story, source or angle…" /></label><label className="news-feed-select"><span>Feed</span><select value={feedFilter} onChange={event => setFeedFilter(event.target.value)}><option value="all">All feeds</option>{feedGroups.map(group => <option value={group} key={group}>{group}</option>)}</select></label><span className="news-result-count">{reviewedCount}/{candidates.length} assessed · {ranked.length} shown</span>{scanning && <button className="news-stop" onClick={() => { stopScan.current = true; }}>Stop scan</button>}</div></section>
    {brief && <section id="news-brief" className="news-brief"><div><span className="news-kicker">EDITORIAL WORKSPACE</span><h2>Build an original post</h2><p>Use the source and the story angle to create something clear, useful, and worth sharing.</p></div><textarea aria-label="Post brief" value={brief.text} onChange={event => setBrief({ ...brief, text: event.target.value })} /><div className="news-story-actions"><button onClick={() => { setSaved(current => ({ ...current, [brief.item.id]: { item: brief.item, brief: brief.text } })); setError('Post brief saved in this browser.'); }}>Save brief</button><button onClick={async () => { try { await navigator.clipboard.writeText(brief.text); setError('Brief copied.'); } catch { setError('Copy failed. Select the brief text and copy it manually.'); } }}>Copy brief</button><button onClick={() => setBrief(null)}>Close</button></div></section>}
    <section className="news-results" aria-label="News stories">{ranked.map(item => <StoryCard key={item.id} item={item} review={reviews[item.id]} busy={reviewing === item.id} locked={scanning || Boolean(reviewing)} failure={failures[item.id]} saved={Boolean(saved[item.id])} onReview={review} onSave={() => setSaved(current => { const next = { ...current }; if (next[item.id]) delete next[item.id]; else next[item.id] = { item }; return next; })} onBrief={() => makeBrief(item)} />)}{!ranked.length && <div className="news-empty"><strong>No stories in this view.</strong><span>Clear the search, change the feed, or review unassessed stories. A story without a review has not been rejected.</span>{!items.length && <button onClick={load} disabled={loading}>{loading ? 'Loading feeds…' : 'Load RSS stories'}</button>}</div>}</section>
    {loading && <div className="news-loading-note">Refreshing RSS.app feeds…</div>}
  </main>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<PrefsProvider><NewsApp /></PrefsProvider>);
