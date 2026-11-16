import assert from 'node:assert/strict'
import test from 'node:test'
import { buildQuickAccess, moveKey } from './quickAccessModel.js'

const data = {
  albums: [{ id: 'MP1', title: 'Alba', artist: 'Ado' }],
  likedSongs: [{ id: 's1', thumbnail: 'a.jpg' }],
  playlists: [{ id: 'LM', title: 'Liked' }, { id: 'PL1', title: 'Zumba', itemCount: 1 }, { id: 'PL1', title: 'Repetida' }],
}

test('orden: En repetición, Me gusta, playlists y álbumes; sin la lista LM ni duplicados', () => {
  const entries = buildQuickAccess(data, { repeat: [{ id: 'r1' }, { id: 'r2' }] })
  assert.deepEqual(entries.map((entry) => entry.id), ['repeat', 'liked', 'PL1', 'MP1'])
  assert.equal(entries[0].subtitle, '2 canciones')
  assert.equal(entries[2].subtitle, '1 canción')
  assert.equal(entries[3].subtitle, 'Ado')
})

test('sin historial no hay En repetición y respeta el límite', () => {
  assert.equal(buildQuickAccess(data).some((entry) => entry.id === 'repeat'), false)
  assert.equal(buildQuickAccess(data, { limit: 2 }).length, 2)
})

test('lo quitado con la x no vuelve a salir y deja sitio al siguiente', () => {
  const ids = (entries) => entries.map((entry) => entry.id)
  const hidden = ['special:liked', 'playlist:PL1']
  assert.deepEqual(ids(buildQuickAccess(data, { hidden, repeat: [{ id: 'r1' }, { id: 'r2' }] })), ['repeat', 'MP1'])
  assert.deepEqual(ids(buildQuickAccess(data, { hidden: ['special:repeat'], repeat: [{ id: 'r1' }, { id: 'r2' }] })).slice(0, 2), ['liked', 'PL1'])
})

test('el total de Me gusta de la caché reducida manda sobre las canciones cargadas', () => {
  const entries = buildQuickAccess({ ...data, likedTotal: 2162 })
  assert.equal(entries.find((entry) => entry.id === 'liked').subtitle, '2162 canciones')
})

test('el orden arrastrado manda; lo no colocado conserva su orden detrás', () => {
  const ids = (entries) => entries.map((entry) => entry.id)
  const repeat = [{ id: 'r1' }, { id: 'r2' }]
  assert.deepEqual(ids(buildQuickAccess(data, { order: ['album:MP1', 'special:liked'], repeat })), ['MP1', 'liked', 'repeat', 'PL1'])
  assert.deepEqual(moveKey(['a', 'b', 'c', 'd'], 'a', 'c'), ['b', 'c', 'a', 'd'])
  assert.deepEqual(moveKey(['a', 'b', 'c', 'd'], 'd', 'b'), ['a', 'd', 'b', 'c'])
  const keys = ['a', 'b']
  assert.equal(moveKey(keys, 'a', 'zz'), keys)
})

test('los fijados a mano caben aunque superen el límite de los automáticos', () => {
  const pinned = Array.from({ length: 12 }, (_, i) => ({ id: `PIN${i}`, kind: 'album', title: `Fijado ${i}` }))
  const entries = buildQuickAccess(data, { pinned })
  assert.equal(entries.filter((entry) => entry.pinned).length, 12)
  assert.equal(entries.length, 13, 'Me gusta + 12 fijados; lo automático ya no entra')
})

test('sin biblioteca no hay accesos', () => {
  assert.deepEqual(buildQuickAccess(undefined), [])
})
