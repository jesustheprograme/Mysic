const assert = require('node:assert/strict')
const test = require('node:test')
const { createResponseCache } = require('./response-cache')

function fakeRes() {
  const headers = {}
  const res = {
    statusCode: 200,
    headers,
    body: undefined,
    set(name, value) { headers[name] = value; return res },
    status(code) { res.statusCode = code; return res },
    json(body) { res.body = body; return res },
  }
  return res
}

function request(cache, { userId = 'u1', url = '/api/youtube/home', method = 'GET', status = 200, body = { n: 1 } } = {}) {
  const req = { method, originalUrl: url, mysicUser: userId ? { _id: userId } : undefined }
  const res = fakeRes()
  let reachedHandler = false
  cache.middleware(req, res, () => {
    reachedHandler = true
    res.statusCode = status
    res.json(body)
  })
  return { reachedHandler, res }
}

test('sirve desde caché la segunda petición del mismo usuario', () => {
  const cache = createResponseCache({ ttlMs: 1000 })
  assert.equal(request(cache, { body: { n: 1 } }).reachedHandler, true)

  const second = request(cache, { body: { n: 2 } })
  assert.equal(second.reachedHandler, false)
  assert.deepEqual(second.res.body, { n: 1 })
  assert.equal(second.res.headers['X-Mysic-Cache'], 'HIT')
  assert.equal(second.res.headers['Cache-Control'], 'private, no-store')
})

test('no mezcla usuarios ni consultas distintas', () => {
  const cache = createResponseCache({ ttlMs: 1000 })
  request(cache, { userId: 'u1', body: { owner: 'u1' } })
  assert.equal(request(cache, { userId: 'u2', body: { owner: 'u2' } }).reachedHandler, true)
  assert.equal(request(cache, { userId: 'u1', url: '/api/youtube/home?x=1' }).reachedHandler, true)
})

test('no cachea respuestas que no son 200 ni peticiones sin usuario', () => {
  const cache = createResponseCache({ ttlMs: 1000 })
  request(cache, { status: 503, body: { message: 'arrancando' } })
  assert.equal(request(cache).reachedHandler, true)

  assert.equal(request(cache, { userId: null }).reachedHandler, true)
  assert.equal(request(cache, { userId: null }).reachedHandler, true)
})

test('expira por TTL', () => {
  let time = 0
  const cache = createResponseCache({ ttlMs: 10, now: () => time })
  request(cache)
  time = 9
  assert.equal(request(cache).reachedHandler, false)
  time = 10
  assert.equal(request(cache).reachedHandler, true)
})

test('una escritura del usuario invalida su caché', () => {
  const cache = createResponseCache({ ttlMs: 1000 })
  request(cache)
  cache.invalidateOnWrite({ method: 'DELETE', mysicUser: { _id: 'u1' } }, fakeRes(), () => {})
  assert.equal(request(cache).reachedHandler, true)

  request(cache, { userId: 'u2' })
  cache.invalidateOnWrite({ method: 'GET', mysicUser: { _id: 'u2' } }, fakeRes(), () => {})
  assert.equal(request(cache, { userId: 'u2' }).reachedHandler, false)
})

test('acota usuarios y entradas por usuario', () => {
  const cache = createResponseCache({ ttlMs: 1000, maxUsers: 1, maxPerUser: 1 })
  request(cache, { userId: 'u1' })
  request(cache, { userId: 'u2' })
  assert.equal(request(cache, { userId: 'u1' }).reachedHandler, true)

  request(cache, { userId: 'u3', url: '/a' })
  request(cache, { userId: 'u3', url: '/b' })
  assert.equal(request(cache, { userId: 'u3', url: '/a' }).reachedHandler, true)
})
