import assert from 'node:assert/strict'
import test from 'node:test'
import { artistMatches, fitTracks, normalize, pickMatch, runMatching, titleSimilarity } from './spotifyImportModel.js'

const song = (id, title, artist = '') => ({ id, title, artist })

test('normalize y titleSimilarity: sin acentos, sufijos de edición ni "feat."', () => {
  assert.equal(normalize('  Canción – Ñandú! '), 'cancion nandu')
  assert.equal(titleSimilarity('Panama - 2015 Remaster', 'Panama'), 1)
  assert.equal(titleSimilarity('Song (feat. Otro)', 'Song'), 1)
  assert.ok(titleSimilarity('Stop The Wedding!', 'Stop The Wedding') >= 0.9)
  assert.ok(titleSimilarity('Una canción larga', 'Otra cosa distinta') < 0.5)
  assert.equal(titleSimilarity('', 'x'), 0)
})

test('artistMatches: cualquiera de los artistas, en el artista o el título', () => {
  assert.equal(artistMatches(['KAROL G', 'Judeline'], { artist: 'Karol G & Judeline', title: 'BbY WOW' }), true)
  assert.equal(artistMatches(['Ado'], { artist: 'Otra persona', title: 'Canción - Ado' }), true)
  assert.equal(artistMatches(['Ado'], { artist: 'Eve', title: 'Canción' }), false)
  assert.equal(artistMatches([], { artist: 'Eve', title: 'x' }), false)
})

test('pickMatch: encontrada, por revisar o no encontrada', () => {
  const track = { title: 'Housewife', artists: ['Tate McRae'] }
  assert.deepEqual(pickMatch(track, [song('a', 'Otra cosa', 'Alguien'), song('b', 'Housewife', 'Tate McRae')]), { tier: 'matched', song: song('b', 'Housewife', 'Tate McRae') })
  // El título coincide pero el artista no: se incluye, con duda.
  assert.equal(pickMatch(track, [song('c', 'Housewife', 'Un cover')]).tier, 'check')
  // El artista coincide y el título se parece a medias.
  assert.equal(pickMatch({ title: 'Mi canción de verano', artists: ['Eve'] }, [song('d', 'Mi canción', 'Eve')]).tier, 'matched')
  assert.deepEqual(pickMatch(track, [song('e', 'Nada que ver', 'Nadie')]), { tier: 'missing', song: null })
  assert.deepEqual(pickMatch(track, []), { tier: 'missing', song: null })
  assert.equal(pickMatch(track, [{ title: 'sin id' }]).tier, 'missing')
})

test('runMatching: varias a la vez (sin pasar del máximo), en orden y con reintento', async () => {
  const tracks = Array.from({ length: 20 }, (_, n) => ({ title: `T${n}`, artists: ['Ana'] }))
  let inFlight = 0
  let peak = 0
  const failedOnce = new Set()
  const search = async (query) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await new Promise((resolve) => setTimeout(resolve, 5))
    inFlight -= 1
    if (query.startsWith('T3 ') && !failedOnce.has(query)) { failedOnce.add(query); throw new Error('red') }
    if (query.startsWith('T7 ')) throw new Error('siempre falla')
    const title = query.split(' ')[0]
    return [song(`id-${title}`, title, 'Ana')]
  }
  const seen = []
  const results = await runMatching({ concurrency: 4, onProgress: (entry, index) => seen.push(index), retryDelayMs: 1, search, tracks })
  assert.equal(results.length, 20)
  assert.ok(peak > 1 && peak <= 4, `hasta 4 a la vez (hubo ${peak})`)
  assert.deepEqual(results.map((entry) => entry.track.title), tracks.map((track) => track.title), 'en el orden de la lista')
  assert.equal(results[3].tier, 'matched', 'el reintento la recupera')
  assert.equal(results[7].tier, 'missing')
  assert.equal(results[7].failed, true, 'fallo de red, no "no está en YouTube Music"')
  assert.equal(seen.length, 20)
})

test('runMatching: parar deja sin mirar las que faltaban', async () => {
  const tracks = Array.from({ length: 30 }, (_, n) => ({ title: `T${n}`, artists: ['Ana'] }))
  const controller = new AbortController()
  let done = 0
  const search = async (query) => {
    await new Promise((resolve) => setTimeout(resolve, 3))
    return [song(`id-${query}`, query.split(' ')[0], 'Ana')]
  }
  const results = await runMatching({
    concurrency: 3,
    onProgress: () => { done += 1; if (done === 5) controller.abort() },
    search,
    signal: controller.signal,
    tracks,
  })
  const resolved = results.filter(Boolean).length
  assert.ok(resolved >= 5 && resolved < 30, `se detuvo a mitad (${resolved})`)
})

test('fitTracks: solo las canciones que caben en el límite, en orden', () => {
  const tracks = Array.from({ length: 10 }, (_, n) => ({ id: `id${n}`, title: 'x'.repeat(90) }))
  const one = JSON.stringify(tracks[0]).length + 1
  assert.equal(fitTracks(tracks, one * 3 + 2).length, 3)
  assert.deepEqual(fitTracks(tracks, one * 3 + 2).map((track) => track.id), ['id0', 'id1', 'id2'])
  assert.equal(fitTracks(tracks, 1_000_000).length, 10)
  assert.deepEqual(fitTracks(tracks, 5), [])
})
