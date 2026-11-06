import { postKeyFromUrl } from './results';

export function ResultPills({ results = [], onNavigate, onDismiss, currentUrl, locale = 'en', style }) {
  if (!results.length) return null;
  const spanish = locale === 'es';
  const current = postKeyFromUrl(currentUrl);
  return <nav className={`pet-results${onDismiss ? ' is-dismissible' : ''}`} style={style} aria-label={spanish ? 'Resultados de tu consulta' : 'Your query results'}>
    {onDismiss ? <button type="button" className="pet-results-dismiss" onClick={onDismiss} aria-label={spanish ? 'Ocultar resultados' : 'Hide results'} title={spanish ? 'Ocultar resultados' : 'Hide results'}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button> : null}
    <div className="pet-results-links">{results.slice(0, 10).map((result, index) => {
      const label = `${spanish ? 'Resultado' : 'Result'} ${index + 1} · @${result.account}${result.label ? ' · ' + result.label : ''}`;
      return <a className="pet-result-pill" href={result.url} key={result.postKey} target="_top" title={label} aria-label={label} aria-current={current === result.postKey ? 'page' : undefined} onClick={event => onNavigate?.(event, result)} onAuxClick={event => { if (event.button === 1) onNavigate?.(event, result); }}><span className="pet-result-number">{index + 1}</span><span className="pet-result-account">@{result.account}</span></a>;
    })}</div>
  </nav>;
}
