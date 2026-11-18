# Despliegues de producción

## 2026-11-18 19:53 UTC (14:53 America/Lima) — playlists de YouTube, errores sin caché y Server-Timing (v2)

- Paquete: `mysic-backend-20261118-playlist-save-error-cache-v2.tar.gz`
- SHA-256: `5a0c5af149053fd1721e20408cc0e1eb5a688f75469e13d3c219d143d5818762`
- Alcance: tres rutas para listar playlists editables y añadir/quitar canciones en YouTube Music, `Cache-Control: no-store` para errores de `asyncRoute`, `Server-Timing` y `Timing-Allow-Origin` para `/api`, cuatro archivos nuevos y dos registros de prueba en `Backend/package.json`; no se modificaron frontend, `.env`, secretos, datos, dependencias, Nginx ni `authPaths.js`
- Respaldo final: `/srv/mysic/releases/pre-playlist-save-error-cache-20261118T195041Z`, con `server.js`, `http.mjs`, `package.json`, hashes, permisos, 181/181 pruebas previas, journal, 187/187 pruebas posteriores y la verificación pública/métricas
- Base remota: 2/2 hashes de `BASELINE.txt` correctos (`server.js` CRLF `5cf64da6…21a82` y `http.mjs` `a86ae7ef…18d326`); los cuatro archivos nuevos no existían y los dos paquetes sustituidos no estaban aplicados
- Integridad: SHA-256 externo correcto y 6/6 entradas de `MANIFEST.sha256` válidas antes de aplicar y en destino después de copiar
- Permisos: los seis archivos del paquete quedaron `ubuntu:ubuntu` 0644
- `package.json`: `src/server-timing.test.js` y `src/playlist-edit.test.mjs` registrados exactamente una vez en las posiciones indicadas; JSON válido, sin BOM y `ubuntu:ubuntu` 0644
- Backend en servidor: `npm run check` correcto; 187/187 pruebas, 0 fallos y esquema Prisma válido (181 pruebas previas + 6 nuevas)
- Servicios: `mysic-api` activo y Nginx activo; readiness pública HTTP 200 con `status: ready`; salud de YouTube HTTP 200 con `ready: true`, `online: true`
- 7.1 `GET /api/health`: HTTP 200; `Server-Timing: app;dur=0.1`, `Timing-Allow-Origin: *`, `Cache-Control: no-store`
- 7.2 `GET /api/youtube/search?q=ado&type=song`: HTTP 200; conserva `Cache-Control: public, max-age=60, stale-while-revalidate=240`; `Server-Timing: app;dur=1.0` y `Timing-Allow-Origin: *`
- 7.3 `GET /api/youtube/album/MPREb_0000000000000`: HTTP 500 esperado; `Cache-Control: no-store`, `Server-Timing: app;dur=120.3`; no llevó caché pública
- 7.4 rutas nuevas sin sesión: HTTP 401 en `GET playlist/targets`, `POST playlist/PLx/videos` y `DELETE playlist/PLx/videos/:videoId`; todas llevaron `Server-Timing` y `Timing-Allow-Origin: *`; no se escribió en ninguna playlist real
- 7.5 rutas personales sin sesión: HTTP 401 en `home`, `library/overview`, `playlist/x` y `stream/dQw4w9WgXcQ`
- 7.6 `GET /api/youtube/comments/dQw4w9WgXcQ`: HTTP 200, 8.970 bytes; `Cache-Control: private, max-age=120`, `Server-Timing: app;dur=0.4`
- 7.7 journal posterior: sin avisos ni errores nuevos aparte de las dos líneas esperadas del 500 provocado en 7.3 (`No contents found in the response` y el acceso HTTP 500)
- `Server-Timing`, tres peticiones seguidas: health `0.2/0.2/0.2 ms`; search `8.7/1.2/0.5 ms`; artist `334.0/0.9/0.5 ms`; comments `391.2/0.6/0.4 ms`
- Métricas: servicio activo desde 19:51:18 UTC; 433,6 MB al minuto 1:24 (pico 433,6 MB). `ps -C node` solo imprimió la cabecera porque el proceso figura como `MainThread`; la inspección equivalente mostró PID 1524119, CPU 4,3 %, memoria 3,7 %, RSS 223.944 KiB y 1:58 de ejecución
- Host: 5.903 MB RAM total, 818 MB usados, 5.084 MB disponibles, sin swap; uptime 71 días 4:19; carga `0.18/0.48/0.29`; 1 CPU; `/srv` en `/dev/sda1`, 45 GB totales, 22 GB usados, 23 GB libres (50 %)
- Avisos/errores de `mysic-api` en las últimas 24 h con prioridad warning o superior: 0; no hubo líneas para el top 5
- Nginx: el formato configurado no incluye `$request_time`, por lo que no fue posible calcular p50/p95 sin cambiar la configuración; no se modificó
- Reversiones intermedias: tres reversiones automáticas restauraron y verificaron la base antes del intento final. Fueron causadas por el arnés operativo, no por el paquete: comprobación de `ready` contra `/api/health` en vez de `/api/health/ready`; uso de `grep -q` con `pipefail`; y comprobación única de YouTube antes de que terminara de inicializar. El intento final esperó correctamente tanto la readiness como `ready:true, online:true`

