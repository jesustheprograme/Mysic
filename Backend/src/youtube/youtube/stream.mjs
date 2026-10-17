// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/youtube/stream.js
// Resuelve la URL directa del mejor formato de solo audio de un vídeo.
//
// Sin PO token YouTube corta cualquier stream a ~1 MB con un 403, con todos
// los clientes. La única combinación que sirve el archivo completo es el
// cliente YTMUSIC con `po_token` ligado al vídeo y `&pot=` en la URL.
import { config } from '../config.mjs';
import { createAsyncTtlCache } from '../utils/asyncCache.mjs';
import { getYoutube } from './client.mjs';
import { mintPoToken } from './potoken.mjs';

// Estrategias en orden de preferencia; IOS sin token es el respaldo (solo ~1 MB).
const STREAM_STRATEGIES = [
  { client: 'YTMUSIC', usePoToken: true },
  { client: 'IOS', usePoToken: false },
];

// Caché acotada de URLs descifradas; además comparte una resolución simultánea.
const streamCache = createAsyncTtlCache({ ttlMs: config.streamCacheTtlMs, maxSize: config.streamCacheMax });

export function invalidateStream(videoId) {
  streamCache.delete(videoId);
}

export async function resolveAudioStream(videoId) {
  return streamCache.get(videoId, () => loadAudioStream(videoId));
}

async function loadAudioStream(videoId) {
  const youtube = getYoutube();

  let lastError = null;
  for (const { client, usePoToken } of STREAM_STRATEGIES) {
    try {
      const poToken = usePoToken ? await mintPoToken(videoId) : null;
      const info = await youtube.getBasicInfo(videoId, poToken ? { client, po_token: poToken } : { client });
      const status = info.playability_status?.status;
      if (status && status !== 'OK') {
        throw new Error(info.playability_status?.reason || `Reproducción no disponible (${status})`);
      }

      const format = info.chooseFormat({ type: 'audio', quality: 'best' });
      let url = await format.decipher(youtube.session.player);
      if (!url) throw new Error('No se pudo descifrar la URL del audio');
      if (poToken) url += `&pot=${encodeURIComponent(poToken)}`;

      const entry = {
        url,
        mimeType: format.mime_type || 'audio/mp4',
        contentLength: format.content_length || null,
        client,
      };
      return entry;
    } catch (error) {
      lastError = error;
      console.warn(`[stream] cliente ${client} falló para ${videoId}: ${error.message}`);
    }
  }
  throw lastError || new Error('No se encontró ningún stream de audio');
}
