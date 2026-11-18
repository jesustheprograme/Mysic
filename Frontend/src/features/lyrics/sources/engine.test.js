import assert from 'node:assert/strict'
import test from 'node:test'
import { createLyricsEngine, songKey } from './engine.js'
import { bestByDuration, mainArtist, searchTitle, withoutCredits } from './providers.js'

const req = { videoId: 'abc', title: 'Song', artist: 'Artist', duration: 200 }
const synced = { synced: true, lines: [{ time: 1, text: 'a' }, { time: 2, text: 'b' }], plain: 'a\nb' }
const plain = { synced: false, lines: [], plain: 'texto' }

function fakeProviders(spec) {
  const calls = []
  const providers = Object.entries(spec).map(([id, { delay = 0, result = null, error = null }]) => ({
    id,
    name: id,
    get: () => { calls.push(id); return new Promise((resolve, reject) => setTimeout(() => (error ? reject(new Error(error)) : resolve(result)), delay)) },
  }))
  return { providers, calls }
}

async function engineWith(spec, options = {}) {
  const { providers, calls } = fakeProviders(spec)
  const module = await import('./providers.js')
  // El motor busca por id en PROVIDERS: se sustituyen temporalmente por los dobles.
  const original = [...module.PROVIDERS]
  module.PROVIDERS.splice(0, module.PROVIDERS.length, ...providers)
  const engine = createLyricsEngine({ ctx: {}, providers, stagger: 20, budget: 500, ...options })
  return { engine, calls, restore: () => module.PROVIDERS.splice(0, module.PROVIDERS.length, ...original) }
}

test('auto: gana la primera sincronizada en orden aunque otra llegue antes', async () => {
  const { engine, restore } = await engineWith({ a: { delay: 60, result: plain }, b: { delay: 5, result: synced }, c: { delay: 1, result: synced } })
  try {
    const result = await engine.auto(req)
    assert.equal(result.provider, 'b')
    assert.equal(result.synced, true)
  } finally { restore() }
})

test('auto: una posterior que llega antes espera a la anterior pendiente (orden de preferencia)', async () => {
  // c responde antes que b, pero b va antes en el orden y llega dentro del margen: gana b.
  const { engine, restore } = await engineWith({ a: { delay: 1, result: null }, b: { delay: 80, result: synced }, c: { delay: 1, result: synced } })
  try { assert.equal((await engine.auto(req)).provider, 'b') } finally { restore() }
})

test('auto: un proveedor anterior colgado solo retrasa el margen de gracia', async () => {
  const { engine, restore } = await engineWith({ slow: { delay: 2000, result: synced }, fast: { delay: 5, result: { ...synced, plain: 'rápida' } } }, { grace: 60, budget: 3000 })
  try {
    const started = Date.now()
    const result = await engine.auto(req)
    assert.equal(result.provider, 'fast')
    assert.ok(Date.now() - started < 400, `tardó ${Date.now() - started} ms`)
  } finally { restore() }
})

test('auto: al haber ganador no arrancan los siguientes', async () => {
  const { engine, calls, restore } = await engineWith({ a: { delay: 1, result: synced }, b: { result: synced }, c: { result: synced } })
  try {
    assert.equal((await engine.auto(req)).provider, 'a')
    await new Promise((resolve) => setTimeout(resolve, 80))
    // Los dos primeros arrancan a la vez; el tercero, escalonado, ya no arranca.
    assert.deepEqual(calls, ['a', 'b'])
  } finally { restore() }
})

test('auto: sin sincronizadas vale el primer texto plano; sin nada, null; todo caído, error', async () => {
  let ctx = await engineWith({ a: { result: null }, b: { result: plain } })
  try { assert.equal((await ctx.engine.auto(req)).provider, 'b') } finally { ctx.restore() }
  ctx = await engineWith({ a: { result: null }, b: { error: 'x' } })
  try { assert.equal(await ctx.engine.auto(req), null) } finally { ctx.restore() }
  ctx = await engineWith({ a: { error: 'x' }, b: { error: 'y' } })
  try { await assert.rejects(ctx.engine.auto(req), /UNREACHABLE/) } finally { ctx.restore() }
})

test('fromProvider: caché y peticiones simultáneas compartidas', async () => {
  const { engine, calls, restore } = await engineWith({ a: { delay: 10, result: synced } })
  try {
    const [one, two] = await Promise.all([engine.fromProvider('a', req), engine.fromProvider('a', req)])
    assert.equal(one, two)
    await engine.fromProvider('a', req)
    assert.deepEqual(calls, ['a'])
  } finally { restore() }
})

test('fromProvider: un proveedor colgado agota su presupuesto', async () => {
  const { engine, restore } = await engineWith({ a: { delay: 2000, result: synced } }, { budget: 30 })
  try { await assert.rejects(engine.fromProvider('a', req), /TIMEOUT/) } finally { restore() }
})

test('utilidades de búsqueda', () => {
  assert.equal(searchTitle('Shape of You (feat. X) [Remastered]'), 'Shape of You')
  assert.equal(searchTitle('Song - Remastered 2011'), 'Song')
  assert.equal(searchTitle('Song (Official Video)'), 'Song')
  assert.equal(mainArtist('Junko Ohashi, Minoya Central Station'), 'Junko Ohashi')
  assert.equal(bestByDuration(233, [{ d: 263 }, { d: 231 }, { d: 234 }], (c) => c.d).d, 234)
  assert.equal(bestByDuration(233, [{ d: 263 }], (c) => c.d), null)
  assert.equal(bestByDuration(0, [{ d: 1 }], (c) => c.d).d, 1)
  assert.notEqual(songKey({ ...req, searched: true }), songKey(req))
  assert.notEqual(songKey({ ...req, duration: 0 }), songKey(req))
  assert.deepEqual(withoutCredits([{ time: 0, text: '作词 : 田中智之' }, { time: 1, text: '制作人 : Steve Mac' }, { time: 2, text: 'Produced by：X' }, { time: 3, text: 'おつかれsummer' }]).map((l) => l.text), ['おつかれsummer'])
})
