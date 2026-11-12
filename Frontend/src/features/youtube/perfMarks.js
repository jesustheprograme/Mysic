// Marcas de rendimiento del arranque y la navegación de YouTube Music. Sin secretos: solo nombres y duraciones.
// En desarrollo (npm run dev) se escriben en la consola; siempre quedan en la línea de tiempo del navegador
// (performance.getEntriesByType('mark') con el prefijo "mysic:"), útil para medir antes y después.
const isDev = () => Boolean(import.meta.env?.DEV)

export function perfMark(name, detail) {
  try {
    // El detalle (por ejemplo el id de la canción) viaja en la marca para poder emparejar clic y primer audio.
    globalThis.performance?.mark?.(`mysic:${name}`, detail === undefined ? undefined : { detail })
    if (isDev()) console.debug(`[mysic-perf] ${name} +${Math.round(globalThis.performance?.now?.() ?? 0)} ms`, detail ?? '')
  } catch {
    // Medir nunca debe romper la aplicación.
  }
}

/** Solo la primera vez por clave (por ejemplo, "primer contenido de Inicio"). */
const seen = new Set()
export function perfMarkOnce(name, detail) {
  if (seen.has(name)) return
  seen.add(name)
  perfMark(name, detail)
}