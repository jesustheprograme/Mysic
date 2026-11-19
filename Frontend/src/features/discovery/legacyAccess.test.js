import assert from 'node:assert/strict'
import test from 'node:test'
import { canSeeLegacyMysic, LEGACY_SECTIONS, sectionAllowed } from './legacyAccess.js'

test('canSeeLegacyMysic: solo el correo del dueño (sin importar mayúsculas ni espacios)', () => {
  assert.equal(canSeeLegacyMysic({ email: 'jesusobregon2010@gmail.com' }), true)
  assert.equal(canSeeLegacyMysic({ email: '  JesusObregon2010@Gmail.com ' }), true)
  assert.equal(canSeeLegacyMysic({ email: 'otra.persona@gmail.com' }), false)
  assert.equal(canSeeLegacyMysic({ email: 'jesusobregon2010@gmail.com.evil.example' }), false)
  assert.equal(canSeeLegacyMysic({}), false)
  assert.equal(canSeeLegacyMysic(null), false)
})

test('sectionAllowed: las secciones antiguas solo para el dueño; el resto, para todos', () => {
  for (const section of LEGACY_SECTIONS) {
    assert.equal(sectionAllowed(section, { legacy: false, importMusic: true }), false, section)
  }
  for (const section of ['home', 'explore', 'for-you', 'recent', 'albums', 'artists', 'playlists', 'downloads']) {
    assert.equal(sectionAllowed(section, { legacy: true }), true, section)
  }
  // Lo de ahora (YouTube Music, estadísticas y la ficha de una playlist propia o importada) no se toca.
  for (const section of ['youtube', 'stats', 'playlist']) assert.equal(sectionAllowed(section), true, section)
  // Importar música sigue pidiendo su propio permiso, además de ser del Mysic antiguo.
  assert.equal(sectionAllowed('import', { legacy: true, importMusic: false }), false)
  assert.equal(sectionAllowed('import', { legacy: true, importMusic: true }), true)
})