`DEPLOY_OK` — la v2 quedó activa, con 187/187 pruebas y todas las verificaciones públicas correctas; falta únicamente la prueba manual autorizada del propietario para añadir y quitar una canción.

## 2026-11-18 19:09 UTC (14:09 America/Lima) — playlist de YouTube, no aplicado por base divergente

- Paquete: `mysic-backend-20261118-playlist-save-error-cache.tar.gz`
- SHA-256: `a147df96d0b99f183f59f5d4aae1a8bb79fe12ebd0b234fefca41002006c8f40`
- Alcance previsto: rutas para guardar y quitar canciones en playlists propias de YouTube Music, `Cache-Control: no-store` en errores de `asyncRoute`, cabeceras `Server-Timing`/`Timing-Allow-Origin` en `/api` y registro de dos archivos de prueba; no se pretendía modificar frontend, `.env`, secretos, datos, dependencias, Nginx ni `authPaths.js`
- Integridad: SHA-256 externo correcto; paquete extraído en un directorio temporal remoto y 6/6 entradas de `MANIFEST.sha256` válidas
- Base remota: 1/2 entradas de `BASELINE.txt` válidas. `Backend/src/youtube/utils/http.mjs` coincidió con `a86ae7ef3456c08e15c77a9268a9492e2d73d101e9ff2c49d2f2a83fc418d326`; `Backend/server.js` debía ser `60d6b59b3a740da58918a90eae2b337783d93695b49f59f8a0185d02c8cb4ca9`, pero producción tenía `5cf64da6cd9f5a59961532d78096d7e3c16674268d2836f09baacd73c6621a82`
- Paquete sustituido: no había marcadores de `playlist-edit` ni `server-timing` en `server.js` o `package.json`; los cuatro archivos nuevos estaban ausentes y ambas pruebas figuraban 0 veces, por lo que `mysic-backend-20261118-youtube-playlist-save.tar.gz` no estaba aplicado
- Estado previo observado: `mysic-api` activo y Nginx activo
- Acción: despliegue detenido en el paso 2, antes de crear respaldo o modificar producción, conforme a la orden de no aplicar ante cualquier discrepancia
- No ejecutado por la detención: copia a destino, edición de `package.json`, `npm run check`, reinicio, readiness, verificación funcional y captura de métricas posteriores
- Reversión: no fue necesaria; no se copió ni modificó ningún archivo de la aplicación y no se reinició ningún servicio. Los archivos temporales de prevalidación se eliminaron

`DEPLOY_REVERTED` — el paquete no quedó activo: la base de `server.js` divergía y producción permaneció sin cambios.

## 2026-11-18 01:06 UTC (2026-11-17 20:06 America/Lima) — comentarios públicos de YouTube

