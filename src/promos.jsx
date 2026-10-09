import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mountApp } from './mountApp';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { apiFetch, API_BASE } from './api';
import { firebaseAuth, startGoogleSignIn, describeSignInError } from './firebase';
import { clearSsoCookie, startSsoRefresh, trySsoSignIn } from './sso';
import ProductHeader from './ProductHeader';
import ResearchCard, { CardMedia } from './ResearchCard';
import { ArrowUpRight, ScanEye } from 'lucide-react';
import { coordinatorFor, devAccessFor } from '../public/product-navigation';
import TopicStack from './TopicStack';
import PromoReviewDialog from './PromoReviewDialog';
import { SettingsMenu } from './App';
import { PrefsProvider, usePrefs } from './prefsContext';
import { makeT, readLang } from './prefs';
import { LanguageSelector } from './LanguageSelector';
import { CLASSIFICATION_LABELS, promoKey, safeExternalUrl, selectPromos, groupPromos } from './promosIntelligence';
import './styles.css';
import './promos.css';

const EMPTY = { items: [], next_cursor: null, hasTail: false };
const INITIAL_FILTERS = { search: '', classification: '', review: 'new', focus: 'all', sort: 'priority', account: '' };
const ROOT = '/api/admin/promos';
const detailPath = item => `${ROOT}/${encodeURIComponent(item.account)}/${encodeURIComponent(item.shortcode)}`;
const isRunning = job => job && ['starting', 'queued', 'running', 'reconnecting'].includes(job.status);
const jobStorageKey = user => `sentient.promos.job:${user.uid || user.email}`;
function restoreJob(user) {
  if (!user) return null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(jobStorageKey(user)) || 'null');
    return saved && typeof saved.id === 'string' && ['rules', 'jev'].includes(saved.kind) ? { ...saved, status: 'queued', error: '' } : null;
  } catch { return null; }
}

