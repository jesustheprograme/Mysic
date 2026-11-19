import assert from 'node:assert/strict'
import test from 'node:test'
import { createSpotifyImport, importPill, IDLE_IMPORT, missingText, percentOf } from './spotifyImportStore.js'

const tracks = (count) => Array.from({ length: count }, (_, n) => ({ title: `T${n}`, artists: ['Ana'] }))
const LONG_THUMB = 'https://yt3.googleusercontent.com/' + 'x'.repeat(95) + '=w120-h120-l90-rj'
const song = (n) => ({ id: `id${n}`, title: `T${n}`, artist: 'Ana', thumbnail: `t${n}.jpg` })
const info = (count, extra = {}) => ({ name: 'Mi lista', owner: 'jose', cover: 'https://i.scdn.co/image/abc', tracks: tracks(count), truncated: false, ...extra })

/** Corredor falso: resuelve cada pista con el nivel que diga `tiers(n)` y avisa del progreso en orden. */
const fakeRunner = (tiers = () => 'matched', thumbnail = null) => async ({ onProgress, signal, tracks: list }) => {
  const results = []
  for (let n = 0; n < list.length; n += 1) {
    if (signal.aborted) break
    await new Promise((resolve) => setTimeout(resolve, 1))
    const tier = tiers(n)
    const entry = { track: list[n], tier, song: tier === 'missing' ? null : { ...song(n), ...(thumbnail ? { thumbnail } : {}) } }
    results[n] = entry
    onProgress(entry, n)
  }
  return results
}

const saver = () => {
  const calls = []
  const save = async (details, id) => {
    calls.push({ id, count: details.tracks.length, title: details.title, artwork: details.artwork })
    return { id: id ?? 'PL1', updated: Boolean(id) }
  }
  return { calls, save }
}

test('vista previa -> encontrando -> listo: contadores, recientes y playlist guardada sin abrir nada', async () => {
  const store = createSpotifyImport({ runner: fakeRunner((n) => (n === 3 ? 'missing' : n === 5 ? 'check' : 'matched')) })
  const { calls, save } = saver()
  const toasts = []
  store.configure({ save, notify: (text) => toasts.push(text) })
  assert.deepEqual(store.getState(), IDLE_IMPORT)

  assert.deepEqual(store.openPreview(info(8)), { busy: false })
  assert.equal(store.getState().phase, 'preview')
  assert.equal(store.getState().total, 8)
  assert.equal(store.getState().open, true)

  await store.start({ search: async () => [] })
  const done = store.getState()
  assert.equal(done.phase, 'done')
  assert.deepEqual([done.done, done.matched, done.check, done.missing], [8, 6, 1, 1])
  assert.equal(done.found, 7)
  assert.equal(done.saved.count, 7)
  assert.equal(done.saved.updated, false)
  assert.equal(done.recent.length, 3, 'las últimas tres')
  assert.deepEqual(done.missingList, [{ title: 'T3', artists: 'Ana' }])
  assert.equal(missingText(done), 'T3 - Ana')
  assert.equal(done.checkList[0].found, 'T5')
  assert.equal(percentOf(done), 100)
  // La playlist lleva la portada de Spotify, su nombre y solo las encontradas.
  assert.deepEqual(calls.at(-1), { id: calls.length > 1 ? 'PL1' : null, count: 7, title: 'Mi lista', artwork: 'https://i.scdn.co/image/abc' })
  assert.deepEqual(toasts, [], 'con el cuadro abierto no hace falta aviso')
})

test('guardado progresivo: se crea con las primeras y se completa al terminar (sin duplicar)', async () => {
  const store = createSpotifyImport({ runner: fakeRunner() })
  const { calls, save } = saver()
  store.configure({ save })
  store.openPreview(info(30))
  await store.start({ search: async () => [] })
  assert.ok(calls.length >= 2, 'una a mitad y otra al final')
  assert.equal(calls[0].id, null, 'la primera crea')
  assert.ok(calls[0].count >= 10 && calls[0].count < 30)
  assert.ok(calls.slice(1).every((call) => call.id === 'PL1'), 'las demás actualizan la misma')
  assert.equal(calls.at(-1).count, 30)
  assert.equal(store.getState().saved.updated, false, 'la creó esta importación: no es una actualización')
})

test('parar: guarda lo encontrado hasta ese momento y queda como detenida', async () => {
  const store = createSpotifyImport({ runner: fakeRunner() })
  const { calls, save } = saver()
  store.configure({ save })
  store.openPreview(info(40))
  const unsubscribe = store.subscribe(() => { if (store.getState().done === 12) store.stop() })
  await store.start({ search: async () => [] })
  unsubscribe()
  const state = store.getState()
  assert.equal(state.phase, 'cancelled')
  assert.ok(state.done >= 12 && state.done < 40)
  assert.equal(calls.at(-1).count, state.found)
  assert.match(state.message, /se guardaron \d+ canciones/)
})

