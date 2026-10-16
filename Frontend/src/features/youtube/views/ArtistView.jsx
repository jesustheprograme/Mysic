// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/views/ArtistView.jsx
// Adapta el catálogo de YouTube al mismo componente visual usado por Mysic.
import MysicArtistView from '../../collections/ArtistView.jsx';
import { DownloadButton } from '../components/DownloadButton.jsx';

function getReleaseType(title, kind) {
  if (/ep/i.test(kind)) return 'ep';
  if (/single/i.test(title)) return 'single';
  if (/ep/i.test(title)) return 'ep';
  return 'album';
}

function adaptReleases(shelves) {
  return shelves.flatMap((shelf) => shelf.items.map((release) => ({
    artwork: release.thumbnail,
    id: release.id,
    releaseDate: release.year ? `${release.year}-01-01` : null,
    releaseType: getReleaseType(shelf.title, release.kind),
    songCount: null,
    songs: [],
    subtitle: release.kind !== 'Álbum' ? release.kind : release.artist,
    title: release.title,
  })));
}

export function ArtistView({ artist, songListProps, onOpenAlbum, onBack }) {
  const songs = artist.topSongs.map((song) => ({
    ...song,
    artwork: song.thumbnail,
    source: 'youtube',
  }));
  const releases = adaptReleases(artist.shelves);

  function selectSong(songId) {
    const songIndex = artist.topSongs.findIndex((song) => song.id === songId);
    if (songIndex >= 0) songListProps.onPlay(artist.topSongs, songIndex);
  }

  return (
    <MysicArtistView
      artist={{
        artistId: artist.id,
        artwork: artist.thumbnail,
        images: artist.images,
        title: artist.name,
      }}
      likedArtistIds={new Set()}
      likedSongIds={new Set()}
      onAddToPlaylist={songListProps.onAddToPlaylist}
      onAlbumSelect={onOpenAlbum}
      onBack={onBack}
      onPlaybackToggle={songListProps.onTogglePlay}
      onReleasePlay={(release) => onOpenAlbum(release.id)}
      onSongSelect={selectSong}
      releases={releases}
      renderSongActions={(song) => (
        <DownloadButton
          downloadedIds={songListProps.downloadedIds}
          jobs={songListProps.jobs}
          onDeleteDownload={songListProps.onDeleteDownload}
          onDownload={songListProps.onDownload}
          online={songListProps.online}
          song={song}
        />
      )}
      selectedSongId={songListProps.currentId}
      selectedSongPlaying={songListProps.isPlaying}
      songs={songs}
    />
  );
}
