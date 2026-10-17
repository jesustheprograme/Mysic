# Carga progresiva de Mysic global

La búsqueda «Todo» solicita canciones primero. Los bloques Artistas y Álbumes
se montan al acercarse a 160 px del área visible y solicitan su categoría entonces.
Los filtros explícitos siguen solicitando directamente la categoría elegida.
Los carruseles conservan botones y texto accesibles, pero las portadas remotas
reciben su URL solo cuando se acercan al área visible. Se conservan los componentes
nativos SongList y HomeRail.

Las solicitudes por categoría se deduplican dentro de cada búsqueda. Una nueva
consulta cancela las solicitudes anteriores e impide que sus respuestas cambien
los resultados actuales. Volver al catálogo reactiva las categorías pendientes.
IndexedDB dispone de 80 ms para aportar resultados iniciales sin bloquear la red.

Esto es carga por visibilidad, no virtualización completa: las secciones visitadas
permanecen montadas y la lista de canciones conserva su paginación. Los endpoints
de artista y álbum todavía devuelven metadatos y contenido juntos.

## Verificación

Desde Frontend, con las dependencias de Frontend y Backend instaladas:

```sh
node qa-progressive.mjs
npm run check
```

La prueba de integración usa respuestas simuladas y verifica peticiones iniciales,
categorías bajo demanda, deduplicación, cambios rápidos de consulta, filtros,
regreso al catálogo y montaje/limpieza de observadores. No mide latencia real
de YouTube ni constituye una prueba visual de producción.

La vista de integración se mantiene en
`youtubei_Mysic/tools/mysic/YoutubeView.jsx`; el migrador la usa al seleccionar
`frontend/src/App.jsx`. Los hooks se mantienen en el repositorio de origen.
No editar manualmente la copia generada en `features/youtube`.
