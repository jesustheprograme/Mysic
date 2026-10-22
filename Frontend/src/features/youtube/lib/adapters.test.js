import assert from 'node:assert/strict'
import test from 'node:test'
import { adaptBrowseItem } from './adapters.js'

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
    detail: 'Little Busters',
    id: 'song-1',
    title: 'Patricia',
  })
})

test('identifica como sencillo una canción sin lanzamiento publicado', () => {
  assert.equal(adaptBrowseItem({ id: 'song-2', kind: 'song', title: 'Demo' }).detail, 'Sencillo')
})
