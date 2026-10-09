import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { mountApp } from './mountApp';
import { API_BASE, apiFetch } from './api';
import { firebaseAuth, startGoogleSignIn } from './firebase';
import { PrefsProvider } from './prefsContext';
import { ConnectionLanguageSelector, connectionRequestError, useConnectionLanguage } from './connectionI18n';
import './agents.css';

const URL = `${API_BASE}/api/dashboard/me/agent-connections`;
const MCP_URL = `${API_BASE}/mcp`;
function AgentConnections() {
  const { lang, setLang, t, formatDate, errorText } = useConnectionLanguage('Agent connections');
  const [user, setUser] = useState(undefined);
  const [connections, setConnections] = useState(null);
  const [name, setName] = useState('');
  const [mode, setMode] = useState('full');
  const [days, setDays] = useState(90);
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [revoke, setRevoke] = useState(null);
  const generation = useRef(0);
  useEffect(() => onAuthStateChanged(firebaseAuth, next => {
    generation.current += 1;
    setUser(next); setConnections(null); setIssued(null); setNotice('');
    setError(''); setBusy(false); setRevoke(null);
  }), []);
  const request = async (path, options = {}) => {
    const response = await apiFetch(path, options);
    let data; try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) throw connectionRequestError(response, data);
    return data;
  };
  const load = async () => {
    const current = generation.current;
    try {
      const data = await request(URL);
      if (current === generation.current) { setConnections(data.connections); setError(''); }
    } catch (e) { if (current === generation.current) setError(e); }
  };
  useEffect(() => { if (user) load(); }, [user]);
  const create = async event => {
    event.preventDefault(); if (busy) return;
    const current = generation.current;
    setBusy(true); setError(''); setIssued(null); setNotice('');
    try {
      const data = await request(URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), access_mode: mode, expires_in_days: days }),
      });
      if (current === generation.current) {
        setIssued(data); setConnections(items => [data.connection, ...(items || [])]); setName('');
      }
    } catch (e) { if (current === generation.current) setError(e); }
    finally { if (current === generation.current) setBusy(false); }
  };
  const remove = async connection => {
    const current = generation.current; setBusy(true); setError('');
    try {
      await request(`${URL}/${encodeURIComponent(connection.id)}`, { method: 'DELETE' });
      if (current === generation.current) {
        setConnections(items => items.map(item => item.id === connection.id ? { ...item, revoked_at: new Date().toISOString() } : item));
        if (issued?.connection.id === connection.id) setIssued(null);
        setRevoke(null); setNotice('Connection revoked.');
      }
    } catch (e) { if (current === generation.current) setError(e); }
    finally { if (current === generation.current) setBusy(false); }
  };
  const copy = async value => {
    try { await navigator.clipboard.writeText(value); setNotice('Copied.'); }
    catch { setError('Copy unavailable. Select and copy the text manually.'); }
  };
  const login = async () => {
    setBusy(true); const failure = await startGoogleSignIn();
    if (failure) setError({ signInCode: failure.code || '' }); setBusy(false);
  };
  return <main className="agents-page">
    <header><a href={import.meta.env.BASE_URL}>Sentient Dash</a><nav className="connection-nav" aria-label={t('Agent navigation')}><ConnectionLanguageSelector {...{ lang, setLang, t }} />{user ? <button onClick={() => signOut(firebaseAuth)}>{t('Sign out')}</button> : null}</nav></header>
    <h1>{t('Agent connections')}</h1>
    <p>{t('Connect your agent to Sentient Dash with its own access code. For websites and external applications, use')} <a href={`${import.meta.env.BASE_URL}api.html`}>{t('API connections')}</a>.</p>
    {error ? <p className="agent-error" role="alert">{errorText(error)}</p> : null}
    {notice ? <p className="agent-notice" role="status">{t(notice)}</p> : null}
    {user === undefined ? <p>{t('Checking sign-in…')}</p> : !user ? <section>
      <h2>{t('Sign in to connect an agent')}</h2><p>{t('Use your authorized Sentient account.')}</p>
      <button className="agent-primary" disabled={busy} onClick={login}>{busy ? t('Signing in…') : t('Sign in with Google')}</button>
    </section> : <>
      <p className="agent-owner">{t('Connections belong to {email}.', { email: user.email })}</p>
      <section><h2>{t('Create a connection')}</h2><form onSubmit={create}>
        <label>{t('Agent name')}<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder={t('My Dots, Muse…')} /></label>
        <div className="agent-fields">
          <label>{t('Access')}<select value={mode} onChange={e => setMode(e.target.value)}><option value="full">{t('Full account access')}</option><option value="read">{t('Read only')}</option></select></label>
          <label>{t('Expires in')}<select value={days} onChange={e => setDays(Number(e.target.value))}><option value={30}>{t('30 days')}</option><option value={90}>{t('90 days')}</option><option value={365}>{t('1 year')}</option></select></label>
        </div>
        <p>{t('Full access lets the agent perform actions using your current product permissions. You can revoke access here at any time.')}</p>
        <button className="agent-primary" disabled={busy || !name.trim() || connections === null}>{t(busy ? 'Working…' : 'Generate connection code')}</button>
      </form></section>
      {issued ? <section className="agent-issued">
        <h2>{t('Your connection code')}</h2>
        <p>{t('Copy it now. It will only be shown once. Add it as your MCP connection’s bearer token in the agent’s secure settings.')}</p>
        <label htmlFor="agent-connection-code">{t('Connection code')}</label><textarea id="agent-connection-code" readOnly value={issued.key} rows={2} />
        <div className="agent-actions"><button className="agent-primary" onClick={() => copy(issued.key)}>{t('Copy code')}</button><button onClick={() => setIssued(null)}>{t('I saved the code')}</button></div>
        <label htmlFor="agent-mcp-url">{t('MCP server URL')}</label><input id="agent-mcp-url" readOnly value={MCP_URL} /><div className="agent-actions"><button onClick={() => copy(MCP_URL)}>{t('Copy server URL')}</button></div>
      </section> : null}
      <section><h2>{t('Your agents')}</h2>
        {connections === null ? <><p>{t('Loading connections…')}</p>{error ? <button onClick={load}>{t('Try again')}</button> : null}</> : !connections.length ? <p>{t('No agents connected yet.')}</p> : <ul>{connections.map(connection => {
          const active = !connection.revoked_at && new Date(connection.expires_at) > new Date();
          return <li key={connection.id}>
            <div><h3>{connection.name}</h3><p>{t(connection.access_mode === 'full' ? 'Full account access' : 'Read only')} · {t(connection.revoked_at ? 'Revoked' : active ? 'Active' : 'Expired')}</p>
              <p>{t('Expires {date}', { date: formatDate(connection.expires_at) })} · {connection.last_used_at ? t('Last used {date}', { date: formatDate(connection.last_used_at, true) }) : t('Not used yet')}</p>
            </div>
            {active ? revoke === connection.id ? <div className="agent-actions"><button disabled={busy} onClick={() => remove(connection)}>{t('Confirm revoke')}</button><button disabled={busy} onClick={() => setRevoke(null)}>{t('Cancel')}</button></div> : <button disabled={busy} onClick={() => setRevoke(connection.id)}>{t('Revoke')}</button> : null}
          </li>;
        })}</ul>}
      </section>
    </>}
  </main>;
}
mountApp(<PrefsProvider><AgentConnections /></PrefsProvider>);
