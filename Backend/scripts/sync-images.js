const crypto = require('node:crypto')
const { execFile } = require('node:child_process')
const fs = require('node:fs/promises')
const path = require('node:path')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)
const imageDirectory = path.join(__dirname, '..', 'storage', 'catalog-images')
const supportedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const maxImageBytes = 10 * 1024 * 1024

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

function parseRemoteImagePath(relativePath) {
  const normalizedPath = String(relativePath || '').replaceAll('\\', '/')
  const parts = normalizedPath.split('/').map((part) => part.trim()).filter(Boolean)
  const artistMarker = parts.findIndex((part) => part.toLocaleLowerCase('es') === 'artistas')
  const artistName = parts[artistMarker + 1]
  const extension = path.extname(parts.at(-1) || '').toLocaleLowerCase('es')

  if (artistMarker < 0 || !artistName || !supportedExtensions.has(extension)) return null

  const category = parts[artistMarker + 2]?.toLocaleLowerCase('es')
  const fileName = parts.at(-1).toLocaleLowerCase('es')
  const profileMatch = /^artista_img(\d+)$/.exec(path.basename(fileName, extension))

  if (category === 'perfil' && profileMatch) {
    return {
      kind: 'profile',
      artistName,
      position: Number(profileMatch[1]),
      extension,
      relativePath: normalizedPath,
    }
  }

  if (['albums', 'singles', 'eps'].includes(category) && parts[artistMarker + 3] && fileName.startsWith('cover')) {
    return {
      kind: 'album',
      artistName,
      albumTitle: parts[artistMarker + 3],
      extension,
      relativePath: normalizedPath,
    }
  }

  if (fileName.startsWith('artist') && parts.length === artistMarker + 3) {
    return { kind: 'artist', artistName, extension, relativePath: normalizedPath }
  }

  return null
}

async function listRemoteImageFiles(ssh) {
  const remoteCommand = `find ${shellQuote(ssh.root)} -type f \\( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' \\) -printf '%s\\t%P\\0'`
  const { stdout } = await execFileAsync('ssh', [
    '-i', ssh.keyPath,
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=15',
    `${ssh.user}@${ssh.host}`,
    remoteCommand,
  ], { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 })

  return stdout.toString('utf8').split('\0').filter(Boolean).map((record) => {
    const separator = record.indexOf('\t')
    return {
      size: Number(record.slice(0, separator)),
      relativePath: record.slice(separator + 1),
    }
  })
}

async function cacheRemoteImage(ssh, candidate) {
  if (!Number.isFinite(candidate.size) || candidate.size < 1 || candidate.size > maxImageBytes) {
    throw new Error(`Imagen inválida o demasiado grande: ${candidate.relativePath}`)
  }

  const remotePath = path.posix.join(ssh.root, candidate.relativePath)
  const { stdout } = await execFileAsync('ssh', [
    '-i', ssh.keyPath,
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=15',
    `${ssh.user}@${ssh.host}`,
    `cat -- ${shellQuote(remotePath)}`,
  ], { encoding: 'buffer', maxBuffer: maxImageBytes })

  const hash = crypto.createHash('sha1').update(stdout).digest('hex')
  const cacheName = `${hash}${candidate.extension}`
  await fs.mkdir(imageDirectory, { recursive: true })
  await fs.writeFile(path.join(imageDirectory, cacheName), stdout)
  return cacheName
}

async function syncRemoteImages(database, ssh, remoteFiles) {
  const candidates = remoteFiles
    .map((file) => ({ ...file, ...parseRemoteImagePath(file.relativePath) }))
    .filter((candidate) => candidate.kind)
  const skipped = []
  let linked = 0

  for (const candidate of candidates) {
    const target = candidate.kind === 'album'
      ? await database.album.findFirst({
          where: {
            title: candidate.albumTitle,
            artists: { some: { artist: { name: candidate.artistName } } },
          },
        })
      : await database.artist.findFirst({ where: { name: candidate.artistName } })

    if (!target) {
      skipped.push(candidate.relativePath)
      continue
    }

    const cacheName = await cacheRemoteImage(ssh, candidate)
    if (candidate.kind === 'profile') {
      await database.artistProfileImage.upsert({
        where: { artistId_position: { artistId: target.id, position: candidate.position } },
        update: { url: `catalog-image:${cacheName}` },
        create: { artistId: target.id, position: candidate.position, url: `catalog-image:${cacheName}` },
      })
      linked += 1
      continue
    }

    const relation = candidate.kind === 'album' ? { albumId: target.id } : { artistId: target.id }
    await database.image.upsert({
      where: relation,
      update: { url: `catalog-image:${cacheName}` },
      create: { ...relation, url: `catalog-image:${cacheName}` },
    })
    linked += 1
  }

  return { found: remoteFiles.length, linked, skipped }
}

module.exports = { imageDirectory, listRemoteImageFiles, parseRemoteImagePath, syncRemoteImages }
