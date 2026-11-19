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

// Canales de YouTube sin música oficial (p. ej. @Q2000_): la página de YouTube Music no trae canciones ni álbumes, pero el
// canal sí tiene vídeos. Se listan como pistas (solo se reproduce el audio; la portada es la miniatura del vídeo).
const MAX_CHANNEL_VIDEOS = 600;
const channelVideosCache = createAsyncTtlCache({ ttlMs: config.browseCacheTtlMs, maxSize: config.requestCacheMax });

// YouTube entrega los vídeos del canal con dos formas: `Video` (id, duration, thumbnails) y `LockupView` (content_id,
// la duración en una insignia de la miniatura y el título en metadata). Se normalizan las dos.
function parseClock(text) {
  if (typeof text !== 'string' || !/^\d+(:\d{1,2}){1,2}$/.test(text.trim())) return 0;
  return text.trim().split(':').map(Number).reduce((total, part) => (total * 60) + part, 0);
}

function normalizeChannelVideo(video) {
  if (video.content_id || video.content_type) {
    if (video.content_type && video.content_type !== 'VIDEO') return null;
    const badges = (video.content_image?.overlays || []).flatMap((overlay) => overlay.badges || []);
    const text = badges.map((badge) => badge.text).find((value) => parseClock(value)) || '';
    return {
      id: video.content_id,
      title: plainText(video.metadata?.title) || '',
      duration: text,
      durationSeconds: parseClock(text),
      thumbnail: pickThumbnail(video.content_image?.image) || '',
    };
  }
  const seconds = Number(video.duration?.seconds) || 0;
  return {
    id: video.video_id || video.id,
    title: plainText(video.title) || '',
    duration: plainText(video.duration?.text),
    durationSeconds: seconds,
    thumbnail: pickThumbnail(video.thumbnails ?? video.thumbnail) || '',
    author: video.author,
  };
}

export function mapChannelVideo(video, defaults = {}) {
  const item = normalizeChannelVideo(video);
  if (!item?.id || !item.durationSeconds) return null;
  return {
    id: item.id,
    title: item.title || 'Vídeo sin título',
    artist: plainText(item.author?.name) || plainText(defaults.artist) || 'Artista desconocido',
    artistId: defaults.artistId || item.author?.id || null,
    album: 'Vídeos',
    albumId: null,
    duration: item.duration || '--:--',
    durationSeconds: item.durationSeconds,
    thumbnail: item.thumbnail || defaults.thumbnail || '',
  };
}
/** Recorre las páginas de la pestaña "Vídeos" del canal (sin Shorts ni directos sin duración) hasta `limit`. */
export async function collectChannelVideos(feed, defaults, limit = MAX_CHANNEL_VIDEOS) {
  const videos = new Map();
  let page = feed;
  while (page && videos.size < limit) {
    for (const item of page.videos || []) {
      const song = mapChannelVideo(item, defaults);
      if (!song || videos.has(song.id)) continue;
      videos.set(song.id, song);
      if (videos.size >= limit) break;
    }
    page = page.has_continuation && videos.size < limit ? await page.getContinuation() : null;
  }
  return [...videos.values()];
}

// El canal de YouTube se pide una sola vez y lo comparten los vídeos, el perfil y las listas.
const channelSourceCache = createAsyncTtlCache({ ttlMs: config.browseCacheTtlMs, maxSize: config.requestCacheMax });
const getChannelSource = (id) => channelSourceCache.get(id, () => getYoutube().getChannel(id));

export function getChannelVideos(id, defaults = {}, limit = MAX_CHANNEL_VIDEOS) {
  return channelVideosCache.get(`${id}:${limit}`, async () => {
    try {
      const channel = await getChannelSource(id);
      return await collectChannelVideos(await channel.getVideos(), { ...defaults, artistId: id }, limit);
    } catch (error) {
      console.warn(`[artist] sin vídeos de canal para ${id}: ${error.message}`);
      return [];
    }
  });
}

// --- Perfil de canal (como la página de canal de Limusic): suscriptores, avatar y listas de reproducción ---
const channelProfileCache = createAsyncTtlCache({ ttlMs: config.browseCacheTtlMs, maxSize: config.requestCacheMax });

/** "422 subscribers" entre los datos de la cabecera del canal ("@Q2000_", "422 subscribers", "311 videos"). */
export function channelSubscribers(channel) {
  const parts = (channel?.header?.content?.metadata?.metadata_rows || [])
    .flatMap((row) => row.metadata_parts || [])
    .map((part) => plainText(part.text).trim());
  return parts.find((text) => /subscri|suscri/i.test(text)) || '';
}

