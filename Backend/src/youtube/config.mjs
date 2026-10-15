// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/config.js
// Configuración central: puertos, carpetas de datos y tiempos de caché.
// Todo se puede sobrescribir con variables de entorno.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.YOUTUBE_DATA_DIR || path.join(backendRoot, '..', 'data', 'youtube');

export const config = {
  port: Number(process.env.PORT) || 5000,

  // Carpetas en disco (todas bajo data/, ignorada por git)
  dataDir,
  downloadsDir: path.join(dataDir, 'downloads'),
  imageCacheDir: path.join(dataDir, 'cache', 'images'),
  artistImagesCacheDir: path.join(dataDir, 'cache', 'artist-images'),

  // Reintento de conexión con YouTube cuando no hay internet
  youtubeRetryMs: 30 * 1000,

  // Cachés en memoria
  streamCacheTtlMs: 30 * 60 * 1000,
  suggestCacheTtlMs: 5 * 60 * 1000,
  suggestCacheMax: 500,
};
