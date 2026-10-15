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
const SCOPE_LABELS = {
  accounts: ['Profiles, posts and HOT', 'Public profiles, media kits, post metrics, HOT posts and follower history for selected accounts.'],
  research: ['Research', 'Stored Research posts, source metadata, accounts and topic stacks for selected accounts.'],
  tracker: ['Tracker', 'Follower tracking and account history for selected accounts.'],
  insights: ['Insights', 'Stored analytics and comparisons for selected accounts.'],
  queue: ['Queue', 'Production requests, drafts, schedules and tickets visible to your account.'],
  promos: ['Promos', 'Stored promotions and their related posts.'],
  news: ['News', 'Workspace news sources, articles and stored reviews.'],
  hooks: ['Hooks', 'Stored hook library and analyses available to your account.'],
  vault: ['Vault', 'Saved workspace resources and content.'],
  settings: ['Settings', 'Readable product configuration and account settings.'],
};
const connectionScopes = connection => Array.isArray(connection.data_scopes) ? connection.data_scopes : ['accounts'];

function ScopePicker({ availableScopes, selected, onChange, disabled, t, id }) {
  const choose = scope => onChange(selected.includes(scope) ? selected.filter(item => item !== scope) : [...selected, scope]);
  return <fieldset className="api-account-fieldset api-scope-fieldset" disabled={disabled}>
    <legend>{t('Available data (read only)')}</legend>
    <p className="api-scope-help">{t('Select the product areas this integration can read. Account data stays limited to the allowed accounts. Workspace areas can include shared internal data.')}</p>
    <div className="agent-actions api-scope-presets">
      <button type="button" onClick={() => onChange(availableScopes.map(scope => scope.id))}>{t('All available data (read-only)')}</button>
      <button type="button" onClick={() => onChange(['accounts'].filter(scope => availableScopes.some(item => item.id === scope)))}>{t('Public account data only')}</button>
    </div>
    <div className="api-scope-options">
      {availableScopes.map(scope => <label className="api-account-option api-scope-option" key={scope.id}>
        <input type="checkbox" name={`${id}-scopes`} checked={selected.includes(scope.id)} onChange={() => choose(scope.id)} aria-label={t(SCOPE_LABELS[scope.id]?.[0] || scope.label || scope.id)} />
        <span><strong>{t(SCOPE_LABELS[scope.id]?.[0] || scope.label || scope.id)}</strong><small>{t(SCOPE_LABELS[scope.id]?.[1] || scope.description || '')}</small><small className="api-scope-kind">{t(scope.global ? 'Workspace data' : 'Selected account data')}</small></span>
      </label>)}
    </div>
  </fieldset>;
}

