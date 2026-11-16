# Despliegues de producción

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
