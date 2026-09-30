const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const releaseDates = require('../catalog/release-dates.json')

require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
  quiet: true,
})

const MP3_EXTENSION = '.mp3'

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function stableSlug(label, relativePath) {
  const readable = slugify(label) || 'item'
  const hash = crypto.createHash('sha1').update(relativePath).digest('hex').slice(0, 8)
  return `${readable}-${hash}`
}

function parseTrackFileName(fileName) {
  const titleWithTrack = path.basename(fileName, path.extname(fileName)).trim()
  const match = titleWithTrack.match(/^\s*(\d{1,2})(?:\s*-\s*(\d{1,3}))?\s*(?:[-_.]\s*|\s+)\s*(.+)$/)

  if (!match) {
    return {
      cleanTitle: titleWithTrack,
      discNumber: 1,
      title: titleWithTrack,
      trackNumber: null,
      requestedDiscNo: 1,
      requestedTrackNo: null,
    }
  }

  const discNumber = match[2] ? Number(match[1]) : 1
  const trackNumber = match[2] ? Number(match[2]) : Number(match[1])
  const cleanTitle = match[3].trim()

  return {
    cleanTitle,
    discNumber,
    title: cleanTitle,
    trackNumber,
    requestedDiscNo: discNumber,
    requestedTrackNo: trackNumber,
  }
}

async function collectMp3Files(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(directory, entry.name)

    if (entry.isDirectory()) return collectMp3Files(absolutePath)
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === MP3_EXTENSION) return [absolutePath]
    return []
  }))

  return nestedFiles.flat()
}

function createCandidates(rootDirectory, files) {
  const skipped = []
  const candidates = []

  for (const absolutePath of files.sort((a, b) => a.localeCompare(b, 'es'))) {
    const relativePath = path.relative(rootDirectory, absolutePath)
    const parts = relativePath.split(path.sep)
    const artistFolderIndex = parts.findIndex((part) => part.toLocaleLowerCase('es') === 'artistas')
    const isNewStructure = artistFolderIndex >= 0
    const artistIndex = isNewStructure ? artistFolderIndex + 1 : 0
    const categoryIndex = artistIndex + 1
    const albumIndex = categoryIndex + 1

    if (isNewStructure && !parts[artistIndex]) {
      skipped.push({ relativePath, reason: 'Falta la carpeta del artista.' })
      continue
    }

    const category = parts[categoryIndex]?.toLocaleLowerCase('es')
    const hasAlbum = isNewStructure && category === 'albums'
    const hasSingles = isNewStructure && category === 'singles'
    const hasEps = isNewStructure && category === 'eps'
    const hasReleaseFolder = (hasSingles || hasEps) && parts.length > albumIndex + 1
    const validNewStructure = hasAlbum || hasReleaseFolder
      ? parts.length > albumIndex + 1
      : hasSingles || hasEps
        ? parts.length > categoryIndex + 1
        : !isNewStructure

    if (!validNewStructure || (!isNewStructure && parts.length < 3)) {
      skipped.push({ relativePath, reason: 'Usa Artistas/Artista/Albums/Album/cancion.mp3 o Artistas/Artista/Singles/cancion.mp3.' })
      continue
    }

    const artistName = parts[artistIndex].trim()
    const albumTitle = hasAlbum || hasReleaseFolder
      ? parts[albumIndex].trim()
      : hasSingles
        ? 'Singles'
        : hasEps
          ? 'EPs'
          : parts.at(-2).trim()
    const { title, requestedDiscNo, requestedTrackNo } = parseTrackFileName(parts.at(-1))

    if (!artistName || !albumTitle || !title) {
      skipped.push({ relativePath, reason: 'Artista, album o titulo vacio.' })
      continue
    }

    candidates.push({
      absolutePath,
      relativePath,
      artistName,
      albumTitle,
      title,
      requestedDiscNo,
      requestedTrackNo,
    })
  }

  assignTrackNumbers(candidates)
  return { candidates, skipped }
}

function assignTrackNumbers(candidates) {
  const usedByAlbum = new Map()

  for (const candidate of candidates) {
    const albumKey = `${candidate.artistName}\u0000${candidate.albumTitle}`.toLocaleLowerCase('es')
    const used = usedByAlbum.get(albumKey) || new Set()
    const requestedDiscNo = Number.isInteger(candidate.requestedDiscNo) && candidate.requestedDiscNo > 0
      ? candidate.requestedDiscNo
      : 1
    let trackNo = candidate.requestedTrackNo
    let discNo = requestedDiscNo

    if (!Number.isInteger(trackNo) || trackNo < 1 || used.has(`${discNo}:${trackNo}`)) {
      discNo = 1
      trackNo = 1
      while (used.has(`${discNo}:${trackNo}`)) trackNo += 1
    }

    candidate.discNo = discNo
    candidate.trackNo = trackNo
    used.add(`${discNo}:${trackNo}`)
    usedByAlbum.set(albumKey, used)
  }
}

