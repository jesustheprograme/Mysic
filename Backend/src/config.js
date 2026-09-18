const required = (name) => {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Revisa Backend/.env.example.`)
  }

  return value
}

const parseOrigins = (value) => value
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

function getMongoUri() {
  const directHosts = process.env.MONGODB_DIRECT_HOSTS?.trim()
  const clusterHost = process.env.MONGODB_CLUSTER_HOST?.trim()

  if (!directHosts && !clusterHost) {
    return required('MONGODB_URI')
  }

  const username = encodeURIComponent(required('MONGODB_USERNAME'))
  const password = encodeURIComponent(required('MONGODB_PASSWORD'))

  if (directHosts) {
    const replicaSet = encodeURIComponent(required('MONGODB_REPLICA_SET'))

    return `mongodb://${username}:${password}@${directHosts}/?tls=true&authSource=admin&replicaSet=${replicaSet}&retryWrites=true&w=majority&appName=Cluster0`
  }

  return `mongodb+srv://${username}:${password}@${clusterHost}/?retryWrites=true&w=majority&appName=Cluster0`
}

function getConfig() {
  const jwtSecret = required('JWT_SECRET')

  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres.')
  }

  return {
    port: Number(process.env.PORT) || 4000,
    nodeEnv: process.env.NODE_ENV || 'development',
    mongoUri: getMongoUri(),
    databaseName: process.env.MONGODB_DB_NAME?.trim() || 'Mysic',
    usersCollection: process.env.MONGODB_USERS_COLLECTION?.trim() || 'Mysic_usuarios',
    musicLibraryPath: process.env.MUSIC_LIBRARY_PATH?.trim() || '',
    navidromeUrl: process.env.NAVIDROME_URL?.trim() || '',
    navidromeUser: process.env.NAVIDROME_USER?.trim() || '',
    navidromePassword: process.env.NAVIDROME_PASSWORD || '',
    cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim() || '',
    cloudinaryApiKey: process.env.CLOUDINARY_API_KEY?.trim() || '',
    cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET?.trim() || '',
    cloudinaryFolderMode: process.env.CLOUDINARY_FOLDER_MODE?.trim() || 'dynamic',
    jwtSecret,
    googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || '',
    googleClientIds: (process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || '')
      .split(',')
      .map((clientId) => clientId.trim())
      .filter(Boolean),
    frontendOrigins: parseOrigins(
      process.env.FRONTEND_ORIGINS
        || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174',
    ),
  }
}

module.exports = { getConfig }
