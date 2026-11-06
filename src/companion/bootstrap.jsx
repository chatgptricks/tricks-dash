import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { onAuthStateChanged } from 'firebase/auth';
import { firebaseAuth } from '../firebase';
import { API_BASE, apiFetch } from '../api';
import { Companion } from './Companion';
import { clearVoiceHandoff } from './voiceHandoff';
import './companion.css';

function Bootstrap() {
  const [session, setSession] = useState(null);
  useEffect(() => {
    let generation = 0, previousUid = '';
    const unsubscribe = onAuthStateChanged(firebaseAuth, async user => {
      const current = ++generation;
      setSession(null);
      if (previousUid && previousUid !== user?.uid) {
        clearVoiceHandoff(previousUid);
        try { sessionStorage.removeItem('sentient.pet.chat.' + previousUid); } catch { /* storage optional */ }
      }
      previousUid = user?.uid || '';
      if (!user?.uid) return;
      try {
        const response = await apiFetch(`${API_BASE}/api/dashboard/assistant/status`);
        if (current !== generation || firebaseAuth.currentUser !== user) return;
        if ([401, 403].includes(response.status)) return;
        const status = response.ok ? await response.json() : { configured: true };
        if (current === generation) setSession({ uid: user.uid, configured: status.configured !== false });
      } catch {
        if (current === generation && firebaseAuth.currentUser === user) setSession({ uid: user.uid, configured: true });
      }
    });
    return () => { generation++; unsubscribe(); };
  }, []);
  return <Companion key={session?.uid || 'signed-out'} session={session} request={apiFetch} apiBase={API_BASE} />;
}

createRoot(document.getElementById('root')).render(<Bootstrap />);
