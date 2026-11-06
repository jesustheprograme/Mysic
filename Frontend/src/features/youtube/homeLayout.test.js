import assert from 'node:assert/strict'
import test from 'node:test'
import { applyHomeLayout, chooseShelfLayout, DEFAULT_LAYOUT, moveKey, sanitizeLayout, setAllHidden, shelfKey, toggleHidden, withOrder } from './homeLayout.js'

const shelves = [
  { title: 'Trending' },
  { title: 'Listen again' },
  { title: 'From the community' },
  { title: 'Algo que YouTube añadió' },
  { title: 'Quick picks' },
]

test('la clave es la misma en inglés y en español', () => {
  assert.equal(shelfKey('Listen again'), 'volver a escuchar')
  assert.equal(shelfKey('Volver a escuchar'), 'volver a escuchar')
})

test('el orden por defecto pone lo personal primero y lo desconocido al final', () => {
  const { sections } = applyHomeLayout(shelves, DEFAULT_LAYOUT)
  assert.deepEqual(sections.map((section) => section.key), [
    'volver a escuchar', 'selección rápida', 'de la comunidad', 'tendencias', 'algo que youtube añadió',
  ])
})

test('lo ordenado por el usuario manda; lo nuevo se coloca detrás', () => {
  const layout = withOrder(DEFAULT_LAYOUT, ['tendencias', 'volver a escuchar'])
  const { sections } = applyHomeLayout(shelves, layout)
  assert.deepEqual(sections.slice(0, 2).map((section) => section.key), ['tendencias', 'volver a escuchar'])
  assert.equal(sections.length, 5)
})

test('las secciones ocultas no se pintan pero siguen en el panel', () => {
  const layout = toggleHidden(DEFAULT_LAYOUT, 'tendencias')
  const { sections, visible } = applyHomeLayout(shelves, layout)
  assert.equal(sections.find((section) => section.key === 'tendencias').hidden, true)
  assert.equal(visible.length, 4)
  assert.deepEqual(toggleHidden(layout, 'tendencias').hidden, [])
})

test('ocultar y mostrar todo', () => {
  const keys = ['a', 'b']
  assert.deepEqual(setAllHidden(DEFAULT_LAYOUT, keys, true).hidden, keys)
  assert.deepEqual(setAllHidden(DEFAULT_LAYOUT, keys, false).hidden, [])
})

test('una sección repetida solo cuenta una vez', () => {
  const { sections } = applyHomeLayout([{ title: 'Trending' }, { title: 'trending' }], DEFAULT_LAYOUT)
  assert.equal(sections.length, 1)
})

test('cada sección elige su formato según el contenido', () => {
  const songs = [{ kind: 'song' }, { kind: 'song' }]
  assert.equal(chooseShelfLayout({ title: 'Listen again', items: [{ kind: 'album' }, { kind: 'song' }] }), 'tiles')
  assert.equal(chooseShelfLayout({ title: 'Quick picks', items: songs }), 'songs')
  assert.equal(chooseShelfLayout({ title: 'Forgotten favorites', items: songs }), 'songs')
  assert.equal(chooseShelfLayout({ title: 'Familiar artists', items: [{ kind: 'artist' }] }), 'artists')
  assert.equal(chooseShelfLayout({ title: 'From the community', items: [{ kind: 'playlist' }] }), 'community')
  assert.equal(chooseShelfLayout({ title: 'From the community', items: [{ kind: 'playlist' }, { kind: 'song' }] }), 'rail')
  assert.equal(chooseShelfLayout({ title: 'Albums for you', items: [{ kind: 'album' }, { kind: 'playlist' }] }), 'rail')
  assert.equal(chooseShelfLayout({ title: 'Listen again', items: [] }), 'rail')
  assert.equal(chooseShelfLayout({ title: 'x', items: [] }), 'rail')
})

test('el panel recibe el formato de cada sección', () => {
  const { sections } = applyHomeLayout([{ title: 'Quick picks', items: [{ kind: 'song' }] }], DEFAULT_LAYOUT)
  assert.equal(sections[0].kind, 'songs')
})

test('moveKey respeta los extremos', () => {
  assert.deepEqual(moveKey(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c'])
  assert.deepEqual(moveKey(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c'])
  assert.deepEqual(moveKey(['a', 'b', 'c'], 'c', 1), ['a', 'b', 'c'])
  assert.deepEqual(moveKey(['a', 'b', 'c'], 'zz', 1), ['a', 'b', 'c'])
})

test('sanitizeLayout corrige datos guardados inválidos', () => {
  assert.deepEqual(sanitizeLayout(null), DEFAULT_LAYOUT)
  assert.deepEqual(sanitizeLayout({ cardSize: 'enorme', hidden: 'x', order: [1, 'a', 'a'] }), { cardSize: 'medium', hidden: [], order: ['a'] })
  assert.equal(sanitizeLayout({ cardSize: 'large' }).cardSize, 'large')
})
