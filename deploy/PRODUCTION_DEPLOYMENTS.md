# Despliegues de producción

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
