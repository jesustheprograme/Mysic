import assert from 'node:assert/strict'
import test from 'node:test'
import { matchShortcut } from './shortcuts.js'

const press = (key, extra = {}) => ({ key, target: { tagName: 'DIV' }, ...extra })

test('Ctrl/Cmd+K abre la búsqueda incluso escribiendo en un campo', () => {
  assert.equal(matchShortcut(press('k', { ctrlKey: true })), 'search')
  assert.equal(matchShortcut(press('K', { metaKey: true, target: { tagName: 'INPUT' } })), 'search')
})

test('Ctrl+H y ? abren la ayuda; ? se ignora al escribir', () => {
  assert.equal(matchShortcut(press('h', { ctrlKey: true })), 'help')
  assert.equal(matchShortcut(press('?')), 'help')
  assert.equal(matchShortcut(press('?', { target: { tagName: 'INPUT' } })), null)
  assert.equal(matchShortcut(press('?', { target: { isContentEditable: true } })), null)
})

test('ignora otras teclas, Alt y eventos ya gestionados', () => {
  assert.equal(matchShortcut(press('k')), null)
  assert.equal(matchShortcut(press('k', { ctrlKey: true, altKey: true })), null)
  assert.equal(matchShortcut(press('k', { ctrlKey: true, defaultPrevented: true })), null)
  assert.equal(matchShortcut(press('k', { ctrlKey: true, shiftKey: true })), null)
  assert.equal(matchShortcut(null), null)
})
