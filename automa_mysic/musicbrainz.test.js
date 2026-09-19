const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildMetadataFromMusicBrainz,
  chooseAcoustIdResult,
  parseFpcalcOutput,
  resolveMusicBrainzEntry,
} = require('./musicbrainz')

test('parses fpcalc JSON output', () => {
  assert.deepEqual(parseFpcalcOutput('{"duration": 182.4, "fingerprint": "abc123"}'), {
    duration: 182.4,
    fingerprint: 'abc123',
  })
})

test('chooses the highest-confidence AcoustID recording', () => {
  const result = chooseAcoustIdResult({ results: [
    { score: 0.71, recordings: [{ id: 'low' }] },
    { score: 0.97, recordings: [{ id: 'best' }] },
  ] }, 0.8)

  assert.equal(result.recordingId, 'best')
  assert.equal(result.score, 0.97)
})

test('maps MusicBrainz recording data into import metadata', () => {
  const entry = buildMetadataFromMusicBrainz({
    id: 'recording-id',
    title: 'Show',
    'artist-credit': [{ name: 'Ado', artist: { name: 'Ado' } }],
    genres: [{ name: 'J-pop' }],
    releases: [{
      title: 'Show',
      date: '2023-09-06',
      'release-group': { 'primary-type': 'Single' },
      media: [{ tracks: [{ recording: { id: 'recording-id' }, position: 1 }] }],
    }],
  })

  assert.deepEqual(entry, {
    artist: 'Ado',
    title: 'Show',
    kind: 'single',
    releaseName: 'Show',
    year: 2023,
    genres: ['J-pop'],
    trackNumber: 1,
    musicbrainzRecordingId: 'recording-id',
  })
})

test('resolves an entry from injected fingerprint and MusicBrainz responses', async () => {
  const requests = []
  const entry = await resolveMusicBrainzEntry({ file: 'show.mp3', cloudinaryFolder: 'Artistas/Ado/Singles/Show' }, {
    fpcalcPath: 'fpcalc.exe',
    acoustIdApiKey: 'free-key',
    runFpcalc: async () => ({ duration: 180, fingerprint: 'fingerprint' }),
    fetchJson: async (url) => {
      requests.push(url)
      if (url.includes('acoustid.org')) return { results: [{ score: 0.98, recordings: [{ id: 'recording-id' }] }] }
      return {
        id: 'recording-id',
        title: 'Show',
        'artist-credit': [{ name: 'Ado', artist: { name: 'Ado' } }],
        releases: [{ title: 'Show', date: '2023-09-06', 'release-group': { 'primary-type': 'Single' }, media: [{ tracks: [{ recording: { id: 'recording-id' }, position: 1 }] }] }],
      }
    },
    wait: async () => {},
  })

  assert.equal(entry.artist, 'Ado')
  assert.equal(entry.cloudinaryFolder, 'Artistas/Ado/Singles/Show')
  assert.equal(requests.length, 2)
})
