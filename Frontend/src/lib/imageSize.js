// Pide cada imagen al tamaño de su hueco: el navegador guarda el bitmap decodificado al tamaño que recibe,
// así que una carátula de 544 px en una fila de 44 px ocupa ~150 veces la memoria que necesita.

/** Escalones que se piden a los CDN: pocos tamaños para no fragmentar la caché (HTTP y proxy en disco). */
export const IMAGE_STEPS = [96, 160, 240, 360, 544, 720, 1080]

const MAX_DEVICE_SCALE = 2
// mqdefault mide 320x180: cubre huecos cuyo escalón no pasa de 160 px físicos.
const MQDEFAULT_MAX_STEP = 160

const GOOGLE_HOST = /^https?:\/\/[\w.-]*\.(?:googleusercontent\.com|ggpht\.com)\//i
// Solo miniaturas SIN parámetros: las que llevan ?sqp=…&rs=… van firmadas y no admiten cambios.
// hqdefault/sddefault no sirven de destino: son 4:3 con franjas negras, que asomarían en un hueco cuadrado.
const YTIMG_UNSIGNED = /^(https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/[\w-]{11}\/)(?:hq720|maxresdefault|sddefault|hqdefault)(\.(?:jpg|webp))$/i

/** Densidad de píxeles de la pantalla, acotada a 1–2 (más allá no se aprecia y cuadruplica la memoria). 1 sin ventana (SSR, pruebas). */
export function deviceScale(ratio = globalThis.devicePixelRatio) {
  return Number.isFinite(ratio) && ratio > 1 ? Math.min(ratio, MAX_DEVICE_SCALE) : 1
}

/** Escalón más pequeño que cubre un hueco de `cssPx` píxeles CSS en esta pantalla. */
export function imageStep(cssPx, ratio) {
  const target = Math.ceil(cssPx * deviceScale(ratio))
  return IMAGE_STEPS.find((step) => step >= target) ?? IMAGE_STEPS.at(-1)
}

function resizeGoogle(url, step) {
  const box = /=w(\d+)-h(\d+)/.exec(url)
  if (!box) return url.replace(/=s\d+/, `=s${step}`)
  // Las no cuadradas (cabeceras, vídeos) conservan su proporción: el lado corto es el que llena el hueco.
  const width = Number(box[1])
  const height = Number(box[2])
  const short = Math.min(width, height)
  if (!short || width === height) return url.replace(box[0], `=w${step}-h${step}`)
  return url.replace(box[0], `=w${Math.round((width * step) / short)}-h${Math.round((height * step) / short)}`)
}

/**
 * URL de `url` adecuada para un hueco de `cssPx` píxeles CSS (su lado mayor). Reescribe el tamaño en los hosts de
 * Google (=wN-hN / =sN) y cambia las miniaturas de vídeo sin firmar por mqdefault cuando el hueco es pequeño.
 * Cualquier otra URL (firmada, local, de otro host, ya pasada por el proxy) y los valores no string vuelven intactos.
 */
export function sizedImage(url, cssPx, ratio) {
  if (typeof url !== 'string' || !(cssPx > 0)) return url
  const step = imageStep(cssPx, ratio)
  if (GOOGLE_HOST.test(url)) return resizeGoogle(url, step)
  if (step <= MQDEFAULT_MAX_STEP) return url.replace(YTIMG_UNSIGNED, '$1mqdefault$2')
  return url
}
