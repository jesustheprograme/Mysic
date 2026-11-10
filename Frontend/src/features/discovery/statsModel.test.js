import assert from 'node:assert/strict'
import test from 'node:test'
import { buildStats, formatHours } from './statsModel.js'

const songs = [
  { id: 's1', artistId: 'a1', artist: 'Ado', durationSeconds: 120 },
  { id: 's2', artistId: 'a1', artist: 'Ado', durationSeconds: 180 },
  { id: 's3', artistId: 'a2', artist: 'Zeta', durationSeconds: 60 },
]

test('con catálogo del servidor usa sus canciones', () => {
  const stats = buildStats({ albumItems: [{}, {}], artistItems: [{ artistId: 'a1', title: 'Ado' }, { artistId: 'a2', title: 'Zeta' }], likedSongIds: new Set(['s1']), songs })
  assert.equal(stats.source, 'server')
  assert.deepEqual(stats.cards.map((card) => card.value), [3, 2, 2, 1, '6 min'])
  assert.deepEqual(stats.top.map((item) => [item.title, item.songCount]), [['Ado', 2], ['Zeta', 1]])
})

test('sin catálogo cae a la biblioteca de YouTube guardada', () => {
  const youtube = {
    likedSongs: [...songs, { id: 's4', artist: 'Sin id' }],
    playlists: [{ id: 'VLLM' }, { id: 'PL1' }, { id: 'PL2' }],
    albums: [{ id: 'MPRE1' }],
    artists: [{ id: 'UC1' }, { id: 'UC2' }],
    subscriptions: [{ id: 'UC3' }],
  }
  const stats = buildStats({ songs: [], youtube })
  assert.equal(stats.source, 'youtube')
  assert.deepEqual(stats.cards.map((card) => [card.label, card.value]), [['Me gusta', 4], ['Playlists', 2], ['Álbumes', 1], ['Artistas', 3], ['Tiempo total', '6 min']])
  assert.deepEqual(stats.top.map((item) => item.title), ['Ado', 'Zeta'])
})

test('sin catálogo ni biblioteca no falla y muestra ceros; deduce álbumes y artistas de los Me gusta', () => {
  assert.deepEqual(buildStats({}).cards.map((card) => card.value), [0, 0, 0, 0, '0 min'])
  const derived = buildStats({ youtube: { likedSongs: [{ id: 'x', albumId: 'm', artistId: 'u' }, { id: 'y', albumId: 'm', artistId: 'v' }] } })
  assert.deepEqual(derived.cards.map((card) => card.value).slice(0, 4), [2, 0, 1, 2])
})

test('formatHours', () => {
  assert.equal(formatHours(0), '0 min')
  assert.equal(formatHours(59 * 60), '59 min')
  assert.equal(formatHours(3 * 3600 + 5 * 60), '3 h 5 min')
})