import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, ExternalLink, FileText, LoaderCircle, RotateCcw, Sparkles, X } from 'lucide-react';
import { API_BASE, apiFetch } from './api';
import { usePrefs } from './prefsContext';
import './caption-generator.css';

const activeAccount = account => account.group === 'sentient' && ![false, 0].includes(account.is_active) && ![false, 0].includes(account.active);
const sameOptions = (left, right) => left.targetAccount === right.targetAccount && left.outputLanguage === right.outputLanguage && left.removeManychat === right.removeManychat;
const normalize = text => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const languages = { same: 'Same as original', en: 'English', es: 'Español', pt: 'Português' };
const safeLink = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };

function Review({ draft, t }) {
  if (!draft) return null;
  const edited = draft.caption !== draft.generatedCaption;
  const verification = draft.verification;
  const scores = [['Fact fidelity', verification?.factFidelity], ['Account fit', verification?.targetAlignment], ['Unsupported claims risk', verification?.unsupportedClaims]];
  const concerns = [];
  if (typeof verification?.factFidelity === 'number' && verification.factFidelity < .78) concerns.push('Compare facts, names, and numbers with the source.');
  if (typeof verification?.targetAlignment === 'number' && verification.targetAlignment < .82) concerns.push('Check that mentions and calls to action fit the target account.');
  if (typeof verification?.unsupportedClaims === 'number' && verification.unsupportedClaims > .22) concerns.push('Remove claims or promises that the source does not support.');
  return <div className="caption-generator-review-block">
    {edited && (verification || draft.warning) ? <p className="caption-generator-review" role="status"><strong>{t(verification ? 'Edited since review' : 'Edited draft')}</strong> {t(verification ? 'JEV feedback applies to the generated version, not your edits.' : 'No JEV review available')}</p>
      : draft.warning ? <p className="caption-generator-review" role="status">{t(draft.warning)}</p>
        : <p className="caption-generator-review-status">{t(verification?.accepted === true ? 'JEV review passed' : verification ? 'JEV suggests a closer review' : 'No JEV review available')}</p>}
    {verification ? <details className="caption-generator-review-details" open={verification.accepted === false}>
      <summary>{t('JEV feedback')}</summary>
      <p>{t('Automated guidance for the generated version. Compare it with the source before using it.')}</p>
      <dl>{scores.filter(([, score]) => typeof score === 'number' && Number.isFinite(score)).map(([label, score]) => <div key={label}><dt>{t(label)}</dt><dd>{Math.round(Math.max(0, Math.min(1, score)) * 100)}%</dd></div>)}</dl>
      {concerns.length > 0 ? <ul>{concerns.map(concern => <li key={concern}>{t(concern)}</li>)}</ul> : null}
    </details> : null}
  </div>;
}

