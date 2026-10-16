import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calculator, X } from 'lucide-react';
import { usePrefs } from './prefsContext';
import { calculatePostCosts, loadEngagementAccounts, normalizeEngagementAccounts, parsePositiveNumber, selectEngagementAccounts } from './promoEngagement';
import './promoEngagement.css';

const METRICS = [
  ['likes', 'Likes / post'], ['comments', 'Comments / post'],
  ['shares', 'Shares / post'], ['saves', 'Saves / post'],
  ['video_views', 'Video views / post'], ['impressions', 'Impressions / post'],
];
const GROUPS = { sentient: 'Ours', competitors: 'Competitors', leads: 'Leads' };
const localeFor = lang => lang === 'es' ? 'es-CR' : 'en-US';
const numberLabel = (value, lang, decimals = 1) => value == null ? '—' : new Intl.NumberFormat(localeFor(lang), { maximumFractionDigits: decimals }).format(value);
function dateLabel(value, lang) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(localeFor(lang), { dateStyle: 'medium', timeZone: 'America/Costa_Rica' }).format(date) : '—';
}
function MetricValue({ metric, total }) {
  const { t, lang } = usePrefs();
  return <span className="promo-engagement-value" title={metric?.count ? t('Known on {count} of {total} posts', { count: metric.count, total }) : t('No stored value')}>
    <span>{numberLabel(metric?.average, lang)}</span><small>{metric?.count ? t('{count} of {total} posts', { count: metric.count, total }) : t('No stored value')}</small>
  </span>;
}

