const API_BASE = 'https://www.googleapis.com/youtube/v3';
const MAX_PAGES = 4;

async function youtubeData(path, accessToken) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || 'YouTube rechazó el acceso a la biblioteca.');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function collectPages(path, accessToken) {
  const items = [];
  let pageToken = '';
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const data = await youtubeData(`${path}${pageToken ? `${separator}pageToken=${encodeURIComponent(pageToken)}` : ''}`, accessToken);
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken ?? '';
    if (!pageToken) break;
  }
  return items;
}

function thumbnailUrl(snippet) {
  const thumbnails = Object.values(snippet?.thumbnails ?? {});
  return thumbnails.at(-1)?.url ?? '';
}

export async function getOfficialYoutubeLibrary(accessToken) {
  if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 4096) {
    const error = new Error('Token de YouTube no válido.');
    error.status = 400;
    throw error;
  }

  const [playlistItems, likedItems] = await Promise.all([
    collectPages('/playlists?part=snippet,contentDetails&mine=true&maxResults=50', accessToken),
    collectPages('/videos?part=snippet,contentDetails&myRating=like&maxResults=50', accessToken),
  ]);

  return {
    playlists: playlistItems.map((item) => ({
      id: item.id,
      title: item.snippet?.title || 'Playlist sin título',
      description: item.snippet?.description || '',
      itemCount: Number(item.contentDetails?.itemCount) || 0,
      thumbnail: thumbnailUrl(item.snippet),
    })),
    likedSongs: likedItems.map((item) => ({
      id: item.id,
      title: item.snippet?.title || 'Canción sin título',
      artist: item.snippet?.channelTitle || 'Artista desconocido',
      artistId: item.snippet?.channelId || null,
      album: 'YouTube',
      albumId: null,
      duration: '--:--',
      durationSeconds: 0,
      thumbnail: thumbnailUrl(item.snippet),
    })),
  };
}
