const assert = require('node:assert/strict')
const test = require('node:test')

const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const { completePicardMetadata, identifyManyWithPicard, mapPicardMetadata } = require('./picard')

test('maps mandatory Picard tags into importer metadata', () => {
  const result = mapPicardMetadata({
    common: {
      artist: 'Artist A feat. Artist B',
      title: 'Song',
      album: 'Original Single',
      year: 2024,
      track: { no: 1 },
      genre: ['Pop'],
      musicbrainz_recordingid: 'recording-id',
      musicbrainz_albumid: 'release-id',
    },
    native: {
      'ID3v2.4': [{ id: 'TXXX:MusicBrainz Album Type', value: 'single' }],
    },
  })

  assert.deepEqual(result, {
    artist: 'Artist A',
    title: 'Song',
    releaseName: 'Original Single',
    year: 2024,
    genres: ['Pop'],
    trackNumber: 1,
    kind: 'single',
    musicbrainzRecordingId: 'recording-id',
    musicbrainzReleaseId: 'release-id',
    confidence: null,
    metadataSource: 'picard',
  })
})

test('does not invent album or single when Picard omits the release type', () => {
  const result = mapPicardMetadata({ common: { title: 'Song', album: 'Release' }, native: {} })
  assert.equal(result.kind, null)
})

test('keeps no more than two Picard genres', () => {
  const result = mapPicardMetadata({
    common: { title: 'Song', album: 'Release', genre: ['J-Pop', 'Rock', 'Pop'] },
    native: {},
  })
  assert.deepEqual(result.genres, ['J-Pop', 'Rock'])
})

test('completes a missing release type from the exact release selected by Picard', async () => {
  const metadata = await completePicardMetadata({
    artist: 'Artist',
    title: 'Song',
    releaseName: 'Release',
    year: null,
    kind: null,
    musicbrainzReleaseId: 'release-id',
  }, {
    fetchJson: async (url) => {
      assert.match(url, /release\/release-id/)
      return { title: 'Release', date: '1971-04-02', 'release-group': { 'primary-type': 'Album' }, media: [{ 'track-count': 10 }] }
    },
  })

  assert.equal(metadata.kind, 'album')
  assert.equal(metadata.year, 1971)
})

test('classifies a multi-track Other release as an album', async () => {
  const metadata = await completePicardMetadata({
    releaseName: 'Library Release', year: 2002, kind: null, musicbrainzReleaseId: 'release-id',
  }, {
    fetchJson: async () => ({
      date: '2002',
      'release-group': { 'primary-type': 'Other' },
      media: [{ 'track-count': 32 }],
    }),
  })
  assert.equal(metadata.kind, 'album')
})

test('adds the official romanized work alias to a Japanese track title', async () => {
  const metadata = await completePicardMetadata({
    title: 'おどるポンポコリン',
    releaseName: 'おどるポンポコリン',
    year: 2025,
    kind: 'single',
    musicbrainzRecordingId: 'recording-id',
    musicbrainzReleaseId: 'release-id',
  }, {
    fetchJson: async (url) => {
      if (url.includes('/release/')) {
        return {
          title: 'おどるポンポコリン',
          aliases: [{ name: 'Odoru Ponpokorin', locale: 'en', primary: true }],
          'release-group': { 'primary-type': 'Single' },
          media: [{ 'track-count': 1 }],
        }
      }
      if (url.includes('/recording/')) {
        return { relations: [{ work: { id: 'work-id' } }], aliases: [] }
      }
      return { aliases: [{ name: 'Odoru Ponpokorin', type: 'Search hint' }] }
    },
  })

  assert.equal(metadata.title, 'おどるポンポコリン (Odoru Ponpokorin)')
  assert.equal(metadata.releaseName, 'おどるポンポコリン (Odoru Ponpokorin)')
})

test('identifies multiple files in one Picard process', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'picard-batch-test-'))
  const picardPath = path.join(root, 'picard.exe')
  const first = path.join(root, 'first.mp3')
  const second = path.join(root, 'second.mp3')
  await Promise.all([
    fs.writeFile(picardPath, ''),
    fs.writeFile(first, 'one'),
    fs.writeFile(second, 'two'),
  ])
  let executions = 0

  try {
    const results = await identifyManyWithPicard([first, second], {
      picardPath,
      runPicard: async (_command, args) => {
        executions += 1
        assert.equal(args.filter((value) => value === 'LOAD').length, 2)
      },
      parseFile: async (filePath) => ({
        common: {
          artist: 'Main feat. Guest',
          title: path.basename(filePath),
          album: 'Album',
          year: 2024,
          track: { no: Number(path.basename(filePath, '.mp3')) },
          releasetype: 'album',
        },
        native: {},
      }),
    })

    assert.equal(executions, 1)
    assert.equal(results.length, 2)
    assert.equal(results[0].metadata.artist, 'Main')
    assert.equal(results[1].metadata.trackNumber, 2)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
