/* Shared UI copy for the static Tracker and Insights pages. Account names,
   captions, OCR and hashtags are source data and are deliberately excluded. */
(function () {
  const es = {
    'Copy link':'Copiar enlace', 'Copied':'Copiado', 'Copy this link:':'Copia este enlace:',
    'Copy a link to this exact view':'Copiar enlace a esta vista exacta', 'Export PDF':'Exportar PDF',
    'Download a PDF of the current selection':'Descargar un PDF de la selección actual',
    'Summary':'Resumen', 'generated':'generado', 'Building…':'Preparando…', 'Saved':'Guardado', 'Failed':'Falló',
    'Command center':'Centro de control', 'Loading Tracker data':'Cargando datos de Tracker', 'Loading Insights data':'Cargando datos de Insights',
    'Last 6 months':'Últimos 6 meses', 'Last year':'Último año',
    'Sentient home':'Inicio de Sentient', 'Sentient tools':'Herramientas de Sentient',
    'Tracker actions':'Acciones de Tracker', 'Insights actions':'Acciones de Insights',
    'green accent':'Acento verde', 'lime accent':'Acento lima', 'blue accent':'Acento azul', 'coral accent':'Acento coral',
    'Custom':'Personalizado', 'Custom color':'Color personalizado',
    'Sign in with your Google account to continue.':'Inicia sesión con tu cuenta de Google para continuar.',
    'Sign in with Google':'Iniciar sesión con Google', 'Sign out':'Cerrar sesión',
    'Your browser blocked the Google sign-in window. Allow pop-ups for sentientdash.app and try again.':'Tu navegador bloqueó la ventana de Google. Permite ventanas emergentes para sentientdash.app y vuelve a intentarlo.',
    'Network error reaching Google. Check your connection and try again.':'No se pudo conectar con Google. Revisa tu conexión e intenta de nuevo.',
    'Sign-in failed. Try again.':'No se pudo iniciar sesión. Intenta de nuevo.',
    'Admin or Dev access is required.':'Se requiere acceso de Admin o Dev.',
    'Role preview':'Vista de rol', 'Active role':'Rol activo', 'Preview any operating role.':'Prueba cualquier rol operativo.',
    'Switch among your assigned roles.':'Cambia entre tus roles asignados.', 'Use my default role':'Usar mi rol predeterminado',
    'Dev · full access':'Dev · acceso completo', 'Post Designer':'Diseñador de publicaciones', 'Viral Coordinator':'Coordinador viral', 'Trainee':'Aprendiz', 'Sales':'Ventas',
    'Loading…':'Cargando…', 'Loading...':'Cargando...', 'Loading Tracker data…':'Cargando datos de Tracker…',
    'Loading Insights data…':'Cargando datos de Insights…', 'Connection failed.':'Falló la conexión.',
    'Failed to fetch':'No se pudo conectar al servicio.', 'Retry':'Reintentar',
    'Could not load Tracker data.':'No se pudieron cargar los datos de Tracker.',
    'Could not load the tracker.':'No se pudo cargar Tracker.', 'Could not load the data.':'No se pudieron cargar los datos.',
    'Connection to the Tracker is still reconnecting. Try again in a moment.':'La conexión con Tracker se está restableciendo. Intenta de nuevo en un momento.',
    'Connection to Insights is still reconnecting.':'La conexión con Insights se está restableciendo.',
    'Insights returned incomplete data. Please retry.':'Insights devolvió datos incompletos. Intenta de nuevo.',
    'You do not have access to this Tracker action.':'No tienes permiso para esta acción de Tracker.',
    'You do not have access to this Insights action.':'No tienes permiso para esta acción de Insights.',
    'Tracker refresh failed.':'No se pudo actualizar Tracker.',
    'Tracker refresh is still running. Reopen this account in a moment.':'Tracker sigue actualizando los datos. Abre esta cuenta de nuevo en un momento.',
    'Refresh':'Actualizar', '↻ Refresh all':'↻ Actualizar todas', '⟳ Refresh all':'⟳ Actualizar todas',
    'Refresh all':'Actualizar todas', 'Refreshing all…':'Actualizando todas…',
    "Re-scrape every account's real follower count from Instagram right now (~$0.002 each)":'Consultar ahora el total real de seguidores de cada cuenta en Instagram (~$0.002 por cuenta)',
    'Language':'Idioma', 'Settings':'Ajustes', 'Open full settings':'Abrir todos los ajustes',
    'Accent color':'Color de acento', 'Custom accent color':'Color de acento personalizado',
    'Theme':'Tema', 'Dark':'Oscuro', 'Light':'Claro', 'Toggle theme':'Cambiar tema',
    'Green':'Verde', 'Lime':'Lima', 'Blue':'Azul', 'Coral':'Coral', 'Admin':'Administración',
    'Accounts':'Cuentas', 'Account':'Cuenta', 'Accounts tracked':'Cuentas seguidas', 'Accounts in view':'Cuentas en esta vista',
    'All':'Todas', 'All accounts':'Todas las cuentas', 'All tracked accounts':'Todas las cuentas seguidas',
    'All time':'Todo el historial', 'All recorded data':'Todos los datos registrados',
    'Ours':'Nuestras', 'ours':'nuestra', 'Ours only':'Solo nuestras', 'Competitors':'Competidores',
    'competitor':'competidor', 'competitors':'competidores', 'Competitors only':'Solo competidores',
    'Favorites':'Favoritos', 'Favourites':'Favoritos', 'Add to favourites':'Añadir a favoritos',
    'Remove from favourites':'Quitar de favoritos', 'Toggle favourite':'Cambiar favorito',
    'Leader':'Líder', 'Most followers':'Más seguidores', 'Top 7d grower':'Mayor crecimiento en 7 días',
    'Leaderboard':'Tabla de posiciones', 'Search accounts':'Buscar cuentas', 'Search accounts…':'Buscar cuentas…',
    'Search accounts by name or handle':'Buscar cuentas por nombre o usuario', 'Account group':'Grupo de cuentas',
    'Clear filters':'Limpiar filtros', 'Clear':'Limpiar', 'From':'Desde', 'To':'Hasta',
    'Quick range':'Rango rápido', 'Range':'Rango', 'Rank by':'Ordenar por',
    'Followers':'Seguidores', 'followers':'seguidores', 'Followers +/-':'Seguidores +/-', 'Following':'Siguiendo',
    'Total followers':'Seguidores totales', 'Follower growth':'Crecimiento de seguidores', 'Follower history range':'Rango del historial de seguidores',
    '1 day':'1 día', '7 days':'7 días', '14 days':'14 días', '30 days':'30 días', '60 days':'60 días',
    '180 days':'180 días', '365 days':'365 días', '1 day growth':'Crecimiento en 1 día',
    '7 day growth':'Crecimiento en 7 días', '30 day growth':'Crecimiento en 30 días',
    'Since tracking began':'Desde el inicio del seguimiento', 'Tracking since':'Seguimiento desde',
    'Posts':'Publicaciones', 'posts':'publicaciones', 'Posts (total)':'Publicaciones (total)',
    'Avg likes':'Likes promedio', 'Avg likes (30d)':'Likes promedio (30 días)', 'Avg views':'Vistas promedio',
    'Engagement trend':'Tendencia de interacciones', 'Engagement rate':'Tasa de interacciones',
    'Historical stats':'Estadísticas históricas', 'Historical Stats':'Estadísticas históricas',
    'Last snapshot':'Última captura', 'Date':'Fecha', 'Media':'Contenido', 'Estimated':'Estimado',
    'No snapshot':'Sin captura', 'no snapshot yet':'todavía sin captura', 'No snapshots yet.':'Todavía no hay capturas.',
    'No snapshots in this period.':'No hay capturas en este período.', 'no data yet':'todavía sin datos',
    'not enough history yet':'todavía no hay suficiente historial', 'no recent posts':'sin publicaciones recientes',
    'per latest snapshot':'según la última captura', 'vs. previous 30 days':'vs. los 30 días anteriores',
    'weekly avg likes':'likes promedio por semana', 'last known reading':'última captura conocida',
    'interpolated between recorded readings':'interpolado entre capturas registradas', 'Verified':'Verificada',
    'Private account':'Cuenta privada', '← All accounts':'← Todas las cuentas',
    'Compare account growth. Select a column to sort or an account to explore its history.':'Compara el crecimiento de las cuentas. Selecciona una columna para ordenar o una cuenta para explorar su historial.',
    'No accounts match this view. Try another name or clear the filters.':'No hay cuentas que coincidan con esta vista. Prueba otro nombre o limpia los filtros.',
    'No follower history recorded yet -- the first daily snapshot runs at 7am CST, or use':'Todavía no hay historial de seguidores. La primera captura diaria se toma a las 7 a. m. de Costa Rica; también puedes usar',
    'Settings → System':'Ajustes → Sistema',
    "to capture one right now. Growth columns fill in day by day from there; there's no way to recover Instagram's past follower counts for an account that just started being tracked.":'para tomar una ahora. Las columnas de crecimiento se completan día a día a partir de ese momento; no se pueden recuperar los totales de seguidores anteriores de Instagram para una cuenta que acaba de empezar a seguirse.',
    "From the post history already on hand -- this goes back as far as we've backfilled the account's posts, independent of the follower-snapshot start date above.":'A partir del historial de publicaciones disponible: abarca hasta donde se hayan importado publicaciones de la cuenta, independientemente del inicio del historial de seguidores indicado arriba.',
    'No post history for this account yet.':'Todavía no hay historial de publicaciones de esta cuenta.',
    'Only one snapshot recorded in this period -- choose a larger range as history accumulates.':'Solo hay una captura en este período. Elige un rango más amplio mientras se acumula historial.',
    'Likes':'Likes', 'Comments':'Comentarios', 'Views':'Vistas', 'Views (video)':'Vistas (video)',
    'Engagement / view':'Interacciones / vista', 'Eng./view':'Interac./vista', 'Posts/day':'Publicaciones/día',
    'HOT posts':'Publicaciones HOT', 'Hot posts':'Publicaciones HOT', 'average':'promedio', 'per day':'por día',
    'of total':'del total', 'aggregate, not a mean of %':'total agregado, no un promedio de porcentajes',
    'Format':'Formato', 'Video':'Video', 'Reel':'Reel', 'Carousel':'Carrusel', 'Image':'Imagen',
    'What format performs best':'Qué formato funciona mejor', 'Performance by format':'Rendimiento por formato',
    'Slides per carousel':'Páginas por carrusel', 'Reel length':'Duración de los reels', 'number of slides':'cantidad de páginas',
    'Production':'Producción', 'production':'producción',
    'Reels vs carousels vs images. Below: how many slides a carousel should have, and which reel length travels furthest.':'Reels, carruseles e imágenes. Abajo: qué cantidad de páginas funciona mejor en un carrusel y qué duración de reel obtiene más alcance.',
    'No carousels match the current filters.':'No hay carruseles que coincidan con los filtros actuales.',
    'No videos with a known duration match the current filters.':'No hay videos con duración conocida que coincidan con los filtros actuales.',
    'Highest average likes:':'Mayor promedio de likes:', 'Carousels with':'Los carruseles con',
    'Head to head.':'Comparación directa.', 'Account comparison':'Comparación de cuentas',
    'Reach vs engagement quality':'Alcance y calidad de las interacciones', 'Engagement/view':'Interacciones/vista',
    'average views':'vistas promedio', 'engagement per view (%)':'interacciones por vista (%)',
    'is the most honest column: it measures how many of the people who saw actually reacted, without rewarding whoever simply has more reach. Click any header to sort.':'es la columna más representativa: mide cuántas personas que vieron el contenido reaccionaron, sin premiar solo un mayor alcance. Haz clic en un encabezado para ordenar.',
    'Topics & language that work':'Temas y lenguaje que funcionan', 'content':'contenido',
    'Mined from cover text (OCR) and hashtags. Size is frequency; the number is the':'Obtenido del texto de las portadas (OCR) y los hashtags. El tamaño indica la frecuencia; el número es el',
    'median relative index':'índice relativo mediano', 'is normal performance,':'representa el rendimiento habitual,',
    'is twice the usual for that account. Median, not mean: one viral post would otherwise make a word look 900× better than it is.':'representa el doble del rendimiento habitual de esa cuenta. Se usa la mediana, no la media: de otra forma, una publicación viral podría hacer que una palabra pareciera rendir 900 veces mejor.',
    'Words on covers':'Palabras en portadas', 'Hashtags':'Hashtags', 'Not enough data':'No hay suficientes datos',
    'Top-performing words (by median):':'Palabras con mejor rendimiento (por mediana):',
    'Original audio performs at':'El audio original obtiene', 'vs':'vs.', 'for third-party audio.':'con audio de terceros.',
    'When to post':'Cuándo publicar', 'timing':'horario', 'Performance by publish day and hour (UTC), measured as the':'Rendimiento por día y hora de publicación (UTC), medido como el',
    ": how many times a typical post in that slot performs versus what's normal for its own account, so neither a big account nor one viral post drowns out the signal. Brighter = better.":': cuántas veces rinde una publicación típica en ese horario respecto al rendimiento habitual de su cuenta, para que una cuenta grande o una publicación viral no oculten la señal. Más brillo indica mejor rendimiento.',
    'worse':'peor', 'better':'mejor', 'too few posts':'muy pocas publicaciones', 'never posted':'sin publicaciones',
    'Median index':'Índice mediano', 'By day of week (index)':'Por día de la semana (índice)',
    'By hour of day, UTC (index)':'Por hora del día, UTC (índice)', 'Best day is':'El mejor día es',
    'Best window is around':'El mejor horario es alrededor de',
    'These are correlations over what was already published, not a guarantee — a slot nobody has ever posted in has no evidence behind it either way.':'Estas son correlaciones de lo ya publicado, no una garantía. Un horario sin publicaciones previas todavía no tiene evidencia a favor ni en contra.',
    'Sun':'Dom', 'Mon':'Lun', 'Tue':'Mar', 'Wed':'Mié', 'Thu':'Jue', 'Fri':'Vie', 'Sat':'Sáb',
    'Top 25 posts':'Las 25 mejores publicaciones', 'Cover text':'Texto de portada',
    'Switch the ranking metric in the filters above. Click a row to open the post on Instagram.':'Cambia la métrica de orden en los filtros de arriba. Haz clic en una fila para abrir la publicación en Instagram.',
    'No posts match these filters.':'No hay publicaciones que coincidan con estos filtros.',
    'Follower intelligence':'Análisis de seguidores', 'strategy':'estrategia', 'Follower peaks':'Picos de seguidores',
    'Peak-day lift':'Seguidores ganados en los picos', 'One-post windows':'Ventanas con una publicación',
    'Baseline coverage':'Cobertura de la línea base', 'unusual days in this selection':'días inusuales en esta selección',
    'followers across those windows':'seguidores ganados en esas ventanas', 'strongest temporal candidates':'candidatos con mayor coincidencia temporal',
    'What to do next':'Qué hacer después', 'Follower lift':'Seguidores ganados', 'Usual day':'Día habitual',
    'Posts in measured window':'Publicaciones en la ventana medida', 'Interpretation':'Interpretación',
    'One-post window':'Ventana con una publicación', 'One post in window':'Una publicación en la ventana',
    'No feed post in window':'Sin publicaciones de feed en la ventana',
    'Could be stories, collaborations, external reach, or a missing post.':'Podrían ser historias, colaboraciones, alcance externo o una publicación faltante.',
    'Build the baseline first.':'Primero construye la línea base.',
    'Turn the clearest signal into a controlled repeat.':'Repite la señal más clara en una prueba controlada.',
    'that post':'esa publicación',
    '. Reuse one element at a time (topic, hook, format, or publishing slot) so the next result is interpretable.':'. Reutiliza un elemento a la vez (tema, gancho, formato u horario) para poder interpretar el siguiente resultado.',
    'Do not award those followers to a single post. For the next test, avoid stacking multiple feed posts in the same snapshot interval when follower attribution is the objective.':'No atribuyas esos seguidores a una sola publicación. En la siguiente prueba, evita acumular varias publicaciones de feed en el mismo intervalo de capturas si el objetivo es identificar qué contenido coincide con el crecimiento.',
    'Log stories, collaborations, paid distribution, profile changes, and outside mentions alongside the calendar; otherwise this lift stays intentionally unexplained.':'Registra historias, colaboraciones, distribución pagada, cambios de perfil y menciones externas junto al calendario; de otra forma, este crecimiento seguirá sin atribuirse a una causa.',
    'No follower peaks in this selection yet.':'Todavía no hay picos de seguidores en esta selección.',
    'This is useful too: use the existing format, topic, and timing evidence to choose the next controlled test while daily follower history accumulates.':'Usa la evidencia disponible de formatos, temas y horarios para elegir la siguiente prueba controlada mientras se acumula historial diario de seguidores.',
    'Peak days are measured against each account’s own trailing daily growth, not against other accounts. A post shown here is a':'Los picos se comparan con el crecimiento diario previo de cada cuenta, no con otras cuentas. Una publicación que aparece aquí es un',
    'time-aligned candidate':'candidato con coincidencia temporal',
    ', never a confirmed Instagram follower conversion.':', nunca una conversión de seguidores confirmada por Instagram.',
    'Building baseline':'Construyendo la línea base',
    'Review as a controlled-test candidate — not confirmed conversion.':'Evaluar como candidato para una prueba controlada; no es una conversión confirmada.',
    'Several posts share this window; keep attribution unresolved.':'Varias publicaciones comparten esta ventana; la atribución sigue sin resolverse.',
    'No feed post matches this window.':'Ninguna publicación de feed coincide con esta ventana.',
    'No statistically unusual follower day matches these account and date filters yet.':'Todavía no hay días de crecimiento estadísticamente inusual que coincidan con estas cuentas y fechas.',
    'Method:':'Método:',
    'a daily interval must be 12–36 hours and have at least 7 earlier valid daily readings. A peak exceeds both the prior 90th percentile and a robust median-based threshold. This protects against a single outlier or delayed snapshot being presented as strategy.':'Un intervalo diario debe durar entre 12 y 36 horas y tener al menos 7 lecturas diarias válidas previas. Un pico supera tanto el percentil 90 anterior como un umbral robusto basado en la mediana. Esto evita presentar una observación aislada o una captura tardía como estrategia.',
    'No qualified follower peaks yet. Insights will start flagging them after each account has seven valid daily growth readings.':'Todavía no hay picos de seguidores que cumplan los requisitos. Insights empezará a señalarlos cuando cada cuenta tenga siete lecturas diarias válidas de crecimiento.',
    'Followers gained':'Seguidores ganados', 'Largest qualified follower-growth windows':'Mayores ventanas de crecimiento de seguidores que cumplen los requisitos',
    'Loading the daily follower signal…':'Cargando la señal diaria de seguidores…',
    'Follower-growth signals are temporarily unavailable.':'Las señales de crecimiento de seguidores no están disponibles temporalmente.',
    'Post performance is available; follower signals could not load. Retry to reconnect to the Tracker source.':'El rendimiento de publicaciones está disponible; no se pudieron cargar las señales de seguidores. Reintenta para reconectar con Tracker.',
    'Retry follower signals':'Reintentar señales de seguidores', 'Open post on Instagram':'Abrir publicación en Instagram',
    'Post link unavailable':'Enlace de publicación no disponible', 'Post':'Publicación',
  };

  // Anchored UI templates preserve handles and numerical values verbatim.
  const patterns = [
    [/^This domain \(([^)]+)\) isn’t authorized in Firebase yet\.$/, (m, domain) => `Este dominio (${domain}) todavía no está autorizado en Firebase.`],
    [/^Sign-in failed \(([^)]+)\)\. Try again\.$/, (m, code) => `No se pudo iniciar sesión (${code}). Intenta de nuevo.`],
    [/^(.+) isn’t authorized for (sentientdash\.app|Sentient Dash)\.$/, (m, account, product) => `${account === 'This Google account' ? 'Esta cuenta de Google' : account} no tiene permiso para ${product}.`],
    [/^(.*?)( [↑↓])$/, (m, label, arrow) => translate(label, 'es') + arrow],
    [/^Loading @([^\s]+)…$/, (m, handle) => `Cargando @${handle}…`],
    [/^Could not load @([^\s]+)\.$/, (m, handle) => `No se pudo cargar @${handle}.`],
    [/^Could not refresh @([^\s]+): (.+)$/, (m, handle, error) => `No se pudo actualizar @${handle}: ${translate(error, 'es')}`],
    [/^Could not refresh accounts: (.+)$/, (m, error) => `No se pudieron actualizar las cuentas: ${translate(error, 'es')}`],
    [/^Open @([^\s]+) on Instagram$/, (m, handle) => `Abrir @${handle} en Instagram`],
    [/^Refresh @([^\s]+)'s real follower count now$/, (m, handle) => `Consultar ahora los seguidores reales de @${handle}`],
    [/^You can refresh again in (\d+) min\.$/, (m, n) => `Podrás actualizar de nuevo en ${n} min.`],
    [/^(\d+) with follower data · (\d+) tracked total$/, (m, n, total) => `${n} con datos de seguidores · ${total} seguidas en total`],
    [/^(\d+) of (\d+) accounts$/, (m, n, total) => `${n} de ${total} cuentas`],
    [/^(\d[\d.,\s]*) posts · (\d+) accounts$/, (m, n, total) => `${n} publicaciones · ${total} cuentas`],
    [/^([+\-−\d][\d.,\sMK]*) followers( \(estimated\))?$/, (m, n, estimated) => `${n} seguidores${estimated ? ' (estimado)' : ''}`],
    [/^([+\-−\d][\d.,\sMK]*) in 7d$/, (m, n) => `${n} en 7 días`],
    [/^rank #(\d+) by followers$/, (m, n) => `puesto #${n} por seguidores`],
    [/^as of (.+)$/, (m, date) => `al ${date}`],
    [/^(\d+) days? recorded$/, (m, n) => `${n} día${n === '1' ? '' : 's'} registrado${n === '1' ? '' : 's'}`],
    [/^Last (\d+) days$/, (m, n) => `Últimos ${n} días`],
    [/^(\d[\d.,\sMK]*)( posts?| videos?)(\))?$/, (m, n, unit, end) => `${n}${unit.startsWith(' post') ? ' publicaciones' : ' videos'}${end || ''}`],
    [/^\((\d+) posts\)$/, (m, n) => `(${n} publicaciones)`],
    [/^\((\d+) days? of history so far\)\. Follower deltas need that many days of snapshots to fill in -- a fresh account naturally shows "—" for windows it hasn't lived through yet\.$/, (m, n) => `(${n} día${n === '1' ? '' : 's'} de historial hasta ahora). Las diferencias de seguidores necesitan esa cantidad de días de capturas; una cuenta nueva muestra "—" en los períodos para los que todavía no tiene historial.`],
    [/^(Last \d+ days|All recorded data) of daily readings, oldest first\. Missing days show an explicitly marked estimate: interpolation between recorded readings when available, otherwise the last known total\. "Followers \+\/-" uses the displayed daily series\.$/, (m, range) => `${translate(range, 'es')} de lecturas diarias, de la más antigua a la más reciente. Los días sin captura muestran una estimación explícita: se interpola entre lecturas registradas cuando es posible; de otra forma, se usa el último total conocido. "Seguidores +/-" usa esta serie diaria.`],
    [/^(Last \d+ days|All recorded data); one point per calendar day\. Estimated points are based on the closest recorded data and are labelled in the table\.$/, (m, range) => `${translate(range, 'es')}; un punto por día del calendario. Los puntos estimados usan los datos registrados más cercanos y se identifican en la tabla.`],
    [/^([\d.,MK\s]+) (average|per day)$/, (m, n, unit) => `${n} ${translate(unit, 'es')}`],
    [/^([\d.,]+%) of total$/, (m, n) => `${n} del total`],
    [/^(\d+) videos measured$/, (m, n) => `${n} videos medidos`],
    [/^of ([\d.,\sMK]+) valid daily intervals$/, (m, n) => `de ${n} intervalos diarios válidos`],
    [/^(\d+) valid daily intervals are recorded; an account needs 7 before Insights can flag an unusual follower day without guessing\.$/, (m, n) => `Hay ${n} intervalos diarios válidos registrados; una cuenta necesita 7 antes de que Insights pueda identificar un día inusual de crecimiento con evidencia.`],
    [/^@([^\s]+) gained ([\d.,\sMK]+) followers in a one-post window around$/, (m, handle, n) => `@${handle} ganó ${n} seguidores en una ventana con una publicación cerca de`],
    [/^(\d+) peak windows? had competing posts\.$/, (m, n) => `${n} ventana${n === '1' ? '' : 's'} de crecimiento con varias publicaciones.`],
    [/^(\d+) peak windows? (?:has|have) no feed-post candidate\.$/, (m, n) => `${n} ventana${n === '1' ? '' : 's'} de crecimiento sin publicación candidata de feed.`],
    [/^(\d+) posts in window$/, (m, n) => `${n} publicaciones en la ventana`],
    [/^\+([\d.,\sMK]+) median$/, (m, n) => `+${n} mediana`],
    [/^Typical day: \+([\d.,\sMK]+)$/, (m, n) => `Día habitual: +${n}`],
    [/^(Video|Carousel|Image) \((\d+)\)$/, (m, format, n) => `${translate(format, 'es')} (${n})`],
    [/^Slides per carousel \((\d+) posts\)$/, (m, n) => `Páginas por carrusel (${n} publicaciones)`],
    [/^Reel length \((\d+) videos\)$/, (m, n) => `Duración de los reels (${n} videos)`],
    [/^(\d+\+?) slides$/, (m, n) => `${n} páginas`],
    [/^average the most likes \((\d+) posts\)\.$/, (m, n) => `obtienen el mayor promedio de likes (${n} publicaciones).`],
    [/^reels travel furthest \((\d+) videos\)\.$/, (m, n) => `obtienen el mayor alcance (${n} videos).`],
    [/^has the best engagement per view \(([\d.,]+%)\): of every 100 people who watch, ([\d.,]+) react\.$/, (m, rate, n) => `tiene la mayor tasa de interacciones por vista (${rate}): de cada 100 personas que ven el contenido, ${n} reaccionan.`],
    [/^reaches more people \(([\d.,\sMK]+) avg views\) but converts at ([\d.,]+%) — more reach isn't more connection\.$/, (m, n, rate) => `alcanza a más personas (${n} vistas promedio), con una tasa de interacciones del ${rate}; más alcance no implica más conexión.`],
    [/^(\d+) posts · median ([\d.,]+×) its account's normal$/, (m, n, index) => `${n} publicaciones · mediana ${index} del rendimiento habitual de su cuenta`],
    [/^\(([\d.,]+×), (\d+) posts\)([,.]?)$/, (m, index, n, end) => `(${index}, ${n} publicaciones)${end}`],
    [/^\(([\d.,]+×) its normal, (\d+) posts\)\.$/, (m, index, n) => `(${index} del rendimiento habitual, ${n} publicaciones).`],
    [/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (\d+):00 · median ([\d.,]+×) its normal · (\d+) posts$/, (m, day, hour, index, n) => `${translate(day, 'es')} ${hour}:00 · mediana ${index} del rendimiento habitual · ${n} publicaciones`],
    [/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (\d+):00 · only (\d+) post, not enough to conclude$/, (m, day, hour, n) => `${translate(day, 'es')} ${hour}:00 · solo ${n} publicación, insuficiente para concluir`],
    [/^(@[^:]+): ([\d.,\sMK]+) views · ([\d.,]+)% eng\.$/, (m, handle, n, rate) => `${handle}: ${n} vistas · ${rate}% interac.`],
  ];
  function translate(text, language) {
    if (typeof text !== 'string' || language !== 'es') return text;
    const key = text.trim();
    if (!key) return text;
    let translated = es[key];
    if (translated === undefined) {
      for (const [pattern, replacement] of patterns) {
        if (!pattern.test(key)) continue;
        translated = key.replace(pattern, replacement);
        break;
      }
    }
    return translated === undefined ? text : text.replace(key, translated);
  }

  const chartOriginals = new WeakMap();
  function field(object, name, language) {
    if (!object || typeof object[name] !== 'string') return;
    let originals = chartOriginals.get(object);
    if (!originals) { originals = {}; chartOriginals.set(object, originals); }
    if (!(name in originals)) originals[name] = object[name];
    object[name] = translate(originals[name], language);
  }
  function charts(charts, language) {
    for (const chart of charts || []) {
      const data = chart.data || chart.config?.data;
      const options = chart.options || chart.config?.options;
      if (Array.isArray(data?.labels)) {
        let original = chartOriginals.get(data);
        if (!original) { original = { labels: [...data.labels] }; chartOriginals.set(data, original); }
        data.labels = original.labels.map(label => translate(label, language));
      }
      for (const dataset of data?.datasets || []) field(dataset, 'label', language);
      field(options?.plugins?.title, 'text', language);
      for (const scale of Object.values(options?.scales || {})) field(scale.title, 'text', language);
      const callbacks = options?.plugins?.tooltip?.callbacks;
      if (callbacks && !chartOriginals.has(callbacks)) {
        chartOriginals.set(callbacks, {});
        for (const [key, callback] of Object.entries(callbacks)) {
          if (typeof callback !== 'function') continue;
          callbacks[key] = function (...args) {
            const result = callback.apply(this, args);
            const current = document.documentElement.lang;
            return Array.isArray(result) ? result.map(text => translate(text, current)) : translate(result, current);
          };
        }
      }
      chart.update?.('none');
    }
  }
  window.SentientToolI18n = { translate, charts };
})();