- Paquete: `mysic-backend-20261117-youtube-comments.tar.gz`
- SHA-256: `54512673052a3e83978e6b800d68e2d21de50f238de6f9041ecbb01ae23ae86f`
- Alcance: tres archivos nuevos (`youtube/comments.mjs`, su prueba y `routes/comments.mjs`), dos líneas de registro en `routes/index.mjs` y un único argumento nuevo en el script `test` de `Backend/package.json`; no se modificaron frontend, `.env`, secretos, datos, dependencias, Nginx ni `authPaths.js`
- Respaldo previo: `/srv/mysic/releases/pre-youtube-comments-20261118T010407Z`, con `routes/index.mjs`, `package.json`, hashes, permisos, 175/175 pruebas previas y journal reciente
- Base remota: el hash de `routes/index.mjs` coincidía con `b533548f1a8a674bc79229a67553cc6ed8530e2c90a17c64aff6baa136c5d8d2`; los tres archivos nuevos no existían
- Integridad: SHA-256 externo correcto y 4/4 entradas de `MANIFEST.sha256` válidas antes y después de copiar
- Permisos: los cuatro archivos del paquete quedaron `ubuntu:ubuntu` 0644; `routes/index.mjs` estaba en 0666 y quedó normalizado al modo solicitado 0644
- `package.json`: `src/youtube/youtube/comments.test.mjs` registrado exactamente una vez; JSON válido, sin BOM y propietario/permisos conservados (`ubuntu:ubuntu` 0644)
- Backend en servidor: `npm run check` correcto; 181/181 pruebas, 0 fallos y esquema Prisma válido
- Servicios: `mysic-api` activo y Nginx activo
- Readiness público: HTTP 200, `status: ready`; YouTube público: HTTP 200, `ready: true`, `online: true`
- Comentarios página 0 (`dQw4w9WgXcQ`): HTTP 200, 20 elementos con `id`, `text` y `author`, total 2.462.447, `hasMore: true`; primer id `UgwW_cL1iucaVqoLCZV4AaABAg`
- Comentarios página 1: HTTP 200, 20 elementos; primer id `UgxIOV-sXAchpKX94cB4AaABAg`, distinto al de la página 0
- Orden nuevo: HTTP 200, 20 comentarios
- Respuestas: comentario `UgwW_cL1iucaVqoLCZV4AaABAg`, 699 respuestas anunciadas; HTTP 200 y 3 respuestas devueltas en la primera carga
- Validación: `GET /api/youtube/comments/xx` respondió HTTP 400
- Rutas personales sin sesión: HTTP 401 en `home`, `library/overview`, `playlist/x` y `stream/dQw4w9WgXcQ`
- Journal posterior: sin avisos ni errores; no apareció el aviso conocido `CommentFilterContextView not found`
- Reversión: no fue necesaria

`DEPLOY_OK` — la API pública de comentarios quedó desplegada y verificada de extremo a extremo.

## 2026-11-16 05:31 UTC (00:31 America/Lima) — fin seguro de continuaciones del Inicio

- Paquete: `mysic-backend-20261116-home-more-end.tar.gz`
- SHA-256: `9e40aebf4016b90593b8d643062c2814a4eddd46142cbbcf43c4d5d23e2d207d`
- Alcance: solo `Backend/src/home-extended.mjs` y `Backend/src/home-extended.test.mjs`; no se modificaron frontend, `package.json`, `.env`, secretos, datos, dependencias ni Nginx
- Respaldo previo: `/srv/mysic/releases/pre-home-more-end-20261116T052928Z`, con los dos archivos, hashes previos y journal
- Base remota: 2/2 hashes de `BASELINE.txt` correctos, correspondientes a `artists-search-moods-v2`; no había cambios remotos ajenos
- Integridad: SHA-256 externo correcto y 2/2 entradas de `MANIFEST.sha256` válidas antes y después de copiar
- Backend en servidor: `npm run check` correcto; 175/175 pruebas, 0 fallos y esquema Prisma válido
- Servicios: `mysic-api` activo y Nginx activo
- Readiness público: HTTP 200, `status: ready`; YouTube público: HTTP 200, `ready: true`, `online: true`
- Sin sesión: `GET /api/youtube/home/more?token=x` respondió HTTP 401
- Inicio anónimo con cliente de YouTube y manejador HTTP real: 4 páginas encadenadas, todas HTTP 200 y ninguna 502
- Páginas: página 1, 2 estantes y continuación; página 2, 3 estantes y continuación; página 3, 3 estantes y continuación; página 4, 2 estantes y sin continuación
- Final anónimo: natural, sin token; no se alcanzó una quinta página ni se reprodujo el fallo medido con la cuenta real, por lo que esta prueba no confirma ese caso privado y tampoco se cuenta como fallo
- Journal posterior: sin avisos ni errores; no apareció `Fin del Inicio…` porque el cliente anónimo terminó naturalmente
- Reversión: no fue necesaria

