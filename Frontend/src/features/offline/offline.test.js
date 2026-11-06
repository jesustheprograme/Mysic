import assert from 'node:assert/strict'
import test from 'node:test'
import { copySongToLocal } from './copyToLocal.js'
import { createDownloadQueue } from './downloadQueue.js'
import { installLocalMediaSource, rewriteAudioSrc } from './localSource.js'

const ID = 'dQw4w9WgXcQ'
const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------- Cola con límite ----------

test('la cola nunca supera el límite de descargas simultáneas y respeta el orden', async () => {
  let running = 0
  let peak = 0
  const started = []
  const queue = createDownloadQueue({
    limit: 2,
    run: async (task) => {
      running += 1
      peak = Math.max(peak, running)
      started.push(task)
      await wait(10)
      running -= 1
    },
  })

  for (const id of ['a', 'b', 'c', 'd', 'e']) queue.enqueue(id, id)
  await wait(80)

  assert.equal(peak, 2)
  assert.deepEqual(started, ['a', 'b', 'c', 'd', 'e'])
  assert.deepEqual([...queue.state().values()].map((entry) => entry.status), Array(5).fill('done'))
})

test('no encola duplicados mientras está en cola, en curso o terminada', async () => {
  const queue = createDownloadQueue({ limit: 1, run: () => wait(10) })
  assert.equal(queue.enqueue('a', 'a'), true)
  assert.equal(queue.enqueue('a', 'a'), false)
  await wait(30)
  assert.equal(queue.enqueue('a', 'a'), false, 'una terminada tampoco se repite')
  queue.forget('a')
  assert.equal(queue.enqueue('a', 'a'), true, 'tras olvidarla puede volver a descargarse')
})

test('los fallos se reintentan un número acotado de veces', async () => {
  let calls = 0
  const queue = createDownloadQueue({ limit: 1, maxAttempts: 3, run: async () => { calls += 1; throw new Error('red') } })

  for (let attempt = 0; attempt < 6; attempt += 1) {
    queue.enqueue('a', 'a')
    await wait(5)
  }
  assert.equal(calls, 3)
  assert.equal(queue.state().get('a').status, 'error')
})

test('cancelar una tarea en cola evita que arranque y cancelar una en curso aborta su señal', async () => {
  const seen = []
  const queue = createDownloadQueue({
    limit: 1,
    run: async (task, { signal }) => {
      seen.push(task)
      await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('abortada'))))
    },
  })

  queue.enqueue('a', 'a')
  queue.enqueue('b', 'b')
  await wait(5)
  queue.cancel('b')
  queue.cancel('a')
  await wait(10)

  assert.deepEqual(seen, ['a'], 'b nunca debía arrancar')
  assert.equal(queue.state().get('a').status, 'cancelled')
  assert.equal(queue.state().get('b').status, 'cancelled')
})

// ---------- Copia local ----------

function streamOf(chunks) {
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++])
      else controller.close()
    },
  })
}

function fakeApi({ begin = 'started', failAppendAt = null } = {}) {
  const calls = { appended: [], committed: null, aborted: 0 }
  return {
    calls,
    begin: async () => begin,
    append: async (_id, bytes) => {
      if (failAppendAt !== null && calls.appended.length === failAppendAt) throw new Error('disco lleno')
      calls.appended.push(bytes.length)
    },
    commit: async (id, expected) => { calls.committed = { expected, id }; return { id, size: calls.appended.reduce((a, b) => a + b, 0) } },
    abort: async () => { calls.aborted += 1 },
  }
}

const respond = ({ chunks, headers = { 'content-length': String(chunks.reduce((total, chunk) => total + chunk.length, 0)) }, ok = true, status = 200 }) => async () => ({
  body: streamOf(chunks),
  headers: new Headers(headers),
  ok,
  status,
})

test('la copia agrupa lecturas pequeñas en trozos y confirma con el tamaño esperado', async () => {
  const api = fakeApi()
  const chunks = Array.from({ length: 10 }, () => new Uint8Array(100))
  const result = await copySongToLocal({ api, chunkBytes: 350, fetchImpl: respond({ chunks }), id: ID, meta: {}, url: 'x' })

  assert.equal(result.status, 'saved')
  assert.deepEqual(api.calls.appended, [400, 400, 200], 'trozos de al menos 350 bytes, el resto al final')
  assert.deepEqual(api.calls.committed, { expected: 1000, id: ID })
  assert.equal(api.calls.aborted, 0)
})

