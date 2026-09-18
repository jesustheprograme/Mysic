const express = require('express')
const { z } = require('zod')
const { getAuthenticatedUser } = require('./auth')
const { getFavoriteCollections } = require('./database')
const { prisma } = require('./prisma')

const typeSchema = z.enum(['song', 'album', 'artist'])
const itemIdSchema = z.string().trim().min(1).max(128)
const catalogModels = { song: prisma.song, album: prisma.album, artist: prisma.artist }

function parseFavorite(req, res) {
  const type = typeSchema.safeParse(req.params.type)
  const itemId = itemIdSchema.safeParse(req.params.itemId)

  if (!type.success || !itemId.success) {
    res.status(400).json({ message: 'El favorito solicitado no es valido.' })
    return null
  }

  return { type: type.data, itemId: itemId.data }
}

function createFavoritesRouter(config) {
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
      const { favorites } = getFavoriteCollections()
      const [songs, albums, artists] = await Promise.all(
        ['song', 'album', 'artist'].map((type) => (
          favorites[type]
            .find({ userId: req.user._id })
            .project({ _id: 0, itemId: 1 })
            .toArray()
        )),
      )

      res.json({
        favorites: {
          songs: songs.map(({ itemId }) => itemId),
          albums: albums.map(({ itemId }) => itemId),
          artists: artists.map(({ itemId }) => itemId),
        },
      })
    } catch (error) {
      next(error)
    }
  })

  router.put('/:type/:itemId', async (req, res, next) => {
    try {
      const favorite = parseFavorite(req, res)
      if (!favorite) return

      const catalogItem = await catalogModels[favorite.type].findUnique({
        where: { id: favorite.itemId },
        select: { id: true },
      })
      if (!catalogItem) return res.status(404).json({ message: 'El elemento ya no existe en el catalogo.' })

      const { favorites, logs } = getFavoriteCollections()
      const now = new Date()
      const result = await favorites[favorite.type].updateOne(
        { userId: req.user._id, itemId: favorite.itemId },
        { $setOnInsert: { userId: req.user._id, itemId: favorite.itemId, createdAt: now } },
        { upsert: true },
      )
      if (result.upsertedCount) {
        await logs.insertOne({
          userId: req.user._id,
          type: favorite.type,
          itemId: favorite.itemId,
          action: 'added',
          createdAt: now,
        })
      }

      return res.json({ liked: true })
    } catch (error) {
      return next(error)
    }
  })

  router.delete('/:type/:itemId', async (req, res, next) => {
    try {
      const favorite = parseFavorite(req, res)
      if (!favorite) return

      const { favorites, logs } = getFavoriteCollections()
      const result = await favorites[favorite.type].deleteOne({
        userId: req.user._id,
        itemId: favorite.itemId,
      })
      if (result.deletedCount) {
        await logs.insertOne({
          userId: req.user._id,
          type: favorite.type,
          itemId: favorite.itemId,
          action: 'removed',
          createdAt: new Date(),
        })
      }

      return res.json({ liked: false })
    } catch (error) {
      return next(error)
    }
  })

  return router
}

module.exports = { createFavoritesRouter }