async function importCandidate(prisma, candidate) {
  const artistSlug = stableSlug(candidate.artistName, `artist:${candidate.artistName.toLocaleLowerCase('es')}`)
  const albumSlug = stableSlug(
    `${candidate.artistName}-${candidate.albumTitle}`,
    `album:${candidate.artistName.toLocaleLowerCase('es')}/${candidate.albumTitle.toLocaleLowerCase('es')}`,
  )
  const songSlug = stableSlug(
    `${candidate.artistName}-${candidate.albumTitle}-${candidate.title}`,
    `song:${candidate.relativePath.toLocaleLowerCase('es')}`,
  )
  const mediaUrl = candidate.mediaUrl || pathToFileURL(candidate.absolutePath).href
  const knownReleaseDate = releaseDates[candidate.artistName]?.[candidate.albumTitle]
  const releaseDate = knownReleaseDate ? new Date(knownReleaseDate) : undefined

  return prisma.$transaction(async (database) => {
    const artist = await database.artist.upsert({
      where: { slug: artistSlug },
      update: { name: candidate.artistName },
      create: { name: candidate.artistName, slug: artistSlug },
    })
    const album = await database.album.upsert({
      where: { slug: albumSlug },
      update: { title: candidate.albumTitle, releaseDate },
      create: { title: candidate.albumTitle, slug: albumSlug, releaseDate },
    })
    const [assetWithSong, songBySlug, trackAtPosition] = await Promise.all([
      database.mediaAsset.findFirst({
        where: { type: 'audio', url: mediaUrl },
        include: { song: true },
      }),
      database.song.findUnique({ where: { slug: songSlug } }),
      database.albumTrack.findUnique({
        where: {
          albumId_discNo_trackNo: {
            albumId: album.id,
            discNo: candidate.discNo,
            trackNo: candidate.trackNo,
          },
        },
        include: { song: true },
      }),
    ])
    const existingSong = assetWithSong?.song
      ?? songBySlug
      ?? (trackAtPosition?.isPrimary && trackAtPosition.song.title === candidate.title ? trackAtPosition.song : null)
    const song = existingSong
      ? await database.song.update({
          where: { id: existingSong.id },
          data: { title: candidate.title, durationSec: candidate.durationSec ?? undefined },
        })
      : await database.song.create({
          data: { title: candidate.title, slug: songSlug, durationSec: candidate.durationSec ?? null },
        })

    await database.albumArtist.upsert({
      where: { albumId_artistId: { albumId: album.id, artistId: artist.id } },
      update: {},
      create: { albumId: album.id, artistId: artist.id },
    })
    await database.songArtist.upsert({
      where: { songId_artistId: { songId: song.id, artistId: artist.id } },
      update: {},
      create: { songId: song.id, artistId: artist.id },
    })
    await database.albumTrack.deleteMany({
      where: {
        albumId: album.id,
        discNo: candidate.discNo,
        trackNo: candidate.trackNo,
        songId: { not: song.id },
      },
    })
    await database.albumTrack.upsert({
      where: { albumId_songId: { albumId: album.id, songId: song.id } },
      update: { discNo: candidate.discNo, trackNo: candidate.trackNo, isPrimary: true },
      create: {
        albumId: album.id,
        songId: song.id,
        discNo: candidate.discNo,
        trackNo: candidate.trackNo,
        isPrimary: true,
      },
    })

    const existingAsset = await database.mediaAsset.findFirst({
      where: { songId: song.id, type: 'audio', url: mediaUrl },
    })
    if (!existingAsset) {
      await database.mediaAsset.create({
        data: { songId: song.id, type: 'audio', url: mediaUrl, mimeType: 'audio/mpeg' },
      })
    }

    return { album, song }
  })
}

function printPreview(rootDirectory, candidates, skipped) {
  console.log(`Biblioteca: ${rootDirectory}`)
  console.log(`MP3 validos: ${candidates.length}`)
  console.table(candidates.slice(0, 25).map((candidate) => ({
    pista: candidate.trackNo,
    disco: candidate.discNo,
    artista: candidate.artistName,
    album: candidate.albumTitle,
    cancion: candidate.title,
  })))

  if (candidates.length > 25) console.log(`... y ${candidates.length - 25} canciones mas.`)
  for (const item of skipped) console.warn(`Omitido: ${item.relativePath} (${item.reason})`)
}

async function main() {
  const apply = process.argv.includes('--apply')
  const directoryArgument = process.argv.slice(2).find((argument) => argument !== '--apply')
  const configuredDirectory = directoryArgument || process.env.MUSIC_LIBRARY_PATH

  if (!configuredDirectory) {
    throw new Error('Indica la carpeta de musica o configura MUSIC_LIBRARY_PATH en Backend/.env.')
  }

  const rootDirectory = path.resolve(configuredDirectory)
  const rootStats = await fs.stat(rootDirectory).catch(() => null)
  if (!rootStats?.isDirectory()) throw new Error(`La carpeta no existe: ${rootDirectory}`)

  const files = await collectMp3Files(rootDirectory)
  const { candidates, skipped } = createCandidates(rootDirectory, files)
  printPreview(rootDirectory, candidates, skipped)

  if (!apply) {
    console.log('Vista previa solamente. Ejecuta con --apply para guardar en PostgreSQL.')
    return
  }
  if (candidates.length === 0) throw new Error('No hay canciones validas para importar.')

  const { PrismaClient } = require('@prisma/client')
  const prisma = new PrismaClient()

  try {
    let imported = 0
    for (const candidate of candidates) {
      await importCandidate(prisma, candidate)
      imported += 1
      console.log(`[${imported}/${candidates.length}] ${candidate.artistName} - ${candidate.title}`)
    }
    console.log(`Importacion completada: ${imported} canciones catalogadas.`)
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`No se pudo importar la biblioteca: ${error.message}`)
    process.exitCode = 1
  })
}

module.exports = {
  assignTrackNumbers,
  createCandidates,
  importCandidate,
  parseTrackFileName,
  slugify,
}
