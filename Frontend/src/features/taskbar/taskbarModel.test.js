import assert from 'node:assert/strict'
import test from 'node:test'
import { runTaskbarControl, taskbarState } from './taskbarModel.js'

test('taskbarState: sin canción todo queda desactivado aunque lleguen otros valores', () => {
  assert.deepEqual(taskbarState(), { hasTrack: false, playing: false, liked: false, canLike: false })
  assert.deepEqual(taskbarState({ hasTrack: false, isPlaying: true, liked: true }), { hasTrack: false, playing: false, liked: false, canLike: false })
})

test('taskbarState: refleja reproducción, me gusta y si la canción admite me gusta', () => {
  assert.deepEqual(taskbarState({ hasTrack: true, isPlaying: true, liked: true }), { hasTrack: true, playing: true, liked: true, canLike: true })
  assert.deepEqual(taskbarState({ canLike: false, hasTrack: true }), { hasTrack: true, playing: false, liked: false, canLike: false })
})

test('runTaskbarControl: cada botón llama a su acción y "like" alterna el estado actual', () => {
  const calls = []
  const handlers = {
    onNext: () => calls.push('next'),
    onPrevious: () => calls.push('previous'),
    onToggleLike: (next) => calls.push(`like:${next}`),
    onTogglePlayback: () => calls.push('toggle'),
  }
  assert.equal(runTaskbarControl('previous', handlers), true)
  assert.equal(runTaskbarControl('toggle', handlers), true)
  assert.equal(runTaskbarControl('next', handlers), true)
  assert.equal(runTaskbarControl('like', { ...handlers, liked: false }), true)
  assert.equal(runTaskbarControl('like', { ...handlers, liked: true }), true)
  assert.deepEqual(calls, ['previous', 'toggle', 'next', 'like:true', 'like:false'])
})

test('runTaskbarControl: ignora controles desconocidos o sin manejador', () => {
  assert.equal(runTaskbarControl('constructor', {}), false)
  assert.equal(runTaskbarControl('stop', { onNext() {} }), false)
  assert.equal(runTaskbarControl('like', {}), false)
  assert.equal(runTaskbarControl('next', {}), false)
})
