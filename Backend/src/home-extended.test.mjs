import assert from 'node:assert/strict'
import test from 'node:test'
import { createExtendedHomeHandler, createHomeMoreHandler, createHomeSessions, createInflight, loadHomeFirstPage, loadHomeMore } from './home-extended.mjs'

const song = (id) => ({ item_type: 'song', id, title: `Canción ${id}`, artists: [{ name: 'Artista', channel_id: 'UC1' }] })
const section = (title, ...ids) => ({ header: { title }, contents: ids.map(song) })

// Una página de inicio con `sections` y, si hay `next`, una continuación (que cuenta cuántas veces se pidió).
function page(sections, next, { fail = false, slow = false } = {}) {
  const current = {
    sections,
    has_continuation: Boolean(next || fail || slow),
    calls: 0,
    getContinuation: async () => {
      current.calls += 1
      if (fail) throw new Error('YouTube no responde')
      if (slow) await new Promise((resolve) => setTimeout(resolve, 200))
      return next
    },
    filters: ['Relax'],
  }
  return current
}

const withHome = (home) => ({ music: { getHomeFeed: async () => home }, session: { cookie: 'x' } })
const never = () => new Promise(() => {})
const runNow = (task) => { task() } // el enriquecimiento se lanza pero nadie lo espera

test('la primera página responde sin seguir continuaciones ni esperar al enriquecimiento', async () => {
  const second = page([section('B', 'b1')])
  const home = page([section('A', 'a1'), section('C', 'c1')], second)
  const sessions = createHomeSessions()
  const started = Date.now()
  const result = await loadHomeFirstPage(withHome(home), { enrich: never, schedule: runNow, sessions, userId: 'u1' })
  assert.ok(Date.now() - started < 100)
  assert.deepEqual(result.shelves.map((shelf) => shelf.title), ['A', 'C'])
  assert.equal(result.personalized, true)
  assert.deepEqual(result.filters, ['Relax'])
  assert.equal(second.calls + home.calls, 0, 'no pidió ninguna continuación')
  assert.equal(typeof result.continuation, 'string')
})

test('sin más páginas no hay token', async () => {
  const result = await loadHomeFirstPage(withHome(page([section('A', 'a1')])), { enrich: async () => {}, schedule: runNow, sessions: createHomeSessions() })
  assert.equal(result.continuation, null)
})

test('el enriquecimiento va después y solo para las primeras secciones', async () => {
  const sections = Array.from({ length: 7 }, (_, index) => section(`S${index}`, `id${index}`))
  let received = 0
  let scheduled
  await loadHomeFirstPage(withHome(page(sections)), { enrich: async (shelves) => { received = shelves.length }, schedule: (task) => { scheduled = task }, sessions: createHomeSessions() })
  assert.equal(received, 0, 'todavía no se ejecutó al responder')
  await scheduled()
  assert.equal(received, 4)
})

test('un Inicio que no responde a tiempo falla con un código claro', async () => {
  const youtube = { music: { getHomeFeed: never }, session: { cookie: 'x' } }
  await assert.rejects(loadHomeFirstPage(youtube, { schedule: runNow, timeoutMs: 20 }), { code: 'HOME_TIMEOUT' })
})

test('las páginas siguientes llegan bajo demanda, una por token, y cada una trae un token nuevo', async () => {
  const third = page([section('C', 'c1')])
  const second = page([section('B', 'b1')], third)
  const home = page([section('A', 'a1')], second)
  const sessions = createHomeSessions()
  const first = await loadHomeFirstPage(withHome(home), { enrich: async () => {}, schedule: runNow, sessions, userId: 'u1' })

  const more = await loadHomeMore(sessions.take('u1', first.continuation), { sessions })
  assert.deepEqual(more.shelves.map((shelf) => shelf.title), ['B'])
  assert.equal(typeof more.continuation, 'string')
  assert.notEqual(more.continuation, first.continuation)
  const last = await loadHomeMore(sessions.take('u1', more.continuation), { sessions })
  assert.deepEqual(last.shelves.map((shelf) => shelf.title), ['C'])
  assert.equal(last.continuation, null)
})

