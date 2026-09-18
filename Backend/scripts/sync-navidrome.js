const path = require('node:path')

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })

const { PrismaClient } = require('@prisma/client')
const { getConfig } = require('../src/config')
const { navidromeRequest } = require('../src/navidrome')
const { assignTrackNumbers, importCandidate, parseTrackFileName } = require('./import-music')

const PAGE_SIZE = 500

function cleanName(value) {
  return String(value || '').replace(/^\uFEFF/, '').trim()
}

function positiveInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

function candidateFromNavidromeSong(song, { preferFilename = false } = {}) {
  const relativePath = cleanName(song.path).replaceAll('\\', '/')
  const parts = relativePath.split('/').map(cleanName).filter(Boolean)
  const artistMarker = parts.findIndex((part) => part.toLocaleLowerCase('es') === 'artistas')
  const structuredPath = artistMarker >= 0
  const artistName = structuredPath ? parts[artistMarker + 1] : parts[0] || cleanName(song.artist)
  const category = artistMarker >= 0 ? parts[artistMarker + 2]?.toLocaleLowerCase('es') : null
  const hasReleaseFolder = ['singles', 'eps'].includes(category) && parts.length > artistMarker + 4
  const albumTitle = category === 'albums' || hasReleaseFolder
    ? parts[artistMarker + 3]
    : category === 'singles'
      ? 'Singles'
      : category === 'eps'
        ? 'EPs'
      : parts[1] || cleanName(song.album) || 'Singles'
  const fileName = parts.at(-1) || `${song.title || 'Sin título'}.mp3`
  const parsedName = parseTrackFileName(fileName)
  const metadataDiscNumber = positiveInteger(song.discNumber ?? song.discNo)
  const metadataTrackNumber = positiveInteger(song.trackNumber ?? song.track ?? song.trackNo)
  const requestedDiscNo = preferFilename
    ? parsedName.discNumber
    : metadataDiscNumber ?? parsedName.discNumber
  const requestedTrackNo = preferFilename
    ? parsedName.trackNumber
    : metadataTrackNumber ?? parsedName.trackNumber

  if (!song.id || !artistName || !albumTitle) return null
  return {
    absolutePath: relativePath,
    relativePath: relativePath || `${artistName}/${albumTitle}/${fileName}`,
    artistName: artistName.trim(),
    albumTitle: albumTitle.trim(),
    title: cleanName(parsedName.title || song.title) || 'Sin título',
    requestedDiscNo,
    requestedTrackNo,
    durationSec: Number(song.duration) || null,
    mediaUrl: `navidrome:${song.id}`,
    structuredPath,
  }
}

async function fetchAllSongs(config) {
  const songs = []
  let offset = 0

  while (true) {
    const response = await navidromeRequest(config, 'search3', {
      query: '',
      artistCount: 0,
      albumCount: 0,
      songCount: PAGE_SIZE,
      songOffset: offset,
    })
    const page = response.searchResult3?.song || []
    songs.push(...page)
    if (page.length < PAGE_SIZE) return songs
    offset += page.length
  }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const config = getConfig()
  const songs = await fetchAllSongs(config)
  const allCandidates = songs.map(candidateFromNavidromeSong).filter(Boolean)
  const structuredCandidates = allCandidates.filter((candidate) => candidate.structuredPath)
  const candidates = structuredCandidates.length > 0 ? structuredCandidates : allCandidates
  assignTrackNumbers(candidates)
  const structuredCount = structuredCandidates.length

  console.log(`Navidrome devolvió ${songs.length} canciones.`)
  console.log(`Rutas nuevas reconocidas: ${structuredCount}/${allCandidates.length}.`)
  console.table(candidates.slice(0, 25).map((song) => ({
    artista: song.artistName,
    album: song.albumTitle,
    disco: song.discNo,
    pista: song.trackNo,
    cancion: song.title,
  })))
  if (!apply) {
    if (structuredCount === 0 && candidates.length > 0) {
      console.warn('Navidrome todavía muestra la estructura anterior. Ejecuta un escaneo completo en Navidrome antes de importar.')
    }
    console.log('Vista previa solamente. Ejecuta music:sync:apply para guardar en PostgreSQL.')
    return
  }
  if (structuredCount === 0 && candidates.length > 0) {
    throw new Error('Navidrome todavía no indexó Artistas/Artista/Albums o Singles. Haz un escaneo completo primero.')
  }

  const prisma = new PrismaClient()
  try {
    for (let index = 0; index < candidates.length; index += 1) {
      await importCandidate(prisma, candidates[index])
      console.log(`[${index + 1}/${candidates.length}] ${candidates[index].artistName} - ${candidates[index].title}`)
    }
  } finally {
    await prisma.$disconnect()
  }
  console.log(`Sincronización completada: ${candidates.length} canciones.`)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`No se pudo sincronizar Navidrome: ${error.message}`)
    process.exitCode = 1
  })
}

module.exports = { candidateFromNavidromeSong, fetchAllSongs }
