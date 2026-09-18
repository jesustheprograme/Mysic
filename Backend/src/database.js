const { MongoClient } = require('mongodb')

let client
let users

async function connectDatabase(config) {
  client = new MongoClient(config.mongoUri)
  await client.connect()

  const database = client.db(config.databaseName)
  users = database.collection(config.usersCollection)

  await Promise.all([
    users.createIndex({ email: 1 }, { unique: true }),
    users.createIndex({ googleSub: 1 }, { unique: true, sparse: true }),
  ])

  return database
}

function getUsersCollection() {
  if (!users) {
    throw new Error('La base de datos todavia no esta conectada.')
  }

  return users
}

async function closeDatabase() {
  if (client) {
    await client.close()
  }
}

module.exports = {
  closeDatabase,
  connectDatabase,
  getUsersCollection,
}
