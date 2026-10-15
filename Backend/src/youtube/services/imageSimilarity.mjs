// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/services/imageSimilarity.js
// Detecta si dos imágenes muestran la misma foto/ilustración aunque una sea un
// recorte, un reescalado o un encuadre parcialmente solapado de la otra (p. ej.
// el avatar de un canal recortado de la cabecera). Método: correlación cruzada
// normalizada en escala de grises a varias escalas, permitiendo que la plantilla
// sobresalga de la imagen base (solapamiento parcial).
import sharp from 'sharp';

const BASE_SIDE = 512; // la imagen se decodifica UNA vez a este tamaño; todo lo demás sale de aquí
const BIG_SIDE = 112; // la imagen base de la comparación se reduce a este lado máximo
const MIN_TEMPLATE_SIDE = 32; // por debajo de este tamaño la plantilla no es fiable
// Escalas relativas al encaje de la plantilla en la base; las mayores que 1
// cubren recortes muy cerrados (p. ej. un avatar sacado de una cabecera panorámica).
// Se prueban primero las gruesas y solo se afinan las vecinas de la mejor.
const COARSE_SCALES = [2.4, 1.7, 1.25, 1, 0.78, 0.6, 0.46];
const FINE_SCALES = [2.0, 1.45, 1.1, 0.92, 0.85, 0.72, 0.66, 0.55, 0.5, 0.42];
const REFINE_IF_ABOVE = 0.6; // solo merece la pena afinar escalas cuando ya hay parecido
const MIN_OVERLAP = 0.4; // fracción mínima de la plantilla que debe quedar dentro (por eje)
const MIN_STD = 10; // regiones casi planas (fondos lisos) se ignoran
export const SIMILARITY_THRESHOLD = 0.9;

// Reescala un mapa de grises en crudo (sin decodificar JPEG de nuevo)
async function resizeGray(base, width, height) {
  // Un ligero desenfoque hace la comparación tolerante a desfases de 1-2 px
  const { data, info } = await sharp(base.data, { raw: { width: base.w, height: base.h, channels: 1 } })
    .resize(width, height, { fit: 'fill' })
    .blur(0.8)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** Prepara una imagen para compararla: decodifica una vez a gris y guarda una versión reducida. */
export async function prepareImage(buffer) {
  const { data, info } = await sharp(buffer)
    .grayscale()
    .resize(BASE_SIDE, BASE_SIDE, { fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const base = { data, w: info.width, h: info.height };
  const scale = Math.min(1, BIG_SIDE / Math.max(base.w, base.h));
  const gray = await resizeGray(base, Math.max(1, Math.round(base.w * scale)), Math.max(1, Math.round(base.h * scale)));
  // Caché de plantillas por tamaño: la misma imagen se compara con varias otras
  return { base, gray, templates: new Map() };
}

async function templateFor(image, w, h) {
  const key = `${w}x${h}`;
  let template = image.templates.get(key);
  if (!template) {
    template = await resizeGray(image.base, w, h);
    image.templates.set(key, template);
  }
  return template;
}

// Correlación normalizada entre la región común de `big` (desplazada ox, oy) y `tpl`
function overlapCorrelation(big, tpl, ox, oy) {
  const x0 = Math.max(0, ox);
  const y0 = Math.max(0, oy);
  const x1 = Math.min(big.w, ox + tpl.w);
  const y1 = Math.min(big.h, oy + tpl.h);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return 0;

  let sb = 0;
  let sbb = 0;
  let st = 0;
  let stt = 0;
  let sbt = 0;
  for (let y = y0; y < y1; y += 1) {
    const bRow = y * big.w;
    const tRow = (y - oy) * tpl.w - ox;
    for (let x = x0; x < x1; x += 1) {
      const b = big.data[bRow + x];
      const t = tpl.data[tRow + x];
      sb += b;
      sbb += b * b;
      st += t;
      stt += t * t;
      sbt += b * t;
    }
  }
  const n = w * h;
  const mb = sb / n;
  const mt = st / n;
  const stdB = Math.sqrt(Math.max(sbb / n - mb * mb, 0));
  const stdT = Math.sqrt(Math.max(stt / n - mt * mt, 0));
  if (stdB < MIN_STD || stdT < MIN_STD) return 0;
  return (sbt / n - mb * mt) / (stdB * stdT);
}

/**
 * Mejor correlación de `tpl` sobre `big` permitiendo solapamiento parcial.
 * Búsqueda gruesa en rejilla y después refinado píxel a píxel alrededor del
 * mejor punto (el dibujo de líneas es sensible a desfases de pocos píxeles).
 */
function bestCorrelation(big, tpl) {
  const step = Math.max(2, Math.floor(Math.min(tpl.w, tpl.h) / 9));
  const minX = -Math.floor(tpl.w * (1 - MIN_OVERLAP));
  const minY = -Math.floor(tpl.h * (1 - MIN_OVERLAP));
  const maxX = big.w - Math.ceil(tpl.w * MIN_OVERLAP);
  const maxY = big.h - Math.ceil(tpl.h * MIN_OVERLAP);

  let best = 0;
  let bestX = 0;
  let bestY = 0;
  for (let oy = minY; oy <= maxY; oy += step) {
    for (let ox = minX; ox <= maxX; ox += step) {
      const corr = overlapCorrelation(big, tpl, ox, oy);
      if (corr > best) {
        best = corr;
        bestX = ox;
        bestY = oy;
      }
    }
  }
  for (let oy = Math.max(minY, bestY - step); oy <= Math.min(maxY, bestY + step); oy += 1) {
    for (let ox = Math.max(minX, bestX - step); ox <= Math.min(maxX, bestX + step); ox += 1) {
      const corr = overlapCorrelation(big, tpl, ox, oy);
      if (corr > best) best = corr;
    }
  }
  return best;
}

async function matchAtScale(big, small, s) {
  const ratio = s * Math.min(big.gray.w / small.gray.w, big.gray.h / small.gray.h);
  const w = Math.round(small.gray.w * ratio);
  const h = Math.round(small.gray.h * ratio);
  if (Math.min(w, h) < MIN_TEMPLATE_SIDE) return 0;
  if (w > big.gray.w * 2.5 || h > big.gray.h * 2.5) return 0;
  return bestCorrelation(big.gray, await templateFor(small, w, h));
}

/** Mejor correlación buscando `small` dentro de `big`: escalas gruesas y después las vecinas de la mejor. */
async function match(big, small) {
  let best = 0;
  let bestScale = 1;
  for (const s of COARSE_SCALES) {
    const corr = await matchAtScale(big, small, s);
    if (corr > best) {
      best = corr;
      bestScale = s;
    }
    if (best >= SIMILARITY_THRESHOLD) return best;
  }
  if (best < REFINE_IF_ABOVE) return best;
  // Afinar solo con las escalas finas cercanas a la mejor gruesa
  const fine = FINE_SCALES.filter((s) => s > bestScale / 1.5 && s < bestScale * 1.5);
  for (const s of fine) {
    best = Math.max(best, await matchAtScale(big, small, s));
    if (best >= SIMILARITY_THRESHOLD) break;
  }
  return best;
}

/** Puntuación de similitud entre dos imágenes preparadas (0..1). */
export async function similarity(a, b) {
  const ab = await match(a, b);
  if (ab >= SIMILARITY_THRESHOLD) return ab;
  return Math.max(ab, await match(b, a));
}

export async function looksSame(a, b) {
  return (await similarity(a, b)) >= SIMILARITY_THRESHOLD;
}
