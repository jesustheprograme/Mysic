// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/youtube/stream.js
// Resuelve la URL directa del mejor formato de solo audio de un vídeo.
//
// Sin PO token YouTube corta cualquier stream a ~1 MB con un 403. La primera
// estrategia usa YTMUSIC con un token ligado al vídeo; IOS queda de respaldo.
import { config } from '../config.mjs';
import { createAsyncTtlCache } from '../utils/asyncCache.mjs';
import { getYoutube } from './client.mjs';
import { mintPoToken } from './potoken.mjs';

const STREAM_STRATEGIES = [
  { client: 'YTMUSIC', usePoToken: true },
  { client: 'IOS', usePoToken: false },
];
const DEFAULT_RESOLVE_TIMEOUT_MS = 15_000;

const streamCache = createAsyncTtlCache({ ttlMs: config.streamCacheTtlMs, maxSize: config.streamCacheMax });

export class AudioStreamError extends Error {
  constructor(message, { code = 'AUDIO_UPSTREAM_ERROR', status = 502, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'AudioStreamError';
    this.code = code;
    this.status = status;
  }
}

function streamCacheKey(videoId, cacheScope) {
  return `${cacheScope}:${videoId}`;
}

export function invalidateStream(videoId, cacheScope = 'anonymous') {
  streamCache.delete(streamCacheKey(videoId, cacheScope));
  headCache.delete(streamCacheKey(videoId, cacheScope));
}

// Primer tramo del audio ya descargado, por usuario y vídeo.
//
// Abrir la conexión con el origen del audio cuesta entre 0,5 y 0,9 s por canción aunque la URL ya
// esté resuelta. Al preparar una pista (/stream/:id/info) se descarga su primer tramo y, cuando el
// reproductor la pide desde el byte 0, ese tramo sale de memoria al instante; el resto sigue por el
// proxy normal mientras ya suena. Acotado en tamaño, cantidad y tiempo.
export const STREAM_HEAD_BYTES = 256 * 1024;
export const STREAM_HEAD_TTL_MS = 3 * 60 * 1000;
export const STREAM_HEAD_MAX = 16;
const STREAM_HEAD_TIMEOUT_MS = 10_000;
const headCache = new Map();
const headPending = new Map();

/** Tramo inicial guardado y vigente, o null. Solo sirve para la misma URL resuelta (mismo formato). */
export function peekStreamHead(videoId, cacheScope = 'anonymous', { now = Date.now, url } = {}) {
  const key = streamCacheKey(videoId, cacheScope);
  const entry = headCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now()) {
    headCache.delete(key);
    return null;
  }
  return url === undefined || entry.url === url ? entry : null;
}

/** Descarga y guarda el primer tramo de un stream ya resuelto. Las llamadas simultáneas comparten la descarga. */
export function prefetchStreamHead(videoId, stream, options = {}) {
  const cacheScope = options.cacheScope || 'anonymous';
  const fetchImpl = options.fetchImpl || fetch;
  const headBytes = options.headBytes || STREAM_HEAD_BYTES;
  const now = options.now || Date.now;
  const key = streamCacheKey(videoId, cacheScope);
  const cached = peekStreamHead(videoId, cacheScope, { now, url: stream.url });
  if (cached) return Promise.resolve(cached);
  if (headPending.has(key)) return headPending.get(key);

  const request = (async () => {
    const response = await fetchImpl(stream.url, {
      headers: { Range: `bytes=0-${headBytes - 1}` },
      signal: AbortSignal.timeout(STREAM_HEAD_TIMEOUT_MS),
    });
    if (response.status !== 206) {
      await response.body?.cancel();
      throw new AudioStreamError(`El origen no entregó el tramo inicial (${response.status}).`, { code: 'AUDIO_HEAD_UNAVAILABLE' });
    }
    const body = Buffer.from(await response.arrayBuffer());
    const total = Number(/\/(\d+)\s*$/.exec(response.headers.get('content-range') || '')?.[1]);
    if (!body.length || !Number.isSafeInteger(total) || total < body.length) {
      throw new AudioStreamError('El tramo inicial del audio no es válido.', { code: 'AUDIO_HEAD_UNAVAILABLE' });
    }
    const entry = {
      body,
      total,
      url: stream.url,
      contentType: response.headers.get('content-type') || stream.mimeType,
      expiresAt: now() + (options.ttlMs || STREAM_HEAD_TTL_MS),
    };
    headCache.delete(key);
    headCache.set(key, entry);
    while (headCache.size > (options.maxSize || STREAM_HEAD_MAX)) headCache.delete(headCache.keys().next().value);
    return entry;
  })().finally(() => {
    if (headPending.get(key) === request) headPending.delete(key);
  });
  headPending.set(key, request);
  return request;
}

