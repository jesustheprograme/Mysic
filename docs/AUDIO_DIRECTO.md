# Audio directo (Mysic escritorio)

Qué cambió: el audio de YouTube ya no pasa por el VPS. La aplicación lo resuelve en el equipo del usuario.

| | Antes (servidor) | Ahora (directo) |
|---|---|---|
| Resolver una pista | 600-1.000 ms en frío (PO token + YouTube desde una IP de centro de datos) | ~80 ms (`VISIONOS` desde la IP del usuario) |
| Primer byte del audio | 360-1.230 ms (conexión nueva del servidor con YouTube) | primer tramo ya descargado si la pista estaba preparada |
| Ancho de banda del VPS | todo el audio | ninguno |

Medido en la app real (0.1.82, 5 pruebas por grupo): pista **preparada** (cursor detenido) clic a audio 334-433 ms, mediana 390 ms;
pista **fría** 623-1.243 ms, mediana 842 ms. Antes: 937-1.346 ms preparada y 1.059-1.543 ms fría.
Cambio rápido (4 rondas de 5 clics): siempre suena la última y ninguna pista anterior empezó después del último clic.

## Piezas
- `src-tauri/src/resolver.rs`: resolvedor, caché de URLs (se renuevan 10 min antes de caducar), primer tramo en memoria
  (12 pistas, 3 min) y protocolo `mysicstream`. 12 pruebas unitarias.
- `src/features/youtube/directAudio.js` y `directAudioModel.js`: puente con Tauri y lógica pura (con pruebas).
- `src/features/youtube/hooks/usePlayer.js` (plantilla en `youtubei_Mysic/tools/mysic/usePlayer.js`): elige fuente directa o servidor.
- `public/client-config.json`: perfil del cliente de YouTube (versión, agente). Es dato: se actualiza sin instalador.

## Respaldo y desactivación
1. La fuente directa falla (perfil roto, vídeo no disponible, red): el mismo reproductor usa `/stream/:id` del servidor.
2. El servidor también falla: iframe de YouTube (como antes).
3. Interruptor manual: `localStorage.setItem('mysic:direct-audio', '0')` fuerza el servidor.
Comprobado en la app: perfil roto cae al servidor sin iframe ni aviso; restaurado vuelve a directa; el interruptor funciona.

## Cuando YouTube cambie algo
- Cambia la versión o el agente del cliente: edita `public/client-config.json` y publica el frontend. Sin instalador nuevo.
- Si `VISIONOS` deja de funcionar: probar otro cliente en ese JSON (nombre y versión salen de `Constants.js` de youtubei.js).

## Pendiente (no hecho)
Motor nativo (libmpv o rodio) y precarga al 70-80 % para reproducción sin pausas; retirar el iframe y los archivos generados.
Sin desplegar: `client-config.json` en el servidor (la app usa los valores por defecto) y el primer tramo del servidor (respaldo).