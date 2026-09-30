const assert = require('node:assert/strict')
const test = require('node:test')

const { identifyFromSource, mapSourceMetadata, sourceId } = require('./source-metadata')

test('maps album metadata and keeps only the first artist', () => {
  assert.deepEqual(mapSourceMetadata({
    title: "Motif d'Azur",
    track: "Motif d'Azur",
    artist: 'Slowdown, Constantin Gillies',
    album: 'Retrospectives',
    release_date: '20090526',
  }, "01 - Motif d'Azur [YnpUknPcQ38].mp3"), {
    artist: 'Slowdown',
    title: "Motif d'Azur",
    releaseName: 'Retrospectives',
    year: 2009,
    genres: [],
    trackNumber: 1,
    kind: 'album',
    musicbrainzRecordingId: null,
    musicbrainzReleaseId: null,
    confidence: null,
    metadataSource: 'source',
  })
})

test('queries the exact source id without downloading audio', async () => {
  const calls = []
  const metadata = await identifyFromSource('10 - Song [E48heS03QYs].mp3', {
    ytDlpPath: 'yt-dlp.exe',
    run: async (command, args) => {
      calls.push({ command, args })
      return { stdout: JSON.stringify({ artist: 'Main feat. Guest', track: 'Song', album: 'Album', release_year: 2024 }) }
    },
  })

  assert.equal(sourceId('10 - Song [E48heS03QYs].mp3'), 'E48heS03QYs')
  assert.equal(metadata.artist, 'Main')
  assert.equal(metadata.trackNumber, 10)
  assert.deepEqual(calls[0].args.slice(0, 3), ['--no-config', '--no-playlist', '--dump-single-json'])
})