/** Tarjeta de lista del canal (LockupView de la pestaña "Playlists"). */
export function mapChannelPlaylist(item) {
  const id = item?.content_id || item?.id;
  if (!id || (item.content_type && item.content_type !== 'PLAYLIST')) return null;
  const badges = (item.content_image?.primary_thumbnail?.overlays || []).flatMap((overlay) => overlay.badges || []);
  const count = badges.map((badge) => plainText(badge.text)).find((text) => /\d/.test(text)) || '';
  return {
    id,
    title: plainText(item.metadata?.title) || plainText(item.title) || 'Lista',
    subtitle: count.replace(/videos?/i, (word) => (/s$/i.test(word) ? 'vídeos' : 'vídeo')),
    thumbnail: pickThumbnail(item.content_image?.primary_thumbnail?.image ?? item.thumbnails ?? item.thumbnail) || '',
  };
}

/** Tarjeta de lista de un carrusel de la página de YouTube Music (MusicTwoRowItem). */
export function mapCarouselPlaylist(item) {
  return {
    id: item.id,
    title: plainText(item.title) || 'Lista',
    subtitle: plainText(item.subtitle).replace(/^\s*Playlist\s*•\s*/i, '').replace(/\s*•\s*/g, ' · '),
    thumbnail: pickThumbnail(item.thumbnail ?? item.thumbnails) || '',
  };
}

/** Carruseles de listas de la página de YouTube Music ("Playlists", "Featured on"...), con su título original. */
export function createPlaylistShelves(sections) {
  return (sections || [])
    .filter((section) => section.type === 'MusicCarouselShelf')
    .map((section) => ({
      title: section.header?.title?.text || 'Playlists',
      items: (section.contents || []).filter((item) => item.item_type === 'playlist' && item.id).map(mapCarouselPlaylist),
    }))
    .filter((shelf) => shelf.items.length > 0);
}

/** Vídeos de los carruseles de la página de YouTube Music (sin duración: la tarjeta no la trae). */
export function createVideoPreview(sections, defaults) {
  const videos = new Map();
  for (const section of sections || []) {
    if (section.type !== 'MusicCarouselShelf') continue;
    for (const item of section.contents || []) {
      if (item.item_type === 'video' && item.id && !videos.has(item.id)) videos.set(item.id, { ...mapSong(item, defaults), album: 'Vídeos' });
    }
  }
  return [...videos.values()];
}

export function getChannelProfile(id) {
  return channelProfileCache.get(id, async () => {
    try {
      const channel = await getChannelSource(id);
      const avatar = pickThumbnail(channel.header?.content?.image?.avatar?.image ?? channel.metadata?.avatar);
      let playlists = [];
      if (channel.has_playlists) {
        const feed = await channel.getPlaylists().catch(() => null);
        playlists = (feed?.playlists || []).map(mapChannelPlaylist).filter(Boolean);
      }
      return { avatar: avatar ? avatar.replace(/=s\d+/, '=s800') : '', subscribers: channelSubscribers(channel), playlists };
    } catch (error) {
      console.warn(`[artist] sin perfil de canal para ${id}: ${error.message}`);
      return { avatar: '', subscribers: '', playlists: [] };
    }
  });
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
      return { id, name, songs: await getChannelVideos(id, { artist: name, thumbnail: pickThumbnail(artist.header?.thumbnail ?? artist.header?.foreground_thumbnail) }) };
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
  let topSongs = (songSection?.contents || [])
    .filter((item) => item.id && (item.item_type === 'song' || item.item_type === 'video'))
    .map((item) => {
      const album = findSongAlbum(item);
      return mapSong(item, { artist: name, artistId: id, album: album?.name, albumId: album?.id, thumbnail });
    });
  const shelves = createReleasePreview(sections, { id, name });
  let playlists = createPlaylistShelves(sections);
  let videos = createVideoPreview(sections, { artist: name, artistId: id, thumbnail });
  let kind = 'artist';
  let subtitle = '';
  let portrait = thumbnail || pickThumbnail(header?.foreground_thumbnail);
  // Canal sin música en YouTube Music: se muestran sus vídeos más recientes (la lista completa, en "Ver todas"),
  // sus suscriptores, su avatar y todas sus listas de reproducción, como hace la página de canal de Limusic.
  if (!topSongs.length && !shelves.length) {
    kind = 'channel';
    const [channelVideos, profile] = await Promise.all([
      getChannelVideos(id, { artist: name, thumbnail: portrait }, 8),
      getChannelProfile(id),
    ]);
    // Los del canal traen duración; si el canal falla quedan los del carrusel de YouTube Music.
    topSongs = channelVideos.length ? channelVideos : videos.slice(0, 8);
    videos = [];
    subtitle = profile.subscribers;
    portrait = portrait || profile.avatar;
    if (profile.playlists.length) playlists = [{ title: 'Playlists', items: profile.playlists }];
  }

  return {
    page: {
      id,
      name,
      kind,
      subtitle,
      description: header?.description?.text || '',
      thumbnail: portrait,
      videos,
      playlists,
      // Foto inmediata para la cabecera; el agregador aporta el resto
      images: [portrait].filter(Boolean),
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
