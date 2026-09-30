const path = require('node:path')

require('dotenv').config({ path: path.join(__dirname, '..', 'Backend', '.env'), quiet: true })
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true, override: true })

const { createWorker } = require('./acquisition-worker')

async function main() {
  const jobId = process.argv[2]
  if (!jobId) throw new Error('Indica el ID del trabajo que se debe recuperar.')
  const worker = createWorker()
  await worker.initialize()
  console.log(JSON.stringify(await worker.recoverJobFiles(jobId), null, 2))
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
