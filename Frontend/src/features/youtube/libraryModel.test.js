import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLibrary, LIKED_ID, REPEAT_ID, thumb } from './libraryModel.js'

const likedSongs = [
  { id: 's1', thumbnail: 'a.jpg', album: 'Alba', albumId: 'MP1', artist: 'Ado', artistId: 'UC1' },
  { id: 's2', thumbnail: 'b.jpg', album: 'Alba', albumId: 'MP1', artist: 'Ado', artistId: 'UC1' },
  { id: 's3', thumbnail: 'c.jpg', album: 'Beta', albumId: 'MP2', artist: 'Zeta', artistId: 'UC2' },
  { id: 's4', thumbnail: 'd.jpg', artist: 'Sin álbum' },
]
const playlists = [{ id: 'PL1', title: 'Zumba', thumbnail: 'p.jpg', itemCount: 1 }, { id: 'PL2', title: 'Alegría', itemCount: 12 }]

test('deduce álbumes y artistas únicos con la forma de las secciones del inicio', () => {
  const library = buildLibrary({ likedSongs, playlists })
  assert.deepEqual(library.albums.map((entry) => [entry.kind, entry.id, entry.artist, entry.artistId]), [['album', 'MP1', 'Ado', 'UC1'], ['album', 'MP2', 'Zeta', 'UC2']])
  assert.deepEqual(library.artists.map((entry) => [entry.kind, entry.id, entry.name, entry.subtitle]), [['artist', 'UC1', 'Ado', '2 canciones'], ['artist', 'UC2', 'Zeta', '1 canción']])
  assert.deepEqual(library.playlists.map((entry) => [entry.kind, entry.id, entry.subtitle]), [['playlist', 'PL1', '1 canción'], ['playlist', 'PL2', '12 canciones']])
  assert.equal(library.pinned.at(-1).subtitle, '4 canciones')
})

test('filtra por texto y ordena de la A a la Z', () => {
  assert.deepEqual(buildLibrary({ likedSongs, playlists }, { sort: 'az' }).playlists.map((entry) => entry.title), ['Alegría', 'Zumba'])
  const filtered = buildLibrary({ likedSongs, playlists }, { query: 'zet' })
  assert.deepEqual(filtered.artists.map((entry) => entry.name), ['Zeta'])
  assert.equal(filtered.playlists.length, 0)
  assert.equal(filtered.pinned.length, 0)
})

// Sin ventana (Node) la densidad es 1: la tarjeta nominal de 180 px pide el escalón de 240.
test('thumb reescribe el tamaño de las imagenes de Google y respeta el resto', () => {
  assert.equal(thumb('https://lh3.googleusercontent.com/x=w544-h544-l90-rj'), 'https://lh3.googleusercontent.com/x=w240-h240-l90-rj')
  assert.equal(thumb('https://yt3.ggpht.com/y=s900-c-k'), 'https://yt3.ggpht.com/y=s240-c-k')
  assert.equal(thumb('https://lh3.googleusercontent.com/x=w544-h544-l90-rj', 44), 'https://lh3.googleusercontent.com/x=w96-h96-l90-rj')
  assert.equal(thumb('https://i.ytimg.com/vi/a/hq720.jpg'), 'https://i.ytimg.com/vi/a/hq720.jpg')
  // Una tarjeta de biblioteca es demasiado grande para mqdefault: la miniatura de vídeo se conserva.
  assert.equal(thumb('https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg'), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg')
  assert.equal(thumb(undefined), undefined)
})

test('buildLibrary entrega las carátulas ya al tamaño de la tarjeta', () => {
  const library = buildLibrary({ albums: [{ id: 'MPREb_1', title: 'Real', thumbnail: 'https://lh3.googleusercontent.com/a=w544-h544-l90-rj' }], likedSongs: [], playlists: [] })
  assert.equal(library.albums[0].thumbnail, 'https://lh3.googleusercontent.com/a=w240-h240-l90-rj')
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
  assert.deepEqual(library.albums.map((entry) => [entry.id, entry.artist, entry.year]), [['MPREb_1', 'Ado', 2024]])
  assert.deepEqual(library.artists.map((entry) => entry.id), ['UC9', 'UC8'])
  assert.equal(library.uploads[0].id, 'MPREb_u')
  assert.equal(library.playlists.length, 0)
})

test('En repetición aparece primero solo si hay canciones', () => {
  assert.equal(buildLibrary({ likedSongs, playlists }).pinned[0].id, LIKED_ID)
  const withRepeat = buildLibrary({ likedSongs, playlists }, { repeat: [likedSongs[0], likedSongs[1]] })
  assert.deepEqual(withRepeat.pinned.map((entry) => entry.id), [REPEAT_ID, LIKED_ID])
  assert.equal(withRepeat.pinned[0].subtitle, '2 canciones')
})