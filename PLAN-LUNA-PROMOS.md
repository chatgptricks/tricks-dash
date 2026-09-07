# Promos — plan de implementación para GPT‑5.6 Luna

Fecha: 2026-09-06. Este documento es el entregable de planificación; no se ha implementado ni publicado el tool.

## Objetivo y alcance

Crear un workspace independiente en `https://sentientdash.app/promos.html` que detecte publicaciones promocionales de las cuentas competidoras monitoreadas. Mostrar un grid de oportunidades con cliente/marca, producto promovido, página que publica, fecha, enlace comercial y keyword de automatización, cuando existan. Conservar la evidencia que justifica cada detección.

Mantenerlo oculto: cero enlaces entrantes desde Dashboard, Queue, Settings, Tracker, Insights, navegación móvil, selector de tools, sitemap o shortcuts. Acceso directo con login y autorización del servidor. `noindex,nofollow` es adicional, no sustituye permisos. Para el piloto adoptar Admin/Dev existentes; no conceder roles adicionales a usuarios. Esta política es una propuesta de implementación, no un requisito explícito del usuario.

Una promoción detectada no demuestra que hubo pago ni que la marca esté contratando. Usar etiquetas `Disclosed promotion`, `Likely promotion` y `Needs review`; nunca presentar inferencias como contratos confirmados.

## Estado comprobado en el código

- Frontend: `/Users/tbnalfaro/Desktop/Codex Projects/09 Tricks Dash/Tricks Dash`, React/Vite multipágina. `vite.config.js` declara Dashboard, Queue, Settings y mobile. Añadir otra entrada mantiene autenticación y API compartidas.
- `src/api.js` aporta Firebase token y reintentos de lecturas; `src/settings.jsx`, `src/firebase.js` y `src/sso.js` son referencias para login/SSO. Evitar importar todo `App.jsx` únicamente para conseguir un login.
- Backend: `/Users/tbnalfaro/Desktop/Codex Projects/10 Predict`. `backend/app/main.py` contiene API y middleware de autenticación/roles; `db.py` ofrece `connect()` para SQLite y Postgres y extensiones de esquema en runtime. Toda tabla nueva debe inicializarse en ambos motores.
- `dashboard_accounts.group_name` distingue `competitors` de `sentient`; `dashboard_posts` identifica posts por `(account, shortcode)`. Filtrar competidores mediante esa relación, nunca mediante listas hardcodeadas.
- `apify_sync.extract_apify_fields()` ya conserva `paid_partnership`, `hashtags`, `mentions`, `first_comment`, `coauthors`, `tagged_users`, `raw_json` y otros campos. `product_type` significa formato de Instagram, no producto anunciado.
- Puntos a inspeccionar al implementar: `_insert_new_dashboard_posts`, `_process_short_term_items`, enriquecimientos, `refresh_single_post`, backfills e importación de runs en `main.py`. No asumir que todos actualizan captions existentes por la misma ruta.
- `ingestion_jobs.py` ya usa persistencia y leases; `scheduler.py` y `worker.py` son referencias para procesamiento recuperable. El código programa capturas cada 45 minutos durante la ventana diurna y por slots horarios de madrugada; confirmar la configuración real al desplegar. No se verificó el scheduler de producción en esta tarea.
- Dominio confirmado por el usuario: `sentientdash.app`, consistente con `public/CNAME`. Destino: `https://sentientdash.app/promos.html`. Conservar CNAME.
- Existen numerosos archivos ajenos con sufijos ` 2` y ` 3`. Trabajar sobre los canónicos y agregar al commit únicamente archivos de esta implementación.

## 1. Fijar contrato y fixtures antes de programar

Leer instrucciones vigentes de ambos repos y revisar el estado Git. Obtener una muestra acotada de captions existentes de competidores, incluyendo metadata estructurada cuando esté disponible. La muestra es de solo lectura y no requiere nuevos runs de Apify. Crear fixtures sintéticos y una pequeña selección anonimizada de casos reales para evaluar precisión.

Unidad de oportunidad: una publicación `(account, shortcode)`, con uno o varios clientes/productos extraídos. No fusionar automáticamente publicaciones de una campaña: conservar cada competidor y permalink. Si aparecen varias marcas, guardar candidatos y su relación con el texto; no seleccionar la primera mención por defecto.

Definir las interfaces del detector, repositorio, procesador y API antes del frontend. Al terminar esta fase debe existir un JSON de ejemplo que la UI pueda consumir con fixtures.

## 2. Detector determinista, explicable y versionado

Crear `backend/app/promos_detector.py` y `promos_rules.py`. Función pura: campos del post → clasificación, nivel ordinal, evidencias, entidades y versión. Sin DB, red ni LLM dentro de esta función.

