// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/services/artistImages.js
// Agrega imágenes de un artista desde varias fuentes gratuitas, descarta las
// visualmente repetidas (misma foto recortada o reescalada) y devuelve hasta
// MAX_IMAGES con su punto de interés para encuadrarlas, con caché en disco.
//  - YouTube: cabecera de YouTube Music, avatar del canal y fotogramas de sus
//    vídeos y actuaciones en directo (el banner del canal se descarta: 6:1).
//  - Discogs: fotos de la comunidad; el artista se localiza vía MusicBrainz para
//    no confundir homónimos, con búsqueda directa en Discogs como respaldo.
//  - Deezer: foto de perfil (1000x1000) si el nombre coincide exactamente.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { storeInImageCache } from '../routes/images.mjs';
import { SIMILARITY_THRESHOLD } from './imageSimilarity.mjs';
import { similarityInPool } from './similarityPool.mjs';

export const MAX_IMAGES = 5;
const CACHE_VERSION = 8;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_SIDE_PX = 400;
const MAX_ASPECT_RATIO = 3; // nada más apaisado que 3:1 en un panel vertical
const FETCH_TIMEOUT_MS = 7000;
const DOWNLOAD_CONCURRENCY = 6;
// Cuántas candidatas se comparan entre sí de golpe (matriz en paralelo); casi
// siempre basta para reunir MAX_IMAGES distintas
const PAIRWISE_BATCH = 10;
const USER_AGENT = 'Yotubei/1.0 (+https://github.com/jesustheprograme)';
// La cabecera de YouTube Music y el avatar del canal casi siempre son la misma
// foto con un recorte muy distinto: entre ellos basta con un parecido menor.
const SAME_CHANNEL_THRESHOLD = 0.82;
// Agregaciones simultáneas: las pedidas por el usuario tienen prioridad; los
// precalentamientos van de uno en uno y solo cuando no hay nadie esperando.
const MAX_USER_JOBS = 2;
const MAX_WARM_JOBS = 1;

const normalizeName = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/\s*\(\d+\)$/, '') // Discogs distingue homónimos como "Ado (18)"
    .replace(/\s+/g, ' ')
    .trim();

async function getJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${new URL(url).hostname} respondió ${res.status}`);
  return res.json();
}

/* ---------- MusicBrainz: nombre -> ID de Discogs ---------- */
async function findDiscogsIdViaMusicBrainz(name) {
  const query = encodeURIComponent(`artist:"${name.replace(/"/g, '')}"`);
  const search = await getJson(`https://musicbrainz.org/ws/2/artist/?query=${query}&fmt=json&limit=5`);
  const wanted = normalizeName(name);
  const match = (search.artists || []).find((a) => normalizeName(a.name) === wanted) || search.artists?.[0];
  if (!match || match.score < 80) return null;

  const artist = await getJson(`https://musicbrainz.org/ws/2/artist/${match.id}?inc=url-rels&fmt=json`);
  const discogs = (artist.relations || []).find((r) => r.type === 'discogs' && /\/artist\/(\d+)/.test(r.url?.resource || ''));
  return discogs ? discogs.url.resource.match(/\/artist\/(\d+)/)[1] : null;
}

/* ---------- Discogs ---------- */
async function findDiscogsIdBySearch(name) {
  const data = await getJson(
    `https://api.discogs.com/database/search?q=${encodeURIComponent(name)}&type=artist&per_page=10`
  );
  const wanted = normalizeName(name);
  const match = (data.results || []).find((r) => normalizeName(r.title) === wanted);
  return match ? String(match.id) : null;
}

async function discogsImages(name) {
  // MusicBrainz (fiable con homónimos) y la búsqueda directa de Discogs en paralelo;
  // se prefiere MusicBrainz si responde.
  const [viaMb, viaSearch] = await Promise.allSettled([findDiscogsIdViaMusicBrainz(name), findDiscogsIdBySearch(name)]);
  if (viaMb.status === 'rejected') console.warn(`[artist-images] MusicBrainz falló para "${name}": ${viaMb.reason?.message}`);
  const discogsId = (viaMb.status === 'fulfilled' && viaMb.value) || (viaSearch.status === 'fulfilled' && viaSearch.value) || null;
  if (!discogsId) return [];

  const artist = await getJson(`https://api.discogs.com/artists/${discogsId}`);
  return (artist.images || [])
    .filter((img) => img.uri && Math.min(img.width || 0, img.height || 0) >= MIN_SIDE_PX)
    .sort((a, b) => (b.type === 'primary') - (a.type === 'primary') || b.width * b.height - a.width * a.height)
    .map((img) => ({ url: img.uri, source: 'discogs', kind: 'photo' }));
}

