// Cálculo puro de la ventana de filas visibles de una lista larga (sin React ni DOM).
// Mismo enfoque que rows.ts de limusic: solo se montan las filas visibles más un margen; el resto se
// sustituye por relleno para que la barra de scroll conserve la longitud de la lista completa.

/** Por debajo de este número de filas no se ventanea: el DOM completo es barato y evita riesgos. */
export const WINDOW_THRESHOLD = 100
export const DEFAULT_OVERSCAN = 10
/** Altura de fila (70px) + separación de la rejilla (4px) hasta poder medirla de verdad. */
export const FALLBACK_PITCH = 74

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

/** ¿Conviene ventanear? Las listas con encabezados de disco tienen alturas irregulares y se excluyen. */
export function shouldWindow({ count, hasDiscHeadings, threshold = WINDOW_THRESHOLD }) {
  return !hasDiscHeadings && count >= threshold
}

/**
 * Rango [start, end) de filas a montar.
 * - scrollTop: desplazamiento del contenedor con scroll.
 * - listTop: posición del inicio de la lista dentro del contenido de ese contenedor.
 * - pitch: distancia entre el inicio de dos filas consecutivas.
 */
export function computeWindow({ scrollTop, viewportHeight, listTop, pitch, count, overscan = DEFAULT_OVERSCAN }) {
  if (count <= 0) return { start: 0, end: 0 }
  if (!(pitch > 0) || !(viewportHeight > 0)) return { start: 0, end: Math.min(count, overscan * 4) }

  const first = Math.floor((scrollTop - listTop) / pitch)
  const visible = Math.ceil(viewportHeight / pitch) + 1
  const start = clamp(first - overscan, 0, count)
  const end = clamp(first + visible + overscan, start, count)
  return { start, end }
}

/** Posición (dentro del contenedor) del inicio de la fila `index`, montada o no. */
export function rowTop({ index, listTop, pitch }) {
  return listTop + index * pitch
}

/** Relleno que sustituye a las filas no montadas por arriba y por abajo. */
export function windowPadding({ start, end, count, pitch }) {
  return { top: start * pitch, bottom: (count - end) * pitch }
}