Conservar caption original. Normalizar una copia con Unicode NFKC, case folding, eliminación de caracteres invisibles y espacios; mantener mapeo a fragmentos originales para resaltado. Para variantes como `s.p.o.n.s.o.r.e.d` aplicar reglas limitadas a disclosures conocidos, sin compactar todo el caption indiscriminadamente.

Diccionario inicial, ampliable y con reglas de contexto:

| Familia | Ejemplos | Tratamiento |
| --- | --- | --- |
| Declaración explícita | sponsored, sponsored by, paid partnership, paid promotion, advertisement, #ad, #sponsored, publicidad, patrocinado, colaboración pagada | Fuerte cuando describe este post; contextualizar usos editoriales |
| Relación de marca | partner, partnered with, in partnership with, brand ambassador, collab, collaboration, thanks to X for sponsoring, gifted, #lovablepartner | Señal contextual; gifted/affiliate no equivale a pago directo |
| Afiliación/oferta | affiliate, affiliate link, earn a commission, use my code, discount code, promo code, referral, código de descuento, enlace de afiliado | Promoción probable al vincularse con producto o marca |
| CTA indirecto | comment/DM/reply “X”, link in bio, try it here, get access, sign up, comenta “X”, envía “X” | Débil aislado; combinar con contexto comercial |

Tokenizar hashtags por separado. Detectar `#lovablepartner`, `#HiggsfieldSponsored` y variantes con `_` mediante sufijos/prefijos controlados. Extraer el segmento de marca como candidato. No buscar `ad` como substring: `made`, `download`, `shadow`, `advice` y `#adventure` no deben coincidir. `#brandad` requiere marca reconocida y contexto; nunca activar un sufijo `ad` arbitrario.

Combinar reglas con prioridad explícita: metadata válida `paid_partnership=true` o disclosure contextual → `disclosed`; marca/producto + afiliación u oferta comercial → `likely`; señales ambiguas de colaboración o CTA comercial → `needs_review`; sin evidencia suficiente → `not_promo`. `paid_partnership=false`/ausente no descarta una promo.

Manejar negaciones cercanas (`not sponsored`, `no es publicidad`), citas, noticias sobre publicidad (`X launched an ad platform`) y colaboraciones entre creadores. No aplicar una negación global: un post puede decir “not sponsored” y contener un enlace afiliado. Ante contradicción, conservar ambas evidencias y mandar a revisión.

Guardar cada regla activada, origen, fragmento exacto y etiqueta. Un score, si se usa internamente, es heurístico y no una probabilidad estadística. No condicionar detección a likes, HOT, views ni antigüedad mínima.

## 3. Extraer información comercial con evidencia

- **Cliente:** priorizar relación explícita de patrocinio, hashtag de partnership, mención vinculada a CTA y dominio de enlace. Mantener registro pequeño de aliases configurable (p. ej., Higgsfield/Lovable), pero aceptar marcas desconocidas. Ausencia de marca → `Unknown`, sin descartar disclosure claro.
- **Producto:** extraer frase o nombre realmente presente junto a marca/CTA. No inventar nombres comerciales ni usar el formato de Instagram. Si solo dice Higgsfield, mostrar cliente Higgsfield y producto `Not specified`.
- **Enlaces:** separar permalink del post y URLs comerciales del caption. Guardar todas las URLs y su contexto; aceptar solo HTTP/HTTPS al abrirlas. `Link in bio` debe mostrarse como ubicación declarada, sin inventar un enlace. No resolver acortadores ni visitar URLs automáticamente en v1.
- **Automatización:** extraer acción, keyword y canal de `Comment HIGGS for the link`, `DM me VIDEO`, `Comenta IA`, conservando casing original. Separar `Use code SAVE20` como código promocional. Detectar CTA sin keyword como tal. La keyword observada no demuestra que exista una automatización funcionando.
- Guardar evidencias por campo y candidatos cuando haya ambigüedad. Usar caption como fuente principal; metadata/first_comment pueden apoyar indicando su origen. OCR/transcripts y búsqueda externa quedan fuera de v1.

Para captar texto vago sin marcadores, añadir una segunda fase semántica en background con salida JSON validada. Revisar primero si existe un proveedor/modelo/configuración reutilizable; no asumir credenciales. Debe evaluar también captions comerciales que no disparen disclosures, no solo positivos del detector. Caption es dato no confiable: sin herramientas, navegación ni instrucciones ejecutables. Exigir fragmentos que existan en la fuente para cada afirmación, permitir null, limitar tokens/timeout/reintentos y cachear por hash+versión. Mantener resultados deterministas si falla. Si esta fase no está configurada, declarar cobertura parcial de promos vagas: no afirmar que se detectan todas.

