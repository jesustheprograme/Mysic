import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RELEASE_AUDIO_MS,
  RELEASE_CLOSED_MS,
  RELEASE_PAUSED_MS,
  clampSeek,
  engineReleaseDelay,
  isCurrentStreamSource,
  isSupersededPlay,
  resumePosition,
  shouldCreateEngine,
  shouldUseDirectAudio,
} from './playerEngine.js'

test('una canción restaurada en pausa no crea el iframe hasta que hay intención de reproducir', () => {
  assert.equal(shouldCreateEngine({ videoId: 'abc', usesAudio: false, armed: false }), false)
  assert.equal(shouldCreateEngine({ videoId: 'abc', usesAudio: false, armed: true }), true)
})

test('sin canción o sonando por <audio> nunca se crea el iframe', () => {
  assert.equal(shouldCreateEngine({ videoId: undefined, usesAudio: false, armed: true }), false)
  assert.equal(shouldCreateEngine({ videoId: 'abc', usesAudio: true, armed: true }), false)
})

test('el audio directo es la ruta principal y el iframe queda como respaldo', () => {
  assert.equal(shouldUseDirectAudio({ videoId: 'abc', isLocal: false, streamFailed: false }), true)
  assert.equal(shouldUseDirectAudio({ videoId: 'abc', isLocal: false, streamFailed: true }), false)
  assert.equal(shouldUseDirectAudio({ videoId: 'abc', isLocal: true, streamFailed: false }), false)
  assert.equal(shouldUseDirectAudio({ videoId: undefined, isLocal: false, streamFailed: false }), false)
})

test('el iframe en uso no se libera; pausar solo lo libera tras una espera larga', () => {
  assert.equal(engineReleaseDelay({ hasSong: true, usesAudio: false, isPlaying: true, isBuffering: false }), null)
  assert.equal(engineReleaseDelay({ hasSong: true, usesAudio: false, isPlaying: false, isBuffering: true }), null)
  assert.equal(engineReleaseDelay({ hasSong: true, usesAudio: false, isPlaying: false, isBuffering: false }), RELEASE_PAUSED_MS)
  assert.ok(RELEASE_PAUSED_MS >= 5 * 60_000)
})

test('sin canción o con audio propio el iframe sobra y se libera antes', () => {
  assert.equal(engineReleaseDelay({ hasSong: false, usesAudio: false, isPlaying: false, isBuffering: false }), RELEASE_CLOSED_MS)
  // Aunque el <audio> esté sonando, el iframe no se usa.
  assert.equal(engineReleaseDelay({ hasSong: true, usesAudio: true, isPlaying: true, isBuffering: false }), RELEASE_AUDIO_MS)
  assert.ok(RELEASE_CLOSED_MS < RELEASE_AUDIO_MS)
})

test('resumePosition conserva la posición y reinicia una canción terminada', () => {
  assert.equal(resumePosition(42.5, 200), 42.5)
  assert.equal(resumePosition(199.6, 200), 0)
  assert.equal(resumePosition(200, 200), 0)
  assert.equal(resumePosition(42, 0), 42)
  for (const value of [0, -3, NaN, undefined, null, 'x']) assert.equal(resumePosition(value, 200), 0)
})

test('clampSeek acota a la duración conocida y nunca baja de cero', () => {
  assert.equal(clampSeek(30, 200), 30)
  assert.equal(clampSeek(250, 200), 200)
  assert.equal(clampSeek(-5, 200), 0)
  assert.equal(clampSeek(250, 0), 250)
  assert.equal(clampSeek(undefined, 200), 0)
})

test('isSupersededPlay: el play() abortado por elegir otra canción no es un error', () => {
  assert.equal(isSupersededPlay({ error: { name: 'AbortError' }, playId: 'a', currentId: 'a' }), true)
  assert.equal(isSupersededPlay({ error: { name: 'NotSupportedError' }, playId: 'a', currentId: 'b' }), true)
  assert.equal(isSupersededPlay({ error: { name: 'NotSupportedError' }, playId: 'a', currentId: 'a' }), false)
  assert.equal(isSupersededPlay({ error: undefined, playId: 'a', currentId: 'a' }), false)
})

test('isCurrentStreamSource: solo el stream de la canción actual puede marcarla como fallida', () => {
  assert.equal(isCurrentStreamSource('https://api.test/api/youtube/stream/abc123', 'abc123'), true)
  assert.equal(isCurrentStreamSource('https://api.test/api/youtube/stream/abc123?x=1', 'abc123'), true)
  assert.equal(isCurrentStreamSource('https://api.test/api/youtube/stream/OTRA', 'abc123'), false)
  assert.equal(isCurrentStreamSource('https://api.test/api/youtube/stream/xabc123', 'abc123'), false)
  assert.equal(isCurrentStreamSource('', 'abc123'), false)
  // La fuente directa (resuelta en el equipo) también cuenta como la de esa canción.
  assert.equal(isCurrentStreamSource('http://mysicstream.localhost/abc123', 'abc123'), true)
  assert.equal(isCurrentStreamSource('http://mysicstream.localhost/otra1234567', 'abc123'), false)
  assert.equal(isCurrentStreamSource('https://api.test/api/youtube/stream/abc123', undefined), false)
})