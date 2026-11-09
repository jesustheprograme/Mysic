import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLibrary, LIKED_ID, parseLibraryId, thumb } from './libraryModel.js'

const likedSongs = [
  { id: 's1', thumbnail: 'a.jpg', album: 'Alba', albumId: 'MP1', artist: 'Ado', artistId: 'UC1' },
  { id: 's2', thumbnail: 'b.jpg', album: 'Alba', albumId: 'MP1', artist: 'Ado', artistId: 'UC1' },
  { id: 's3', thumbnail: 'c.jpg', album: 'Beta', albumId: 'MP2', artist: 'Zeta', artistId: 'UC2' },
  { id: 's4', thumbnail: 'd.jpg', artist: 'Sin álbum' },
]
const playlists = [{ id: 'PL1', title: 'Zumba', thumbnail: 'p.jpg', itemCount: 1 }, { id: 'PL2', title: 'Alegría', itemCount: 12 }]

test('deduce álbumes y artistas únicos de las canciones que gustan', () => {
  const library = buildLibrary({ likedSongs, playlists })
  assert.deepEqual(library.albums.map((item) => item.id), ['al:MP1', 'al:MP2'])
  assert.deepEqual(library.artists.map((item) => [item.id, item.meta]), [['ar:UC1', '2 canciones'], ['ar:UC2', '1 canción']])
  assert.equal(library.pinned.at(-1).meta, '4 canciones')
  assert.equal(library.playlists[0].meta, '1 canción')
})

test('filtra por texto y ordena de la A a la Z', () => {
  assert.deepEqual(buildLibrary({ likedSongs, playlists }, { sort: 'az' }).playlists.map((item) => item.title), ['Alegría', 'Zumba'])
  const filtered = buildLibrary({ likedSongs, playlists }, { query: 'zet' })
  assert.deepEqual(filtered.artists.map((item) => item.title), ['Zeta'])
  assert.equal(filtered.playlists.length, 0)
  assert.equal(filtered.pinned.length, 0)
})

test('parseLibraryId separa el tipo del id aunque este contenga dos puntos', () => {
  assert.deepEqual(parseLibraryId('pl:VL:abc'), { kind: 'pl', id: 'VL:abc' })
  assert.deepEqual(parseLibraryId(LIKED_ID), { kind: LIKED_ID, id: LIKED_ID })
})
test('thumb reescribe el tamaño de las imagenes de Google y respeta el resto', () => {
  assert.equal(thumb('https://lh3.googleusercontent.com/x=w544-h544-l90-rj'), 'https://lh3.googleusercontent.com/x=w360-h360-l90-rj')
  assert.equal(thumb('https://yt3.ggpht.com/y=s900-c-k'), 'https://yt3.ggpht.com/y=s360-c-k')
  assert.equal(thumb('https://i.ytimg.com/vi/a/hq720.jpg'), 'https://i.ytimg.com/vi/a/hq720.jpg')
  assert.equal(thumb(undefined), undefined)
})

test('usa álbumes, artistas, suscripciones y subidos del servidor cuando existen', () => {
  const library = buildLibrary({
    likedSongs,
    playlists: [{ id: 'LM', title: 'Liked Music' }],
    albums: [{ id: 'MPREb_1', title: 'Real', artist: 'Ado', year: 2024 }, { id: 'MPREb_1', title: 'Duplicado' }],
    artists: [{ id: 'UC9', name: 'Real Artist', subtitle: '1 M suscriptores' }],
    subscriptions: [{ id: 'UC9', name: 'Real Artist' }, { id: 'UC8', name: 'Otro' }],
    uploads: [{ id: 'MPREb_u', title: 'Mi disco', artist: 'Yo' }],
  })
  assert.deepEqual(library.albums.map((item) => [item.id, item.meta]), [['al:MPREb_1', 'Ado · 2024']])
  assert.deepEqual(library.artists.map((item) => item.id), ['ar:UC9', 'ar:UC8'])
  assert.equal(library.uploads[0].id, 'al:MPREb_u')
  assert.equal(library.playlists.length, 0)
})

test('En repetición aparece primero solo si hay canciones', () => {
  assert.equal(buildLibrary({ likedSongs, playlists }).pinned[0].id, 'liked')
  const withRepeat = buildLibrary({ likedSongs, playlists }, { repeat: [likedSongs[0], likedSongs[1]] })
  assert.deepEqual(withRepeat.pinned.map((item) => item.id), ['repeat', 'liked'])
  assert.equal(withRepeat.pinned[0].meta, '2 canciones')
})