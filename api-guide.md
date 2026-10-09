# Conectar tu media kit a Sentient Dash

User 10 puede mostrar en su website el perfil, seguidores, rendimiento de publicaciones, catálogo de posts e historial de seguidores que ya están guardados en el dashboard. El website consulta una API de solo lectura usando una clave con acceso únicamente a las cuentas elegidas. La clave se guarda en el servidor del website; los visitantes reciben solo los datos públicos que el website decida mostrar.

**Base de la API:** `https://cortex-api-db2e.onrender.com/api/v1`

**Versión de respuesta:** `schema_version: "1.0"`

## 1 Crear la clave en el dashboard

1. Entra a [sentientdash.app](https://sentientdash.app) con tu cuenta de Admin o Dev.
2. Abre el menú del engranaje y elige **API connections**, o entra directamente a [API connections](https://sentientdash.app/api.html).
3. En **Connect a website**, escribe el nombre del sitio en **Website name**, por ejemplo `Media kit de User 10`.
4. Selecciona su vigencia en **Expires in**: 30, 90 o 365 días.
5. En **Allowed accounts**, marca las cuentas que ese website podrá consultar. Usa **Search accounts** para encontrarlas. Si solo necesitas una, autoriza esa cuenta.
6. Pulsa **Generate API key**. En **Your API key**, usa **Copy API key** y guárdala como variable privada del servidor. Después pulsa **I saved the key**. La clave comienza con `sad_api_` y se muestra una sola vez.

Cada website debe tener su propia clave para poder revocarla sin afectar a los demás. En **Your API keys**, usa **Revoke** y después **Confirm revoke** para bloquear su acceso. Si pierdes una clave, crea otra y revoca la anterior. Las consultas vuelven a verificar la vigencia y permisos de la clave; el website puede conservar datos públicos que ya recibió en su propia caché.

Las claves de website acceden solo a la API pública de lectura. No son un login del dashboard ni permiten administrar cuentas, usuarios, Queue, contactos o herramientas internas. Se generan con una sesión de Admin o Dev. Si se elimina al propietario de la clave o pierde ese rol, sus claves dejan de poder consultar datos.

## 2 Guardar la clave en el servidor

En la configuración privada del hosting crea:

```dotenv
SENTIENT_DASH_API_KEY=sad_api_REEMPLAZA_CON_TU_CLAVE
SENTIENT_DASH_ACCOUNT=tu_cuenta
```

`SENTIENT_DASH_ACCOUNT` es el usuario de Instagram sin `@`. La clave nunca debe aparecer en HTML, JavaScript del navegador, repositorios, URLs ni variables públicas como `VITE_*` o `NEXT_PUBLIC_*`.

El flujo es:

```text
Visitante → servidor de tu website → API de Sentient Dash
         ← datos públicos         ← datos públicos
                                    clave privada en Authorization
```

Si el website ya usa Next.js, PHP, WordPress u otro backend, agrega una ruta de servidor. Si es solo HTML o un hosting estático, agrega una función de servidor o un backend pequeño y haz que la página consulte esa función. El código que llama al dashboard se ejecuta allí, con acceso a las variables privadas. El navegador consulta una ruta del propio website como `/api/media-kit`.

## 3 Probar una consulta

Con las variables anteriores cargadas en una terminal del servidor:

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/accounts/$SENTIENT_DASH_ACCOUNT/media-kit"
```

La autenticación usa `Authorization: Bearer CLAVE`. No envíes la clave como parámetro de URL. Este comando consulta datos existentes: no inicia scraping ni actualiza métricas.

## 4 Elegir el endpoint

Todos los endpoints usan `GET`. Reemplaza `{handle}` por el usuario autorizado sin `@`.

| Endpoint después de `/api/v1` | Datos |
| --- | --- |
| `/accounts` | Cuentas autorizadas para esa clave: `handle`, `public_name`, `profile_url` |
| `/accounts/{handle}` | Perfil público de la cuenta |
| `/accounts/{handle}/media-kit` | Perfil, resumen de rendimiento y posts destacados |
| `/accounts/{handle}/posts` | Catálogo paginado de publicaciones guardadas |
| `/accounts/{handle}/followers/history` | Muestras paginadas del historial de seguidores |

La respuesta de media kit contiene `schema_version`, `generated_at`, `data_updated_at` y `data`. `generated_at` indica cuándo se construyó la respuesta. **La fecha de actualización real viene en `data_updated_at.profile` y `data_updated_at.engagement`**; puede ser `null` si no está disponible.

### Campos para el media kit

| Campo de la respuesta | Uso en el website |
| --- | --- |
| `data.account.handle`, `public_name`, `public_bio`, `profile_url` | Identidad y descripción pública |
| `data.account.followers` | Seguidores capturados en el perfil |
| `data.account.profile_posts` | Número de publicaciones informado por el perfil |
| `data.account.verified`, `platform` | Verificación y plataforma |
| `data.summary.all_time.post_count` | Posts guardados que entran en el análisis |
| `data.summary.all_time.metrics.likes.average` | Likes promedio por post medido |
| `data.summary.all_time.metrics.comments.average` | Comentarios promedio por post medido |
| `data.summary.all_time.metrics.video_views.average` | Vistas promedio de los posts con esa medición |
| `data.summary.all_time.metrics.video_plays.average` | Reproducciones promedio de los posts con esa medición |
| `data.summary.all_time.engagements.total`, `.average` | Interacciones medidas, total y promedio |
| `data.summary.all_time.engagement_rate_pct` | Tasa de interacciones por seguidores, ya expresada en porcentaje |
| `data.summary.last_30_days` | Mismos campos, cuando hay datos para ese período |
| `data.best_posts.all_time`, `data.best_posts.last_30_days` | Publicaciones destacadas del catálogo analizado |

En cada métrica de `summary`, `total` es la suma y `average` es el promedio de los posts con esa medición. `profile_posts` y `post_count` representan cosas distintas: publicaciones del perfil y publicaciones guardadas analizadas. El nombre `all_time` se refiere al catálogo disponible; no promete el historial completo de Instagram.

Cada post destacado tiene `shortcode`, `permalink`, `public_caption`, `format`, `published_at`, `metrics: { likes, comments, video_views, video_plays }`, `engagements` y `engagement_rate_pct`. Para pintarlo, usa `public_caption` como texto y `permalink` como enlace. En el endpoint `/posts`, esos valores son campos planos llamados `caption`, `likes`, `comments`, `video_views` y `video_plays`; incluye además `metrics_updated_at`.

Usa `—` o “No disponible” cuando una métrica sea `null`. Un cero real sí se muestra como `0`. Si `last_30_days` no existe, oculta esa sección o explica que no hay datos suficientes. No multipliques `engagement_rate_pct` por 100: ya es un porcentaje. Las vistas y reproducciones no equivalen a alcance único.

## 5 Leer posts e historial con paginación

`/posts` y `/followers/history` aceptan:

| Parámetro | Valor |
| --- | --- |
| `limit` | Entero de 1 a 100; por defecto 20 |
| `offset` | Entero desde 0; por defecto 0 |
| `from` | Fecha inicial inclusiva, `YYYY-MM-DD`, opcional |
| `to` | Fecha final inclusiva, `YYYY-MM-DD`, opcional |

Las fechas se interpretan en `America/Costa_Rica`. La respuesta incluye `pagination: { limit, offset, total, has_more, next_offset }` y `data`. Los posts se ordenan del más reciente al más antiguo. Las muestras de seguidores tienen `date`, `captured_at` y `followers`, con una muestra válida final por día, ordenadas del día más antiguo al más reciente. El historial contiene solo las muestras guardadas por el dashboard.

Ejemplo de rango:

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/accounts/$SENTIENT_DASH_ACCOUNT/posts?limit=20&offset=0&from=2026-10-01&to=2026-10-09"
```

Este helper de **servidor** continúa usando `next_offset`; en un website normalmente basta cargar una página, sin descargar todo el catálogo en cada visita:

```js
async function readPages(resource, from, to) {
  const base = 'https://cortex-api-db2e.onrender.com/api/v1';
  const handle = process.env.SENTIENT_DASH_ACCOUNT;
  const key = process.env.SENTIENT_DASH_API_KEY;
  if (!['posts', 'followers/history'].includes(resource)) {
    throw new Error('Recurso no permitido');
  }
  const rows = [];
  let offset = 0;
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: '100', offset: String(offset) });
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    const url = `${base}/accounts/${encodeURIComponent(handle)}/${resource}?${query}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`API HTTP ${response.status}`);
    const payload = await response.json();
    rows.push(...payload.data);
    if (!payload.pagination.has_more) return rows;
    const next = payload.pagination.next_offset;
    if (!Number.isInteger(next) || next <= offset) throw new Error('Paginación inválida');
    offset = next;
  }
  throw new Error('El rango supera 1000 muestras; consulta un período más corto');
}
```

## 6 Ejecutar el ejemplo listo para adaptar

El [ejemplo descargable](https://sentientdash.app/media-kit-example.zip) incluye un website y servidor Node.js 22 o posterior, sin dependencias adicionales. Extrae el ZIP y abre una terminal dentro de la carpeta que contiene `server.mjs` y `.env.example`.

```bash
cp .env.example .env
```

Edita `.env` con tu clave y cuenta. Luego ejecuta:

```bash
node --env-file=.env server.mjs
```

Abre [http://localhost:3000](http://localhost:3000). El comando utiliza la [opción oficial `--env-file` de Node](https://nodejs.org/download/release/latest-v22.x/docs/api/cli.html#--env-filefile), y las consultas usan [`fetch` integrado](https://nodejs.org/download/release/latest-v22.x/docs/api/globals.html#fetch).

El ejemplo ofrece `/api/media-kit`, `/api/posts` y `/api/followers` en el servidor del website. La cuenta se fija con la variable privada. Mantiene caché de cinco minutos, timeout de diez segundos, caché breve de fallos y presupuesto de 50 consultas por minuto en cada proceso. El proxy solo permite parámetros conocidos y aplica un tope propio de `offset=100000`. Las pruebas `node --test server.test.mjs` usan un backend falso; no requieren una clave real.

Para publicarlo, configura las dos variables privadas en el hosting y usa `node server.mjs` como comando de inicio. El hosting aporta `PORT`. Sirve el dominio por HTTPS. En despliegues con varias instancias, usa caché compartida y límites en el hosting: la caché del ejemplo vive en la memoria de un proceso. Puedes adaptar `client.js` y `styles.css` al diseño actual del media kit.

## 7 Caché y fechas de actualización

Guarda una respuesta válida durante unos cinco minutos en el servidor del website. Así, muchas visitas pueden usar los mismos datos sin consumir consultas para cada visitante. También puedes regenerar el sitio mediante una tarea del servidor si no necesita responder dinámicamente.

Muestra la fecha capturada en `data_updated_at`, no una etiqueta “actualizado ahora” tomada de `generated_at`. Leer la API no solicita nuevos scrapes: la información cambia cuando el dashboard guarda nuevas capturas. Revocar la clave detiene las próximas lecturas al dashboard; para retirar inmediatamente datos ya publicados, limpia también la caché o retíralos de tu website.

## 8 Resolver errores

La API permite **60 consultas por minuto por clave**. Al superar ese límite devuelve `429` con `Retry-After`; espera los segundos indicados antes de volver a consultar.

| Estado | Qué hacer |
| --- | --- |
| `401` | Revisa que la clave exista, no haya vencido ni sido revocada y que se envíe como Bearer desde el servidor |
| `403` | Revisa que el propietario conserve el rol Admin o Dev y que uses GET en la API `/api/v1` |
| `404` | Revisa el handle sin `@`, el endpoint y que la cuenta siga activa y autorizada para esa clave; si necesitas otro alcance, crea una clave con las cuentas correctas |
| `422` | Revisa parámetros, límites y fechas reales; `from` debe ser anterior o igual a `to` |
| `429` | Respeta `Retry-After`, usa caché y evita reintentos simultáneos |
| `5xx` o timeout | Muestra un mensaje temporal y reintenta con espera; el proxy del ejemplo usa 502 para fallos y 504 para timeout |

Antes de compartir el website, revisa que el navegador solo consulte tu propio servidor, que muestre `null` sin inventar cero y que diferencie fechas de captura de fechas de respuesta. Si se expone la clave, revócala y configura una nueva en el servidor.
