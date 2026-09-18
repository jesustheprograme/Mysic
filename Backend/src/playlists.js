const express = require('express')
const { randomUUID } = require('node:crypto')
const { v2: cloudinary } = require('cloudinary')
const { ObjectId } = require('mongodb')
const multer = require('multer')
const { z } = require('zod')
const { getAuthenticatedUser } = require('./auth')
const { getPlaylistsCollection } = require('./database')

const PLAYLIST_ARTWORK_FOLDER = 'Mysic_playlist_usuarios/Playlist_imagenes'
const acceptedArtworkTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const acceptedArtworkExtensions = new Set(['jpg', 'jpeg', 'png', 'webp'])
const artworkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    const extension = file.originalname.split('.').pop()?.toLocaleLowerCase()
    if (!acceptedArtworkTypes.has(file.mimetype.toLocaleLowerCase()) && !acceptedArtworkExtensions.has(extension)) {
      callback(new Error('La portada debe ser JPG, PNG o WEBP.'))
      return
    }
    callback(null, true)
  },
})

const playlistFields = {
  title: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(''),
  artwork: z.string().max(4096).nullable().default(null),
  artworkPublicId: z.string().max(512).nullable().default(null),
  pinned: z.boolean().default(false),
  songIds: z.array(z.string().trim().min(1).max(128)).max(5000).default([]),
}

const createPlaylistSchema = z.object(playlistFields).strict()
const updatePlaylistSchema = z.object({
  // Updates are partial: omitted fields must stay unchanged in MongoDB.
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  artwork: z.string().max(4096).nullable().optional(),
  artworkPublicId: z.string().max(512).nullable().optional(),
  pinned: z.boolean().optional(),
  songIds: z.array(z.string().trim().min(1).max(128)).max(5000).optional(),
}).strict().refine((changes) => Object.keys(changes).length > 0)

function publicPlaylist(playlist) {
  return {
    id: playlist._id.toString(),
    title: playlist.title,
    description: playlist.description || '',
    artwork: playlist.artwork || null,
    artworkPublicId: playlist.artworkPublicId || null,
    pinned: Boolean(playlist.pinned),
    songIds: playlist.songIds || [],
  }
}

function receiveArtwork(req, res, next) {
  artworkUpload.single('artwork')(req, res, (error) => {
    if (!error) return next()
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'La portada no puede superar los 10 MB.'
      : error.message || 'No se pudo leer la portada.'
    return res.status(400).json({ message })
  })
}

function uploadArtwork(file, userId, config) {
  if (!config.cloudinaryCloudName || !config.cloudinaryApiKey || !config.cloudinaryApiSecret) {
    throw new Error('Cloudinary no esta configurado para subir portadas.')
  }

  cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret,
    secure: true,
  })

  const folderOptions = config.cloudinaryFolderMode === 'fixed'
    ? { folder: PLAYLIST_ARTWORK_FOLDER }
    : {
        asset_folder: PLAYLIST_ARTWORK_FOLDER,
        public_id_prefix: PLAYLIST_ARTWORK_FOLDER,
      }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      ...folderOptions,
      public_id: `playlist-${userId}-${randomUUID()}`,
      resource_type: 'image',
      overwrite: false,
      transformation: [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto:good' }],
    }, (error, result) => {
      if (error) reject(error)
      else resolve(result)
    })
    stream.end(file.buffer)
  })
}

function isOwnedArtwork(publicId, userId) {
  return typeof publicId === 'string'
    && publicId.startsWith(`${PLAYLIST_ARTWORK_FOLDER}/playlist-${userId}-`)
}

async function deleteArtwork(publicId, userId, config) {
  if (!isOwnedArtwork(publicId, userId)) return
  if (!config.cloudinaryCloudName || !config.cloudinaryApiKey || !config.cloudinaryApiSecret) return

  cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret,
    secure: true,
  })
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true })
}

