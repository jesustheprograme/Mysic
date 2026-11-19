// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/youtube/search.js
// Búsqueda en YouTube Music y sugerencias de autocompletado.
import { config } from '../config.mjs';
import { createPersistentSearchCache } from '../utils/persistentSearchCache.mjs';
import { getYoutube } from './client.mjs';
import { artistsOf, mapAlbumItem, mapArtistItem, mapSong, mapTopResult, pickThumbnail } from './mappers.mjs';

export const SEARCH_TYPES = new Set(['all', 'song', 'artist', 'album', 'video']);
export const VIDEO_SEARCH_PARAMS = 'EgWKAQIQAWoKEAkQChAFEAMQBA==';

const mapSongs = (r) => (r.songs?.contents || []).filter((s) => s.id).map((s) => mapSong(s));
const mapArtists = (r) => (r.artists?.contents || []).filter((a) => a.id).map(mapArtistItem);
const mapAlbums = (r) => (r.albums?.contents || []).filter((a) => a.id).map(mapAlbumItem);
const videoTypeOf = (item) => {
  const value = item.videoType
    || item.video_type
    || item.flex_columns?.[0]?.title?.runs?.[0]?.endpoint?.payload
      ?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;
  if (value === 'MUSIC_VIDEO_TYPE_OMV' || value === 'OMV') return 'OMV';
  if (value === 'MUSIC_VIDEO_TYPE_UGC' || value === 'UGC') return 'UGC';
  return null;
};

export function mapVideo(item) {
  const id = item?.id ?? item?.video_id;
  if (!id) return null;
  const artists = item.artists?.length
    ? item.artists
    : item.authors?.length
      ? item.authors
      : item.author
        ? [item.author]
        : [];
  const video = mapSong({ ...item, id, artists });
  const videoType = videoTypeOf(item);
  return videoType ? { ...video, videoType } : video;
}

const mapVideos = (results) => (results.videos?.contents || []).map(mapVideo).filter(Boolean);
const searchCache = createPersistentSearchCache({
  dir: config.searchCacheDir,
  freshTtlMs: config.searchCacheTtlMs,
  staleTtlMs: config.searchCacheStaleMs,
  maxSize: config.searchCacheMax,
});

// YouTube Music cambió la búsqueda sin filtro: ya no devuelve estanterías "Canciones", "Álbumes"... sino una lista
// plana de `ItemSection` con un MusicResponsiveListItem cada una, mezclando tipos. Los getters de youtubei.js
// (`songs`, `artists`, `albums`) salían vacíos y el buscador solo mostraba el resultado principal. Se leen primero
// las estanterías (formato antiguo) y, si vienen vacías, se reparte la lista plana por tipo conservando el orden.
const flatListItems = (general) => (general?.contents || [])
  .filter((section) => section.type === 'ItemSection' || section.type === 'MusicShelf')
  .flatMap((section) => section.contents || [])
  .filter((item) => item?.id && (item.type === 'MusicResponsiveListItem' || item.item_type));

function mapListAlbum(item) {
  const album = mapAlbumItem(item);
  if (album.artist) return album;
  const [artist] = artistsOf(item);
  return { ...album, artist: artist?.name || '', artistId: album.artistId || artist?.channel_id || null };
}

export function mapGeneralSections(general) {
  const shelves = { songs: mapSongs(general), artists: mapArtists(general), albums: mapAlbums(general) };
  if (shelves.songs.length || shelves.artists.length || shelves.albums.length) return shelves;

  const items = flatListItems(general);
  const songs = items.filter((item) => item.item_type === 'song').map((item) => mapSong(item));
  // Los vídeos oficiales y las versiones en directo van detrás de las canciones de catálogo.
  const videos = items.filter((item) => item.item_type === 'video').map((item) => mapSong(item));
  return {
    songs: [...songs, ...videos],
    artists: items.filter((item) => item.item_type === 'artist').map(mapArtistItem),
    albums: items.filter((item) => item.item_type === 'album').map(mapListAlbum),
  };
}

/**
 * `type === 'all'` devuelve cuanto antes las secciones incluidas en la búsqueda
 * general. El frontend completa cada sección por tipo sin bloquear el primer render.
 */
export async function searchMusic(text, type) {
  // 'all' lleva versión en la clave: las respuestas guardadas antes de leer el formato plano de YouTube tenían las tres
  // listas vacías y la caché persistente las habría seguido sirviendo hasta caducar.
  const key = `${type === 'all' ? 'all-v2' : type}:${text.trim().toLocaleLowerCase('es')}`;
  return searchCache.get(key, () => loadSearchMusic(text, type));
}

export async function loadSearchMusic(text, type, youtube = getYoutube()) {

  if (type === 'all') {
    const general = await youtube.music.search(text);
    const card = general?.contents?.find((c) => c.type === 'MusicCardShelf');
    return {
      type: 'all',
      top: mapTopResult(card),
      ...mapGeneralSections(general),
    };
  }

  const results = await youtube.music.search(text, { type });
  let items = [];
  if (type === 'song') items = mapSongs(results);
  else if (type === 'artist') items = mapArtists(results);
  else if (type === 'album') items = mapAlbums(results);
  else {
    items = mapVideos(results);
    if (!items.length) {
      const fallback = await youtube.actions.execute('/search', {
        query: text,
        params: VIDEO_SEARCH_PARAMS,
        client: 'YTMUSIC',
        parse: true,
      });
      const candidates = fallback?.contents_memo?.get('MusicResponsiveListItem') || [];
      items = candidates
        .filter((item) => item.item_type === 'video' || videoTypeOf(item))
        .map(mapVideo)
        .filter(Boolean);
    }
  }
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
