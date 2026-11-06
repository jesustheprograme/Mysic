const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { parseLrc } = require('./lrc')
const { createLyricsService, pickBest, normalize } = require('./service')

test('parseLrc ordena líneas, admite varias marcas y descarta metadatos', () => {
  const lines = parseLrc('[ar:Ado]\n[ti:Usseewa]\n[00:20.50]segunda\n[00:05.00][00:30.00]coro\n[01:02]final\n')
  assert.deepEqual(lines, [
    { time: 5, text: 'coro' },
    { time: 20.5, text: 'segunda' },
    { time: 30, text: 'coro' },
    { time: 62, text: 'final' },
  ])
})

test('parseLrc aplica offset, conserva pausas vacías y tolera entradas inválidas', () => {
  assert.deepEqual(parseLrc('[offset:500]\n[00:10.00]hola\n[00:12.00]'), [
    { time: 10.5, text: 'hola' },
    { time: 12.5, text: '' },
  ])
  assert.deepEqual(parseLrc(''), [])
  assert.deepEqual(parseLrc(null), [])
  assert.equal(parseLrc('[00:01.00]x')[0].time, 1)
})

test('pickBest exige duración cercana y prefiere letra sincronizada', () => {
  const plain = { plainLyrics: 'a', duration: 200 }
  const synced = { syncedLyrics: '[00:01.00]a', duration: 202 }
  const wrongCut = { syncedLyrics: '[00:01.00]a', duration: 260 }
  assert.equal(pickBest([plain, synced, wrongCut], 200), synced)
  assert.equal(pickBest([wrongCut], 200), null)
  assert.equal(pickBest([{ instrumental: true, plainLyrics: 'x', duration: 200 }], 200), null)
  assert.equal(pickBest([plain], 0), null)
})

test('normalize quita sufijos de edición', () => {
  assert.equal(normalize('Usseewa (Remastered 2020)'), 'usseewa')
  assert.equal(normalize('  Song - Single '), 'song')
})

function jsonResponse(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

test('getLyrics consulta LRCLIB, cachea en disco y deduplica peticiones', async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mysic-lyrics-'))
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return jsonResponse({ syncedLyrics: '[00:01.00]hola', plainLyrics: 'hola', duration: 200 })
  }
  const service = createLyricsService({ cacheDir, fetchImpl })
  const track = { artist: 'Ado', title: 'Usseewa', duration: 200 }

  const [a, b] = await Promise.all([service.getLyrics(track), service.getLyrics(track)])
  assert.equal(calls, 1)
  assert.deepEqual(a.synced, [{ time: 1, text: 'hola' }])
  assert.equal(b.found, true)

  const again = await service.getLyrics(track)
  assert.equal(again.cached, true)
  assert.equal(calls, 1)
  await fs.rm(cacheDir, { recursive: true, force: true })
})

test('la capa de memoria responde aunque el archivo del disco desaparezca y no deja temporales', async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mysic-lyrics-mem-'))
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return jsonResponse({ plainLyrics: 'hola', duration: 100 })
  }
  const service = createLyricsService({ cacheDir, fetchImpl })
  const track = { artist: 'A', title: 'B', duration: 100 }

  await service.getLyrics(track)
  const files = await fs.readdir(cacheDir)
  assert.equal(files.filter((name) => name.endsWith('.tmp')).length, 0)
  assert.equal(files.filter((name) => name.endsWith('.json')).length, 1)

  await fs.rm(cacheDir, { recursive: true, force: true })
  const again = await service.getLyrics(track)
  assert.equal(again.cached, true)
  assert.equal(calls, 1)
})

test('poda del disco las entradas más antiguas que el TTL y conserva las recientes', async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mysic-lyrics-prune-'))
  const oldFile = path.join(cacheDir, 'viejo.json')
  const freshFile = path.join(cacheDir, 'reciente.json')
  await fs.writeFile(oldFile, '{}')
  await fs.writeFile(freshFile, '{}')
  const longAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
  await fs.utimes(oldFile, longAgo, longAgo)

  const service = createLyricsService({
    cacheDir,
    fetchImpl: async () => jsonResponse({}, 404),
  })
  await service.getLyrics({ artist: 'X', title: 'Y', duration: 100 })

  const deadline = Date.now() + 2000
  let names = await fs.readdir(cacheDir)
  while (names.includes('viejo.json') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20))
    names = await fs.readdir(cacheDir)
  }
  assert.equal(names.includes('viejo.json'), false)
  assert.equal(names.includes('reciente.json'), true)
  await fs.rm(cacheDir, { recursive: true, force: true })
})

test('getLyrics recurre a la búsqueda y cachea la ausencia', async () => {
  const urls = []
  const fetchImpl = async (url) => {
    urls.push(new URL(url).pathname)
    return url.includes('/get') ? jsonResponse({}, 404) : jsonResponse([])
  }
  const service = createLyricsService({ fetchImpl })
  const result = await service.getLyrics({ artist: 'X', title: 'Y', duration: 100 })
  assert.equal(result.found, false)
  assert.deepEqual(urls, ['/api/get', '/api/search'])
})

test('getLyrics no cachea errores de red', async () => {
  let fail = true
  const fetchImpl = async () => {
    if (fail) return jsonResponse({}, 500)
    return jsonResponse({ plainLyrics: 'ok', duration: 100 })
  }
  const service = createLyricsService({ fetchImpl })
  const track = { artist: 'X', title: 'Y', duration: 100 }
  await assert.rejects(service.getLyrics(track), /LRCLIB/)
  fail = false
  assert.equal((await service.getLyrics(track)).found, true)
})
