// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/routes/stream.js
// Proxy de audio con Range para seek desde <audio> y errores HTTP explícitos.
import express from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { VIDEO_ID_RE } from '../utils/http.mjs';
import { getYoutubeForUser } from '../youtube/accountLink.mjs';
import { getYoutube, isYoutubeReady } from '../youtube/client.mjs';
import {
  AudioStreamError,
  classifyStreamFailure,
  invalidateStream,
  peekStreamHead,
  prefetchStreamHead,
  resolveAudioStream,
} from '../youtube/stream.mjs';

async function requestYoutube(req) {
  return await getYoutubeForUser(req.mysicUser) ?? getYoutube();
}

function requestCacheScope(req) {
  return req.mysicUser?._id ? `user:${req.mysicUser._id}` : 'anonymous';
}

export function streamErrorResponse(error) {
  const failure = classifyStreamFailure(error);
  return {
    status: failure.status,
    body: {
      code: failure.code,
      message: failure.message,
    },
  };
}

export function applyAudioCors(req, res) {
  const origin = req.get?.('Origin');
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.append?.('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range, Content-Type');
}

export function applyAudioResponseHeaders(req, res, upstream, stream) {
  const clientAskedRange = Boolean(req.headers.range);
  res.status(clientAskedRange ? upstream.status : 200);
  res.setHeader('Content-Type', upstream.headers.get('content-type') || stream.mimeType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) res.setHeader('Content-Length', contentLength);
  const contentRange = upstream.headers.get('content-range');
  if (clientAskedRange && contentRange) res.setHeader('Content-Range', contentRange);
}

/**
 * Respuesta con el tramo inicial ya descargado, o null si no aplica. Solo para una petición abierta
 * desde el byte 0 ("bytes=0-", la que hace <audio> al empezar): el navegador pide después el resto
 * con otro Range. Nunca para un salto ni para una petición sin Range (esa espera el archivo entero).
 */
export function streamHeadResponse(rangeHeader, head) {
  if (!head || !/^bytes=0-$/.test(String(rangeHeader || '').trim())) return null;
  return {
    status: 206,
    headers: {
      'Content-Type': head.contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Content-Length': String(head.body.length),
      'Content-Range': `bytes 0-${head.body.length - 1}/${head.total}`,
    },
    body: head.body,
  };
}

function sendStreamError(res, error) {
  const response = streamErrorResponse(error);
  return res.status(response.status).json(response.body);
}

function requireStreamYoutube(_req, res, next) {
  if (!isYoutubeReady()) {
    return res.status(503).json({
      code: 'YOUTUBE_NOT_READY',
      message: 'La API todavía se está inicializando. Intenta de nuevo en unos segundos.',
    });
  }
  next();
}

function validStreamId(req, res, next) {
  if (!VIDEO_ID_RE.test(String(req.params.id || ''))) {
    return res.status(400).json({ code: 'INVALID_VIDEO_ID', message: 'ID de vídeo inválido' });
  }
  next();
}

export function createStreamRouter() {
  const router = express.Router();

  router.use((req, res, next) => {
    applyAudioCors(req, res);
    next();
  });

  router.get(
    '/:id/info',
    requireStreamYoutube,
    validStreamId,
    async (req, res) => {
      try {
        const youtube = await requestYoutube(req);
        const cacheScope = requestCacheScope(req);
        const stream = await resolveAudioStream(req.params.id, { youtube, cacheScope });
        const { mimeType, contentLength, client } = stream;
        res.json({ id: req.params.id, mimeType, contentLength, client });
        // Preparar una pista también descarga su primer tramo: el clic posterior empieza sin
        // esperar a abrir la conexión con el origen. Un fallo aquí no afecta a la reproducción.
        prefetchStreamHead(req.params.id, stream, { cacheScope }).catch((error) => {
          console.warn(`[stream] no se pudo preparar el inicio de ${req.params.id}: ${error.message}`);
        });
      } catch (error) {
        sendStreamError(res, error);
      }
    },
  );

  router.get('/:id', requireStreamYoutube, validStreamId, async (req, res) => {
    const { id } = req.params;
    const controller = new AbortController();
    const abort = () => controller.abort();
    req.once('aborted', abort);
    res.once('close', abort);

    let stream;
    let upstream;
    try {
      const youtube = await requestYoutube(req);
      const cacheScope = requestCacheScope(req);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        stream = await resolveAudioStream(id, { youtube, cacheScope });
        // Pista preparada: el primer tramo sale de memoria (solo si es de esta misma URL resuelta).
        const prepared = attempt === 0
          ? streamHeadResponse(req.headers.range, peekStreamHead(id, cacheScope, { url: stream.url }))
          : null;
        if (prepared) {
          req.off('aborted', abort);
          res.off('close', abort);
          res.status(prepared.status).set(prepared.headers);
          return res.end(prepared.body);
        }
        upstream = await fetch(stream.url, {
          headers: { Range: req.headers.range || 'bytes=0-' },
          signal: controller.signal,
        });
        if (upstream.status !== 403 && upstream.status !== 410) break;
        await upstream.body?.cancel();
        invalidateStream(id, cacheScope);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error(`[stream] fallo al preparar ${id}:`, error.message);
      return sendStreamError(res, error);
    }

    if (upstream.status === 403 || upstream.status === 410) {
      return sendStreamError(res, new AudioStreamError(
        'El origen rechazó la URL regenerada del audio.',
        { code: 'AUDIO_URL_REJECTED', status: 502 },
      ));
    }
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return sendStreamError(res, new AudioStreamError(
        `El origen del audio devolvió ${upstream.status}.`,
        { code: 'AUDIO_UPSTREAM_HTTP_ERROR', status: 502 },
      ));
    }

    applyAudioResponseHeaders(req, res, upstream, stream);

    if (!upstream.body) return res.end();
    try {
      await pipeline(Readable.fromWeb(upstream.body), res, { signal: controller.signal });
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error(`[stream] error en el flujo de ${id}:`, error.message);
        res.destroy(error);
      }
    } finally {
      req.off('aborted', abort);
      res.off('close', abort);
    }
  });

  return router;
}
