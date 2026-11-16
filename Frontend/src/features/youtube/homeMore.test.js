import assert from 'node:assert/strict'
import test from 'node:test'
import { canAutoload, carryMissing, initialMoreState, isEndOfFeed, isTransientFailure, MAX_MORE_PAGES, mergeShelves, moreReducer } from './homeMore.js'

test('un 502 con páginas ya cargadas es el final del Inicio: sin aviso, sin token y sin reintento', () => {
  assert.equal(isEndOfFeed({ pages: 4, status: 502 }), true)
  assert.equal(isEndOfFeed({ pages: 0, status: 502 }), false, 'en la primera página sí es un error')
  assert.equal(isEndOfFeed({ pages: 4, status: 504 }), false, 'un tiempo agotado sigue siendo un error')
  assert.equal(isTransientFailure({ pages: 4, status: 502 }), false)
  assert.equal(isTransientFailure({ pages: 0, status: 502 }), true)
  assert.equal(isTransientFailure({ pages: 3, status: 504 }), true)
  assert.equal(isTransientFailure({ pages: 3, status: 410 }), false)
  const loading = moreReducer({ ...initialMoreState('t5'), pages: 4 }, { type: 'start' })
  const ended = moreReducer(loading, { type: 'end' })
  assert.deepEqual([ended.status, ended.token, ended.failure, ended.pages], ['done', null, null, 4])
  assert.equal(canAutoload(ended), false)
})

const shelf = (title, ...ids) => ({ title, items: ids.map((id) => ({ id })) })
const run = (state, ...events) => events.reduce(moreReducer, state)

test('mergeShelves añade secciones nuevas, suma solo elementos nuevos y no muta la entrada', () => {
  const existing = [shelf('A', 'a1')]
  const merged = mergeShelves(existing, [shelf('A', 'a1', 'a2'), shelf('B', 'b1'), shelf('B', 'b1')])
  assert.deepEqual(merged.map((item) => [item.title, item.items.map((x) => x.id)]), [['A', ['a1', 'a2']], ['B', ['b1']]])
  assert.deepEqual(existing, [shelf('A', 'a1')])
})

test('flujo normal: idle -> loading -> idle con token nuevo, sin duplicar secciones', () => {
  let state = initialMoreState('t1')
  assert.equal(canAutoload(state), true)
  state = run(state, { type: 'start' })
  assert.equal(state.status, 'loading')
  assert.equal(canAutoload(state), false)
  state = run(state, { type: 'success', shelves: [shelf('B', 'b1')], continuation: 't2' })
  assert.deepEqual([state.status, state.token, state.pages], ['idle', 't2', 1])
  state = run(state, { type: 'start' }, { type: 'success', shelves: [shelf('B', 'b1'), shelf('C', 'c1')], continuation: null })
  assert.deepEqual(state.shelves.map((item) => item.title), ['B', 'C'])
  assert.deepEqual([state.status, state.token], ['done', null])
  assert.equal(canAutoload(state), false)
})

test('un fallo detiene la carga automática (sin bucle) y solo un reintento explícito la reanuda', () => {
  let state = run(initialMoreState('t1'), { type: 'start' }, { type: 'failure', reason: 'error' })
  assert.deepEqual([state.status, state.failure, state.token], ['failed', 'error', 't1'])
  assert.equal(canAutoload(state), false)
  assert.equal(run(state, { type: 'start' }).status, 'loading', 'start desde failed = reintento explícito')
  assert.equal(run(state, { type: 'retry' }).status, 'idle')
})

test('no hay carga sin token y hay un tope de páginas', () => {
  assert.equal(run(initialMoreState(null), { type: 'start' }).status, 'idle')
  let state = initialMoreState('t0')
  for (let page = 1; page <= MAX_MORE_PAGES + 2; page += 1) {
    state = run(state, { type: 'start' }, { type: 'success', shelves: [shelf(`S${page}`, `s${page}`)], continuation: `t${page}` })
    if (!state.token) break
  }
  assert.equal(state.pages, MAX_MORE_PAGES)
  assert.equal(state.status, 'done')
})

test('un reinicio (primera página nueva) descarta lo cargado', () => {
  const state = run(initialMoreState('t1'), { type: 'start' }, { type: 'success', shelves: [shelf('B', 'b1')], continuation: 't2' }, { type: 'reset', token: 'n1' })
  assert.deepEqual([state.token, state.shelves.length, state.pages, state.status], ['n1', 0, 0, 'idle'])
})
test('carryMissing conserva las secciones que esta vez no llegaron y prioriza las recientes', () => {
  const live = [shelf('A', 'a2'), shelf('B', 'b1')]
  const carried = [shelf('A', 'a1'), shelf('Vuelve a escucharlo', 'v1')]
  const result = carryMissing(live, carried)
  assert.deepEqual(result.map((entry) => entry.title), ['A', 'B', 'Vuelve a escucharlo'])
  assert.deepEqual(result[0].items, [{ id: 'a2' }])
  assert.equal(carryMissing(live, carried, 1).length, 2)
})
