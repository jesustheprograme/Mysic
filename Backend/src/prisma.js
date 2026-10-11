const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function connectPrisma() {
  await prisma.$connect()
}

async function closePrisma() {
  await prisma.$disconnect()
}

async function checkPrismaHealth() {
  await prisma.$queryRaw`SELECT 1`
}

module.exports = { checkPrismaHealth, closePrisma, connectPrisma, prisma }
