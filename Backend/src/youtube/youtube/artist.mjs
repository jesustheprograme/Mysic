// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/youtube/artist.js
// Página de artista de YouTube Music y sus imágenes en YouTube.
import { config } from '../config.mjs';
import { createAsyncTtlCache } from '../utils/asyncCache.mjs';
import { getYoutube } from './client.mjs';
import { mapAlbumItem, mapSong, pickThumbnail, plainText } from './mappers.mjs';

const MAX_VIDEO_THUMBNAILS = 8;
const artistSourceCache = createAsyncTtlCache({ ttlMs: config.browseCacheTtlMs, maxSize: config.requestCacheMax });
const artistCache = createAsyncTtlCache({ ttlMs: config.browseCacheTtlMs, maxSize: config.requestCacheMax });
const artistReleasesCache = createAsyncTtlCache({ ttlMs: config.browseCacheTtlMs, maxSize: config.requestCacheMax });
const artistTopSongDetailsCache = createAsyncTtlCache({ ttlMs: config.browseCacheTtlMs, maxSize: config.requestCacheMax });
const artistSongsCache = createAsyncTtlCache({ ttlMs: config.browseCacheTtlMs, maxSize: config.requestCacheMax });

function mapReleaseItems(items, artist) {
  return (items || [])
    .filter((item) => item.item_type === 'album' && item.id)
    .map((item) => ({ ...mapAlbumItem(item), artist: artist.name, artistId: artist.id }));
}

function getArtistSource(id) {
  return artistSourceCache.get(id, () => getYoutube().music.getArtist(id));
}

export function createReleasePreview(sections, artist) {
  return (sections || [])
    .filter((section) => section.type === 'MusicCarouselShelf')
    .map((section) => ({
      title: section.header?.title?.text || 'Álbumes',
      items: mapReleaseItems(section.contents, artist),
    }))
    .filter((shelf) => shelf.items.length > 0);
}

export function mergeReleaseItems(initialItems, expandedItems) {
  const releases = new Map();
  for (const item of [...initialItems, ...expandedItems]) releases.set(item.id, item);
  return [...releases.values()];
}

export async function expandReleaseShelf(section, artist, youtube) {
  const initialItems = mapReleaseItems(section.contents, artist);
  const endpoint = section.header?.more_content?.endpoint;
  if (!endpoint) return initialItems;

  try {
    const page = await endpoint.call(youtube.actions, { client: 'YTMUSIC', parse: true });
    const expandedItems = mapReleaseItems(page.contents_memo?.get('MusicTwoRowItem'), artist);
    return mergeReleaseItems(initialItems, expandedItems);
  } catch (error) {
    console.warn(`[artist] no se pudo ampliar ${section.header?.title?.text || 'discografía'}: ${error.message}`);
    return initialItems;
  }
}

export function findSongAlbum(item) {
  for (const column of item.flex_columns || []) {
    const run = column?.title?.runs?.find((entry) => entry.endpoint?.payload?.browseId?.startsWith('MPR'));
    if (run) return { id: run.endpoint.payload.browseId, name: plainText(run.text) };
  }
  return null;
}

export async function collectArtistSongs(playlist, defaults) {
  const songs = new Map();
  let page = playlist;
  while (page) {
    for (const item of page.items || []) {
      if (!item.id || (item.item_type !== 'song' && item.item_type !== 'video')) continue;
      const album = findSongAlbum(item);
      songs.set(item.id, mapSong(item, {
        ...defaults,
        album: album?.name,
        albumId: album?.id,
      }));
    }
    page = page.has_continuation ? await page.getContinuation() : null;
  }
  return [...songs.values()];
}

export function selectArtistSongDetails(items, topSongIds, defaults) {
  const wanted = new Set(topSongIds);
  return (items || [])
    .filter((item) => wanted.has(item.id) && (item.item_type === 'song' || item.item_type === 'video'))
    .map((item) => mapSong(item, defaults));
}

/**
 * Imágenes del artista disponibles en la página de YouTube Music (sin llamadas extra):
 *  - header: cabecera panorámica de YouTube Music
 *  - videos: fotogramas de portada de sus vídeos y actuaciones en directo (1280x720)
 */
export function collectPageMedia(artistPage) {
  const header = artistPage.header;
  const media = {
    header: pickThumbnail(header?.thumbnail ?? header?.foreground_thumbnail) || '',
    videos: [],
  };

  // Actuaciones en directo primero (muestran al artista en escena y rara vez
  // llevan rótulos), después vídeos musicales; se alternan para variar.
  const shelves = (artistPage.sections || [])
    .filter((s) => s.type === 'MusicCarouselShelf' && (s.contents || []).some((i) => i.item_type === 'video'))
    .sort((a, b) => /live|directo/i.test(b.header?.title?.text || '') - /live|directo/i.test(a.header?.title?.text || ''));
  const lists = shelves.map((s) => (s.contents || []).filter((i) => i.item_type === 'video' && i.id).map((i) => i.id));
  const seen = new Set();
  for (let n = 0; media.videos.length < MAX_VIDEO_THUMBNAILS; n += 1) {
    let added = false;
    for (const list of lists) {
      const videoId = list[n];
      if (!videoId || seen.has(videoId)) continue;
      seen.add(videoId);
      // hq720.jpg sin parámetros es el fotograma completo a 1280x720
      media.videos.push(`https://i.ytimg.com/vi/${videoId}/hq720.jpg`);
      added = true;
      if (media.videos.length >= MAX_VIDEO_THUMBNAILS) break;
    }
    if (!added) break;
  }
  return media;
}

