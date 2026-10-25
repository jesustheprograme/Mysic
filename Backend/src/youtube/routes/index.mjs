// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/routes/index.js
// Ensambla todas las rutas bajo /api.
import express from 'express';
import { config } from '../config.mjs';
import { createArtistImagesResolver } from '../services/artistImages.mjs';
import { collectChannelMedia, getArtistNameAndMedia } from '../youtube/artist.mjs';
import { invalidateStream, resolveAudioStream } from '../youtube/stream.mjs';
import { createAlbumRouter } from './album.mjs';
import { createArtistRouter } from './artist.mjs';
import { createBrowseRouter } from './browse.mjs';
import { createDownloadsRouter } from './downloads.mjs';
import { createHealthRouter } from './health.mjs';
import { createImagesRouter } from './images.mjs';
import { createSearchRouter } from './search.mjs';
import { createStreamRouter } from './stream.mjs';

export function createApiRouter() {
  const api = express.Router();

  // Agregador de fotos de artista, disponible bajo demanda y para cachés existentes.
  const getArtistImages = createArtistImagesResolver({
    cacheDir: config.artistImagesCacheDir,
    imageCacheDir: config.imageCacheDir,
    getYoutubeArtist: getArtistNameAndMedia,
    getChannelMedia: collectChannelMedia,
  });
  api.use('/health', createHealthRouter());
  api.use('/', createBrowseRouter());
  api.use('/', createSearchRouter()); // /search y /suggest
  api.use('/artist', createArtistRouter({ getArtistImages }));
  api.use('/album', createAlbumRouter());
  api.use('/stream', createStreamRouter());
  api.use('/downloads', createDownloadsRouter({ dir: config.downloadsDir, resolveAudioStream, invalidateStream }));
  api.use('/image', createImagesRouter({ dir: config.imageCacheDir }));

  api.use((req, res) => res.status(404).json({ error: 'Ruta de API no encontrada' }));
  return api;
}