`DEPLOY_OK` — los dos archivos quedaron desplegados; el Inicio anónimo terminó en cuatro páginas sin 502.

## 2026-11-15 05:11 UTC (00:11 America/Lima) — artistas + búsqueda + pastillas v2

- Paquete: `mysic-backend-20261115-artists-search-moods-v2.tar.gz`
- SHA-256: `fdaedcc07215d6d881f58e65c3b8d919b9bf5cc7a28dd298681e52603e219d4a`
- Alcance: solo los seis archivos declarados bajo `Backend/src`; no se modificaron frontend, `package.json`, `.env`, secretos, datos ni dependencias
- Respaldo previo: `/srv/mysic/releases/pre-artists-search-moods-v2-20261115T050921Z`, con los seis archivos, hashes previos, manifiesto, pruebas y journal
- Base remota previa: coincidía exactamente con la base restaurada tras el intento v1; no había cambios remotos ajenos
- Entorno: `YOUTUBE_LANG` y `YOUTUBE_LOCATION` ausentes en la unidad, el proceso y los archivos de entorno del servicio
- Integridad: SHA-256 externo correcto y 6/6 entradas de `MANIFEST.sha256` válidas antes y después de copiar
- `package.json`: `mappers.test.mjs` ya estaba registrado exactamente una vez, separado por espacio y sin BOM; permaneció sin cambios
- Backend en servidor: 173/173 pruebas, 0 fallos
- Servicios: `mysic-api` activo, Nginx activo, `nginx -t` válido y journal posterior al despliegue sin avisos
- Readiness público: HTTP 200, `status: ready`; YouTube público: HTTP 200, `ready: true`, `online: true`
- Búsqueda pública para `kali uchis`: `song` 20 elementos (primero `Tomorrow`), `artist` 6 (primero `Kali Uchis`) y `album` 20 (primero `Sincerely,`); una segunda prueba con cliente anónimo fresco, sin caché, devolvió también 20/6/20
- Inicio anónimo mediante el manejador HTTP real: sin filtro, HTTP 200 con `Take it easy` y `Quick picks`, y continuación; con la etiqueta disponible `Relax`, HTTP 200 con `Deep focus`, `Unwind + explore` y `Time to relax`, también con continuación; los estantes fueron distintos
- Filtro inexistente: `Inventado` respondió HTTP 400 con `code: HOME_FILTER_INVALID`
- Playlist pública `Top 100 Music Videos Global`: 92 vídeos disponibles, 0 con `Artista desconocido`
- Ejemplos: `POKITO` — Diljit Dosanjh, Daddy Yankee; `Dai Dai` — Shakira, Burna Boy; `Tu Mil Jaaye (From "KING")` — Kumaar, Arijit Singh, Madhubanti Bagchi; `Xamdam Sobirov - Peshta / Хамдам Собиров - Пешта / Video Klip` — Xamdam Sobirov; `Casa Tupka Anthemo (feat. Priyanshi Srivastava)` — Yo Yo Honey Singh
- Rutas personales sin sesión: HTTP 401 en `home`, `home?filter=Relax`, `playlist`, `library`, `account` y `downloads`

No se usó una cuenta real, cookies ni contenido privado. El Inicio filtrado y la playlist se comprobaron en el servidor con un cliente anónimo y el mismo manejador/mapeadores desplegados.

## 2026-11-15 05:00 UTC (00:00 America/Lima) — intento de artistas + búsqueda + pastillas, revertido

