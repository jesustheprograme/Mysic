const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })

const manifestPath = path.join(__dirname, '..', 'catalog', 'album-links.json')

function placeholderSlug(artist, album, title) {
  const hash = crypto.createHash('sha1').update(`${artist}\0${album}\0${title}`).digest('hex').slice(0, 10)
  return `catalog-placeholder-${hash}`
}

async function loadAlbumLinkManifests() {
  return JSON.parse(await fs.readFile(manifestPath, 'utf8'))
}

async function resolveSourceSong(database, entry, targetAlbum) {
  if (!entry.sourceAlbum) return null

  const sameAlbum = entry.sourceAlbum === targetAlbum
  const sourceTrack = await database.albumTrack.findFirst({
    where: {
      album: { title: entry.sourceAlbum },
      ...(sameAlbum
        ? { isPrimary: true, song: { title: entry.title } }
        : { discNo: entry.sourceDiscNo ?? 1, trackNo: entry.sourceTrackNo }),
    },
    include: { song: { include: { mediaAssets: { where: { type: 'audio' } } } } },
  })

  if (!sourceTrack) {
    throw new Error(`No se encontró ${entry.title} en ${entry.sourceAlbum}.`)
  }
  if (sourceTrack.song.title !== entry.title) {
    throw new Error(`La pista ${entry.sourceDiscNo ?? 1}-${entry.sourceTrackNo} de ${entry.sourceAlbum} es «${sourceTrack.song.title}», no «${entry.title}».`)
  }
  if (!sourceTrack.song.mediaAssets.length) {
    throw new Error(`La pista ${entry.title} de ${entry.sourceAlbum} todavía no tiene MP3 reproducible.`)
  }
  return sourceTrack.song
}

async function createPlaceholderSong(database, artist, manifest, entry) {
  const slug = placeholderSlug(manifest.artist, manifest.album, entry.title)
  const song = await database.song.upsert({
    where: { slug },
    update: { title: entry.title, durationSec: entry.durationSec ?? undefined },
    create: { slug, title: entry.title, durationSec: entry.durationSec ?? null },
  })

  await database.songArtist.upsert({
    where: { songId_artistId: { songId: song.id, artistId: artist.id } },
    update: {},
    create: { songId: song.id, artistId: artist.id },
  })
  return song
}

async function applyAlbumLinkManifest(database, manifest) {
  return database.$transaction(async (transaction) => {
    const artist = await transaction.artist.findFirst({ where: { name: manifest.artist } })
    if (!artist) throw new Error(`No existe el artista ${manifest.artist}. Sincroniza primero la biblioteca física.`)

    const album = await transaction.album.findFirst({ where: { title: manifest.album } })
    if (!album) throw new Error(`No existe el álbum ${manifest.album}. Sincroniza primero la biblioteca física.`)

    await transaction.album.update({
      where: { id: album.id },
      data: { releaseDate: new Date(manifest.releaseDate) },
    })

    const resolvedTracks = []
    for (const entry of manifest.tracks) {
      const sourceSong = await resolveSourceSong(transaction, entry, manifest.album)
      const song = sourceSong ?? await createPlaceholderSong(transaction, artist, manifest, entry)
      resolvedTracks.push({ entry, song })
    }

    const songIds = resolvedTracks.map(({ song }) => song.id)
    const previousTracks = await transaction.albumTrack.findMany({
      where: { albumId: album.id },
      select: { songId: true },
    })
    await transaction.albumTrack.deleteMany({
      where: { albumId: album.id, songId: { notIn: songIds } },
    })

    for (const { entry, song } of resolvedTracks) {
      await transaction.albumTrack.deleteMany({
        where: {
          albumId: album.id,
          discNo: entry.discNo,
          trackNo: entry.trackNo,
          songId: { not: song.id },
        },
      })
      await transaction.albumTrack.upsert({
        where: { albumId_songId: { albumId: album.id, songId: song.id } },
        update: {
          discNo: entry.discNo,
          trackNo: entry.trackNo,
          isPrimary: entry.sourceAlbum === manifest.album,
        },
        create: {
          albumId: album.id,
          songId: song.id,
          discNo: entry.discNo,
          trackNo: entry.trackNo,
          isPrimary: entry.sourceAlbum === manifest.album,
        },
      })
    }

    await transaction.song.deleteMany({
      where: {
        slug: { startsWith: 'catalog-placeholder-' },
        albums: { none: {} },
        mediaAssets: { none: {} },
      },
    })
    await transaction.song.deleteMany({
      where: {
        id: { in: previousTracks.map(({ songId }) => songId).filter((songId) => !songIds.includes(songId)) },
        albums: { none: {} },
      },
    })

    return {
      album: manifest.album,
      linked: resolvedTracks.length,
      playable: resolvedTracks.filter(({ entry }) => entry.sourceAlbum).length,
    }
  })
}

async function applyAlbumLinks(database) {
  const manifests = await loadAlbumLinkManifests()
  const results = []
  for (const manifest of manifests) results.push(await applyAlbumLinkManifest(database, manifest))
  return results
}

async function main() {
  const { PrismaClient } = require('@prisma/client')
  const prisma = new PrismaClient()

  try {
    const manifests = await loadAlbumLinkManifests()
    console.table(manifests.map((manifest) => ({
      album: manifest.album,
      pistas: manifest.tracks.length,
      sinMp3: manifest.tracks.filter((track) => !track.sourceAlbum).length,
    })))
    if (!process.argv.includes('--apply')) {
      console.log('Vista previa solamente. Ejecuta music:links:apply para guardar las relaciones.')
      return
    }

    const results = await applyAlbumLinks(prisma)
    results.forEach((result) => console.log(`${result.album}: ${result.linked} pistas, ${result.playable} reproducibles.`))
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`No se pudieron vincular los álbumes: ${error.message}`)
    process.exitCode = 1
  })
}

module.exports = { applyAlbumLinkManifest, applyAlbumLinks, loadAlbumLinkManifests, placeholderSlug, resolveSourceSong }
