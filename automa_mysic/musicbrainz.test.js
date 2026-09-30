const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildMetadataFromMusicBrainz,
  chooseAcoustIdResult,
  fetchRecordingReleases,
  formatArtistCredit,
  parseFpcalcOutput,
  resolveMusicBrainzEntry,
  selectBestRelease,
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

test('keeps only the first MusicBrainz artist credit', () => {
  assert.equal(formatArtistCredit([
    { name: 'Artist A', joinphrase: ' feat. ' },
    { name: 'Artist B', joinphrase: ' & ' },
    { name: 'Artist C' },
  ]), 'Artist A')
})

test('selects the official original release instead of a compilation or promotion', () => {
  const recording = {
    id: 'recording-id',
    releases: [
      {
        id: 'compilation', title: 'Greatest Hits', date: '2020-01-01', status: 'Official',
        'release-group': { 'primary-type': 'Album', 'secondary-types': ['Compilation'] },
      },
      {
        id: 'promotion', title: 'Song', date: '2018-01-01', status: 'Promotion',
        'release-group': { 'primary-type': 'Single' },
      },
      {
        id: 'original', title: 'Song', date: '2019-03-01', status: 'Official',
        'release-group': { 'primary-type': 'Single' },
      },
    ],
  }

  assert.equal(selectBestRelease(recording).id, 'original')
  assert.equal(selectBestRelease(recording, { album: 'Greatest Hits' }).id, 'compilation')
})

test('uses duration and track position to disambiguate editions', () => {
  const recording = {
    id: 'recording-id',
    releases: [
      {
        id: 'wrong-edition', title: 'Album', date: '2019', status: 'Official',
        'release-group': { 'primary-type': 'Album' },
        media: [{ tracks: [{ position: 8, length: 245000, recording: { id: 'recording-id' } }] }],
      },
      {
        id: 'matching-edition', title: 'Album', date: '2021', status: 'Official',
        'release-group': { 'primary-type': 'Album' },
        media: [{ tracks: [{ position: 3, length: 180500, recording: { id: 'recording-id' } }] }],
      },
    ],
  }

  assert.equal(selectBestRelease(recording, { duration: 180, trackNumber: 3 }).id, 'matching-edition')
})

test('reads every MusicBrainz release page for a recording', async () => {
  const offsets = []
  const releases = await fetchRecordingReleases('recording-id', async (url) => {
    const offset = Number(new URL(url).searchParams.get('offset'))
    offsets.push(offset)
    return offset === 0
      ? { 'release-count': 3, releases: [{ id: 'one' }, { id: 'two' }] }
      : { 'release-count': 3, releases: [{ id: 'three' }] }
  }, async () => {}, {})

  assert.deepEqual(offsets, [0, 2])
  assert.deepEqual(releases.map((release) => release.id), ['one', 'two', 'three'])
})

test('rejects MusicBrainz metadata without a year', () => {
  assert.throws(() => buildMetadataFromMusicBrainz({
    id: 'recording-id',
    title: 'Song',
    'artist-credit': [{ name: 'Artist' }],
    releases: [{ title: 'Song', 'release-group': { 'primary-type': 'Single' } }],
  }), /año/)
})

test('rejects a release whose type is not album, EP, or single', () => {
  assert.throws(() => buildMetadataFromMusicBrainz({
    id: 'recording-id',
    title: 'Song',
    'artist-credit': [{ name: 'Artist' }],
    releases: [{ title: 'Radio broadcast', date: '2022', 'release-group': { 'primary-type': 'Broadcast' } }],
  }), /álbum\/single/)
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
      if (url.includes('/recording/')) return {
        id: 'recording-id',
        title: 'Show',
        'artist-credit': [{ name: 'Ado', artist: { name: 'Ado' } }],
      }
      return { 'release-count': 1, releases: [{ title: 'Show', date: '2023-09-06', status: 'Official', 'release-group': { 'primary-type': 'Single' }, media: [{ tracks: [{ recording: { id: 'recording-id' }, position: 1, length: 180000 }] }] }] }
    },
    wait: async () => {},
  })

  assert.equal(entry.artist, 'Ado')
  assert.equal(entry.confidence, 0.98)
  assert.equal(entry.cloudinaryFolder, 'Artistas/Ado/Singles/Show')
  assert.equal(requests.length, 3)
})
