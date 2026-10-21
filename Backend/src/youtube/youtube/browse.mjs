import { getYoutube } from './client.mjs';
import { mapAlbumItem, mapArtistItem, mapSong, pickThumbnail } from './mappers.mjs';
import { config } from '../config.mjs';
import { createAsyncTtlCache } from '../utils/asyncCache.mjs';

const playlistCache = createAsyncTtlCache({ ttlMs: config.browseCacheTtlMs, maxSize: config.requestCacheMax });

function text(value) {
  return value?.text ?? value?.toString?.() ?? (typeof value === 'string' ? value : '');
}

function mapQueueSong(item) {
  return mapSong({
    ...item,
    id: item.video_id ?? item.id,
    title: text(item.title),
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
      title: text(item.title) || 'Playlist',
      subtitle: text(item.subtitle),
      thumbnail: pickThumbnail(item.thumbnail ?? item.thumbnails),
    };
  }
  return null;
}

export function mapShelf(shelf) {
  const items = (shelf?.contents || []).map(mapBrowseItem).filter(Boolean);
  if (!items.length) return null;
  return {
    title: text(shelf.header?.title) || 'Para ti',
    items,
  };
}

function mapShelves(sections) {
  return (sections || []).map(mapShelf).filter(Boolean);
}

export async function getHome() {
  const youtube = getYoutube();
  const home = await youtube.music.getHomeFeed();
  return {
    personalized: youtube.session.logged_in,
    filters: home.filters || [],
    shelves: mapShelves(home.sections),
  };
}

export async function getExplore() {
  const explore = await getYoutube().music.getExplore();
  return {
    categories: (explore.top_buttons || []).map((item) => item.button_text).filter(Boolean),
    shelves: mapShelves(explore.sections),
  };
}

export async function getRadio(videoId) {
  const queue = await getYoutube().music.getUpNext(videoId, true);
  return {
    title: text(queue.title_text) || 'Radio de la canción',
    songs: (queue.contents || []).map(mapBrowseItem).filter((item) => item?.kind === 'song'),
  };
}

export async function getPlaylistQueue(playlistId) {
  return playlistCache.get(playlistId, async () => {
    const playlist = await getYoutube().music.getPlaylist(playlistId);
    return {
      title: text(playlist.header?.title) || 'Playlist',
      songs: (playlist.items || []).map(mapBrowseItem).filter((item) => item?.kind === 'song'),
    };
  });
}

export async function getRecommendations(videoId) {
  const related = await getYoutube().music.getRelated(videoId);
  return { shelves: mapShelves(related.contents) };
}
