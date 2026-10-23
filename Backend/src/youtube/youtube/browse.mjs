import { getYoutube } from './client.mjs';
import { config } from '../config.mjs';
import { createAsyncTtlCache } from '../utils/asyncCache.mjs';
import { mapAlbumItem, mapArtistItem, mapSong, pickThumbnail, plainText } from './mappers.mjs';

const albumCache = createAsyncTtlCache({ ttlMs: 6 * 60 * 60 * 1000, maxSize: config.requestCacheMax });
const ALBUM_LOOKUP_CONCURRENCY = 4;

function mapQueueSong(item) {
  return mapSong({
    ...item,
    id: item.video_id ?? item.id,
    title: plainText(item.title),
  });
}

function findAlbum(item) {
  const metadata = [item.subtitle, ...(item.flex_columns || []).map((column) => column?.title)];
  for (const text of metadata) {
    const album = text?.runs?.find((run) => run.endpoint?.payload?.browseId?.startsWith('MPR'));
    if (album) return { id: album.endpoint.payload.browseId, name: plainText(album.text) };
  }
  return null;
}

export function mapBrowseItem(item) {
  if (!item) return null;

  if (item.type === 'PlaylistPanelVideo') return { kind: 'song', ...mapQueueSong(item) };
  if ((item.item_type === 'song' || item.item_type === 'video') && item.id) {
    const album = findAlbum(item);
    const artists = item.artists || (item.author ? [item.author] : undefined);
    return {
      kind: 'song',
      ...mapSong({ ...item, artists }, { album: album?.name, albumId: album?.id }),
    };
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

async function loadAlbum(videoId, youtube) {
  try {
    return await albumCache.get(videoId, async () => {
      const info = await youtube.music.getInfo(videoId);
      const queue = await info.getUpNext?.(false);
      const currentSong = queue?.contents?.find((item) => (item.video_id ?? item.id) === videoId);
      return {
        id: currentSong?.album?.id || null,
        name: plainText(currentSong?.album?.name)
          || plainText(info.player_overlays?.browser_media_session?.album),
      };
    });
  } catch (error) {
    console.warn(`No se pudo identificar el lanzamiento de ${videoId}: ${error.message}`);
    return null;
  }
}

export async function enrichShelfAlbums(shelves, youtube) {
  const missing = shelves.flatMap((shelf) => shelf.items)
    .filter((item) => item.kind === 'song' && !item.albumId);

  for (let index = 0; index < missing.length; index += ALBUM_LOOKUP_CONCURRENCY) {
    const batch = missing.slice(index, index + ALBUM_LOOKUP_CONCURRENCY);
    await Promise.all(batch.map(async (item) => {
      const album = await loadAlbum(item.id, youtube);
      if (album?.name) item.album = album.name;
      if (album?.id) item.albumId = album.id;
    }));
  }
  return shelves;
}

export function mergeHomeShelves(initialShelves, continuationShelves) {
  const titles = new Set(initialShelves.map((shelf) => shelf.title));
  return [
    ...initialShelves,
    ...continuationShelves.filter((shelf) => !titles.has(shelf.title)),
  ];
}

export async function getHome(youtube = getYoutube()) {
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
  const shelves = mergeHomeShelves(initialShelves, continuationShelves);
  await enrichShelfAlbums(shelves, youtube);
  return {
    personalized: Boolean(youtube.session.cookie),
    filters: (home.filters || []).map(plainText).filter(Boolean),
    shelves,
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

export async function getPlaylistQueue(playlistId, youtube = getYoutube()) {
  const playlist = await youtube.music.getPlaylist(playlistId);
  return {
    title: plainText(playlist.header?.title) || 'Playlist',
    songs: (playlist.items || []).map(mapBrowseItem).filter((item) => item?.kind === 'song'),
  };
}

export async function getRecommendations(videoId, youtube = getYoutube()) {
  const related = await youtube.music.getRelated(videoId);
  return { shelves: mapShelves(related.contents) };
}
