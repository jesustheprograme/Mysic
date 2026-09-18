const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function connectPrisma() {
  await prisma.$connect()
}

async function closePrisma() {
  await prisma.$disconnect()
}

module.exports = { closePrisma, connectPrisma, prisma }