test('repetir el mismo token no vuelve a pedir la página a YouTube; un fallo permite reintentar', async () => {
  const second = page([section('B', 'b1')])
  const sessions = createHomeSessions()
  const token = sessions.create('u1', Object.assign(page([section('A', 'a1')], second), {}))
  const entry = sessions.take('u1', token)
  const [a, b] = await Promise.all([loadHomeMore(entry, { sessions }), loadHomeMore(entry, { sessions })])
  assert.equal(a, b)
  assert.equal(second.calls + entry.page.calls, 1)

  let attempts = 0
  const flaky = { has_continuation: true, getContinuation: async () => { attempts += 1; if (attempts === 1) throw new Error('boom'); return page([section('Z', 'z1')]) } }
  const flakyEntry = sessions.take('u1', sessions.create('u1', flaky))
  await assert.rejects(loadHomeMore(flakyEntry, { sessions }), /boom/)
  assert.deepEqual((await loadHomeMore(flakyEntry, { sessions })).shelves.map((shelf) => shelf.title), ['Z'])
})

test('una continuación lenta falla con HOME_TIMEOUT', async () => {
  const sessions = createHomeSessions()
  const entry = sessions.take('u1', sessions.create('u1', page([section('A', 'a1')], undefined, { slow: true })))
  await assert.rejects(loadHomeMore(entry, { sessions, timeoutMs: 20 }), { code: 'HOME_TIMEOUT' })
})

test('el token solo sirve a su dueño, caduca y el número de sesiones está acotado', () => {
  let current = 1000
  const sessions = createHomeSessions({ max: 3, now: () => current, ttlMs: 500 })
  const token = sessions.create('u1', page([], page([])))
  assert.ok(sessions.take('u1', token))
  assert.equal(sessions.take('u2', token), null, 'otro usuario no puede usarlo')
  assert.equal(sessions.take('u1', 'inventado'), null)
  current += 501
  assert.equal(sessions.take('u1', token), null, 'caducado')

  const bounded = createHomeSessions({ max: 3 })
  for (let index = 0; index < 10; index += 1) bounded.create('u', page([], page([])))
  assert.equal(bounded.size, 3)
})

test('clearUser descarta solo los tokens de ese usuario', () => {
  const sessions = createHomeSessions()
  const mine = sessions.create('u1', page([], page([])))
  const theirs = sessions.create('u2', page([], page([])))
  sessions.clearUser('u1')
  assert.equal(sessions.take('u1', mine), null)
  assert.ok(sessions.take('u2', theirs))
})

test('las peticiones idénticas simultáneas comparten una sola carga', async () => {
  const inflight = createInflight()
  let loads = 0
  const load = async () => { loads += 1; await new Promise((resolve) => setTimeout(resolve, 20)); return { n: loads } }
  const [a, b, c] = await Promise.all([inflight('u1:home', load), inflight('u1:home', load), inflight('u2:home', load)])
  assert.equal(a, b)
  assert.notEqual(a, c, 'otro usuario no comparte la carga')
  assert.equal(loads, 2)
  await inflight('u1:home', load)
  assert.equal(loads, 3, 'terminada la carga, la siguiente petición vuelve a cargar')
})

test('con filtro pide el Inicio filtrado de la pastilla y conserva la lista de pastillas', async () => {
  const filtered = page([section('Deep focus', 'f1')], page([section('Mas', 'm1')]))
  const chip = { text: 'Relax' }
  const home = { ...page([section('A', 'a1')]), filters: [chip, { text: 'Fiesta' }], applyFilter: async (target) => (target === chip ? filtered : null) }
  const sessions = createHomeSessions()
  const result = await loadHomeFirstPage(withHome(home), { enrich: never, filter: 'Relax', schedule: runNow, sessions, userId: 'u1' })
  assert.deepEqual(result.shelves.map((shelf) => shelf.title), ['Deep focus'])
  assert.deepEqual(result.filters, ['Relax', 'Fiesta'])
  assert.equal(typeof result.continuation, 'string', 'el Inicio filtrado tambien sigue por paginas')
})

