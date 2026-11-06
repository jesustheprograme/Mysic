# Parte 5: núcleo nativo (plan acotado)

Objetivo: que la app de escritorio deje de depender del servidor remoto para lo que más pesa en la
sensación de velocidad (búsqueda, detalle de álbum/artista, audio), como hace limusic.

Regla: cada fase se entrega sola, detrás de un interruptor, con el camino actual (servidor) como
respaldo. Si una fase no mejora los números medidos, se descarta sin afectar a las demás.

## Fase 0 - Medir (media jornada)
- Cronometrar hoy, en la app instalada: búsqueda -> resultados, clic en álbum -> lista, clic en
  reproducir -> primer sonido. Guardar los tiempos como línea base en este documento.
- Sin esto no se sabe qué fase merece la pena.

## Fase 1 - Caché local del detalle (bajo riesgo)
- Comando Tauri que guarda en disco (SQLite o archivos JSON atómicos, como `local_audio.rs`) las
  respuestas de álbum, artista y búsqueda, con TTL y límite de tamaño.
- El frontend sirve primero lo local y revalida en segundo plano (ya existe `persistedCache.js`).
- Sin cambios de protocolo ni de cuenta.

## Fase 2 - Proxy local de audio (riesgo medio)
- Esquema `mysicaudio` ya existente: ampliarlo para `stream/<id>` con Range, cacheando en disco el
  audio reproducido (segmentos), con límite de espacio y limpieza LRU.
- El reproductor sigue siendo el IFrame; solo cambia de dónde sale el audio descargado/cacheado.

## Fase 3 - Cliente YouTube en Rust (alto riesgo, decidir tras la fase 0 y 1)
- Crate de InnerTube en Rust para búsqueda y navegación directa desde el equipo del usuario.
- Requiere resolver cuenta vinculada (cookies/sesión), PO tokens y cambios frecuentes de YouTube:
  es el coste de mantenimiento más alto. Solo si las fases 1-2 no bastan.

## Fase 4 - Reproductor nativo (el mayor cambio, opcional)
- Sustituir el IFrame por libmpv. Implica reescribir controles, cola, letras sincronizadas y
  descargas sobre eventos nativos. No empezar antes de cerrar las fases 1-3.

## Fuera de alcance
- Reescribir el backend; cambiar la autenticación; tocar código generado de `src/youtube`.

## Criterio de éxito por fase
Mejora medible frente a la línea base de la fase 0, sin regresiones en las 100+ pruebas y sin
aumentar el uso de red cuando la app está en segundo plano.
