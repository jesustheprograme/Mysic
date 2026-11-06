// Adaptador de fuente de audio: redirige al archivo local las URLs de audio descargado.
//
// El reproductor de YouTube Music (código generado, no editable aquí) asigna
// `audio.src = <servidor>/downloads/<id>/audio` tanto en el elemento principal como en el que crea
// con `new Audio()` para precargar la pista siguiente. Interceptar la propiedad `src` en el prototipo
// cubre ambos con un único punto, sin tocar el código generado.
//
// Solo se reescriben URLs con la forma exacta del audio descargado Y de canciones que tienen copia
// local; cualquier otra asignación pasa intacta. La solución de fondo es que `localAudioUrl` del
// código generado sea inyectable; hasta entonces este adaptador es el único punto de acoplamiento.

const SERVER_AUDIO = /\/downloads\/([A-Za-z0-9_-]{11})\/audio(?:[?#].*)?$/

/** Devuelve la URL local si `src` es audio descargado con copia local; si no, `src` sin cambios. */
export function rewriteAudioSrc(src, { has, urlFor }) {
  if (typeof src !== 'string') return src
  const match = SERVER_AUDIO.exec(src)
  return match && has(match[1]) ? urlFor(match[1]) : src
}

/**
 * Instala el adaptador y devuelve la función que lo desinstala.
 * `target` es el prototipo cuyo `src` se intercepta (por defecto `HTMLMediaElement.prototype`).
 */
export function installLocalMediaSource({ has, target = globalThis.HTMLMediaElement?.prototype, urlFor }) {
  if (!target) return () => {}
  const original = Object.getOwnPropertyDescriptor(target, 'src')
  if (!original?.set) return () => {}

  Object.defineProperty(target, 'src', {
    ...original,
    set(value) {
      original.set.call(this, rewriteAudioSrc(value, { has, urlFor }))
    },
  })

  return () => Object.defineProperty(target, 'src', original)
}