test('si el servidor rechaza una lista grande, guarda la parte que cabe', async () => {
  const store = createSpotifyImport({ runner: fakeRunner(() => 'matched', LONG_THUMB) })
  const calls = []
  store.configure({
    save: async (details, id) => {
      calls.push(details.tracks.length)
      if (JSON.stringify(details).length > 32 * 1024) return null // como el servidor, que corta a 32 kB
      return { id: id ?? 'PL1', updated: Boolean(id) }
    },
  })
  store.openPreview(info(120))
  await store.start({ search: async () => [] })
  const state = store.getState()
  assert.equal(state.phase, 'done')
  assert.ok(state.saved.trimmed > 0, `se recortó (${state.saved.trimmed})`)
  assert.equal(state.saved.count + state.saved.trimmed, 120)
  assert.ok(state.saved.count > 60 && state.saved.count < 120)
})

test('nada encontrado, fallo de red y error al guardar son fallos con su motivo', async () => {
  const none = createSpotifyImport({ runner: fakeRunner(() => 'missing') })
  none.configure({ save: saver().save })
  none.openPreview(info(4))
  await none.start({ search: async () => [] })
  assert.equal(none.getState().phase, 'failed')
  assert.match(none.getState().message, /ninguna/)

  const noSave = createSpotifyImport({ runner: fakeRunner() })
  noSave.configure({ save: async () => null })
  noSave.openPreview(info(3))
  await noSave.start({ search: async () => [] })
  assert.equal(noSave.getState().phase, 'failed')
  assert.match(noSave.getState().message, /no se pudo guardar/)

  const empty = createSpotifyImport({ runner: fakeRunner() })
  empty.openPreview(info(0))
  await empty.start({ search: async () => [] })
  assert.equal(empty.getState().phase, 'failed')
})

test('cerrar el cuadro no la detiene; al terminar con el cuadro cerrado avisa; cerrar un final limpia todo', async () => {
  const store = createSpotifyImport({ runner: fakeRunner() })
  const toasts = []
  store.configure({ save: saver().save, notify: (text) => toasts.push(text) })
  store.openPreview(info(15))
  const running = store.start({ search: async () => [] })
  assert.equal(store.getState().phase, 'matching')
  store.close()
  assert.equal(store.getState().open, false)
  assert.equal(store.getState().phase, 'matching', 'sigue')
  // Mientras corre, otro enlace no empieza otra importación: reabre la actual.
  assert.deepEqual(store.openPreview(info(5)), { busy: true })
  assert.equal(store.getState().open, true)
  store.close()
  await running
  assert.equal(store.getState().phase, 'done')
  assert.equal(toasts.length, 1)
  assert.match(toasts[0], /Playlist «Mi lista» creada: 15 de 15 canciones/)
  assert.deepEqual(importPill(store.getState()), { label: 'Importación completada', percent: 100 })
  store.reopen()
  store.close()
  assert.deepEqual(store.getState(), IDLE_IMPORT)
  assert.equal(importPill(store.getState()), null)
})

test('reproducir usa las canciones encontradas, en orden', async () => {
  const store = createSpotifyImport({ runner: fakeRunner((n) => (n === 1 ? 'missing' : 'matched')) })
  let played = null
  store.configure({ save: saver().save, play: (songs) => { played = songs } })
  store.openPreview(info(4))
  await store.start({ search: async () => [] })
  store.playSongs()
  assert.deepEqual(played.map((entry) => entry.id), ['id0', 'id2', 'id3'])
})

test('importPill: porcentaje mientras busca', () => {
  assert.deepEqual(importPill({ phase: 'matching', done: 25, total: 100 }), { label: 'Importando 25 %', percent: 25 })
  assert.equal(importPill({ phase: 'preview' }), null)
})

test('volver a importar una playlist que ya existía la actualiza (y lo dice)', async () => {
  const store = createSpotifyImport({ runner: fakeRunner() })
  const toasts = []
  store.configure({
    // El anfitrión encuentra por nombre una playlist ya creada y la actualiza; las siguientes escrituras reusan su id.
    save: async (details, id) => ({ id: id ?? 'PL-vieja', updated: id == null }),
    notify: (text) => toasts.push(text),
  })
  store.openPreview(info(12))
  store.close()
  store.reopen()
  store.close()
  store.openPreview(info(12))
  const running = store.start({ search: async () => [] })
  store.close()
  await running
  assert.equal(store.getState().saved.updated, true)
  assert.match(toasts[0], /actualizada: 12 de 12/)
})