function PriceCalculator({ account, onClose }) {
  const { t, lang } = usePrefs();
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [impressions, setImpressions] = useState('');
  const backdropRef = useRef(null), dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId(), priceHelp = useId(), impressionsHelp = useId();
  const costs = calculatePostCosts(account, price, { impressions: impressions === '' ? undefined : impressions });
  const invalidPrice = price !== '' && parsePositiveNumber(price) == null;
  const invalidImpressions = impressions !== '' && parsePositiveNumber(impressions) == null;
  const money = value => {
    if (value == null) return '—';
    const formatter = new Intl.NumberFormat(localeFor(lang), { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return value < 0.0001 ? `< ${formatter.format(0.0001)}` : formatter.format(value);
  };
  useLayoutEffect(() => {
    const previous = document.activeElement;
    const backdrop = backdropRef.current;
    const background = [...document.body.children].filter(node => node !== backdrop && !node.inert);
    const overflow = document.body.style.overflow;
    background.forEach(node => { node.inert = true; });
    document.body.style.overflow = 'hidden';
    dialogRef.current.querySelector('input')?.focus({ preventScroll: true });
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const nodes = [...dialogRef.current.querySelectorAll('button:not(:disabled),input,select')];
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      background.forEach(node => { node.inert = false; });
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus?.({ preventScroll: true });
    };
  }, []);

  const costRows = [
    ['cpe', 'CPE · public interaction', 'Price ÷ average (likes + comments) per post', account.engagement_post_count],
    ['completeCpe', 'CPE · full engagement', 'Price ÷ average (likes + comments + shares + saves) on fully measured posts', account.complete_engagement_post_count],
    ['cpm', 'CPM · 1,000 impressions', impressions !== '' ? 'Price ÷ expected impressions × 1,000' : 'Price ÷ average stored impressions × 1,000', impressions !== '' ? null : account.metrics.impressions.count],
    ['costPerThousandViews', 'Cost / 1,000 video views', 'Price ÷ average video views × 1,000', account.metrics.video_views.count],
    ['costPerLike', 'Cost / like', 'Price ÷ average likes per post', account.metrics.likes.count],
    ['costPerComment', 'Cost / comment', 'Price ÷ average comments per post', account.metrics.comments.count],
    ['costPerShare', 'Cost / share', 'Price ÷ average shares per post', account.metrics.shares.count],
    ['costPerSave', 'Cost / save', 'Price ÷ average saves per post', account.metrics.saves.count],
  ];
  return createPortal(<div ref={backdropRef} className="promo-modal promo-price-modal" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="promo-dialog promo-price-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className="promo-review-header"><div><span className="promo-review-position">{t('Simulate price')}</span><h2 id={titleId}>{t('Post price · @{account}', { account: account.handle })}</h2><span className="promo-by">{t('All stored history')} · {t('All formats')}</span></div><button type="button" aria-label={t('Close price calculator')} onClick={onClose}><X size={20} /></button></header>
      <div className="promo-price-body">
        <p className="promo-price-help promo-price-calculation">
          <span>{t('Calculated')}: <time data-calculated-at dateTime={account.calculated_at || undefined}>{dateLabel(account.calculated_at, lang)}</time></span><br />
          <span>{t('Valid until')}: <time data-cache-expires-at dateTime={account.cache_expires_at || undefined}>{dateLabel(account.cache_expires_at, lang)}</time></span><br />
          <span>{t('Calculation period')}: {account.calculation_period?.from ? <><time dateTime={account.calculation_period.from}>{dateLabel(account.calculation_period.from, lang)}</time> – <time dateTime={account.calculation_period.to}>{dateLabel(account.calculation_period.to, lang)}</time></> : account.calculation_period?.to ? t('All stored history through {date}', { date: dateLabel(account.calculation_period.to, lang) }) : '—'}</span>
        </p>
        <div className="promo-price-inputs">
          <label><span>{t('Price per post')}</span><input type="number" inputMode="decimal" min="0" step="any" value={price} placeholder="500" aria-invalid={invalidPrice || undefined} aria-describedby={priceHelp} onChange={event => setPrice(event.target.value)} /></label>
          <label><span>{t('Currency')}</span><select value={currency} onChange={event => setCurrency(event.target.value)}>{['USD', 'CRC', 'EUR'].map(code => <option key={code} value={code}>{code}</option>)}</select></label>
          <label className="promo-price-impressions"><span>{t('Expected impressions (optional)')}</span><input type="number" inputMode="decimal" min="0" step="any" value={impressions} placeholder={account.metrics.impressions.average == null ? t('Enter expected impressions') : String(Math.round(account.metrics.impressions.average))} aria-invalid={invalidImpressions || undefined} aria-describedby={impressionsHelp} onChange={event => setImpressions(event.target.value)} /></label>
        </div>
        <p id={priceHelp} className={invalidPrice ? 'promo-price-error' : 'promo-price-help'}>{t(invalidPrice ? 'Enter a positive price to calculate costs.' : 'This price is only for this simulation. It resets when you close the account.')}</p>
        <p id={impressionsHelp} className={invalidImpressions ? 'promo-price-error' : 'promo-price-help'}>{invalidImpressions ? t('Enter a positive number of impressions or leave it empty.') : impressions !== '' ? t('Uses the impressions you entered.') : account.metrics.impressions.count ? t('Stored impressions average: {value}', { value: numberLabel(account.metrics.impressions.average, lang) }) : t('No stored impressions. Enter an estimate to calculate CPM.')}</p>
        <section className="promo-price-results" aria-label={t('Cost estimate')} aria-live="polite">
          {costRows.map(([key, label, formula, count]) => <div key={key} className={['cpe', 'cpm'].includes(key) ? 'is-primary' : ''}>
            <span>{t(label)}</span><strong data-cost={key} data-value={costs[key] ?? ''}>{money(costs[key])}</strong><small>{t(formula)}</small>
            {count != null && <small>{t('Known on {count} of {total} posts', { count, total: account.post_count })}</small>}
          </div>)}
        </section>
        {!parsePositiveNumber(price) && <p className="promo-price-help">{t('Enter a positive price to calculate costs.')}</p>}
        <p className="promo-price-help">{t('Based on available historical averages, not guaranteed results. Each metric uses only posts with that metric.')}</p>
        <section className="promo-price-history"><h3>{t('Historical performance')}</h3><dl>
          <div><dt>{t('Engagement rate')}</dt><dd>{numberLabel(account.engagement_rate_pct, lang, 2)}{account.engagement_rate_pct != null ? '%' : ''}</dd></div>
          <div><dt>{t('Public interactions / post')}</dt><dd>{numberLabel(account.average_engagements, lang)}<small>{t('{count} of {total} posts', { count: account.engagement_post_count, total: account.post_count })}</small></dd></div>
          <div><dt>{t('Full engagement / post')}</dt><dd>{numberLabel(account.average_complete_engagements, lang)}<small>{t('{count} of {total} posts', { count: account.complete_engagement_post_count, total: account.post_count })}</small></dd></div>
          <div><dt>{t('Followers')}</dt><dd>{numberLabel(account.followers, lang, 0)}<small>{t('Follower snapshot')}: {dateLabel(account.followers_captured_at, lang)}</small></dd></div>
          {account.undated_post_count > 0 && <div><dt>{t('Posts without a stored date')}</dt><dd>{numberLabel(account.undated_post_count, lang, 0)}</dd></div>}
          {METRICS.map(([key, label]) => <div key={key}><dt>{t(label)}</dt><dd><MetricValue metric={account.metrics[key]} total={account.post_count} /></dd></div>)}
        </dl><p className="promo-price-help">{t('Post dates')}: {dateLabel(account.first_post_at, lang)} – {dateLabel(account.last_post_at, lang)}<br />{t('Latest metric update')}: {dateLabel(account.metrics_updated_at, lang)}</p></section>
      </div>
    </section>
  </div>, document.body);
}

export default function PromoEngagementTab({ request }) {
  const { t, lang } = usePrefs();
  const [group, setGroup] = useState(''), [handles, setHandles] = useState([]), [sort, setSort] = useState('engagement_rate');
  const [roster, setRoster] = useState(null), [rosterLoading, setRosterLoading] = useState(true), [rosterError, setRosterError] = useState('');
  const [applied, setApplied] = useState(null), [data, setData] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [selected, setSelected] = useState(null);
  const requestRef = useRef(null), rosterRequestRef = useRef(null), pickerRef = useRef(null);
  const pickerId = useId();
  const sortedHandles = useMemo(() => [...handles].sort(), [handles]);
  const draftKey = JSON.stringify(sortedHandles);
  const loadRoster = useCallback(async () => {
    rosterRequestRef.current?.abort();
    const controller = new AbortController(); rosterRequestRef.current = controller;
    setRosterLoading(true); setRosterError('');
    try {
      const body = await request('/api/admin/promos/engagement/accounts', { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!Array.isArray(body.accounts)) throw new Error('Account list returned incomplete data. Please retry.');
      setRoster(normalizeEngagementAccounts(body.accounts));
    } catch (issue) { if (!controller.signal.aborted) setRosterError(issue.message); }
    finally { if (rosterRequestRef.current === controller) setRosterLoading(false); }
  }, [request]);
  useEffect(() => { loadRoster(); return () => rosterRequestRef.current?.abort(); }, [loadRoster]);
  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => { if (applied?.key !== draftKey) requestRef.current?.abort(); }, [applied?.key, draftKey]);
  useEffect(() => {
    const dismiss = event => {
      const picker = pickerRef.current;
      if (!picker?.open) return;
      if (event.type === 'keydown' && event.key === 'Escape') {
        event.preventDefault(); picker.open = false; picker.querySelector('summary')?.focus();
      } else if (event.type === 'pointerdown' && !picker.contains(event.target)) picker.open = false;
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss); };
  }, []);
  const load = useCallback(async snapshot => {
    requestRef.current?.abort();
    const controller = new AbortController(); requestRef.current = controller;
    setLoading(true); setError(''); setData(null); setSelected(null); setProgress({ completed: 0, total: snapshot.handles.length });
    try {
      const body = await loadEngagementAccounts(request, snapshot.handles, { signal: controller.signal, onProgress: value => {
        if (!controller.signal.aborted && requestRef.current === controller) setProgress(value);
      } });
      if (controller.signal.aborted) return;
      setData({ ...body, key: snapshot.key });
    } catch (issue) { if (!controller.signal.aborted) setError(issue.message); }
    finally { if (requestRef.current === controller) setLoading(false); }
  }, [request]);
  const apply = () => {
    if (!sortedHandles.length) return;
    const snapshot = { handles: sortedHandles, key: draftKey };
    setApplied(snapshot); pickerRef.current.open = false; load(snapshot);
  };
  const currentData = data?.key === draftKey && applied?.key === draftKey ? data : null;
  const pending = applied && applied.key !== draftKey;
  const accounts = useMemo(() => selectEngagementAccounts(currentData?.accounts, { sort }), [currentData, sort]);
  const groups = [...new Set(roster?.map(account => account.group).filter(Boolean))].sort();
  const available = roster?.filter(account => !group || account.group === group) || [];
  const selectedSet = new Set(handles);
  const measured = accounts.reduce((sum, account) => sum + account.engagement_post_count, 0);
  return <section className="promo-engagement" aria-label={t('Account engagement')}>
    <header className="promo-engagement-heading"><div><h2>{t('Account engagement and post pricing')}</h2><p>{t('Choose from all dashboard accounts by group or from the dropdown, then view their engagement.')}</p><p>{t('Calculations use all available stored posts, across every date and format.')}</p></div></header>
    {rosterLoading && <div className="promo-empty" role="status">{t('Loading available accounts…')}</div>}
    {rosterError && <div className="promo-alert" role="alert"><div>{t('Account list could not be loaded. Please retry.')}<small>{t(rosterError)}</small></div><button onClick={loadRoster}>{t('Retry accounts')}</button></div>}
    {roster && <div className="promo-toolbar promo-engagement-toolbar product-page-controls">
      <label><span>{t('Account group')}</span><select value={group} onChange={event => setGroup(event.target.value)}><option value="">{t('All accounts')}</option>{groups.map(value => <option key={value} value={value}>{t(GROUPS[value] || value)}</option>)}</select></label>
      <div className="promo-account-control"><span>{t('Accounts')}</span><details ref={pickerRef} className="promo-account-picker">
        <summary aria-controls={pickerId}>{t('Accounts ({count} selected)', { count: handles.length })}</summary>
        <div id={pickerId} className="promo-account-options">
          <div className="promo-account-actions"><button type="button" disabled={!available.length} onClick={() => setHandles(current => [...new Set([...current, ...available.map(account => account.handle)])])}>{t(group ? 'Select this group' : 'Select all accounts')}</button><button type="button" disabled={!handles.length} onClick={() => setHandles([])}>{t('Clear selection')}</button></div>
          <div className="promo-account-checks" role="group" aria-label={t('Select accounts')}>
            {available.map(account => <label key={account.handle}><input type="checkbox" checked={selectedSet.has(account.handle)} aria-label={t('Select @{account}', { account: account.handle })} onChange={event => setHandles(current => event.target.checked ? [...current, account.handle] : current.filter(handle => handle !== account.handle))} /><span><strong>@{account.handle}</strong><small>{account.label || t(GROUPS[account.group] || account.group)}</small></span></label>)}
            {!available.length && <p>{t('No dashboard accounts available in this group.')}</p>}
          </div>
        </div>
      </details></div>
      <button className="promo-engagement-apply" disabled={!handles.length || (loading && applied?.key === draftKey)} onClick={apply}>{t(loading && applied?.key === draftKey ? 'Loading account engagement…' : 'View engagement')}</button>
    </div>}
    {!applied && roster && <div className="promo-empty">{t('Select accounts and choose View engagement to load their calculations.')}</div>}
    {pending && <p className="promo-engagement-pending" role="status">{t('Selection changed. Choose View engagement to apply it.')}</p>}
    {error && !pending && <div className="promo-alert" role="alert"><div>{t('Engagement data could not be loaded. Please retry.')}<small>{t(error)}</small></div><button onClick={() => load(applied)}>{t('Retry')}</button></div>}
    {loading && !pending && <div className="promo-empty" role="status">{t('Loading engagement: {completed} of {total} accounts', progress)}</div>}
    {currentData && <>
      <div className="promo-engagement-summary"><div><span>{t('Accounts in view')}</span><strong>{numberLabel(accounts.length, lang, 0)}</strong></div><div><span>{t('Stored posts')}</span><strong>{numberLabel(accounts.reduce((sum, account) => sum + account.post_count, 0), lang, 0)}</strong></div><div><span>{t('Posts with likes + comments')}</span><strong>{numberLabel(measured, lang, 0)}</strong></div><div><span>{t('Accounts with engagement')}</span><strong>{numberLabel(accounts.filter(account => account.engagement_rate_pct != null).length, lang, 0)}</strong></div></div>
      <label className="promo-engagement-sort"><span>{t('Sort accounts')}</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="engagement_rate">{t('Engagement rate')}</option><option value="engagements">{t('Public interactions / post')}</option><option value="followers">{t('Followers')}</option><option value="posts">{t('Stored posts')}</option></select></label>
      {accounts.length ? <div className="promo-engagement-table-wrap" tabIndex={0} role="region" aria-label={t('Account engagement')}><table className="promo-engagement-table">
        <caption>{t('Average / post')} · {t('All stored history')} · {t('All formats')}</caption>
        <thead><tr>{['Account', 'Followers', 'Stored posts', 'Engagement rate', 'Public interactions / post', 'Likes', 'Comments', 'Shares', 'Saves', 'Video views'].map(label => <th key={label} scope="col">{t(label)}</th>)}</tr></thead>
        <tbody>{accounts.map(account => <tr key={account.handle} data-engagement-account={account.handle}>
          <th scope="row"><button onClick={() => setSelected(account)} aria-label={t('Calculate post price for @{account}', { account: account.handle })}><strong>@{account.handle}</strong><span>{account.label || t(GROUPS[account.group] || account.group)}</span><small><Calculator size={12} />{t('Simulate price')}</small></button><small>{t('Calculated')}: <time data-calculated-at dateTime={account.calculated_at || undefined}>{dateLabel(account.calculated_at, lang)}</time></small></th>
          <td>{numberLabel(account.followers, lang, 0)}<small>{dateLabel(account.followers_captured_at, lang)}</small></td>
          <td>{numberLabel(account.post_count, lang, 0)}</td>
          <td className="promo-engagement-rate">{numberLabel(account.engagement_rate_pct, lang, 2)}{account.engagement_rate_pct != null ? '%' : ''}</td>
          <td>{numberLabel(account.average_engagements, lang)}<small>{t('{count} of {total} posts', { count: account.engagement_post_count, total: account.post_count })}</small></td>
          {['likes', 'comments', 'shares', 'saves', 'video_views'].map(key => <td key={key}><MetricValue metric={account.metrics[key]} total={account.post_count} /></td>)}
        </tr>)}</tbody>
      </table></div> : <div className="promo-empty"><strong>{t('No accounts available for this selection.')}</strong><span>{t('Choose another account group or selection.')}</span></div>}
      <p className="promo-engagement-footnote">{t('Saved calculations are reused for up to 7 days, then recalculated on the next load.')}<br />{t('Stored data only; changing filters does not refresh Instagram.')} · {t('Report generated')}: {dateLabel(currentData.generated_at, lang)}</p>
    </>}
    <details className="promo-engagement-method"><summary>{t('How engagement is calculated')}</summary><p>{t('Full-history calculations are saved per account for up to 7 days. Refresh reuses valid calculations and recalculates them after they expire.')}</p><p>{t('Includes all available stored posts, including posts without a stored date, using the cumulative metrics saved when the calculation was made.')}</p><p>{t('Engagement rate = average (likes + comments) per measured post ÷ latest stored followers × 100.')}</p><p>{t('Likes + comments provide a common basis across accounts. Shares and saves are shown separately; full engagement is available when all four metrics are recorded on the same posts.')}</p><p>{t('Missing metrics stay unavailable. Hidden or underreported likes (0–3) are excluded from engagement, following the existing account metric rules.')}</p><p>{t('CPM uses impressions. Video views have their own cost per thousand and are not treated as impressions.')}</p></details>
    {selected && currentData && <PriceCalculator key={selected.handle} account={selected} onClose={() => setSelected(null)} />}
  </section>;
}
