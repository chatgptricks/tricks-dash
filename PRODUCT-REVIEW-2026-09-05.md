# Revisión de producto y experiencia — Sentient Dash

Fecha: 5 de septiembre de 2026.

## Decisiones posteriores del usuario

Queue contiene datos de prueba para navegación en beta: los estados antiguos no son evidencia de problemas operativos. Se aprueban acciones reales en tarjetas, estados editoriales, inicio por rol y navegación uniforme. Se aprueba agrupar temas con un campeón por rendimiento. La precisión temporal de Tracker es secundaria. Insights y el análisis profundo se posponen.

La implementación de esta entrega prioriza esas decisiones sobre el orden original del informe. La agrupación es conservadora por similitud de captions; puede separar coincidencias manualmente y ordenar por likes, comentarios o suma de interacciones. No interpreta imágenes ni garantiza agrupar traducciones del mismo tema.

## Alcance y evidencia

Revisión del frontend, documentación del proyecto y lógica puntual de Cortex. Inspección autenticada de Dashboard, Queue, Tracker e Insights en producción; revisión visual de Dashboard y Queue. Mobile se revisó en código, sin prueba en teléfono. No se realizaron asignaciones, publicaciones, cambios de permisos ni modificaciones al código de la aplicación.

Esta es una evaluación de producto sustentada en observaciones, no una auditoría funcional exhaustiva ni un estudio con usuarios. Los conteos citados son una fotografía de la sesión. El backlog previo sirve de contexto; este documento no certifica su cierre.

## Filosofía propuesta

Sentient Dash debe ayudar al equipo a transformar señales de contenido en publicaciones de calidad, con responsables claros, y aprender de sus resultados. La experiencia debería reducir el tiempo entre encontrar una oportunidad y actuar sobre ella.

El ciclo rector es: descubrir → evaluar → preparar → asignar → producir → publicar → aprender.

Principios: una siguiente acción clara por estado; contexto conservado entre pantallas; decisiones editoriales humanas; automatización del trabajo repetitivo; permisos específicos por capacidad; datos con fecha y significado explícitos.

Ya existen piezas valiosas: HOT, filtros y listas de cuentas, Pool, asignación múltiple, borradores compartidos, solicitudes de aprobación, enlaces publicados, atribución y actualizaciones en vivo. Conviene construir sobre ellas.

## Prioridad 1: claridad operativa

### 1. Queue debe mostrar lo que requiere atención antes del calendario

**Observación:** al revisar el 5 de septiembre, el calendario de hoy estaba vacío, mientras la sección `Upcoming production` contenía 64 solicitudes activas, con registros del 2 de septiembre en `Ready To Close` y `Scheduled`. En `src/queue.jsx:1381`, esa lista reúne estados activos y los ordena por fecha; no está limitada a fechas futuras ni al día seleccionado.

**Cambio:** incorporar una franja de pendientes con filtros `Por cerrar`, `Pendientes de días anteriores`, `Hoy` y `Próximos`. Mantener el calendario para planificar y una lista compacta para ejecutar. Aclarar cuándo el selector de fecha afecta únicamente el calendario.

**Criterio de aceptación:** un calendario vacío nunca oculta pendientes anteriores; cada categoría abre su lista y cada tarea muestra la acción que le corresponde. No interpretar automáticamente un estado antiguo como incumplimiento: puede faltar registrar el cierre.

### 2. Reemplazar acciones aparentes en las tarjetas

**Observación:** Like, Comment, Share y Save se presentan como botones en Dashboard, pero sus handlers solo llaman a `stopAction` (`src/App.jsx:5924`). La acción de enviar al Pool existe en el menú.

**Cambio:** conservar la galería visual y utilizar esa fila para acciones reales: `Ver detalle`, `Enviar al Pool` o `Sugerir`, según permisos, y `Abrir original`. Añadir Guardar solo si existe persistencia real. Dar nombre y feedback específicos a cada acción.

**Criterio de aceptación:** todo control interactivo produce un resultado comprensible; enviar o sugerir no exige descubrir el menú contextual. Mantener accesibilidad por teclado y foco visible.

### 3. Hacer explícito el estado editorial de cada fuente

**Observación:** ya existe `queueState`, pero la tarjeta muestra `In Pool` o el genérico `Assigned` para los demás estados no cancelados (`src/App.jsx`, bloque `queue-source-state`). También existe atribución de publicaciones creadas mediante Queue.

**Cambio:** ampliar esa base a estados legibles: En Pool, Programado, En producción, Por cerrar y Publicado. Mostrar cuentas destino y acceso al trabajo relacionado. Ante una fuente ya utilizada, enseñar dónde está antes de ofrecer una nueva adaptación.

**Criterio de aceptación:** el usuario puede saber si el tema ya está en producción sin cambiar de pantalla. Permitir reutilización intencional para otras cuentas, con trazabilidad por destino.

## Prioridad 2: confianza y continuidad

### 4. Mostrar la vigencia y los límites de las métricas

**Observación:** Tracker mostraba deltas de `1 DAY` junto a snapshots del 3, 4 y 5 de septiembre. Cortex calcula el delta tomando como referencia el último snapshot disponible de cada cuenta. No equivale necesariamente al crecimiento de hoy. También se observó `+86894.3%` de Engagement trend para una cuenta; el cálculo compara promedios de likes entre ventanas de 30 días.

