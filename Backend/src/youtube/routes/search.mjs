// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/routes/search.js
// GET /api/search?q=&type=all|song|artist|album  y  GET /api/suggest?q=
import express from 'express';
import { asyncRoute, requireYoutube } from '../utils/http.mjs';
import { getSuggestions, SEARCH_TYPES, searchMusic } from '../youtube/search.mjs';

export function createSearchRouter({ warmArtistImages } = {}) {
  const router = express.Router();

  router.get(
    '/search',
    requireYoutube,
    asyncRoute(async (req, res) => {
      const text = String(req.query.q || '').trim();
      const type = SEARCH_TYPES.has(req.query.type) ? req.query.type : 'song';
      if (!text) return res.status(400).json({ error: 'Falta el parámetro de búsqueda "q"' });
      const results = await searchMusic(text, type);
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=240');
      res.json(results);

      // Precalienta en segundo plano (baja prioridad) las fotos del artista principal,
      // que es el que más probablemente se abra a continuación.
      if (warmArtistImages && results.type === 'all' && results.top?.kind === 'artist') {
        warmArtistImages(results.top.id);
      }
    }, 'Error al buscar música')
  );

  router.get(
    '/suggest',
    requireYoutube,
    asyncRoute(async (req, res) => {
      const q = String(req.query.q || '').trim();
      if (!q) return res.json({ texts: [], entities: [] });
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=240');
      res.json(await getSuggestions(q));
    }, 'No se pudieron obtener sugerencias')
  );

  return router;
}
