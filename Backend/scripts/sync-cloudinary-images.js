const path = require('node:path')

const imageFormats = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif'])

function getCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim()
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim()
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Configura CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en Backend/.env.cloudinary.')
  }
  if (!/^[a-z0-9_-]+$/i.test(cloudName)) throw new Error('CLOUDINARY_CLOUD_NAME no es válido.')
  const folderMode = process.env.CLOUDINARY_FOLDER_MODE?.trim() || 'dynamic'
  if (!['dynamic', 'fixed'].includes(folderMode)) throw new Error('CLOUDINARY_FOLDER_MODE debe ser dynamic o fixed.')
  return { cloudName, apiKey, apiSecret, folderMode }
}

async function listCloudinaryImages(config, fetcher = fetch) {
  const field = config.folderMode === 'fixed' ? 'folder' : 'asset_folder'
  const expression = `resource_type:image AND type:upload AND ${field}:Artistas/*`
  const endpoint = `https://api.cloudinary.com/v1_1/${config.cloudName}/resources/search`
  const authorization = `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64')}`
  const resources = []
  const seenCursors = new Set()
  let cursor

  do {
    const url = new URL(endpoint)
    url.searchParams.set('expression', expression)
    url.searchParams.set('max_results', '500')
    if (cursor) url.searchParams.set('next_cursor', cursor)
    const response = await fetcher(url, {
      headers: { Authorization: authorization, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    })
    if (!response.ok) throw new Error(`Cloudinary rechazó la búsqueda de imágenes (HTTP ${response.status}).`)
    const data = await response.json()
    if (!Array.isArray(data.resources)) throw new Error('Cloudinary devolvió una lista de imágenes inválida.')
    resources.push(...data.resources)
    cursor = data.next_cursor
    if (cursor && seenCursors.has(cursor)) throw new Error('Cloudinary repitió una página de resultados.')
    if (cursor) seenCursors.add(cursor)
  } while (cursor)

  return resources
}

function assetFolder(asset, folderMode) {
  return folderMode === 'fixed'
    ? path.posix.dirname(asset.public_id || '')
    : asset.asset_folder || ''
}

function imageLabel(asset) {
  return String(asset.display_name || path.posix.basename(asset.public_id || '')).trim()
}

function isCloudinaryDeliveryUrl(value, cloudName) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.hostname === 'res.cloudinary.com'
      && url.pathname.startsWith(`/${cloudName}/image/upload/`)
  } catch {
    return false
  }
}

function buildImageCandidates(assets, config) {
  const skipped = []
  const profileGroups = new Map()
  const singleImageGroups = new Map()

  for (const asset of assets) {
    const folder = assetFolder(asset, config.folderMode)
    const parts = folder.split('/').filter(Boolean)
    const format = String(asset.format || '').toLowerCase()
    if (!imageFormats.has(format) || !isCloudinaryDeliveryUrl(asset.secure_url, config.cloudName)) {
      skipped.push({ folder, reason: 'Formato o URL de imagen no admitido.' })
      continue
    }
    if (parts[0]?.toLowerCase() !== 'artistas' || !parts[1]) {
      skipped.push({ folder, reason: 'La imagen debe estar dentro de Artistas/Artista.' })
      continue
    }

    const artistName = parts[1]
    const category = parts[2]?.toLowerCase()
    const label = imageLabel(asset)
    const item = { artistName, label, url: asset.secure_url, folder }
    if (parts.length === 3 && category === 'perfil') {
      const group = profileGroups.get(artistName) || []
      group.push(item)
      profileGroups.set(artistName, group)
    } else if (parts.length === 4 && ['albums', 'singles', 'eps'].includes(category)) {
      item.albumTitle = parts[3]
      item.kind = 'album'
      const key = `album:${artistName}\0${parts[3]}`
      const group = singleImageGroups.get(key) || []
      group.push(item)
      singleImageGroups.set(key, group)
    } else if (parts.length === 2) {
      item.kind = 'artist'
      const key = `artist:${artistName}`
      const group = singleImageGroups.get(key) || []
      group.push(item)
      singleImageGroups.set(key, group)
    } else {
      skipped.push({ folder, reason: 'Carpeta sin destino de artista, perfil o álbum.' })
    }
  }

  const candidates = []
  for (const group of singleImageGroups.values()) {
    group.sort((a, b) => a.label.localeCompare(b.label, 'es') || a.url.localeCompare(b.url))
    const preferred = group.find((item) => /^(cover|portada|artist|artista)(?:$|[-_\s])/i.test(item.label)) || group[0]
    candidates.push(preferred)
    group.filter((item) => item !== preferred).forEach((item) => {
      skipped.push({ folder: item.folder, reason: 'Este destino admite una portada; se eligió otra imagen.' })
    })
  }

  for (const [artistName, group] of profileGroups) {
    group.sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true }) || a.url.localeCompare(b.url))
    const used = new Set()
    for (const item of group) {
      const number = /(?:artista_img|perfil|profile)[-_\s]?(\d+)$/i.exec(item.label)?.[1]
      if (number && Number(number) > 0 && !used.has(Number(number))) {
        item.position = Number(number)
        used.add(item.position)
      }
    }
    let nextPosition = 1
    for (const item of group) {
      if (!item.position) {
        while (used.has(nextPosition)) nextPosition += 1
        item.position = nextPosition
        used.add(nextPosition)
      }
      candidates.push({ ...item, kind: 'profile', artistName })
    }
  }

  return { candidates, skipped }
}

