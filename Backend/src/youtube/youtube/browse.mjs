import { getYoutube } from './client.mjs';
import { mapAlbumItem, mapArtistItem, mapSong, pickThumbnail, plainText } from './mappers.mjs';
import { config } from '../config.mjs';
import { createAsyncTtlCache } from '../utils/asyncCache.mjs';

const playlistCache = createAsyncTtlCache({ ttlMs: config.browseCacheTtlMs, maxSize: config.requestCacheMax });

function mapQueueSong(item) {
  return mapSong({
    ...item,
    id: item.video_id ?? item.id,
    title: plainText(item.title),
  });
}

export function mapBrowseItem(item) {
  if (!item) return null;

  if (item.type === 'PlaylistPanelVideo') return { kind: 'song', ...mapQueueSong(item) };
  if ((item.item_type === 'song' || item.item_type === 'video') && item.id) {
    return { kind: 'song', ...mapSong(item) };
  }
  if (item.item_type === 'artist' && item.id) return { kind: 'artist', ...mapArtistItem(item) };
  if (item.item_type === 'album' && item.id) {
    const album = mapAlbumItem(item);
    return { ...album, kind: 'album', releaseKind: album.kind };
  }
  if (item.item_type === 'playlist' && item.id) {
    return {
      kind: 'playlist',
      id: item.id.replace(/^VL/, ''),
      title: plainText(item.title) || 'Playlist',
      subtitle: plainText(item.subtitle),
      thumbnail: pickThumbnail(item.thumbnail ?? item.thumbnails),
    };
  }
  return null;
}

export function mapShelf(shelf) {
  const items = (shelf?.contents || []).map(mapBrowseItem).filter(Boolean);
  if (!items.length) return null;
  return {
    title: plainText(shelf.header?.title) || 'Para ti',
    items,
  };
}

function mapShelves(sections) {
  return (sections || []).map(mapShelf).filter(Boolean);
}

export function rotateHomeShelves(shelves, variant, visibleCount = shelves.length) {
  if (shelves.length < 2 || !Number.isFinite(variant)) return shelves.slice(0, visibleCount);
  const offset = Math.abs(Math.trunc(variant)) % shelves.length;
  const rotated = [...shelves.slice(offset), ...shelves.slice(0, offset)].slice(0, visibleCount);
  return rotated.map((shelf, index) => {
    if (shelf.items.length < 2) return shelf;
    const itemOffset = Math.abs(Math.trunc(variant + index)) % shelf.items.length;
    return { ...shelf, items: [...shelf.items.slice(itemOffset), ...shelf.items.slice(0, itemOffset)] };
  });
}

export async function getHome(youtube = getYoutube(), variant = 0) {
  const home = await youtube.music.getHomeFeed();
  const initialShelves = mapShelves(home.sections);
  let continuationShelves = [];
  if (home.has_continuation) {
    try {
      continuationShelves = mapShelves((await home.getContinuation()).sections);
    } catch (error) {
      console.warn(`No se pudo ampliar el Inicio de YouTube Music: ${error.message}`);
    }
  }
  return {
    personalized: Boolean(youtube.session.cookie),
    filters: (home.filters || []).map(plainText).filter(Boolean),
    shelves: rotateHomeShelves([...initialShelves, ...continuationShelves], variant, initialShelves.length),
  };
}

export async function getExplore(youtube = getYoutube()) {
  const explore = await youtube.music.getExplore();
  return {
    categories: (explore.top_buttons || []).map((item) => plainText(item.button_text)).filter(Boolean),
    shelves: mapShelves(explore.sections),
  };
}

export async function getRadio(videoId, youtube = getYoutube()) {
  const queue = await youtube.music.getUpNext(videoId, true);
  return {
    title: plainText(queue.title_text) || 'Radio de la canción',
    songs: (queue.contents || []).map(mapBrowseItem).filter((item) => item?.kind === 'song'),
  };
}

export async function getPlaylistQueue(playlistId) {
  return playlistCache.get(playlistId, async () => {
    const playlist = await getYoutube().music.getPlaylist(playlistId);
    return {
      title: plainText(playlist.header?.title) || 'Playlist',
      songs: (playlist.items || []).map(mapBrowseItem).filter((item) => item?.kind === 'song'),
    };
  });
}

export async function getRecommendations(videoId, youtube = getYoutube()) {
  const related = await youtube.music.getRelated(videoId);
  return { shelves: mapShelves(related.contents) };
}
