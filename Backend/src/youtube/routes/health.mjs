// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/routes/health.js
import express from 'express';
import { isYoutubeReady } from '../youtube/client.mjs';

export function createHealthRouter() {
  const router = express.Router();
  router.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, ready: isYoutubeReady(), online: isYoutubeReady() });
  });
  return router;
}
