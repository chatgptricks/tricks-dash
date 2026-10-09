import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { mountApp } from './mountApp';
import { API_BASE, apiFetch } from './api';
import { firebaseAuth, startGoogleSignIn } from './firebase';
import { PrefsProvider } from './prefsContext';
import { ConnectionLanguageSelector, connectionRequestError, useConnectionLanguage } from './connectionI18n';
import './agents.css';
import './apiConnections.css';

const MANAGEMENT_URL = `${API_BASE}/api/dashboard/me/api-keys`;
const DATA_URL = `${API_BASE}/api/v1`;

function ApiConnections() {
  const { lang, setLang, t, formatDate, errorText } = useConnectionLanguage('API connections');
  const guideUrl = `${import.meta.env.BASE_URL}${lang === 'es' ? 'api-guide.html' : 'api-guide.en.html'}`;
  const [user, setUser] = useState(undefined);
  const [keys, setKeys] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [canCreate, setCanCreate] = useState(false);
  const [name, setName] = useState('');
  const [handles, setHandles] = useState([]);
  const [search, setSearch] = useState('');
  const [days, setDays] = useState(90);
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [revoke, setRevoke] = useState(null);
  const generation = useRef(0);
  const abort = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, next => {
      generation.current += 1;
      abort.current?.abort();
      abort.current = new AbortController();
      setUser(next); setKeys(null); setAccounts([]); setCanCreate(false);
      setIssued(null); setHandles([]); setName(''); setSearch('');
      setNotice(''); setError(''); setBusy(false); setRevoke(null);
    });
    return () => { generation.current += 1; abort.current?.abort(); unsubscribe(); };
  }, []);

  const request = async (path, options = {}) => {
    const response = await apiFetch(path, { ...options, signal: abort.current?.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw connectionRequestError(response, data);
    return data;
  };
  const load = async () => {
    const current = generation.current;
    try {
      const data = await request(MANAGEMENT_URL);
      if (current !== generation.current) return;
      setKeys(data.keys); setAccounts(data.available_accounts || []);
      setCanCreate(data.can_create ?? Boolean(data.available_accounts?.length));
      setError('');
    } catch (e) {
      if (current === generation.current && e.name !== 'AbortError') setError(e);
    }
  };
  useEffect(() => { if (user) load(); }, [user]);

  const create = async event => {
    event.preventDefault();
    if (busy || !canCreate || !handles.length) return;
    const current = generation.current;
    setBusy(true); setIssued(null); setError(''); setNotice('');
    try {
      const data = await request(MANAGEMENT_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), account_handles: handles, expires_in_days: days }),
      });
      if (current !== generation.current) return;
      setIssued(data); setKeys(items => [data.connection, ...(items || [])]);
      setName(''); setHandles([]);
    } catch (e) {
      if (current === generation.current && e.name !== 'AbortError') setError(e);
    } finally { if (current === generation.current) setBusy(false); }
  };
  const remove = async connection => {
    const current = generation.current;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`${MANAGEMENT_URL}/${encodeURIComponent(connection.id)}`, { method: 'DELETE' });
      if (current !== generation.current) return;
      setKeys(items => items.map(item => item.id === connection.id ? { ...item, revoked_at: new Date().toISOString() } : item));
      if (issued?.connection.id === connection.id) setIssued(null);
      setRevoke(null); setNotice('API key revoked. This connection can no longer fetch new data with it.');
    } catch (e) {
      if (current === generation.current && e.name !== 'AbortError') setError(e);
    } finally { if (current === generation.current) setBusy(false); }
  };
  const copy = async value => {
    const current = generation.current;
    try { await navigator.clipboard.writeText(value); if (current === generation.current) setNotice('Copied.'); }
    catch { if (current === generation.current) setError('Select and copy the text manually. Clipboard access is unavailable.'); }
  };
  const login = async () => {
    setBusy(true);
    const failure = await startGoogleSignIn();
    if (failure) setError({ signInCode: failure.code || '' });
    setBusy(false);
  };
  const visibleAccounts = accounts.filter(account => `${account.handle} ${account.public_name || ''}`.toLowerCase().includes(search.toLowerCase()));

  return <main className="agents-page api-connections-page">
    <header><a href={import.meta.env.BASE_URL}>Sentient Dash</a><nav className="connection-nav" aria-label={t('API navigation')}><ConnectionLanguageSelector {...{ lang, setLang, t }} /><a href={guideUrl}>{t('Integration guide')}</a>{user ? <button onClick={() => signOut(firebaseAuth)}>{t('Sign out')}</button> : null}</nav></header>
    <h1>{t('API connections')}</h1>
    <p>{t('Connect websites, applications and external tools to profile data, performance, posts and follower history stored in Sentient Dash.')}</p>
    {error ? <p className="agent-error" role="alert">{errorText(error)}</p> : null}
    {notice ? <p className="agent-notice" role="status">{t(notice)}</p> : null}
    {user === undefined ? <p>{t('Checking sign-in…')}</p> : !user ? <section>
      <h2>{t('Sign in to manage API connections')}</h2><p>{t('Use your authorized Sentient account.')}</p>
      <button className="agent-primary" disabled={busy} onClick={login}>{busy ? t('Signing in…') : t('Sign in with Google')}</button>
    </section> : <>
      <p className="agent-owner">{t('API keys belong to {email}.', { email: user.email })}</p>
      {keys === null ? <section><h2>{t('Your API keys')}</h2><p>{t('Loading API access…')}</p>{error ? <button onClick={load}>{t('Try again')}</button> : null}</section> : <>
        {canCreate ? <section>
          <h2>{t('Connect an integration')}</h2>
          <p>{t('Each key grants read access to the accounts you select. Create a separate key for each integration.')}</p>
          <form onSubmit={create}>
            <div className="agent-fields">
              <label>{t('Connection name')}<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder={t('Company website')} disabled={busy} /></label>
              <label>{t('Expires in')}<select value={days} onChange={e => setDays(Number(e.target.value))} disabled={busy}><option value={30}>{t('30 days')}</option><option value={90}>{t('90 days')}</option><option value={365}>{t('1 year')}</option></select></label>
            </div>
            <fieldset className="api-account-fieldset" disabled={busy}>
              <legend>{t('Allowed accounts')}</legend>
              <label>{t('Search accounts')}<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('Search by handle…')} /></label>
              <div className="api-account-options">
                {visibleAccounts.map(account => <label className="api-account-option" key={account.handle}>
                  <input type="checkbox" checked={handles.includes(account.handle)} onChange={e => setHandles(items => e.target.checked ? [...items, account.handle] : items.filter(handle => handle !== account.handle))} />
                  <span><strong>@{account.handle}</strong>{account.public_name && account.public_name !== `@${account.handle}` ? <small>{account.public_name}</small> : null}</span>
                </label>)}
                {!visibleAccounts.length ? <p>{t(accounts.length ? 'No matching accounts.' : 'No active accounts available.')}</p> : null}
              </div>
              <p className="api-selection-count" aria-live="polite">{t(handles.length === 1 ? '{count} account selected' : '{count} accounts selected', { count: handles.length })}</p>
            </fieldset>
            <p className="api-form-help">{t('The key will appear once. Save it in your integration’s server secrets. It expires automatically and can be revoked below.')}</p>
            <button className="agent-primary" disabled={busy || !name.trim() || !handles.length}>{t(busy ? 'Working…' : 'Generate API key')}</button>
          </form>
        </section> : <section><h2>{t('API access')}</h2><p>{t('An Admin or Dev can create API keys. Existing keys stop working if their owner loses this access. You can still revoke your own keys below.')}</p></section>}
        {issued ? <section className="agent-issued" aria-labelledby="api-issued-title">
          <h2 id="api-issued-title">{t('Your API key')}</h2>
          <p>{t('Copy and save this key now. Closing this page or hiding the key removes it from view.')}</p>
          <label htmlFor="api-issued-key">{t('API key')}</label>
          <textarea id="api-issued-key" readOnly value={issued.key} rows={2} spellCheck={false} autoComplete="off" />
          <div className="agent-actions"><button onClick={() => copy(issued.key)}>{t('Copy API key')}</button><button onClick={() => setIssued(null)}>{t('I saved the key')}</button></div>
          <p>{t('Allowed accounts: {accounts}. Save the key as', { accounts: issued.connection.account_handles.map(handle => `@${handle}`).join(', ') })} <code>SENTIENT_DASH_API_KEY</code> {t('on your server.')}</p>
        </section> : null}
        <section>
          <h2>{t('Your API keys')}</h2>
          {!keys.length ? <p>{t('No API connections yet.')}</p> : <ul>{keys.map(connection => {
            const active = !connection.revoked_at && new Date(connection.expires_at) > new Date();
            return <li key={connection.id}>
              <div className="api-key-details"><h3>{connection.name}</h3>
                <p>{t('Read only')} · {t(connection.revoked_at ? 'Revoked' : active ? 'Active' : 'Expired')}</p>
                <p>{connection.account_handles.map(handle => `@${handle}`).join(', ')}</p>
                <p><code>{connection.key_prefix}…</code> · {t('Expires {date}', { date: formatDate(connection.expires_at) })}</p>
                <p>{connection.last_used_at ? t('Last used {date}', { date: formatDate(connection.last_used_at, true) }) : t('Not used yet')}</p>
              </div>
              {active ? revoke === connection.id ? <div className="agent-actions"><button disabled={busy} onClick={() => remove(connection)}>{t('Confirm revoke')}</button><button disabled={busy} onClick={() => setRevoke(null)}>{t('Cancel')}</button></div> : <button disabled={busy} onClick={() => setRevoke(connection.id)}>{t('Revoke')}</button> : null}
            </li>;
          })}</ul>}
        </section>
      </>}
    </>}
    <section>
      <h2>{t('Integration details')}</h2>
      <label htmlFor="api-data-base">{t('API base URL')}<input id="api-data-base" readOnly value={DATA_URL} /></label>
      <div className="agent-actions"><button onClick={() => copy(DATA_URL)}>{t('Copy API URL')}</button><a className="api-guide-link" href={guideUrl}>{t('Read the API guide')}</a></div>
      <p>{t('Profile and media kit, paginated public posts, and daily follower history. Up to 60 requests per minute per key. Fetch from your server and cache the response for five minutes.')}</p>
      <p>{t('Each request reads the latest stored dashboard data. Check the timestamps to show when it was measured.')}</p>
    </section>
  </main>;
}

mountApp(<PrefsProvider><ApiConnections /></PrefsProvider>);
