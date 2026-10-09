# Ejemplo de media kit conectado a Sentient Dash

Website de una cuenta con perfil, audiencia, rendimiento, posts e historial de seguidores. El servidor conserva la clave y consulta la API; el navegador solo recibe datos públicos a través de `/api/media-kit`, `/api/posts` y `/api/followers` del propio website. Usa Node.js 22 o posterior y ninguna dependencia adicional.

## Ejecutar en tu computadora

1. Obtén una clave en [API connections](https://sentientdash.app/api.html), en **Connect an integration**. Selecciona únicamente las cuentas que necesitas y guarda la clave cuando aparezca: se muestra una sola vez.
2. Descarga esta carpeta completa. Abre una terminal dentro de ella.
3. Copia `.env.example` a `.env`. En macOS o Linux puedes usar `cp .env.example .env`.
4. Edita `.env`: pega tu clave en `SENTIENT_DASH_API_KEY` y tu usuario de Instagram sin `@` en `SENTIENT_DASH_ACCOUNT`.
5. Ejecuta:

```bash
node --env-file=.env server.mjs
```

Abre [localhost en el puerto 3000](http://localhost:3000). `.env` está excluido de Git y el servidor no lo sirve. La carga del archivo usa la [opción oficial `--env-file` de Node](https://nodejs.org/download/release/latest-v22.x/docs/api/cli.html#--env-filefile); las consultas usan el [`fetch` incluido en Node](https://nodejs.org/download/release/latest-v22.x/docs/api/globals.html#fetch).

## Publicar y adaptar

En un hosting con Node, carga estos archivos y configura `SENTIENT_DASH_API_KEY` y `SENTIENT_DASH_ACCOUNT` como variables privadas del servidor. Usa `node server.mjs` como comando de inicio: el hosting aporta las variables y suele asignar `PORT`. Usa HTTPS en el dominio público. Dedica una clave a este website para que tenga su propio límite de consultas.

`client.js` y `styles.css` se pueden adaptar al diseño de tu website. Conserva las consultas al propio servidor. En React, Next.js, PHP, WordPress u otro sistema, reproduce la misma separación: un endpoint de servidor con la clave privada, caché, validación y un handle fijo; la página consulta ese endpoint. En un hosting estático agrega una función de servidor o un servicio de backend para el proxy. Nunca pongas la clave en HTML, JavaScript público, `VITE_*`, `NEXT_PUBLIC_*`, URL, analítica o repositorios.

El origen por defecto ya es la API de producción. Solo si el administrador necesita otro backend de confianza, puede configurar `SENTIENT_DASH_API_BASE` en el servidor. Esa configuración no se acepta desde el navegador. Para plataformas con funciones, adapta el handler a su API de request/response y usa caché compartida si hay varias instancias.

## Qué hace este ejemplo

- Caché de datos por cinco minutos en memoria; consolida consultas simultáneas a la misma URL.
- Caché de fallos por diez segundos, timeout de diez segundos y límite de 50 consultas al backend por minuto en cada proceso.
- Solo sirve tres endpoints de una cuenta fija; valida fechas, parámetros y paginación. El proxy admite `limit` de 1 a 100 y `offset` de 0 a 100000, sin aceptar destino ni cuenta arbitrarios.
- Conserva los estados útiles 401, 403, 404, 422 y 429 y `Retry-After`. Convierte errores de conexión o respuestas inválidas en 502 y timeouts en 504; oculta los cuerpos de error del backend.
- Muestra `—` para métricas desconocidas y oculta el bloque de 30 días cuando no existe. Usa `data_updated_at` para la fecha de captura y `textContent` para captions y nombres.

La caché en memoria se pierde al reiniciar y no se comparte entre procesos. Una revocación bloquea la próxima consulta al dashboard; los datos públicos ya almacenados en esta caché pueden seguir visibles hasta cinco minutos. Para mayor tráfico, usa caché compartida y limita solicitudes en el hosting.

El historial contiene muestras guardadas por el dashboard, no el historial completo de Instagram. Likes, comentarios, vistas y reproducciones son métricas públicas; las vistas no equivalen a alcance único. Leer la API no solicita nuevos scrapes ni acelera actualizaciones.

## Verificar sin datos reales

```bash
node --test server.test.mjs
```

Las pruebas levantan un backend local falso. Verifican que la clave se envía solo al backend, que no se pueden descargar `.env` ni fuentes del servidor, caché y consolidación, validación de consultas, errores y `Retry-After`, límites y timeouts. No necesitan una clave real ni consultan Instagram o la API de producción.

La [guía completa de integración](https://sentientdash.app/api-guide.html) explica endpoints, campos, paginación y solución de errores.
