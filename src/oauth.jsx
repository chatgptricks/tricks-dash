import { useEffect, useRef, useState } from 'react';
import { browserPopupRedirectResolver, getRedirectResult, onAuthStateChanged, signOut } from 'firebase/auth';
import { mountApp } from './mountApp';
import { firebaseAuth, startGoogleSignIn } from './firebase';
import { PrefsProvider } from './prefsContext';
import { ConnectionLanguageSelector, useConnectionLanguage } from './connectionI18n';
import { oauthCallback, oauthFetch } from './oauthApi';
import './agents.css';
import './oauth.css';

const TRANSACTION_STORAGE = 'sentient.oauthTransaction';
const AUTHORIZATION_PATH = '/api/dashboard/me/oauth/authorization';
function initialTransaction() {
  const url = new URL(window.location.href);
  let value = url.searchParams.get('transaction');
  try {
    if (value === null) value = sessionStorage.getItem(TRANSACTION_STORAGE);
    else sessionStorage.removeItem(TRANSACTION_STORAGE);
  } catch { /* The URL also survives a normal Firebase redirect round trip. */ }
  if (!value || !/^[A-Za-z0-9_-]{20,256}$/.test(value)) return '';
  try { sessionStorage.setItem(TRANSACTION_STORAGE, value); } catch { /* optional storage */ }
  return value;
}
function AuthorizeConnection() {
  const { lang, setLang, t, errorText, formatDate } = useConnectionLanguage('Authorize a connection');
  const [transaction] = useState(initialTransaction);
  const [user, setUser] = useState(undefined);
  const [authorization, setAuthorization] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const sending = useRef(false);
  useEffect(() => onAuthStateChanged(firebaseAuth, next => {
    generation.current += 1;
    sending.current = false;
    setUser(next); setAuthorization(null); setError(''); setBusy(false);
  }), []);
  useEffect(() => {
    getRedirectResult(firebaseAuth, browserPopupRedirectResolver).catch(failure => {
      setError({ signInCode: failure.code || '' });
    });
  }, []);
  useEffect(() => {
    if (!user || !transaction) return;
    const controller = new AbortController();
    const current = generation.current;
    setLoading(true); setError(''); setAuthorization(null);
    oauthFetch(`${AUTHORIZATION_PATH}?transaction=${encodeURIComponent(transaction)}`, { signal: controller.signal })
      .then(data => {
        if (!data.client_name || !Array.isArray(data.scopes) || !data.scopes.length ||
          data.scopes.some(scope => !['sentient:read', 'sentient:write'].includes(scope))) {
          throw new Error('This connection request could not be verified. Restart it from ChatGPT.');
        }
        if (current === generation.current) setAuthorization(data);
      }).catch(failure => {
        if (failure.name !== 'AbortError' && current === generation.current) setError(failure);
      }).finally(() => {
        if (current === generation.current) setLoading(false);
      });
    return () => controller.abort();
  }, [user, transaction, attempt]);
  const login = async () => {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError('');
    try {
      const failure = await startGoogleSignIn();
      if (failure) setError({ signInCode: failure.code || '' });
    } catch (failure) { setError({ signInCode: failure.code || '' }); }
    finally { sending.current = false; setBusy(false); }
  };
  const decide = async approve => {
    if (sending.current || !authorization) return;
    sending.current = true; setBusy(true); setError('');
    const current = generation.current;
    try {
      const data = await oauthFetch(AUTHORIZATION_PATH, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction, approve }),
      });
      if (current !== generation.current) return;
      const callback = oauthCallback(data.redirect_url);
      try { sessionStorage.removeItem(TRANSACTION_STORAGE); } catch { /* optional storage */ }
      window.location.replace(callback);
    } catch (failure) { if (current === generation.current) setError(failure); }
    finally { if (current === generation.current) { sending.current = false; setBusy(false); } }
  };
  const canWrite = authorization?.scopes.includes('sentient:write');
  const authorizationErrorText = failure => [400, 404, 409, 410, 422].includes(failure?.status)
    ? t('This connection request expired or is no longer valid. Restart it from ChatGPT.') : errorText(failure);
  return <main className="agents-page oauth-page">
    <header><a href={import.meta.env.BASE_URL}>Sentient Dash</a><nav className="connection-nav" aria-label={t('Connection navigation')}><ConnectionLanguageSelector {...{ lang, setLang, t }} />{user ? <button disabled={busy} onClick={() => signOut(firebaseAuth)}>{t('Sign out')}</button> : null}</nav></header>
    <h1>{t('Authorize a connection')}</h1>
    <p>{t('Review the requested access before connecting your SentientDash account.')}</p>
    {error ? <p className="agent-error" role="alert">{authorizationErrorText(error)}</p> : null}
    {!transaction ? <section><h2>{t('Start from ChatGPT')}</h2><p>{t('Open the SentientDash connection in ChatGPT to begin a new authorization request.')}</p></section> : user === undefined ? <p>{t('Checking sign-in…')}</p> : !user ? <section>
      <h2>{t('Sign in to authorize this connection')}</h2><p>{t('Use your authorized Sentient account.')}</p>
      <button className="agent-primary" disabled={busy} onClick={login}>{t(busy ? 'Signing in…' : 'Sign in with Google')}</button>
    </section> : <>
      <p className="agent-owner">{t('You are signed in as {email}.', { email: user.email })}</p>
      {loading ? <p role="status">{t('Loading requested access…')}</p> : authorization ? <section className="oauth-consent" aria-labelledby="oauth-client-name">
        <h2 id="oauth-client-name">{t('{client} wants to connect', { client: authorization.client_name })}</h2>
        <p className="oauth-access">{t(canWrite ? 'Read and perform actions' : 'Read only')}</p>
        <ul className="oauth-permissions">
          <li>{t('Read the research, production work and analytics available to your account.')}</li>
          {canWrite ? <li>{t('Perform requested actions using your current SentientDash permissions.')}</li> : null}
        </ul>
        <p>{t('This connection inherits your current product roles. You can revoke it from Agent connections at any time.')}</p>
        <p className="oauth-expiry">{t('This request expires {date}.', { date: formatDate(authorization.expires_at, true) })}</p>
        <div className="agent-actions"><button className="agent-primary" disabled={busy} onClick={() => decide(true)}>{t(busy ? 'Working…' : 'Authorize connection')}</button><button disabled={busy} onClick={() => decide(false)}>{t('Cancel')}</button></div>
      </section> : error ? <button disabled={busy} onClick={() => setAttempt(value => value + 1)}>{t('Try again')}</button> : null}
    </>}
    <p className="oauth-manage"><a href={`${import.meta.env.BASE_URL}agents.html`}>{t('Manage agent connections')}</a></p>
  </main>;
}
mountApp(<PrefsProvider><AuthorizeConnection /></PrefsProvider>);
