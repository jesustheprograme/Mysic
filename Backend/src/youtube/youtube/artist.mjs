// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/youtube/artist.js
// Página de artista de YouTube Music y sus imágenes en YouTube.
import { getYoutube } from './client.mjs';
import { mapAlbumItem, mapSong, pickThumbnail } from './mappers.mjs';

const MAX_VIDEO_THUMBNAILS = 8;

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
  const artist = await getYoutube().music.getArtist(id);
  const [pageMedia, channelMedia] = await Promise.all([collectPageMedia(artist), collectChannelMedia(id)]);
  return {
    name: artist.header?.title?.text || 'Artista',
    media: { ...pageMedia, ...channelMedia },
  };
}

/** Página completa: cabecera, canciones destacadas y estanterías de álbumes/sencillos. */
export async function getArtistPage(id) {
  const artist = await getYoutube().music.getArtist(id);
  const header = artist.header;
  const name = header?.title?.text || 'Artista';
  const media = collectPageMedia(artist);
  const thumbnail = media.header;

  const topSongs = [];
  const shelves = [];
  for (const section of artist.sections || []) {
    if (section.type === 'MusicShelf') {
      for (const item of section.contents || []) {
        if (item.id && (item.item_type === 'song' || item.item_type === 'video')) {
          topSongs.push(mapSong(item, { artist: name, artistId: id, thumbnail }));
        }
      }
    } else if (section.type === 'MusicCarouselShelf') {
      const albums = (section.contents || [])
        .filter((item) => item.item_type === 'album' && item.id)
        .map((item) => ({ ...mapAlbumItem(item), artist: name, artistId: id }));
      if (albums.length > 0) {
        shelves.push({ title: section.header?.title?.text || 'Álbumes', items: albums });
      }
    }
  }

  return {
    page: {
      id,
      name,
      description: header?.description?.text || '',
      thumbnail,
      // Foto inmediata para la cabecera; el agregador aporta el resto
      images: [media.header].filter(Boolean),
      imagesComplete: false,
      topSongs,
      shelves,
    },
    // Datos de YouTube ya obtenidos (sin canal) para que el agregador no repita llamadas
    media,
  };
}
