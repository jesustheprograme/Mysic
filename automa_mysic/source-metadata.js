const { execFile } = require('node:child_process')
const path = require('node:path')
const { promisify } = require('node:util')

const { primaryArtist } = require('./artist')

const execFileAsync = promisify(execFile)

function sourceId(fileName) {
  return String(fileName || '').match(/\[([\w-]{6,})\]\.mp3$/i)?.[1] || null
}

function trackNumberFromFile(fileName) {
  const value = Number(String(fileName || '').match(/^(\d+)\s+-\s+/)?.[1])
  return Number.isInteger(value) && value > 0 ? value : null
}

function mapSourceMetadata(payload, fileName) {
  const artists = Array.isArray(payload.artists) ? payload.artists.filter(Boolean) : []
  const creditedArtist = artists[0] || payload.artist || String(payload.channel || payload.uploader || '').replace(/\s+-\s+Topic$/i, '')
  const releaseDate = String(payload.release_date || '')
  const year = Number(payload.release_year || releaseDate.slice(0, 4)) || null
  const title = String(payload.track || payload.title || '').trim()
  const releaseName = String(payload.album || payload.playlist || '').trim()
  const trackNumber = Number(payload.track_number || payload.playlist_index) || trackNumberFromFile(fileName)

  const metadata = {
    artist: primaryArtist(creditedArtist),
    title,
    releaseName,
    year,
    genres: [],
    trackNumber,
    kind: releaseName ? 'album' : 'single',
    musicbrainzRecordingId: null,
    musicbrainzReleaseId: null,
    confidence: null,
    metadataSource: 'source',
  }

  const missing = []
  if (!metadata.artist) missing.push('artista')
  if (!metadata.title) missing.push('título')
  if (!metadata.releaseName) missing.push('álbum')
  if (!metadata.year) missing.push('año')
  if (!metadata.trackNumber) missing.push('pista')
  if (missing.length) throw new Error(`El enlace de origen no devolvió: ${missing.join(', ')}.`)
  return metadata
}

async function identifyFromSource(fileName, options = {}) {
  const id = sourceId(fileName)
  if (!id) throw new Error('El archivo no contiene un identificador de origen.')

  const ytDlpPath = options.ytDlpPath || process.env.YT_DLP_PATH
  if (!ytDlpPath) throw new Error('Configura YT_DLP_PATH para consultar los metadatos del enlace.')

  const run = options.run || execFileAsync
  const { stdout } = await run(ytDlpPath, [
    '--no-config',
    '--no-playlist',
    '--dump-single-json',
    `https://www.youtube.com/watch?v=${id}`,
  ], { timeout: options.timeout || 60000, maxBuffer: 8 * 1024 * 1024 })

  return mapSourceMetadata(JSON.parse(String(stdout)), fileName)
}

module.exports = { identifyFromSource, mapSourceMetadata, sourceId, trackNumberFromFile }
