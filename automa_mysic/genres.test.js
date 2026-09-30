const assert = require('node:assert/strict')
const test = require('node:test')

const { normalizeGenres, selectMusicBrainzGenres } = require('./genres')

test('keeps at most two unique genres', () => {
  assert.deepEqual(normalizeGenres(['J-Pop', 'Rock', 'Pop', 'j-pop']), ['J-Pop', 'Rock'])
})

test('prioritizes the most voted MusicBrainz genres before free-form tags', () => {
  assert.deepEqual(selectMusicBrainzGenres({
    genres: [
      { name: 'Pop', count: 4 },
      { name: 'J-Pop', count: 12 },
      { name: 'Rock', count: 7 },
    ],
    tags: [{ name: 'Anime', count: 100 }],
  }), ['J-Pop', 'Rock'])
})

test('uses MusicBrainz tags only to fill missing genre slots', () => {
  assert.deepEqual(selectMusicBrainzGenres({
    genres: [{ name: 'J-Pop', count: 5 }],
    tags: [{ name: 'Pop', count: 9 }, { name: 'Japanese', count: 3 }],
  }), ['J-Pop', 'Pop'])
})
