import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calculator, RefreshCw, X } from 'lucide-react';
import { usePrefs } from './prefsContext';
import { calculatePostCosts, normalizeEngagementAccounts, parsePositiveNumber, selectEngagementAccounts } from './promoEngagement';
import './promoEngagement.css';

const METRICS = [
  ['likes', 'Likes / post'], ['comments', 'Comments / post'],
  ['shares', 'Shares / post'], ['saves', 'Saves / post'],
  ['video_views', 'Video views / post'], ['impressions', 'Impressions / post'],
];
const PERIODS = { 30: 'Last 30 days', 90: 'Last 90 days', 0: 'All stored history' };
const FORMATS = { all: 'All formats', reel: 'Reels', carousel: 'Carousels', image: 'Images' };
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

function PriceCalculator({ account, days, format, onClose }) {
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
      <header className="promo-review-header"><div><span className="promo-review-position">{t('Simulate price')}</span><h2 id={titleId}>{t('Post price · @{account}', { account: account.handle })}</h2><span className="promo-by">{t(PERIODS[days])} · {t(FORMATS[format])}</span></div><button type="button" aria-label={t('Close price calculator')} onClick={onClose}><X size={20} /></button></header>
      <div className="promo-price-body">
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
  const [days, setDays] = useState('30'), [format, setFormat] = useState('all');
  const [search, setSearch] = useState(''), [group, setGroup] = useState(''), [sort, setSort] = useState('engagement_rate');
  const [data, setData] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const requestRef = useRef(null);
  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController(); requestRef.current = controller;
    setLoading(true); setError(''); setData(null); setSelected(null);
    try {
      const params = new URLSearchParams({ days, format });
      const body = await request(`/api/admin/promos/engagement?${params}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!Array.isArray(body.accounts)) throw new Error('Engagement returned incomplete data. Please retry.');
      setData({ ...body, accounts: normalizeEngagementAccounts(body.accounts), days, format });
    } catch (issue) { if (!controller.signal.aborted) setError(issue.message); }
    finally { if (requestRef.current === controller) setLoading(false); }
  }, [request, days, format]);
  useEffect(() => { load(); return () => requestRef.current?.abort(); }, [load]);
  const currentData = data?.days === days && data?.format === format ? data : null;
  const accounts = useMemo(() => selectEngagementAccounts(currentData?.accounts, { search, group, sort }), [currentData, search, group, sort]);
  const groups = [...new Set(currentData?.accounts.map(account => account.group).filter(Boolean))].sort();
  const measured = accounts.reduce((sum, account) => sum + account.engagement_post_count, 0);
  return <section className="promo-engagement" aria-label={t('Account engagement')}>
    <header className="promo-engagement-heading"><div><h2>{t('Account engagement and post pricing')}</h2><p>{t('Compare stored post performance, then try a price for a specific placement.')}</p></div><button className="promo-engagement-refresh" onClick={load} disabled={loading}><RefreshCw size={15} />{t(loading ? 'Refreshing…' : 'Refresh')}</button></header>
    <div className="promo-toolbar promo-engagement-toolbar product-page-controls">
      <label><span>{t('Period')}</span><select value={days} onChange={event => setDays(event.target.value)}>{['30', '90', '0'].map(key => <option key={key} value={key}>{t(PERIODS[key])}</option>)}</select></label>
      <label><span>{t('Post format')}</span><select value={format} onChange={event => setFormat(event.target.value)}>{Object.entries(FORMATS).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></label>
      <label className="promo-search"><span>{t('Search accounts')}</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={`@${t('Account').toLowerCase()}`} /></label>
      <label><span>{t('Account group')}</span><select value={group} onChange={event => setGroup(event.target.value)}><option value="">{t('All accounts')}</option>{groups.map(value => <option key={value} value={value}>{t(GROUPS[value] || value)}</option>)}</select></label>
      <label><span>{t('Sort accounts')}</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="engagement_rate">{t('Engagement rate')}</option><option value="engagements">{t('Public interactions / post')}</option><option value="followers">{t('Followers')}</option><option value="posts">{t('Stored posts')}</option></select></label>
    </div>
    {error && <div className="promo-alert" role="alert"><div>{t('Engagement data could not be loaded. Please retry.')}<small>{t(error)}</small></div><button onClick={load}>{t('Retry')}</button></div>}
    {loading && <div className="promo-empty" role="status">{t('Loading account engagement…')}</div>}
    {currentData && <>
      <div className="promo-engagement-summary"><div><span>{t('Accounts in view')}</span><strong>{numberLabel(accounts.length, lang, 0)}</strong></div><div><span>{t('Stored posts')}</span><strong>{numberLabel(accounts.reduce((sum, account) => sum + account.post_count, 0), lang, 0)}</strong></div><div><span>{t('Posts with likes + comments')}</span><strong>{numberLabel(measured, lang, 0)}</strong></div><div><span>{t('Accounts with engagement')}</span><strong>{numberLabel(accounts.filter(account => account.engagement_rate_pct != null).length, lang, 0)}</strong></div></div>
      {accounts.length ? <div className="promo-engagement-table-wrap" tabIndex={0} role="region" aria-label={t('Account engagement')}><table className="promo-engagement-table">
        <caption>{t('Average / post')} · {t(PERIODS[days])} · {t(FORMATS[format])}</caption>
        <thead><tr>{['Account', 'Followers', 'Stored posts', 'Engagement rate', 'Public interactions / post', 'Likes', 'Comments', 'Shares', 'Saves', 'Video views'].map(label => <th key={label} scope="col">{t(label)}</th>)}</tr></thead>
        <tbody>{accounts.map(account => <tr key={account.handle} data-engagement-account={account.handle}>
          <th scope="row"><button onClick={() => setSelected(account)} aria-label={t('Calculate post price for @{account}', { account: account.handle })}><strong>@{account.handle}</strong><span>{account.label || t(GROUPS[account.group] || account.group)}</span><small><Calculator size={12} />{t('Simulate price')}</small></button></th>
          <td>{numberLabel(account.followers, lang, 0)}<small>{dateLabel(account.followers_captured_at, lang)}</small></td>
          <td>{numberLabel(account.post_count, lang, 0)}</td>
          <td className="promo-engagement-rate">{numberLabel(account.engagement_rate_pct, lang, 2)}{account.engagement_rate_pct != null ? '%' : ''}</td>
          <td>{numberLabel(account.average_engagements, lang)}<small>{t('{count} of {total} posts', { count: account.engagement_post_count, total: account.post_count })}</small></td>
          {['likes', 'comments', 'shares', 'saves', 'video_views'].map(key => <td key={key}><MetricValue metric={account.metrics[key]} total={account.post_count} /></td>)}
        </tr>)}</tbody>
      </table></div> : <div className="promo-empty"><strong>{t(currentData.accounts.length ? 'No accounts match these filters.' : 'No accounts available for Promos.')}</strong><span>{t('Try another search or account group.')}</span></div>}
      <p className="promo-engagement-footnote">{t('Stored data only; changing filters does not refresh Instagram.')} · {t('Report generated')}: {dateLabel(currentData.generated_at, lang)}</p>
    </>}
    <details className="promo-engagement-method"><summary>{t('How engagement is calculated')}</summary><p>{t('Includes posts published in the selected period, using their latest stored cumulative metrics.')}</p><p>{t('Engagement rate = average (likes + comments) per measured post ÷ latest stored followers × 100.')}</p><p>{t('Likes + comments provide a common basis across accounts. Shares and saves are shown separately; full engagement is available when all four metrics are recorded on the same posts.')}</p><p>{t('Missing metrics stay unavailable. Hidden or underreported likes (0–3) are excluded from engagement, following the existing account metric rules.')}</p><p>{t('CPM uses impressions. Video views have their own cost per thousand and are not treated as impressions.')}</p></details>
    {selected && currentData && <PriceCalculator key={selected.handle} account={selected} days={days} format={format} onClose={() => setSelected(null)} />}
  </section>;
}
