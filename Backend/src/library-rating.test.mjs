import assert from 'node:assert/strict'
import test from 'node:test'
import { audioPlaylistIdOf, channelIdOf, createLibraryRatingRoutes, likePayload, playlistLikePayload, subscribePayload } from './library-rating.mjs'

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
function fakeYoutube({ album, artist, reply = () => ({ success: true, status_code: 200, data: {} }) } = {}) {
  const calls = []
  return {
    calls,
    actions: { execute: async (endpoint, payload) => { calls.push({ endpoint, payload }); return reply(endpoint, payload) } },
    music: { getAlbum: async () => album, getArtist: async () => artist },
  }
}

test('cargas y ayudas: lista de audio del álbum, canal del botón de suscripción', () => {
  assert.deepEqual(likePayload('dQw4w9WgXcQ'), { target: { videoId: 'dQw4w9WgXcQ' } })
  assert.deepEqual(playlistLikePayload('OLAK5uy_x'), { target: { playlistId: 'OLAK5uy_x' } })
  assert.deepEqual(subscribePayload('UCabc'), { channelIds: ['UCabc'] })
  assert.equal(audioPlaylistIdOf({ url: 'https://music.youtube.com/playlist?list=OLAK5uy_m8_-X5ztw2lZNBog69jiVxnVHZW7CcKes' }), 'OLAK5uy_m8_-X5ztw2lZNBog69jiVxnVHZW7CcKes')
  assert.equal(audioPlaylistIdOf({ header: { audio_playlist_id: 'OLAK5uy_h' } }), 'OLAK5uy_h')
  assert.equal(audioPlaylistIdOf({ url: 'https://music.youtube.com/browse/MPREb_1' }), null)
  assert.equal(audioPlaylistIdOf(null), null)
  assert.equal(channelIdOf({ header: { subscription_button: { channel_id: 'UCreal' } } }), 'UCreal')
  assert.equal(channelIdOf({}), null)
})

test('canciones: Me gusta y quitarlo llaman a like y removelike con el id del vídeo', async () => {
  const youtube = fakeYoutube()
  const routes = createLibraryRatingRoutes({ clientFor: async () => youtube, hasAuth: async () => true, ready })
  const on = await run(routes.songOn, { params: { id: 'dQw4w9WgXcQ' } })
  assert.deepEqual(on.body, { ok: true, id: 'dQw4w9WgXcQ', on: true })
  const off = await run(routes.songOff, { params: { id: 'dQw4w9WgXcQ' } })
  assert.equal(off.body.on, false)
  assert.deepEqual(youtube.calls.map((call) => call.endpoint), ['/like/like', '/like/removelike'])
  assert.deepEqual(youtube.calls[0].payload, { target: { videoId: 'dQw4w9WgXcQ' }, client: 'YTMUSIC' })
})

test('álbumes: se guarda la lista de audio OLAK5uy… del álbum, no su id de navegación', async () => {
  const youtube = fakeYoutube({ album: { url: 'https://music.youtube.com/playlist?list=OLAK5uy_abc-123' } })
  const routes = createLibraryRatingRoutes({ clientFor: async () => youtube, hasAuth: async () => true, ready })
  assert.equal((await run(routes.albumOn, { params: { id: 'MPREb_1afh7aepuz4' } })).statusCode, 200)
  await run(routes.albumOff, { params: { id: 'MPREb_1afh7aepuz4' } })
  assert.deepEqual(youtube.calls.map((call) => [call.endpoint, call.payload.target.playlistId]), [['/like/like', 'OLAK5uy_abc-123'], ['/like/removelike', 'OLAK5uy_abc-123']])

  const sinLista = fakeYoutube({ album: { url: 'https://music.youtube.com/browse/x' } })
  const missing = createLibraryRatingRoutes({ clientFor: async () => sinLista, hasAuth: async () => true, ready })
  const res = await run(missing.albumOn, { params: { id: 'MPREb_1afh7aepuz4' } })
  assert.equal(res.statusCode, 404)
  assert.equal(sinLista.calls.length, 0, 'sin lista de audio no se llama a YouTube')
})

test('artistas: se sigue el canal del botón de suscripción, y si no hay se usa el id UC', async () => {
  const youtube = fakeYoutube({ artist: { header: { subscription_button: { channel_id: 'UCcanalReal' } } } })
  const routes = createLibraryRatingRoutes({ clientFor: async () => youtube, hasAuth: async () => true, ready })
  await run(routes.artistOn, { params: { id: 'UCnavegacion1' } })
  await run(routes.artistOff, { params: { id: 'UCnavegacion1' } })
  assert.deepEqual(youtube.calls.map((call) => [call.endpoint, call.payload.channelIds[0]]), [['/subscription/subscribe', 'UCcanalReal'], ['/subscription/unsubscribe', 'UCcanalReal']])

  const plain = fakeYoutube({ artist: { header: {} } })
  const fallback = createLibraryRatingRoutes({ clientFor: async () => plain, hasAuth: async () => true, ready })
  await run(fallback.artistOn, { params: { id: 'UCsoloId123' } })
  assert.equal(plain.calls[0].payload.channelIds[0], 'UCsoloId123')
})

test('errores: id no válido, sin cuenta, sesión caída, YouTube rechaza o falla', async () => {
  const youtube = fakeYoutube({ reply: () => ({ success: false, status_code: 403 }) })
  const routes = createLibraryRatingRoutes({ clientFor: async () => youtube, hasAuth: async () => true, ready })
  assert.equal((await run(routes.songOn, { params: { id: 'corto' } })).statusCode, 400)
  assert.equal(youtube.calls.length, 0, 'lo no válido no llega a YouTube')
  const denied = await run(routes.songOn, { params: { id: 'dQw4w9WgXcQ' } })
  assert.equal(denied.statusCode, 403)
  assert.equal(denied.body.code, 'RATING_NOT_ALLOWED')

  const down = createLibraryRatingRoutes({ clientFor: async () => fakeYoutube({ reply: () => ({ success: false, status_code: 500 }) }), hasAuth: async () => true, ready })
  const failed = await run(down.songOn, { params: { id: 'dQw4w9WgXcQ' } })
  assert.equal(failed.statusCode, 502)
  assert.equal(failed.body.code, 'YOUTUBE_RATING_FAILED')

  const unlinked = createLibraryRatingRoutes({ clientFor: async () => null, hasAuth: async () => false, ready })
  assert.equal((await run(unlinked.songOn, { params: { id: 'dQw4w9WgXcQ' } })).body.code, 'YOUTUBE_NOT_LINKED')
  const transient = createLibraryRatingRoutes({ clientFor: async () => null, hasAuth: async () => true, ready })
  assert.equal((await run(transient.songOn, { params: { id: 'dQw4w9WgXcQ' } })).statusCode, 503)
})
