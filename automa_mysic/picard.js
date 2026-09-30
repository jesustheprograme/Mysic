const { execFile } = require('node:child_process')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { promisify } = require('node:util')
const {
  containsJapanese,
  formatJapaneseReleaseTitle,
  formatJapaneseTrackTitle,
} = require('./release-title')
const { normalizeGenres } = require('./genres')
const { primaryArtist } = require('./artist')

const execFileAsync = promisify(execFile)
const releaseCache = new Map()
let lastMusicBrainzRequest = 0

function cleanPath(value) {
  return String(value || '').trim().replace(/^"|"$/g, '')
}

function nativeValue(metadata, names) {
  const wanted = new Set(names.map((name) => name.toLocaleLowerCase('en')))
  for (const tags of Object.values(metadata.native || {})) {
    for (const tag of tags || []) {
      const id = String(tag.id || '').toLocaleLowerCase('en')
      if (!wanted.has(id)) continue
      return Array.isArray(tag.value) ? tag.value[0] : tag.value
    }
  }
  return null
}

function mapPicardMetadata(metadata) {
  const common = metadata.common || {}
  const releaseType = common.releasetype
    || nativeValue(metadata, ['TXXX:MusicBrainz Album Type', '----:com.apple.iTunes:MusicBrainz Album Type'])
  const normalizedType = String(Array.isArray(releaseType) ? releaseType[0] : releaseType || '').toLowerCase()
  const kind = normalizedType.includes('single')
    ? 'single'
    : normalizedType.includes('album') || normalizedType.includes('ep')
      ? 'album'
      : null
  const artists = Array.isArray(common.artists) ? common.artists.filter(Boolean) : []

  return {
    artist: primaryArtist(artists[0] || common.artist || common.albumartist),
    title: common.title || '',
    releaseName: common.album || '',
    year: Number(common.year || common.originalyear) || null,
    genres: normalizeGenres(Array.isArray(common.genre) ? common.genre : (common.genre ? [common.genre] : [])),
    trackNumber: Number(common.track?.no) || null,
    kind,
    musicbrainzRecordingId: common.musicbrainz_recordingid
      || nativeValue(metadata, ['TXXX:MusicBrainz Track Id', 'UFID:http://musicbrainz.org']),
    musicbrainzReleaseId: common.musicbrainz_albumid
      || nativeValue(metadata, ['TXXX:MusicBrainz Album Id']),
    confidence: null,
    metadataSource: 'picard',
  }
}

function musicBrainzKind(primaryType) {
  const normalized = String(primaryType || '').toLowerCase()
  if (normalized === 'single') return 'single'
  if (normalized === 'album' || normalized === 'ep') return 'album'
  return null
}

async function completePicardMetadata(metadata, options = {}) {
  if (metadata.musicbrainzReleaseId) {
    const url = `https://musicbrainz.org/ws/2/release/${encodeURIComponent(metadata.musicbrainzReleaseId)}?fmt=json&inc=aliases+release-groups+media`
    const fetcher = options.fetchJson || (async (requestUrl) => {
      const delay = Math.max(0, 1000 - (Date.now() - lastMusicBrainzRequest))
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
      lastMusicBrainzRequest = Date.now()
      const response = await fetch(requestUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': process.env.MUSICBRAINZ_USER_AGENT || 'AutomaMysic/1.0 (local music importer)',
        },
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok) throw new Error(`MusicBrainz respondió HTTP ${response.status}.`)
      return response.json()
    })
    let release
    if (options.fetchJson) {
      release = await fetcher(url)
    } else {
      if (!releaseCache.has(metadata.musicbrainzReleaseId)) {
        releaseCache.set(metadata.musicbrainzReleaseId, fetcher(url).catch((error) => {
          releaseCache.delete(metadata.musicbrainzReleaseId)
          throw error
        }))
      }
      release = await releaseCache.get(metadata.musicbrainzReleaseId)
    }
    const primaryKind = musicBrainzKind(release['release-group']?.['primary-type'])
    const trackCount = (release.media || []).reduce((total, medium) => total + (Number(medium['track-count']) || 0), 0)
    const structuralKind = trackCount === 1 ? 'single' : trackCount > 1 ? 'album' : null
    let recording = null
    let works = []
    if (containsJapanese(metadata.title) && metadata.musicbrainzRecordingId) {
      recording = await fetcher(
        `https://musicbrainz.org/ws/2/recording/${encodeURIComponent(metadata.musicbrainzRecordingId)}?fmt=json&inc=aliases+work-rels`,
      )
      const workIds = [...new Set((recording.relations || [])
        .map((relation) => relation.work?.id)
        .filter(Boolean))]
      for (const workId of workIds) {
        works.push(await fetcher(
          `https://musicbrainz.org/ws/2/work/${encodeURIComponent(workId)}?fmt=json&inc=aliases`,
        ))
      }
    }
    return {
      ...metadata,
      title: formatJapaneseTrackTitle(metadata.title, { recording, works, release }),
      releaseName: formatJapaneseReleaseTitle(metadata.releaseName || release.title || '', release),
      year: metadata.year || Number(String(release.date || '').slice(0, 4)) || null,
      kind: metadata.kind || primaryKind || structuralKind,
    }
  }
  return metadata
}