## 4. Persistencia y procesamiento recuperable

Crear `backend/app/promos.py` (repositorio/servicio) y `promos_jobs.py` (procesador). Esquema propuesto:

- `promo_scans`: clave `(account, shortcode)`, hash de inputs relevantes, detector_version, estado pending/running/done/failed, intentos, next_retry_at, lease, error y timestamps. Registrar también negativos para no reanalizarlos en cada GET.
- `promo_opportunities`: misma clave única, clasificación, cliente/productos/candidatos/links/CTAs/evidencias en JSON validado, published_at, first_detected_at, last_analyzed_at y revisión humana.
- Revisión: new/reviewed/dismissed, reviewer y reviewed_at; guardar overrides por separado del análisis automático para que el backfill no borre decisiones humanas.
- Índices para estado de job/reintento y paginación por fecha/clave. Usar SQL compatible con el adaptador Postgres y migración runtime idempotente; no crear tablas solo en el bootstrap SQLite.

En ingesta, registrar trabajo pendiente en la misma transacción del post cuando sea posible. Procesarlo poco después del commit, sin esperar a la siguiente captura de Apify. Un reconciliador por lotes debe recuperar posts omitidos por rutas antiguas, hashes cambiados o interrupciones. No usar únicamente threads o listas en memoria.

Cubrir inserciones, enriquecimientos, recuperación de runs, refresh de captions existentes y backfill. Comprobar explícitamente cómo se persiste un caption editado: analizar el texto nuevo sin actualizar la fuente produciría incoherencias. No cambiar la lógica HOT/Topic Stacks.

Objetivo verificable: reglas deterministas visibles en menos de 60 segundos desde la persistencia del post con el procesador sano y sin backlog. Medir captura→detección aparte de publicación→captura. La captura depende de frecuencia, límites y disponibilidad de Apify y del scrape_mode de cada cuenta; cuentas configuradas solo para posts no garantizan Reels. No aumentar frecuencia ni lanzar nuevos scrapes para este feature.

## 5. API propia, paginada y protegida

Proponer y mantener consistente este contrato bajo `/api/admin/promos`, reutilizando la restricción Admin/Dev existente:

- `GET /api/admin/promos`: filtros de cliente, competidor, clasificación, revisión y fechas; cursor estable `(first_detected_at, account, shortcode)`, limit por defecto 40, máximo 100. Responder items, next_cursor y conteos acordes a filtros.
- `GET /api/admin/promos/{account}/{shortcode}`: detalle y evidencias; usar el mismo ámbito de cuentas autorizadas.
- `PATCH /api/admin/promos/{account}/{shortcode}`: revisión/overrides validados; operación idempotente, con control de versión para no pisar cambios concurrentes.
- `POST /api/admin/promos/backfill`: job idempotente con rango temporal, solo sobre datos almacenados; responder 202 + job_id. Ruta estática declarada antes de rutas dinámicas.
- `GET /api/admin/promos/jobs/{job_id}`: progreso, errores, procesados y pendientes. Métricas sanitizadas de último procesamiento e ingesta para mostrar frescura.

GET no clasifica ni muta posts. No descargar el catálogo completo del Dashboard para filtrar en el navegador. No devolver raw_json completo. Validar fechas, límites, campos y URLs; parametrizar SQL. Mantener DB/trabajo síncrono fuera del event loop siguiendo el patrón del backend.

## 6. Workspace React oculto

Crear `promos.html`, `src/promos.jsx`, `src/promos.css` y, si ayuda, `src/promosApi.js`; registrar `promos` en `vite.config.js`. Reutilizar `apiFetch`, Firebase, SSO y estilos/tokens existentes. No modificar `ProductHeader` para añadir Promos.

Grid responsive de 3–4 columnas en desktop y una en móvil, con orden por detección más reciente. Cada card muestra cover/fallback, Client, Product, Posted by, Published/Detected, clasificación y evidencia breve, enlace comercial o `Link in bio`, keyword/canal o `Not found`, y `Open post`. Click abre detalle con caption completo y fragmentos resaltados; abrir enlaces no debe disparar accidentalmente el detalle.

Filtros de marca, página, clasificación, fecha y revisión, búsqueda y contador. `Needs review` debe ser visible y filtrable, no ocultarse detrás de un score. Permitir marcar reviewed/dismissed y corregir extracción en detalle. Mantener dismissed fuera de la vista inicial, recuperable mediante filtro.

