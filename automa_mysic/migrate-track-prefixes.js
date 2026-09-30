const fs = require('node:fs/promises')
const path = require('node:path')

const ROOT = __dirname
const INBOX = path.join(ROOT, 'asignar_metadatos')

function normalizedName(fileName) {
  return fileName.replace(/^0+(\d+)(\s+-\s+)/, (_match, digits, separator) => (
    `${String(Number(digits)).padStart(2, '0')}${separator}`
  ))
}

function replaceReferences(value, names) {
  if (typeof value === 'string') return names.get(value) || value
  if (Array.isArray(value)) return value.map((item) => replaceReferences(item, names))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    names.get(key) || key,
    replaceReferences(item, names),
  ]))
}

async function updateJson(filePath, names) {
  try {
    const source = JSON.parse(await fs.readFile(filePath, 'utf8'))
    const updated = replaceReferences(source, names)
    const temporary = `${filePath}.${process.pid}.tmp`
    await fs.writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, 'utf8')
    await fs.rename(temporary, filePath)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

async function main() {
  const names = new Map()
  for (const entry of await fs.readdir(INBOX, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.mp3') continue
    const nextName = normalizedName(entry.name)
    if (nextName !== entry.name) names.set(entry.name, nextName)
  }

  for (const [oldName, nextName] of names) {
    const destination = path.join(INBOX, nextName)
    try {
      await fs.access(destination)
      throw new Error(`Ya existe el destino: ${nextName}`)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    await fs.rename(path.join(INBOX, oldName), destination)
  }

  await updateJson(path.join(INBOX, '.ui-state.json'), names)
  await updateJson(path.join(INBOX, '.acquisition-index.json'), names)
  await updateJson(path.join(INBOX, '.state.json'), names)
  await updateJson(path.join(INBOX, 'import.json'), names)
  await updateJson(path.join(ROOT, 'acquisition-data', 'jobs.json'), names)

  console.log(JSON.stringify({ renamed: [...names.entries()] }, null, 2))
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
