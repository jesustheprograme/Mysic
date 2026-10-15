// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/routes/stream.js
// GET /api/stream/:id       proxy del audio con soporte de Range (seek en <audio>)
// GET /api/stream/:id/info  metadatos del stream sin descargarlo
import express from 'express';
import { Readable } from 'node:stream';
import { asyncRoute, requireYoutube, validateParam, VIDEO_ID_RE } from '../utils/http.mjs';
import { invalidateStream, resolveAudioStream } from '../youtube/stream.mjs';

export function createStreamRouter() {
  const router = express.Router();
  const validId = validateParam('id', VIDEO_ID_RE, 'ID de vídeo inválido');

  router.get(
    '/:id/info',
    requireYoutube,
    validId,
    asyncRoute(async (req, res) => {
      try {
        const { mimeType, contentLength, client } = await resolveAudioStream(req.params.id);
        res.json({ id: req.params.id, mimeType, contentLength, client });
      } catch (error) {
        res.status(502).json({ error: 'No se pudo obtener el audio', details: error.message });
      }
    })
  );

  router.get('/:id', requireYoutube, validId, async (req, res) => {
    const { id } = req.params;

    let stream;
    try {
      stream = await resolveAudioStream(id);
    } catch (error) {
      console.error(`[stream] error resolviendo ${id}:`, error.message);
      return res.status(502).json({ error: 'No se pudo obtener el audio', details: error.message });
    }

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    // googlevideo rechaza peticiones sin Range; pedimos siempre un rango.
    let upstream;
    try {
      upstream = await fetch(stream.url, {
        headers: { Range: req.headers.range || 'bytes=0-' },
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error(`[stream] fallo al conectar con googlevideo para ${id}:`, error.message);
      return res.status(502).json({ error: 'Fallo al conectar con el origen del audio' });
    }

    if (upstream.status === 403 || upstream.status === 410) {
      // La URL caducó o fue rechazada: se regenerará en la siguiente petición
      invalidateStream(id);
      await upstream.body?.cancel();
      return res.status(502).json({ error: 'La URL del audio caducó, vuelve a intentarlo' });
    }
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return res.status(upstream.status).json({ error: `El origen devolvió ${upstream.status}` });
    }

    // Si el cliente no pidió rango respondemos como descarga completa (200 sin Content-Range)
    const clientAskedRange = Boolean(req.headers.range);
    res.status(clientAskedRange ? upstream.status : 200);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || stream.mimeType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-store');
    // Permite cargarlo desde otro origen aunque haya helmet (p. ej. Mysic)
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    const contentRange = upstream.headers.get('content-range');
    if (clientAskedRange && contentRange) res.setHeader('Content-Range', contentRange);

    if (!upstream.body) return res.end();
    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.on('error', (error) => {
      if (!controller.signal.aborted) console.error(`[stream] error en el flujo de ${id}:`, error.message);
      res.destroy();
    });
    nodeStream.pipe(res);
  });

  return router;
}