Cubrir login, acceso denegado, carga, vacío real, error de API, datos anteriores durante reintentos y procesamiento pendiente. Mostrar última captura/procesamiento; no presentar una ingesta fallida como ausencia de nuevas promos. Refrescar lecturas cada 30–60 s cuando la pestaña esté visible, cancelar al desmontar y conservar filtros/scroll. Sin hard reload ni nueva infraestructura SSE para v1.

## 7. Backfill y calibración

Tras habilitar esquema/procesador, analizar primero los últimos 30 días de competidores activos con batches pequeños, cursor persistente y prioridad inferior a nuevas publicaciones. El usuario podrá ampliar el rango después. Repetir el mismo backfill no duplica cards ni resetea revisión/first_detected_at.

Revisar muestra etiquetada con positivos explícitos, promos implícitas y negativos. Reportar precisión, recall y errores por clase sobre esa muestra, sin extrapolar certeza a todas las publicaciones. Ajustar reglas versionadas y reprocesar inputs afectados. Asegurar que las marcas desconocidas puedan aparecer.

## 8. Pruebas de aceptación obligatorias

Crear `backend/tests/test_promos_detector.py`, `test_promos_jobs.py`, `test_promos_api.py` y `smoke/promos.mjs`. Casos mínimos:

1. `#lovablepartner` → disclosure, cliente candidato Lovable con evidencia del hashtag.
2. `Sponsored by @higgsfield. Try [producto]. Comment VIDEO for the link` → cliente, producto textual, CTA keyword VIDEO, sin URL comercial inventada.
3. `made this / download / #adventure` → no coincide con `ad`.
4. `not sponsored, just testing X` → no disclosure positivo; noticia sobre una plataforma de ads tampoco.
5. `not sponsored, use my affiliate link` → conserva contradicción y señal comercial; no clasifica pago confirmado.
6. CTA genérico de engagement sin marca/oferta → no promoción automática; colaboración entre creadores → no pago inferido.
7. Metadata paid_partnership verdadera sin caption → oportunidad con cliente/producto desconocidos.
8. Hashtag mixto, invisibles, mayúsculas, español, enlace con tracking, código de descuento y múltiples marcas.
9. Importación repetida, caption actualizado, job reiniciado y backfill repetido → una sola oportunidad por post y revisión intacta.
10. 401 sin login, 403 rol no autorizado, acceso Admin/Dev y role previews conforme al middleware; probar API además de UI.
11. Migración repetible SQLite y Postgres; recuperación tras lease vencido y caída entre commit/ejecución.
12. Grid/filtros/cursor, detail, corrección, dismissed, error/red lenta, refresco sin perder scroll, móvil y teclado. Ningún enlace nuevo a Promos en tools existentes.

Ejecutar en Predict: `PYTHONPATH=backend ./.venv/bin/python -m pytest backend/tests/test_promos_detector.py backend/tests/test_promos_jobs.py backend/tests/test_promos_api.py backend/tests/test_apify_scrape_modes.py backend/tests/test_db_runtime_schema.py`.

En frontend: `npm run build`, smoke de Promos y regresión de auth/roles pertinente. Inspeccionar visualmente desktop/móvil. Usar fixtures para mutaciones de QA, no modificar oportunidades reales sin necesidad.

## 9. Despliegue y entrega de Luna

Publicar backend compatible primero y frontend después siguiendo el procedimiento vigente. Verificar que no haya importaciones activas antes de reiniciar Cortex. Esperar `/api/health` con el commit esperado y comprobar requests autenticados reales; build/CORS/health por sí solos no prueban Promos.

Preservar CNAME y `.nojekyll`, integrar el tip vigente de gh-pages sin force push, incluir solo archivos propios. Publicar y verificar `https://sentientdash.app/promos.html`, dominio confirmado por el usuario.

Validar acceso directo `/promos.html`, assets nuevos, permisos, persistencia tras recarga/reinicio, una detección real de datos existentes y ausencia de enlaces entrantes. No enviar Slack/email ni generar outreach: no forman parte del pedido.

Entrega final: URL comprobada, commits de ambos repos, pruebas ejecutadas, muestra de detecciones/errores de calibración, latencia observada y estado de la fase semántica. No declarar el alcance completo si solo se implementaron búsquedas literales y quedó pendiente la detección de texto vago.

## Secuencia sugerida de commits

1. Detector + fixtures y pruebas.
2. Esquema portable + jobs durables + integración de ingesta/backfill.
3. API protegida + pruebas de permisos/persistencia.
4. Workspace oculto + smoke y QA visual.
5. Calibración y fase semántica para señales vagas + verificación de release.

Luna debe completar las fases en orden, verificar cada bloque y mantener este alcance hasta la entrega; no agregar navegación pública ni funciones de CRM/contacto.
