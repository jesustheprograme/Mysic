const assert = require('node:assert/strict')
const test = require('node:test')

const { formatJapaneseReleaseTitle, formatJapaneseTrackTitle } = require('./release-title')

test('formats a Japanese release with its official Latin alias', () => {
  assert.equal(formatJapaneseReleaseTitle('おどるポンポコリン', {
    'release-group': {
      aliases: [{ name: 'Odoru Ponpokorin', locale: 'en', primary: true }],
    },
  }), 'おどるポンポコリン (Odoru Ponpokorin)')
})

test('does not duplicate an existing romanized title', () => {
  assert.equal(
    formatJapaneseReleaseTitle('Adoのベストアドバム (Ado no Besuto Adobamu)', {
      'release-group': { aliases: [{ name: 'Ado no Besuto Adobamu', locale: 'en', primary: true }] },
    }),
    'Adoのベストアドバム (Ado no Besuto Adobamu)',
  )
})

test('keeps the original when MusicBrainz has no Latin alias', () => {
  assert.equal(formatJapaneseReleaseTitle('日本語', { aliases: [] }), '日本語')
})

test('formats a Japanese track with its MusicBrainz work alias', () => {
  assert.equal(formatJapaneseTrackTitle('おどるポンポコリン', {
    recording: { aliases: [] },
    works: [{ aliases: [{ name: 'Odoru Ponpokorin', type: 'Search hint' }] }],
  }), 'おどるポンポコリン (Odoru Ponpokorin)')
})

test('uses the release alias only when the single and track have the same title', () => {
  const release = { title: 'おどるポンポコリン', aliases: [{ name: 'Odoru Ponpokorin', locale: 'en' }] }
  assert.equal(
    formatJapaneseTrackTitle('おどるポンポコリン', { release }),
    'おどるポンポコリン (Odoru Ponpokorin)',
  )
  assert.equal(formatJapaneseTrackTitle('別の歌', { release }), '別の歌')
})
