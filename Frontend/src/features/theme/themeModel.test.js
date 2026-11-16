import assert from 'node:assert/strict'
import test from 'node:test'
import { applyTheme, DEFAULT_THEME, nextTheme, normalizeTheme, readStoredTheme, storeTheme, THEME_KEY } from './themeModel.js'

const memory = (initial = {}) => {
  const data = { ...initial }
  return { getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value }, data }
}

test('un valor guardado desconocido vuelve al tema por defecto', () => {
  assert.equal(normalizeTheme('light'), 'light')
  assert.equal(normalizeTheme('dark'), 'dark')
  assert.equal(normalizeTheme('sepia'), DEFAULT_THEME)
  assert.equal(normalizeTheme(null), DEFAULT_THEME)
})

test('guarda y lee el tema; un almacenamiento roto no lanza', () => {
  const storage = memory()
  storeTheme('light', storage)
  assert.equal(storage.data[THEME_KEY], 'light')
  assert.equal(readStoredTheme(storage), 'light')
  const broken = { getItem() { throw new Error('bloqueado') }, setItem() { throw new Error('bloqueado') } }
  assert.equal(readStoredTheme(broken), DEFAULT_THEME)
  assert.doesNotThrow(() => storeTheme('light', broken))
})

test('nextTheme alterna entre claro y oscuro', () => {
  assert.equal(nextTheme('dark'), 'light')
  assert.equal(nextTheme('light'), 'dark')
})

test('applyTheme marca data-theme, la clase dark y color-scheme', () => {
  const classes = new Set(['dark'])
  const root = { dataset: {}, style: {}, classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) } }
  applyTheme('light', root)
  assert.equal(root.dataset.theme, 'light')
  assert.equal(root.style.colorScheme, 'light')
  assert.equal(classes.has('dark'), false)
  applyTheme('dark', root)
  assert.equal(classes.has('dark'), true)
})