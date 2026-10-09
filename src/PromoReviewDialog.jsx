import { usePrefs } from './prefsContext';
import { makeT, readLang } from './prefs';
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, LoaderCircle, RotateCcw, Sparkles, X } from 'lucide-react';
import { buildReviewBrief, CLASSIFICATION_LABELS, getRelatedPromos, inspectPromo, RELATIONSHIP_LABELS, safeExternalUrl } from './promosIntelligence';

const REVIEW_LABELS = { new: 'Not reviewed', reviewed: 'Reviewed', dismissed: 'Dismissed' };
const SOURCE_LABELS = { caption: 'Caption', first_comment: 'First comment', metadata: 'Post metadata', paid_partnership: 'Partnership metadata', alt_text: 'Image alt text', transcript: 'Transcript', hook_text: 'Cover text', ocr: 'Cover text', jev_manual_review: 'Requested JEV review', jev_semantic_scan: 'JEV discovery' };
const FAMILY_LABELS = { explicit: 'Disclosure language', relationship: 'Brand relationship', affiliate: 'Affiliate or referral offer', cta: 'Call to action', commercial: 'Commercial language', hashtag: 'Hashtag signal', metadata: 'Post metadata', stack: 'Related-post support' };
const RECOMMENDATIONS = { possible_missed_promotion: 'Possible missed promotion', conflicting_evidence: 'Conflicting evidence', human_review: 'Needs human review', no_promotion_signal: 'No promotion signal found', assessment_available: 'Assessment available' };
const identity = (item) => `${item?.account || ''}:${item?.shortcode || ''}`;
const text = (value) => typeof value === 'string' ? value : '';
const classificationLabel = (value) => makeT(readLang())(CLASSIFICATION_LABELS[value] || value || 'Unclassified');
const sourceLabel = (value) => makeT(readLang())(SOURCE_LABELS[value] || (value ? String(value).replaceAll('_', ' ') : 'Source not recorded'));
const initialDraft = (item) => ({ classification: text(item.classification) || 'needs_review', client: text(item.client), product: text(item.product) });
function dateLabel(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(readLang() === 'es' ? 'es-CR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Costa_Rica' }).format(date) : makeT(readLang())('Date unavailable');
}
function captionMatches(caption, evidence) {
  const ranges = [];
  for (const entry of evidence) {
    if (entry.source !== 'caption' || !text(entry.text)) continue;
    let from = 0;
    while (from < caption.length) {
      const start = caption.indexOf(entry.text, from);
      if (start < 0) break;
      ranges.push([start, start + entry.text.length]);
      from = start + entry.text.length;
    }
  }
  return ranges.sort((a, b) => a[0] - b[0]).reduce((merged, range) => {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else merged.push([...range]);
    return merged;
  }, []);
}
function HighlightedCaption({ caption, ranges }) {
  const parts = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    parts.push(caption.slice(cursor, start), <mark key={`${start}:${end}`}>{caption.slice(start, end)}</mark>);
    cursor = end;
  }
  parts.push(caption.slice(cursor));
  return parts;
}
function SafeLink({ url, children, busy = false, className = '' }) {
  const href = safeExternalUrl(url);
  if (!href) return null;
  return <a className={className} href={busy ? undefined : href} role="link" aria-disabled={busy || undefined} target="_blank" rel="noopener noreferrer">{children || href}<ExternalLink size={13} aria-hidden="true" /></a>;
}