function ApiConnections() {
  const { lang, setLang, t, formatDate, errorText } = useConnectionLanguage('API connections');
  const guideUrl = `${import.meta.env.BASE_URL}${lang === 'es' ? 'api-guide.html' : 'api-guide.en.html'}`;
  const [user, setUser] = useState(undefined);
  const [keys, setKeys] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [availableScopes, setAvailableScopes] = useState([{ id: 'accounts', global: false }]);
  const [dataScopes, setDataScopes] = useState(['accounts']);
  const [editing, setEditing] = useState(null);
  const [editScopes, setEditScopes] = useState([]);
  const [canCreate, setCanCreate] = useState(false);
  const [canManageAll, setCanManageAll] = useState(false);
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
      setUser(next); setKeys(null); setAccounts([]); setCanCreate(false); setCanManageAll(false);
      setIssued(null); setHandles([]); setName(''); setSearch('');
      setAvailableScopes([{ id: 'accounts', global: false }]); setDataScopes(['accounts']); setEditing(null); setEditScopes([]);
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
      if (Array.isArray(data.available_scopes) && data.available_scopes.length) setAvailableScopes(data.available_scopes.map(scope => typeof scope === 'string' ? { id: scope, global: false } : scope));
      setCanCreate(data.can_create ?? Boolean(data.available_accounts?.length));
      setCanManageAll(Boolean(data.can_manage_all));
      setError('');
    } catch (e) {
      if (current === generation.current && e.name !== 'AbortError') setError(e);
    }
  };
  useEffect(() => { if (user) load(); }, [user]);

  const create = async event => {
    event.preventDefault();
    if (busy || !canCreate || !handles.length || !dataScopes.length) return;
    const current = generation.current;
    setBusy(true); setIssued(null); setError(''); setNotice('');
    try {
      const data = await request(MANAGEMENT_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), account_handles: handles, expires_in_days: days, data_scopes: dataScopes }),
      });
      if (current !== generation.current) return;
      setIssued(data); setKeys(items => [data.connection, ...(items || [])]);
      setName(''); setHandles([]); setDataScopes(['accounts']);
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
  const saveScopes = async connection => {
    if (busy || !canCreate || !editScopes.length || connection.can_edit === false || (connection.owner_email && connection.owner_email.toLowerCase() !== user?.email?.toLowerCase())) return;
    const current = generation.current;
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await request(`${MANAGEMENT_URL}/${encodeURIComponent(connection.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_scopes: editScopes }),
      });
      if (current !== generation.current) return;
      const updated = data.connection || data.key || data;
      const changes = { ...connection, ...updated, data_scopes: updated.data_scopes || editScopes };
      setKeys(items => items.map(item => item.id === connection.id ? changes : item));
      setIssued(value => value?.connection.id === connection.id ? { ...value, connection: changes } : value);
      setEditing(null); setEditScopes([]); setNotice('Data access updated. The existing API key stays the same.');
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
  const selectAccounts = items => setHandles(current => [...new Set([...current, ...items.map(account => account.handle)])]);
  const accountGroups = [...new Set(accounts.map(account => account.group || (String(account.group_name).toLowerCase() === 'sentient' ? 'sentient' : 'others')))].sort((left, right) => left === 'sentient' ? -1 : right === 'sentient' ? 1 : left.localeCompare(right));
  const visibleAccounts = accounts.filter(account => `${account.handle} ${account.public_name || ''}`.toLowerCase().includes(search.toLowerCase()));

  return <main className="agents-page api-connections-page">
    <header><a href={import.meta.env.BASE_URL}>Sentient Dash</a><nav className="connection-nav" aria-label={t('API navigation')}><ConnectionLanguageSelector {...{ lang, setLang, t }} /><a href={guideUrl}>{t('Integration guide')}</a>{user ? <button onClick={() => signOut(firebaseAuth)}>{t('Sign out')}</button> : null}</nav></header>
    <h1>{t('API connections')}</h1>
    <p>{t('Connect websites, applications and external tools to the stored product data you authorize in Sentient Dash.')}</p>
    {error ? <p className="agent-error" role="alert">{errorText(error)}</p> : null}
    {notice ? <p className="agent-notice" role="status">{t(notice)}</p> : null}
    {user === undefined ? <p>{t('Checking sign-in…')}</p> : !user ? <section>
      <h2>{t('Sign in to manage API connections')}</h2><p>{t('Use your authorized Sentient account.')}</p>
      <button className="agent-primary" disabled={busy} onClick={login}>{busy ? t('Signing in…') : t('Sign in with Google')}</button>
    </section> : <>
      <p className="agent-owner">{t(canManageAll ? 'You are signed in as {email}.' : 'API keys belong to {email}.', { email: user.email })}</p>
      {keys === null ? <section><h2>{t('Your API keys')}</h2><p>{t('Loading API access…')}</p>{error ? <button onClick={load}>{t('Try again')}</button> : null}</section> : <>
        {canCreate ? <section>
          <h2>{t('Connect an integration')}</h2>
          <p>{t('Each key grants read access to the selected accounts and product areas. Create a separate key for each integration.')}</p>
          <form onSubmit={create}>
            <div className="agent-fields">
              <label>{t('Connection name')}<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder={t('Company website')} disabled={busy} /></label>
              <label>{t('Expires in')}<select value={days} onChange={e => setDays(Number(e.target.value))} disabled={busy}><option value={30}>{t('30 days')}</option><option value={90}>{t('90 days')}</option><option value={365}>{t('1 year')}</option></select></label>
            </div>
            <fieldset className="api-account-fieldset" disabled={busy}>
              <legend>{t('Allowed accounts')}</legend>
              <div className="agent-actions api-account-presets">
                <button type="button" onClick={() => setHandles(accounts.map(account => account.handle))}>{t('All accounts ({count})', { count: accounts.length })}</button>
                {accountGroups.map(group => { const members = accounts.filter(account => (account.group || (String(account.group_name).toLowerCase() === 'sentient' ? 'sentient' : 'others')) === group); return <button type="button" key={group} onClick={() => selectAccounts(members)}>{t(group === 'sentient' ? 'Sentient ({count})' : group === 'others' ? 'Others ({count})' : '{group} ({count})', { count: members.length, group })}</button>; })}
                <button type="button" disabled={!handles.length} onClick={() => setHandles([])}>{t('Clear selection')}</button>
              </div>
              <label>{t('Search accounts')}<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('Search by handle…')} /></label>
              {search.trim() && visibleAccounts.length ? <button className="api-search-select" type="button" onClick={() => selectAccounts(visibleAccounts)}>{t('Add search results ({count})', { count: visibleAccounts.length })}</button> : null}
              <div className="api-account-options">
                {visibleAccounts.map(account => <label className="api-account-option" key={account.handle}>
                  <input type="checkbox" checked={handles.includes(account.handle)} onChange={e => setHandles(items => e.target.checked ? [...items, account.handle] : items.filter(handle => handle !== account.handle))} />
                  <span><strong>@{account.handle}</strong>{account.public_name && account.public_name !== `@${account.handle}` ? <small>{account.public_name}</small> : null}</span>
                </label>)}
                {!visibleAccounts.length ? <p>{t(accounts.length ? 'No matching accounts.' : 'No active accounts available.')}</p> : null}
              </div>
              <p className="api-selection-count" aria-live="polite">{t(handles.length === 1 ? '{count} account selected' : '{count} accounts selected', { count: handles.length })}</p>
            </fieldset>
            <ScopePicker availableScopes={availableScopes} selected={dataScopes} onChange={setDataScopes} disabled={busy} t={t} id="create" />
            <p className="api-form-help">{t('The key will appear once. Save it in your integration’s server secrets. It expires automatically and can be revoked below.')}</p>
            <button className="agent-primary" disabled={busy || !name.trim() || !handles.length || !dataScopes.length}>{t(busy ? 'Working…' : 'Generate API key')}</button>
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
          <h2>{t(canManageAll ? 'Workspace API keys' : 'Your API keys')}</h2>
          {canManageAll ? <p>{t('Devs can see their own keys and all active API keys in the workspace, and revoke any connection. Data access can only be edited by its owner.')}</p> : null}
          {!keys.length ? <p>{t('No API connections yet.')}</p> : <ul>{keys.map(connection => {
            const active = !connection.revoked_at && new Date(connection.expires_at) > new Date();
            const own = !connection.owner_email || connection.owner_email.toLowerCase() === user.email?.toLowerCase();
            const canEdit = connection.can_edit ?? own;
            const canRevoke = connection.can_revoke ?? own;
            return <li key={connection.id}>
              <div className="api-key-details"><h3>{connection.name}</h3>
                {canManageAll ? <p>{t('Owner: {email}', { email: connection.owner_email || user.email })}</p> : null}
                <p>{t('Read only')} · {t(connection.revoked_at ? 'Revoked' : active ? 'Active' : 'Expired')}</p>
                <p>{connection.account_handles.map(handle => `@${handle}`).join(', ')}</p>
                <p className="api-key-scopes">{t('Data access')}: {connectionScopes(connection).map(scope => t(SCOPE_LABELS[scope]?.[0] || scope)).join(' · ')}</p>
                <p><code>{connection.key_prefix}…</code> · {t('Expires {date}', { date: formatDate(connection.expires_at) })}</p>
                <p>{connection.last_used_at ? t('Last used {date}', { date: formatDate(connection.last_used_at, true) }) : t('Not used yet')}</p>
              </div>
              {active ? <div className="api-key-controls">
                {editing === connection.id ? <div className="api-key-scope-editor">
                  <h4>{t('Edit data access')}</h4><p>{t('Changes apply to the existing key immediately. Its allowed accounts and expiration stay the same.')}</p>
                  <ScopePicker availableScopes={availableScopes} selected={editScopes} onChange={setEditScopes} disabled={busy} t={t} id={`edit-${connection.id}`} />
                  <div className="agent-actions"><button className="agent-primary" disabled={busy || !editScopes.length} onClick={() => saveScopes(connection)}>{t(busy ? 'Working…' : 'Save data access')}</button><button disabled={busy} onClick={() => setEditing(null)}>{t('Cancel')}</button></div>
                </div> : <div className="agent-actions">{canCreate && canEdit && own ? <button disabled={busy} onClick={() => { setEditing(connection.id); setEditScopes(connectionScopes(connection)); setRevoke(null); }}>{t('Edit data access')}</button> : null}{canRevoke ? revoke === connection.id ? <><button disabled={busy} onClick={() => remove(connection)}>{t('Confirm revoke')}</button><button disabled={busy} onClick={() => setRevoke(null)}>{t('Cancel')}</button></> : <button disabled={busy} onClick={() => setRevoke(connection.id)}>{t('Revoke')}</button> : null}</div>}
              </div> : null}
            </li>;
          })}</ul>}
        </section>
      </>}
    </>}
    <section>
      <h2>{t('Integration details')}</h2>
      <label htmlFor="api-data-base">{t('API base URL')}<input id="api-data-base" readOnly value={DATA_URL} /></label>
      <div className="agent-actions"><button onClick={() => copy(DATA_URL)}>{t('Copy API URL')}</button><a className="api-guide-link" href={guideUrl}>{t('Read the API guide')}</a></div>
      <p>{t('Discover the routes and permissions with /capabilities and /openapi.json. Up to 60 requests per minute per key. Fetch from your server and cache the response for five minutes.')}</p>
      <p>{t('Each request reads the latest stored dashboard data. Check the timestamps to show when it was measured.')}</p>
    </section>
  </main>;
}

mountApp(<PrefsProvider><ApiConnections /></PrefsProvider>);
