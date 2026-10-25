import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getPlaylistTracks,
  playlistHasTrack,
  reorderPlaylistTracks,
  resolvePlaylistSongs,
  setPlaylistTrack,
} from './playlistTracks.js'

const localSong = { id: 'same-id', title: 'Local' }
const youtubeSong = { id: 'same-id', source: 'youtube', title: 'Global', duration: '3:00' }

test('distingue pistas con el mismo ID según su fuente', () => {
  const playlist = { tracks: [{ id: 'same-id', source: 'local' }] }

  assert.equal(playlistHasTrack(playlist, localSong), true)
  assert.equal(playlistHasTrack(playlist, youtubeSong), false)
})

test('migra el formato anterior sin perder canciones', () => {
  const playlist = { songIds: ['local-1'], externalSongs: [{ id: 'yt-1', source: 'youtube', title: 'Global' }] }

  assert.deepEqual(getPlaylistTracks(playlist).map((track) => `${track.source}:${track.id}`), [
    'local:local-1',
    'youtube:yt-1',
  ])
})

test('conserva el orden mixto al resolver y reordenar', () => {
  const playlist = {
    tracks: [
      { id: 'local-1', source: 'local' },
      { id: 'yt-1', source: 'youtube', title: 'Global' },
    ],
  }
  const reordered = reorderPlaylistTracks(playlist, 'youtube:yt-1', 'local:local-1')
  const songs = resolvePlaylistSongs({ tracks: reordered }, [{ id: 'local-1', title: 'Local' }])

  assert.deepEqual(songs.map((song) => song.title), ['Global', 'Local'])
  assert.deepEqual(songs.map((song) => song.trackKey), ['youtube:yt-1', 'local:local-1'])
})

test('agrega una pista global normalizada al contrato común', () => {
  const tracks = setPlaylistTrack({ tracks: [] }, youtubeSong, true)

  assert.equal(tracks[0].source, 'youtube')
  assert.equal(tracks[0].durationSeconds, 180)
})
