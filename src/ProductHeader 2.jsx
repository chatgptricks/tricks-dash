import { productSections, sectionHref, openSection } from '../public/product-navigation';
import { usePrefs } from './prefsContext';
import '../public/product-shell.css';

export default function ProductHeader({ current, coordinator = false, account, children, count = 0 }) {
  const { language } = usePrefs();
  return <header className="product-header">
    <a className="product-brand" href="/index.html" target="sentient-dashboard" onClick={(event) => openSection(event, productSections[0])} aria-label="Sentient home">sentient<span>dash</span><small>.app</small></a>
    <nav className="product-nav" aria-label="Sentient tools">
      {productSections.filter((item) => !item.restricted || coordinator).map((item) => <a key={item.id} href={sectionHref(item)} target={item.target} onClick={(event) => openSection(event, item)} aria-current={current === item.id ? 'page' : undefined}>{language === 'es' ? item.es : item.label}{item.id === 'queue' && count > 0 ? <b>{count > 99 ? '99+' : count}</b> : null}</a>)}
    </nav>
    <div className="product-account">{account}</div>
    {children ? <div className="product-toolbar">{children}</div> : null}
  </header>;
}
