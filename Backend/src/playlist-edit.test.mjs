import assert from 'node:assert/strict'
import test from 'node:test'
import { barePlaylistId, createPlaylistEditRoutes, editPayload, editSucceeded, parseAddToPlaylist } from './playlist-edit.mjs'

// Forma de la respuesta de /playlist/get_add_to_playlist (YouTube Music), recortada.
const targetsResponse = {
  contents: [{
    addToPlaylistRenderer: {
      playlists: [
        { playlistAddToOptionRenderer: { playlistId: 'PLmine1', title: { simpleText: 'city pop' }, containsSelectedVideos: 'ALL', privacy: 'PRIVATE' } },
        { playlistAddToOptionRenderer: { playlistId: 'PLmine2', title: { runs: [{ text: 'quizás ' }, { text: 'colección' }] }, containsSelectedVideos: 'NONE', privacy: 'PUBLIC' } },
        { playlistAddToOptionRenderer: { playlistId: 'PLmine1', title: { simpleText: 'repetida' }, containsSelectedVideos: 'NONE' } },
      ],
      actions: [{ addToPlaylistCreateRenderer: { buttonText: { simpleText: 'Nueva playlist' } } }],
    },
  }],
}

test('parseAddToPlaylist: playlists editables, si ya tienen la canción, sin repetidas', () => {
  assert.deepEqual(parseAddToPlaylist(targetsResponse), [
    { id: 'PLmine1', title: 'city pop', contains: true, privacy: 'PRIVATE' },
    { id: 'PLmine2', title: 'quizás colección', contains: false, privacy: 'PUBLIC' },
  ])
  assert.deepEqual(parseAddToPlaylist(null), [])
  assert.deepEqual(parseAddToPlaylist({ contents: [] }), [])
})

test('editPayload: añadir sin duplicar y quitar por id de vídeo; el prefijo VL se quita', () => {
  assert.equal(barePlaylistId('VLPLabc'), 'PLabc')
  assert.equal(barePlaylistId('PLabc'), 'PLabc')
  assert.equal(barePlaylistId('VLmine'), 'VLmine', 'solo se quita VL delante de un id de playlist conocido')
  assert.deepEqual(editPayload('VLPLabc', 'dQw4w9WgXcQ', true), {
    playlistId: 'PLabc',
    actions: [{ action: 'ACTION_ADD_VIDEO', addedVideoId: 'dQw4w9WgXcQ', dedupeOption: 'DEDUPE_OPTION_SKIP' }],
  })
  assert.deepEqual(editPayload('PLabc', 'dQw4w9WgXcQ', false).actions, [{ action: 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID', removedVideoId: 'dQw4w9WgXcQ' }])
  assert.equal(editSucceeded({ status: 'STATUS_SUCCEEDED' }), true)
  assert.equal(editSucceeded({ status: 'STATUS_FAILED' }), false)
})

// --- Rutas con un cliente de YouTube falso ---
const ready = (_req, _res, next) => next()
function response() {
  const res = { statusCode: 200, body: null, headers: {}, headersSent: false }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; res.headersSent = true; return res }
  res.setHeader = (name, value) => { res.headers[name] = value }
  return res
}
async function run(handlers, req) {
  const res = response()
  for (const handler of handlers) {
    let advanced = false
    await handler(req, res, () => { advanced = true })
    if (!advanced) break
  }
  return res
}
const fakeYoutube = (reply) => {
  const calls = []
  return { calls, actions: { execute: async (endpoint, payload) => { calls.push({ endpoint, payload }); return reply(endpoint, payload) } } }
}

test('rutas: listar, añadir y quitar con la sesión del usuario', async () => {
  const youtube = fakeYoutube((endpoint) => (endpoint === '/playlist/get_add_to_playlist'
    ? { success: true, status_code: 200, data: targetsResponse }
    : { success: true, status_code: 200, data: { status: 'STATUS_SUCCEEDED' } }))
  const routes = createPlaylistEditRoutes({ clientFor: async () => youtube, hasAuth: async () => true, ready })

  const listed = await run(routes.targets, { params: { videoId: 'dQw4w9WgXcQ' } })
  assert.equal(listed.statusCode, 200)
  assert.equal(listed.body.playlists.length, 2)
  assert.deepEqual(youtube.calls[0], { endpoint: '/playlist/get_add_to_playlist', payload: { videoIds: ['dQw4w9WgXcQ'], excludeWatchLater: true, client: 'YTMUSIC' } })

  const added = await run(routes.add, { params: { id: 'PLmine2' }, body: { videoId: 'dQw4w9WgXcQ' } })
  assert.deepEqual(added.body, { ok: true, playlistId: 'PLmine2', videoId: 'dQw4w9WgXcQ', contains: true })
  assert.equal(youtube.calls[1].endpoint, '/browse/edit_playlist')
  assert.equal(youtube.calls[1].payload.actions[0].action, 'ACTION_ADD_VIDEO')

  const removed = await run(routes.remove, { params: { id: 'PLmine1', videoId: 'dQw4w9WgXcQ' } })
  assert.equal(removed.body.contains, false)
  assert.equal(youtube.calls[2].payload.actions[0].action, 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID')
})

test('rutas: entradas no válidas, sin cuenta, playlist ajena y YouTube caído', async () => {
  const denied = fakeYoutube(() => ({ success: true, status_code: 200, data: { status: 'STATUS_FAILED' } }))
  const routes = createPlaylistEditRoutes({ clientFor: async () => denied, hasAuth: async () => true, ready })
  assert.equal((await run(routes.add, { params: { id: 'PL x' }, body: { videoId: 'dQw4w9WgXcQ' } })).statusCode, 400)
  assert.equal((await run(routes.add, { params: { id: 'PLok' }, body: { videoId: 'corto' } })).statusCode, 400)
  assert.equal(denied.calls.length, 0, 'lo no válido no llega a YouTube')
  const notMine = await run(routes.add, { params: { id: 'PLajena' }, body: { videoId: 'dQw4w9WgXcQ' } })
  assert.equal(notMine.statusCode, 403)
  assert.equal(notMine.body.code, 'PLAYLIST_NOT_EDITABLE')

  const unlinked = createPlaylistEditRoutes({ clientFor: async () => null, hasAuth: async () => false, ready })
  assert.equal((await run(unlinked.targets, { params: { videoId: 'dQw4w9WgXcQ' } })).body.code, 'YOUTUBE_NOT_LINKED')
  const transient = createPlaylistEditRoutes({ clientFor: async () => null, hasAuth: async () => true, ready })
  assert.equal((await run(transient.targets, { params: { videoId: 'dQw4w9WgXcQ' } })).statusCode, 503)

  const down = createPlaylistEditRoutes({ clientFor: async () => fakeYoutube(() => ({ success: false, status_code: 500 })), hasAuth: async () => true, ready })
  const failed = await run(down.add, { params: { id: 'PLok' }, body: { videoId: 'dQw4w9WgXcQ' } })
  assert.equal(failed.statusCode, 502)
  assert.equal(failed.body.code, 'YOUTUBE_EDIT_FAILED')
})