function createPlaylistsRouter(config) {
  const router = express.Router()

  router.use(async (req, res, next) => {
    try {
      const user = await getAuthenticatedUser(req, res, config)
      if (!user) return
      req.user = user
      next()
    } catch (error) {
      next(error)
    }
  })

  router.get('/', async (req, res, next) => {
    try {
      const playlists = await getPlaylistsCollection()
        .find({ userId: req.user._id })
        .sort({ pinned: -1, updatedAt: -1 })
        .toArray()
      return res.json({ playlists: playlists.map(publicPlaylist) })
    } catch (error) {
      return next(error)
    }
  })

  router.post('/artwork', receiveArtwork, async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'Selecciona una portada para subir.' })
      const result = await uploadArtwork(req.file, req.user._id.toString(), config)
      return res.status(201).json({
        artwork: {
          url: result.secure_url,
          publicId: result.public_id,
        },
      })
    } catch (error) {
      return next(error)
    }
  })

  router.post('/', async (req, res, next) => {
    try {
      const parsed = createPlaylistSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ message: 'Revisa los datos de la playlist.' })
      if (parsed.data.artworkPublicId && !isOwnedArtwork(parsed.data.artworkPublicId, req.user._id.toString())) {
        return res.status(400).json({ message: 'La portada indicada no pertenece a este usuario.' })
      }

      const now = new Date()
      const playlist = {
        ...parsed.data,
        songIds: [...new Set(parsed.data.songIds)],
        userId: req.user._id,
        createdAt: now,
        updatedAt: now,
      }
      const result = await getPlaylistsCollection().insertOne(playlist)
      playlist._id = result.insertedId
      return res.status(201).json({ playlist: publicPlaylist(playlist) })
    } catch (error) {
      return next(error)
    }
  })

  router.patch('/:playlistId', async (req, res, next) => {
    try {
      if (!ObjectId.isValid(req.params.playlistId)) {
        return res.status(400).json({ message: 'La playlist solicitada no es valida.' })
      }
      const parsed = updatePlaylistSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ message: 'Revisa los cambios de la playlist.' })
      if (parsed.data.artworkPublicId && !isOwnedArtwork(parsed.data.artworkPublicId, req.user._id.toString())) {
        return res.status(400).json({ message: 'La portada indicada no pertenece a este usuario.' })
      }

      const changes = { ...parsed.data, updatedAt: new Date() }
      if (changes.songIds) changes.songIds = [...new Set(changes.songIds)]
      const replacesArtwork = Object.prototype.hasOwnProperty.call(changes, 'artworkPublicId')
      const previousPlaylist = replacesArtwork
        ? await getPlaylistsCollection().findOne({ _id: new ObjectId(req.params.playlistId), userId: req.user._id })
        : null
      const playlist = await getPlaylistsCollection().findOneAndUpdate(
        { _id: new ObjectId(req.params.playlistId), userId: req.user._id },
        { $set: changes },
        { returnDocument: 'after' },
      )
      if (!playlist) return res.status(404).json({ message: 'No encontramos esa playlist.' })
      if (previousPlaylist?.artworkPublicId && previousPlaylist.artworkPublicId !== changes.artworkPublicId) {
        try {
          await deleteArtwork(previousPlaylist.artworkPublicId, req.user._id.toString(), config)
        } catch {
          // The playlist update succeeded even if the old remote image could not be removed.
        }
      }
      return res.json({ playlist: publicPlaylist(playlist) })
    } catch (error) {
      return next(error)
    }
  })

  router.delete('/:playlistId', async (req, res, next) => {
    try {
      if (!ObjectId.isValid(req.params.playlistId)) {
        return res.status(400).json({ message: 'La playlist solicitada no es valida.' })
      }
      const playlist = await getPlaylistsCollection().findOneAndDelete({
        _id: new ObjectId(req.params.playlistId),
        userId: req.user._id,
      })
      if (!playlist) return res.status(404).json({ message: 'No encontramos esa playlist.' })
      try {
        await deleteArtwork(playlist.artworkPublicId, req.user._id.toString(), config)
      } catch {
        // The playlist is already deleted; a failed remote cleanup must not restore it.
      }
      return res.status(204).end()
    } catch (error) {
      return next(error)
    }
  })

  return router
}

module.exports = { createPlaylistsRouter }
