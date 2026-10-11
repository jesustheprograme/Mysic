const assert = require('node:assert/strict')
const test = require('node:test')
const { buildPublicObjectUrl, validateObjectKey } = require('./object-storage')

test('construye una URL CDN codificando cada segmento', () => {
  assert.equal(
    buildPublicObjectUrl('https://audio.example.com/', 'audio/song 1/canción.mp3'),
    'https://audio.example.com/audio/song%201/canci%C3%B3n.mp3',
  )
})

test('rechaza claves vacías o con navegación de directorios', () => {
  assert.throws(() => validateObjectKey(''), /no es válida/)
  assert.throws(() => validateObjectKey('../secret.mp3'), /no es válida/)
  assert.throws(() => validateObjectKey('audio\\secret.mp3'), /no es válida/)
})
