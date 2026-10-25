import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeYoutubePlaylistSong } from './playlistSong.js'

test('normaliza una pista de YouTube para guardarla en una playlist', () => {
  assert.deepEqual(normalizeYoutubePlaylistSong({
    id: 'video-1',
    title: 'Canción',
    artist: 'Artista',
    artwork: 'https://example.com/cover.jpg',
    durationSeconds: 185,
    extra: 'no se persiste',
  }), {
    id: 'video-1',
    title: 'Canción',
    artist: 'Artista',
    artistId: null,
    album: 'Sencillo',
    albumId: null,
    duration: '--:--',
    durationSeconds: 185,
    thumbnail: 'https://example.com/cover.jpg',
    source: 'youtube',
  })
})

test('recupera la duración textual de una canción externa existente', () => {
  const song = normalizeYoutubePlaylistSong({
    id: 'video-2',
    title: 'Canción externa',
    duration: '3:21',
    durationSeconds: 0,
  })

  assert.equal(song.durationSeconds, 201)
})
