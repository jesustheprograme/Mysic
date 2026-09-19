const fs = require('node:fs/promises')
const path = require('node:path')

const { buildDestination } = require('./import-music')

function writeId3Tags(filePath, tags) {
  const NodeID3 = require('node-id3')
  const id3Tags = {
    title: tags.title,
    artist: tags.artist,
    album: tags.album,
    year: tags.year ? String(tags.year) : undefined,
    genre: tags.genres?.join('; '),
    trackNumber: tags.trackNumber ? String(tags.trackNumber) : undefined,
  }
  if (tags.coverBuffer) {
    id3Tags.image = {
      mime: tags.coverMime || 'image/jpeg',
      type: { id: 3, name: 'front cover' },
      description: 'Portada del album',
      imageBuffer: tags.coverBuffer,
    }
  }
  if (!NodeID3.update(id3Tags, filePath)) throw new Error(`No se pudieron escribir las etiquetas: ${filePath}`)
}

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

async function defaultDownloadCover(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`No se pudo descargar la portada (HTTP ${response.status}).`)
  return Buffer.from(await response.arrayBuffer())
}

async function processEntry(entry, dependencies) {
  const {
    inboxRoot,
    libraryRoot,
    cover,
    hasEmbeddedCover = async () => false,
    writeTags = writeId3Tags,
    downloadCover = defaultDownloadCover,
  } = dependencies

  const source = path.resolve(inboxRoot, entry.file)
  const destination = path.resolve(buildDestination(libraryRoot, entry))
  if (!isInside(inboxRoot, source)) throw new Error('El MP3 debe estar dentro de asignar_metadatos.')
  if (!isInside(libraryRoot, destination)) throw new Error('El destino debe estar dentro de la biblioteca musical.')

  const sourceStats = await fs.stat(source).catch(() => null)
  if (!sourceStats?.isFile()) throw new Error(`No existe el MP3: ${entry.file}`)
  if (await fs.stat(destination).catch(() => null)) throw new Error(`El destino ya existe: ${destination}`)

  await fs.mkdir(path.dirname(destination), { recursive: true })
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`
  try {
    await fs.copyFile(source, temporary)
    const alreadyHasCover = await hasEmbeddedCover(temporary)
    const coverBuffer = !alreadyHasCover && cover?.secure_url
      ? await downloadCover(cover.secure_url)
      : null
    await writeTags(temporary, {
      title: entry.title,
      artist: entry.artist,
      album: entry.releaseName,
      year: entry.year,
      genres: entry.genres,
      trackNumber: entry.trackNumber,
      coverBuffer,
      coverMime: cover?.format ? `image/${cover.format === 'jpg' ? 'jpeg' : cover.format}` : null,
      coverUrl: cover?.secure_url || null,
    })
    await fs.rename(temporary, destination)
    await fs.unlink(source)
    return { status: 'processed', source, destination, coverUrl: cover?.secure_url || null }
  } catch (error) {
    await fs.rm(temporary, { force: true })
    throw error
  }
}

module.exports = { processEntry, writeId3Tags }
