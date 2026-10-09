import { useEffect } from 'react';
import { usePrefs } from './prefsContext';
export { LanguageSelector as ConnectionLanguageSelector } from './LanguageSelector';

const ES = {
  'API connections': 'Conexiones API',
  'Agent connections': 'Conexiones de agentes',
  'API navigation': 'Navegación de API',
  'Agent navigation': 'Navegación de agentes',
  'Language': 'Idioma',
  'Integration guide': 'Guía de integración',
  'Sign out': 'Cerrar sesión',
  'Connect websites, applications and external tools to profile data, performance, posts and follower history stored in Sentient Dash.': 'Conecta sitios web, aplicaciones y herramientas externas a los datos de perfiles, rendimiento, publicaciones e historial de seguidores guardados en Sentient Dash.',
  'Checking sign-in…': 'Verificando sesión…',
  'Sign in to manage API connections': 'Inicia sesión para administrar conexiones API',
  'Sign in to connect an agent': 'Inicia sesión para conectar un agente',
  'Use your authorized Sentient account.': 'Usa tu cuenta autorizada de Sentient.',
  'Sign in with Google': 'Iniciar sesión con Google',
  'Signing in…': 'Iniciando sesión…',
  'API keys belong to {email}.': 'Las claves API pertenecen a {email}.',
  'Connections belong to {email}.': 'Las conexiones pertenecen a {email}.',
  'Your API keys': 'Tus claves API',
  'Loading API access…': 'Cargando acceso a la API…',
  'Try again': 'Intentar de nuevo',
  'Connect an integration': 'Conectar una integración',
  'Each key grants read access to the accounts you select. Create a separate key for each integration.': 'Cada clave permite leer las cuentas que selecciones. Crea una clave distinta para cada integración.',
  'Connection name': 'Nombre de la conexión',
  'Company website': 'Sitio web de la empresa',
  'Expires in': 'Vence en',
  '30 days': '30 días',
  '90 days': '90 días',
  '1 year': '1 año',
  'Allowed accounts': 'Cuentas permitidas',
  'Search accounts': 'Buscar cuentas',
  'Search by handle…': 'Buscar por usuario…',
  'No matching accounts.': 'No hay cuentas que coincidan.',
  'No active accounts available.': 'No hay cuentas activas disponibles.',
  '{count} account selected': '{count} cuenta seleccionada',
  '{count} accounts selected': '{count} cuentas seleccionadas',
  'The key will appear once. Save it in your integration’s server secrets. It expires automatically and can be revoked below.': 'La clave se mostrará una sola vez. Guárdala en los secretos del servidor de tu integración. Vence automáticamente y puedes revocarla abajo.',
  'Working…': 'Procesando…',
  'Generate API key': 'Generar clave API',
  'API access': 'Acceso a la API',
  'An Admin or Dev can create API keys. Existing keys stop working if their owner loses this access. You can still revoke your own keys below.': 'Un Admin o Dev puede crear claves API. Las claves existentes dejan de funcionar si su propietario pierde este acceso. Puedes revocar tus propias claves abajo.',
  'Your API key': 'Tu clave API',
  'Copy and save this key now. Closing this page or hiding the key removes it from view.': 'Copia y guarda esta clave ahora. Al cerrar esta página u ocultar la clave, dejará de mostrarse.',
  'API key': 'Clave API',
  'Copy API key': 'Copiar clave API',
  'I saved the key': 'Ya guardé la clave',
  'Allowed accounts: {accounts}. Save the key as': 'Cuentas permitidas: {accounts}. Guarda la clave como',
  'on your server.': 'en tu servidor.',
  'No API connections yet.': 'Todavía no hay conexiones API.',
  'Read only': 'Solo lectura',
  'Revoked': 'Revocada',
  'Active': 'Activa',
  'Expired': 'Vencida',
  'Expires {date}': 'Vence el {date}',
  'Last used {date}': 'Último uso: {date}',
  'Not used yet': 'Sin uso todavía',
  'Date unavailable': 'Fecha no disponible',
  'Confirm revoke': 'Confirmar revocación',
  'Cancel': 'Cancelar',
  'Revoke': 'Revocar',
  'Integration details': 'Detalles de integración',
  'API base URL': 'URL base de la API',
  'Copy API URL': 'Copiar URL de la API',
  'Read the API guide': 'Leer la guía de la API',
  'Profile and media kit, paginated public posts, and daily follower history. Up to 60 requests per minute per key. Fetch from your server and cache the response for five minutes.': 'Perfil y media kit, publicaciones públicas paginadas e historial diario de seguidores. Hasta 60 solicitudes por minuto por clave. Consulta desde tu servidor y guarda la respuesta en caché durante cinco minutos.',
  'Each request reads the latest stored dashboard data. Check the timestamps to show when it was measured.': 'Cada solicitud lee los datos más recientes guardados en el dashboard. Revisa las fechas para mostrar cuándo se midieron.',
  'API key revoked. This connection can no longer fetch new data with it.': 'Clave API revocada. Esta conexión ya no puede consultar datos nuevos con ella.',
  'Copied.': 'Copiado.',
  'Select and copy the text manually. Clipboard access is unavailable.': 'Selecciona y copia el texto manualmente. El portapapeles no está disponible.',
  'Connection revoked.': 'Conexión revocada.',
  'Copy unavailable. Select and copy the text manually.': 'No se pudo copiar. Selecciona y copia el texto manualmente.',
  'Connect your agent to Sentient Dash with its own access code. For websites and external applications, use': 'Conecta tu agente a Sentient Dash con su propio código de acceso. Para sitios web y aplicaciones externas, usa',
  'Create a connection': 'Crear una conexión',
  'Agent name': 'Nombre del agente',
  'My Dots, Muse…': 'Mi Dots, Muse…',
  'Access': 'Acceso',
  'Full account access': 'Acceso completo a la cuenta',
  'Full access lets the agent perform actions using your current product permissions. You can revoke access here at any time.': 'El acceso completo permite al agente realizar acciones con tus permisos actuales del producto. Puedes revocar el acceso aquí cuando quieras.',
  'Generate connection code': 'Generar código de conexión',
  'Your connection code': 'Tu código de conexión',
  'Copy it now. It will only be shown once. Add it as your MCP connection’s bearer token in the agent’s secure settings.': 'Cópialo ahora. Se mostrará una sola vez. Agrégalo como token Bearer de tu conexión MCP en los ajustes seguros del agente.',
  'Connection code': 'Código de conexión',
  'Copy code': 'Copiar código',
  'I saved the code': 'Ya guardé el código',
  'MCP server URL': 'URL del servidor MCP',
  'Copy server URL': 'Copiar URL del servidor',
  'Your agents': 'Tus agentes',
  'Loading connections…': 'Cargando conexiones…',
  'No agents connected yet.': 'Todavía no hay agentes conectados.',
  'Could not complete this request.': 'No se pudo completar esta solicitud.',
  'Could not complete this request (HTTP {status}).': 'No se pudo completar esta solicitud (HTTP {status}).',
  'This action is not allowed for your current account.': 'Tu cuenta no tiene permiso para realizar esta acción.',
  'Check the name, accounts and expiration, then try again.': 'Revisa el nombre, las cuentas y la vigencia, y vuelve a intentarlo.',
  'The connection could not be found. Reload this page and try again.': 'No se encontró la conexión. Recarga esta página e intenta de nuevo.',
  'Too many requests. Wait a minute and try again.': 'Demasiadas solicitudes. Espera un minuto e intenta de nuevo.',
  'The service is temporarily unavailable. Try again shortly.': 'El servicio no está disponible temporalmente. Intenta de nuevo en unos momentos.',
  'Could not reach the server. Check your connection and try again.': 'No se pudo contactar al servidor. Revisa tu conexión e intenta de nuevo.',
  'Sign in required.': 'Debes iniciar sesión.',
  'Your session expired -- please sign in again.': 'Tu sesión venció. Inicia sesión de nuevo.',
  'This Google account is not authorized for Sentient Dash.': 'Esta cuenta de Google no está autorizada para Sentient Dash.',
  'Use your signed-in browser to manage agent connections.': 'Usa tu navegador con sesión iniciada para administrar conexiones de agentes.',
  'Use your signed-in browser to manage website API keys.': 'Usa tu navegador con sesión iniciada para administrar claves API.',
  'Admin or Dev access is required to create website API keys.': 'Necesitas acceso de Admin o Dev para crear claves API.',
  'Provide a name and valid Instagram account handles.': 'Ingresa un nombre y usuarios válidos de Instagram.',
  'Choose active Dashboard accounts only.': 'Selecciona únicamente cuentas activas del dashboard.',
  'Revoke an existing API key before creating more (limit 20).': 'Revoca una clave API existente antes de crear más (límite de 20).',
  'Revoke an existing connection before creating more (limit 20).': 'Revoca una conexión existente antes de crear más (límite de 20).',
  'API key not found.': 'No se encontró la clave API.',
  'Connection not found.': 'No se encontró la conexión.',
  'Name required.': 'Debes ingresar un nombre.',
  'Firebase authentication is not configured.': 'La autenticación de Firebase no está configurada.',
  'Sign-in failed. Try again.': 'No se pudo iniciar sesión. Intenta de nuevo.',
  'Sign-in failed ({code}). Try again.': 'No se pudo iniciar sesión ({code}). Intenta de nuevo.',
  'This domain ({domain}) is not authorized in Firebase yet.': 'Este dominio ({domain}) todavía no está autorizado en Firebase.',
  'Your browser blocked the Google sign-in window. Allow pop-ups for sentientdash.app and try again.': 'Tu navegador bloqueó la ventana de Google. Permite ventanas emergentes para sentientdash.app y vuelve a intentarlo.',
  'Network error reaching Google. Check your connection and try again.': 'No se pudo contactar a Google. Revisa tu conexión e intenta de nuevo.',
};

