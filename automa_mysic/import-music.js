const fs = require('node:fs/promises')
const path = require('node:path')

const IMAGE_FORMATS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif'])

function cleanSegment(value, field) {
  const cleaned = String(value || '').trim()
  if (!cleaned || cleaned === '.' || cleaned === '..' || cleaned.includes('/') || cleaned.includes('\\')) {
    throw new Error(`${field} contiene una ruta no válida.`)
  }
  return cleaned
}

function normalizeFolder(value) {
  const folder = String(value || '').trim().replaceAll('\\', '/')
  const parts = folder.split('/').filter(Boolean)
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) {
    throw new Error('cloudinaryFolder contiene una ruta no válida.')
  }
  return parts.join('/')
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Cada importación debe ser un objeto.')

  const file = cleanSegment(raw.file, 'file')
  if (path.extname(file).toLowerCase() !== '.mp3') throw new Error('file debe terminar en .mp3.')
  const kind = String(raw.kind || '').trim().toLowerCase()
  if (!['album', 'single'].includes(kind)) throw new Error('kind debe ser album o single.')

  const trackNumber = Number(raw.trackNumber)
  if (!Number.isInteger(trackNumber) || trackNumber < 1) throw new Error('trackNumber debe ser un entero positivo.')

  const year = raw.year == null || raw.year === '' ? null : Number(raw.year)
  if (year != null && (!Number.isInteger(year) || year < 1 || year > 9999)) throw new Error('year no es válido.')

  const genres = Array.isArray(raw.genres)
    ? [...new Set(raw.genres.map((genre) => String(genre).trim()).filter(Boolean))]
    : []

  return {
    file,
    artist: cleanSegment(raw.artist, 'artist'),
    title: cleanSegment(raw.title, 'title'),
    kind,
    releaseName: cleanSegment(raw.releaseName, 'releaseName'),
    year,
    genres,
    trackNumber,
    cloudinaryFolder: normalizeFolder(raw.cloudinaryFolder),
  }
}

function buildDestination(libraryRoot, entry) {
  const kindFolder = entry.kind === 'album' ? 'Albums' : 'Singles'
  const fileName = `${String(entry.trackNumber).padStart(2, '0')} - ${entry.title}.mp3`
  return path.join(libraryRoot, 'Artistas', entry.artist, kindFolder, entry.releaseName, fileName)
}

function getAssetFolder(asset, folderMode) {
  return folderMode === 'fixed'
    ? path.posix.dirname(asset.public_id || '')
    : asset.asset_folder || ''
}

function isValidImage(asset) {
  return IMAGE_FORMATS.has(String(asset.format || '').toLowerCase())
    && typeof asset.secure_url === 'string'
    && asset.secure_url.startsWith('https://')
}

function selectCoverForFolder(assets, requestedFolder, folderMode = 'dynamic') {
  const folder = normalizeFolder(requestedFolder)
  const matches = assets
    .filter((asset) => getAssetFolder(asset, folderMode) === folder && isValidImage(asset))
    .sort((left, right) => {
      const leftName = String(left.display_name || left.public_id || '')
      const rightName = String(right.display_name || right.public_id || '')
      const leftPreferred = /^(cover|portada)(?:$|[-_\s])/i.test(leftName) ? 0 : 1
      const rightPreferred = /^(cover|portada)(?:$|[-_\s])/i.test(rightName) ? 0 : 1
      return leftPreferred - rightPreferred || leftName.localeCompare(rightName, 'es')
    })

  if (!matches.length) throw new Error(`La carpeta ${folder} no contiene una imagen válida.`)
  return matches[0]
}

async function readManifest(manifestPath) {
  const raw = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  if (!raw || !Array.isArray(raw.imports)) throw new Error('import.json debe contener un arreglo imports.')
  return raw.imports.map(normalizeEntry)
}

module.exports = {
  buildDestination,
  normalizeEntry,
  readManifest,
  selectCoverForFolder,
}