function playabilityText(info) {
  const status = info?.playability_status || {};
  return [status.status, status.reason, status.subreason].filter(Boolean).join(' ');
}

export function classifyStreamFailure(value) {
  if (value instanceof AudioStreamError) return value;
  const message = typeof value === 'string' ? value : value?.message || '';
  if (/private|deleted|removed|video unavailable|unplayable|not available/i.test(message)) {
    return new AudioStreamError(
      'El vídeo es privado, fue borrado o ya no está disponible.',
      { code: 'VIDEO_UNAVAILABLE', status: 404, cause: value instanceof Error ? value : undefined },
    );
  }
  if (/age|age_check_required|content warning/i.test(message)) {
    return new AudioStreamError(
      'El vídeo requiere verificación de edad en la cuenta de YouTube.',
      { code: 'AGE_RESTRICTED', status: 403, cause: value instanceof Error ? value : undefined },
    );
  }
  if (/confirm.+not.+bot|sign in to confirm|login_required/i.test(message)) {
    return new AudioStreamError(
      'YouTube exige una sesión verificada. Conecta YouTube Music en Mysic Global.',
      { code: 'YOUTUBE_SESSION_REQUIRED', status: 401, cause: value instanceof Error ? value : undefined },
    );
  }
  return new AudioStreamError(message || 'No se encontró ningún stream de audio', {
    cause: value instanceof Error ? value : undefined,
  });
}

function terminalFailureFromInfo(info) {
  const status = info?.playability_status?.status;
  if (!status || status === 'OK') return null;
  const text = playabilityText(info) || `Reproducción no disponible (${status})`;
  const classified = classifyStreamFailure(text);
  if (classified.code !== 'AUDIO_UPSTREAM_ERROR') return classified;
  if (['UNPLAYABLE', 'ERROR'].includes(status)) {
    return new AudioStreamError('El vídeo no está disponible para reproducirse.', {
      code: 'VIDEO_UNAVAILABLE',
      status: 404,
    });
  }
  return new AudioStreamError(text);
}

async function withTimeout(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new AudioStreamError(
          'YouTube tardó demasiado en resolver el audio.',
          { code: 'YOUTUBE_TIMEOUT', status: 504 },
        )), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveAudioStream(videoId, options = {}) {
  const cacheScope = options.cacheScope || 'anonymous';
  const youtube = options.youtube || getYoutube();
  const mintToken = options.mintToken || mintPoToken;
  const timeoutMs = options.timeoutMs || DEFAULT_RESOLVE_TIMEOUT_MS;
  return streamCache.get(
    streamCacheKey(videoId, cacheScope),
    () => loadAudioStream(videoId, youtube, mintToken, { timeoutMs }),
  );
}

export async function loadAudioStream(videoId, youtube, mintToken = mintPoToken, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_RESOLVE_TIMEOUT_MS;
  let lastError = null;
  for (const { client, usePoToken } of STREAM_STRATEGIES) {
    try {
      const poToken = usePoToken ? await withTimeout(mintToken(videoId), timeoutMs) : null;
      const info = await withTimeout(
        youtube.getBasicInfo(videoId, poToken ? { client, po_token: poToken } : { client }),
        timeoutMs,
      );
      const playabilityError = terminalFailureFromInfo(info);
      if (playabilityError) throw playabilityError;

      let format;
      try {
        format = info.chooseFormat({ type: 'audio', quality: 'best' });
      } catch (error) {
        if (info.streaming_data?.hls_manifest_url || info.streaming_data?.hlsManifestUrl) {
          throw new AudioStreamError(
            'Este directo solo ofrece HLS y el proxy de audio no puede reproducirlo.',
            { code: 'LIVE_HLS_UNSUPPORTED', status: 422, cause: error },
          );
        }
        throw error;
      }
      let url = await withTimeout(format.decipher(youtube.session.player), timeoutMs);
      if (!url) throw new Error('No se pudo descifrar la URL del audio');
      if (poToken) url += `&pot=${encodeURIComponent(poToken)}`;

      return {
        url,
        mimeType: format.mime_type || 'audio/mp4',
        contentLength: format.content_length || null,
        client,
      };
    } catch (error) {
      const classified = classifyStreamFailure(error);
      lastError = classified;
      console.warn(`[stream] cliente ${client} falló para ${videoId}: ${classified.message}`);
      if (classified.status !== 502) throw classified;
    }
  }
  throw lastError || new AudioStreamError('No se encontró ningún stream de audio');
}
