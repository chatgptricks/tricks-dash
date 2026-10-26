# Guía de la API de Sentient Dash

Conecta los datos del dashboard con websites, media kits, aplicaciones, reportes y procesos automáticos. Esta guía sirve para cualquier integración autorizada y explica qué datos puedes consultar, cómo autenticarte y cómo interpretar cada respuesta, sin depender del lenguaje ni del hosting que utilices.

La API ofrece **lectura de los datos guardados del producto**, desde perfiles públicos y posts HOT hasta Research, Tracker, Insights, Queue, Promos, News, Hooks, Vault y Configuración consultable. Cada área requiere un scope explícito y los permisos actuales del propietario en el producto. Cada conexión tiene su propia clave, vigencia y alcance. La aplicación consulta desde su servidor; si tiene una interfaz pública, ese servidor entrega a los visitantes los datos que corresponda mostrar.

| Referencia | Valor |
| --- | --- |
| Base de producción | `https://cortex-api-db2e.onrender.com/api/v1` |
| Autenticación | Header `Authorization: Bearer TU_CLAVE` |
| Método | `GET` en todas las rutas de datos; sin escritura |
| Formato | JSON, `schema_version: "1.0"` |
| Límite | 60 consultas por minuto por clave |
| Configuración de conexiones | [Conexiones API](https://sentientdash.app/api.html) |

## 1 Elegir los datos y la forma de integración

| Lo que quieres construir | Datos y patrón de consulta |
| --- | --- |
| Media kit o página de un creador | `/media-kit` para perfil, seguidores, rendimiento y posts destacados |
| Website de una marca o directorio de cuentas | `/accounts` para conocer el alcance y perfil de cada cuenta con `/accounts/{handle}` |
| Galería o catálogo de publicaciones | `/accounts/{handle}/posts` para posts públicos de una cuenta (`accounts`); `/posts` para el catálogo más amplio de Research entre cuentas (`research`) |
| Gráfico de evolución de audiencia | `/followers/history`, con muestras diarias guardadas |
| Reporte periódico o herramienta de análisis | Consultas desde un script o servicio; guarda la fecha de captura y el rango utilizado |
| Website estático | Una función de servidor como proxy, o una tarea que genere contenido estático a partir de la API |
| Aplicación con varias cuentas | Una clave que autorice esas cuentas, caché separada por cuenta y consultas dentro del límite compartido de la clave |

Actualmente los perfiles expuestos son de Instagram. La API lee la base del dashboard: una consulta no inicia scraping, no solicita nuevas capturas ni acelera la actualización de métricas. Los datos cambian cuando el dashboard guarda nuevas observaciones. Con scopes explícitos también expone datos internos guardados del producto. No permite editar registros, cambiar configuraciones, ejecutar análisis pagados ni revelar credenciales de otros servicios. No incluye webhooks: para mantener tu integración al día, consulta periódicamente o al vencer su caché.

## 2 Crear y administrar una conexión

1. Entra a [sentientdash.app](https://sentientdash.app) con tu cuenta de Admin o Dev.
2. Abre el menú del engranaje y elige **Conexiones API**, o abre [la pantalla de conexiones](https://sentientdash.app/api.html).
3. En **Conectar una integración**, escribe un nombre reconocible en **Nombre de la conexión**, por ejemplo `Website de la marca`, `Reporte mensual` o `App de analítica`.
4. Selecciona la vigencia en **Vence en**: 30, 90 o 365 días.
5. En **Cuentas permitidas**, marca las cuentas que la integración podrá consultar. Usa **Buscar cuentas** para encontrarlas. La clave conserva esta selección; no recibe automáticamente cuentas nuevas que agregues al dashboard.
6. En **Datos disponibles (solo lectura)**, conserva **Solo datos públicos de cuentas** para un media kit o selecciona las áreas que necesita la integración. Elige **Todos los datos disponibles (solo lectura)** solo si esa integración debe leer todas las áreas ofrecidas.
7. Pulsa **Generar clave API**. En **Tu clave API**, usa **Copiar clave API** y guárdala como secreto privado del servidor. Después pulsa **Ya guardé la clave**. La clave comienza con `sad_api_` y se muestra una sola vez.

Crea una clave por integración o entorno para poder identificarla y revocarla por separado. Puedes autorizar hasta 1.000 cuentas activas por clave y mantener hasta 20 claves activas por propietario. El límite de 60 consultas por minuto se comparte entre todos los endpoints y cuentas consultados con una misma clave.

En **Tus claves API** (o **Claves API del espacio de trabajo** para un Dev) puedes ver el alcance, vencimiento y último uso. Para bloquear una conexión, pulsa **Revocar** y después **Confirmar revocación**. Si pierdes una clave o necesitas cambiar las cuentas autorizadas, crea una nueva y revoca la anterior. Para rotar una clave sin interrumpir tu aplicación, configura primero la nueva en el servidor, comprueba una consulta y revoca la anterior.

Solo Admin o Dev puede crear claves. Si el propietario pierde ese permiso o se elimina su acceso al dashboard, sus claves dejan de consultar datos. La revocación y la caducidad bloquean las lecturas futuras; los datos que tu integración ya recibió pueden permanecer en su caché o almacenamiento. Para retirar datos publicados inmediatamente, retíralos también de tu aplicación.

Los Devs también pueden ver **Claves API del espacio de trabajo**: todas sus claves y las conexiones activas de los demás propietarios, con el propietario identificado en cada fila. Un Dev puede revocar cualquiera mediante **Revocar → Confirmar revocación**. Los Admins ven y revocan sus propias claves. Revocar una conexión ajena no transfiere su propiedad: solo el propietario puede editar sus scopes y el secreto completo sigue sin poder recuperarse después de generarlo. Las claves ajenas vencidas o revocadas se excluyen de la lista compartida de conexiones activas.

### Áreas de datos y claves existentes

Cada clave tiene dos límites separados: `account_handles` selecciona las cuentas y `data_scopes` selecciona las áreas del producto. Usa **Todas las cuentas**, **Sentient** u **Otras** para agregar cuentas por grupos; puedes agregar resultados de búsqueda sin perder selecciones anteriores. **Todos los datos disponibles (solo lectura)** selecciona todas las áreas que se ofrecen a tu usuario en ese momento. Revisa las áreas antes de generar la clave.

| Scope | Datos autorizados |
| --- | --- |
| `accounts` | Perfiles públicos, media kits, posts públicos, historial de seguidores y HOT |
| `research` | Catálogo guardado de Research, metadatos de fuentes, detalles de posts y grupos temáticos |
| `tracker` | Seguimiento guardado de seguidores e historial de cuentas |
| `insights` | Análisis guardados de posts y resúmenes |
| `queue` | Solicitudes de producción, historial, borradores, tickets y horarios dentro de la visibilidad del propietario |
| `promos` | Promociones, posts relacionados y revisiones guardadas |
| `news` | Noticias, fuentes, briefs y revisiones guardadas del espacio de trabajo |
| `hooks` | Biblioteca guardada de hooks, guardados y borradores propios, respetando los permisos de las fuentes |
| `vault` | Recursos guardados del espacio de trabajo |
| `settings` | Configuración consultable del producto e información segura de cuentas y usuarios |

Las claves existentes conservan únicamente `accounts`. No reciben automáticamente Research, Queue ni otras áreas internas. En **Tus claves API** o **Claves API del espacio de trabajo**, pulsa **Editar acceso a datos** en una clave tuya, selecciona las áreas y **Guardar acceso a datos**. La misma clave funciona de inmediato con sus nuevos scopes; se conservan sus cuentas y su vencimiento. Cambiar scopes no revela ni rota el secreto. Crea una clave nueva si necesitas cambiar sus cuentas permitidas.

Las áreas del espacio de trabajo pueden contener datos internos compartidos que no pertenecen a una sola cuenta de Instagram, especialmente News, Vault y Configuración. Requieren su scope explícito y la API sigue aplicando los permisos actuales del propietario en el producto. Las cuentas seleccionadas limitan los registros vinculados con cuentas. Un scope no otorga acceso superior al del propietario; perder permisos puede volver inaccesibles rutas antes disponibles. Protege los datos internos con la autenticación de tu propia aplicación.

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

Con la variable `SENTIENT_DASH_API_KEY` cargada en una terminal del servidor, descubre las rutas habilitadas y las cuentas autorizadas:

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/capabilities"
```

Todos los endpoints siguientes usan `GET`. Los paths se añaden a la base `/api/v1`. Usa los handles de `account_handles`, sin `@`; con el scope `accounts`, `/accounts` también devuelve sus perfiles públicos. Elige las operaciones marcadas `available` para esta clave.

### Inventario completo de endpoints versionados

Todas las filas siguientes usan `GET`. La falta de un scope devuelve `403`; los datos vinculados con cuentas se limitan a las cuentas seleccionadas y los objetos inaccesibles devuelven `404`. Un agente debe consultar primero `/capabilities` y después `/openapi.json`: estos documentos en ejecución son la referencia de los paths publicados, tipos de parámetros, valores predeterminados, envelopes de respuesta documentados y disponibilidad actual. Que una ruta figure en OpenAPI no concede su permiso. No deduzcas rutas nuevas de las URLs internas del dashboard.

| Endpoint | Scope requerido | Respuesta guardada | Parámetros de consulta |
| --- | --- | --- | --- |
| `/capabilities` | Cualquier clave válida | Rutas, scopes, límites de cuentas y disponibilidad para esta clave | — |
| `/openapi.json` | Cualquier clave válida | Contrato GET versionado y esquemas de parámetros para agentes | — |
| `/accounts` | `accounts` | Cuentas públicas seleccionadas activas | — |
| `/accounts/{handle}` | `accounts` | Perfil público de una cuenta | — |
| `/accounts/{handle}/media-kit` | `accounts` | Perfil, rendimiento, crecimiento y posts destacados | — |
| `/accounts/{handle}/posts` | `accounts` | Catálogo público de posts | `limit, offset, from, to, is_promo` |
| `/accounts/{handle}/posts/{shortcode}` | `accounts` | Un post público y URL de portada autenticada | — |
| `/posts/{shortcode}` | `accounts` | Un post público buscado entre las cuentas seleccionadas | — |
| `/accounts/{handle}/posts/{shortcode}/cover` | `accounts` | Redirección 307 a una portada ya guardada; 404 si no existe | — |
| `/accounts/{handle}/followers/history` | `accounts` | Muestras diarias guardadas de seguidores | `limit, offset, from, to` |
| `/hot` | `accounts` o `research` | Selección HOT guardada y criterios de detección | `account, from, to, history, limit, offset` |
| `/posts` | `research` | Catálogo guardado de Research entre cuentas | `account, from, to, q, is_promo, is_collab, is_hot, include_hidden, include_deleted, sort, limit, offset` |
| `/research/posts/{account}/{shortcode}` | `research` | Detalles y metadatos de fuentes de un post guardado de Research | — |
| `/research/posts/{account}/{shortcode}/media` | `research` | Imágenes y videos guardados disponibles y URLs de descarga autenticadas | — |
| `/research/posts/{account}/{shortcode}/media/{index}` | `research` | Descarga de un archivo guardado, sin JSON | — |
| `/research/stacks` | `research` | Grupos temáticos guardados dentro de las cuentas seleccionadas | `account, from, to, limit, offset` |
| `/research/stacks/{stack_id}/posts` | `research` | Posts guardados en un grupo temático | `account, from, to, limit, offset` |
| `/research/lists` | `research` | Listas propias y compartidas con miembros permitidos únicamente | `account, q, limit, offset` |
| `/research/golden-nuggets` | `research` | Clasificaciones confirmadas Golden Nugget y revisiones guardadas | `account, min_score, target_account, limit, offset` |
| `/tracker/accounts` | `tracker` | Seguimiento de seguidores de las cuentas seleccionadas | `account, limit, offset` |
| `/tracker/overview` | `tracker` | Alias del resumen de seguimiento de cuentas | `account, limit, offset` |
| `/tracker/accounts/{handle}/monthly` | `tracker` | Resumen mensual guardado de seguidores | `from, to, limit, offset` |
| `/tracker/accounts/{handle}/history` | `tracker` | Historial de seguidores de una cuenta | `from, to, limit, offset` |
| `/insights/posts` | `insights` | Posts de análisis guardados entre las cuentas seleccionadas | `account, from, to, q, is_promo, is_collab, is_hot, include_hidden, include_deleted, sort, limit, offset` |
| `/insights/top-posts` | `insights` | Posts guardados ordenados; por defecto por likes | `account, from, to, sort, limit, offset` |
| `/insights/music` | `insights` | Canción y audio guardados de cada post junto a sus métricas | `account, from, to, sort, limit, offset` |
| `/tracker/accounts/{handle}/engagement` | `tracker` | Observaciones diarias o mensuales de interacción de posts | `granularity, from, to, limit, offset` |
| `/insights/follower-growth` | `insights` | Eventos de crecimiento de seguidores y posts candidatos con evidencia limitada | `account, lookback_days` |
| `/insights/summary` | `insights` | Resumen de análisis guardados para el rango elegido | `account, from, to` |
| `/queue/requests` | `queue` | Solicitudes de producción visibles | `account, status, date, limit, offset` |
| `/queue/requests/{request_id}` | `queue` | Una solicitud visible | — |
| `/queue/requests/{request_id}/history` | `queue` | Eventos guardados de una solicitud | `limit, offset` |
| `/queue/drafts` | `queue` | Borradores de producción visibles | `account, limit, offset` |
| `/queue/tickets` | `queue` | Tickets de producción visibles | `status, limit, offset` |
| `/queue/tickets/{ticket_id}` | `queue` | Un ticket visible | — |
| `/queue/schedule` | `queue` | Horario de producción visible | `account, status, date, limit, offset` |
| `/queue/summary` | `queue` | Totales guardados de solicitudes por estado y puntos de producción | `account` |
| `/queue/report` | `queue` | Totales, prioridades, productividad de diseñadores y posts asignados | `account, limit, offset, assigned_limit, assigned_offset` |
| `/queue/team` | `queue` | Equipo visible con las cuentas administradas permitidas | `limit, offset` |
| `/queue/assignments` | `queue` | Asignaciones de producción visibles | `account, assignee, status, limit, offset` |
| `/queue/assignments/{assignment_id}` | `queue` | Una asignación visible | — |
| `/queue/assignments/{assignment_id}/history` | `queue` | Eventos guardados de una asignación | `limit, offset` |
| `/queue/drafts/{request_id}` | `queue` | Un borrador de producción visible | — |
| `/queue/requests/{request_id}/attachments` | `queue` | Metadatos guardados de archivos adjuntos | — |
| `/queue/requests/{request_id}/attachments/{attachment_id}/content` | `queue` | Descarga de un adjunto guardado autorizado, sin JSON | — |
| `/queue/time-blocks` | `queue` | Bloques compartidos de disponibilidad del equipo visibles para el propietario | `date, requester, status, limit, offset` |
| `/queue/preferences` | `queue` | Preferencias guardadas de visualización de Queue del propietario | — |
| `/promos` | `promos` | Clasificación de promociones y posts relacionados guardados | `account, classification, review_status, q, limit, offset` |
| `/promos/{account}/{shortcode}` | `promos` | Detalles guardados de una promoción | — |
| `/promos/{account}/{shortcode}/review` | `promos` | Revisión ya guardada; no inicia análisis de IA | — |
| `/news` | `news` | Noticias guardadas del espacio de trabajo | `saved, q, source_type, limit, offset` |
| `/news/briefs` | `news` | Briefs de noticias guardados | `saved, q, source_type, limit, offset` |
| `/news/story` | `news` | Detalles guardados de una noticia mediante id codificado en URL | `id` |
| `/hooks` | `hooks` | Biblioteca guardada de hooks dentro de los permisos de fuentes | `account, q, topic, limit, offset` |
| `/hooks/saved` | `hooks` | Hooks guardados del propietario | `account, q, topic, limit, offset` |
| `/hooks/drafts` | `hooks` | Borradores guardados de hooks del propietario | `limit, offset` |
| `/hooks/drafts/{draft_id}` | `hooks` | Un borrador guardado del propietario de la clave | — |
| `/hooks/{hook_id}` | `hooks` | Un hook guardado y su análisis disponible | — |
| `/vault` | `vault` | Contenido guardado del espacio de trabajo | `discarded, done, q, limit, offset` |
| `/vault/{link_id}` | `vault` | Un recurso guardado del espacio de trabajo | — |
| `/settings/preferences` | `settings` | Preferencias guardadas del producto del propietario | — |
| `/settings/accounts` | `settings` | Configuración consultable del registro de cuentas | `account, limit, offset` |
| `/settings/usage` | `settings` | Resumen seguro de uso por usuario y período | `days, limit, offset` |
| `/settings/users` | `settings` | Directorio seguro de usuarios visible para el propietario | `q, limit, offset` |
| `/settings/users/{email}` | `settings` | Información segura consultable de un usuario | — |

### Descubrir el acceso antes de elegir una herramienta

```bash
curl --fail-with-body -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/capabilities"
curl --fail-with-body -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/openapi.json"
```

`/capabilities` devuelve `schema_version`, `base_url`, `read_only: true`, `methods: ["GET"]`, `account_handles`, `data_scopes`, `available_scopes`, `rate_limit_per_minute` y `operations`. Cada operación declara `method`, `path`, `required_scopes`, `available` y `summary`. OpenAPI incluye únicamente rutas versionadas de lectura, autenticación Bearer `WebsiteAPIKey` y `x-required-scopes` / `x-available` por operación. Los agentes pueden convertir las operaciones disponibles en herramientas de lectura; la clave permanece en los secretos privados del proceso del agente.

### HOT y Research guardado

```bash
curl --fail-with-body -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/hot?account=example_account&limit=20"
curl --fail-with-body -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/posts?account=example_account,other_account&is_collab=true&limit=100"
```

`/hot` lee clasificaciones HOT persistidas; no las deduce a partir de los likes actuales. El valor predeterminado `history=false` sigue la ventana reciente de 30 horas de la pestaña; `history=true` lee el historial guardado. Los posts incluyen cuenta, shortcode, permalink, caption, fecha, likes, comentarios, views y un objeto `hot`: `is_hot`, `score`, `multiplier`, `criterion: "persisted_first_hour_pace"`, `observed_at`, `account_threshold`, `likes_at_first_check` y `score_unit: "multiple_of_account_hourly_like_threshold"`. El campo `criteria` del envelope explica la marca guardada, la ventana de publicación de 30 horas y la fuente del puntaje. La evidencia ausente se conserva como `null`. El puntaje guardado describe la detección respecto al umbral horario de likes de una cuenta; no es un ranking universal entre cuentas. El umbral actual de la cuenta puede haber cambiado después de la detección.

Las consultas de Research e Insights aceptan `account` con un handle o varios separados por comas, siempre dentro del alcance autorizado. Las fechas `from` y `to` son días calendario inclusivos de Costa Rica. Los filtros de posts incluyen `q`, `is_promo`, `is_collab`, `is_hot`, `include_hidden=false` e `include_deleted=false`. Las rutas públicas de cuentas conservan sus exclusiones públicas; los metadatos internos de fuentes requieren el scope Research. `sort` acepta `date`, `likes`, `comments`, `views` o `hot`. Un collab necesita confirmación guardada; las menciones o usuarios etiquetados por sí solos no lo confirman.

### Listas de cuentas, Golden Nuggets y campos de rendimiento

`/research/lists` devuelve listas guardadas propias y compartidas con `id`, `name`, `handles`, `owner_email`, `is_shared`, `created_at` y `updated_at`. Filtra sus miembros a las cuentas permitidas antes de paginar. `account` limita a un miembro autorizado y `q` busca por nombre de lista. Las listas privadas de otro usuario no están disponibles.

`/research/golden-nuggets` lee clasificaciones confirmadas existentes, sin generar ni puntuar nuevos candidatos. `min_score` es opcional, de 0 a 1; `account` y `target_account` limitan los resultados guardados. Las filas incluyen `account`, `shortcode`, `label`, `target_account` o `null`, `score`, `reviewed_by`, `reviewed_at` y una `review` guardada segura. Los resultados vinculados con cuentas y los destinos referenciados respetan el alcance de la clave.

Los posts de Research e Insights incluyen un mapa `metrics` con los datos de rendimiento guardados disponibles, como compartidos, guardados, alcance, impresiones, mediciones en distintos momentos y puntajes de modelos. Las claves exactas dependen de la cobertura de fuentes. Conserva una medición ausente o `null` como desconocida y distingue puntajes de modelos de conteos observados de audiencia. `hashtags` y `mentions` son arreglos normalizados; los flags de audio y colaboración pagada pueden ser `null`. `transcript_available` y `alt_text_available` describen disponibilidad guardada; el detalle devuelve los textos cuando existen. Las proyecciones públicas de cuentas y de acceso únicamente a HOT no exponen modelos internos ni métricas privadas de rendimiento.

### Música de los posts

`GET /api/v1/insights/music?account=chatgptricks&sort=likes&limit=20` devuelve
los metadatos musicales guardados junto a las métricas del post. Requiere el
scope `insights` y respeta las cuentas autorizadas de la conexión.

Cada elemento incluye `song`, `artist`, `audio_id`, `is_original_audio` y
`audio_url`, además de `account`, `accounts`, `shortcode`, `published_at`,
`permalink`, `likes`, `comments`, `views` y `metrics_updated_at`. Conserva
`audio_id` como texto para no perder precisión. Los valores `null` indican
datos no disponibles; un ID `0` no identifica una canción. Los audios
originales se distinguen por artista y por su ID; si falta el ID, conserva
el shortcode para no agrupar todos los Original audio como si fueran uno.

Acepta `account` como uno o varios handles separados por coma, fechas `from`
y `to`, `sort=date|likes|comments|views|hot`, `limit` de 1 a 100 (20 por defecto)
y `offset` desde 0. Sigue `pagination.next_offset` mientras `has_more` sea
verdadero. La lectura recupera música únicamente para los posts de la página
y no inicia scraping ni actualiza las métricas de Instagram. La cobertura
`coverage` describe solo esa página. Una colaboración puede generar una fila
por cuenta: deduplica por `shortcode` al calcular totales entre cuentas.

El orden de paginación usa las métricas del índice guardado. Las métricas
devueltas pueden incorporar observaciones posteriores de esos posts; por eso
un post de otra página podría tener más likes. Para un ranking exacto de los
valores devueltos, reúne las páginas, deduplica y vuelve a ordenar. Conserva
`ordering` y `metrics_updated_at` al generar reportes.

Los agentes usan `get_insights_music_page` en MCP; la ruta equivalente para
sesiones y códigos de agente es `/api/insights/music/page`. Una clave de
conexión API usa la ruta versionada `/api/v1/insights/music`.

### Cobertura de Tracker e Insights

Las filas del resumen de Tracker incluyen `following_count`, etiqueta/grupo, `rank_by_followers`, `rank_by_growth_7d`, `avg_likes_30d`, `posts_30d`, `engagement_trend_pct` y `delta_1d` / `delta_7d` / `delta_30d`, además del mapa existente `deltas`. Cada delta es un objeto con `delta`, `percent` y `baseline_captured_at`, o `null` si falta una base utilizable. Los rankings se calculan antes de paginar entre las cuentas disponibles para la clave, no todo el espacio de trabajo; conserva `rankings_scope`. Los promedios de 30 días usan posts guardados del período móvil y la tendencia compara `avg_likes_30d` con `avg_likes_previous_30d` de los 30 días anteriores. `likes_known_30d` y `likes_known_previous_30d` indican cobertura de likes utilizables; `posts_30d` cuenta posts aunque sus likes sean desconocidos. Conserva `engagement_methodology` y no transformes conteos desconocidos o negativos de la fuente en cero.

El historial de Tracker expone observaciones guardadas de seguidores y `following_count` cuando está disponible; las filas mensuales incluyen conteos inicial/final, cantidad de observaciones, fechas de captura, `net_followers`, `growth_pct` y `within_month_change`. El crecimiento neto compara cierres mensuales observados; el cambio dentro del mes compara su primera y última observación utilizable. No se inventan muestras ausentes. `/engagement` acepta `granularity=day` o `month` (predeterminado `month`) y devuelve período, cantidad de posts, cantidad con likes conocidos y promedios de métricas disponibles.

`/insights/follower-growth` requiere una sola `account` y acepta `lookback_days` de 35 a 365 (predeterminado 120). Devuelve eventos guardados de crecimiento y posts candidatos próximos en el tiempo, con límites de cobertura y marcas de truncamiento. Los candidatos indican una relación temporal; no demuestran que un post causó el aumento de seguidores. La lectura usa como máximo 1.000 capturas y 5.000 posts guardados, y limita los candidatos a 100 por evento. Conserva la metodología y cobertura junto con el resultado.

Las listas de medios de Research devuelven hasta 100 archivos y referencias disponibles, además de cobertura. Los elementos con `stored: true` incluyen `index`, `kind`, `role`, `content_type`, `expires_possible: false` y un `download_url` relativo autenticado; consulta esa URL desde tu servidor para leer los bytes guardados. Las referencias HTTPS públicas guardadas tienen `stored: false`, `source_url`, un `poster_url`/`observed_at` opcional y `expires_possible: true`. Pueden vencer y no tienen URL de descarga autenticada. Nunca envíes la clave API al origen de `source_url` ni del poster. Una portada guardada no garantiza las diapositivas completas de un carrusel ni el video original; conserva `coverage.includes_all_carousel_slides: false`. Ninguna lectura busca medios faltantes en Instagram ni inicia trabajo de Apify. Los archivos guardados ausentes devuelven `404`; el almacenamiento no disponible puede devolver `503`.

### Datos del espacio de trabajo y lecturas guardadas

`/queue/summary` devuelve `total_requests` y `statuses: [{status, count, production_points}]`. `/queue/report` devuelve un objeto con `totals` por estado, `priorities` de trabajo normal/urgente, `designers` y `assignedPosts`. Cada total/prioridad incluye `count` y `points`. Los diseñadores incluyen `email`, `activeRequests`, `productionPoints`, `closedRequests`, `urgentRequests` y `averageActualMinutes`; este último promedia minutos registrados entre inicio y finalización de solicitudes cerradas y vale `null` si faltan fechas utilizables. Los posts asignados incorporan cambios guardados de borradores e `is_draft`. En el reporte, `activeRequests`, `productionPoints` y `urgentRequests` usan trabajo programado, en progreso y completado; `closedRequests` usa trabajo cerrado. Los diseñadores actuales sin trabajo conservan su fila. Los totales/prioridades usan registros confirmados dentro de las cuentas permitidas antes de paginar; `assignedPosts` puede incluir trabajo asignado cerrado/cancelado y cambios efectivos de horario de borradores. Los diseñadores usan `limit`/`offset` y los posts asignados `assigned_limit`/`assigned_offset` (predeterminados 50/0, máximo de limit 100); sigue `pagination.designers` y `pagination.assigned_posts` de forma independiente. El equipo expone identidad segura, roles operativos, zona horaria, minutos por punto de producción y las cuentas administradas dentro del alcance de la clave. Los adjuntos de solicitudes devuelven `id`, `name`, `size`, `content_type` y `uploaded_at` guardados y un `download_url` relativo. Esa ruta de metadatos no descarga el archivo; consulta su URL autenticada de contenido desde tu servidor para recibir bytes con `200`, el tipo MIME guardado y un nombre de archivo adjunto. La lectura transmite únicamente el objeto ya guardado; un adjunto u objeto inexistente devuelve `404` y nunca descarga una URL externa arbitraria. Los detalles, borradores e historiales de Queue respetan la misma visibilidad que su solicitud o asignación.

Las revisiones de Promos, briefs y detalles de News, análisis de Hooks y registros de Vault son contenido ya guardado. Ninguna lectura crea revisiones, llama un modelo de IA, actualiza una fuente ni marca contenido como leído. Hooks respeta la modalidad solo OCR y los límites de fuentes; los guardados y borradores pertenecen al propietario de la clave. Las proyecciones de usuarios de Configuración excluyen secretos de proveedores y credenciales privadas de conexiones. `/settings/usage` acepta `days` de 1 a 90 (predeterminado 30) y devuelve filas seguras con `email`, `request_count` y `last_seen_at`, además de `period: {days, since}`; excluye paths operativos de solicitudes. Codifica los valores de path, como handles, shortcodes y correos, y usa un constructor de URL para codificar el parámetro `id` de News.

### Disponibilidad compartida y preferencias propias

`/queue/time-blocks` expone disponibilidad compartida del equipo independientemente de las cuentas de Instagram seleccionadas; habilita `queue` únicamente para integraciones autorizadas a leer ese contexto operativo. Los filtros opcionales son `date` en `YYYY-MM-DD`, el correo `requester` y `status` (`pending`, `approved` o `rejected`). Sin estado, devuelve bloques pendientes y aprobados. Excluye tickets vinculados con posts y solicitudes de cambios de cuentas, movimientos, sugerencias de posts y cuentas nuevas. Las filas incluyen identidad/tipo del bloque, solicitante, estado/categoría/título, horario/duración, motivo, nota del revisor y fechas de creación/revisión/actualización.

`/queue/preferences` devuelve únicamente `hidden_users`, `row_order` y `updated_at` del propietario de la clave; no lee la vista personal de otro usuario. `/settings/preferences` devuelve sus `preferences` y `updated_at`: los campos consultables incluyen idioma, tema, acento, acento personalizado, efectos, guía/alcance de diseñador de Queue y favoritos de Tracker. `trackerFavorites` se limita a las cuentas permitidas. Las preferencias son copias de solo lectura: ninguna ruta las guarda ni modifica y ambas respuestas de detalle omiten paginación.

### Campos principales para integraciones con agentes

Son grupos de campos útiles, sin sustituir el envelope específico de cada ruta. Los objetos pueden agregar campos y los valores opcionales de una fuente pueden ser `null` o estar ausentes.

| Objeto | Campos e interpretación |
| --- | --- |
| Post de Research / Insights | `account`, `shortcode`, `permalink`, `caption`, `published_at`, `format`, `likes`, `comments`, `views`, `video_views`, `video_plays`, `metrics_updated_at`, `is_promo`, `is_hot`, `is_collab`, `collaborators`, `hot`; las proyecciones internas añaden `title`, `ocr_text`, `hidden`, `is_deleted`, duración/diapositivas, hashtags, menciones, audio, colaboración pagada, dimensiones y `checkpoints` de métricas guardadas; `transcript_available` / `alt_text_available` indican cobertura de texto guardado. El mapa `metrics` contiene otras mediciones y puntajes de modelos guardados |
| Detalle de Research | Campos del post más `transcript`, `alt_text`, `analysis_summary`, `llm_report`, `tags`, `coauthors` y `tagged_users` guardados disponibles; consultar el detalle no genera análisis faltantes |
| Solicitud de Queue | Identidad/post de origen, título/caption, `post_type`, puntos de producción, prioridad, tags, brief, notas, referencias, `status`, diseñador/coordinador, cuentas recomendadas, horario, fechas de finalización, permalinks finales, motivo de cancelación, metadatos de adjuntos y fechas de creación/actualización |
| Promo | `account`, `shortcode`, `classification` efectiva, `client`, `product`, `is_promo`, `review_status`, fechas de detección/análisis, clasificación/versión del detector, señales, evidencia, clientes candidatos, enlaces, CTA/código promocional y `review` guardada; una revisión manual puede reemplazar la clasificación efectiva |
| Noticia | `id`, título/descripción, publicación/fuente/editor/autor, metadatos de feed, `link`, imagen, estado guardado, brief, feeds de cobertura, noticias relacionadas, fechas de captura/revisión y `review` guardada; la revisión incluye puntajes disponibles, evidencia, fortalezas/debilidades, dimensiones, novedad, `classification_gates` y `existing_candidates` limitados a las cuentas permitidas |
| Hook / borrador de hook | Los hooks incluyen `id`, tipo de fuente, cuenta/shortcode/permalink, publicación/likes, `hook_text`, `context_text`, tema, categorías/puntajes y fechas; los borradores incluyen `id`, tema, texto, IDs de hooks de origen y fechas de creación/actualización |
| Elemento de Vault | `id`, `url`, `title`, fuente/fecha compartida, prioridad, `discarded`, `done`, texto original, autor, imagen/avatar, tipo de medio, estado de texto y `slack_url` seguro |
| Configuración | Las cuentas incluyen categorías/grupos del registro, umbrales, modo de scraping, flags de funciones y fechas; los usuarios incluyen identidad segura, roles, flag de admin, zona horaria, minutos por punto de producción y fechas |

### Paginación y diferencias de respuestas

Las páginas de posts, grupos, Tracker e Insights usan `limit` de 1 a 100, predeterminado 20, y `offset` desde 0. Las colecciones del espacio de trabajo usan predeterminado 50 y máximo 100; su offset máximo es 100.000. Los detalles devuelven un objeto; las colecciones devuelven un arreglo en `data`, con `schema_version`, `generated_at` y `pagination` donde corresponda. Cada scope tiene su propia proyección: usa los campos documentados y el envelope de respuesta de cada operación, y tolera campos adicionales. Algunos objetos de dominio en OpenAPI son objetos flexibles en vez de esquemas exhaustivos de todos sus campos anidados.

Sigue siempre `pagination.has_more` y `pagination.next_offset`. No calcules la siguiente página con la cantidad de filas devueltas. Los barridos filtrados de Research pueden devolver menos de `limit` coincidencias y `pagination.total: null`; en ese caso `offset`/`next_offset` indican candidatos evaluados. Estas respuestas identifican `offset_type: "candidate"`, `scanned_count`, `candidate_total` y `scan_limit: 500`. Una página filtrada vacía no es el final si `has_more` sigue siendo verdadero. Deduplica los posts por `account` más `shortcode`.

Los adjuntos guardados, los medios guardados de Research y las portadas son excepciones al JSON: los adjuntos y medios guardados transmiten bytes autenticados; la ruta autenticada devuelve `307` a una imagen ya guardada o `404` si no existe. Consúltala desde tu servidor, valida que `Location` sea HTTPS y solicita la imagen sin reenviar el header Authorization de la API. Los visitantes públicos no deben recibir la clave privada.

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

Cada post destacado incluye `shortcode`, `permalink`, `public_caption`, `format`, `published_at`, `is_promo`, `is_collab`, `collaborators`, `metrics: { likes, comments, video_views, video_plays }`, `engagements` y `engagement_rate_pct`. Usa `public_caption` como texto y `permalink` como enlace. `is_promo`, `is_collab` y `collaborators` se describen en la sección siguiente. `/media-kit` conserva sus resúmenes agregados y no acepta el filtro `is_promo` ni separa resúmenes por estado Promo. El JSON del media kit no incluye archivos de imágenes, videos ni rutas de almacenamiento internas. Usa las rutas autenticadas de archivos guardados cuando un endpoint las proporcione.

Si falta `last_30_days` o `follower_growth`, oculta ese bloque o explica que no hay datos suficientes. Para una cuenta privada, el catálogo público y los posts destacados están vacíos. Los posts ocultos, eliminados, sin fecha utilizable o con fecha futura quedan fuera de la exportación pública.

## 6 Catálogo de posts e historial de seguidores

Esta sección describe las rutas públicas `/accounts/{handle}/posts` y `/accounts/{handle}/followers/history`. La ruta Research `/posts`, que consulta varias cuentas, se describe por separado en la sección 4. Ambas rutas públicas aceptan estos parámetros:

| Parámetro | Valor |
| --- | --- |
| `limit` | Entero de 1 a 100; por defecto 20 |
| `offset` | Entero desde 0; por defecto 0 |
| `from` | Fecha inicial inclusiva, `YYYY-MM-DD`, opcional |
| `to` | Fecha final inclusiva, `YYYY-MM-DD`, opcional |

Las fechas se interpretan como días de calendario en `America/Costa_Rica`. Puedes usar un solo extremo o ambos; `from` debe ser anterior o igual a `to`. No envíes fechas u horas en otro formato. Los filtros de posts se aplican a la fecha de publicación; los del historial, al día de la captura.

### Posts

Además de los parámetros compartidos, `/accounts/{handle}/posts` acepta este filtro opcional:

| Parámetro | Valor |
| --- | --- |
| `is_promo` | `true` devuelve posts Promo; `false` devuelve los demás; omitirlo devuelve todos |

Cada post devuelve `is_promo` como booleano JSON. Es `true` si tiene la marca manual Promo o si su caption coincide con `/#aitoolsentient\b/i`, sin distinguir mayúsculas y minúsculas. Esta es la misma regla que usa Research. El filtro se aplica antes de paginar: `pagination.total` cuenta los posts que cumplen el estado Promo y los filtros de fechas de la consulta. No envíes `is_promo` al historial de seguidores.

Por ejemplo, para consultar solo posts Promo:

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $SENTIENT_DASH_API_KEY" \
  "https://cortex-api-db2e.onrender.com/api/v1/accounts/$SENTIENT_DASH_ACCOUNT/posts?is_promo=true&limit=20&offset=0"
```

Usa `is_promo=false` para consultar posts que no son Promo. La siguiente consulta omite el filtro e incluye todos los estados:

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
      "is_promo": false,
      "is_collab": null,
      "collaborators": [],
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

### Colaboraciones

Los posts del catálogo `/posts` y los destacados de `best_posts.all_time` y `best_posts.last_30_days` en `/media-kit` incluyen los siguientes campos:

| Campo | Significado |
| --- | --- |
| `is_collab` | `true`, `false` o `null`, según la evidencia de coautoría guardada |
| `collaborators` | Arreglo de handles válidos en minúsculas, sin `@` y sin duplicados; excluye la cuenta consultada |

`is_collab` es `true` cuando los datos explícitos de coautoría confirman al menos otro participante. Es `false` solo cuando hay una lista explícita válida vacía, o cuando esa lista contiene únicamente la cuenta consultada y el propietario confirmado es esa misma cuenta. Es `null` cuando no hay evidencia válida suficiente: por ejemplo, faltan metadatos utilizables o solo aparece la cuenta consultada sin poder confirmar quién es el propietario. Si hay otro participante válido, conserva `true` aunque otras entradas de los metadatos sean inutilizables.

La lista contiene los handles válidos disponibles de otros participantes respecto a la cuenta consultada; puede estar incompleta cuando faltan handles o hay entradas inutilizables. Si los datos explícitos de coautores confirman su participación, también puede incluir al propietario conocido de la publicación. Un propietario distinto por sí solo, sin evidencia explícita de coautores, no confirma una colaboración.

Estos ejemplos muestran únicamente los campos de colaboración de tres posts ficticios:

```json
[
  { "is_collab": true, "collaborators": ["cuenta_colaboradora"] },
  { "is_collab": false, "collaborators": [] },
  { "is_collab": null, "collaborators": [] }
]
```

Conserva `null` como “Desconocido”; no lo conviertas en `false`. Una lista vacía de `collaborators` tampoco confirma por sí sola que el post no sea una colaboración. Usa `is_collab === true`, `is_collab === false` e `is_collab === null` para distinguir los estados.

La coautoría procede de los metadatos explícitos guardados. Las menciones en el caption, los usuarios etiquetados y la marca Promo no confirman colaboración; estos campos son independientes de `is_promo`. La ruta pública `/accounts/{handle}/posts` no acepta el parámetro `is_collab`; la ruta separada Research `/posts` sí lo admite. Los resúmenes del media kit y el filtro Promo de `/posts` conservan su comportamiento.

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
async function readPages(resource, from, to, isPromo) {
  const base = 'https://cortex-api-db2e.onrender.com/api/v1';
  const handle = process.env.SENTIENT_DASH_ACCOUNT;
  const key = process.env.SENTIENT_DASH_API_KEY;
  if (!handle || !key) throw new Error('Falta configuración privada');
  if (!['posts', 'followers/history'].includes(resource)) {
    throw new Error('Recurso no permitido');
  }
  if (isPromo !== undefined && (resource !== 'posts' || typeof isPromo !== 'boolean')) {
    throw new Error('isPromo debe ser booleano y solo se usa con posts');
  }
  const rows = [];
  let offset = 0;
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: '100', offset: String(offset) });
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    if (isPromo !== undefined) query.set('is_promo', String(isPromo));
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

El cuarto argumento del helper es opcional: usa `true` o `false` para filtrar posts por estado Promo y omítelo para obtener todos. Por ejemplo, `readPages('posts', '2026-10-01', '2026-10-09', false)` recoge los posts que no son Promo durante ese rango.

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

El proxy acepta `/api/posts?is_promo=true` y `/api/posts?is_promo=false`; al omitir ese parámetro consulta todos los estados. Lo reenvía al backend antes de la paginación y conserva `is_promo`, `is_collab`, `collaborators` y `pagination.total` en la respuesta, sin convertir `null` en `false`. Mantiene cachés separadas por recurso y parámetros, incluido el filtro Promo. El filtro no se acepta en `/api/media-kit` ni `/api/followers`.

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

Guarda una respuesta válida durante unos cinco minutos en tu servidor, por cuenta, recurso y parámetros de consulta, para que varias visitas puedan reutilizarla. Separa las entradas para `is_promo=true`, `is_promo=false` y el filtro omitido, además de las fechas y la paginación. Las respuestas del dashboard se envían como `private, no-store`; evita una caché pública del request autenticado y conserva únicamente los datos necesarios dentro de tu integración. Si compartes caché entre varias conexiones, separa sus alcances para que una clave no reciba datos de otra.

Para reportes o generación estática, ejecuta consultas en la frecuencia que necesite el producto y que tenga sentido con la actualización del dashboard. Leer cada segundo no produce datos más nuevos. En varias instancias, comparte caché o coordina el presupuesto, porque todas consumen el límite de la misma clave.

Los posts recientes pueden tener `likes: null` porque la fuente guardada todavía no entregó esa medición o no existe una observación utilizable de métricas. Volver a consultar no actualiza Instagram; no sustituyas el dato por views, cero ni likes de otra cuenta.

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

Ante `502`, `503`, `504`, fallos de red o timeouts transitorios, reintenta como máximo tres veces con pausas crecientes y variación aleatoria (por ejemplo alrededor de 1, 2 y 4 segundos). Respeta `Retry-After` en `429` o `503`, con un plazo total limitado; si supera el presupuesto de tu tarea, prográmala de nuevo en vez de entrar en un bucle. Limita las solicitudes simultáneas, preferiblemente a una o dos, y conserva los resultados exitosos de otras cuentas si una falla. La clave comparte un único límite de 60 consultas por minuto entre todas las cuentas y rutas.

Las lecturas admitidas incluyen `X-RateLimit-Limit`, `X-RateLimit-Remaining` y `X-RateLimit-Reset` (el siguiente reinicio en segundos Unix). Comparte ese presupuesto restante entre todas las cuentas y rutas. Una respuesta temporal por almacenamiento ocupado puede devolver `503` con `Retry-After: 2`; el gateway de infraestructura todavía puede responder `502` u otros fallos transitorios, por lo que debes conservar los reintentos limitados.

No reintentes automáticamente errores `401`, `403`, `404` o `422` sin corregir su causa. Para `429`, respeta `Retry-After`; para fallos temporales, evita que todas las instancias reintenten a la vez. Consolida peticiones simultáneas al mismo recurso y reduce consultas cuando ya tengas datos en caché.

El proxy del proyecto descargable conserva los estados útiles de la API y el header `Retry-After`. Utiliza `502` para fallos de conexión o respuestas inválidas y `504` para timeout, sin devolver al navegador los cuerpos de error del backend.

## 10 Versionado y comprobación de la integración

La ruta pública actual es `/api/v1` y las respuestas declaran `schema_version: "1.0"`. Lee los campos necesarios para tu aplicación, tolera campos adicionales y comprueba los objetos opcionales antes de utilizarlos. No uses rutas internas del dashboard ni de MCP con una clave de integración.

Los campos `is_promo`, `is_collab` y `collaborators`, junto con el filtro opcional Promo, son adiciones compatibles y conservan `schema_version: "1.0"`. Los campos aparecen en el catálogo público `/accounts/{handle}/posts` y en los destacados de `/accounts/{handle}/media-kit`; la ruta pública `/accounts/{handle}/posts` acepta `is_promo`. La ruta separada Research `/posts` también acepta `is_collab`, `is_hot` y filtros de cuentas.

### Qué puede y qué no puede hacer un agente

| Permitido con el scope y los permisos del propietario | No disponible con una clave de integración |
| --- | --- |
| Descubrir el contrato versionado de lectura, las cuentas y las áreas habilitadas | Consultar rutas internas `/api/dashboard`, `/api/admin` o MCP |
| Leer registros y análisis ya guardados del inventario de endpoints | Crear, editar, borrar, asignar, programar, aprobar o actualizar datos |
| Consultar cuentas seleccionadas y áreas compartidas autorizadas explícitamente | Leer cuentas fuera del alcance o saltarse los permisos actuales del producto |
| Leer revisiones, OCR o contenido generado ya guardados cuando estén disponibles | Iniciar scraping, análisis pagados de IA, generación o trabajos nuevos de OCR |
| Leer configuración segura del producto y campos del directorio de usuarios | Recuperar tokens de proveedores, secretos de conexiones, claves de servicios o tablas de la base sin restricciones |

Todas las operaciones de datos usan `GET`; los intentos de escritura con la clave se rechazan. Esta interfaz no requiere una clave MCP. Los datos consultables del producto se exponen mediante las rutas versionadas anteriores; las acciones operativas quedan fuera de esta API de solo lectura. El contenido que aún no está guardado puede devolver un resultado vacío o `404`, sin iniciar trabajo.

Antes de publicar, verifica estos puntos:

- La clave vive únicamente en el servidor o entorno privado del proceso.
- `/accounts` contiene exactamente las cuentas que necesita la integración.
- Cada operación que usa la integración está disponible en `/capabilities` y se interpreta con `/openapi.json`.
- Las listas vacías, los campos opcionales y `null` se muestran correctamente.
- La paginación usa `next_offset`, los reportes conservan el rango y los posts se deduplican por cuenta más `shortcode`.
- Hay caché, timeout y manejo de `429` con `Retry-After`.
- La aplicación protege el acceso de sus propios usuarios cuando corresponde.
- La fecha mostrada representa la captura de los datos y no solo la hora de respuesta.
- Existe una forma de reemplazar o revocar la clave y limpiar datos publicados en la aplicación.

Puedes volver a [Conexiones API](https://sentientdash.app/api.html) para crear y administrar claves, [descargar esta guía](https://sentientdash.app/api-guide.md) o [descargar el proyecto de referencia](https://sentientdash.app/media-kit-example.zip).