function useReviewMotion(backdropRef, dialogRef, entry, closing, onExited) {
  const animationsRef = useRef([]);
  const interrupted = useRef(null);
  const sequence = useRef(0);
  const arrival = useRef(entry);
  const exitCallback = useRef(onExited);
  exitCallback.current = onExited;
  const motionOff = () => document.documentElement.dataset.effects === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useLayoutEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const settle = () => { if (motionOff()) animationsRef.current.forEach(animation => animation.finish()); };
    const observer = new MutationObserver(settle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-effects'] });
    media.addEventListener('change', settle);
    return () => { observer.disconnect(); media.removeEventListener('change', settle); };
  }, []);
  useLayoutEffect(() => {
    const token = ++sequence.current;
    const backdrop = backdropRef.current, dialog = dialogRef.current;
    const resuming = Boolean(interrupted.current);
    const current = interrupted.current || { opacity: getComputedStyle(backdrop).opacity, transform: getComputedStyle(dialog).transform };
    interrupted.current = null;
    animationsRef.current.forEach(animation => animation.cancel());
    animationsRef.current = [];
    const finish = () => { if (closing && sequence.current === token) exitCallback.current(); };
    if (motionOff() || typeof dialog.animate !== 'function') { finish(); return; }
    const styles = getComputedStyle(document.documentElement);
    const duration = (name, fallback) => {
      const value = styles.getPropertyValue(name).trim();
      return value && Number.isFinite(parseFloat(value)) ? parseFloat(value) * (value.endsWith('ms') ? 1 : 1000) : fallback;
    };
    const easing = styles.getPropertyValue('--ease-out').trim() || 'cubic-bezier(.16,1,.3,1)';
    const animate = (node, frames, timing) => {
      const animation = node.animate(frames, { easing, fill: 'both', ...timing });
      animationsRef.current.push(animation);
      return animation;
    };
    if (closing) {
      dialog.focus({ preventScroll: true });
      const timing = { duration: duration('--motion-exit', 180), easing: 'cubic-bezier(.4,0,1,1)' };
      animate(backdrop, [{ opacity: current.opacity }, { opacity: 0 }], timing);
      animate(dialog, [{ transform: current.transform }, { transform: 'translateY(10px) scale(.988)' }], timing);
    } else if (arrival.current === 'open') {
      animate(backdrop, [{ opacity: resuming ? current.opacity : 0 }, { opacity: 1 }], { duration: duration('--motion-base', 220) });
      animate(dialog, [{ transform: resuming ? current.transform : 'translateY(18px) scale(.984)' }, { transform: 'none' }], { duration: duration('--motion-enter', 360) });
    } else {
      const offset = arrival.current === 'backward' ? -12 : 12;
      dialog.querySelectorAll('.promo-review-header > div,.promo-review-summary,.promo-review-attention,.promo-review-layout').forEach(node => {
        animate(node, [{ opacity: 0, transform: `translateX(${offset}px)` }, { opacity: 1, transform: 'none' }], { duration: duration('--motion-base', 220) });
      });
    }
    const animations = animationsRef.current;
    Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (sequence.current !== token) return;
      if (closing) finish();
      else { animations.forEach(animation => animation.cancel()); animationsRef.current = []; }
    });
    return () => {
      interrupted.current = { opacity: getComputedStyle(backdrop).opacity, transform: getComputedStyle(dialog).transform };
      sequence.current += 1; animations.forEach(animation => animation.cancel()); animationsRef.current = [];
    };
  }, [closing]);
}

// Keep the last detail mounted through its exit, including an end-of-queue save.
// Key only the editor by post, so a JEV-only update retains unsaved corrections.
export default function PromoReviewDialog(props) {
  const [retained, setRetained] = useState(props.item ? props : null);
  useLayoutEffect(() => { if (props.item) setRetained(props); }, [props]);
  const current = props.item ? props : retained;
  if (!current) return null;
  const changed = retained && identity(retained.item) !== identity(current.item);
  const entry = changed ? (current.position?.index < retained.position?.index ? 'backward' : 'forward') : 'open';
  return <ReviewDialog key={identity(current.item)} {...current} entry={entry} closing={!props.item} onExited={() => setRetained(null)} />;
}