export function connectionRequestError(response, data) {
  const error = new Error(typeof data.detail === 'string' ? data.detail : '');
  error.status = response.status;
  return error;
}

export function useConnectionLanguage(title) {
  const { lang, setLang } = usePrefs();
  const t = (text, values = {}) => (lang === 'es' ? ES[text] ?? text : text).replace(/\{(\w+)\}/g, (match, key) => String(values[key] ?? match));
  useEffect(() => { document.title = `${lang === 'es' ? ES[title] ?? title : title} · Sentient Dash`; }, [lang, title]);
  const formatDate = (value, withTime = false) => {
    const date = new Date(value);
    if (!value || !Number.isFinite(date.getTime())) return t('Date unavailable');
    return new Intl.DateTimeFormat(lang === 'es' ? 'es-CR' : 'en-US', withTime
      ? { dateStyle: 'medium', timeStyle: 'short' }
      : { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  };
  const errorText = error => {
    if (error?.signInCode !== undefined) {
      const code = error.signInCode;
      if (code === 'auth/unauthorized-domain') return t('This domain ({domain}) is not authorized in Firebase yet.', { domain: window.location.hostname });
      if (code === 'auth/popup-blocked') return t('Your browser blocked the Google sign-in window. Allow pop-ups for sentientdash.app and try again.');
      if (code === 'auth/network-request-failed') return t('Network error reaching Google. Check your connection and try again.');
      return code ? t('Sign-in failed ({code}). Try again.', { code }) : t('Sign-in failed. Try again.');
    }
    const message = typeof error === 'string' ? error : error?.message;
    if (Object.hasOwn(ES, message)) return t(message);
    const status = error?.status;
    if (status === 401) return t('Your session expired -- please sign in again.');
    if (status === 403) return t('This action is not allowed for your current account.');
    if (status === 404) return t('The connection could not be found. Reload this page and try again.');
    if (status === 400 || status === 422) return t('Check the name, accounts and expiration, then try again.');
    if (status === 429) return t('Too many requests. Wait a minute and try again.');
    if (status >= 500) return t('The service is temporarily unavailable. Try again shortly.');
    if (error instanceof TypeError) return t('Could not reach the server. Check your connection and try again.');
    return status ? t('Could not complete this request (HTTP {status}).', { status }) : t('Could not complete this request.');
  };
  return { lang, setLang, t, formatDate, errorText };
}
