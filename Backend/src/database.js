const { MongoClient } = require('mongodb')

let client
let users
let favorites
let favoriteLogs
let playlists

const favoriteCollectionNames = {
  song: 'Mysic_fav_usuarios_can',
  album: 'Mysic_fav_usuarios_alb',
  artist: 'Mysic_fav_usuarios_arti',
}

async function connectDatabase(config) {
  client = new MongoClient(config.mongoUri)
  await client.connect()

  const database = client.db(config.databaseName)
  users = database.collection(config.usersCollection)
  favorites = Object.fromEntries(
    Object.entries(favoriteCollectionNames).map(([type, name]) => [type, database.collection(name)]),
  )
  favoriteLogs = database.collection('Mysic_fav_logs')
  playlists = database.collection('Mysic_playlist_usuarios')

  await Promise.all([
    users.createIndex({ email: 1 }, { unique: true }),
    users.createIndex({ googleSub: 1 }, { unique: true, sparse: true }),
    ...Object.values(favorites).map((collection) => (
      collection.createIndex({ userId: 1, itemId: 1 }, { unique: true })
    )),
    favoriteLogs.createIndex({ userId: 1, createdAt: -1 }),
    playlists.createIndex({ userId: 1, updatedAt: -1 }),
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

async function closeDatabase() {
  if (client) {
    await client.close()
  }
}

module.exports = {
  closeDatabase,
  connectDatabase,
  getFavoriteCollections,
  getPlaylistsCollection,
  getUsersCollection,
}
