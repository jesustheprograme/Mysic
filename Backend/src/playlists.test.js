const test = require('node:test')
const assert = require('node:assert/strict')
const { isAcceptedArtworkFile, resolvePublicTracks, resolveStoredSongIds } = require('./playlists')

test('resuelve slugs persistentes al ID del catálogo activo sin perder el orden', () => {
  const playlist = { songSlugs: ['magic-stable', 'hello-stable'] }
  const localSongs = [
    { id: 'local-hello', slug: 'hello-stable' },
    { id: 'local-magic', slug: 'magic-stable' },
  ]

  assert.deepEqual(resolveStoredSongIds(playlist, localSongs), ['local-magic', 'local-hello'])
})

test('mantiene compatibilidad con playlists antiguas del catálogo actual', () => {
  const playlist = { songIds: ['local-magic', 'missing-song'] }
  const localSongs = [{ id: 'local-magic', slug: 'magic-stable' }]

  assert.deepEqual(resolveStoredSongIds(playlist, localSongs), ['local-magic'])
})

test('usa título y artista cuando el slug cambia entre catálogos', () => {
  const playlist = {
    songRefs: [{ slug: 'production-magic', title: 'MAGIC', artist: 'Ado' }],
  }
  const localSongs = [{
    id: 'local-magic',
    slug: 'local-magic-slug',
    title: 'MAGIC',
    artists: [{ artist: { name: 'Ado' } }],
  }]

  assert.deepEqual(resolveStoredSongIds(playlist, localSongs), ['local-magic'])
})

test('migra playlists antiguas al contrato unificado', () => {
  const playlist = {
    externalSongs: [{ id: 'yt-1', source: 'youtube', title: 'Global' }],
  }

  assert.deepEqual(resolvePublicTracks(playlist, ['local-1']), [
    { id: 'local-1', source: 'local' },
    { id: 'yt-1', source: 'youtube', title: 'Global' },
  ])
})

test('conserva el orden mixto y actualiza IDs locales resueltos', () => {
  const playlist = {
    externalSongs: [{ id: 'yt-1', source: 'youtube', title: 'Global' }],
    tracks: [
      { id: 'yt-1', source: 'youtube', title: 'Global' },
      { id: 'local-antiguo', source: 'local' },
    ],
  }

  assert.deepEqual(resolvePublicTracks(playlist, ['local-actual']), [
    { id: 'yt-1', source: 'youtube', title: 'Global' },
    { id: 'local-actual', source: 'local' },
  ])
})

test('acepta portadas cuando MIME y extensión son imágenes permitidas', () => {
  assert.equal(isAcceptedArtworkFile({ mimetype: 'image/jpeg', originalname: 'cover.jpg' }), true)
  assert.equal(isAcceptedArtworkFile({ mimetype: 'image/png', originalname: 'cover.PNG' }), true)
  assert.equal(isAcceptedArtworkFile({ mimetype: 'image/webp', originalname: 'cover.webp' }), true)
})

test('rechaza archivos con MIME o extensión simulados', () => {
  assert.equal(isAcceptedArtworkFile({ mimetype: 'application/javascript', originalname: 'cover.jpg' }), false)
  assert.equal(isAcceptedArtworkFile({ mimetype: 'image/jpeg', originalname: 'cover.exe' }), false)
})