function ReviewDialog({ item, relatedItems = [], onClose, onSave, onJevReview, onSelect, position, onPrevious, onNext, entry, closing, onExited }) {
  const { t } = usePrefs();
  const titleId = useId();
  const [draft, setDraft] = useState(() => initialDraft(item));
  const [operation, setOperation] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copyState, setCopyState] = useState('');
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const backdropRef = useRef(null);
  const dialogRef = useRef(null);
  const pendingRef = useRef(false);
  const mountedRef = useRef(false);
  const closeRef = useRef(onClose);
  const busy = Boolean(operation) || closing;
  const caption = text(item.caption);
  const evidence = useMemo(() => Array.isArray(item.evidence) ? item.evidence.filter(entry => entry && typeof entry === 'object') : [], [item.evidence]);
  const groups = useMemo(() => {
    const result = new Map();
    for (const entry of evidence) {
      const family = text(entry.family) || 'other';
      if (!result.has(family)) result.set(family, []);
      result.get(family).push(entry);
    }
    return [...result.entries()];
  }, [evidence]);
  const ranges = useMemo(() => captionMatches(caption, evidence), [caption, evidence]);
  const inspection = useMemo(() => inspectPromo(item), [item]);
  const related = useMemo(() => getRelatedPromos(item, relatedItems).slice(0, 6), [item, relatedItems]);
  const jev = item.jev_review && typeof item.jev_review === 'object' ? item.jev_review : null;
  const support = typeof jev?.semanticPromo === 'number' && Number.isFinite(jev.semanticPromo) && jev.semanticPromo >= 0 && jev.semanticPromo <= 1 ? Math.round(jev.semanticPromo * 100) : null;
  const dirty = Object.keys(draft).some(key => draft[key] !== initialDraft(item)[key]);
  const links = Array.isArray(item.links) ? item.links.filter(link => safeExternalUrl(typeof link === 'string' ? link : link?.url)) : [];
  const reviewStatus = t(REVIEW_LABELS[item.review_status] || 'Not reviewed');
  const index = Number(position?.index);
  const total = Number(position?.total);

  useLayoutEffect(() => {
    mountedRef.current = true;
    const previous = document.activeElement;
    const backdrop = backdropRef.current;
    const background = [...document.body.children].filter(node => node !== backdrop && !node.inert);
    const overflow = document.body.style.overflow;
    background.forEach(node => { node.inert = true; });
    document.body.style.overflow = 'hidden';
    dialogRef.current.querySelector('[data-autofocus]')?.focus({ preventScroll: true });
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!pendingRef.current) closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      const nodes = [...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(node => !node.hidden && !node.closest('[inert]') && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden');
      const first = nodes[0], last = nodes.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      mountedRef.current = false;
      document.removeEventListener('keydown', onKey, true);
      background.forEach(node => { node.inert = false; });
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus?.({ preventScroll: true });
    };
  }, []);
  useReviewMotion(backdropRef, dialogRef, entry, closing, onExited);

  const navigate = async (action, { discard = false } = {}) => {
    if (pendingRef.current || closing || !action) return;
    if (dirty && !discard) { setPendingNavigation({ action }); return; }
    pendingRef.current = true;
    setPendingNavigation(null); setOperation('navigate'); setError(''); setNotice('');
    try { await action(); }
    catch (reason) { if (mountedRef.current) setError(reason?.message || 'Could not open that post. Your current review is still here.'); }
    finally { pendingRef.current = false; if (mountedRef.current) setOperation(''); }
  };
  closeRef.current = () => navigate(onClose);
  const save = async (reviewStatus, advance = false) => {
    if (pendingRef.current || closing) return;
    pendingRef.current = true;
    setPendingNavigation(null); setOperation(reviewStatus || 'save'); setError(''); setNotice('');
    try {
      await onSave({ classification: draft.classification, client: draft.client.trim(), product: draft.product.trim(), ...(reviewStatus ? { review_status: reviewStatus } : {}) }, { advance });
      if (mountedRef.current) { setDraft(current => ({ ...current, client: current.client.trim(), product: current.product.trim() })); setNotice(reviewStatus ? 'Review saved.' : 'Corrections saved.'); }
    } catch (reason) {
      if (mountedRef.current) setError(reason?.message || 'The review could not be saved. Your corrections are still here. Try again.');
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setOperation('');
    }
  };
  const reviewWithJev = async () => {
    if (pendingRef.current || closing) return;
    pendingRef.current = true;
    setOperation('jev'); setError(''); setNotice('');
    try {
      await onJevReview();
      if (mountedRef.current) setNotice('JEV assessment updated. Compare it with the source evidence before saving your review.');
    } catch (reason) {
      if (mountedRef.current) setError(reason?.message || 'JEV could not complete this review. Try again.');
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setOperation('');
    }
  };
  const copyBrief = async () => {
    try { await navigator.clipboard.writeText(buildReviewBrief(item, relatedItems, t)); if (mountedRef.current) setCopyState('Review brief copied.'); }
    catch { if (mountedRef.current) setCopyState('Could not copy. Check clipboard access and try again.'); }
  };

  return createPortal(
    <div ref={backdropRef} className="promo-modal promo-review-modal" data-state={closing ? 'closing' : 'open'} onMouseDown={event => {
      if (event.target === event.currentTarget) navigate(onClose);
    }}>
      <section ref={dialogRef} className="promo-dialog promo-review-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} tabIndex={-1}>
        <header className="promo-review-header">
          <div>
            <span className="promo-kicker">{t("Promotion review")}</span>
            <h2 id={titleId}>{t("Review @")}{item.account || t("unknown account")}</h2>
            {Number.isFinite(index) && index >= 0 && total > 0 ? <span className="promo-review-position">{index + 1} {t("of")} {total} {t("loaded signals")}</span> : <span className="promo-review-position">{t("Outside current filtered view")}</span>}
          </div>
          <nav aria-label={t("Review navigation")}>
            <button type="button" aria-label={t("Previous signal")} disabled={busy || !onPrevious || index <= 0} onClick={() => navigate(onPrevious)}><ArrowLeft size={17} /></button>
            <button type="button" aria-label={t("Next signal")} disabled={busy || !onNext || (total > 0 && index >= total - 1)} onClick={() => navigate(onNext)}><ArrowRight size={17} /></button>
            <button type="button" className="promo-close" data-autofocus aria-label={t("Close promotion review")} disabled={busy} onClick={() => navigate(onClose)}><X size={20} /></button>
          </nav>
        </header>
        {pendingNavigation ? <div className="promo-unsaved-confirmation" role="alert">
          <p><strong>{t("Discard unsaved corrections?")}</strong> {t("Your classification, client or product edits have not been saved.")}</p>
          <div><button type="button" onClick={() => setPendingNavigation(null)}>{t("Keep editing")}</button><button type="button" onClick={() => navigate(pendingNavigation.action, { discard: true })}>{t("Discard changes & continue")}</button></div>
        </div> : null}
        {operation === 'navigate' ? <p className="promo-review-notice" role="status">{t("Opening review…")}</p> : null}
        <div className="promo-review-summary">
          <dl>
            <div><dt>{t("Current classification")}</dt><dd><span className={`promo-badge ${item.classification || 'needs_review'}`}>{classificationLabel(item.classification)}</span></dd></div>
            <div><dt>{t("Human review")}</dt><dd><span className={`promo-review-status ${item.review_status || 'new'}`}>{reviewStatus}</span></dd></div>
            <div><dt>{t("Client / brand")}</dt><dd>{item.client || t("Not identified")}</dd></div>
            <div><dt>{t("Product")}</dt><dd>{item.product || t("Not identified")}</dd></div>
          </dl>
          <p className="promo-by">{item.account_group_label || item.account_group || t("Account group unavailable")} {t("· Published")} {dateLabel(item.published_at)} {t("· Costa Rica time")}</p>
          <p className="promo-review-context">
            {item.overrides?.classification ? t("Classification includes a saved human correction.") : item.classification_source === 'jev_semantic_scan' ? t("Discovered through JEV review of stored posts.") : t("Flagged by stored-post detection rules.")} {t("A promotion signal alone does not confirm payment.")} </p>
        </div>
        {inspection.reasons.length ? <section className="promo-review-attention" aria-label={t("Points to check")}>
          <h3>{t("Points to check")}</h3>
          <ul>{inspection.reasons.map(reason => <li key={reason.code}><strong>{t(reason.label)}</strong><span>{t(reason.detail)}</span></li>)}</ul>
        </section> : null}
        <div className="promo-review-layout">
          <div className="promo-review-main">
            <section className="promo-review-section" aria-label={t("Full caption")}>
              <header><h3>{t("Full caption")}</h3><SafeLink url={item.permalink} busy={busy}>{t("Open original post")}</SafeLink></header>
              <p className="promo-section-help">{t("Highlighted text is an exact match to stored caption evidence.")}</p>
              <div className="promo-caption">{caption ? <HighlightedCaption caption={caption} ranges={ranges} /> : t("Caption unavailable in this stored record.")}</div>
            </section>
            <section className="promo-review-section" aria-label={t("Detection evidence")}>
              <header><h3>{t("Detection evidence")}</h3><span>{evidence.length} {t("stored signals")}</span></header>
              {groups.length ? <div className="promo-evidence-list">{groups.map(([family, entries]) => (
                <section className="promo-evidence-group" key={family}>
                  <h4>{t(FAMILY_LABELS[family] || "Other stored evidence")}</h4>
                  {entries.map((entry, entryIndex) => {
                    const exact = entry.source === 'caption' && Boolean(text(entry.text)) && caption.includes(entry.text);
                    return <article className="promo-evidence-item" key={`${entry.rule}:${entryIndex}`}>
                      <header><strong>{entry.rule || t("Stored signal")}</strong><span className="promo-source-label">{sourceLabel(entry.source)}</span></header>
                      <blockquote>{text(entry.text) || t("No excerpt stored.")}</blockquote>
                      <small>{exact ? t("Exact excerpt found in the caption above.") : entry.source === 'caption' ? t("Not found verbatim in this caption. Check the original post.") : t("Stored context evidence; not highlighted as caption text.")}</small>
                    </article>;
                  })}
                </section>
              ))}</div> : <p className="promo-review-empty">{t("No rule evidence excerpts were stored. Review the caption and available JEV context.")}</p>}
            </section>
            <section className="promo-review-section promo-jev" aria-label={t("JEV assessment")}>
              <header>
                <div><h3>{t("JEV assessment")}</h3><p className="promo-section-help">{t("Run a semantic review only when you need another reading of the stored context.")}</p></div>
                <button type="button" disabled={busy || !onJevReview} onClick={reviewWithJev}>
                  {operation === 'jev' ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}
                  {operation === 'jev' ? t("Reviewing with JEV…") : t("Review with JEV")}
                </button>
              </header>
              {jev ? <div className={`promo-jev-result ${jev.recommendation || ''}`}>
                <h4>{t(RECOMMENDATIONS[jev.recommendation] || "Stored assessment")}</h4>
                <dl>
                  <div><dt>{t("Commercial intent support")}</dt><dd>{support === null ? t("Not available") : `${support}% semantic support`}</dd></div>
                  <div><dt>{t("Relationship reading")}</dt><dd>{t(RELATIONSHIP_LABELS[jev.commercialRelationship] || "Unclear relationship")}</dd></div>
                  <div><dt>{t("Rules result at JEV review")}</dt><dd>{classificationLabel(jev.deterministicClassification)}</dd></div>
                  <div><dt>{t("Assessment source")}</dt><dd>{sourceLabel(jev.source)}</dd></div>
                </dl>
                {jev.guidance ? <p>{text(jev.guidance)}</p> : null}
                {jev.contextExcerpt ? <blockquote><span className="promo-source-label">{sourceLabel(jev.contextSource)}</span><p>{text(jev.contextExcerpt)}</p></blockquote> : <p>{t("No context excerpt was saved with this assessment.")}</p>}
                <small>{t("Semantic support measures commercial intent in the available text. It is not a payment probability. The historical rules result may differ from the current classification.")}</small>
                {jev.reviewedAt ? <p className="promo-date">{t("Reviewed")} {dateLabel(jev.reviewedAt)} {t("· Costa Rica time")}</p> : null}
              </div> : <p className="promo-review-empty">{t("No JEV assessment yet. The action above runs one for this post.")}</p>}
            </section>
            <section className="promo-review-section" aria-label={t("Related loaded signals")}>
              <header><h3>{t("Compare related signals")}</h3><span>{t("Loaded posts only")}</span></header>
              <p className="promo-section-help">{t("A shared brand or topic helps comparison; it does not establish a paid campaign.")}</p>
              {related.length ? <div className="promo-related-list">{related.map(({ item: relatedItem, label }) => (
                <button type="button" key={identity(relatedItem)} disabled={busy || !onSelect} onClick={() => navigate(() => onSelect(relatedItem))}>
                  <strong>@{relatedItem.account}</strong><small>{t(label)}</small>
                  <span>{relatedItem.client || t("Client unknown")} · {relatedItem.product || t("Product unknown")}</span>
                  <span>{classificationLabel(relatedItem.classification)} · {t(REVIEW_LABELS[relatedItem.review_status] || "Not reviewed")}</span>
                  <small>{dateLabel(relatedItem.published_at)}</small>
                </button>
              ))}</div> : <p className="promo-review-empty">{t("No related signals in the loaded results.")}</p>}
            </section>
          </div>
          <aside className="promo-review-sidebar">
            <form className="promo-review-section" onSubmit={event => { event.preventDefault(); if (dirty) save(); }}>
              <h3>{t("Review corrections")}</h3>
              <p className="promo-section-help">{t("Correct the assessment using the evidence. Review status is tracked separately.")}</p>
              <div className="promo-review-fields">
                <label>{t("Classification")} <select aria-label={t("Classification")} value={draft.classification} disabled={busy} onChange={event => setDraft(current => ({ ...current, classification: event.target.value }))}>
                    {!CLASSIFICATION_LABELS[draft.classification] ? <option value={draft.classification}>{draft.classification}</option> : null}
                    {Object.entries(CLASSIFICATION_LABELS).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
                  </select>
                </label>
                <label>{t("Client / brand")}<input aria-label={t("Client / brand")} value={draft.client} disabled={busy} onChange={event => setDraft(current => ({ ...current, client: event.target.value }))} placeholder={t("Not identified")} /></label>
                <label>{t("Product")}<input aria-label={t("Product")} value={draft.product} disabled={busy} onChange={event => setDraft(current => ({ ...current, product: event.target.value }))} placeholder={t("Not identified")} /></label>
              </div>
              <p className="promo-review-draft-status">{dirty ? t("Unsaved corrections") : t("Showing saved values")}</p>
              <button type="submit" disabled={busy || !dirty}>{operation === 'save' ? t("Saving…") : t("Save corrections")}</button>
            </form>
            <section className="promo-review-section">
              <h3>{t("Offer details")}</h3>
              <dl><div><dt>{t("Automation keyword")}</dt><dd>{text(item.cta?.keyword) || t("None stored")}</dd></div><div><dt>{t("Promotion code")}</dt><dd>{text(item.promo_code) || t("None stored")}</dd></div></dl>
              {links.length ? <ul className="promo-link-list">{links.map((link, linkIndex) => <li key={linkIndex}><span className="promo-source-label">{sourceLabel(link.source)}</span><SafeLink url={typeof link === 'string' ? link : link.url} busy={busy} /></li>)}</ul> : <p className="promo-review-empty">{t("No valid web links stored.")}</p>}
              {Array.isArray(item.client_candidates) && item.client_candidates.some(candidate => text(candidate?.name)) ? <div className="promo-review-candidates">
                <h4>{t("Extracted brand candidates")}</h4><p className="promo-section-help">{t("Verify these names before correcting the client.")}</p>
                <ul>{item.client_candidates.filter(candidate => text(candidate?.name)).map((candidate, candidateIndex) => <li key={candidateIndex}><strong>{candidate.name}</strong><span className="promo-source-label">{sourceLabel(candidate.source)}</span></li>)}</ul>
              </div> : null}
            </section>
            <section className="promo-review-section">
              <h3>{t("Review brief")}</h3><p className="promo-section-help">{t("Copy the saved assessment, source evidence and related context. Unsaved corrections are not included.")}</p>
              <button type="button" disabled={busy} onClick={copyBrief}>{copyState === 'Review brief copied.' ? <Check size={15} /> : <Copy size={15} />}{t("Copy review brief")}</button>
              {copyState ? <p role="status">{t(copyState)}</p> : null}
            </section>
          </aside>
        </div>
        <footer className="promo-review-footer">
          <div className="promo-review-feedback" aria-live="polite">
            {error ? <p className="promo-error" role="alert">{t(error)}</p> : notice ? <p className="promo-review-notice" role="status">{t(notice)}</p> : <p>{t("Review actions save your corrections. Dismissal alone does not change the classification.")}</p>}
          </div>
          <div className="promo-actions">
            {item.review_status === 'reviewed' || item.review_status === 'dismissed' ? <button type="button" disabled={busy} onClick={() => save('new')}><RotateCcw size={15} />{operation === 'new' ? t("Restoring…") : t("Restore to new")}</button> : null}
            <button type="button" disabled={busy} onClick={() => save('dismissed', true)}>{operation === 'dismissed' ? t("Saving…") : t("Dismiss & next")}</button>
            <button type="button" className="promo-primary" disabled={busy} onClick={() => save('reviewed', true)}>
              {operation === 'reviewed' ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}{operation === 'reviewed' ? t("Saving…") : t("Mark reviewed & next")}
            </button>
          </div>
        </footer>
      </section>
    </div>, document.body,
  );
}
