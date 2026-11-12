import assert from 'node:assert/strict'
import test from 'node:test'
import { createLibraryCursors, isLibraryKind, LIBRARY_SECTIONS, loadLibraryOverview, loadLibraryPage } from './library-pages.mjs'

// Una "biblioteca" falsa: cada categoría tiene páginas; las extendidas usan tokens y las dos de youtubei.js páginas con objetos.
const rawPage = (ids, token, kind = 'album') => ({
  data: { contents: ids.map((id) => ({ musicTwoRowItemRenderer: {
    navigationEndpoint: { browseEndpoint: { browseId: kind === 'artist' ? `UC${id}` : `MPREb_${id}` } },
    title: { runs: [{ text: `T${id}` }] }, subtitle: { runs: [{ text: 'Artista' }] },
    thumbnailRenderer: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: `https://x/${id}.jpg`, width: 100, height: 100 }] } } },
  } })), ...(token ? { continuations: [{ nextContinuationData: { continuation: token } }] } : {}) },
})

function fakeYoutube({ albums = [['a1', 'a2'], ['a3']], fail = {}, calls = [], slow = {} } = {}) {
  const pages = { albums }
  return {
    calls,
    actions: {
      execute: async (endpoint, payload) => {
        const browseId = payload.browseId
        const key = browseId?.includes('liked_albums') ? 'albums' : browseId?.includes('track_artists') ? 'artists' : browseId?.includes('corpus_artists') ? 'subscriptions' : browseId?.includes('owned_releases') ? 'uploads' : null
        const index = payload.continuation ? Number(payload.continuation.replace('tok', '')) : 0
        calls.push(`${key ?? payload.continuation}:${index}`)
        if (key && fail[key]) throw new Error(`fallo simulado ${key}`)
        if (key && slow[key]) await new Promise(() => {})
        const list = pages[key ?? 'albums'] ?? (key === 'artists' ? [['1']] : [])
        const ids = list[index] ?? []
        return rawPage(ids, index + 1 < list.length ? `tok${index + 1}` : '', key === 'artists' || key === 'subscriptions' ? 'artist' : 'album')
      },
    },
    music: {
      getPlaylist: async () => ({
        items: [{ item_type: 'song', id: 'cancion1', title: 'C1', artists: [{ name: 'A', channel_id: 'UC1' }] }],
        has_continuation: true,
        getContinuation: async () => ({ items: [{ item_type: 'song', id: 'cancion2', title: 'C2', artists: [] }], has_continuation: false }),
      }),
    },
  }
}

test('la lista de categorías es la esperada', () => {
  assert.deepEqual(Object.keys(LIBRARY_SECTIONS), ['playlists', 'liked-songs', 'albums', 'artists', 'subscriptions', 'uploads'])
  assert.equal(isLibraryKind('albums'), true)
  assert.equal(isLibraryKind('constructor'), false)
  assert.equal(isLibraryKind('__proto__'), false)
})

test('una categoría pagina: primera página con cursor y siguiente sin cursor al terminar', async () => {
  const cursors = createLibraryCursors()
  const youtube = fakeYoutube()
  const first = await loadLibraryPage('albums', youtube, { cursors, userId: 'u1' })
  assert.deepEqual(first.items.map((item) => item.id), ['MPREb_a1', 'MPREb_a2'])
  assert.equal(first.hasMore, true)
  assert.equal(typeof first.continuation, 'string')
  const second = await loadLibraryPage('albums', youtube, { cursor: first.continuation, cursors, userId: 'u1' })
  assert.deepEqual(second.items.map((item) => item.id), ['MPREb_a3'])
  assert.deepEqual([second.hasMore, second.continuation], [false, null])
})

test('las canciones con Me gusta paginan con los objetos de youtubei.js', async () => {
  const cursors = createLibraryCursors()
  const youtube = fakeYoutube()
  const first = await loadLibraryPage('liked-songs', youtube, { cursors, userId: 'u1' })
  assert.deepEqual(first.items.map((item) => item.id), ['cancion1'])
  assert.equal(first.hasMore, true)
  const second = await loadLibraryPage('liked-songs', youtube, { cursor: first.continuation, cursors, userId: 'u1' })
  assert.deepEqual(second.items.map((item) => item.id), ['cancion2'])
  assert.equal(second.hasMore, false)
})

