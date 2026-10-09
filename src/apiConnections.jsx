import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { mountApp } from './mountApp';
import { API_BASE, apiFetch } from './api';
import { describeSignInError, firebaseAuth, startGoogleSignIn } from './firebase';
import './agents.css';
import './apiConnections.css';

const MANAGEMENT_URL = `${API_BASE}/api/dashboard/me/api-keys`;
const DATA_URL = `${API_BASE}/api/v1`;
const GUIDE_URL = `${import.meta.env.BASE_URL}api-guide.html`;

function ApiConnections() {
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
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Could not complete this request (HTTP ${response.status}).`);
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
      if (current === generation.current && e.name !== 'AbortError') setError(e.message);
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
      if (current === generation.current && e.name !== 'AbortError') setError(e.message);
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
      if (current === generation.current && e.name !== 'AbortError') setError(e.message);
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
    if (failure) setError(describeSignInError(failure));
    setBusy(false);
  };
  const visibleAccounts = accounts.filter(account => `${account.handle} ${account.public_name || ''}`.toLowerCase().includes(search.toLowerCase()));

  return <main className="agents-page api-connections-page">
    <header><a href={import.meta.env.BASE_URL}>Sentient Dash</a><nav aria-label="API navigation"><a href={GUIDE_URL}>Integration guide</a>{user ? <button onClick={() => signOut(firebaseAuth)}>Sign out</button> : null}</nav></header>
    <h1>API connections</h1>
    <p>Connect websites, applications and external tools to profile data, performance, posts and follower history stored in Sentient Dash.</p>
    {error ? <p className="agent-error" role="alert">{error}</p> : null}
    {notice ? <p className="agent-notice" role="status">{notice}</p> : null}
    {user === undefined ? <p>Checking sign-in…</p> : !user ? <section>
      <h2>Sign in to manage API connections</h2><p>Use your authorized Sentient account.</p>
      <button className="agent-primary" disabled={busy} onClick={login}>Sign in with Google</button>
    </section> : <>
      <p className="agent-owner">API keys belong to {user.email}.</p>
      {keys === null ? <section><h2>Your API keys</h2><p>Loading API access…</p>{error ? <button onClick={load}>Try again</button> : null}</section> : <>
        {canCreate ? <section>
          <h2>Connect an integration</h2>
          <p>Each key grants read access to the accounts you select. Create a separate key for each integration.</p>
          <form onSubmit={create}>
            <div className="agent-fields">
              <label>Connection name<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Company website" disabled={busy} /></label>
              <label>Expires in<select value={days} onChange={e => setDays(Number(e.target.value))} disabled={busy}><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>1 year</option></select></label>
            </div>
            <fieldset className="api-account-fieldset" disabled={busy}>
              <legend>Allowed accounts</legend>
              <label>Search accounts<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by handle…" /></label>
              <div className="api-account-options">
                {visibleAccounts.map(account => <label className="api-account-option" key={account.handle}>
                  <input type="checkbox" checked={handles.includes(account.handle)} onChange={e => setHandles(items => e.target.checked ? [...items, account.handle] : items.filter(handle => handle !== account.handle))} />
                  <span><strong>@{account.handle}</strong>{account.public_name && account.public_name !== `@${account.handle}` ? <small>{account.public_name}</small> : null}</span>
                </label>)}
                {!visibleAccounts.length ? <p>{accounts.length ? 'No matching accounts.' : 'No active accounts available.'}</p> : null}
              </div>
              <p className="api-selection-count" aria-live="polite">{handles.length} account{handles.length === 1 ? '' : 's'} selected</p>
            </fieldset>
            <p className="api-form-help">The key will appear once. Save it in your integration’s server secrets. It expires automatically and can be revoked below.</p>
            <button className="agent-primary" disabled={busy || !name.trim() || !handles.length}>{busy ? 'Working…' : 'Generate API key'}</button>
          </form>
        </section> : <section><h2>API access</h2><p>An Admin or Dev can create API keys. Existing keys stop working if their owner loses this access. You can still revoke your own keys below.</p></section>}
        {issued ? <section className="agent-issued" aria-labelledby="api-issued-title">
          <h2 id="api-issued-title">Your API key</h2>
          <p>Copy and save this key now. Closing this page or hiding the key removes it from view.</p>
          <label htmlFor="api-issued-key">API key</label>
          <textarea id="api-issued-key" readOnly value={issued.key} rows={2} spellCheck={false} autoComplete="off" />
          <div className="agent-actions"><button onClick={() => copy(issued.key)}>Copy API key</button><button onClick={() => setIssued(null)}>I saved the key</button></div>
          <p>Allowed accounts: {issued.connection.account_handles.map(handle => `@${handle}`).join(', ')}. Save the key as <code>SENTIENT_DASH_API_KEY</code> on your server.</p>
        </section> : null}
        <section>
          <h2>Your API keys</h2>
          {!keys.length ? <p>No API connections yet.</p> : <ul>{keys.map(connection => {
            const active = !connection.revoked_at && new Date(connection.expires_at) > new Date();
            return <li key={connection.id}>
              <div className="api-key-details"><h3>{connection.name}</h3>
                <p>Read only · {connection.revoked_at ? 'Revoked' : active ? 'Active' : 'Expired'}</p>
                <p>{connection.account_handles.map(handle => `@${handle}`).join(', ')}</p>
                <p><code>{connection.key_prefix}…</code> · Expires {new Date(connection.expires_at).toLocaleDateString()}</p>
                <p>{connection.last_used_at ? `Last used ${new Date(connection.last_used_at).toLocaleString()}` : 'Not used yet'}</p>
              </div>
              {active ? revoke === connection.id ? <div className="agent-actions"><button disabled={busy} onClick={() => remove(connection)}>Confirm revoke</button><button disabled={busy} onClick={() => setRevoke(null)}>Cancel</button></div> : <button disabled={busy} onClick={() => setRevoke(connection.id)}>Revoke</button> : null}
            </li>;
          })}</ul>}
        </section>
      </>}
    </>}
    <section>
      <h2>Integration details</h2>
      <label htmlFor="api-data-base">API base URL<input id="api-data-base" readOnly value={DATA_URL} /></label>
      <div className="agent-actions"><button onClick={() => copy(DATA_URL)}>Copy API URL</button><a className="api-guide-link" href={GUIDE_URL}>Read the API guide</a></div>
      <p>Profile and media kit, paginated public posts, and daily follower history. Up to 60 requests per minute per key. Fetch from your server and cache the response for five minutes.</p>
      <p>Each request reads the latest stored dashboard data. Check the timestamps to show when it was measured.</p>
    </section>
  </main>;
}

mountApp(<ApiConnections />);