/* ---------- Deezer ---------- */
async function deezerImage(name) {
  const data = await getJson(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=10`);
  const wanted = normalizeName(name);
  const exact = (data.data || [])
    .filter((a) => normalizeName(a.name) === wanted && a.picture_xl)
    .sort((a, b) => (b.nb_fan || 0) - (a.nb_fan || 0))[0];
  // Deezer devuelve un marcador genérico cuando no hay foto
  if (!exact || /artist\/\/\d+x\d+/.test(exact.picture_xl)) return [];
  return [{ url: exact.picture_xl, source: 'deezer', kind: 'photo' }];
}

/* ---------- Descarga ---------- */
async function download(candidate) {
  const res = await fetch(candidate.url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`imagen ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const { width, height } = await sharp(buffer).metadata();
  if (!width || !height) throw new Error('imagen sin dimensiones');
  if (Math.max(width / height, height / width) > MAX_ASPECT_RATIO) throw new Error('demasiado apaisada');
  return { ...candidate, buffer, width, height, contentType: res.headers.get('content-type') || '' };
}

/* ---------- Planificador: limita agregaciones simultáneas ---------- */
function createScheduler() {
  let userRunning = 0;
  let warmRunning = 0;
  const queue = []; // { priority, start }

  const pump = () => {
    // Primero los del usuario; los precalentamientos solo si no hay usuarios en cola ni corriendo
    const userIndex = queue.findIndex((j) => j.priority === 'user');
    if (userIndex >= 0 && userRunning < MAX_USER_JOBS) {
      userRunning += 1;
      queue.splice(userIndex, 1)[0].start();
      return pump();
    }
    const warmIndex = queue.findIndex((j) => j.priority === 'warm');
    if (warmIndex >= 0 && userIndex < 0 && userRunning === 0 && warmRunning < MAX_WARM_JOBS) {
      warmRunning += 1;
      queue.splice(warmIndex, 1)[0].start();
      return pump();
    }
  };

  return function schedule(priority, task) {
    return new Promise((resolve, reject) => {
      queue.push({
        priority,
        start: () =>
          task()
            .then(resolve, reject)
            .finally(() => {
              if (priority === 'user') userRunning -= 1;
              else warmRunning -= 1;
              pump();
            }),
      });
      pump();
    });
  };
}

/** Descarga todas las candidatas en paralelo (con límite) y devuelve solo las válidas, en orden. */
async function downloadAll(candidates, name) {
  const results = new Array(candidates.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < candidates.length) {
      const i = next;
      next += 1;
      try {
        results[i] = await download(candidates[i]);
      } catch (error) {
        console.warn(`[artist-images] descartada ${candidates[i].source}/${candidates[i].kind} para "${name}": ${error.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, candidates.length) }, worker));
  return results.filter(Boolean);
}

/* ---------- Comparación ---------- */
function thresholdFor(a, b) {
  const kinds = new Set([a.kind, b.kind]);
  const sameChannel = a.source === 'youtube' && b.source === 'youtube' && kinds.has('header') && kinds.has('avatar');
  return sameChannel ? SAME_CHANNEL_THRESHOLD : SIMILARITY_THRESHOLD;
}

/**
 * Elige hasta MAX_IMAGES imágenes distintas. Las primeras PAIRWISE_BATCH se
 * comparan todas entre sí en paralelo (pool de hilos); si no bastan, las
 * siguientes se comparan una a una contra las ya procesadas.
 * Se compara contra TODAS las procesadas (no solo las conservadas): un recorte
 * muy cerrado puede parecerse a otro recorte descartado y no al original.
 */
async function pickDistinct(images) {
  const scores = new Map();
  const key = (i, j) => (i < j ? `${i}-${j}` : `${j}-${i}`);
  const score = async (i, j) => {
    const k = key(i, j);
    if (!scores.has(k)) scores.set(k, similarityInPool(images[i].buffer, images[j].buffer).catch(() => 0));
    return scores.get(k);
  };

  // Matriz del primer lote, toda en paralelo
  const batch = Math.min(PAIRWISE_BATCH, images.length);
  const jobs = [];
  for (let i = 0; i < batch; i += 1) for (let j = i + 1; j < batch; j += 1) jobs.push(score(i, j));
  await Promise.all(jobs);

  const kept = [];
  const processed = [];
  for (let i = 0; i < images.length && kept.length < MAX_IMAGES; i += 1) {
    let duplicate = false;
    for (const j of processed) {
      if ((await score(i, j)) >= thresholdFor(images[i], images[j])) {
        duplicate = true;
        break;
      }
    }
    processed.push(i);
    if (!duplicate) kept.push(images[i]);
  }
  return kept;
}

/* ---------- Punto de interés ---------- */
/**
 * Punto de interés de la imagen (porcentajes) según la estrategia "attention"
 * de sharp, para que el panel vertical encuadre la zona importante (la cara).
 */
async function focusPoint(image) {
  try {
    const { info } = await sharp(image.buffer)
      .resize(300, 400, { fit: 'cover', position: sharp.strategy.attention })
      .toBuffer({ resolveWithObject: true });
    if (info.attentionX === undefined) return null;
    const x = Math.round((info.attentionX / image.width) * 100);
    const y = Math.round((info.attentionY / image.height) * 100);
    // Un punto en el borde (0 o 100) significa que no se encontró zona de interés: centrar
    const reliable = x > 0 && x < 100 && y > 0 && y < 100;
    return { x: reliable ? x : 50, y: reliable ? y : 35 };
  } catch {
    return null;
  }
}

/* ---------- Agregación ---------- */
export function createArtistImagesResolver({ cacheDir, imageCacheDir, getYoutubeArtist, getChannelMedia }) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const memory = new Map();
  const inflight = new Map();
  const schedule = createScheduler();

  const cacheFile = (id) => path.join(cacheDir, `${id}.json`);

  async function readCache(id) {
    const cached = memory.get(id);
    if (cached && cached.fetchedAt + CACHE_TTL_MS > Date.now()) return cached;
    try {
      const saved = JSON.parse(await fsp.readFile(cacheFile(id), 'utf8'));
      if (saved.version === CACHE_VERSION && saved.fetchedAt + CACHE_TTL_MS > Date.now()) {
        memory.set(id, saved);
        return saved;
      }
    } catch {
      /* sin caché */
    }
    return null;
  }

  async function writeCache(id, entry) {
    memory.set(id, entry);
    try {
      await fsp.writeFile(cacheFile(id), JSON.stringify(entry));
    } catch (error) {
      console.warn(`[artist-images] no se pudo guardar la caché de ${id}: ${error.message}`);
    }
  }

  async function resolve(id, prefetched) {
    const t0 = Date.now();
    const { name, media: pageMedia } = prefetched || (await getYoutubeArtist(id));
    // El avatar del canal (una llamada extra) se pide aquí, en paralelo con las demás fuentes,
    // para que la página del artista no tenga que esperarlo.
    const [channel, discogs, deezer] = await Promise.allSettled([
      pageMedia.avatar !== undefined ? pageMedia : getChannelMedia(id),
      discogsImages(name),
      deezerImage(name),
    ]);
    const media = { ...pageMedia, ...(channel.status === 'fulfilled' ? channel.value : {}) };
    const tSources = Date.now();
    for (const [label, result] of [['Discogs', discogs], ['Deezer', deezer]]) {
      if (result.status === 'rejected') console.warn(`[artist-images] ${label} falló para "${name}": ${result.reason?.message}`);
    }
    const photos = discogs.status === 'fulfilled' ? discogs.value : [];
    const deezerList = deezer.status === 'fulfilled' ? deezer.value : [];
    const videos = media.videos.map((url) => ({ url, source: 'youtube', kind: 'video' }));

    // Candidatos alternando fuentes para favorecer la variedad. El banner del canal no entra.
    const seenUrls = new Set();
    const candidates = [
      media.header && { url: media.header, source: 'youtube', kind: 'header' },
      photos[0],
      deezerList[0],
      videos[0],
      photos[1],
      media.avatar && { url: media.avatar, source: 'youtube', kind: 'avatar' },
      videos[1],
      photos[2],
      videos[2],
      ...photos.slice(3),
      ...videos.slice(3),
    ].filter((c) => {
      if (!c) return false;
      const key = c.url.split('?')[0].split('=')[0];
      if (seenUrls.has(key)) return false;
      seenUrls.add(key);
      return true;
    });

    const downloaded = await downloadAll(candidates, name);
    const tDownload = Date.now();
    const kept = await pickDistinct(downloaded);
    const tCompare = Date.now();

    const images = [];
    for (const { buffer, contentType, ...img } of kept) {
      images.push({ ...img, focus: await focusPoint({ buffer, ...img }) });
      // Deja la imagen lista en la caché del proxy: el navegador no tendrá que volver a bajarla
      if (imageCacheDir) {
        storeInImageCache(imageCacheDir, img.url, buffer, contentType).catch(() => {});
      }
    }

    const entry = { version: CACHE_VERSION, id, name, images, fetchedAt: Date.now() };
    await writeCache(id, entry);
    console.log(
      `[artist-images] "${name}": ${images.length} imágenes de ${candidates.length} candidatas en ${Date.now() - t0} ms ` +
        `(fuentes ${tSources - t0}, descarga ${tDownload - tSources}, comparación ${tCompare - tDownload}, foco ${Date.now() - tCompare})`
    );
    return entry;
  }

  /**
   * @param {string} id
   * @param {object} [options]
   * @param {{ name: string, media: object }} [options.prefetched] datos de YouTube ya obtenidos
   *   (evita repetir las llamadas cuando se acaba de cargar la página del artista)
   * @param {'user'|'warm'} [options.priority] 'warm' para precalentar en segundo plano
   */
  async function getArtistImages(id, { prefetched, priority = 'user' } = {}) {
    const cached = await readCache(id);
    if (cached) return cached;
    if (!inflight.has(id)) {
      inflight.set(id, schedule(priority, () => resolve(id, prefetched)).finally(() => inflight.delete(id)));
    }
    return inflight.get(id);
  }

  /** ¿Ya están listas (en caché) las fotos de este artista? */
  getArtistImages.isReady = async (id) => Boolean(await readCache(id));

  return getArtistImages;
}