async function syncCloudinaryImages(database, candidates) {
  const skipped = []
  let linked = 0
  for (const candidate of candidates) {
    const artist = await database.artist.findFirst({ where: { name: candidate.artistName } })
    if (!artist) {
      skipped.push({ folder: candidate.folder, reason: 'Artista todavía no catalogado.' })
      continue
    }
    if (candidate.kind === 'profile') {
      await database.artistProfileImage.upsert({
        where: { artistId_position: { artistId: artist.id, position: candidate.position } },
        update: { url: candidate.url },
        create: { artistId: artist.id, position: candidate.position, url: candidate.url },
      })
      linked += 1
      continue
    }

    let relation = { artistId: artist.id }
    if (candidate.kind === 'album') {
      const album = await database.album.findFirst({
        where: {
          title: candidate.albumTitle,
          artists: { some: { artistId: artist.id } },
        },
      })
      if (!album) {
        skipped.push({ folder: candidate.folder, reason: 'Álbum todavía no catalogado.' })
        continue
      }
      relation = { albumId: album.id }
    }
    await database.image.upsert({
      where: relation,
      update: { url: candidate.url },
      create: { ...relation, url: candidate.url },
    })
    linked += 1
  }
  return { linked, skipped }
}

async function main() {
  const apply = process.argv.includes('--apply')
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.cloudinary'), quiet: true, override: true })
  const config = getCloudinaryConfig()
  const assets = await listCloudinaryImages(config)
  const { candidates, skipped } = buildImageCandidates(assets, config)
  console.log(`Cloudinary: ${assets.length} imágenes en Artistas/. ${candidates.length} listas para vincular.`)
  console.table(candidates.slice(0, 30).map((item) => ({
    artista: item.artistName,
    album: item.albumTitle || '',
    tipo: item.kind,
    posición: item.position || '',
  })))
  skipped.forEach((item) => console.warn(`Omitida en ${item.folder}: ${item.reason}`))
  if (!apply) {
    console.log('Vista previa solamente. Ejecuta music:cloudinary:apply para actualizar PostgreSQL.')
    return
  }
  if (!candidates.length) throw new Error('No hay imágenes válidas de Cloudinary para vincular.')

  const { PrismaClient } = require('@prisma/client')
  const database = new PrismaClient()
  try {
    const result = await syncCloudinaryImages(database, candidates)
    console.log(`Imágenes vinculadas: ${result.linked}/${candidates.length}.`)
    result.skipped.forEach((item) => console.warn(`Omitida en ${item.folder}: ${item.reason}`))
  } finally {
    await database.$disconnect()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`No se pudo sincronizar Cloudinary: ${error.message}`)
    process.exitCode = 1
  })
}

module.exports = { buildImageCandidates, listCloudinaryImages, syncCloudinaryImages }