async function request(path, { signal, timeout = 45000, ...options } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeout);
  try {
    const response = await apiFetch(`${API_BASE}${path}`, { ...options, signal: controller.signal });
    let body;
    try { body = await response.json(); } catch (error) { throw new Error(`Promos returned an unreadable response (${response.status}). Please retry.`, { cause: error }); }
    if (!response.ok) {
      const detail = typeof body.detail === 'string' ? body.detail : body.detail?.message;
      throw new Error(detail || (response.status === 403 ? 'Your account does not have Promos access.' : `Promos request failed (${response.status}).`));
    }
    return body;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('The request timed out. Refresh before retrying an action; it may have completed.', { cause: error });
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
const jsonOptions = (method, payload) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
function dateLabel(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? makeT(readLang())('Date unavailable') : date.toLocaleDateString(readLang() === 'es' ? 'es-CR' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Login() {
  const { t, lang, setLang } = usePrefs();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function login() {
    setBusy(true); setError('');
    try { const issue = await startGoogleSignIn(); if (issue) setError(issue); }
    catch (issue) { setError(issue); }
    finally { setBusy(false); }
  }
  return <main className="promo-auth"><section><LanguageSelector lang={lang} setLang={setLang} t={t} /><span className="promo-kicker">Sentient Dash</span><h1>{t("Promos")}</h1><p>{t("Review promotion signals, check the evidence, and improve detection together.")}</p><button className="promo-primary" onClick={login} disabled={busy}>{busy ? t("Signing in…") : t("Sign in with Google")}</button>{error && <p className="promo-error" role="alert">{describeSignInError(error, lang)}</p>}</section></main>;
}

function PromoCard({ item, onSelect }) {
  const { t } = usePrefs();
  const evidence = item.evidence?.[0]?.text || item.jev_review?.contextExcerpt || t('No evidence excerpt');
  const client = item.client || t('Unknown brand');
  const primary = safeExternalUrl(item.cover_url?.startsWith('/') ? `${API_BASE}${item.cover_url}` : item.cover_url) || safeExternalUrl(item.cover_source_url);
  const permalink = safeExternalUrl(item.permalink);
  const review = item.classification_source === 'jev_semantic_scan' ? 'JEV candidate' : item.jev_review ? 'JEV checked' : item.review_status;
  function openReview(event) {
    const card = event.currentTarget.closest('.promo-card');
    const stack = card?.closest('.post-stack-modal');
    // Research-style cards participate in the stack's explicit handoff contract.
    stack?.dispatchEvent(new CustomEvent('obs-stack-select', { detail: { card: card.closest('.post-stack-grid > div') } }));
    onSelect(item);
  }
  return <ResearchCard className="promo-card" data-promo-key={promoKey(item)} role="button" tabIndex={0}
    aria-label={t('Review {brand} on @{account}', { brand: item.client || t('Unknown brand'), account: item.account })}
    onClick={event => { if (!event.target.closest('button, a')) openReview(event); }}
    onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openReview(event); } }}
    source={`@${item.account}`} meta={dateLabel(item.published_at || item.first_detected_at)}
    marker={<span className="promo-review">{t(review)}</span>}
    media={<CardMedia src={primary} fallbackSrc={safeExternalUrl(item.cover_source_url)} alt={t('Post by @{account}', { account: item.account })} label={t("Post preview unavailable")} />}
    actions={<><button type="button" onClick={openReview} aria-label={t('Review promotion on @{account}', { account: item.account })}><ScanEye size={16} /><span>{t("Review")}</span></button>{permalink && <a href={permalink} target="_blank" rel="noopener noreferrer" aria-label={t('Open original post by @{account}', { account: item.account })}><ArrowUpRight size={16} /><span>{t("Original")}</span></a>}</>}
    footer={<span className="promo-card-foot">{item.cta?.keyword ? `${t('Keyword')}: ${item.cta.keyword}` : item.promo_code ? `${t('Code')}: ${item.promo_code}` : item.links?.length ? t("Commercial link found") : `${t('Detected')} ${dateLabel(item.first_detected_at)}`}</span>}
  >
    <div className="promo-card-top"><Badge value={item.classification} /></div>
    <h2 className="promo-opportunity-title">{client}</h2>
    <p className="promo-product">{item.product || t("Product not identified")}</p>
    <p className="promo-evidence">“{evidence}”</p>
  </ResearchCard>;
}

function Badge({ value }) {
  const { t } = usePrefs(); return <span className={`promo-badge ${value}`}>{t(CLASSIFICATION_LABELS[value] || "Needs review")}</span>; }

function PromoResults({ items, onSelect }) {
  const { t } = usePrefs();
  const groups = groupPromos(items);
  return <section className="promo-grid promo-grid-stacks product-card-grid" aria-label={t("Promotion review results")}>
    {groups.map(group => {
      const posts = group.items.map(item => ({ ...item, postDate: item.published_at || item.first_detected_at, publishedAt: item.published_at || item.first_detected_at, timestamp: Date.parse(item.published_at || item.first_detected_at || '') || 0 }));
      return <div className={posts.length > 1 ? 'promo-result-stack' : 'promo-result-single'} key={group.key}>
        {posts.length > 1 ? <TopicStack posts={posts} visiblePosts={posts} total={posts.length} renderLayer={() => <div className="promo-stack-layer" />} renderCard={post => <PromoCard item={post} onSelect={onSelect} />} /> : <PromoCard item={posts[0]} onSelect={onSelect} />}
        {posts.length > 1 && <p className="promo-stack-context">{group.kind === 'brand' ? group.label : t("Same topic")} · {posts.length} {t("loaded posts")}</p>}
      </div>;
    })}
  </section>;
}

