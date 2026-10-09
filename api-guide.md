# Guía de la API de Sentient Dash

Conecta los datos del dashboard con websites, media kits, aplicaciones, reportes y procesos automáticos. Esta guía sirve para cualquier integración autorizada y explica qué datos puedes consultar, cómo autenticarte y cómo interpretar cada respuesta, sin depender del lenguaje ni del hosting que utilices.

La API ofrece **lectura de datos públicos guardados de las cuentas seleccionadas**: perfil, seguidores, rendimiento de publicaciones, catálogo de posts e historial de seguidores. Cada conexión tiene su propia clave, vigencia y alcance. La aplicación consulta desde su servidor; si tiene una interfaz pública, ese servidor entrega a los visitantes los datos que corresponda mostrar.

| Referencia | Valor |
| --- | --- |
| Base de producción | `https://cortex-api-db2e.onrender.com/api/v1` |
| Autenticación | Header `Authorization: Bearer TU_CLAVE` |
| Método | `GET` en los cinco endpoints de esta guía |
| Formato | JSON, `schema_version: "1.0"` |
| Límite | 60 consultas por minuto por clave |
| Configuración de conexiones | [Conexiones API](https://sentientdash.app/api.html) |

## 1 Elegir los datos y la forma de integración

| Lo que quieres construir | Datos y patrón de consulta |
| --- | --- |
| Media kit o página de un creador | `/media-kit` para perfil, seguidores, rendimiento y posts destacados |
| Website de una marca o directorio de cuentas | `/accounts` para conocer el alcance y perfil de cada cuenta con `/accounts/{handle}` |
| Galería o catálogo de publicaciones | `/posts`, paginado y filtrado por fechas |
| Gráfico de evolución de audiencia | `/followers/history`, con muestras diarias guardadas |
| Reporte periódico o herramienta de análisis | Consultas desde un script o servicio; guarda la fecha de captura y el rango utilizado |
| Website estático | Una función de servidor como proxy, o una tarea que genere contenido estático a partir de la API |
| Aplicación con varias cuentas | Una clave que autorice esas cuentas, caché separada por cuenta y consultas dentro del límite compartido de la clave |

Actualmente los perfiles expuestos son de Instagram. La API lee la base del dashboard: una consulta no inicia scraping, no solicita nuevas capturas ni acelera la actualización de métricas. Los datos cambian cuando el dashboard guarda nuevas observaciones. Tampoco permite editar datos, administrar usuarios o Queue, ni acceder a contactos, análisis internos o credenciales de otros servicios. No incluye webhooks: para mantener tu integración al día, consulta periódicamente o al vencer su caché.

## 2 Crear y administrar una conexión

1. Entra a [sentientdash.app](https://sentientdash.app) con tu cuenta de Admin o Dev.
2. Abre el menú del engranaje y elige **Conexiones API**, o abre [la pantalla de conexiones](https://sentientdash.app/api.html).
3. En **Conectar una integración**, escribe un nombre reconocible en **Nombre de la conexión**, por ejemplo `Website de la marca`, `Reporte mensual` o `App de analítica`.
4. Selecciona la vigencia en **Vence en**: 30, 90 o 365 días.
5. En **Cuentas permitidas**, marca las cuentas que la integración podrá consultar. Usa **Buscar cuentas** para encontrarlas. La clave conserva esta selección; no recibe automáticamente cuentas nuevas que agregues al dashboard.
6. Pulsa **Generar clave API**. En **Tu clave API**, usa **Copiar clave API** y guárdala como secreto privado del servidor. Después pulsa **Ya guardé la clave**. La clave comienza con `sad_api_` y se muestra una sola vez.

Crea una clave por integración o entorno para poder identificarla y revocarla por separado. Puedes autorizar hasta 100 cuentas activas por clave y mantener hasta 20 claves activas por propietario. El límite de 60 consultas por minuto se comparte entre todos los endpoints y cuentas consultados con una misma clave.

En **Tus claves API** puedes ver el alcance, vencimiento y último uso. Para bloquear una conexión, pulsa **Revocar** y después **Confirmar revocación**. Si pierdes una clave o necesitas cambiar las cuentas autorizadas, crea una nueva y revoca la anterior. Para rotar una clave sin interrumpir tu aplicación, configura primero la nueva en el servidor, comprueba una consulta y revoca la anterior.

Solo Admin o Dev puede crear claves. Si el propietario pierde ese permiso o se elimina su acceso al dashboard, sus claves dejan de consultar datos. La revocación y la caducidad bloquean las lecturas futuras; los datos que tu integración ya recibió pueden permanecer en su caché o almacenamiento. Para retirar datos publicados inmediatamente, retíralos también de tu aplicación.

## 3 Autenticación y configuración del servidor

Estas rutas requieren una clave de integración `sad_api_`: una sesión Firebase del dashboard o una clave MCP no sirven para autenticarse en `/api/v1`. Envía la clave únicamente al origen de la API y en el header:

```http
Authorization: Bearer sad_api_REEMPLAZA_CON_TU_CLAVE
```

Guárdala en las variables privadas o en el gestor de secretos del hosting. En los ejemplos de esta guía usamos:

```dotenv
SENTIENT_DASH_API_KEY=sad_api_REEMPLAZA_CON_TU_CLAVE
SENTIENT_DASH_ACCOUNT=tu_cuenta
```

`SENTIENT_DASH_ACCOUNT` es una variable de conveniencia para los ejemplos de una cuenta, no un requisito del protocolo. Su valor es el usuario de Instagram sin `@`. Para varias cuentas, descubre los handles con `/accounts` y consulta cada uno desde tu servidor.

La clave nunca debe aparecer en HTML, JavaScript del navegador, una app móvil distribuida, repositorios, URLs, analítica ni variables públicas como `VITE_*` o `NEXT_PUBLIC_*`. No publiques la clave ni el header en logs. Los visitantes o usuarios finales no necesitan una clave del dashboard.

```text
Website o app → tu servidor o función → API de Sentient Dash
             ← datos para mostrar   ← JSON de cuentas autorizadas
                                      clave privada en Authorization

Reporte o automatización → API de Sentient Dash
                           clave privada en el entorno del proceso
```

| Tu plataforma | Dónde ejecutar la consulta |
| --- | --- |
| React, Vue u otra interfaz en el navegador | En tu backend o función de servidor; la interfaz consulta una ruta propia |
| Next.js u otro framework con servidor | En una ruta o proceso que se ejecute únicamente en el servidor |
| PHP o WordPress | En código del servidor; guarda el secreto fuera de los archivos públicos |
| HTML estático | En una función de servidor o durante la generación del sitio |
| App móvil | En el backend de la app; no incluyas la clave en el paquete instalado |
| Python, Node u otra automatización | En el proceso que ejecuta el reporte, con el secreto en su entorno |

Una clave con varias cuentas da acceso a todas ellas a tu servidor. Si expones una ruta para usuarios finales, decide cuáles pueden ver cada cuenta y valida los handles permitidos. Evita un proxy que acepte una URL arbitraria del navegador. La clave del dashboard no sustituye la autenticación de tu propia aplicación.

## 4 Primera consulta y referencia de endpoints

Con la variable `SENTIENT_DASH_API_KEY` cargada en una terminal del servidor, descubre las cuentas autorizadas:

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/accounts"
```

Todos los endpoints siguientes usan `GET`. Los paths se añaden a la base `/api/v1`. Usa el handle recibido en `/accounts`, sin `@`.

| Endpoint | Contenido de `data` | Parámetros de consulta |
| --- | --- | --- |
| `/accounts` | Lista de cuentas activas autorizadas | Ninguno |
| `/accounts/{handle}` | Perfil público de una cuenta | Ninguno |
| `/accounts/{handle}/media-kit` | Perfil, resumen de rendimiento, posts destacados y crecimiento disponible | Ninguno |
| `/accounts/{handle}/posts` | Lista paginada de publicaciones públicas guardadas | `limit`, `offset`, `from`, `to` |
| `/accounts/{handle}/followers/history` | Lista paginada de muestras diarias de seguidores | `limit`, `offset`, `from`, `to` |

Las respuestas de colección tienen `data` como arreglo; perfil y media kit tienen `data` como objeto. No todos los endpoints llevan los mismos metadatos: `/accounts` incluye `schema_version` y `data`; perfil y media kit incluyen además `generated_at` y `data_updated_at`; posts e historial incluyen `generated_at`, `pagination` y las fechas de cada fila. El historial añade `timezone`.

Los ejemplos JSON siguientes son ficticios y muestran la estructura, no datos reales de una cuenta. Un campo opcional puede no estar presente y una medición desconocida puede ser `null`. Conserva esa diferencia en tu aplicación.

### Cuentas autorizadas

```json
{
  "schema_version": "1.0",
  "data": [
    {
      "handle": "cuenta_ejemplo",
      "public_name": "Cuenta de ejemplo",
      "profile_url": "https://www.instagram.com/cuenta_ejemplo/"
    }
  ]
}
```

La lista contiene las cuentas seleccionadas para esa clave que siguen activas. Una cuenta fuera de su alcance o inactiva no se puede consultar: devuelve `404`. Una selección autorizada no garantiza que ya haya métricas disponibles.

### Perfil público

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/accounts/$SENTIENT_DASH_ACCOUNT"
```

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-10-09T18:00:00+00:00",
  "data_updated_at": {
    "profile": "2026-10-09T12:00:00+00:00",
    "engagement": "2026-10-09T15:00:00+00:00"
  },
  "data": {
    "handle": "cuenta_ejemplo",
    "public_name": "Cuenta de ejemplo",
    "public_bio": "Descripción pública de ejemplo",
    "platform": "Instagram",
    "profile_url": "https://www.instagram.com/cuenta_ejemplo/",
    "followers": 10000,
    "profile_posts": 120,
    "verified": false
  }
}
```

| Campo del perfil | Significado |
| --- | --- |
| `handle`, `public_name` | Usuario y nombre público de la cuenta |
| `public_bio` | Biografía pública, opcional |
| `platform`, `profile_url` | Plataforma y enlace al perfil |
| `followers` | Seguidores de la última captura disponible con esa medición; puede ser `null` |
| `profile_posts` | Número de publicaciones informado por el perfil; puede ser `null` |
| `verified` | Estado de verificación almacenado |

## 5 Resumen de rendimiento y media kit

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/accounts/$SENTIENT_DASH_ACCOUNT/media-kit"
```

La respuesta lleva los metadatos de frescura de perfil y engagement. Dentro de `data` aparecen:

| Campo | Contenido |
| --- | --- |
| `generated_at`, `timezone` | Fecha de construcción y zona de referencia del resumen |
| `account` | Los campos del perfil público descritos arriba |
| `summary.all_time` | Resumen del catálogo público guardado que entra en el análisis |
| `summary.last_30_days` | Resumen de posts publicados durante la ventana móvil de 30 días, cuando existe cobertura suficiente |
| `best_posts.all_time` | Hasta tres posts destacados del catálogo público |
| `best_posts.last_30_days` | Hasta tres posts destacados de esa ventana, cuando está disponible |
| `follower_growth.30d.pct` | Crecimiento porcentual de seguidores cuando hay muestras que sustentan exactamente 30 días; opcional |

Cada objeto de `summary` utiliza esta estructura; el ejemplo representa dos posts ficticios:

```json
{
  "post_count": 2,
  "metrics": {
    "likes": { "total": 1000, "average": 500 },
    "comments": { "total": 100, "average": 50 },
    "video_views": { "total": null, "average": null },
    "video_plays": { "total": null, "average": null }
  },
  "engagements": { "total": 1100, "average": 550 },
  "engagement_rate_pct": 5.5
}
```

| Campo del resumen | Cómo interpretarlo |
| --- | --- |
| `post_count` | Cantidad de posts públicos guardados incluidos en ese resumen |
| `metrics.likes`, `metrics.comments` | Likes y comentarios, con `total` y `average` |
| `metrics.video_views`, `metrics.video_plays` | Vistas y reproducciones disponibles, con `total` y `average` |
| `engagements.total`, `engagements.average` | Interacciones calculadas a partir de likes y comentarios conocidos |
| `engagement_rate_pct` | Interacciones promedio por post divididas por seguidores, expresadas como porcentaje |

`all_time` se refiere al catálogo disponible del dashboard, no necesariamente a todas las publicaciones históricas de Instagram. `profile_posts` y `post_count` miden cosas diferentes: publicaciones informadas en el perfil frente a posts guardados incluidos en el análisis.

Los contadores son mediciones acumuladas de cada publicación. `last_30_days` selecciona posts según su fecha de publicación durante las últimas 30 × 24 horas; no representa interacciones ganadas únicamente durante ese período. Los promedios usan las mediciones disponibles. Un total de 30 días puede ser `null` cuando falta cobertura de esa métrica, aunque haya un promedio observado.

`follower_growth.30d.pct` compara capturas utilizables separadas exactamente 30 días; puede ser negativo y no necesariamente finalizar en el día actual.

No sumes los promedios de likes y comentarios para reconstruir `engagements.average`: pueden tener distintas poblaciones medidas. No multipliques `engagement_rate_pct` ni `follower_growth.30d.pct` por 100: ya son porcentajes. Las vistas y reproducciones no equivalen a personas únicas ni a alcance único.

Cada post destacado incluye `shortcode`, `permalink`, `public_caption`, `format`, `published_at`, `metrics: { likes, comments, video_views, video_plays }`, `engagements` y `engagement_rate_pct`. Usa `public_caption` como texto y `permalink` como enlace. La API JSON no entrega archivos de imágenes, videos ni rutas de almacenamiento internas.

Si falta `last_30_days` o `follower_growth`, oculta ese bloque o explica que no hay datos suficientes. Para una cuenta privada, el catálogo público y los posts destacados están vacíos. Los posts ocultos, eliminados, sin fecha utilizable o con fecha futura quedan fuera de la exportación pública.

## 6 Catálogo de posts e historial de seguidores

Ambos endpoints aceptan los siguientes parámetros:

| Parámetro | Valor |
| --- | --- |
| `limit` | Entero de 1 a 100; por defecto 20 |
| `offset` | Entero desde 0; por defecto 0 |
| `from` | Fecha inicial inclusiva, `YYYY-MM-DD`, opcional |
| `to` | Fecha final inclusiva, `YYYY-MM-DD`, opcional |

Las fechas se interpretan como días de calendario en `America/Costa_Rica`. Puedes usar un solo extremo o ambos; `from` debe ser anterior o igual a `to`. No envíes fechas u horas en otro formato. Los filtros de posts se aplican a la fecha de publicación; los del historial, al día de la captura.

### Posts

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/accounts/$SENTIENT_DASH_ACCOUNT/posts?limit=20&offset=0&from=2026-10-01&to=2026-10-09"
```

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-10-09T18:00:00+00:00",
  "data": [
    {
      "shortcode": "ExamplePost01",
      "caption": "Texto público de ejemplo",
      "published_at": "2026-10-08T16:00:00+00:00",
      "permalink": "https://www.instagram.com/p/ExamplePost01/",
      "format": "Image",
      "likes": 500,
      "comments": 50,
      "video_views": null,
      "video_plays": null,
      "metrics_updated_at": "2026-10-09T15:00:00+00:00"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 1,
    "has_more": false,
    "next_offset": null
  }
}
```

Los posts se ordenan del más reciente al más antiguo y se deduplican por publicación. `shortcode` identifica el post; `published_at` es su fecha de publicación y `metrics_updated_at` indica la fecha disponible de actualización de métricas. `caption` puede ser `null`. `format` describe el formato almacenado: `Image`, `Carousel`, `Video` o `Reel`; maneja también valores desconocidos en tu interfaz. Aquí las métricas son campos planos; en los posts destacados de `/media-kit` están dentro de `metrics` y el texto se llama `public_caption`.

### Historial de seguidores

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/accounts/$SENTIENT_DASH_ACCOUNT/followers/history?limit=100&from=2026-10-01&to=2026-10-09"
```

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-10-09T18:00:00+00:00",
  "timezone": "America/Costa_Rica",
  "data": [
    { "date": "2026-10-08", "captured_at": "2026-10-09T02:00:00+00:00", "followers": 9900 },
    { "date": "2026-10-09", "captured_at": "2026-10-09T12:00:00+00:00", "followers": 10000 }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 2,
    "has_more": false,
    "next_offset": null
  }
}
```

El historial devuelve la última captura guardada de cada día de Costa Rica, ordenada del día más antiguo al más reciente. `date` es ese día local y `captured_at` es la fecha y hora de la captura. `followers` puede ser `null` si la última captura del día no contiene esa medición. Un día sin captura no aparece: no se rellena automáticamente ni se transforma en cero. Usa solo mediciones conocidas si calculas crecimiento y conserva las fechas reales.

### Recorrer páginas

`pagination.total` es el número de filas que cumplen el filtro. `next_offset` indica dónde continúa la siguiente página y vale `null` cuando termina. Un `200` con `data: []` puede significar que no hay registros para el rango o que el offset está más allá del final; no equivale a un error de autenticación.

Este helper de servidor recoge un rango, con un límite propio de diez páginas para evitar una descarga accidentalmente extensa:

```js
async function readPages(resource, from, to) {
  const base = 'https://cortex-api-db2e.onrender.com/api/v1';
  const handle = process.env.SENTIENT_DASH_ACCOUNT;
  const key = process.env.SENTIENT_DASH_API_KEY;
  if (!handle || !key) throw new Error('Falta configuración privada');
  if (!['posts', 'followers/history'].includes(resource)) {
    throw new Error('Recurso no permitido');
  }
  const rows = [];
  let offset = 0;
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: '100', offset: String(offset) });
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    const response = await fetch(
      `${base}/accounts/${encodeURIComponent(handle)}/${resource}?${query}`,
      {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      },
    );
    if (!response.ok) throw new Error(`API HTTP ${response.status}`);
    const payload = await response.json();
    rows.push(...payload.data);
    if (!payload.pagination.has_more) return rows;
    const next = payload.pagination.next_offset;
    if (!Number.isInteger(next) || next <= offset) throw new Error('Paginación inválida');
    offset = next;
  }
  throw new Error('El rango supera diez páginas; usa un período más corto');
}
```

Consulta un rango estable para un reporte y evita recorrer todo el catálogo en cada visita. La paginación usa offset y no congela una instantánea: si llegan posts nuevos entre páginas, el orden puede desplazarse. Si guardas resultados de posts, deduplica por `shortcode`; en historial, por `date`.

## 7 Ejemplos de servidor y proyecto descargable

### JavaScript en servidor

Este ejemplo consulta primero el alcance y luego el resumen de la primera cuenta. Requiere Node.js 22 o posterior y la clave en el entorno privado del proceso.

```js
const base = 'https://cortex-api-db2e.onrender.com/api/v1';
const key = process.env.SENTIENT_DASH_API_KEY;
if (!key) throw new Error('Falta SENTIENT_DASH_API_KEY');

async function readAPI(path) {
  const response = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`API HTTP ${response.status}`);
  return response.json();
}

const accounts = await readAPI('/accounts');
const handle = accounts.data[0]?.handle;
if (!handle) throw new Error('La clave no tiene cuentas activas disponibles');
const result = await readAPI(`/accounts/${encodeURIComponent(handle)}/media-kit`);
// Usa result.data en tu reporte o respuesta pública; nunca envíes la clave.
const followers = result.data.account.followers;
console.log(followers === null ? 'No disponible' : followers);
```

### Python para un reporte o automatización

Este ejemplo usa la biblioteca estándar, la misma clave privada y un timeout. La cuenta puede venir de tu configuración o de `/accounts`.

```python
import json
import os
from urllib.parse import quote
from urllib.request import HTTPRedirectHandler, Request, build_opener

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

base = 'https://cortex-api-db2e.onrender.com/api/v1'
key = os.environ['SENTIENT_DASH_API_KEY']
handle = quote(os.environ['SENTIENT_DASH_ACCOUNT'], safe='')
request = Request(
    f'{base}/accounts/{handle}',
    headers={'Authorization': f'Bearer {key}'},
)
with build_opener(NoRedirect).open(request, timeout=10) as response:
    payload = json.load(response)

followers = payload['data']['followers']
print('No disponible' if followers is None else followers)
```

### Website de ejemplo completo

El [proyecto descargable](https://sentientdash.app/media-kit-example.zip) es una implementación de referencia de un media kit, uno de los usos posibles de la API. Incluye website y servidor Node.js 22 o posterior, sin dependencias adicionales. Puedes adaptar su diseño, usar su proxy en otra interfaz o tomarlo como base para una integración propia.

Extrae el ZIP y abre una terminal en la carpeta que contiene `server.mjs` y `.env.example`:

```bash
cp .env.example .env
```

Edita `.env` con tu clave y una cuenta autorizada. Luego ejecuta:

```bash
node --env-file=.env server.mjs
```

Abre [http://localhost:3000](http://localhost:3000). El comando utiliza la [opción oficial `--env-file` de Node](https://nodejs.org/download/release/latest-v22.x/docs/api/cli.html#--env-filefile) y las consultas usan [`fetch` integrado](https://nodejs.org/download/release/latest-v22.x/docs/api/globals.html#fetch).

El ejemplo ofrece `/api/media-kit`, `/api/posts` y `/api/followers` en el servidor de tu website. La cuenta se fija en su configuración privada. Mantiene caché de cinco minutos, timeout de diez segundos, caché breve de fallos y presupuesto de 50 consultas al dashboard por minuto en cada proceso. Valida los parámetros y aplica un tope propio de `offset=100000`. Estas son decisiones del ejemplo, no cambios al contrato de la API.

Para publicarlo, configura las variables privadas en el hosting y usa `node server.mjs` como comando de inicio. El hosting aporta `PORT`. Sirve el dominio por HTTPS. En despliegues con varias instancias, usa caché compartida y límites en el hosting: la caché del ejemplo vive en la memoria de un proceso. Las pruebas `node --test server.test.mjs` usan un backend falso y no necesitan una clave real.

## 8 Actualización, caché y calidad de los datos

| Campo de tiempo | Qué representa |
| --- | --- |
| `generated_at` | Momento en que se construyó la respuesta; no es una nueva captura |
| `data_updated_at.profile` | Fecha disponible de la captura utilizada para el perfil y seguidores |
| `data_updated_at.engagement` | Fecha disponible más reciente de actualización del conjunto de métricas; no garantiza la misma frescura en todos los posts |
| `metrics_updated_at` de un post | Fecha disponible de actualización de sus métricas |
| `captured_at` del historial | Momento de la captura de esa fila |

Las fechas de hora usan formato ISO 8601. El rango `from`/`to` y los días del historial usan Costa Rica como referencia. Una fecha de actualización puede ser `null` si no hay evidencia guardada. En perfil, distintos campos pueden provenir de las últimas observaciones disponibles para cada medición.

Guarda una respuesta válida durante unos cinco minutos en tu servidor, por cuenta y recurso, para que varias visitas puedan reutilizarla. Las respuestas del dashboard se envían como `private, no-store`; evita una caché pública del request autenticado y conserva únicamente los datos necesarios dentro de tu integración. Si compartes caché entre varias conexiones, separa sus alcances para que una clave no reciba datos de otra.

Para reportes o generación estática, ejecuta consultas en la frecuencia que necesite el producto y que tenga sentido con la actualización del dashboard. Leer cada segundo no produce datos más nuevos. En varias instancias, comparte caché o coordina el presupuesto, porque todas consumen el límite de la misma clave.

Muestra `—` o “No disponible” para `null`, y `0` solo cuando el valor sea realmente cero. No dibujes como cero un día ausente del historial ni inventes un resumen reciente cuando falta. Si conservas una respuesta anterior durante una incidencia, muestra su fecha de captura y que estás usando datos guardados. Trata nombres y captions como texto; no ejecutes HTML recibido en esos campos.

## 9 Errores, límites y reintentos

Comprueba el estado HTTP antes de procesar `data`. Los errores JSON de la API usan un campo `detail`; su forma puede ser un texto o una lista de validaciones. Una incidencia del gateway o un error `5xx` también puede devolver texto o HTML, así que no asumas que todos los errores son JSON. Usa el estado HTTP para decidir qué hacer y evita depender de frases exactas del error.

| Estado | Causa habitual y acción |
| --- | --- |
| `200` | Consulta correcta; una lista vacía o una métrica `null` también son respuestas válidas |
| `401` | Clave ausente, inválida, vencida o revocada; revisa el secreto y el header Bearer |
| `403` | El propietario perdió permiso Admin/Dev, o la clave se usó fuera de las rutas y método permitidos; verifica acceso y endpoint |
| `404` | Cuenta fuera del alcance, inactiva o handle incorrecto; revisa `/accounts` |
| `422` | Parámetros, límites o fechas inválidos; corrige la consulta antes de reintentar |
| `429` | Límite de 60 consultas por minuto por clave; espera los segundos indicados en `Retry-After` |
| `5xx` o timeout | Incidencia temporal; reintenta con espera creciente y un número acotado de intentos |

No reintentes automáticamente errores `401`, `403`, `404` o `422` sin corregir su causa. Para `429`, respeta `Retry-After`; para fallos temporales, evita que todas las instancias reintenten a la vez. Consolida peticiones simultáneas al mismo recurso y reduce consultas cuando ya tengas datos en caché.

El proxy del proyecto descargable conserva los estados útiles de la API y el header `Retry-After`. Utiliza `502` para fallos de conexión o respuestas inválidas y `504` para timeout, sin devolver al navegador los cuerpos de error del backend.

## 10 Versionado y comprobación de la integración

La ruta pública actual es `/api/v1` y las respuestas declaran `schema_version: "1.0"`. Lee los campos necesarios para tu aplicación, tolera campos adicionales y comprueba los objetos opcionales antes de utilizarlos. No uses rutas internas del dashboard ni de MCP con una clave de integración.

Antes de publicar, verifica estos puntos:

- La clave vive únicamente en el servidor o entorno privado del proceso.
- `/accounts` contiene exactamente las cuentas que necesita la integración.
- Los cinco endpoints se interpretan con sus estructuras y fechas correspondientes.
- Las listas vacías, los campos opcionales y `null` se muestran correctamente.
- La paginación usa `next_offset`, los reportes conservan el rango y los posts se deduplican por `shortcode`.
- Hay caché, timeout y manejo de `429` con `Retry-After`.
- La aplicación protege el acceso de sus propios usuarios cuando corresponde.
- La fecha mostrada representa la captura de los datos y no solo la hora de respuesta.
- Existe una forma de reemplazar o revocar la clave y limpiar datos publicados en la aplicación.

Puedes volver a [Conexiones API](https://sentientdash.app/api.html) para crear y administrar claves, [descargar esta guía](https://sentientdash.app/api-guide.md) o [descargar el proyecto de referencia](https://sentientdash.app/media-kit-example.zip).
