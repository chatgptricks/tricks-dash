import { firebaseAuth } from './firebase';
import { API_BASE } from './api';
import { connectionRequestError } from './connectionI18n';

// OAuth consent and grant management always use the actual signed-in identity.
// Do not attach the dashboard's role preview or retain its Firebase credential.
export async function oauthFetch(path, options = {}) {
  const user = firebaseAuth.currentUser;
  if (!user) throw connectionRequestError({ status: 401 }, { detail: 'Sign in required.' });
  const assertSession = () => {
    if (options.signal?.aborted || firebaseAuth.currentUser !== user) {
      throw new DOMException('Request aborted.', 'AbortError');
    }
  };
  assertSession();
  const token = await user.getIdToken();
  assertSession();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  headers.delete('X-Queue-Role-Preview');
  const response = await fetch(`${API_BASE}${path}`, {
    ...options, headers, cache: 'no-store', redirect: 'error', credentials: 'omit',
  });
  assertSession();
  let data;
  try { data = await response.json(); } catch { data = {}; }
  assertSession();
  if (!response.ok) throw connectionRequestError(response, data);
  return data;
}

export function oauthCallback(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new Error('The return address could not be verified. Restart the connection from ChatGPT.'); }
  if (url.origin !== 'https://chatgpt.com' || url.username || url.password || url.hash ||
    !(url.pathname === '/connector_platform_oauth_redirect' || /^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(url.pathname))) {
    throw new Error('The return address could not be verified. Restart the connection from ChatGPT.');
  }
  return url.href;
}
