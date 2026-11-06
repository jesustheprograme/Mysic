import assert from 'node:assert/strict'
import test from 'node:test'
import { originOf, preconnectTargets } from './warmup.js'

test('originOf devuelve el origen de URLs absolutas http(s)', () => {
  assert.equal(originOf('https://myslc.duckdns.org/api'), 'https://myslc.duckdns.org')
  assert.equal(originOf('http://localhost:4000/api'), 'http://localhost:4000')
})

test('originOf devuelve null para rutas relativas, otros esquemas y basura', () => {
  assert.equal(originOf('/api'), null)
  assert.equal(originOf('data:text/plain,hola'), null)
  assert.equal(originOf('blob:https://x.test/abc'), null)
  assert.equal(originOf(undefined), null)
})

test('preconnectTargets incluye la API con credenciales y los orígenes de YouTube sin ellas', () => {
  const targets = preconnectTargets('https://api.example.com/api')
  assert.deepEqual(targets[0], { origin: 'https://api.example.com', credentials: true })
  assert.ok(targets.slice(1).every((target) => target.credentials === false))
  assert.ok(targets.some((target) => target.origin === 'https://i.ytimg.com'))
})

test('con API relativa (mismo origen) no se precarga la API', () => {
  const targets = preconnectTargets('/api')
  assert.equal(targets.some((target) => target.credentials === true), false)
  assert.equal(targets.length, 3)
})
