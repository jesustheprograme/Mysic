const path = require('node:path')
const { PrismaClient } = require('@prisma/client')
const releaseDates = require('../catalog/release-dates.json')

require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
  quiet: true,
})

async function main() {
  const prisma = new PrismaClient()
  let updated = 0

  try {
    for (const [artistName, releases] of Object.entries(releaseDates)) {
      for (const [title, releaseDate] of Object.entries(releases)) {
        const result = await prisma.album.updateMany({
          where: {
            title,
            artists: { some: { artist: { name: artistName } } },
          },
          data: { releaseDate: new Date(releaseDate) },
        })
        updated += result.count
      }
    }
  } finally {
    await prisma.$disconnect()
  }

  console.log(`Fechas actualizadas: ${updated}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