test('el cursor solo sirve a su dueño y a su categoría; caduca; inventado falla con CURSOR_EXPIRED', async () => {
  let current = 1000
  const cursors = createLibraryCursors({ now: () => current, ttlMs: 500 })
  const youtube = fakeYoutube()
  const first = await loadLibraryPage('albums', youtube, { cursors, userId: 'u1' })
  await assert.rejects(loadLibraryPage('albums', youtube, { cursor: first.continuation, cursors, userId: 'u2' }), { code: 'CURSOR_EXPIRED' })
  await assert.rejects(loadLibraryPage('artists', youtube, { cursor: first.continuation, cursors, userId: 'u1' }), { code: 'CURSOR_EXPIRED' })
  await assert.rejects(loadLibraryPage('albums', youtube, { cursor: 'inventado', cursors, userId: 'u1' }), { code: 'CURSOR_EXPIRED' })
  current += 501
  await assert.rejects(loadLibraryPage('albums', youtube, { cursor: first.continuation, cursors, userId: 'u1' }), { code: 'CURSOR_EXPIRED' })
})

test('repetir un cursor no vuelve a consultar a YouTube; un fallo permite reintentar', async () => {
  const cursors = createLibraryCursors()
  const calls = []
  const youtube = fakeYoutube({ calls })
  const first = await loadLibraryPage('albums', youtube, { cursors, userId: 'u1' })
  const [a, b] = await Promise.all([
    loadLibraryPage('albums', youtube, { cursor: first.continuation, cursors, userId: 'u1' }),
    loadLibraryPage('albums', youtube, { cursor: first.continuation, cursors, userId: 'u1' }),
  ])
  assert.equal(a, b)
  assert.equal(calls.filter((call) => call.startsWith('tok1')).length, 1)

  let attempts = 0
  const flaky = fakeYoutube()
  const original = flaky.actions.execute
  flaky.actions.execute = async (endpoint, payload) => { if (payload.continuation && (attempts += 1) === 1) throw new Error('boom'); return original(endpoint, payload) }
  const firstFlaky = await loadLibraryPage('albums', flaky, { cursors, userId: 'u1' })
  await assert.rejects(loadLibraryPage('albums', flaky, { cursor: firstFlaky.continuation, cursors, userId: 'u1' }), /boom/)
  assert.deepEqual((await loadLibraryPage('albums', flaky, { cursor: firstFlaky.continuation, cursors, userId: 'u1' })).items.map((item) => item.id), ['MPREb_a3'])
})

test('un token repetido de YouTube corta la cadena (sin bucles)', async () => {
  const cursors = createLibraryCursors()
  const looping = { actions: { execute: async () => rawPage(['x1'], 'mismo') }, music: {} }
  const first = await loadLibraryPage('albums', looping, { cursors, userId: 'u1' })
  assert.equal(first.hasMore, true)
  const second = await loadLibraryPage('albums', looping, { cursor: first.continuation, cursors, userId: 'u1' })
  assert.equal(second.hasMore, false, 'el mismo token ya visto no genera otro cursor')
})

test('la vista general trae la primera página de las seis categorías en paralelo', async () => {
  const cursors = createLibraryCursors()
  const youtube = fakeYoutube()
  const overview = await loadLibraryOverview(youtube, { cursors, userId: 'u1' })
  assert.deepEqual(Object.keys(overview.sections), ['playlists', 'likedSongs', 'albums', 'artists', 'subscriptions', 'uploads'])
  assert.deepEqual(overview.errors, [])
  assert.equal(overview.sections.albums.items.length, 2)
  assert.equal(overview.sections.albums.hasMore, true)
  assert.equal(overview.sections.likedSongs.items.length, 1)
})

