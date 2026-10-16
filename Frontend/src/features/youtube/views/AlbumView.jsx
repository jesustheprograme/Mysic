// Adapta el álbum de YouTube al mismo detalle visual usado por Mysic.
import CollectionDetailView from '../../collections/CollectionDetailView.jsx';
import { DownloadButton } from '../components/DownloadButton.jsx';

function adaptSong(song, index) {
  return {
    ...song,
    albumTitle: song.album,
    artwork: song.thumbnail,
    source: 'youtube',
    trackNo: song.index ?? index + 1,
  };
}

export function AlbumView({ album, songListProps, onAddToPlaylist, onBack, onOpenArtist }) {
  const songs = album.tracks.map(adaptSong);

  function selectSong(songId) {
    const songIndex = album.tracks.findIndex((song) => song.id === songId);
    if (songIndex >= 0) songListProps.onPlay(album.tracks, songIndex);
  }

  return (
    <CollectionDetailView
      collection={{
        albumId: album.id,
        artist: album.artist,
        artistArtwork: album.thumbnail,
        artistId: album.artistId,
        artwork: album.thumbnail,
        description: album.info,
        kind: 'Álbum',
        title: album.title,
        year: album.year,
      }}
      onAddToPlaylist={onAddToPlaylist}
      onArtistSelect={onOpenArtist}
      onBack={onBack}
      onDownloadCollection={() => songListProps.onDownloadMany(album.tracks)}
      onPlaybackToggle={songListProps.onTogglePlay}
      onSongSelect={selectSong}
      renderTrackActions={(song) => (
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
