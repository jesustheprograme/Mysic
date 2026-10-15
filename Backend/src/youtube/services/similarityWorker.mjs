// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/services/similarityWorker.js
// Hilo de trabajo: recibe dos imágenes (bytes) y devuelve su similitud visual.
// Se ejecuta en paralelo en varios núcleos a través de similarityPool.js.
import { createHash } from 'node:crypto';
import { parentPort } from 'node:worker_threads';
import sharp from 'sharp';
import { prepareImage, similarity } from './imageSimilarity.mjs';

// Cada hilo ya es un núcleo: evitamos que libvips abra más hilos dentro
sharp.concurrency(1);

// La misma imagen participa en muchos pares: se prepara una sola vez por hilo
// (y conserva su caché de plantillas por tamaño).
const PREPARED_CACHE_MAX = 40;
const prepared = new Map();

async function getPrepared(bytes) {
  const buffer = Buffer.from(bytes);
  const key = `${buffer.length}:${createHash('md5').update(buffer).digest('hex')}`;
  let image = prepared.get(key);
  if (!image) {
    image = await prepareImage(buffer);
    prepared.set(key, image);
    if (prepared.size > PREPARED_CACHE_MAX) prepared.delete(prepared.keys().next().value);
  }
  return image;
}

parentPort.on('message', async ({ jobId, a, b }) => {
  try {
    const [pa, pb] = await Promise.all([getPrepared(a), getPrepared(b)]);
    parentPort.postMessage({ jobId, score: await similarity(pa, pb) });
  } catch (error) {
    parentPort.postMessage({ jobId, error: error.message });
  }
});