test('un fallo o un tiempo agotado en una categoría no tumba las demás', async () => {
  const cursors = createLibraryCursors()
  const youtube = fakeYoutube({ fail: { artists: true }, slow: { uploads: true } })
  const overview = await loadLibraryOverview(youtube, { cursors, timeoutMs: 30, userId: 'u1' })
  assert.deepEqual(overview.errors.sort(), ['artists', 'uploads'])
  assert.equal(overview.sections.albums.items.length, 2)
  assert.equal(overview.sections.artists.error, 'LIBRARY_PAGE_FAILED')
  assert.equal(overview.sections.uploads.error, 'LIBRARY_TIMEOUT')
  assert.deepEqual(overview.sections.artists.items, [])
})

test('si fallan todas las categorías la vista general falla', async () => {
  const youtube = { actions: { execute: async () => { throw new Error('sin red') } }, music: { getPlaylist: async () => { throw new Error('sin red') } } }
  await assert.rejects(loadLibraryOverview(youtube, { cursors: createLibraryCursors(), userId: 'u1' }), { code: 'LIBRARY_PAGE_FAILED' })
})

test('clearUser descarta solo los cursores de ese usuario y el total está acotado', async () => {
  const cursors = createLibraryCursors({ max: 3 })
  const youtube = fakeYoutube()
  const mine = await loadLibraryPage('albums', youtube, { cursors, userId: 'u1' })
  const theirs = await loadLibraryPage('albums', youtube, { cursors, userId: 'u2' })
  cursors.clearUser('u1')
  await assert.rejects(loadLibraryPage('albums', youtube, { cursor: mine.continuation, cursors, userId: 'u1' }), { code: 'CURSOR_EXPIRED' })
  assert.ok((await loadLibraryPage('albums', youtube, { cursor: theirs.continuation, cursors, userId: 'u2' })).items.length)
  for (let index = 0; index < 10; index += 1) await loadLibraryPage('albums', youtube, { cursors, userId: `x${index}` })
  assert.equal(cursors.size, 3)
})
test('clearUser invalida también un cursor creado tarde por una página que ya estaba en vuelo', async () => {
  const cursors = createLibraryCursors()
  let releasePage
  const youtube = {
    actions: {
      execute: async () => new Promise((resolve) => {
        releasePage = () => resolve(rawPage(['tardia'], 'siguiente'))
      }),
    },
    music: {},
  }

  const loading = loadLibraryPage('albums', youtube, { cursors, userId: 'u1' })
  await new Promise((resolve) => setImmediate(resolve))
  cursors.clearUser('u1')
  releasePage()
  const stalePage = await loading

  assert.equal(stalePage.hasMore, true)
  await assert.rejects(loadLibraryPage('albums', youtube, { cursor: stalePage.continuation, cursors, userId: 'u1' }), { code: 'CURSOR_EXPIRED' })
})
test('las playlists paginan con la continuación de la página y salen ya mapeadas', async () => {
  const card = (id, title) => ({ item_type: 'playlist', id: `VL${id}`, title, subtitle: '12 canciones', thumbnails: [{ url: `https://x/${id}.jpg`, width: 10, height: 10 }] })
  const second = { contents_memo: new Map([['MusicTwoRowItem', [card('PL2', 'Segunda')]]]) }
  const first = { contents_memo: new Map([['MusicTwoRowItem', [card('PL1', 'Primera')]], ['ContinuationItem', [{ endpoint: { call: async () => second } }]]]) }
  const youtube = { actions: { execute: async () => first }, music: {} }
  const cursors = createLibraryCursors()
  const a = await loadLibraryPage('playlists', youtube, { cursors, userId: 'u1' })
  assert.deepEqual(a.items.map((item) => [item.id, item.title, item.itemCount]), [['PL1', 'Primera', 12]])
  assert.equal(a.hasMore, true)
  const b = await loadLibraryPage('playlists', youtube, { cursor: a.continuation, cursors, userId: 'u1' })
  assert.deepEqual(b.items.map((item) => item.id), ['PL2'])
  assert.equal(b.hasMore, false)
})
