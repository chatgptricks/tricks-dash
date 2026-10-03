import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mountApp } from './mountApp';
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
];
const ANGLES = {
  practical_guide: 'Turn the confirmed idea into a short workflow someone can try.',
  comparison: 'Show the supported differences and explain when each one matters.',
  what_changes: 'Explain what changed and the practical consequence for the audience.',
  visual_explainer: 'Show the mechanism or surprising detail with a simple visual.',
  needs_reporting: 'Get more evidence from the original source before drafting.',
};

function Login({ error }) {
  const [busy, setBusy] = useState(false);
  async function login() { setBusy(true); try { const issue = await startGoogleSignIn(); if (issue) window.alert(describeSignInError(issue)); } finally { setBusy(false); } }
  return <main className="news-auth"><section><span className="news-kicker">Sentient Dash · DEV tool</span><h1>News</h1><p>Sign in with your authorized Sentient account to review story ideas.</p><button onClick={login} disabled={busy}>{busy ? 'Signing in…' : 'Sign in with Google'}</button>{error && <p className="news-error">{error}</p>}</section></main>;
}

// Story text originates from third-party feeds. DOMParser builds an inert
// document, so handlers such as <img onerror> never run (unlike innerHTML).
const htmlParser = new DOMParser();
// Search, ranking and rendering all ask for the same excerpts repeatedly.
const plainTextCache = new Map();
function stripHtml(value) {
  const key = String(value || '');
  if (plainTextCache.has(key)) return plainTextCache.get(key);
  const doc = htmlParser.parseFromString(key, 'text/html');
  doc.querySelectorAll('script,style').forEach(node => node.remove());
  const text = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
  if (plainTextCache.size > 2000) plainTextCache.clear();
  plainTextCache.set(key, text);
  return text;
}
function dateLabel(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date); }
function relativeAge(value) { const age = Date.now() - Date.parse(value); if (!Number.isFinite(age) || age < 0) return ''; const hours = Math.floor(age / 3600000); return hours < 1 ? 'Just now' : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`; }
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
  if (!review) return <span className="news-review-badge not-yet">Ready for JEV review</span>;
  const golden = review.label === 'golden_nugget' || review.label === 'gold';
  const potential = review.label === 'potential' || review.label === 'promising';
  return <span className={`news-review-badge ${golden ? 'gold' : potential ? 'promising' : 'not-yet'}`}>{golden ? 'Golden nugget' : potential ? 'Potential' : 'Explore later'} · {Math.round((review.score || 0) * 100)}%</span>;
}

function StoryCard({ item, rank, review, onReview, busy, locked, saved, onSave, onBrief, failure }) {
  const [imageFailed, setImageFailed] = useState(false);
  const dimensions = review?.dimensions || {};
  const mainSignals = [['Viral potential', review?.viralPotential ?? dimensions.viral_potential?.score], ['Story freshness', dimensions.timeliness?.score], ['Evidence', review?.evidenceQuality ?? dimensions.evidence_quality?.score]];
  return <article className={`news-story ${item.image && !imageFailed ? 'with-image' : ''} ${review?.label === 'golden_nugget' ? 'is-golden' : review?.label === 'potential' ? 'is-potential' : ''}`}>
    <div className="news-story-rank" aria-label={`Story ${rank + 1}`}>{String(rank + 1).padStart(2, '0')}</div>
    <div className="news-story-content">
      <div className="news-story-meta"><span className="news-source-pill"><span className={`news-origin-mark ${item.sourceType === 'x' ? 'is-x' : ''}`}>{item.sourceType === 'x' ? '𝕏' : 'N'}</span><span>{item.sourceType === 'x' ? item.source : item.publisher}</span></span><span>{item.published ? <><time dateTime={item.published}>{relativeAge(item.published) || dateLabel(item.published)}</time><span className="news-date-detail"> · {dateLabel(item.published)}</span></> : 'Date unavailable'}</span></div>
      <h2>{item.title}</h2>
      <p className="news-story-excerpt">{stripHtml(item.description).slice(0, 360) || 'The feed has no excerpt. Read the original source before developing this story.'}</p>
      <div className="news-story-tags"><span>{item.feedLabel}</span>{item.coverageCount > 1 && <span className="news-coverage">Seen across {item.coverageCount} source sites · {item.coverageFeeds.length} feeds</span>}{item.socialSignal && <span className="news-social-hint">Filtered X discussion</span>}</div>
      {review && <div className="news-signal-grid">{mainSignals.filter(([,value]) => value != null).map(([label,value]) => <div className="news-signal" key={label}><span>{label}</span><strong>{Math.round(value * 100)}%</strong><meter min="0" max="1" value={value} /></div>)}</div>}
      <div className="news-story-actions"><ReviewBadge review={review} /><button className="news-primary-action" disabled={busy || locked} onClick={() => onReview(item)}>{busy ? 'Reviewing…' : review ? 'Recheck JEV' : 'Review with JEV'}</button><button aria-pressed={saved} onClick={onSave}>{saved ? '★ Saved' : '☆ Save'}</button><button onClick={onBrief}>Draft post</button><a href={item.link} target="_blank" rel="noreferrer" aria-label={`Open original story: ${item.title}`}>Source ↗</a></div>
      {failure && <p role="status" className="news-error">Review failed: {failure}</p>}
      {review?.strengths?.length > 0 && <details className="news-review-details"><summary>Why JEV ranked this story</summary><p><strong>Strongest signals:</strong> {review.strengths.slice(0, 4).map(human).join(' · ')}. {review.weaknesses?.length ? <><strong>Needs work:</strong> {review.weaknesses.map(human).join(' · ')}.</> : null}</p>{review.editorialAngle && <p><strong>Post angle:</strong> {ANGLES[review.editorialAngle] || human(review.editorialAngle)} {review.postFormat && `Best format: ${human(review.postFormat)}.`}</p>}{review.targetAccount && <p><strong>Optional account fit:</strong> @{review.targetAccount}</p>}<p>Evidence: {review.evidenceSource === 'article' ? 'article text extracted from the publisher' : 'RSS excerpt only'}. Viral potential is an editorial estimate, not a promise of reach or a verified engagement count.</p></details>}
      {item.relatedStories?.length > 0 && <details className="news-review-details"><summary>Other coverage ({item.relatedStories.length})</summary><ul>{item.relatedStories.map((source,index) => <li key={`${source.link}-${index}`}><a href={source.link} target="_blank" rel="noreferrer">{source.title} · {source.source} ↗</a></li>)}</ul></details>}
    </div>
    {item.image && !imageFailed && <img className="news-story-image" src={item.image} alt="" loading="lazy" onError={() => setImageFailed(true)} />}
  </article>;
}

function NewsApp() {
  const [user, setUser] = useState(undefined); const [viewer, setViewer] = useState(null); const [authError] = useState(''); const [items, setItems] = useState([]); const [reviews, setReviews] = useState({}); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [feedStatuses, setFeedStatuses] = useState([]); const [reviewing, setReviewing] = useState('');
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('best'); const [feedFilter, setFeedFilter] = useState('all'); const [sortBy, setSortBy] = useState('recommended'); const [visibleLimit, setVisibleLimit] = useState(30); const [saved, setSaved] = useState({}); const [failures, setFailures] = useState({}); const [scanning, setScanning] = useState(false); const [progress, setProgress] = useState({ done: 0, total: 0 }); const stopScan = useRef(false); const busyRef = useRef(false); const loadingRef = useRef(false); const [brief, setBrief] = useState(null);
  useEffect(() => {
    const previousTheme = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = 'dark';
    return () => {
      if (previousTheme) document.documentElement.dataset.theme = previousTheme;
      else delete document.documentElement.dataset.theme;
    };
  }, []);
  useEffect(() => { setVisibleLimit(30); }, [filter, feedFilter, sortBy, query]);
  useEffect(() => { if (brief) document.getElementById('news-brief')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [brief?.item.id]);
  useEffect(() => { trySsoSignIn().catch(() => {}); return onAuthStateChanged(firebaseAuth, value => { setUser(value || null); setViewer(null); }); }, []);
  useEffect(() => user ? startSsoRefresh() : undefined, [user]);

  const load = useCallback(async () => {
    if (!user || loadingRef.current) return;
    loadingRef.current = true; setLoading(true);
    try {
      const response = await apiFetch(`${API_BASE}/api/dashboard/news`);
      if (!response.ok) throw new Error(`News returned ${response.status}`);
      const data = await response.json();
      setItems(data.items || []); setReviews(data.reviews || {}); setSaved(data.saved || {});
      setFeedStatuses([]); setError('');
    } catch (reason) { setError(reason.message || 'Unable to load News.'); }
    finally { loadingRef.current = false; setLoading(false); }
  }, [user]);

  useEffect(() => {
    if (!user || !(viewer?.is_dev || viewer?.isDev || viewer?.can_access_news)) return undefined;
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [user, viewer, load]);

  async function saveStory(item, nextSaved, briefText) {
    try {
      const response = await apiFetch(`${API_BASE}/api/dashboard/news/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, saved: nextSaved, ...(briefText == null ? {} : { brief: briefText }) }) });
      if (!response.ok) throw new Error(`Save returned ${response.status}`);
      setSaved(current => { const next = { ...current }; if (nextSaved) next[item.id] = { item, ...(briefText == null ? {} : { brief: briefText }) }; else delete next[item.id]; return next; });
    } catch (reason) { setError(`Could not save idea: ${reason.message}`); }
  }

  useEffect(() => {
    if (!user) return undefined; let active = true;
    apiFetch(`${API_BASE}/api/dashboard/me`).then(async response => { if (!response.ok) { let detail = ''; try { detail = (await response.json()).detail || ''; } catch {} throw new Error(detail || `Access check returned ${response.status}`); } return response.json(); }).then(data => { if (active) setViewer(data); }).catch(reason => { if (active) setViewer({ accessError: reason.message || 'Unable to verify DEV access.' }); });
    return () => { active = false; };
  }, [user]);
  useEffect(() => {
    if (!user?.uid || !(viewer?.is_dev || viewer?.isDev || viewer?.can_access_news)) return;
    const keys = [`news-v4:${user.uid}`, `news-v5:${user.uid}`];
    const legacy = keys.map(key => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } });
    const saved = { ...(legacy[0].saved || {}), ...(legacy[1].saved || {}) };
    const reviews = { ...(legacy[0].reviews || {}), ...(legacy[1].reviews || {}) };
    if (!Object.keys(saved).length) return;
    apiFetch(`${API_BASE}/api/dashboard/news/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saved, reviews }) })
      .then(response => { if (!response.ok) throw new Error(`Import returned ${response.status}`); keys.forEach(key => localStorage.removeItem(key)); load(); })
      .catch(reason => setError(`Could not move browser ideas to shared News: ${reason.message}`));
  }, [user?.uid, viewer, load]);
  useEffect(() => { if (user && (viewer?.is_dev || viewer?.isDev || viewer?.can_access_news)) load(); }, [user, viewer, load]);

  async function review(item) {
    if (busyRef.current) return false; busyRef.current = true; setReviewing(item.id); setError('');
    try {
      const response = await apiFetch(`${API_BASE}/api/dashboard/news/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) });
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
      if (sortBy === 'newest') return (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0);
      if (sortBy === 'coverage') return (b.coverageCount || 1) - (a.coverageCount || 1) || discoveryPriority(b) - discoveryPriority(a);
      const labelRank = item => ({ golden_nugget: 4, potential: 3, promising: 3, not_yet: 1 }[reviews[item.id]?.label] || 0);
      return labelRank(b) - labelRank(a) || (reviews[b.id]?.viralPotential ?? 0) - (reviews[a.id]?.viralPotential ?? 0) || (reviews[b.id]?.score ?? 0) - (reviews[a.id]?.score ?? 0) || discoveryPriority(b) - discoveryPriority(a) || (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0);
    });
  }, [candidates, reviews, saved, query, feedFilter, filter, sortBy]);
  const visibleRanked = ranked.slice(0, visibleLimit);

  function makeBrief(item) {
    const reviewResult = reviews[item.id];
    const text = `WORKING POST BRIEF\n\nStory: ${item.title}\nEditorial angle: ${ANGLES[reviewResult?.editorialAngle] || 'Find the surprising, useful consequence for our audience.'}\nFormat: ${human(reviewResult?.postFormat || 'choose after reporting')}\n\nWhy it may travel: ${Math.round((reviewResult?.viralPotential || reviewResult?.dimensions?.viral_potential?.score || 0) * 100)}% estimated share potential. ${reviewResult?.strengths?.length ? `Strongest signals: ${reviewResult.strengths.map(human).join(', ')}.` : ''}\n\nEvidence to verify:\n${reviewResult?.evidenceText || stripHtml(item.description) || 'Read the original source before drafting.'}\n\nCoverage to compare:\n${(item.relatedStories || []).map(source => `- ${source.title} (${source.source})`).join('\n') || 'No closely matching coverage was found in the other loaded feeds.'}\n\nDraft structure:\n1. Lead with one clear, surprising or relatable fact.\n2. Explain what happened in plain language.\n3. Show the practical consequence or useful takeaway.\n4. Attribute the source and verify claims, dates, and numbers.\n\nDo not copy source wording. Do not present allegations as established facts.\n\nSource: ${item.link}`;
    setBrief({ item, text });
  }

  if (user === undefined) return <main className="news-loading">Loading News…</main>;
  if (!user) return <Login error={authError} />;
  const isDev = Boolean(viewer?.is_dev || viewer?.isDev); const canAccessNews = isDev || Boolean(viewer?.can_access_news); const handleSignOut = () => { clearSsoCookie(); signOut(firebaseAuth); };
  if (viewer?.accessError) return <main className="news-auth"><section><span className="news-kicker">Sentient Dash · DEV tool</span><h1>News</h1><p>News could not verify your DEV access: {viewer.accessError}</p><button onClick={() => { setViewer(null); apiFetch(`${API_BASE}/api/dashboard/me`).then(async response => { if (!response.ok) throw new Error(`Access check returned ${response.status}`); return response.json(); }).then(setViewer).catch(reason => setViewer({ accessError: reason.message })); }}>Retry access check</button></section></main>;
  if (viewer && !canAccessNews) return <main className="news-auth"><section><span className="news-kicker">Sentient Dash · DEV tool</span><h1>News</h1><p>This tool is only available to authorized accounts.</p></section></main>;

  const reviewedCount = candidates.filter(item => reviews[item.id]).length;
  const counts = {
    all: candidates.length,
    golden: candidates.filter(item => ['golden_nugget', 'gold'].includes(reviews[item.id]?.label)).length,
    potential: candidates.filter(item => ['potential', 'promising'].includes(reviews[item.id]?.label)).length,
    x: candidates.filter(item => item.sourceType === 'x').length,
    unreviewed: pendingCount,
    saved: candidates.filter(item => Boolean(saved[item.id])).length,
  };
  const filters = [['best','Recommended',null],['golden_nugget','Golden',counts.golden],['potential','Potential',counts.potential],['unreviewed','Needs review',pendingCount],['x','X signals',counts.x],['all','All stories',counts.all],['saved','Saved',counts.saved]];
  const feedGroups = [...new Set(NEWS_FEEDS.map(feed => feed.group))];
  return <main className="news-shell">
    <ProductHeader current="news" coordinator isDev={isDev} canAccessNews={canAccessNews} account={<SettingsMenu email={user.email} avatarUrl={user.photoURL || viewer?.avatar_url} isAdmin={Boolean(viewer?.is_admin)} isDev={isDev} hideAppearanceControls onSignOut={handleSignOut} />}>
      <h1>News</h1><span className="news-header-subtitle">Discover story ideas from 11 monitored feeds</span><button className="news-refresh" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh feeds'}</button>
    </ProductHeader>
    <section className="news-source-health" aria-live="polite"><div className="news-health-copy"><span className={`news-health-dot ${candidates.length ? 'is-online' : ''}`} /><span>{loading ? 'Loading shared News…' : `${candidates.length} shared stories · automatic feed and JEV updates`}</span></div></section>
    {error && <div className="news-alert" role="status">{error}</div>}
    <section className="news-toolbar" aria-label="Story filters"><div className="news-filter-row"><div className="news-filter-tabs" role="tablist" aria-label="Story filters">{filters.map(([key,label,count]) => <button key={key} role="tab" aria-selected={filter === key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}{count !== null && <b>{count}</b>}</button>)}</div><span className="news-result-count"><strong>{ranked.length}</strong> stories<span className="news-result-reviewed"> · {reviewedCount} scored by JEV</span></span></div><div className="news-search-row"><label className="news-search"><span aria-hidden="true">⌕</span><input aria-label="Search stories" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search stories, sources or topics…" />{query && <button className="news-clear-search" onClick={() => setQuery('')} aria-label="Clear search">×</button>}</label><label className="news-feed-select"><span>Feed</span><select aria-label="Filter stories by topic" value={feedFilter} onChange={event => setFeedFilter(event.target.value)}><option value="all">All feeds</option>{feedGroups.map(group => <option value={group} key={group}>{group}</option>)}</select></label><label className="news-sort-select"><span>Sort</span><select aria-label="Sort stories" value={sortBy} onChange={event => setSortBy(event.target.value)}><option value="recommended">Recommended</option><option value="newest">Newest</option><option value="coverage">Most coverage</option></select></label><span className="news-up-to-date">{pendingCount > 0 ? `${pendingCount} queued for automatic JEV review` : 'All caught up'}</span></div></section>
    {scanning && <div className="news-progress" role="progressbar" aria-label="JEV review progress" aria-valuemin="0" aria-valuemax={progress.total} aria-valuenow={progress.done}><span style={{ width: `${progress.total ? progress.done / progress.total * 100 : 0}%` }} /></div>}
    {brief && <section id="news-brief" className="news-brief"><div><span className="news-kicker">EDITORIAL WORKSPACE</span><h2>Build an original post</h2><p>Use the source and the story angle to create something clear, useful, and worth sharing.</p></div><textarea aria-label="Post brief" value={brief.text} onChange={event => setBrief({ ...brief, text: event.target.value })} /><div className="news-story-actions"><button onClick={() => { saveStory(brief.item, true, brief.text); }}>Save brief</button><button onClick={async () => { try { await navigator.clipboard.writeText(brief.text); setError('Brief copied.'); } catch { setError('Copy failed. Select the brief text and copy it manually.'); } }}>Copy brief</button><button onClick={() => setBrief(null)}>Close</button></div></section>}
    <section className="news-results" aria-label="News stories">{visibleRanked.map((item,index) => <StoryCard key={item.id} rank={index} item={item} review={reviews[item.id]} busy={reviewing === item.id} locked={scanning || Boolean(reviewing)} failure={failures[item.id]} saved={Boolean(saved[item.id])} onReview={review} onSave={() => saveStory(item, !saved[item.id])} onBrief={() => makeBrief(item)} />)}{!ranked.length && <div className="news-empty"><strong>No stories in this view.</strong><span>Clear the search, change the feed, or review unassessed stories. A story without a review has not been rejected.</span>{!items.length && <button onClick={load} disabled={loading}>{loading ? 'Loading feeds…' : 'Load RSS stories'}</button>}</div>}</section>
    {visibleRanked.length < ranked.length && <div className="news-load-more"><span>Showing {visibleRanked.length} of {ranked.length} matching stories</span><button onClick={() => setVisibleLimit(current => Math.min(current + 30, ranked.length))}>Load 30 more stories</button></div>}
    {loading && <div className="news-loading-note">Refreshing RSS.app feeds…</div>}
  </main>;
}

mountApp(<PrefsProvider lang="en" theme="dark"><NewsApp /></PrefsProvider>, { lang: 'en' });
