import assert from 'node:assert/strict'
import test from 'node:test'
import { groupTracksByDisc, normalizeTrack, sortTracks } from './tracks.js'

test('normaliza aliases de disco y pista', () => {
  const track = normalizeTrack({ id: 'a', discNo: 2, trackNo: 7 })
  assert.equal(track.discNumber, 2)
  assert.equal(track.trackNumber, 7)
})

test('ordena numéricamente por disco y pista', () => {
  const tracks = sortTracks([
    { id: '20', discNo: 2, trackNo: 20 },
    { id: '09', discNo: 1, trackNo: 9 },
    { id: '01', discNo: 2, trackNo: 1 },
    { id: '10', discNo: 1, trackNo: 10 },
  ])

  assert.deepEqual(tracks.map((track) => track.id), ['09', '10', '01', '20'])
})

test('agrupa las pistas por disco en orden', () => {
  const groups = groupTracksByDisc([
    { id: 'b', discNo: 2, trackNo: 1 },
    { id: 'a', discNo: 1, trackNo: 14 },
  ])

  assert.deepEqual(groups.map((group) => group.discNumber), [1, 2])
})

test('un recopilatorio de cuarenta pistas conserva una sola lista numerada', () => {
  const tracks = Array.from({ length: 40 }, (_, index) => ({
    id: String(40 - index),
    discNo: 1,
    trackNo: 40 - index,
  }))
  const groups = groupTracksByDisc(tracks)

  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].tracks.map((track) => track.trackNumber),
    Array.from({ length: 40 }, (_, index) => index + 1))
})