function DetectionTools({ job, onStart, onReconnect }) {
  const { t } = usePrefs();
  const [limit, setLimit] = useState('500');
  const running = isRunning(job);
  return <details className="promo-detection-tools"><summary>{t("Detection tools")} <span>{t("Scan stored posts and find missed signals")}</span></summary><div className="promo-detection-body"><p>{t("Rule scans analyze the last 30 days of stored competitor posts. JEV discovery checks stored candidates using AI. Existing human corrections are kept.")}</p><label>{t("Maximum posts")} <select value={limit} onChange={e => setLimit(e.target.value)} disabled={running}><option value="100">{t("100 posts")}</option><option value="500">{t("500 posts")}</option><option value="2000">{t("2,000 posts")}</option></select></label><div className="promo-tool-actions"><button disabled={running} onClick={() => onStart('rules', Number(limit))}>{t("Scan with rules")}</button><button disabled={running} onClick={() => onStart('jev', Number(limit))}>{t("Find missed promos with JEV")}</button></div></div>{job && <div className="promo-job" role="status"><strong>{job.kind === 'jev' ? t("JEV discovery") : t("Rule scan")} · {job.status === 'done' ? t("Complete") : job.status === 'failed' ? t("Failed") : job.status === 'reconnecting' ? t("Status unavailable") : t("In progress")}</strong><span>{job.error || `${job.processed || 0}${job.total ? ` / ${job.total}` : ''} posts checked${job.found != null ? ` · ${job.found} candidates found` : ''}`}</span>{job.status === 'reconnecting' && <button onClick={onReconnect}>{t("Reconnect to this scan")}</button>}</div>}</details>;
}

