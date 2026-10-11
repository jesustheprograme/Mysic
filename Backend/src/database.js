const { MongoClient } = require('mongodb')

let client
let database
let users
let favorites
let favoriteLogs
let playlists
let artistSpotlightViews

const favoriteCollectionNames = {
  song: 'Mysic_fav_usuarios_can',
  album: 'Mysic_fav_usuarios_alb',
  artist: 'Mysic_fav_usuarios_arti',
}

async function connectDatabase(config) {
  client = new MongoClient(config.mongoUri)
  await client.connect()

  database = client.db(config.databaseName)
  users = database.collection(config.usersCollection)
  favorites = Object.fromEntries(
    Object.entries(favoriteCollectionNames).map(([type, name]) => [type, database.collection(name)]),
  )
  favoriteLogs = database.collection('Mysic_fav_logs')
  playlists = database.collection('Mysic_playlist_usuarios')
  artistSpotlightViews = database.collection('Mysic_artist_spotlight_views')

  await Promise.all([
    users.createIndex({ email: 1 }, { unique: true }),
    users.createIndex({ googleSub: 1 }, { unique: true, sparse: true }),
    ...Object.values(favorites).map((collection) => (
      collection.createIndex({ userId: 1, itemId: 1 }, { unique: true })
    )),
    favoriteLogs.createIndex({ userId: 1, createdAt: -1 }),
    playlists.createIndex({ userId: 1, updatedAt: -1 }),
    artistSpotlightViews.createIndex({ userId: 1, artistId: 1 }, { unique: true }),
  ])

  return database
}

function getUsersCollection() {
  if (!users) {
    throw new Error('La base de datos todavia no esta conectada.')
  }

  return users
}

function getFavoriteCollections() {
  if (!favorites || !favoriteLogs) {
    throw new Error('La base de datos todavia no esta conectada.')
  }

  return { favorites, logs: favoriteLogs }
}

function getPlaylistsCollection() {
  if (!playlists) {
    throw new Error('La base de datos todavia no esta conectada.')
  }

  return playlists
}

function getArtistSpotlightViewsCollection() {
  if (!artistSpotlightViews) {
    throw new Error('La base de datos todavia no esta conectada.')
  }

  return artistSpotlightViews
}

async function closeDatabase() {
  if (client) {
    await client.close()
  }
}

async function checkDatabaseHealth() {
  if (!client || !database) throw new Error('MongoDB todavía no está conectado.')
  await database.command({ ping: 1 })
}

module.exports = {
  checkDatabaseHealth,
  closeDatabase,
  connectDatabase,
  getArtistSpotlightViewsCollection,
  getFavoriteCollections,
  getPlaylistsCollection,
  getUsersCollection,
}