/**
 * Imágenes del canal de YouTube (una llamada extra):
 *  - avatar: avatar del canal a 800 px (suele ser la misma foto que la cabecera)
 *  - banner: banner del canal (muy apaisado; no se usa en el panel vertical)
 */
export async function collectChannelMedia(id) {
  try {
    const channel = await getYoutube().getChannel(id);
    const content = channel.header?.content;
    const avatar = pickThumbnail(
      channel.header?.author?.thumbnails ?? content?.image?.avatar?.image ?? channel.metadata?.avatar
    );
    return {
      avatar: avatar ? avatar.replace(/=s\d+/, '=s800') : '',
      banner: pickThumbnail(channel.header?.banner ?? content?.banner?.image) || '',
    };
  } catch (error) {
    console.warn(`[artist] sin datos de canal para ${id}: ${error.message}`);
    return { avatar: '', banner: '' };
  }
}

/** Nombre e imágenes completas (lo que necesita el agregador de fotos cuando no hay página cargada). */
export async function getArtistNameAndMedia(id) {
  const artist = await getArtistSource(id);
  const [pageMedia, channelMedia] = await Promise.all([collectPageMedia(artist), collectChannelMedia(id)]);
  return {
    name: artist.header?.title?.text || 'Artista',
    media: { ...pageMedia, ...channelMedia },
  };
}

/** Página completa: cabecera, canciones destacadas y estanterías de álbumes/sencillos. */
export async function getArtistPage(id) {
  return artistCache.get(id, () => loadArtistPage(id));
}

export async function getArtistReleases(id) {
  return artistReleasesCache.get(id, async () => {
    const youtube = getYoutube();
    const artist = await getArtistSource(id);
    const name = artist.header?.title?.text || 'Artista';
    const releaseSections = (artist.sections || []).filter((section) => section.type === 'MusicCarouselShelf');
    const shelves = (await Promise.all(
      releaseSections.map(async (section) => ({
        title: section.header?.title?.text || 'Álbumes',
        items: await expandReleaseShelf(section, { id, name }, youtube),
      }))
    )).filter((shelf) => shelf.items.length > 0);
    return { id, shelves };
  });
}

export async function getArtistTopSongDetails(id) {
  return artistTopSongDetailsCache.get(id, async () => {
    const youtube = getYoutube();
    const artist = await getArtistSource(id);
    const section = (artist.sections || []).find((item) => item.type === 'MusicShelf');
    const playlistId = section?.endpoint?.payload?.browseId;
    const topSongIds = (section?.contents || []).map((item) => item.id).filter(Boolean);
    if (!playlistId || !topSongIds.length) return { id, songs: [] };

    const playlist = await youtube.music.getPlaylist(playlistId);
    const songs = selectArtistSongDetails(playlist.items, topSongIds, {
      artist: artist.header?.title?.text || 'Artista',
      artistId: id,
      thumbnail: pickThumbnail(artist.header?.thumbnail ?? artist.header?.foreground_thumbnail),
    });
    return { id, songs };
  });
}

export async function getArtistSongs(id) {
  return artistSongsCache.get(id, async () => {
    const youtube = getYoutube();
    const artist = await getArtistSource(id);
    const name = artist.header?.title?.text || 'Artista';
    const section = (artist.sections || []).find((item) => item.type === 'MusicShelf');
    const playlistId = section?.endpoint?.payload?.browseId;
    if (!playlistId) {
      return { id, name, songs: [] };
    }
    const playlist = await youtube.music.getPlaylist(playlistId);
    const songs = await collectArtistSongs(playlist, {
      artist: name,
      artistId: id,
      thumbnail: pickThumbnail(artist.header?.thumbnail ?? artist.header?.foreground_thumbnail),
    });
    return { id, name, songs };
  });
}

async function loadArtistPage(id) {
  const artist = await getArtistSource(id);
  const header = artist.header;
  const name = header?.title?.text || 'Artista';
  const media = collectPageMedia(artist);
  const thumbnail = media.header;

  const sections = artist.sections || [];
  const songSection = sections.find((section) => section.type === 'MusicShelf');
  const topSongs = (songSection?.contents || [])
    .filter((item) => item.id && (item.item_type === 'song' || item.item_type === 'video'))
    .map((item) => {
      const album = findSongAlbum(item);
      return mapSong(item, { artist: name, artistId: id, album: album?.name, albumId: album?.id, thumbnail });
    });
  const shelves = createReleasePreview(sections, { id, name });

  return {
    page: {
      id,
      name,
      description: header?.description?.text || '',
      thumbnail,
      // Foto inmediata para la cabecera; el agregador aporta el resto
      images: [media.header].filter(Boolean),
      imagesComplete: false,
      releasesComplete: false,
      songDetailsComplete: false,
      topSongs,
      shelves,
    },
    // Datos de YouTube ya obtenidos (sin canal) para que el agregador no repita llamadas
    media,
  };
}
