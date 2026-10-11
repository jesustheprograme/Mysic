const fs = require('node:fs')
const { PutObjectCommand, GetObjectCommand, S3Client } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

let client

function validateObjectKey(key) {
  const normalized = String(key || '').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..') || normalized.includes('\\')) {
    throw new Error('La clave del objeto de audio no es válida.')
  }
  return normalized
}

function hasObjectStorageCredentials(config) {
  return Boolean(
    config.objectStorageEndpoint
    && config.objectStorageBucket
    && config.objectStorageAccessKeyId
    && config.objectStorageSecretAccessKey,
  )
}

function getObjectStorageClient(config) {
  if (!hasObjectStorageCredentials(config)) {
    throw new Error('Configura las credenciales S3/R2 antes de usar almacenamiento de objetos.')
  }
  client ??= new S3Client({
    endpoint: config.objectStorageEndpoint,
    region: config.objectStorageRegion,
    credentials: {
      accessKeyId: config.objectStorageAccessKeyId,
      secretAccessKey: config.objectStorageSecretAccessKey,
    },
  })
  return client
}

function buildPublicObjectUrl(baseUrl, key) {
  const encodedKey = validateObjectKey(key)
    .split('/')
    .map(encodeURIComponent)
    .join('/')
  return `${String(baseUrl).replace(/\/$/, '')}/${encodedKey}`
}

async function createAudioDeliveryUrl(config, key) {
  const normalizedKey = validateObjectKey(key)
  if (config.audioCdnBaseUrl) return buildPublicObjectUrl(config.audioCdnBaseUrl, normalizedKey)

  return getSignedUrl(
    getObjectStorageClient(config),
    new GetObjectCommand({ Bucket: config.objectStorageBucket, Key: normalizedKey }),
    { expiresIn: config.audioUrlTtlSeconds },
  )
}

async function uploadAudioObject(config, { contentLength, contentType, filePath, key }) {
  const normalizedKey = validateObjectKey(key)
  await getObjectStorageClient(config).send(new PutObjectCommand({
    Bucket: config.objectStorageBucket,
    Key: normalizedKey,
    Body: fs.createReadStream(filePath),
    ContentLength: contentLength,
    ContentType: contentType || 'audio/mpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }))
  return normalizedKey
}

module.exports = {
  buildPublicObjectUrl,
  createAudioDeliveryUrl,
  hasObjectStorageCredentials,
  uploadAudioObject,
  validateObjectKey,
}
