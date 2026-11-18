import assert from 'node:assert/strict'
import test from 'node:test'
import { blocks, createTranslator, machineTranslate, parseTranslation, sourceTranslation, translationRequest } from './translate.js'

// Forma de la respuesta de translate_a/single: [[[traducido, original, …], …], null, idiomaDetectado, …]
const reply = (pairs, lang) => JSON.stringify([pairs.map(([to, from]) => [to, from, null, null, 10]), null, lang])

test('translationRequest: POST con las líneas unidas por saltos y el idioma de destino', () => {
  const request = translationRequest(['Hola', 'mundo & más'], 'es')
  assert.equal(request.method, 'POST')
  assert.match(request.url, /^https:\/\/translate\.googleapis\.com\/translate_a\/single\?/)
  assert.match(request.url, /tl=es/)
  assert.equal(decodeURIComponent(request.form.slice(2)), 'Hola\nmundo & más')
})

test('parseTranslation: una traducción por línea; si Google junta o parte líneas, nada', () => {
  assert.deepEqual(parseTranslation(reply([['Te quiero\n', 'I love you\n'], ['Adiós', 'Bye']], 'en'), 2), { lang: 'en', lines: ['Te quiero', 'Adiós'] })
  assert.equal(parseTranslation(reply([['Te quiero adiós', 'I love you\nBye']], 'en'), 2).lines, null)
  assert.deepEqual(parseTranslation('no es json', 1), { lang: null, lines: null })
})

test('blocks: no pasan del máximo y conservan el orden', () => {
  assert.deepEqual(blocks(['aaaa', 'bbbb', 'cc'], 10), [['aaaa', 'bbbb'], ['cc']])
  assert.deepEqual(blocks(['x'.repeat(20)], 10), [['x'.repeat(20)]], 'una línea larga va sola')
})

test('machineTranslate: cada línea distinta una vez; ya en el idioma pedido, nada', async () => {
  const calls = []
  const http = async (request) => {
    calls.push(decodeURIComponent(request.form.slice(2)))
    return { status: 200, body: reply([['Te quiero\nAdiós', 'I love you\nBye']], 'en') }
  }
  const result = await machineTranslate(['I love you', '', 'Bye', 'I love you'], { http, target: 'es' })
  assert.deepEqual(calls, ['I love you\nBye'])
  assert.equal(result.byText.get('I love you'), 'Te quiero')
  const spanish = await machineTranslate(['Hola'], { http: async () => ({ status: 200, body: reply([['Hola', 'Hola']], 'es') }), target: 'es' })
  assert.equal(spanish.lang, 'es')
  assert.equal(spanish.byText.size, 0)
  await assert.rejects(machineTranslate(['x'], { http: async () => ({ status: 429, body: '' }), target: 'es' }), /TRANSLATE_HTTP_429/)
})

test('createTranslator: la de la fuente si es en español; si no, automática; si falla, la de la fuente', async () => {
  const lines = [{ time: 1, text: '사랑', translation: 'love', translationLang: 'en' }, { time: 2, text: '' }]
  let calls = 0
  const ok = createTranslator({ http: async () => { calls += 1; return { status: 200, body: reply([['amor', '사랑']], 'ko') } } })
  const machine = await ok('song-1', lines)
  assert.equal(machine.source, 'machine')
  assert.equal(machine.original, 'ko')
  assert.equal(machine.byText.get('사랑'), 'amor')
  await ok('song-1', lines)
  assert.equal(calls, 1, 'en caché')

  const down = createTranslator({ http: async () => { throw new Error('sin red') } })
  const fallback = await down('song-1', lines)
  assert.equal(fallback.source, 'lyrics')
  assert.equal(fallback.byText.get('사랑'), 'love')

  const spanishSource = createTranslator({ http: async () => { throw new Error('no debería pedirse') } })
  const fromLyrics = await spanishSource('song-2', [{ time: 1, text: 'love', translation: 'amor', translationLang: 'es-419' }])
  assert.equal(fromLyrics.byText.get('love'), 'amor')

  await assert.rejects(down('song-3', [{ time: 1, text: 'love' }]), /sin red/)
  assert.deepEqual([...sourceTranslation([{ text: 'Hola', translation: 'hola' }]).byText], [], 'igual a la línea: no aporta')
})
