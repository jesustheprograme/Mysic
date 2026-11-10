import assert from 'node:assert/strict'
import test from 'node:test'
import { sidebarViewFor } from './sidebarView.js'

test('las secciones de primer nivel se resaltan por sí mismas', () => {
  assert.equal(sidebarViewFor('home', 'library'), 'home')
  assert.equal(sidebarViewFor('explore', 'home'), 'explore')
  assert.equal(sidebarViewFor('official-library', 'home'), 'library')
})

test('las vistas de detalle heredan la sección desde la que se abrieron', () => {
  for (const kind of ['artist', 'album', 'playlist', 'artist-songs', 'search', 'downloads', 'recommendations']) {
    assert.equal(sidebarViewFor(kind, 'library'), 'library', kind)
    assert.equal(sidebarViewFor(kind, 'explore'), 'explore', kind)
  }
  assert.equal(sidebarViewFor(undefined), 'home')
})