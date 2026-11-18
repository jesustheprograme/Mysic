import assert from 'node:assert/strict'
import test from 'node:test'
import { createListenTracker, threshold } from './listenTracker.js'

function fakeStore() {
  const rows = []
  return {
    rows,
    insert: (song, playedAt, secs) => { rows.push({ songId: song.id, playedAt, secs }); return Promise.resolve(rows.length - 1) },
    update: (id, secs) => { rows[id].secs = secs },
  }
}
const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0))
const song = (id) => ({ id, title: id })

function play(tracker, s, from, to, { duration = 200, step = 0.5, playing = true } = {}) {
  for (let position = from; position <= to + 1e-9; position += step) tracker.tick({ song: s, position, duration, playing })
}

test('threshold: mitad de la canción con tope de 30 s; 30 s sin duración', () => {
  assert.equal(threshold(40), 20)
  assert.equal(threshold(240), 30)
  assert.equal(threshold(0), 30)
})

test('un salto rápido (antes del umbral) no deja escucha', async () => {
  const store = fakeStore()
  const tracker = createListenTracker(store)
  play(tracker, song('a'), 0, 20)
  play(tracker, song('b'), 0, 5)
  await flushAsync()
  assert.equal(store.rows.length, 0)
})

test('al pasar el umbral se guarda la escucha y luego los segundos oídos', async () => {
  const store = fakeStore()
  const tracker = createListenTracker(store)
  play(tracker, song('a'), 0, 30.5)
  await flushAsync()
  assert.equal(store.rows.length, 1)
  assert.ok(Math.abs(store.rows[0].secs - 30) <= 1, `secs ${store.rows[0].secs}`)
  play(tracker, song('a'), 31, 75)
  tracker.flush()
  await flushAsync()
  assert.ok(Math.abs(store.rows[0].secs - 75) <= 1, `secs ${store.rows[0].secs}`)
})

test('saltos y pausas no suman tiempo', async () => {
  const store = fakeStore()
  const tracker = createListenTracker(store)
  play(tracker, song('a'), 0, 10)
  tracker.tick({ song: song('a'), position: 100, duration: 200, playing: true }) // salto adelante
  play(tracker, song('a'), 100, 140, { playing: false }) // en pausa
  play(tracker, song('a'), 140, 150)
  await flushAsync()
  assert.equal(store.rows.length, 0, '20 s oídos de verdad: aún no llega a 30')
})

test('repetir la misma canción desde el final es otra escucha', async () => {
  const store = fakeStore()
  const tracker = createListenTracker(store)
  play(tracker, song('a'), 0, 60, { duration: 60 })
  play(tracker, song('a'), 0, 40, { duration: 60 })
  tracker.end()
  await flushAsync()
  assert.equal(store.rows.length, 2)
})