test('si ya existe copia local no se descarga nada', async () => {
  const api = fakeApi({ begin: 'exists' })
  let fetched = false
  const result = await copySongToLocal({ api, fetchImpl: async () => { fetched = true }, id: ID, meta: {}, url: 'x' })
  assert.equal(result.status, 'exists')
  assert.equal(fetched, false)
})

test('un error HTTP descarta el archivo parcial y propaga el fallo', async () => {
  const api = fakeApi()
  await assert.rejects(
    copySongToLocal({ api, fetchImpl: respond({ chunks: [], ok: false, status: 404 }), id: ID, meta: {}, url: 'x' }),
    /404/,
  )
  assert.equal(api.calls.aborted, 1)
  assert.equal(api.calls.committed, null)
})

test('un fallo de escritura (disco lleno) aborta y no confirma', async () => {
  const api = fakeApi({ failAppendAt: 1 })
  const chunks = Array.from({ length: 6 }, () => new Uint8Array(100))
  await assert.rejects(copySongToLocal({ api, chunkBytes: 200, fetchImpl: respond({ chunks }), id: ID, meta: {}, url: 'x' }), /disco lleno/)
  assert.equal(api.calls.aborted, 1)
  assert.equal(api.calls.committed, null)
})

test('una respuesta comprimida no usa Content-Length para validar el tamaño', async () => {
  const api = fakeApi()
  const chunks = [new Uint8Array(50)]
  await copySongToLocal({ api, fetchImpl: respond({ chunks, headers: { 'content-length': '20', 'content-encoding': 'gzip' } }), id: ID, meta: {}, url: 'x' })
  assert.equal(api.calls.committed.expected, null)
})

test('la cancelación detiene la copia y limpia', async () => {
  const api = fakeApi()
  const controller = new AbortController()
  const chunks = Array.from({ length: 50 }, () => new Uint8Array(100))
  const fetchImpl = async () => {
    controller.abort()
    return respond({ chunks })()
  }
  await assert.rejects(copySongToLocal({ api, chunkBytes: 100, fetchImpl, id: ID, meta: {}, signal: controller.signal, url: 'x' }), /cancelada/)
  assert.equal(api.calls.aborted, 1)
  assert.equal(api.calls.committed, null)
})

// ---------- Adaptador de fuente ----------

const local = new Set([ID])
const options = { has: (id) => local.has(id), urlFor: (id) => `http://mysicaudio.localhost/${id}` }

test('rewriteAudioSrc redirige solo audio descargado que tiene copia local', () => {
  const remote = `https://myslc.duckdns.org/api/youtube/downloads/${ID}/audio`
  assert.equal(rewriteAudioSrc(remote, options), `http://mysicaudio.localhost/${ID}`)
  assert.equal(rewriteAudioSrc(`${remote}?v=2`, options), `http://mysicaudio.localhost/${ID}`)
  assert.equal(rewriteAudioSrc('https://myslc.duckdns.org/api/youtube/downloads/abcdefghijk/audio', options), 'https://myslc.duckdns.org/api/youtube/downloads/abcdefghijk/audio')
  assert.equal(rewriteAudioSrc(`https://myslc.duckdns.org/api/youtube/stream/${ID}`, options), `https://myslc.duckdns.org/api/youtube/stream/${ID}`)
  assert.equal(rewriteAudioSrc(`/api/youtube/downloads/${ID}/cover`, options), `/api/youtube/downloads/${ID}/cover`)
  assert.equal(rewriteAudioSrc('', options), '')
  assert.equal(rewriteAudioSrc(null, options), null)
})

test('installLocalMediaSource intercepta el setter, conserva el getter y se desinstala', () => {
  const store = new WeakMap()
  const prototype = {}
  Object.defineProperty(prototype, 'src', {
    configurable: true,
    get() { return store.get(this) ?? '' },
    set(value) { store.set(this, value) },
  })
  const element = Object.create(prototype)
  const remote = `https://myslc.duckdns.org/api/youtube/downloads/${ID}/audio`

  const uninstall = installLocalMediaSource({ ...options, target: prototype })
  element.src = remote
  assert.equal(element.src, `http://mysicaudio.localhost/${ID}`)
  element.src = 'https://otro.example/musica.mp3'
  assert.equal(element.src, 'https://otro.example/musica.mp3')

  uninstall()
  element.src = remote
  assert.equal(element.src, remote)
})

test('installLocalMediaSource es inocuo sin prototipo o sin setter', () => {
  assert.doesNotThrow(() => installLocalMediaSource({ ...options, target: null })())
  assert.doesNotThrow(() => installLocalMediaSource({ ...options, target: {} })())
})
