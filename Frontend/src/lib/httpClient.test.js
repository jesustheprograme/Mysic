import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiError, createHttpClient } from './httpClient.js'

function jsonResponse(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

function client(fetchImpl, extra = {}) {
  return createHttpClient({ baseUrl: '/api', fetchImpl, sleep: async () => {}, ...extra })
}

test('deduplica GET idénticos en vuelo y libera la clave al terminar', async () => {
  let calls = 0
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const api = client(async () => {
    calls += 1
    await gate
    return jsonResponse({ ok: true })
  })

  const first = api.request('/catalog/songs')
  const second = api.request('/catalog/songs')
  release()
  assert.deepEqual(await first, { ok: true })
  assert.deepEqual(await second, { ok: true })
  assert.equal(calls, 1)

  await api.request('/catalog/songs')
  assert.equal(calls, 2)
})

test('no deduplica si el llamador pasa su propia signal ni las escrituras', async () => {
  let calls = 0
  const api = client(async () => {
    calls += 1
    return jsonResponse({})
  })
  const controller = new AbortController()

  await Promise.all([
    api.request('/x', { signal: controller.signal }),
    api.request('/x', { signal: controller.signal }),
  ])
  assert.equal(calls, 2)

  await Promise.all([
    api.request('/y', { method: 'POST', body: '{}' }),
    api.request('/y', { method: 'POST', body: '{}' }),
  ])
  assert.equal(calls, 4)
})

test('Content-Type solo con cuerpo JSON, nunca en GET ni con FormData', async () => {
  const seen = []
  const api = client(async (_url, init) => {
    seen.push(init.headers)
    return jsonResponse({})
  })

  await api.request('/a')
  await api.request('/b', { method: 'POST', body: '{"a":1}' })
  await api.request('/c', { method: 'POST', body: new FormData() })

  assert.equal(seen[0]['Content-Type'], undefined)
  assert.equal(seen[1]['Content-Type'], 'application/json')
  assert.equal(seen[2]['Content-Type'], undefined)
})

test('reintenta una vez un GET ante 503 y ante fallo de red', async () => {
  let calls = 0
  const api = client(async () => {
    calls += 1
    if (calls === 1) return jsonResponse({ message: 'arrancando' }, 503)
    return jsonResponse({ ok: true })
  })
  assert.deepEqual(await api.request('/home'), { ok: true })
  assert.equal(calls, 2)

  calls = 0
  const flaky = client(async () => {
    calls += 1
    if (calls === 1) throw new TypeError('network')
    return jsonResponse({ ok: true })
  })
  assert.deepEqual(await flaky.request('/home'), { ok: true })
  assert.equal(calls, 2)
})

test('no reintenta escrituras ni errores 4xx y mantiene el mensaje del servidor', async () => {
  let calls = 0
  const api = client(async () => {
    calls += 1
    return jsonResponse({ message: 'Datos inválidos' }, 400)
  })
  await assert.rejects(api.request('/p', { method: 'POST', body: '{}' }), /Datos inválidos/)
  await assert.rejects(api.request('/g'), (error) => error instanceof ApiError && error.status === 400)
  assert.equal(calls, 2)

  let writes = 0
  const failing = client(async () => {
    writes += 1
    return jsonResponse({}, 503)
  })
  await assert.rejects(failing.request('/p', { method: 'PUT' }))
  assert.equal(writes, 1)
})

test('un timeout se informa como error de la API', async () => {
  const api = createHttpClient({
    baseUrl: '/api',
    timeoutMs: 20,
    sleep: async () => {},
    fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason))
    }),
  })
  await assert.rejects(api.request('/lento'), (error) => (
    error instanceof ApiError && error.status === 0 && /tardó demasiado/.test(error.message)
  ))
})

test('la cancelación del llamador se propaga sin convertirla en error de red', async () => {
  const controller = new AbortController()
  const api = client((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason))
  }))

  const pending = api.request('/s', { signal: controller.signal })
  controller.abort(new DOMException('cancelado', 'AbortError'))
  await assert.rejects(pending, (error) => error.name === 'AbortError')
})

test('204 devuelve null', async () => {
  const api = client(async () => ({ ok: true, status: 204, json: async () => { throw new Error('sin cuerpo') } }))
  assert.equal(await api.request('/vacio', { method: 'DELETE' }), null)
})
