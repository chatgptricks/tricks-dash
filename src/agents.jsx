import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { mountApp } from './mountApp';
import { API_BASE, apiFetch } from './api';
import { describeSignInError, firebaseAuth, startGoogleSignIn } from './firebase';
import './agents.css';

const URL = `${API_BASE}/api/dashboard/me/agent-connections`;
const MCP_URL = `${API_BASE}/mcp`;
function AgentConnections() {
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
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not complete this request.');
    return data;
  };
  const load = async () => {
    const current = generation.current;
    try {
      const data = await request(URL);
      if (current === generation.current) { setConnections(data.connections); setError(''); }
    } catch (e) { if (current === generation.current) setError(e.message); }
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
    } catch (e) { if (current === generation.current) setError(e.message); }
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
    } catch (e) { if (current === generation.current) setError(e.message); }
    finally { if (current === generation.current) setBusy(false); }
  };
  const copy = async value => {
    try { await navigator.clipboard.writeText(value); setNotice('Copied.'); }
    catch { setError('Copy unavailable. Select and copy the text manually.'); }
  };
  const login = async () => {
    setBusy(true); const failure = await startGoogleSignIn();
    if (failure) setError(describeSignInError(failure)); setBusy(false);
  };
  return <main className="agents-page">
    <header><a href="/">Sentient Dash</a>{user ? <button onClick={() => signOut(firebaseAuth)}>Sign out</button> : null}</header>
    <h1>Agent connections</h1>
    <p>Connect your agent to Sentient Dash with its own access code. To update a website or media kit, use <a href={`${import.meta.env.BASE_URL}api.html`}>API connections</a>.</p>
    {error ? <p className="agent-error" role="alert">{error}</p> : null}
    {notice ? <p className="agent-notice" role="status">{notice}</p> : null}
    {user === undefined ? <p>Checking sign-in…</p> : !user ? <section>
      <h2>Sign in to connect an agent</h2><p>Use your authorized Sentient account.</p>
      <button className="agent-primary" disabled={busy} onClick={login}>Sign in with Google</button>
    </section> : <>
      <p className="agent-owner">Connections belong to {user.email}.</p>
      <section><h2>Create a connection</h2><form onSubmit={create}>
        <label>Agent name<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="My Dots, Muse…" /></label>
        <div className="agent-fields">
          <label>Access<select value={mode} onChange={e => setMode(e.target.value)}><option value="full">Full account access</option><option value="read">Read only</option></select></label>
          <label>Expires in<select value={days} onChange={e => setDays(Number(e.target.value))}><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>1 year</option></select></label>
        </div>
        <p>Full access lets the agent perform actions using your current product permissions. You can revoke access here at any time.</p>
        <button className="agent-primary" disabled={busy || !name.trim() || connections === null}>{busy ? 'Working…' : 'Generate connection code'}</button>
      </form></section>
      {issued ? <section className="agent-issued">
        <h2>Your connection code</h2>
        <p>Copy it now. It will only be shown once. Add it as your MCP connection’s bearer token in the agent’s secure settings.</p>
        <label htmlFor="agent-connection-code">Connection code</label><textarea id="agent-connection-code" readOnly value={issued.key} rows={2} />
        <div className="agent-actions"><button className="agent-primary" onClick={() => copy(issued.key)}>Copy code</button><button onClick={() => setIssued(null)}>I saved the code</button></div>
        <label htmlFor="agent-mcp-url">MCP server URL</label><input id="agent-mcp-url" readOnly value={MCP_URL} /><div className="agent-actions"><button onClick={() => copy(MCP_URL)}>Copy server URL</button></div>
      </section> : null}
      <section><h2>Your agents</h2>
        {connections === null ? <><p>Loading connections…</p>{error ? <button onClick={load}>Try again</button> : null}</> : !connections.length ? <p>No agents connected yet.</p> : <ul>{connections.map(connection => {
          const active = !connection.revoked_at && new Date(connection.expires_at) > new Date();
          return <li key={connection.id}>
            <div><h3>{connection.name}</h3><p>{connection.access_mode === 'full' ? 'Full account access' : 'Read only'} · {connection.revoked_at ? 'Revoked' : active ? 'Active' : 'Expired'}</p>
              <p>Expires {new Date(connection.expires_at).toLocaleDateString()} · {connection.last_used_at ? `Last used ${new Date(connection.last_used_at).toLocaleString()}` : 'Not used yet'}</p>
            </div>
            {active ? revoke === connection.id ? <div className="agent-actions"><button disabled={busy} onClick={() => remove(connection)}>Confirm revoke</button><button disabled={busy} onClick={() => setRevoke(null)}>Cancel</button></div> : <button disabled={busy} onClick={() => setRevoke(connection.id)}>Revoke</button> : null}
          </li>;
        })}</ul>}
      </section>
    </>}
  </main>;
}
mountApp(<AgentConnections />);