- Paquete: `mysic-backend-20261114-artists-search-moods.tar.gz`
- SHA-256: `530e5270a0f96205b2ac27fad22378ba36fe2c7e7209a3a5e590ff8b36c7fbeb`
- Integridad: SHA-256 externo correcto y 6/6 entradas de `MANIFEST.sha256` válidas antes y después de copiar
- Respaldo previo usado para la reversión: `/srv/mysic/releases/pre-artists-search-moods-20261115T045750Z`; contiene los seis archivos, `Backend/package.json`, hashes previos y registros de pruebas/journal
- Base remota: coincidía exactamente con el parche `artists-es` para los cuatro archivos de YouTube y con el despliegue de carga progresiva para los dos archivos de Inicio; no había cambios remotos ajenos
- Entorno: `YOUTUBE_LANG` y `YOUTUBE_LOCATION` no estaban definidos en la unidad, proceso ni archivos de entorno del servicio; no se modificaron `.env`, secretos, datos, dependencias ni frontend
- `package.json`: `mappers.test.mjs` ya estaba registrado una sola vez, separado por un espacio y sin BOM; no fue necesario modificarlo
- Backend con el paquete aplicado: 170/170 pruebas, 0 fallos
- Servicios con el paquete aplicado: `mysic-api` activo, Nginx activo y `nginx -t` válido; journal sin avisos
- Readiness público: HTTP 200, `status: ready`; YouTube público: HTTP 200, `ready: true`, `online: true`
- Búsqueda pública tras revalidar el caché obsoleto: `song` 20 elementos (primero `Tomorrow`), `artist` 6 (primero `Kali Uchis`) y `album` 20 (primero `Sincerely,`)
- Rutas personales sin sesión: HTTP 401 en `home`, `home?filter=Relax`, `playlist`, `library`, `account` y `downloads`
- Fallo que obligó a revertir: el paquete añade `filter` a `loadHomeFirstPage`, pero `createExtendedHomeHandler` no pasa `req.query.filter` y no convierte `HOME_FILTER_INVALID` en HTTP 400. Por ello `GET /api/youtube/home?filter=Relax` ignoraría la pastilla y `?filter=Inventado` no devolvería `HOME_FILTER_INVALID`
- Verificación de playlist pública y cinco ejemplos: no ejecutada, porque el fallo del contrato HTTP de Inicio activó la reversión inmediata indicada por el propietario
- Reversión: restaurados los seis archivos y `package.json` desde el respaldo, hashes previos verificados y `mysic-api` reiniciado
- Estado final tras revertir: `mysic-api` activo, Nginx activo, configuración válida, readiness público `ready`, YouTube `ready: true, online: true` y journal sin avisos recientes

El paquete no quedó activo en producción. La primera consulta con el parche sirvió el valor vacío del caché persistente y disparó su revalidación; ese caché puede conservar temporalmente resultados no vacíos después de la reversión, pero no sustituye la corrección del código.

## 2026-11-14 22:33 UTC (17:33 America/Lima) — artistas de vídeos + YouTube Music en español

- Paquete: `mysic-backend-20261114-artists-es.tar.gz`
- SHA-256: `249c3be460451bb174d9abeeeca80be1e11c5ae70595f6f8d4f4d7b313eb2598`
- Alcance: solo `mappers.mjs`, `mappers.test.mjs`, `client.mjs`, `accountLink.mjs` y el registro de la prueba en `Backend/package.json`; no se tocaron frontend, `.env`, secretos, datos ni dependencias
- Respaldo previo: `/srv/mysic/releases/pre-artists-es-20261114T223257Z`; contiene los tres archivos existentes, `package.json` y `production-before.sha256` (`mappers.test.mjs` no existía)
- Base remota previa: los cuatro archivos existentes y `package.json` coincidían en contenido con las bases verificadas; hashes anotados en el respaldo
- Integridad: SHA-256 del paquete y 4/4 entradas de `MANIFEST.sha256` válidos antes y después de copiar
- `package.json`: `mappers.test.mjs` registrado una vez, separado por un espacio y guardado sin BOM
- Backend en servidor: 168/168 pruebas, 0 fallos
- `mysic-api`: `active`; `nginx`: `active`; `nginx -t`: configuración válida
- Readiness público: HTTP 200, `status: ready`; YouTube público: HTTP 200, `ready: true`, `online: true`
- Inicio anónimo del cliente de producción (`es`/`CL`): estantes `Selecciones rápidas` y `Temas relajantes`; la ruta HTTP `/api/youtube/home` sigue siendo personal y responde 401 sin sesión
- Playlist pública `Los 100 vídeos musicales más populares en Chile`: 100 canciones, 0 con `Artista desconocido`
- Ejemplos: `Ya Estoy Llegando` — Mati Bomba, Boy Wonder CF, Divino, Bayron Fire; `Donde Hubo Fuego Cenizas Quedan` — Anuel AA; `Las Mas Bonitas Son P*tas` — Anuel AA; `POKITO` — Diljit Dosanjh, Daddy Yankee; `Drácula (con Felolaefe)` — JulianoChieff, Drakomafia, Raven la R, bayriton
- Búsqueda general y búsqueda de vídeos: HTTP 200; la búsqueda de vídeos devolvió 20 elementos con artista
- Rutas personales sin sesión: HTTP 401 en `home`, `playlist`, `library`, `account` y `downloads`
- Journal posterior al reinicio: sin entradas de prioridad warning o superior; arranque de Node, YouTubei.js y BotGuard correcto