async function findTaggedMp3(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = await findTaggedMp3(candidate)
      if (nested) return nested
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.mp3') {
      return candidate
    }
  }
  return null
}

function validatePicardMetadata(metadata) {
  const missing = []
  if (!metadata.releaseName || !metadata.kind) missing.push('álbum/single')
  if (!metadata.artist) missing.push('autor(es)')
  if (!metadata.title) missing.push('nombre de la canción')
  if (!metadata.year) missing.push('año')
  if (!metadata.trackNumber) missing.push('pista')
  if (missing.length) throw new Error(`Picard no identificó los metadatos obligatorios: ${missing.join(', ')}.`)
}

async function identifyManyWithPicard(filePaths, options = {}) {
  if (!Array.isArray(filePaths) || !filePaths.length) return []

  const picardPath = cleanPath(options.picardPath || process.env.PICARD_PATH)
  const stats = picardPath ? await fs.stat(picardPath).catch(() => null) : null
  if (!stats?.isFile()) throw new Error('Configura PICARD_PATH con la ruta válida de picard.exe.')

  for (const filePath of filePaths) {
    const sourceStats = await fs.stat(filePath).catch(() => null)
    if (!sourceStats?.isFile()) throw new Error(`No existe el MP3: ${path.basename(filePath)}`)
  }

  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'automa-picard-'))
  const commandsPath = path.join(temporaryRoot, 'commands.txt')
  const logPath = path.join(temporaryRoot, 'picard.log')
  const copies = []

  try {
    for (let index = 0; index < filePaths.length; index += 1) {
      const temporaryMp3 = path.join(temporaryRoot, `${String(index + 1).padStart(4, '0')}.mp3`)
      await fs.copyFile(filePaths[index], temporaryMp3)
      copies.push({ sourcePath: filePaths[index], temporaryMp3 })
    }

    await fs.writeFile(commandsPath, [
      'CLUSTER',
      'LOOKUP clustered',
      'PAUSE 10',
      'SCAN',
      `PAUSE ${Math.max(20, Math.min(90, filePaths.length * 5))}`,
      'SAVE_MATCHED',
      'PAUSE 2',
      `WRITE_LOGS "${logPath}"`,
      'QUIT force',
    ].join('\n'), 'utf8')

    const args = [
      '--stand-alone-instance',
      '--no-restore',
    ]
    for (const copy of copies) args.push('-e', 'LOAD', copy.temporaryMp3)
    args.push('-e', 'FROM_FILE', commandsPath)

    await (options.runPicard || execFileAsync)(picardPath, args, {
      timeout: options.timeout || 240000,
      maxBuffer: 4 * 1024 * 1024,
    })

    const parseFile = options.parseFile || require('music-metadata').parseFile
    const results = []
    for (const copy of copies) {
      try {
        const metadata = await completePicardMetadata(
          mapPicardMetadata(await parseFile(copy.temporaryMp3, { skipCovers: true })),
          options,
        )
        if (!options.allowIncomplete) validatePicardMetadata(metadata)
        results.push({ filePath: copy.sourcePath, metadata })
      } catch (error) {
        results.push({ filePath: copy.sourcePath, error })
      }
    }
    return results
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true })
  }
}

async function identifyWithPicard(filePath, options = {}) {
  const [result] = await identifyManyWithPicard([filePath], options)
  if (result.error) throw result.error
  return result.metadata
}

module.exports = {
  completePicardMetadata,
  identifyManyWithPicard,
  identifyWithPicard,
  mapPicardMetadata,
  validatePicardMetadata,
}