**Cambio:** indicar el intervalo real junto al crecimiento y destacar snapshots atrasados. Renombrar Engagement trend a variación del promedio de likes, o definir claramente la métrica. Mostrar muestra y base de comparación; sustituir conclusiones fuertes por `Base insuficiente` cuando corresponda. Diferenciar likes ocultos, no disponibles y cero.

**Criterio de aceptación:** dos cuentas con fechas distintas no parecen comparaciones del mismo día. Un porcentaje extremo incluye contexto suficiente para interpretarlo. La causa concreta del valor extremo requiere auditar los datos; no está diagnosticada aquí.

### 5. Una navegación y un contexto comunes

**Observación:** Dashboard, Queue y las páginas estáticas usan cabeceras y selectores diferentes. Insights despliega las 48 cuentas como chips; Tracker usa barra lateral; Dashboard usa grupos y popovers. Mobile ya incorpora un Home diferenciado por rol en `src/mobile/main.jsx:299`.

**Cambio:** compartir orden y nombres de navegación, cuenta o conjunto activo, período y retorno al contexto anterior. Extender al desktop la idea del inicio por rol: producción personal para diseñadores; pendientes, capacidad y oportunidades para coordinadores. Permitir recordar la última sección para usuarios habituales.

**Criterio de aceptación:** ir de una cuenta en Tracker a sus posts conserva cuenta y período; volver recupera filtros y posición. Ver una sección no amplía permisos.

### 6. Aclarar el cierre del trabajo

**Observación:** Queue distingue completar producción de cerrar con enlaces publicados, y ya solicita enlaces por cuenta destino. La lista contiene numerosos `Ready To Close` de días anteriores.

**Cambio:** mantener esa distinción, expresarla como `Producción terminada` y `Publicación registrada`, y mostrar qué cuenta todavía necesita enlace. Dar visibilidad al tiempo pendiente de cierre. Ofrecer coincidencias con posts importados como ayuda, sujetas a confirmación humana.

**Criterio de aceptación:** cada cuenta destino tiene su propio resultado visible; nadie confunde terminar el diseño con registrar la publicación. No cerrar automáticamente por similitud de texto.

## Prioridad 3: mejorar la decisión editorial

### 7. Pasar de explorar posts a evaluar oportunidades

**Observación:** en la primera fila del Dashboard aparecían cuatro versiones del mismo tema publicadas por cuentas distintas. Esto es información útil, pero exige compararlas manualmente.

**Cambio:** añadir una vista opcional por tema, conservando la galería. Cada grupo muestra fuentes, primera detección, versiones, rendimiento relativo y cobertura en cuentas propias. Ofrecer vistas de trabajo guardadas, por ejemplo `Recientes sin trabajar` o `HOT para mis cuentas`. Ampliar las listas existentes para guardar también filtros y orden.

**Criterio de aceptación:** es posible comparar versiones y detectar cobertura editorial sin perder fuentes. Las agrupaciones deben poder corregirse; comenzar por enlaces y señales claras antes de añadir clasificación automática compleja.

### 8. Conectar Insights con decisiones comprobables

**Observación:** Insights ya presenta conclusiones sobre formatos, duración y cantidad de slides. En la sesión se abría en All time y todas las cuentas, con recomendaciones basadas en medias agregadas.

**Cambio:** acompañar cada conclusión con cuenta o segmento, período, tamaño de muestra y acceso a ejemplos. Comparar formatos dentro de contextos semejantes; añadir medianas para evitar depender exclusivamente de grandes éxitos aislados. Llevar los ejemplos seleccionados al flujo editorial existente.

**Criterio de aceptación:** desde una conclusión se llega a los posts que la sustentan y se puede preparar un brief. El rendimiento histórico se presenta como evidencia para experimentar, sin prometer causalidad ni éxito futuro.

## Implementación y verificación

Primera entrega: pendientes visibles en Queue, acciones reales en tarjetas y etiquetas precisas de estado. Segunda: vigencia de métricas, cierre por destino y continuidad de navegación. Tercera: agrupación de oportunidades y aprendizaje por cuenta.

Extraer gradualmente componentes compartidos de navegación, tarjetas, estados y permisos. Dashboard tiene 6.070 líneas y Queue 1.961; Tracker e Insights mantienen implementaciones independientes. Mobile debe conservar su composición propia y compartir reglas de negocio. Revisar especialmente que un fallo de métricas secundarias no bloquee trabajo principal: Home móvil carga Queue y Tracker juntos mediante `Promise.all`.

Para validar cada entrega, probar el recorrido completo con roles de diseñador, coordinador y administración: descubrimiento → Pool o sugerencia → asignación → producción → cierre por destino. Incluir recarga, enlace directo y reconexión. Medir antes y después tiempo hasta encontrar la siguiente tarea, tiempo desde selección hasta asignación, antigüedad de pendientes de cierre, duplicaciones accidentales y pérdida de contexto. Fijar objetivos numéricos después de obtener la línea base.

El siguiente paso de investigación es observar una sesión real de un coordinador y otra de un diseñador realizando trabajo cotidiano. Eso permitirá comprobar qué fricciones tienen mayor frecuencia y ajustar el orden propuesto.