export default function GenerateCaptionModal({ post, accounts, onClose, draftStore }) {
  const { t } = usePrefs();
  const titleId = useId();
  const destinations = accounts.filter(activeAccount);
  const sourceKey = `${post.account}:${post.shortcode}`;
  const [session, setSession] = useState(() => draftStore?.get(sourceKey) || {
    options: { targetAccount: destinations.some(account => account.handle === post.account) ? post.account : '', outputLanguage: 'same', removeManychat: false },
    drafts: [], activeId: null, comparisonId: 'source',
  });
  const { options, drafts, activeId, comparisonId } = session;
  const draft = drafts.find(item => item.id === activeId);
  const comparison = drafts.find(item => String(item.id) === comparisonId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [source, setSource] = useState(post.caption || '');
  const [sourceState, setSourceState] = useState(post.captionTruncated ? 'loading' : 'ready');
  const [sourceRevision, setSourceRevision] = useState(0);
  const dialog = useRef(null);
  const operation = useRef(null);
  const copyTimer = useRef(null);
  const currentDraft = useRef(draft);
  currentDraft.current = draft;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // The owning Dashboard is keyed by the signed-in user. This store survives
  // closing the dialog, but is discarded when that Research session ends.
  useLayoutEffect(() => { draftStore?.set(sourceKey, session); }, [draftStore, sourceKey, session]);

  useEffect(() => {
    if (!post.captionTruncated) return undefined;
    const controller = new AbortController();
    setSourceState('loading');
    apiFetch(`${API_BASE}/api/dashboard/posts/${encodeURIComponent(post.account)}/${encodeURIComponent(post.shortcode)}/detail`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Source unavailable');
        const detail = await response.json();
        if (typeof detail.caption !== 'string' || !detail.caption.trim()) throw new Error('Source unavailable');
        if (!controller.signal.aborted) { setSource(detail.caption); setSourceState('ready'); }
      })
      .catch(() => { if (!controller.signal.aborted) setSourceState('error'); });
    return () => controller.abort();
  }, [post.account, post.shortcode, post.captionTruncated, sourceRevision]);

  useEffect(() => {
    const previous = document.activeElement;
    const backdrop = dialog.current.parentElement;
    const background = [...document.body.children].filter(node => node !== backdrop && !node.inert && !['SCRIPT', 'STYLE'].includes(node.tagName));
    const overflow = document.body.style.overflow;
    background.forEach(node => { node.inert = true; });
    document.body.style.overflow = 'hidden';
    dialog.current.querySelector('select')?.focus({ preventScroll: true });
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const nodes = [...dialog.current.querySelectorAll('button:not(:disabled),a[href],select:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary')].filter(node => node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (!nodes.length) { event.preventDefault(); dialog.current.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      operation.current?.controller.abort();
      clearTimeout(operation.current?.timer);
      operation.current = null;
      clearTimeout(copyTimer.current);
      document.removeEventListener('keydown', onKey, true);
      background.forEach(node => { node.inert = false; });
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus?.({ preventScroll: true });
    };
  }, []);

  const changeOptions = change => {
    setSession(current => ({ ...current, options: { ...current.options, ...change } }));
    setCopied(false); setError('');
  };
  const edit = caption => {
    setSession(current => ({ ...current, drafts: current.drafts.map(item => item.id === current.activeId ? { ...item, caption } : item) }));
    setCopied(false); setError('');
  };
  const selectDraft = id => {
    const chosen = drafts.find(item => item.id === id);
    setSession(current => ({ ...current, activeId: id, options: { ...chosen.options }, comparisonId: current.comparisonId === String(id) ? 'source' : current.comparisonId }));
    setCopied(false); setError('');
  };

  const generate = async event => {
    event.preventDefault();
    if (operation.current) return;
    if (!destinations.some(account => account.handle === options.targetAccount)) { setError(t('Choose the account this caption is for.')); return; }
    if (!languages[options.outputLanguage]) { setError(t('Choose the language for the generated caption.')); return; }
    const requestOptions = { ...options };
    const previous = draft && sameOptions(draft.options, requestOptions) ? draft.caption.trim() : '';
    const request = { controller: new AbortController(), timedOut: false, timer: null };
    request.timer = setTimeout(() => { request.timedOut = true; request.controller.abort(); }, 180000);
    operation.current = request;
    setBusy(true); setError(''); setCopied(false);
    try {
      const body = new FormData();
      body.append('source_account', post.account);
      body.append('shortcode', post.shortcode);
      body.append('target_account', requestOptions.targetAccount);
      body.append('output_language', requestOptions.outputLanguage);
      body.append('remove_manychat_automation', String(requestOptions.removeManychat));
      if (previous) body.append('previous_caption', previous);
      const response = await apiFetch(`${API_BASE}/api/dashboard/posts/generate-caption`, { method: 'POST', body, signal: request.controller.signal });
      const data = await response.json().catch(() => ({}));
      if (operation.current !== request) return;
      if (request.controller.signal.aborted) {
        if (request.timedOut) throw new DOMException('Generation timed out.', 'TimeoutError');
        return;
      }
      const detail = typeof data.detail === 'string' ? data.detail : data.detail?.message;
      if (!response.ok) throw new Error(detail ? t(detail) : t('Could not generate a caption right now.'));
      const caption = typeof data.caption === 'string' ? data.caption.trim() : '';
      if (!caption) throw new Error(t('No caption was returned. Your drafts are safe. Try again.'));
      if (previous && normalize(caption) === normalize(previous)) throw new Error(t('The same wording was returned. Your current draft is safe. Try again.'));
      setSession(current => {
        const id = (current.drafts.at(-1)?.id || 0) + 1;
        const next = { id, caption, generatedCaption: caption, options: requestOptions, verification: data.jevVerification || null, warning: typeof data.jevWarning === 'string' ? data.jevWarning : '' };
        return { ...current, drafts: [...current.drafts, next], activeId: id };
      });
    } catch (reason) {
      if (operation.current !== request) return;
      if (request.timedOut) setError(t('Generation took too long. Your drafts are safe. Try again.'));
      else if (reason.name !== 'AbortError') setError(reason.message || t('Could not generate a caption right now.'));
    } finally {
      clearTimeout(request.timer);
      if (operation.current === request) { operation.current = null; setBusy(false); }
    }
  };

  const copy = async () => {
    if (!draft?.caption.trim()) return;
    const snapshot = draft;
    try {
      await navigator.clipboard.writeText(snapshot.caption);
      if (!dialog.current || currentDraft.current !== snapshot) return;
      setCopied(true); setError(''); clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1800);
    } catch { if (dialog.current) setError(t('Could not copy the caption.')); }
  };
  const characters = Array.from(draft?.caption || '').length;
  const words = draft?.caption.trim() ? draft.caption.trim().split(/\s+/u).length : 0;
  const optionsChanged = draft && !sameOptions(draft.options, options);
  const originalLink = safeLink(post.permalink);

  return createPortal(<div className="queue-modal-backdrop caption-generator-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <form ref={dialog} className="queue-assign-modal caption-generator-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onSubmit={generate}>
      <header className="queue-assign-head">
        <div><p className="section-label">{t('AI caption')}</p><h2 id={titleId}>{t('Generate a similar caption')}</h2><p className="caption-generator-intro">{t('Keep the idea. Find your voice. Refine every version.')}</p></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label={t('Close caption generator')}><X size={18} /></button>
      </header>

      <div className="caption-generator-options">
        <label className="caption-generator-field"><span>{t('Which account is this for?')}</span>
          <select value={options.targetAccount} onChange={event => changeOptions({ targetAccount: event.target.value })} disabled={busy}>
            <option value="">{t('Choose a Sentient account…')}</option>
            {destinations.map(account => <option key={account.handle} value={account.handle}>{account.label || account.handle} · @{account.handle}</option>)}
          </select><small>{t("The result follows that account's recent tone, language, CTAs, and formatting.")}</small>
        </label>
        <label className="caption-generator-field"><span>{t('What language should the result use?')}</span>
          <select value={options.outputLanguage} onChange={event => changeOptions({ outputLanguage: event.target.value })} disabled={busy}>{Object.entries(languages).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select>
          <small>{t('Changing settings keeps your existing drafts.')}</small>
        </label>
      </div>
      <label className="caption-generator-manychat"><input type="checkbox" checked={options.removeManychat} onChange={event => changeOptions({ removeManychat: event.target.checked })} disabled={busy} /><span><strong>{t('Remove ManyChat automation')}</strong><small>{t('Remove comment or DM keywords and promises to send links, prompts, codes, guides, or lists.')}</small></span></label>
      {!destinations.length ? <p className="queue-assign-error" role="alert">{t('No active Sentient account is available for this caption.')}</p> : null}

      <div className="caption-generator-workspace">
        <section className="caption-generator-reference" aria-label={t('Caption comparison')}>
          <div className="caption-generator-pane-head"><div><h3>{t('Compare with')}</h3><small>{comparison ? `@${comparison.options.targetAccount} · ${t(languages[comparison.options.outputLanguage])}` : `${t('Inspired by')} @${post.account}`}</small></div>
            <select aria-label={t('Compare with')} value={comparisonId} onChange={event => setSession(current => ({ ...current, comparisonId: event.target.value }))}>
              <option value="source">{t('Original caption')}</option>{drafts.filter(item => item.id !== activeId).map(item => <option key={item.id} value={String(item.id)}>{t('Draft')} {item.id}</option>)}
            </select>
          </div>
          {!comparison && sourceState !== 'ready' ? <p className="caption-generator-source-note" role="status">{t(sourceState === 'loading' ? 'Loading the full source caption…' : 'Showing a preview. The full source could not be loaded.')}{sourceState === 'error' ? <button type="button" className="text-button" onClick={() => setSourceRevision(value => value + 1)}>{t('Retry')}</button> : null}</p> : null}
          <div className="caption-generator-reference-text" tabIndex={0}>{comparison?.caption ?? (source || t('No caption preview is available.'))}</div>
          {originalLink ? <a className="caption-generator-original-link" href={originalLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />{t('Open original')}</a> : null}
        </section>

        <section className="caption-generator-draft" aria-label={t('Caption drafts')}>
          <div className="caption-generator-pane-head"><div><h3>{draft ? `${t('Draft')} ${draft.id}` : t('Your caption')}</h3><small>{draft ? `@${draft.options.targetAccount} · ${t(languages[draft.options.outputLanguage])}` : t('Original wording, adapted to your account.')}</small></div><FileText size={18} /></div>
          {drafts.length ? <nav className="caption-generator-history" aria-label={t('Draft history')}>{drafts.map(item => <button type="button" key={item.id} aria-pressed={item.id === activeId} disabled={busy} onClick={() => selectDraft(item.id)}>{t('Draft')} {item.id}{item.caption !== item.generatedCaption ? <span title={t('Edited')}> · {t('Edited')}</span> : null}</button>)}</nav> : null}
          {draft ? <>
            <label className="caption-generator-field caption-generator-result"><span>{t('Generated caption · editable')}</span><textarea aria-label={t('Generated caption · editable')} value={draft.caption} onChange={event => edit(event.target.value)} disabled={busy} spellCheck /></label>
            <div className="caption-generator-stats"><span>{characters.toLocaleString()} {t('characters')} · {words.toLocaleString()} {t('words')}</span>{draft.caption !== draft.generatedCaption ? <button type="button" className="text-button" disabled={busy} onClick={() => edit(draft.generatedCaption)}><RotateCcw size={12} />{t('Restore generated text')}</button> : null}</div>
            <Review draft={draft} t={t} />
          </> : <div className="caption-generator-empty"><Sparkles size={26} /><h3>{t('A fresh take starts here')}</h3><p>{t('Generate a caption, edit it in place, and keep every alternative for comparison.')}</p></div>}
          {busy ? <p className="caption-generator-busy" role="status"><LoaderCircle className="spin" size={15} />{t('Writing a new version… Your previous drafts are kept.')}</p> : null}
          {optionsChanged ? <p className="caption-generator-context">{t('New settings apply to the next draft. This draft keeps its original account and language.')}</p> : null}
        </section>
      </div>
      {error ? <p className="queue-assign-error" role="alert">{error}</p> : null}
      <footer className="caption-generator-footer"><p className="caption-generator-session-note">{t('Drafts are kept until you reload or leave Research.')}</p>
        <div className="queue-assign-actions caption-generator-actions">
          <button type="button" className="ghost-button" onClick={onClose}>{t('Close')}</button>
          {draft ? <button type="button" className="ghost-button" onClick={copy} disabled={!draft.caption.trim()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? t('Copied') : t('Copy caption')}</button> : null}
          <button type="submit" className="primary-button" disabled={busy || !destinations.some(account => account.handle === options.targetAccount)}><Sparkles size={14} />{busy ? t('Generating…') : draft && !optionsChanged ? t('Regenerate') : t('Generate caption')}</button>
        </div>
      </footer>
    </form>
  </div>, document.body);
}
