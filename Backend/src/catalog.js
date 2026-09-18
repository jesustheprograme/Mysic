const fs = require('node:fs')
const fsPromises = require('node:fs/promises')
const path = require('node:path')
const { fileURLToPath } = require('node:url')
const express = require('express')
const { proxyNavidromeAudio } = require('./navidrome')
const { prisma } = require('./prisma')

const catalogImageDirectory = path.join(__dirname, '..', 'storage', 'catalog-images')

function mapImage(image) {
  if (!image) return null

  const version = image.url.startsWith('catalog-image:')
    ? path.parse(image.url.slice('catalog-image:'.length)).name
    : null

  return `/catalog/images/${image.id}${version ? `?v=${encodeURIComponent(version)}` : ''}`
}

const songRelations = {
  artists: { include: { artist: { include: { image: true, profileImages: { orderBy: { position: 'asc' } } } } } },
  albums: {
    include: { album: { include: { coverImage: true } } },
    orderBy: [{ isPrimary: 'desc' }, { album: { title: 'asc' } }],
  },
  mediaAssets: { where: { type: 'audio' }, take: 1 },
}

function mapSong(song, track = song.albums?.[0]) {
  const artists = song.artists.map(({ artist }) => ({
    id: artist.id,
    name: artist.name,
    slug: artist.slug,
    image: mapImage(artist.image) ?? mapImage(artist.profileImages?.[0]),
    images: artist.profileImages?.map(mapImage) ?? [],
  }))
  const album = track?.album
    ? {
        id: track.album.id,
        title: track.album.title,
        slug: track.album.slug,
        artwork: mapImage(track.album.coverImage),
        releaseDate: track.album.releaseDate,
      }
    : null
  const asset = song.mediaAssets[0] ?? null

  return {
    id: song.id,
    slug: song.slug,
    title: song.title,
    durationSeconds: song.durationSec ?? 0,
    discNo: track?.discNo ?? 1,
    trackNo: track?.trackNo ?? null,
    artists,
    artist: artists.map((artist) => artist.name).join(', ') || 'Artista desconocido',
    artistId: artists[0]?.id ?? null,
    album,
    albumId: album?.id ?? null,
    albumTitle: album?.title ?? 'Sin álbum',
    albumMemberships: song.albums.map((membership) => ({
      id: membership.album.id,
      title: membership.album.title,
      slug: membership.album.slug,
      artwork: mapImage(membership.album.coverImage),
      releaseDate: membership.album.releaseDate,
      discNo: membership.discNo,
      trackNo: membership.trackNo,
      isPrimary: membership.isPrimary,
    })),
    releaseDate: album?.releaseDate ?? null,
    artwork: album?.artwork ?? artists[0]?.image ?? null,
    audioPath: asset ? `/catalog/media/${asset.id}/stream` : null,
  }
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
}

function ensureFileIsInsideLibrary(filePath, libraryRoot) {
  const relativePath = path.relative(libraryRoot, filePath)
  return relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

function parseByteRange(rangeHeader, fileSize) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || '')
  if (!match) return null

  const start = match[1] ? Number(match[1]) : 0
  const end = match[2] ? Number(match[2]) : fileSize - 1
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= fileSize) return null

  return { start, end: Math.min(end, fileSize - 1) }
}

