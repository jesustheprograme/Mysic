// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/youtube/search.js
// Búsqueda en YouTube Music y sugerencias de autocompletado.
import { config } from '../config.mjs';
import { createPersistentSearchCache } from '../utils/persistentSearchCache.mjs';
import { getYoutube } from './client.mjs';
import { mapAlbumItem, mapArtistItem, mapSong, mapTopResult, pickThumbnail } from './mappers.mjs';

export const SEARCH_TYPES = new Set(['all', 'song', 'artist', 'album']);

const mapSongs = (r) => (r.songs?.contents || []).filter((s) => s.id).map((s) => mapSong(s));
const mapArtists = (r) => (r.artists?.contents || []).filter((a) => a.id).map(mapArtistItem);
const mapAlbums = (r) => (r.albums?.contents || []).filter((a) => a.id).map(mapAlbumItem);
const searchCache = createPersistentSearchCache({
  dir: config.searchCacheDir,
  freshTtlMs: config.searchCacheTtlMs,
  staleTtlMs: config.searchCacheStaleMs,
  maxSize: config.searchCacheMax,
});

/**
 * `type === 'all'` devuelve cuanto antes las secciones incluidas en la búsqueda
 * general. El frontend completa cada sección por tipo sin bloquear el primer render.
 */
export async function searchMusic(text, type) {
  const key = `${type}:${text.trim().toLocaleLowerCase('es')}`;
  return searchCache.get(key, () => loadSearchMusic(text, type));
}

async function loadSearchMusic(text, type) {
  const youtube = getYoutube();

  if (type === 'all') {
    const general = await youtube.music.search(text);
    const card = general?.contents?.find((c) => c.type === 'MusicCardShelf');
    return {
      type: 'all',
      top: mapTopResult(card),
      songs: mapSongs(general),
      artists: mapArtists(general),
      albums: mapAlbums(general),
    };
  }

  const results = await youtube.music.search(text, { type });
  let items = [];
  if (type === 'song') items = mapSongs(results);
  else if (type === 'artist') items = mapArtists(results);
  else items = mapAlbums(results);
  return { type, items };
}

// Caché corta de sugerencias para no golpear a YouTube en cada pulsación
const suggestCache = new Map();

/** Textos de autocompletado y entidades directas (artistas, canciones, álbumes). */
export async function getSuggestions(q) {
  const key = q.toLowerCase();
  const cached = suggestCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const sections = await getYoutube().music.getSearchSuggestions(q);
  const texts = [];
  const entities = [];

  for (const section of sections || []) {
    for (const item of section.contents || []) {
      if (item.type === 'SearchSuggestion') {
        const t = item.suggestion?.text?.trim();
        if (t && !texts.includes(t)) texts.push(t);
      } else if (item.type === 'MusicResponsiveListItem' && item.id) {
        const thumbnail = pickThumbnail(item.thumbnail ?? item.thumbnails);
        const detail = item.flex_columns?.[1]?.title?.text || item.subtitle?.text || '';
        if (item.item_type === 'artist') {
          entities.push({ kind: 'artist', id: item.id, title: item.name || item.title || 'Artista', subtitle: detail, thumbnail });
        } else if (item.item_type === 'song' || item.item_type === 'video') {
          entities.push({ kind: 'song', id: item.id, title: item.title || 'Canción', subtitle: detail, thumbnail, song: mapSong(item) });
        } else if (item.item_type === 'album') {
          entities.push({ kind: 'album', id: item.id, title: item.title || 'Álbum', subtitle: detail, thumbnail });
        }
      }
    }
  }

  const data = { texts: texts.slice(0, 6), entities: entities.slice(0, 6) };
  if (suggestCache.size >= config.suggestCacheMax) suggestCache.delete(suggestCache.keys().next().value);
  suggestCache.set(key, { data, expiresAt: Date.now() + config.suggestCacheTtlMs });
  return data;
}
