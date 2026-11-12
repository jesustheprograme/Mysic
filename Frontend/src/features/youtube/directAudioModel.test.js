import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  CLIENT_CONFIG_TTL_MS,
  directAudioEnabled,
  freshStoredConfig,
  isDirectSource,
  normalizeClientConfig,
  shouldBlockDirect,
} from './directAudioModel.js'

const valid = { version: 1, client: { clientName: 'VISIONOS', clientVersion: '1.03', clientId: '101' } }

test('directAudioEnabled: solo en escritorio y salvo que se desactive a mano', () => {
  assert.equal(directAudioEnabled({ flag: null, isDesktop: true }), true)
  assert.equal(directAudioEnabled({ flag: '1', isDesktop: true }), true)
  assert.equal(directAudioEnabled({ flag: '0', isDesktop: true }), false)
  assert.equal(directAudioEnabled({ flag: null, isDesktop: false }), false)
})

test('isDirectSource reconoce la fuente directa de ese vídeo y nada más', () => {
  assert.equal(isDirectSource('http://mysicstream.localhost/OJqSKKslH8g', 'OJqSKKslH8g'), true)
  assert.equal(isDirectSource('mysicstream://localhost/OJqSKKslH8g?x=1', 'OJqSKKslH8g'), true)
  assert.equal(isDirectSource('http://mysicstream.localhost/OTRO0000000', 'OJqSKKslH8g'), false)
  assert.equal(isDirectSource('https://api.test/api/youtube/stream/OJqSKKslH8g', 'OJqSKKslH8g'), false)
  assert.equal(isDirectSource('http://mysicaudio.localhost/OJqSKKslH8g', 'OJqSKKslH8g'), false)
  assert.equal(isDirectSource('', 'OJqSKKslH8g'), false)
  assert.equal(isDirectSource('http://mysicstream.localhost/OJqSKKslH8g', ''), false)
})

test('shouldBlockDirect: solo los fallos propios de ese vídeo lo bloquean, no los de red', () => {
  for (const code of ['UNAVAILABLE', 'LOGIN_REQUIRED', 'NO_AUDIO']) assert.equal(shouldBlockDirect(code), true, code)
  for (const code of ['NETWORK', 'VISITOR_UNAVAILABLE', 'PARSE', '']) assert.equal(shouldBlockDirect(code), false, code)
})

test('normalizeClientConfig acepta solo campos conocidos, de texto corto e imprimible', () => {
  assert.deepEqual(normalizeClientConfig(valid), valid.client)
  assert.deepEqual(normalizeClientConfig({ version: 1, client: { ...valid.client, desconocido: 'x' } }), valid.client)
  for (const bad of [
    null, 'texto', {}, { version: 2, client: valid.client }, { version: 1 }, { version: 1, client: {} },
    { version: 1, client: { clientName: ' ' } },
    { version: 1, client: { clientName: 5 } },
    { version: 1, client: { userAgent: 'Mozilla\nX-Injected: 1' } },
    { version: 1, client: { clientId: '10a' } },
    { version: 1, client: { userAgent: 'x'.repeat(301) } },
  ]) assert.equal(normalizeClientConfig(bad), null, JSON.stringify(bad)?.slice(0, 60))
})

test('freshStoredConfig: la copia guardada vale 24 h y no si es inválida o de otro reloj', () => {
  const stored = { client: valid.client, savedAt: 1_000 }
  assert.deepEqual(freshStoredConfig(stored, 1_000 + CLIENT_CONFIG_TTL_MS - 1), valid.client)
  assert.equal(freshStoredConfig(stored, 1_000 + CLIENT_CONFIG_TTL_MS), null)
  assert.equal(freshStoredConfig(stored, 500), null)
  assert.equal(freshStoredConfig({ client: { clientName: '' }, savedAt: 1_000 }, 2_000), null)
  assert.equal(freshStoredConfig(null), null)
})

test('el client-config.json publicado es válido y coincide con el perfil por defecto de Rust', () => {
  const published = JSON.parse(readFileSync(new URL('../../../public/client-config.json', import.meta.url), 'utf8'))
  const config = normalizeClientConfig(published)
  assert.ok(config, 'el archivo publicado debe ser aceptado por la validación')
  const rust = readFileSync(new URL('../../../src-tauri/src/resolver.rs', import.meta.url), 'utf8')
  for (const value of Object.values(config)) assert.ok(rust.includes(`"${value}"`), `Rust no tiene el valor por defecto ${value}`)
})
