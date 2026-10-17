// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/routes/album.js
// GET /api/album/:id  cabecera y pistas del álbum
import express from 'express';
import { asyncRoute, BROWSE_ID_RE, requireYoutube, validateParam } from '../utils/http.mjs';
import { getAlbumPage } from '../youtube/album.mjs';

export function createAlbumRouter() {
  const router = express.Router();

  router.get(
    '/:id',
    requireYoutube,
    validateParam('id', BROWSE_ID_RE, 'ID de álbum inválido'),
    asyncRoute(async (req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
      res.json(await getAlbumPage(req.params.id));
    }, 'No se pudo cargar el álbum')
  );

  return router;
}
