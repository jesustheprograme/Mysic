const fs = require('node:fs/promises')
const path = require('node:path')
const { fileURLToPath } = require('node:url')
const backendRoot = path.join(__dirname, '..')
require('dotenv').config({ path: path.join(backendRoot, 'private', 'mongodb.env'), quiet: true })
require('dotenv').config({ path: path.join(backendRoot, '.env'), override: true, quiet: true })
const { getConfig } = require('../src/config')
const { uploadAudioObject } = require('../src/object-storage')
const { closePrisma, connectPrisma, prisma } = require('../src/prisma')

const apply = process.argv.includes('--apply')

function safeObjectName(fileName) {
  return fileName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function main() {
  const config = getConfig()
  if (!config.musicLibraryPath) throw new Error('MUSIC_LIBRARY_PATH no está configurada.')
  await connectPrisma()

  const assets = await prisma.mediaAsset.findMany({
    where: { type: 'audio', url: { startsWith: 'file:' } },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`${assets.length} archivos locales encontrados. Modo: ${apply ? 'APLICAR' : 'VISTA PREVIA'}.`)
  for (const asset of assets) {
    const filePath = fileURLToPath(asset.url)
    const stats = await fs.stat(filePath)
    const objectKey = `audio/${asset.songId}/${safeObjectName(path.basename(filePath))}`
    console.log(`${filePath} -> r2:${objectKey}`)
    if (!apply) continue

    await uploadAudioObject(config, {
      contentLength: stats.size,
      contentType: asset.mimeType,
      filePath,
      key: objectKey,
    })
    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { url: `r2:${objectKey}` },
    })
  }
}

main()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(closePrisma)
