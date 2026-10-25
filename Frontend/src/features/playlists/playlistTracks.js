import { normalizeYoutubePlaylistSong } from '../youtube/lib/playlistSong.js'

export function getTrackKey(track) {
  const source = track?.source === 'youtube' ? 'youtube' : 'local'
  return track?.id ? `${source}:${track.id}` : ''
}

export function getPlaylistTracks(playlist) {
  if (Array.isArray(playlist?.tracks)) return playlist.tracks

  const localTracks = (playlist?.songIds ?? []).map((id) => ({ id, source: 'local' }))
  const youtubeTracks = (playlist?.externalSongs ?? []).map(normalizeYoutubePlaylistSong)
  return [...localTracks, ...youtubeTracks]
}

export function getPlaylistTrackCount(playlist) {
  return getPlaylistTracks(playlist).length
}

export function playlistHasTrack(playlist, song) {
  const key = getTrackKey(song)
  return getPlaylistTracks(playlist).some((track) => getTrackKey(track) === key)
}

export function resolvePlaylistSongs(playlist, librarySongs) {
  const localSongs = new Map(librarySongs.map((song) => [song.id, song]))

  return getPlaylistTracks(playlist).flatMap((track) => {
    const key = getTrackKey(track)
    if (track.source === 'youtube') {
      const song = normalizeYoutubePlaylistSong(track)
      return [{ ...song, artwork: song.thumbnail, trackKey: key }]
    }

    const song = localSongs.get(track.id)
    return song ? [{ ...song, trackKey: key }] : []
  })
}

export function setPlaylistTrack(playlist, song, included) {
  const tracks = getPlaylistTracks(playlist)
  const key = getTrackKey(song)
  const alreadyIncluded = tracks.some((track) => getTrackKey(track) === key)
  if (included === alreadyIncluded) return tracks

  if (!included) return tracks.filter((track) => getTrackKey(track) !== key)
  const track = song.source === 'youtube'
    ? normalizeYoutubePlaylistSong(song)
    : { id: song.id, source: 'local' }
  return [...tracks, track]
}

export function reorderPlaylistTracks(playlist, draggedKey, targetKey) {
  const tracks = [...getPlaylistTracks(playlist)]
  const sourceIndex = tracks.findIndex((track) => getTrackKey(track) === draggedKey)
  const targetIndex = tracks.findIndex((track) => getTrackKey(track) === targetKey)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return tracks

  const [movedTrack] = tracks.splice(sourceIndex, 1)
  tracks.splice(targetIndex, 0, movedTrack)
  return tracks
}