No se usó una cuenta real, cookies ni contenido privado. Como `home` y `playlist` son rutas personales en la API HTTP, su contenido se comprobó en el servidor con el mismo cliente y los mismos mapeadores de producción, usando únicamente una sesión anónima de YouTube.

## 2026-11-12 06:11 UTC — precarga del tramo inicial del audio

- Paquete: `mysic-backend-20261112-stream-head-prefetch.tar.gz`
- SHA-256: `8e864b0fdfa9317910c000ecc3d9baf90c66e927a44a9e5208592a67c37f9920`
- Backend: cuatro archivos de `stream` aplicados en `/srv/mysic/Backend`; frontend y Nginx no se modificaron
- Base remota previa: coincidía con los cuatro hashes del paquete desplegado el 2026-11-11
- Respaldo: `/srv/mysic/releases/pre-stream-head-prefetch-20261112T061112Z` (4/4 archivos)
- Backend en servidor: 161/161 pruebas y Prisma válido
- `mysic-api`: `active (running)`, un solo arranque exitoso, PID estable `1374355`
- Readiness público: HTTP 200 durante más de 10 minutos
- YouTube público: HTTP 200, `ready: true`, `online: true`
- Rutas de stream sin sesión: HTTP 401 antes y después del despliegue
- Memoria: 447 MB de pico durante el arranque y 145 MB estabilizados después de 10 minutos
- Logs posteriores: 0 respuestas 5xx, 0 errores de stream y 0 avisos de precarga fallida

El primer intento, a las 06:10 UTC, pasó las pruebas pero consultó readiness antes de
que Node terminara de escuchar. El rollback automático restauró los cuatro archivos.
Se añadió una espera acotada de hasta 60 segundos y el segundo intento terminó bien.

No se ejecutó una prueba con contenido de una cuenta real porque no se proporcionó un
usuario de prueba; no se inspeccionaron cookies, tokens ni contenido privado.

## 2026-11-11 03:21 UTC — carga progresiva de Inicio y Biblioteca

- Paquete: `mysic-patch-20261110-progressive-loading.tar.gz`
- SHA-256: `321109748f4e41d1994ac42c71dfb9bbc5b8f1d505a4e7a4e52fbe96c78f154b`
- Backend: 19 archivos aplicados en `/srv/mysic/Backend`
- Frontend: 193 archivos publicados mediante intercambio atómico en `/srv/mysic/frontend`
- Respaldo integral: `/srv/mysic/releases/pre-progressive-loading-20261111T031905Z`
- Frontend anterior: `/srv/mysic/releases/frontend-before-progressive-20261111T032137Z`
- Verificación del paquete remoto: 215/215 hashes
- Backend en servidor: 156/156 pruebas y Prisma válido
- `mysic-api`: `active`
- Nginx: `active`, configuración válida
- Readiness público: `ready`
- YouTube público: `ready: true`, `online: true`
- Búsqueda general: HTTP 200, resultado principal Ado
- Búsqueda de vídeos: HTTP 200 con elementos `type: video`
- Rutas personales nuevas sin sesión: HTTP 401 (montadas, no públicas)
- Hash del `index.html` publicado: `9f4b553f32a9f07212c807184e1bcaab588363f6fd49a0d519587ead8d267134`
- Errores recientes del servicio: ninguno

No se ejecutó una prueba con contenido de una cuenta real porque no se proporcionó un `--user`; no se inspeccionaron cookies, tokens ni contenido privado.
