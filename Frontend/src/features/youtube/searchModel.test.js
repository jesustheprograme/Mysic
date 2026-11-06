import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSearchModel, localizeAudience, stripKindLabel } from './searchModel.js'

const song = (n, extra = {}) => ({
  id: `s${n}`, title: `Canción ${n}`, artist: 'Ado', album: `Álbum ${n}`, duration: '3:24', durationSeconds: 204, thumbnail: `t${n}`, ...extra,
})
const album = (n, extra = {}) => ({ id: `a${n}`, title: `Álbum ${n}`, artist: 'Ado', year: '2024', kind: 'Álbum', thumbnail: `at${n}`, ...extra })
const artist = (n, extra = {}) => ({ id: `ar${n}`, name: `Artista ${n}`, subtitle: '1.5M monthly audience', thumbnail: `art${n}`, ...extra })

test('localizeAudience traduce oyentes y suscriptores y conserva lo desconocido', () => {
  assert.equal(localizeAudience('12.4M monthly audience'), '12.4 M oyentes mensuales')
  assert.equal(localizeAudience('74,4M monthly listeners'), '74.4 M oyentes mensuales')
  assert.equal(localizeAudience('3.1K subscribers'), '3.1 K suscriptores')
  assert.equal(localizeAudience('950 monthly audience'), '950 oyentes mensuales')
  assert.equal(localizeAudience('12.4 M de oyentes mensuales'), '12.4 M de oyentes mensuales')
  assert.equal(localizeAudience('Algo raro'), 'Algo raro')
  assert.equal(localizeAudience(undefined), '')
})

test('stripKindLabel quita solo la etiqueta de tipo inicial', () => {
  assert.equal(stripKindLabel('Artist • 12.4M monthly audience'), '12.4M monthly audience')
  assert.equal(stripKindLabel('Song • Ado • 3:24'), 'Ado · 3:24')
  assert.equal(stripKindLabel('Ado • 2024'), 'Ado · 2024')
  assert.equal(stripKindLabel('Artista'), 'Artista')
  assert.equal(stripKindLabel(null), '')
})

test('sin consulta muestra el historial como filas', () => {
  const model = buildSearchModel({ suggestions: { entities: [] }, history: ['ado', 'queen'], hasQuery: false })
  assert.deepEqual(model.rows.map((row) => row.title), ['ado', 'queen'])
  assert.equal(model.featured, null)
  assert.deepEqual(model.sections, [])
})

test('con búsqueda completa respeta orden, límites y datos reales', () => {
  const search = {
    type: 'all',
    top: { kind: 'artist', id: 'ar0', title: 'Ado', subtitle: 'Artist • 12.4M monthly audience', thumbnail: 'top' },
    songs: [1, 2, 3, 4, 5].map((n) => song(n)),
    albums: [1, 2, 3, 4].map((n) => album(n)),
    artists: [artist(0, { id: 'ar0', name: 'Ado' })],
  }
  const model = buildSearchModel({ suggestions: { entities: [] }, search, hasQuery: true })

  assert.equal(model.featured.subtitle, '12.4 M oyentes mensuales')
  assert.deepEqual(model.sections.map((section) => section.kind), ['song', 'album'])
  assert.equal(model.sections[0].rows.length, 4)
  assert.equal(model.sections[1].rows.length, 3)
  assert.equal(model.sections[0].viewAll, true)
  assert.equal(model.sections[0].rows[0].subtitle, 'Ado · Álbum 1')
  assert.equal(model.sections[0].rows[0].duration, '3:24')
  assert.equal(model.sections[1].rows[0].subtitle, 'Ado · 2024')
  assert.equal(model.rows.length, 1 + 4 + 3)
})

test('el artista del resultado principal no se repite, pero sí otros distintos', () => {
  const base = { type: 'all', top: { kind: 'artist', id: 'ar0', title: 'Ado', subtitle: '', thumbnail: '' }, songs: [], albums: [] }
  const only = buildSearchModel({ suggestions: {}, hasQuery: true, search: { ...base, artists: [artist(0, { id: 'ar0' })] } })
  assert.deepEqual(only.sections, [])

  const more = buildSearchModel({ suggestions: {}, hasQuery: true, search: { ...base, artists: [artist(0, { id: 'ar0' }), artist(1), artist(2)] } })
  assert.deepEqual(more.sections.map((section) => section.kind), ['artist'])
  assert.equal(more.sections[0].rows.length, 2)
  assert.equal(more.sections[0].rows[0].subtitle, '1.5 M oyentes mensuales')
})

test('una canción como resultado principal no aparece también en la lista', () => {
  const search = {
    type: 'all',
    top: { kind: 'song', id: 's1', title: 'Canción 1', subtitle: 'Song • Ado • 3:24', thumbnail: 't1' },
    songs: [song(1), song(2)], albums: [], artists: [],
  }
  const model = buildSearchModel({ suggestions: {}, search, hasQuery: true })
  assert.deepEqual(model.sections[0].rows.map((row) => row.id), ['s2'])
})

test('sin duración o sin álbum no se inventan datos ni separadores', () => {
  const search = {
    type: 'all', top: null,
    songs: [song(1, { duration: '--:--', album: 'Sencillo' })], albums: [album(1, { year: '' })], artists: [],
  }
  const model = buildSearchModel({ suggestions: {}, search, hasQuery: true })
  assert.equal(model.sections[0].rows[0].duration, '')
  assert.equal(model.sections[0].rows[0].subtitle, 'Ado')
  assert.equal(model.sections[1].rows[0].subtitle, 'Ado')
})

test('sin búsqueda completa recurre a las sugerencias y no muestra "Ver todo"', () => {
  const suggestions = {
    entities: [
      { kind: 'artist', id: 'ar0', title: 'Ado', subtitle: 'Artist • 12.4M monthly audience', thumbnail: 'a' },
      { kind: 'song', id: 's1', title: 'Usseewa', subtitle: 'Song • Ado', thumbnail: 'x', song: song(1) },
      { kind: 'album', id: 'a1', title: 'Kyōgen', subtitle: 'Album • Ado • 2022', thumbnail: 'y' },
    ],
  }
  const model = buildSearchModel({ suggestions, search: null, hasQuery: true })
  assert.equal(model.featured.id, 'ar0')
  assert.deepEqual(model.sections.map((section) => section.kind), ['song', 'album'])
  assert.ok(model.sections.every((section) => section.viewAll === false))
  assert.equal(model.sections[1].rows[0].subtitle, 'Ado · 2022')
})

test('las filas planas siguen el orden visual para el teclado', () => {
  const search = {
    type: 'all', top: { kind: 'artist', id: 'ar0', title: 'Ado', subtitle: '', thumbnail: '' },
    songs: [song(1)], albums: [album(1)], artists: [artist(1)],
  }
  const { rows } = buildSearchModel({ suggestions: {}, search, hasQuery: true })
  assert.deepEqual(rows.map((row) => row.kind), ['artist', 'song', 'album', 'artist'])
})
