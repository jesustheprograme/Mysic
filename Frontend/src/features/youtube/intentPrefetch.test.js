import assert from 'node:assert/strict'
import test from 'node:test'
import { createIntentPrefetcher } from './intentPrefetch.js'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('espera el retardo y cancelar evita la petición', async () => {
  const calls = []
  const prefetcher = createIntentPrefetcher({ delayMs: 20 })
  prefetcher.schedule('a', () => calls.push('a'))
  prefetcher.schedule('b', () => calls.push('b'))
  prefetcher.cancel('b')
  assert.deepEqual(calls, [])
  await wait(50)
  assert.deepEqual(calls, ['a'])
})

test('no repite una clave dentro del TTL pero sí después', async () => {
  let clock = 0
  const calls = []
  const prefetcher = createIntentPrefetcher({ delayMs: 1, now: () => clock, ttlMs: 1000 })
  prefetcher.schedule('a', () => calls.push(1))
  await wait(10)
  prefetcher.schedule('a', () => calls.push(2))
  await wait(10)
  clock = 2000
  prefetcher.schedule('a', () => calls.push(3))
  await wait(10)
  assert.deepEqual(calls, [1, 3])
})

test('nunca supera el máximo de peticiones simultáneas', async () => {
  let running = 0
  let peak = 0
  const prefetcher = createIntentPrefetcher({ delayMs: 1, maxConcurrent: 2 })
  for (const key of 'abcde') {
    prefetcher.schedule(key, async () => {
      running += 1
      peak = Math.max(peak, running)
      await wait(15)
      running -= 1
    })
  }
  await wait(120)
  assert.equal(peak, 2)
})

test('un fallo se traga y permite reintentar; canRun=false omite', async () => {
  let allowed = false
  let attempts = 0
  const prefetcher = createIntentPrefetcher({ canRun: () => allowed, delayMs: 1 })
  prefetcher.schedule('a', () => { attempts += 1 })
  await wait(10)
  assert.equal(attempts, 0, 'sin permiso no se pide')
  allowed = true
  prefetcher.schedule('a', async () => { attempts += 1; throw new Error('red') })
  await wait(10)
  prefetcher.schedule('a', () => { attempts += 1 })
  await wait(10)
  assert.equal(attempts, 2, 'el intento fallido y su reintento')
})
