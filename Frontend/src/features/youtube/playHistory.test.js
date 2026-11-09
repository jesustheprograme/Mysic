import assert from 'node:assert/strict'
import test from 'node:test'
import { recordPlay, topPlays } from './playHistory.js'

const song = (id) => ({ id, title: `T${id}`, artist: 'A', thumbnail: `${id}.jpg` })

test('recordPlay ignora la misma canción en menos de 30 s y recorta a 600', () => {
  let entries = recordPlay([], song('a'), 1000)
  assert.equal(recordPlay(entries, song('a'), 20_000), entries)
  entries = recordPlay(entries, song('a'), 40_000)
  assert.equal(entries.length, 2)

  let many = []
  for (let i = 0; i < 700; i += 1) many = recordPlay(many, song(`s${i}`), i * 60_000)
  assert.equal(many.length, 600)
  assert.equal(many[0].id, 's100')
})

test('topPlays exige 2 reproducciones, ordena por veces y respeta la ventana', () => {
  const now = 100 * 86_400_000
  const day = 86_400_000
  let entries = []
  const add = (id, daysAgo) => { entries = recordPlay(entries, song(id), now - daysAgo * day) }
  add('viejo', 60); add('viejo', 59)           // fuera de la ventana de 30 días
  add('una', 2)                                // una sola vez: no cuenta
  add('x', 5); add('y', 4); add('x', 3); add('y', 2); add('x', 1) // x:3, y:2
  assert.deepEqual(topPlays(entries, { now }).map((item) => item.id), ['x', 'y'])
})