test('un filtro que no existe falla con un codigo claro', async () => {
  const home = { ...page([section('A', 'a1')]), filters: [{ text: 'Relax' }], applyFilter: async () => null }
  await assert.rejects(
    loadHomeFirstPage(withHome(home), { enrich: never, filter: 'Inventado', schedule: runNow, sessions: createHomeSessions() }),
    (error) => error.code === 'HOME_FILTER_INVALID',
  )
})

// El contrato HTTP del Inicio: el manejador DEBE pasar ?filter= a la carga y traducir un filtro inexistente a 400.
function callHome(query, load) {
  const handler = createExtendedHomeHandler({
    anonymous: () => ({}), hasAuth: async () => false, inflight: createInflight(), load, sessions: createHomeSessions(), userClient: async () => null,
  })[1]
  const res = { headers: {}, status(code) { this.code = code; return this }, json(body) { this.body = body; return this }, setHeader(name, value) { this.headers[name] = value } }
  return handler({ mysicUser: { _id: 'u1' }, query }, res, () => {}).then(() => res)
}

test('el manejador pasa ?filter= a la carga y responde 200', async () => {
  let received
  const res = await callHome({ filter: '  Relax  ' }, async (_youtube, options) => { received = options.filter; return { shelves: [], filters: ['Relax'] } })
  assert.equal(received, 'Relax')
  assert.deepEqual(res.body, { shelves: [], filters: ['Relax'] })
})

test('sin ?filter= el filtro llega como null (Inicio normal)', async () => {
  let received = 'x'
  await callHome({}, async (_youtube, options) => { received = options.filter; return { shelves: [] } })
  assert.equal(received, null)
  await callHome({ filter: ['a', 'b'] }, async (_youtube, options) => { received = options.filter; return { shelves: [] } })
  assert.equal(received, null, 'un filtro que no es texto se ignora')
})

// /home/more: una continuación anunciada que falla es el final del Inicio (página vacía), salvo que se agote el tiempo.
async function callMore(getContinuation) {
  const sessions = createHomeSessions()
  const token = sessions.create('u1', { has_continuation: true, getContinuation })
  const handler = createHomeMoreHandler({ sessions })[1]
  const res = { headers: {}, status(code) { this.code = code; return this }, json(body) { this.body = body; return this }, setHeader(name, value) { this.headers[name] = value } }
  const warn = console.warn
  console.warn = () => {}
  try {
    await handler({ mysicUser: { _id: 'u1' }, query: { token } }, res, () => {})
  } finally {
    console.warn = warn
  }
  return res
}

test('la continuación anunciada que falla responde como final del Inicio (200, vacía, sin token)', async () => {
  const res = await callMore(async () => { throw new Error('Continuation not found') })
  assert.equal(res.code, undefined, 'responde 200')
  assert.deepEqual(res.body, { shelves: [], continuation: null })
})

test('una continuación lenta sigue respondiendo 504 HOME_TIMEOUT', async () => {
  const res = await callMore(async () => { throw Object.assign(new Error('lento'), { code: 'HOME_TIMEOUT' }) })
  assert.equal(res.code, 504)
  assert.equal(res.body.code, 'HOME_TIMEOUT')
})

test('un filtro inexistente responde 400 con HOME_FILTER_INVALID', async () => {
  const res = await callHome({ filter: 'Inventado' }, async () => { throw Object.assign(new Error('Ese filtro del Inicio no existe.'), { code: 'HOME_FILTER_INVALID' }) })
  assert.equal(res.code, 400)
  assert.equal(res.body.code, 'HOME_FILTER_INVALID')
})