function createCatalogRouter(config) {
  const router = express.Router()

  router.get('/songs', asyncRoute(async (req, res) => {
    const search = String(req.query.search || '').trim()
    const songs = await prisma.song.findMany({
      where: search
        ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { artists: { some: { artist: { name: { contains: search, mode: 'insensitive' } } } } },
            { albums: { some: { album: { title: { contains: search, mode: 'insensitive' } } } } },
          ],
        }
        : {},
      include: songRelations,
      take: 1000,
    })
    const catalogSongs = songs
      .map((song) => mapSong(song))
      .sort((first, second) => (
        first.albumTitle.localeCompare(second.albumTitle)
        || first.discNo - second.discNo
        || (first.trackNo ?? Number.MAX_SAFE_INTEGER) - (second.trackNo ?? Number.MAX_SAFE_INTEGER)
      ))

    res.json({ songs: catalogSongs })
  }))

  router.get('/songs/:id', asyncRoute(async (req, res) => {
    const song = await prisma.song.findUnique({ where: { id: req.params.id }, include: songRelations })
    if (!song) return res.status(404).json({ message: 'Canción no encontrada.' })
    return res.json({ song: mapSong(song) })
  }))

  router.get('/artists', asyncRoute(async (_req, res) => {
    const artists = await prisma.artist.findMany({
      include: { image: true, profileImages: { orderBy: { position: 'asc' } }, _count: { select: { songs: true, albums: true } } },
      orderBy: { name: 'asc' },
    })
    res.json({
      artists: artists.map((artist) => ({
        id: artist.id,
        name: artist.name,
        slug: artist.slug,
        artwork: mapImage(artist.image) ?? mapImage(artist.profileImages[0]),
        images: artist.profileImages.map(mapImage),
        songCount: artist._count.songs,
        albumCount: artist._count.albums,
      })),
    })
  }))

  router.get('/artists/:id', asyncRoute(async (req, res) => {
    const artist = await prisma.artist.findUnique({
      where: { id: req.params.id },
      include: {
        image: true,
        profileImages: { orderBy: { position: 'asc' } },
        songs: { include: { song: { include: songRelations } } },
        albums: { include: { album: { include: { coverImage: true } } } },
      },
    })
    if (!artist) return res.status(404).json({ message: 'Artista no encontrado.' })

    return res.json({
      artist: {
        id: artist.id,
        name: artist.name,
        slug: artist.slug,
        biography: artist.biography,
        artwork: mapImage(artist.image) ?? mapImage(artist.profileImages[0]),
        images: artist.profileImages.map(mapImage),
        albums: artist.albums.map(({ album }) => ({
          id: album.id,
          title: album.title,
          slug: album.slug,
          artwork: mapImage(album.coverImage),
        })),
        songs: artist.songs.map(({ song }) => mapSong(song)),
      },
    })
  }))

  router.get('/albums', asyncRoute(async (_req, res) => {
    const albums = await prisma.album.findMany({
      include: {
        coverImage: true,
        artists: { include: { artist: true } },
        _count: { select: { tracks: true } },
      },
      orderBy: { title: 'asc' },
    })
    res.json({
      albums: albums.map((album) => ({
        id: album.id,
        title: album.title,
        slug: album.slug,
        artwork: mapImage(album.coverImage),
        artist: album.artists.map(({ artist }) => artist.name).join(', '),
        artistId: album.artists[0]?.artist.id ?? null,
        trackCount: album._count.tracks,
        releaseDate: album.releaseDate,
      })),
    })
  }))

  router.get('/albums/:id', asyncRoute(async (req, res) => {
    const album = await prisma.album.findUnique({
      where: { id: req.params.id },
      include: {
        coverImage: true,
        artists: { include: { artist: true } },
        tracks: {
          include: { song: { include: songRelations } },
          orderBy: [{ discNo: 'asc' }, { trackNo: 'asc' }],
        },
      },
    })
    if (!album) return res.status(404).json({ message: 'Álbum no encontrado.' })

    return res.json({
      album: {
        id: album.id,
        title: album.title,
        slug: album.slug,
        artwork: mapImage(album.coverImage),
        releaseDate: album.releaseDate,
        artists: album.artists.map(({ artist }) => ({ id: artist.id, name: artist.name })),
        songs: album.tracks.map((track) => mapSong(track.song, { ...track, album })),
      },
    })
  }))

  router.get('/images/:id', asyncRoute(async (req, res) => {
    const image = await prisma.image.findUnique({ where: { id: req.params.id } })
      ?? await prisma.artistProfileImage.findUnique({ where: { id: req.params.id } })
    if (!image) return res.status(404).json({ message: 'Imagen no encontrada.' })

    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.setHeader('Cache-Control', req.query.v
      ? 'public, max-age=31536000, immutable'
      : 'no-cache')
    if (/^https?:\/\//i.test(image.url)) return res.redirect(image.url)
    if (!image.url.startsWith('catalog-image:')) {
      return res.status(409).json({ message: 'La fuente de la imagen no está disponible.' })
    }

    const filePath = path.resolve(catalogImageDirectory, image.url.slice('catalog-image:'.length))
    if (!ensureFileIsInsideLibrary(filePath, catalogImageDirectory)) {
      return res.status(403).json({ message: 'Ruta de imagen no permitida.' })
    }

    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    }
    res.type(contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream')
    return fs.createReadStream(filePath).pipe(res)
  }))

  router.get('/media/:id/stream', asyncRoute(async (req, res) => {
    const asset = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } })
    if (!asset || asset.type !== 'audio') return res.status(404).json({ message: 'Audio no encontrado.' })

    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')

    if (/^https?:\/\//i.test(asset.url)) return res.redirect(asset.url)
    if (asset.url.startsWith('navidrome:')) {
      return proxyNavidromeAudio(config, asset.url.slice('navidrome:'.length), req, res)
    }
    if (!asset.url.startsWith('file:')) return res.status(409).json({ message: 'La fuente de audio no está disponible.' })
    if (!config.musicLibraryPath) return res.status(503).json({ message: 'MUSIC_LIBRARY_PATH no está configurada.' })

    const libraryRoot = await fsPromises.realpath(config.musicLibraryPath)
    const filePath = await fsPromises.realpath(fileURLToPath(asset.url))
    if (!ensureFileIsInsideLibrary(filePath, libraryRoot)) return res.status(403).json({ message: 'Ruta de audio no permitida.' })

    const stats = await fsPromises.stat(filePath)
    const range = parseByteRange(req.headers.range, stats.size)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Type', asset.mimeType || 'audio/mpeg')
    res.setHeader('Cache-Control', 'private, max-age=3600')

    if (req.headers.range && !range) {
      res.status(416).setHeader('Content-Range', `bytes */${stats.size}`)
      return res.end()
    }
    if (!range) {
      res.setHeader('Content-Length', stats.size)
      return fs.createReadStream(filePath).pipe(res)
    }

    res.status(206)
    res.setHeader('Content-Length', range.end - range.start + 1)
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${stats.size}`)
    return fs.createReadStream(filePath, range).pipe(res)
  }))

  return router
}

module.exports = { createCatalogRouter, mapSong, parseByteRange }
