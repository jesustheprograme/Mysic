---
name: mysic-perf-measurement
description: Mide el rendimiento real de la app de escritorio Mysic (Tauri/WebView2) con gestos reales por el depurador (CDP) - memoria por proceso, fugas entre vistas, clic hasta audio, clic hasta contenido. Úsala cuando pidan "medir", "cuánta memoria usa", "está lento", "latencia de reproducción", "antes y después de optimizar" o comparar con Limusic. Use when asked to benchmark, profile or verify a performance change in the installed Mysic app.
---

# Medir Mysic en la app real

Medir antes de optimizar y después de cada cambio. Un número sin método no sirve: usa siempre estos scripts y registra
versión instalada, vista y cuántas pruebas hubo.

## Preparar
1. Cierra Mysic y ábrela con el puerto de depuración (solo para medir; ciérrala al terminar):
   ```powershell
   Get-Process mysic -EA 0 | Stop-Process -Force
   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9333'
   Start-Process "$env:LOCALAPPDATA\Mysic\mysic.exe"; Start-Sleep 18
   ```
2. Node 22 o superior (usa `WebSocket` global). Los scripts están en `scripts/` de esta skill y solo leen contadores,
   tiempos e ids: no leen cookies, tokens ni datos privados.
3. Al terminar: reinicia Mysic **sin** esa variable y comprueba que `http://127.0.0.1:9333/json/list` ya no responde.

## Scripts (`scripts/`)
| Script | Mide |
|---|---|
| `drive.mjs <pasos>` | Memoria por proceso (renderer, GPU, total), heap, DOM e imágenes. Pasos: `sample`, `click:<texto>`, `scroll`, `wait:<s>`. Ej.: `node drive.mjs sample "click:Biblioteca" scroll "click:Inicio"` |
| `cycle.mjs` | Fuga de memoria: 8 ciclos Biblioteca, Artistas, Estadísticas, Inicio con recolección de basura. Si el renderer sigue creciendo tras recolectar, hay fuga |
| `play-measure3.mjs` | Clic, primer audio con 8 canciones en frío; latencia de `/stream` desde la página; cambio rápido de 5 canciones (solo debe sonar la última) |
| `content-measure2.mjs` | Clic hasta contenido visible al abrir álbum, playlist o artista, en frío y con el puntero detenido (precarga), con las peticiones de red de cada apertura |

Las marcas de rendimiento de la app (`mysic:playback-intent`, `track-rendered`, `stream-resolved`, `audio-canplay`,
`audio-playing`) están en `Frontend/src/features/youtube/perfMarks.js`.

## Cómo interpretar
- Informa **mediana, mínimo y máximo** y el tamaño de la muestra. Con menos de 5 pruebas dilo.
- Memoria: compara reposo, tras Biblioteca con scroll y reproduciendo. Una subida que se queda tras volver a Inicio y recolectar
  basura es fuga; una que baja al salir de la vista es coste de la vista.
- Objetivos de reproducción: actualización visual menor de 100 ms; pista preparada con mediana menor de 500 ms.
- Un error en la medición es peor que no medir: si un script falla a medias, repítelo entero antes de sacar conclusiones.

## Reglas
- No pruebes contra producción con carga: una sesión de usuario real es una sesión, no un test de estrés.
- Los gestos (clic, movimiento) se envían por `Input.dispatchMouseEvent`; no uses `element.click()` para medir latencia
  de reproducción, porque se salta el puntero que dispara la precarga.
- Los selectores (`.yt-landing .sl-song`, `.collection-detail`) son de Mysic: si cambia la interfaz, ajústalos.
