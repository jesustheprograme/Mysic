// GET /api/comments/:id?sort=top|new&page=N          comentarios de un vídeo, por páginas (MYSIC-LOCAL)
// GET /api/comments/:id/replies/:commentId?sort=…     respuestas de un comentario
import express from 'express';
import { asyncRoute, requireYoutube, validateParam, VIDEO_ID_RE } from '../utils/http.mjs';
import { getCommentsService } from '../youtube/comments.mjs';

const COMMENT_ID_RE = /^[A-Za-z0-9_.-]{6,128}$/;

export function createCommentsRouter({ service = getCommentsService() } = {}) {
  const router = express.Router();
  const sortOf = (req) => (req.query.sort === 'new' ? 'new' : 'top');

  router.get(
    '/:id',
    requireYoutube,
    validateParam('id', VIDEO_ID_RE, 'ID de vídeo no válido'),
    asyncRoute(async (req, res) => {
      res.setHeader('Cache-Control', 'private, max-age=120');
      res.json(await service.page(req.params.id, { sort: sortOf(req), page: Number(req.query.page) || 0 }));
    }, 'No se pudieron cargar los comentarios')
  );

  router.get(
    '/:id/replies/:commentId',
    requireYoutube,
    validateParam('id', VIDEO_ID_RE, 'ID de vídeo no válido'),
    validateParam('commentId', COMMENT_ID_RE, 'ID de comentario no válido'),
    asyncRoute(async (req, res) => {
      res.setHeader('Cache-Control', 'private, max-age=120');
      res.json(await service.replies(req.params.id, req.params.commentId, { sort: sortOf(req) }));
    }, 'No se pudieron cargar las respuestas')
  );

  return router;
}
