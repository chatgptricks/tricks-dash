import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { browserPopupRedirectResolver, getRedirectResult, onAuthStateChanged, signOut } from 'firebase/auth';
import { DevRolePreview, SettingsPanel } from './App';
import { API_BASE, apiFetch } from './api';
import { describeSignInError, firebaseAuth, startGoogleSignIn } from './firebase';
import { PrefsProvider } from './prefsContext';
import { clearSsoCookie, startSsoRefresh, trySsoSignIn } from './sso';
import './styles.css';

const LEGACY_REFRESH_PASSWORD = 'sentient2026';

function SettingsSignIn({ notice }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const login = async () => {
    setBusy(true);
    setError('');
    const nextError = await startGoogleSignIn();
    if (nextError) setError(describeSignInError(nextError));
    setBusy(false);
  };
  return (
    <main className="auth-screen">
      <section className="auth-card settings-access-card">
        <span className="settings-command-kicker">Settings command center</span>
        <h1>Sign in to continue</h1>
        <p>Only Sentient administrators and developers can open this workspace.</p>
        <button type="button" className="primary-button auth-google-button" onClick={login} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in with Google'}
        </button>
        {notice || error ? <p className="settings-notice-error">{notice || error}</p> : null}
      </section>
    </main>
  );
}

function SettingsRestricted({ email, onSignOut }) {
  return (
    <main className="auth-screen">
      <section className="auth-card settings-access-card">
        <span className="settings-command-kicker">Restricted workspace</span>
        <h1>Admin or Dev access required</h1>
        <p><strong>{email}</strong> can use the regular Sentient tools, but cannot manage shared settings.</p>
        <div className="settings-access-actions">
          <a className="ghost-button primary" href={import.meta.env.BASE_URL}>Back to Dashboard</a>
          <button type="button" className="ghost-button" onClick={onSignOut}>Sign out</button>
        </div>
      </section>
    </main>
  );
}

function SettingsApp() {
  const [user, setUser] = useState(undefined);
  const [checked, setChecked] = useState(false);
  const [notice, setNotice] = useState('');
  const [viewer, setViewer] = useState(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState(null);

  useEffect(() => {
    getRedirectResult(firebaseAuth, browserPopupRedirectResolver).catch((error) => setNotice(describeSignInError(error)));
  }, []);
  useEffect(() => { trySsoSignIn().finally(() => setChecked(true)); }, []);
  useEffect(() => onAuthStateChanged(firebaseAuth, (nextUser) => {
    setUser(nextUser);
    setViewer(undefined);
  }), []);
  useEffect(() => (user ? startSsoRefresh() : undefined), [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    apiFetch(`${API_BASE}/api/dashboard/me`)
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 403 ? 'This account is not authorized.' : 'Could not verify Settings access.');
        return response.json();
      })
      .then((body) => { if (active) setViewer(body); })
      .catch((error) => { if (active) setNotice(error.message); });
    return () => { active = false; };
  }, [user]);

  const handleSignOut = useCallback(() => {
    clearSsoCookie();
    signOut(firebaseAuth);
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    setRefreshNotice(null);
    try {
      const response = await apiFetch(`${API_BASE}/api/dashboard/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ password: LEGACY_REFRESH_PASSWORD }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || 'Refresh failed.');
      let added = 0;
      let updated = 0;
      let hotMarked = 0;
      Object.values(body || {}).forEach((result) => {
        if (!result || result.error) return;
        added += result?.short_term?.new_posts?.added ?? 0;
        updated += (result?.short_term?.engagement?.updated ?? 0) + (result?.daily?.updated ?? 0);
        hotMarked += result?.short_term?.engagement?.hot_marked ?? 0;
      });
      const parts = [];
      if (added) parts.push(`${added} new post${added === 1 ? '' : 's'}`);
      if (updated) parts.push(`${updated} refreshed`);
      if (hotMarked) parts.push(`${hotMarked} marked HOT`);
      setRefreshNotice({ type: 'success', text: parts.length ? `${parts.join(', ')}.` : 'Already up to date.' });
    } catch (error) {
      setRefreshNotice({ type: 'error', text: error.message || 'Refresh failed.' });
    } finally {
      setRefreshing(false);
    }
  }, []);

  if (user === undefined || (!user && !checked) || (user && viewer === undefined && !notice)) return <main className="auth-screen" />;
  if (!user) return <SettingsSignIn notice={notice} />;
  const rolePreview = (
    <DevRolePreview
      isDev={Boolean(viewer?.is_dev)}
      canSwitchRoles={Boolean(viewer?.can_role_switch)}
      availableRoles={viewer?.available_operating_roles || viewer?.operating_roles || []}
    />
  );
  if (!viewer?.is_admin && !viewer?.is_dev) return <><SettingsRestricted email={user.email} onSignOut={handleSignOut} />{rolePreview}</>;

  const initialTab = new URLSearchParams(window.location.search).get('tab') || 'overview';
  return <>
    <SettingsPanel
      accounts={[]}
      initialTab={initialTab}
      userEmail={user.email}
      userPhoto={user.photoURL || ''}
      isAdmin={Boolean(viewer.is_admin)}
      isDev={Boolean(viewer.is_dev)}
      onSignOut={handleSignOut}
      onRefresh={refreshAll}
      refreshing={refreshing}
      refreshNotice={refreshNotice}
    />
    {rolePreview}
  </>;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PrefsProvider><SettingsApp /></PrefsProvider>
  </React.StrictMode>,
);
