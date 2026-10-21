// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/youtube/mappers.js
// Convierte los objetos de Innertube (youtubei.js) al formato plano que
// consume el frontend: Song, ArtistItem, AlbumItem y TopResult.

// Innertube devuelve miniaturas como array o como MusicThumbnail { contents: [] }
export function pickThumbnail(thumbnails) {
  const list = Array.isArray(thumbnails) ? thumbnails : thumbnails?.contents || [];
  const best = [...list].sort((a, b) => (b.width || 0) - (a.width || 0))[0];
  return best?.url || '';
}

// youtubei.js mezcla strings con instancias Text según el tipo de tarjeta.
// El contrato HTTP debe contener siempre valores primitivos renderizables.
export function plainText(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value?.text === 'string') return value.text;
  if (Array.isArray(value?.runs)) {
    return value.runs.map((run) => plainText(run?.text)).join('');
  }
  return '';
}

// `defaults` rellena campos que faltan en algunos contextos (pistas de álbum sin carátula ni artista).
export function mapSong(song, defaults = {}) {
  const artistNames = song.artists?.map((artist) => plainText(artist.name)).filter(Boolean) || [];
  return {
    id: song.id,
    title: plainText(song.title) || 'Canción sin título',
    artist: artistNames.join(', ') || plainText(defaults.artist) || 'Artista desconocido',
    artistId: song.artists?.[0]?.channel_id || defaults.artistId || null,
    album: plainText(song.album?.name) || plainText(defaults.album) || 'Sencillo',
    albumId: song.album?.id || defaults.albumId || null,
    duration: plainText(song.duration) || '--:--',
    durationSeconds: song.duration?.seconds || 0,
    thumbnail: pickThumbnail(song.thumbnail ?? song.thumbnails) || defaults.thumbnail || '',
  };
}

export function mapArtistItem(item) {
  // El subtítulo llega como "Artist • 74.4M monthly audience"; quitamos la etiqueta
  const subtitle = plainText(item.subtitle).replace(/^[^•]*•\s*/, '');
  return {
    id: item.id,
    name: plainText(item.name) || plainText(item.title) || 'Artista',
    subtitle,
    thumbnail: pickThumbnail(item.thumbnail ?? item.thumbnails),
  };
}

export function mapAlbumItem(item) {
  const subtitle = plainText(item.subtitle);
  // El subtítulo puede ser "Album • Daft Punk • 2001", "Single • 2023" o solo "2023"
  const firstPart = subtitle.split('•')[0].trim();
  const kind = firstPart && !/^\d{4}$/.test(firstPart) ? firstPart : 'Álbum';
  return {
    id: item.id,
    title: plainText(item.title) || 'Álbum',
    artist: plainText(item.author?.name)
      || item.artists?.map((artist) => plainText(artist.name)).filter(Boolean).join(', ')
      || '',
    artistId: item.author?.channel_id || item.artists?.[0]?.channel_id || null,
    year: plainText(item.year) || subtitle.match(/\b(19|20)\d{2}\b/)?.[0] || '',
    kind,
    thumbnail: pickThumbnail(item.thumbnail ?? item.thumbnails),
  };
}

// Resultado principal ("Top result") de la búsqueda sin filtro
export function mapTopResult(card) {
  if (!card) return null;
  const payload = card.title?.endpoint?.payload || card.on_tap?.payload || {};
  const title = plainText(card.title);
  const subtitle = plainText(card.subtitle);
  const thumbnail = pickThumbnail(card.thumbnail);
  const pageType =
    payload.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType || '';

  if (payload.videoId) {
    const parts = subtitle.split('•').map((s) => s.trim());
    return {
      kind: 'song',
      id: payload.videoId,
      title,
      subtitle,
      thumbnail,
      song: {
        id: payload.videoId,
        title,
        artist: parts[1] || 'Artista desconocido',
        artistId: null,
        album: 'Sencillo',
        albumId: null,
        duration: '--:--',
        durationSeconds: 0,
        thumbnail,
      },
    };
  }
  if (payload.browseId) {
    if (pageType.includes('ARTIST') || payload.browseId.startsWith('UC')) {
      return { kind: 'artist', id: payload.browseId, title, subtitle, thumbnail };
    }
    if (pageType.includes('ALBUM') || payload.browseId.startsWith('MPREb')) {
      return { kind: 'album', id: payload.browseId, title, subtitle, thumbnail };
    }
  }
  return null;
}
