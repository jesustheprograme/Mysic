const { execFile } = require('node:child_process')
const path = require('node:path')
const { promisify } = require('node:util')

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })

const { PrismaClient } = require('@prisma/client')
const { getConfig } = require('../src/config')
const { assignTrackNumbers, importCandidate } = require('./import-music')
const { applyAlbumLinks } = require('./link-album-tracks')
const { candidateFromNavidromeSong, fetchAllSongs } = require('./sync-navidrome')

const execFileAsync = promisify(execFile)

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Falta ${name} en Backend/.env.`)
  return value
}

function getSshConfig() {
  const host = required('MUSIC_SSH_HOST')
  const user = required('MUSIC_SSH_USER')
  const root = process.env.MUSIC_SSH_ROOT?.trim() || '/music'
  const keyPath = path.resolve(required('MUSIC_SSH_KEY_PATH'))

  if (!/^[a-z0-9.-]+$/i.test(host)) throw new Error('MUSIC_SSH_HOST no es válido.')
  if (!/^[a-z0-9._-]+$/i.test(user)) throw new Error('MUSIC_SSH_USER no es válido.')
  if (!root.startsWith('/') || /['\r\n]/.test(root)) throw new Error('MUSIC_SSH_ROOT no es válido.')
  return { host, user, root, keyPath }
}

async function listRemoteMp3Files(ssh) {
  const remoteCommand = `find '${ssh.root}' -type f -iname '*.mp3' -printf '%s\\t%P\\0'`
  const { stdout } = await execFileAsync('ssh', [
    '-i', ssh.keyPath,
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=15',
    `${ssh.user}@${ssh.host}`,
    remoteCommand,
  ], { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 })

  return stdout.toString('utf8').split('\0').filter(Boolean).map((record) => {
    const separator = record.indexOf('\t')
    return {
      size: Number(record.slice(0, separator)),
      relativePath: record.slice(separator + 1),
    }
  })
}

function matchNavidromeSong(file, songsBySize) {
  const matches = songsBySize.get(file.size) || []
  if (matches.length === 1) return matches[0]
  if (matches.length === 0) return null

  const fileTitle = path.basename(file.relativePath, path.extname(file.relativePath)).toLocaleLowerCase('es')
  return matches.find((song) => fileTitle.includes(String(song.title || '').toLocaleLowerCase('es'))) || null
}

async function removeStalePhysicalCatalog(database, artistNames, importedRelations) {
  const primaryTracks = await database.albumTrack.findMany({
    where: {
      isPrimary: true,
      song: { artists: { some: { artist: { name: { in: artistNames } } } } },
    },
  })

  for (const track of primaryTracks) {
    const relationKey = `${track.albumId}:${track.songId}`
    if (importedRelations.has(relationKey)) continue
    await database.albumTrack.delete({
      where: { albumId_songId: { albumId: track.albumId, songId: track.songId } },
    })
  }

  const emptyAlbums = await database.album.findMany({
    where: {
      artists: { some: { artist: { name: { in: artistNames } } } },
      tracks: { none: {} },
    },
    select: { id: true },
  })
  if (emptyAlbums.length) {
    await database.album.deleteMany({ where: { id: { in: emptyAlbums.map((album) => album.id) } } })
  }

  await database.song.deleteMany({
    where: {
      albums: { none: {} },
      artists: { some: { artist: { name: { in: artistNames } } } },
    },
  })
}

async function main() {
  const apply = process.argv.includes('--apply')
  const config = getConfig()
  const ssh = getSshConfig()
  const [remoteFiles, navidromeSongs] = await Promise.all([
    listRemoteMp3Files(ssh),
    fetchAllSongs(config),
  ])
  const songsBySize = new Map()

  for (const song of navidromeSongs) {
    const size = Number(song.size)
    if (!Number.isFinite(size)) continue
    const matches = songsBySize.get(size) || []
    matches.push(song)
    songsBySize.set(size, matches)
  }

  const unmatched = []
  const ignored = []
  const candidates = []
  for (const file of remoteFiles) {
    if (!file.relativePath.replaceAll('\\', '/').startsWith('Artistas/')) {
      ignored.push(file.relativePath)
      continue
    }
    const navidromeSong = matchNavidromeSong(file, songsBySize)
    if (!navidromeSong) {
      unmatched.push(file.relativePath)
      continue
    }
    const candidate = candidateFromNavidromeSong({
      ...navidromeSong,
      path: file.relativePath,
    }, { preferFilename: true })
    if (candidate) candidates.push(candidate)
  }
  assignTrackNumbers(candidates)

  console.log(`FileZilla/SSH: ${remoteFiles.length} MP3 encontrados.`)
  console.log(`Listos para catálogo: ${candidates.length}. Sin ID de reproducción: ${unmatched.length}. Fuera de Artistas/: ${ignored.length}.`)
  console.table(candidates.slice(0, 30).map((song) => ({
    artista: song.artistName,
    album: song.albumTitle,
    disco: song.discNo,
    pista: song.trackNo,
    cancion: song.title,
  })))
  unmatched.forEach((file) => console.warn(`Sin coincidencia en Navidrome: ${JSON.stringify(file)}`))
  ignored.forEach((file) => console.warn(`Fuera de la estructura: ${JSON.stringify(file)}`))

  if (!apply) {
    console.log('Vista previa solamente. Ejecuta music:filezilla:apply para guardar en PostgreSQL.')
    return
  }
  if (unmatched.length > 0) throw new Error('Hay MP3 sin ID de Navidrome. Corrige o reescanea antes de importar.')

  const prisma = new PrismaClient()
  try {
    const importedRelations = new Set()
    for (let index = 0; index < candidates.length; index += 1) {
      const imported = await importCandidate(prisma, candidates[index])
      importedRelations.add(`${imported.album.id}:${imported.song.id}`)
      console.log(`[${index + 1}/${candidates.length}] ${candidates[index].artistName} - ${candidates[index].title}`)
    }
    await removeStalePhysicalCatalog(
      prisma,
      [...new Set(candidates.map((candidate) => candidate.artistName))],
      importedRelations,
    )
    const linkedAlbums = await applyAlbumLinks(prisma)
    linkedAlbums.forEach((album) => console.log(`${album.album}: ${album.linked} pistas vinculadas.`))
  } finally {
    await prisma.$disconnect()
  }
  console.log(`Catálogo actualizado desde FileZilla: ${candidates.length} canciones.`)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`No se pudo leer FileZilla/SSH: ${error.message}`)
    process.exitCode = 1
  })
}

module.exports = { listRemoteMp3Files, matchNavidromeSong, removeStalePhysicalCatalog }
