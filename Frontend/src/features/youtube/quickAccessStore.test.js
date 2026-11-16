import assert from 'node:assert/strict'
import test from 'node:test'
import { PINNED_LIMIT, sanitizeHidden, sanitizePinned, shortcutOf } from './quickAccessStore.js'

test('sanitizePinned descarta lo inválido y los duplicados', () => {
  const out = sanitizePinned([
    { id: 'a', kind: 'album', title: 'Alba' },
    { id: 'a', kind: 'album', title: 'Repetido' },
    { id: 'a', kind: 'song', title: 'Misma id, otro tipo' },
    { id: 'x', kind: 'raro', title: 'Tipo desconocido' },
    { id: '', kind: 'artist', title: 'Sin id' },
    null,
  ])
  assert.deepEqual(out.map((entry) => `${entry.kind}:${entry.id}`), ['album:a', 'song:a'])
  assert.equal(out[0].thumbnail, null)
})

test('sanitizePinned respeta el tope y tolera basura', () => {
  const many = Array.from({ length: PINNED_LIMIT + 5 }, (_, i) => ({ id: `p${i}`, kind: 'playlist', title: `P${i}` }))
  assert.equal(sanitizePinned(many).length, PINNED_LIMIT)
  assert.deepEqual(sanitizePinned('no es una lista'), [])
})

test('sanitizeHidden descarta lo que no sea texto y repetidos', () => {
  assert.deepEqual(sanitizeHidden(['a:1', 'a:1', '', 5, null, 'b:2']), ['a:1', 'b:2'])
  assert.deepEqual(sanitizeHidden({}), [])
})

test('shortcutOf adapta cada tipo', () => {
  assert.deepEqual(shortcutOf('album', { id: 'MP1', title: 'Alba', artist: 'Ado', thumbnail: 't.jpg' }), { id: 'MP1', kind: 'album', subtitle: 'Ado', thumbnail: 't.jpg', title: 'Alba' })
  assert.equal(shortcutOf('artist', { id: 'UC1', name: 'Ado' }).title, 'Ado')
  assert.equal(shortcutOf('playlist', { id: 'PL1', title: 'Zumba' }).subtitle, 'Playlist')
})
