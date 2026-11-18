import assert from 'node:assert/strict'
import test from 'node:test'
import { isFlat, parseAny, parseKpoe, parseLrc, parseTtml, parseTtmlTime, toResult } from './parse.js'

test('parseLrc: marcas múltiples, offset, LRC extendido y metadatos', () => {
  const lines = parseLrc('[ar:X]\n[offset:500]\n[00:01.00][00:03.50]Hola <00:01.20>mundo\n[00:02.10]Adiós\n[00:04]')
  assert.deepEqual(lines, [
    { time: 1.5, text: 'Hola mundo' },
    { time: 2.6, text: 'Adiós' },
    { time: 4, text: 'Hola mundo' },
    { time: 4.5, text: '' },
  ])
})

test('parseTtmlTime: formatos de Apple', () => {
  assert.equal(parseTtmlTime('9.731'), 9.731)
  assert.equal(parseTtmlTime('3:49.021'), 229.021)
  assert.equal(parseTtmlTime('1:02:03.5'), 3723.5)
  assert.equal(parseTtmlTime('12.5s'), 12.5)
  assert.equal(parseTtmlTime('x'), null)
})

test('parseTtml: palabras unidas, coros entre paréntesis, entidades y lyricOffset', () => {
  const ttml = '<tt><head><audio lyricOffset="0.5"/></head><body>'
    + '<p begin="9.731" end="12.1"><span begin="9.731">The</span> <span begin="9.9">club&apos;s</span></p>'
    + '<p begin="1:02.000"><span begin="62">Oh</span> <span ttm:role="x-bg"><span begin="63">(yeah</span> <span begin="63.5">yeah)</span></span></p>'
    + '</body></tt>'
  assert.deepEqual(parseTtml(ttml), [
    { time: 10.231, text: "The club's" },
    { time: 62.5, text: 'Oh (yeah yeah)' },
  ])
})

test('parseTtml y parseKpoe: traducción de la fuente por línea, con su idioma', () => {
  const ttml = '<tt><head><translations><translation type="replacement" xml:lang="en"><text for="L1">I love you</text><text for="L2">Same</text></translation></translations></head><body>'
    + '<p begin="00:01.000" itunes:key="L1">사랑해</p><p begin="00:02.000" itunes:key="L2">Same</p></body></tt>'
  assert.deepEqual(parseTtml(ttml), [
    { time: 1, text: '사랑해', translation: 'I love you', translationLang: 'en' },
    { time: 2, text: 'Same' },
  ])
  const kpoe = { lyrics: [{ time: 1000, text: '사랑', translation: { text: 'love', lang: 'en' } }, { time: 2000, text: 'x' }] }
  assert.deepEqual(parseKpoe(kpoe), [{ time: 1, text: '사랑', translation: 'love', translationLang: 'en' }, { time: 2, text: 'x' }])
})

test('parseTtml y parseKpoe: romanizado por línea', () => {
  const ttml = '<tt><head><transliterations><transliteration xml:lang="ja-Latn"><text for="L2">otsukare summer</text><text for="L1">Hello</text></transliteration></transliterations></head><body>'
    + '<p begin="1" itunes:key="L1">Hello</p><p begin="2" itunes:key="L2">おつかれsummer</p><p begin="3">sin clave</p></body></tt>'
  assert.deepEqual(parseTtml(ttml), [
    { time: 1, text: 'Hello' },
    { time: 2, text: 'おつかれsummer', romanized: 'otsukare summer' },
    { time: 3, text: 'sin clave' },
  ])
  const kpoe = { lyrics: [{ time: 1000, text: '사랑', transliteration: { text: 'sarang' } }, { time: 2000, text: 'love', transliteration: { text: 'love' } }] }
  assert.deepEqual(parseKpoe(kpoe), [{ time: 1, text: '사랑', romanized: 'sarang' }, { time: 2, text: 'love' }])
})

test('parseKpoe y parseAny', () => {
  const kpoe = { type: 'Word', lyrics: [{ time: 2500, duration: 900, text: '', syllabus: [{ text: 'Ho' }, { text: 'la' }] }, { time: 1000, text: 'Uno' }] }
  assert.deepEqual(parseKpoe(kpoe), [{ time: 1, text: 'Uno' }, { time: 2.5, text: 'Hola' }])
  assert.deepEqual(parseAny(JSON.stringify(kpoe)).map((l) => l.text), ['Uno', 'Hola'])
  assert.equal(parseAny('[00:01.00]A\n[00:02.00]B').length, 2)
  assert.equal(parseAny('<tt><body><p begin="1">A</p></body></tt>')[0].text, 'A')
})

test('toResult: sincronizada, plana o texto plano', () => {
  assert.equal(toResult([{ time: 1, text: 'a' }, { time: 2, text: 'b' }]).synced, true)
  assert.equal(isFlat([{ time: 0, text: 'a' }, { time: 0, text: 'b' }]), true)
  const flat = toResult([{ time: 0, text: 'a' }, { time: 0, text: 'b' }])
  assert.deepEqual(flat, { synced: false, lines: [], plain: 'a\nb' })
  assert.deepEqual(toResult([], 'Solo texto\r\nlínea 2'), { synced: false, lines: [], plain: 'Solo texto\nlínea 2' })
  assert.equal(toResult([], ''), null)
})
