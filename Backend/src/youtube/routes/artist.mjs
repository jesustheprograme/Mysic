// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/routes/artist.js
// GET /api/artist/:id         página del artista (YouTube) con sus fotos
// GET /api/artist/:id/images  hasta 5 fotos distintas (YouTube + Discogs + Deezer)
import express from 'express';
import { asyncRoute, BROWSE_ID_RE, requireYoutube, validateParam } from '../utils/http.mjs';
import { getArtistPage } from '../youtube/artist.mjs';

// La página del artista responde enseguida. Solo espera al conjunto completo de
// fotos este tiempo (suficiente si ya está en caché o a punto de terminar); si
// no, responde con la cabecera y el frontend recibe el resto en segundo plano.
const IMAGES_WAIT_MS = 300;

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
    '/:id',
    requireYoutube,
    validId,
    asyncRoute(async (req, res) => {
      const { page, media } = await getArtistPage(req.params.id);

      // Lanza el agregador ya (reutilizando los datos de YouTube) y espera un poco
      const aggregated = getArtistImages(req.params.id, { prefetched: { name: page.name, media } });
      aggregated.catch((error) => console.warn(`[artist] fotos de ${req.params.id}: ${error.message}`));
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), IMAGES_WAIT_MS).unref());
      const full = await Promise.race([aggregated.catch(() => null), timeout]);

      const responsePage = full?.images?.length
        ? { ...page, images: full.images, imagesComplete: true }
        : page;
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
      res.json(responsePage);
    }, 'No se pudo cargar el artista')
  );

  return router;
}
