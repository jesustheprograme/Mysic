# Paquetes sustituidos

Los siguientes paquetes quedan obsoletos para nuevas instalaciones. Se conservan únicamente como evidencia histórica y no deben aplicarse encima del parche progresivo del 2026-11-10:

- `mysic-backend-20261106-perf.tar.gz`
- `mysic-backend-20261106-perf-full.tar.gz`
- `mysic-backend-20261106-home-extended.tar.gz`
- `mysic-backend-20261109-youtube-library.tar.gz`
- `mysic-backend-20261109-youtube-library-v2.tar.gz`
- `mysic-backend-20261109-youtube-library-video-stream.tar.gz`
- `mysic-frontend-20261106-perf.tar.gz`
- `mysic-frontend-20261106-ux.tar.gz`

Reemplazo: `mysic-patch-20261110-progressive-loading.tar.gz`.

Para los cuatro archivos del flujo de audio, la implementación anterior queda
sustituida por `mysic-backend-20261112-stream-head-prefetch.tar.gz`. No se debe
reaplicar `mysic-backend-20261109-youtube-library-video-stream.tar.gz` después
de este paquete.
