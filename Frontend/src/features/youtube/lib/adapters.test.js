import assert from 'node:assert/strict'
import test from 'node:test'
import { adaptBrowseItem, adaptSong } from './adapters.js'

test('normaliza artista y duración textual en canciones destacadas', () => {
  const song = adaptSong({ album: 'Kyogen', duration: '3:16', id: 'song-1', title: 'Usseewa' }, 0, {
    artist: 'Ado',
    artistId: 'artist-1',
  })

  assert.equal(song.artist, 'Ado')
  assert.equal(song.artistId, 'artist-1')
  assert.equal(song.albumTitle, 'Kyogen')
  assert.equal(song.durationSeconds, 196)
})

test('muestra el lanzamiento de una canción en vez de una duración desconocida', () => {
  assert.deepEqual(adaptBrowseItem({
    album: 'Little Busters',
    artist: 'the pillows',
    duration: '--:--',
    id: 'song-1',
    kind: 'song',
    thumbnail: 'cover.jpg',
    title: 'Patricia',
  }), {
    artwork: 'cover.jpg',
    artist: 'the pillows',
    artistId: undefined,
    detail: 'Little Busters',
    detailId: undefined,
    id: 'song-1',
    title: 'Patricia',
  })
})

test('identifica como sencillo una canción sin lanzamiento publicado', () => {
  assert.equal(adaptBrowseItem({ id: 'song-2', kind: 'song', title: 'Demo' }).detail, 'Sencillo')
})
