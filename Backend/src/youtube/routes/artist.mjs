// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/routes/artist.js
// GET /api/artist/:id         página del artista (YouTube) con sus fotos
// GET /api/artist/:id/images  hasta 5 fotos distintas (YouTube + Discogs + Deezer)
// GET /api/artist/:id/songs   catálogo completo de canciones, bajo demanda
import express from 'express';
import { asyncRoute, BROWSE_ID_RE, requireYoutube, validateParam } from '../utils/http.mjs';
import { getArtistPage, getArtistReleases, getArtistSongs } from '../youtube/artist.mjs';

export function createArtistRouter({ getArtistImages }) {
  const router = express.Router();
  const validId = validateParam('id', BROWSE_ID_RE, 'ID de artista inválido');

  router.get(
    '/:id/images',
    requireYoutube,
    validId,
    asyncRoute(async (req, res) => {
      const { name, images } = await getArtistImages(req.params.id);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.json({ id: req.params.id, name, images });
    }, 'No se pudieron obtener las fotos del artista')
  );

  router.get(
    '/:id/releases',
    requireYoutube,
    validId,
    asyncRoute(async (req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800');
      res.json(await getArtistReleases(req.params.id));
    }, 'No se pudo completar la discografía del artista')
  );

  router.get(
    '/:id/songs',
    requireYoutube,
    validId,
    asyncRoute(async (req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800');
      res.json(await getArtistSongs(req.params.id));
    }, 'No se pudieron cargar todas las canciones del artista')
  );

  router.get(
    '/:id',
    requireYoutube,
    validId,
    asyncRoute(async (req, res) => {
      const { page, media } = await getArtistPage(req.params.id);

      // La cabecera de YouTube basta para pintar el perfil. El conjunto ampliado
      // de fotos solo bloquea la respuesta cuando ya estaba preparado en caché.
      const imagesReady = await getArtistImages.isReady(req.params.id);
      const aggregated = getArtistImages(req.params.id, { prefetched: { name: page.name, media } });
      aggregated.catch((error) => console.warn(`[artist] fotos de ${req.params.id}: ${error.message}`));
      const full = imagesReady ? await aggregated.catch(() => null) : null;

      if (full?.images?.length) {
        page.images = full.images;
        page.imagesComplete = true;
      }
      res.json(page);
    }, 'No se pudo cargar el artista')
  );

  return router;
}
