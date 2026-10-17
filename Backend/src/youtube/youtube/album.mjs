// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/youtube/album.js
// Página de álbum de YouTube Music: cabecera y pistas.
import { config } from '../config.mjs';
import { createAsyncTtlCache } from '../utils/asyncCache.mjs';
import { getYoutube } from './client.mjs';
import { mapSong, pickThumbnail } from './mappers.mjs';

const albumCache = createAsyncTtlCache({ ttlMs: config.browseCacheTtlMs, maxSize: config.requestCacheMax });

export async function getAlbumPage(id) {
  return albumCache.get(id, () => loadAlbumPage(id));
}

async function loadAlbumPage(id) {
  const album = await getYoutube().music.getAlbum(id);
  const header = album.header;
  const title = header?.title?.text || 'Álbum';
  const strapline = header?.strapline_text_one;
  const artist = strapline?.text || header?.author?.name || '';
  const artistId =
    strapline?.endpoint?.payload?.browseId ||
    strapline?.runs?.find((r) => r.endpoint?.payload?.browseId)?.endpoint.payload.browseId ||
    header?.author?.channel_id ||
    null;
  const subtitle = header?.subtitle?.text || '';
  const year = header?.year || subtitle.match(/\b(19|20)\d{2}\b/)?.[0] || '';
  const thumbnail = pickThumbnail(header?.thumbnail ?? header?.thumbnails ?? album.background);

  // Las pistas no traen carátula ni artista: se rellenan con los del álbum
  const tracks = (album.contents || [])
    .filter((t) => t.id)
    .map((t, i) => ({
      ...mapSong(t, { artist, artistId, album: title, albumId: id, thumbnail }),
      index: Number(t.index?.text) || i + 1,
    }));

  return {
    id,
    title,
    artist,
    artistId,
    year,
    info: header?.second_subtitle?.text || '',
    thumbnail,
    tracks,
  };
}
