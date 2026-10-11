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

function parseTrustProxy(value) {
  const normalized = String(value || '').trim()
  if (!normalized || normalized === 'false') return false
  if (/^\d+$/.test(normalized)) return Number(normalized)
  return normalized
}

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
  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || ''
  const googleClientIds = [
    googleClientId,
    ...(process.env.GOOGLE_CLIENT_IDS || '').split(','),
  ]
    .map((clientId) => clientId.trim())
    .filter((clientId, index, clientIds) => clientId && clientIds.indexOf(clientId) === index)

  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres.')
  }

  return {
    port: Number(process.env.PORT) || 4000,
    bindHost: process.env.API_BIND_HOST?.trim() || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    mongoUri: getMongoUri(),
    databaseName: process.env.MONGODB_DB_NAME?.trim() || 'Mysic',
    usersCollection: process.env.MONGODB_USERS_COLLECTION?.trim() || 'Mysic_usuarios',
    musicImportAdminEmail: process.env.MUSIC_IMPORT_ADMIN_EMAIL?.trim().toLowerCase() || 'jesusobregon2010@gmail.com',
    musicLibraryPath: process.env.MUSIC_LIBRARY_PATH?.trim() || '',
    navidromeUrl: process.env.NAVIDROME_URL?.trim() || '',
    navidromeUser: process.env.NAVIDROME_USER?.trim() || '',
    navidromePassword: process.env.NAVIDROME_PASSWORD || '',
    cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim() || '',
    cloudinaryApiKey: process.env.CLOUDINARY_API_KEY?.trim() || '',
    cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET?.trim() || '',
    cloudinaryFolderMode: process.env.CLOUDINARY_FOLDER_MODE?.trim() || 'dynamic',
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    objectStorageEndpoint: process.env.OBJECT_STORAGE_ENDPOINT?.trim() || '',
    objectStorageRegion: process.env.OBJECT_STORAGE_REGION?.trim() || 'auto',
    objectStorageBucket: process.env.OBJECT_STORAGE_BUCKET?.trim() || '',
    objectStorageAccessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID?.trim() || '',
    objectStorageSecretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || '',
    audioCdnBaseUrl: process.env.AUDIO_CDN_BASE_URL?.trim().replace(/\/$/, '') || '',
    audioUrlTtlSeconds: Math.min(Math.max(Number(process.env.AUDIO_URL_TTL_SECONDS) || 900, 60), 86400),
    jwtSecret,
    googleClientId,
    googleClientIds,
    frontendOrigins: parseOrigins(
      process.env.FRONTEND_ORIGINS
        || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174',
    ),
  }
}

module.exports = { getConfig, parseTrustProxy }