function PromosApp() {
  const { t } = usePrefs();
  const [user, setUser] = useState(undefined);
  const [viewer, setViewer] = useState(null);
  const [accessError, setAccessError] = useState('');
  const [accessAttempt, setAccessAttempt] = useState(0);
  const [data, setData] = useState(EMPTY);
  const dataRef = useRef(EMPTY);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(null);
  const [opening, setOpening] = useState(false);
  const [job, setJob] = useState(null);
  const [pollAttempt, setPollAttempt] = useState(0);
  const listRequest = useRef(null);
  const detailRequest = useRef(null);
  const session = useRef(0);
  const jobStarting = useRef(false);
  const mutationBusy = useRef(false);
  const updateData = useCallback(next => { dataRef.current = typeof next === 'function' ? next(dataRef.current) : next; setData(dataRef.current); }, []);

  useEffect(() => {
    trySsoSignIn().catch(() => {});
    return onAuthStateChanged(firebaseAuth, value => {
      session.current += 1; listRequest.current?.abort(); detailRequest.current?.abort();
      setUser(value || null); setViewer(null); setAccessError(''); updateData(EMPTY); setSelected(null); setJob(restoreJob(value)); setNotice(''); setError(''); setOpening(false); jobStarting.current = false; mutationBusy.current = false;
    });
  }, []);
  useEffect(() => user ? startSsoRefresh() : undefined, [user]);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController(); setAccessError('');
    request('/api/dashboard/me', { signal: controller.signal }).then(setViewer).catch(issue => { if (!controller.signal.aborted) setAccessError(issue.message); });
    return () => controller.abort();
  }, [user, accessAttempt]);

  const load = useCallback(async ({ append = false, refresh = false } = {}) => {
    if (!user || !viewer || mutationBusy.current) return;
    // Background refresh cannot cancel a page the reviewer explicitly requested.
    if (refresh && listRequest.current) return;
    listRequest.current?.abort();
    const controller = new AbortController(); listRequest.current = controller;
    append ? setLoadingMore(true) : setLoading(true); setError('');
    const cursor = append ? dataRef.current.next_cursor : null;
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (cursor) params.set('cursor', cursor);
      if (filters.classification) params.set('classification', filters.classification);
      if (filters.review) params.set('review', filters.review);
      const page = await request(`${ROOT}?${params}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!Array.isArray(page.items)) throw new Error('Promos returned an invalid list. Please retry.');
      updateData(current => {
        const previousKeys = new Set(current.items.map(promoKey));
        const disconnectedHead = refresh && page.items.length >= 100 && !page.items.some(item => previousKeys.has(promoKey(item)));
        if (!append && (!refresh || !current.hasTail || disconnectedHead)) return { items: page.items, next_cursor: page.next_cursor || null, hasTail: false };
        const merged = new Map(current.items.map(item => [promoKey(item), item]));
        page.items.forEach(item => merged.set(promoKey(item), item));
        return { items: [...merged.values()], next_cursor: refresh ? current.next_cursor : page.next_cursor || null, hasTail: append || current.hasTail };
      });
    } catch (issue) { if (!controller.signal.aborted) setError(issue.message); }
    finally { if (listRequest.current === controller) { listRequest.current = null; setLoading(false); setLoadingMore(false); } }
  }, [user, viewer, filters.classification, filters.review]);
  const currentLoad = useRef(load);
  currentLoad.current = load;
  useEffect(() => {
    updateData(EMPTY); setSelected(null); detailRequest.current?.abort(); setOpening(false); load();
    const refresh = () => { if (document.visibilityState === 'visible') load({ refresh: true }); };
    const timer = setInterval(refresh, 45000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); listRequest.current?.abort(); };
  }, [load]);
  useEffect(() => () => { session.current += 1; listRequest.current?.abort(); detailRequest.current?.abort(); }, []);

  const items = useMemo(() => selectPromos(data.items, filters), [data.items, filters]);
  const accounts = useMemo(() => [...new Set(data.items.map(item => item.account))].sort(), [data.items]);
  const position = selected ? items.findIndex(item => promoKey(item) === promoKey(selected)) : -1;
  const openDetail = async (item, { throwOnError = false } = {}) => {
    detailRequest.current?.abort();
    const controller = new AbortController(); detailRequest.current = controller; setOpening(true); setError('');
    try {
      const detail = await request(detailPath(item), { signal: controller.signal });
      if (!controller.signal.aborted) setSelected(detail);
    } catch (issue) { if (!controller.signal.aborted) { if (throwOnError) throw issue; setError(`Unable to open this post. ${issue.message}`); } }
    finally { if (detailRequest.current === controller) setOpening(false); }
  };
  function closeDetail() { detailRequest.current?.abort(); setOpening(false); setSelected(null); }
  function applyUpdated(next) {
    updateData(current => ({ ...current, items: current.items.flatMap(item => {
      if (promoKey(item) !== promoKey(next)) return [item];
      if ((filters.review && next.review_status !== filters.review) || (filters.classification && next.classification !== filters.classification)) return [];
      return [next];
    }) }));
    setSelected(next);
  }
  async function mutateSelected(path, options, { advance = false } = {}) {
    if (mutationBusy.current) throw new Error('A review action is already in progress.');
    const token = session.current;
    const nextItem = items[position + 1] || items.slice(0, Math.max(position, 0)).find(item => promoKey(item) !== promoKey(selected));
    mutationBusy.current = true; listRequest.current?.abort();
    try {
      const next = await request(path, options);
      if (token !== session.current) return;
      applyUpdated(next); setNotice(path.endsWith('/jev-review') ? 'JEV assessment updated.' : 'Review saved.');
      if (advance) {
        if (nextItem) {
          try { await openDetail(nextItem, { throwOnError: true }); }
          catch (issue) { throw new Error(`Your review was saved, but the next post could not load. ${issue.message}`, { cause: issue }); }
        }
        else { setSelected(null); setNotice('Review saved. You have reached the end of this view.'); }
      }
    } finally { if (token === session.current) mutationBusy.current = false; }
  }

  useEffect(() => {
    if (!user || !job?.id) return;
    try {
      if (['done', 'failed'].includes(job.status)) sessionStorage.removeItem(jobStorageKey(user));
      else sessionStorage.setItem(jobStorageKey(user), JSON.stringify({ id: job.id, kind: job.kind }));
    } catch { /* Status polling still works when browser storage is unavailable. */ }
  }, [job, user]);

  async function startJob(kind, limit) {
    if (jobStarting.current || isRunning(job)) return;
    const token = session.current; jobStarting.current = true;
    setJob({ kind, status: 'starting' }); setError('');
    try {
      const payload = kind === 'rules' ? { limit, from_date: new Date(Date.now() - 30 * 86400000).toISOString() } : { limit };
      const result = await request(`${ROOT}/${kind === 'rules' ? 'backfill' : 'jev-scan'}`, jsonOptions('POST', payload));
      if (token !== session.current) return;
      if (!result.job_id) throw new Error('The scan did not return a job ID. Refresh before starting another scan.');
      setJob({ kind, id: result.job_id, status: 'queued', processed: 0 });
    } catch (issue) { if (token === session.current) setJob({ kind, status: 'failed', error: issue.message }); }
    finally { if (token === session.current) jobStarting.current = false; }
  }
  useEffect(() => {
    if (!job?.id || !['queued', 'running'].includes(job.status)) return;
    const controller = new AbortController(); let timer;
    const poll = async () => {
      try {
        const status = await request(`${ROOT}/jobs/${encodeURIComponent(job.id)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!['queued', 'running', 'done', 'failed'].includes(status.status)) throw new Error('The scan returned an unknown status.');
        setJob(current => current?.id === job.id ? { ...current, ...status, id: job.id } : current);
        if (status.status === 'done') currentLoad.current();
        else if (status.status !== 'failed') timer = setTimeout(poll, 2000);
      } catch (issue) { if (!controller.signal.aborted) setJob(current => ({ ...current, status: 'reconnecting', error: `The scan may still be running. ${issue.message}` })); }
    };
    poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [job?.id, pollAttempt, user]);

  if (user === undefined) return <main className="promo-loading">{t("Loading Promos…")}</main>;
  if (!user) return <Login />;
  const coordinator = coordinatorFor(viewer);
  const isDev = devAccessFor(viewer);
  const setFilter = (name, value) => setFilters(current => ({ ...current, [name]: value }));
  return <main className="promo-shell product-page"><ProductHeader current="promos" coordinator={coordinator} isDev={isDev} canAccessNews={Boolean(viewer?.can_access_news || viewer?.canAccessNews)} account={<SettingsMenu email={user.email} avatarUrl={user.photoURL || viewer?.avatar_url || viewer?.avatarUrl} isAdmin={Boolean(viewer?.is_admin || viewer?.isAdmin)} isDev={isDev} onSignOut={() => { clearSsoCookie(); signOut(firebaseAuth); }} />}><h1>{t("Promos")}</h1><button className="promo-scan" onClick={() => openDetail(items[0])} disabled={!items.length || opening}>{opening ? t("Opening…") : t("Review next")}</button></ProductHeader>
    <section className="product-page-heading"><p>{t("Paid partnership and promotion signals")}</p></section>
    {accessError ? <div className="promo-alert" role="alert">{accessError}<button onClick={() => setAccessAttempt(value => value + 1)}>{t("Retry access check")}</button></div> : !viewer ? <div className="promo-empty">{t("Checking account access…")}</div> : <>
      <DetectionTools job={job} onStart={startJob} onReconnect={() => { setJob(current => ({ ...current, status: 'running', error: '' })); setPollAttempt(value => value + 1); }} />
      <section className="promo-toolbar product-page-controls" aria-label={t("Filter promotion reviews")}>
        <label className="promo-search"><span>{t("Search loaded posts")}</span><input aria-label={t("Search loaded posts")} type="search" placeholder={t("Brand, account, keyword or evidence…")} value={filters.search} onChange={e => setFilter('search', e.target.value)} /></label>
        <label><span>{t("Review status")}</span><select aria-label={t("Review status")} value={filters.review} onChange={e => setFilter('review', e.target.value)}><option value="new">{t("New")}</option><option value="reviewed">{t("Reviewed")}</option><option value="dismissed">{t("Dismissed")}</option><option value="">{t("All reviews")}</option></select></label>
        <label><span>{t("Classification")}</span><select aria-label={t("Classification")} value={filters.classification} onChange={e => setFilter('classification', e.target.value)}><option value="">{t("All classifications")}</option>{Object.entries(CLASSIFICATION_LABELS).map(([key, label]) => <option value={key} key={key}>{t(label)}</option>)}</select></label>
        <label><span>{t("Account · loaded")}</span><select aria-label={t("Account · loaded")} value={filters.account} onChange={e => setFilter('account', e.target.value)}><option value="">{t("All accounts")}</option>{accounts.map(account => <option key={account} value={account}>@{account}</option>)}</select></label>
        <label><span>{t("Review focus")}</span><select aria-label={t("Review focus")} value={filters.focus} onChange={e => setFilter('focus', e.target.value)}><option value="all">{t("All posts")}</option><option value="conflicts">{t("Conflicting signals")}</option><option value="needs_review">{t("Needs classification")}</option><option value="missing_client">{t("Missing brand")}</option><option value="weak_evidence">{t("Indirect evidence")}</option><option value="multi_brand">{t("Multiple brand candidates")}</option><option value="related">{t("Related posts")}</option><option value="unreviewed_jev">{t("No JEV check")}</option></select></label>
        <label><span>{t("Sort by")}</span><select aria-label={t("Sort by")} value={filters.sort} onChange={e => setFilter('sort', e.target.value)}><option value="priority">{t("Review priority")}</option><option value="newest">{t("Newest post")}</option><option value="oldest">{t("Oldest post")}</option></select></label>
      </section>
      <div className="promo-results-heading"><div><strong>{items.length} {items.length === 1 ? t("post") : t("posts")}</strong><span className="promo-scope-note">{data.items.length} {t("loaded · Grouped automatically by topic or brand")}{data.next_cursor ? t(" · More available") : ''}</span></div><button disabled={loading || loadingMore} onClick={() => load()}>{loading ? t("Refreshing…") : t("Refresh")}</button></div>
      {notice && <p className="promo-notice" role="status">{t(notice)}</p>}{opening && <p className="promo-notice" role="status">{t("Loading full post evidence…")}</p>}{error && <div className="promo-alert" role="alert">{t(error)}<button onClick={() => load()}>{t("Reload queue")}</button></div>}
      {loading && !data.items.length ? <div className="promo-empty" role="status">{t("Loading promotion signals…")}</div> : items.length ? <PromoResults items={items} onSelect={openDetail} /> : <div className="promo-empty"><strong>{data.items.length ? t("No loaded posts match these filters.") : t("No posts in this review queue.")}</strong><span>{data.items.length ? t("Try another focus or search, or load more posts.") : t("Change the review status or scan stored posts to look for promotion signals.")}</span><button onClick={() => setFilters(INITIAL_FILTERS)}>{t("Reset filters")}</button></div>}
      {data.next_cursor && <button className="promo-load-more" disabled={loadingMore || loading} onClick={() => load({ append: true })}>{loadingMore ? t("Loading more…") : `${t('Load more posts')} · ${data.items.length} ${t('loaded')}`}</button>}
    </>}
    <PromoReviewDialog item={selected} relatedItems={data.items} onClose={closeDetail} onSave={(payload, options) => mutateSelected(detailPath(selected), jsonOptions('PATCH', payload), options)} onJevReview={() => mutateSelected(`${detailPath(selected)}/jev-review`, { method: 'POST', timeout: 90000 })} onSelect={item => openDetail(item, { throwOnError: true })} position={{ index: position, total: items.length }} onPrevious={!opening && position > 0 ? () => openDetail(items[position - 1], { throwOnError: true }) : undefined} onNext={!opening && position >= 0 && position < items.length - 1 ? () => openDetail(items[position + 1], { throwOnError: true }) : undefined} />
  </main>;
}

mountApp(<PrefsProvider><PromosApp /></PrefsProvider>);
