import { useEffect, useRef } from 'react';
import { productSections, sectionHref, openSection, revealCurrentSection } from '../public/product-navigation';
import { usePrefs } from './prefsContext';
import '../public/product-shell.css';

export default function ProductHeader({ current, coordinator = false, isDev = false, canAccessNews = false, canAccessHooks: hooksAccess = false, account, children, count = 0 }) {
  const { lang } = usePrefs();
  const canAccessHooks = hooksAccess || isDev || account?.props?.email?.trim().toLowerCase() === "user05@example.com";
  const navigation = useRef(null);
  useEffect(() => {
    const nav = navigation.current;
    const reveal = () => revealCurrentSection(nav);
    reveal();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(reveal);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [current, lang, coordinator, isDev, canAccessNews, canAccessHooks, count]);
  return <header className="product-header" data-section={current}>
    <a className="product-brand" href="/index.html" target="sentient-dashboard" onClick={(event) => openSection(event, productSections[0])} aria-label="Sentient home">sentient<span>dash</span><small>.app</small></a>
    <div className="product-toolbar">{children}</div>
    <nav ref={navigation} className="product-nav" aria-label="Sentient tools">
      {productSections.filter((item) => (!item.restricted || coordinator) && (!item.devOnly || isDev || (item.id === 'news' && canAccessNews) || (item.id === 'hooks' && canAccessHooks))).map((item) => <a key={item.id} href={sectionHref(item)} target={item.target} onClick={(event) => openSection(event, item)} aria-current={current === item.id ? 'page' : undefined}>{lang === 'es' ? item.es : item.label}{item.id === 'queue' && count > 0 ? <b>{count > 99 ? '99+' : count}</b> : null}</a>)}
    </nav>
    <div className="product-account">{account}</div>
  </header>;
}
