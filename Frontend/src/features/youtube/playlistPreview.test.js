import assert from 'node:assert/strict'
import test from 'node:test'
import { createLimiter, loadPlaylistPreview } from './playlistPreview.js'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('el limitador nunca supera la concurrencia y devuelve cada resultado', async () => {
  const run = createLimiter(2)
  let running = 0
  let peak = 0
  const results = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((value) => run(async () => {
    running += 1
    peak = Math.max(peak, running)
    await wait(10)
    running -= 1
    return value
  })))
  assert.deepEqual(results, ['a', 'b', 'c', 'd', 'e'])
  assert.equal(peak, 2)
})

test('un fallo de una tarea no bloquea la cola', async () => {
  const run = createLimiter(1)
  await assert.rejects(run(async () => { throw new Error('x') }), /x/)
  assert.equal(await run(async () => 'ok'), 'ok')
})

test('la vista previa se cachea, deduplica y reintenta tras un error', async () => {
  let calls = 0
  let fail = true
  const load = async () => {
    calls += 1
    await wait(5)
    if (fail) throw new Error('red')
    return { songs: [1] }
  }
  const [first, second] = [loadPlaylistPreview('PL1', { load }), loadPlaylistPreview('PL1', { load })]
  await assert.rejects(first, /red/)
  await assert.rejects(second, /red/)
  assert.equal(calls, 1, 'las dos peticiones simultáneas comparten una sola')

  fail = false
  assert.deepEqual(await loadPlaylistPreview('PL1', { load }), { songs: [1] })
  assert.deepEqual(await loadPlaylistPreview('PL1', { load }), { songs: [1] })
  assert.equal(calls, 2, 'tras el error se reintenta una vez y luego sale de caché')
})
