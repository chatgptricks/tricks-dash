# Continuación: stacks y agrupación manual

## Estado confirmado
- Proyecto: `/Users/tbnalfaro/Desktop/Codex Projects/09 Tricks Dash/Tricks Dash`.
- Fuente en main: `a12d134`. Publicación gh-pages: `1fb21f3`; GitHub Pages completó correctamente y el HTML público sirve `main-wSwHdudN.js`.
- Ya se quitaron Posts/Topics y Champion by. El dashboard agrupa automáticamente; `TopicStack` muestra la portada con más likes y se expande para elegir entre todas las cards.
- Build, test:product, smoke de dashboard y mobile pasaron. Falta inspección visual/interactiva de esta última versión en navegador.
- El usuario añade: arrastrar cualquier card sobre otra para agrupar manualmente. Mantener Insights fuera del alcance.

## Implementación
1. Revisar `src/TopicStack.jsx`, `src/topicStack.css`, `src/useTopicGroups.js`, `src/topicGroups.js`, render de galería en `src/App.jsx` y `src/mobile/main.jsx`. Reutilizar el componente; no agregar filtros.
2. Separar las reglas de agrupación manual en una función pura. Identificar posts por `postKey` (fallback account:shortcode), nunca por posición. Cada post aparece una sola vez. Los grupos manuales prevalecen sobre la detección automática; extraer sus miembros de otros grupos antes de combinarlos. Ordenar siempre por likes y recalcular portada.
3. Interacción: card individual sobre otra crea grupo; sobre stack agrega al grupo. Arrastrar la portada de un stack cerrado mueve el grupo completo; desde un stack expandido mueve solo esa card. Ignorar soltar sobre sí misma. Mostrar destino resaltado y preview; no abrir detalle al finalizar un drag. Botones, enlaces y selección de texto conservan su funcionamiento.
4. Guardar membresías manuales, no copias de posts. Para esta primera versión usar almacenamiento local versionado por usuario; dejar explícito que no sincroniza entre usuarios/dispositivos. Aplicar membresías antes de recortar por paginación, y conservarlas al filtrar: no perder miembros temporalmente ocultos. Agregar Deshacer y Separar del grupo; una separación explícita debe impedir que el agrupador automático la revierta.
5. Usar Pointer Events con umbral de movimiento, cancelación y limpieza; permitir scroll táctil normal. Proporcionar alternativa por teclado/menu para agrupar, sin depender exclusivamente del drag. Compartir lógica entre desktop y móvil.

## Validación y entrega
- Pruebas: crear, añadir, fusionar, mover un miembro, separar, deshacer, recargar, cambiar filtros, evitar duplicados, mantener campeón y cancelar drag. Comprobar que un clic normal sigue expandiendo/seleccionando.
- Ejecutar test:product, smoke de dashboard/mobile y build con `VITE_SKIP_PUBLIC=1`; añadir pruebas de las nuevas reglas e interacciones.
- Inspeccionar visualmente desktop/móvil y probar arrastre real antes de declarar terminado. Verificar teclado y scroll táctil.
- Publicar fuente en main y assets en el worktree existente `/private/tmp/tricks-pages-publish-2TyCF6`, verificando antes que esté limpio. Conservar archivos antiguos y CNAME. No cambiar de rama en el checkout fuente ni incluir los numerosos archivos ajenos con “ 2” en el nombre.
- Esperar Pages exitoso, comprobar hashes públicos y repetir el flujo en producción. No enviar mensajes ni crear asignaciones reales durante QA.
