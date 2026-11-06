import assert from 'node:assert/strict'
import test from 'node:test'
import { loadExtendedHome } from './home-extended.mjs'

const song = (id) => ({ item_type: 'song', id, title: `Canción ${id}`, artists: [{ name: 'Artista', channel_id: 'UC1' }] })
const section = (title, ...ids) => ({ header: { title }, contents: ids.map(song) })

// Una página de inicio con `sections` y, si hay `next`, una continuación.
function page(sections, next, { fail = false, slow = false } = {}) {
  return {
    sections,
    has_continuation: Boolean(next || fail || slow),
    getContinuation: async () => {
      if (fail) throw new Error('YouTube no responde')
      if (slow) await new Promise((resolve) => setTimeout(resolve, 200))
      return next
    },
    filters: ['Relax'],
  }
}

const withHome = (home) => ({ music: { getHomeFeed: async () => home }, session: { cookie: 'x' } })
const noEnrich = async () => {}

test('sigue las continuaciones y reúne todas las secciones sin repetir títulos', async () => {
  const third = page([section('C', 'c1')])
  const second = page([section('B', 'b1'), section('A', 'a2')], third)
  const home = page([section('A', 'a1')], second)
  const result = await loadExtendedHome(withHome(home), { enrich: noEnrich })
  assert.deepEqual(result.shelves.map((shelf) => shelf.title), ['A', 'B', 'C'])
  assert.equal(result.personalized, true)
  assert.deepEqual(result.filters, ['Relax'])
})

test('respeta el máximo de continuaciones', async () => {
  const pages = Array.from({ length: 6 }, (_, index) => page([section(`S${index}`, `id${index}aaaaaaa`)]))
  pages.forEach((current, index) => { if (index < 5) { const next = pages[index + 1]; current.has_continuation = true; current.getContinuation = async () => next } })
  const result = await loadExtendedHome(withHome(pages[0]), { enrich: noEnrich, maxContinuations: 2 })
  assert.equal(result.shelves.length, 3, 'la página inicial más 2 continuaciones')
})

test('un fallo en una continuación conserva lo ya cargado', async () => {
  const second = page([section('B', 'b1')], undefined, { fail: true })
  const home = page([section('A', 'a1')], second)
  const result = await loadExtendedHome(withHome(home), { enrich: noEnrich })
  assert.deepEqual(result.shelves.map((shelf) => shelf.title), ['A', 'B'])
})

test('una continuación demasiado lenta se abandona', async () => {
  const home = page([section('A', 'a1')], undefined, { slow: true })
  const result = await loadExtendedHome(withHome(home), { enrich: noEnrich, pageTimeoutMs: 20 })
  assert.deepEqual(result.shelves.map((shelf) => shelf.title), ['A'])
})

test('solo busca álbumes en las primeras secciones', async () => {
  const sections = Array.from({ length: 7 }, (_, index) => section(`S${index}`, `id${index}`))
  let received = 0
  await loadExtendedHome(withHome(page(sections)), { enrich: async (shelves) => { received = shelves.length } })
  assert.equal(received, 4)
})
