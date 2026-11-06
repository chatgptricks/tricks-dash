import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { firebaseAuth, startGoogleSignIn, describeSignInError } from './firebase';
import { API_BASE, apiFetch } from './api';
import { mountApp } from './mountApp';
import { PrefsProvider, usePrefs } from './prefsContext';
import { VoiceLab } from './voice-lab/VoiceLab';
import '../public/obsidian.css';
import './voice-lab/voice-lab.css';

function VoiceLabApp() {
  const { lang, setLang } = usePrefs();
  const [user, setUser] = useState(undefined), [signInError, setSignInError] = useState('');
  useEffect(() => onAuthStateChanged(firebaseAuth, next => { setUser(next); setSignInError(''); }), []);
  const login = async () => { const error = await startGoogleSignIn(); if (error) setSignInError(describeSignInError(error, lang)); };
  return <VoiceLab key={user?.uid || 'signed-out'} user={user} language={lang} onLanguageChange={setLang} onSignIn={login} onSignOut={() => signOut(firebaseAuth)} signInError={signInError} request={apiFetch} apiBase={API_BASE}/>;
}

mountApp(<PrefsProvider><VoiceLabApp/></PrefsProvider>);
