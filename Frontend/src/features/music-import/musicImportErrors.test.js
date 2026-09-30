import assert from 'node:assert/strict'
import test from 'node:test'

import { formatMusicImportError, parseMusicImportResponse } from './musicImportErrors.js'

test('shows a Tauri string rejection instead of the generic fallback', () => {
  assert.equal(
    formatMusicImportError('La carpeta de Cloudinary no contiene una imagen válida.', 'Error al importar.'),
    'La carpeta de Cloudinary no contiene una imagen válida.',
  )
})

test('extracts per-file reasons from a failed import summary', () => {
  const error = JSON.stringify({
    failed: 1,
    results: [{ file: 'Kitto Coaster.mp3', status: 'failed', reason: 'Falta la portada.' }],
  })

  assert.equal(formatMusicImportError(error, 'Error al importar.'), 'Kitto Coaster.mp3: Falta la portada.')
})

test('extracts JSON errors emitted by the CLI', () => {
  assert.equal(
    formatMusicImportError('{"error":"Configura MUSIC_SSH_HOST."}', 'Error al importar.'),
    'Configura MUSIC_SSH_HOST.',
  )
})

test('uses the fallback when the rejection is empty', () => {
  assert.equal(formatMusicImportError(null, 'Error al importar.'), 'Error al importar.')
})

test('explains when the n8n production webhook is not published', () => {
  assert.match(
    formatMusicImportError('The requested webhook "POST mysic/acquisition" is not registered.', 'Error.'),
    /no está publicada/,
  )
})

test('reads the final JSON object even when a command printed diagnostic logs first', () => {
  const raw = `Biblioteca: C:\\Música
MP3 válidos: 1
{
  "processed": 1,
  "results": [{ "file": "song.mp3", "status": "processed" }]
}`

  assert.equal(parseMusicImportResponse(raw).processed, 1)
})

test('reports an explicit error for a response without JSON', () => {
  assert.throws(
    () => parseMusicImportResponse('Biblioteca: salida incompleta'),
    /respuesta ilegible/,
  )
})
