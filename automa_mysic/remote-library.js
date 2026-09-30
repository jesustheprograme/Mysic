const crypto = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')

const { buildRelativeDestination } = require('./import-music')

function getSshConfig(env = process.env, required = true) {
  const host = env.MUSIC_SSH_HOST?.trim()
  const user = env.MUSIC_SSH_USER?.trim()
  const keyPath = env.MUSIC_SSH_KEY_PATH?.trim()
  const root = env.MUSIC_SSH_ROOT?.trim() || '/music'

  if (!host || !user || !keyPath) {
    if (!required) return null
    throw new Error('Configura MUSIC_SSH_HOST, MUSIC_SSH_USER y MUSIC_SSH_KEY_PATH en Backend/.env.')
  }
  if (!/^[a-z0-9.-]+$/i.test(host)) throw new Error('MUSIC_SSH_HOST no es válido.')
  if (!/^[a-z0-9._-]+$/i.test(user)) throw new Error('MUSIC_SSH_USER no es válido.')
  if (!root.startsWith('/') || /[\r\n]/.test(root)) throw new Error('MUSIC_SSH_ROOT no es válido.')

  return { host, user, keyPath: path.resolve(keyPath), root: root.replace(/\/$/, '') || '/' }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`
}

function remoteDestination(ssh, entry) {
  return path.posix.join(ssh.root, buildRelativeDestination(entry))
}

function sshArguments(ssh, command) {
  return [
    '-i', ssh.keyPath,
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=15',
    `${ssh.user}@${ssh.host}`,
    command,
  ]
}

async function executeSsh(ssh, command) {
  const { execFile } = require('node:child_process')
  const { promisify } = require('node:util')
  const { stdout } = await promisify(execFile)('ssh', sshArguments(ssh, command), {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  })
  return stdout
}

async function inspectRemoteDestination(entry, options = {}) {
  const ssh = options.ssh || getSshConfig(options.env)
  const destination = remoteDestination(ssh, entry)
  const directory = path.posix.dirname(destination)
  const command = [
    `if [ -d ${shellQuote(directory)} ]; then printf 'directory=1\\n'; else printf 'directory=0\\n'; fi`,
    `if [ -e ${shellQuote(destination)} ]; then printf 'file=1\\n'; else printf 'file=0\\n'; fi`,
  ].join('; ')
  const output = await (options.executeSsh || executeSsh)(ssh, command)

  return {
    destination,
    relativeDestination: buildRelativeDestination(entry),
    directoryExists: /(?:^|\n)directory=1(?:\n|$)/.test(output),
    fileExists: /(?:^|\n)file=1(?:\n|$)/.test(output),
  }
}

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256')
  await new Promise((resolve, reject) => {
    const input = fs.createReadStream(filePath)
    input.on('error', reject)
    input.on('data', (chunk) => hash.update(chunk))
    input.on('end', resolve)
  })
  return hash.digest('hex')
}

async function streamFileOverSsh(localFile, ssh, command) {
  await new Promise((resolve, reject) => {
    const child = spawn('ssh', sshArguments(ssh, command), { stdio: ['pipe', 'ignore', 'pipe'] })
    const input = fs.createReadStream(localFile)
    let stderr = ''

    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    input.on('error', (error) => {
      child.stdin.destroy(error)
      reject(error)
    })
    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') reject(error)
    })
    child.on('close', (code) => {
      if (code === 0) return resolve()
      if (code === 73) return reject(new Error('El archivo ya existe en el servidor; no se sobrescribió.'))
      reject(new Error(stderr.trim() || `La subida SSH terminó con código ${code}.`))
    })
    input.pipe(child.stdin)
  })
}

async function uploadRemoteFile(localFile, entry, options = {}) {
  const ssh = options.ssh || getSshConfig(options.env)
  const stats = await fsp.stat(localFile).catch(() => null)
  if (!stats?.isFile()) throw new Error(`No existe el MP3 preparado: ${localFile}`)

  const destination = remoteDestination(ssh, entry)
  const directory = path.posix.dirname(destination)
  const temporary = `${destination}.upload-${process.pid}-${Date.now()}.part`
  const expectedHash = await (options.hashFile || hashFile)(localFile)
  const command = [
    'set -eu',
    `if [ -e ${shellQuote(destination)} ]; then exit 73; fi`,
    `mkdir -p -- ${shellQuote(directory)}`,
    `trap ${shellQuote(`rm -f -- ${shellQuote(temporary)}`)} 0 1 2 15`,
    `cat > ${shellQuote(temporary)}`,
    `actual_hash=$(sha256sum -- ${shellQuote(temporary)} | cut -d ' ' -f 1)`,
    `[ "$actual_hash" = ${shellQuote(expectedHash)} ]`,
    `mv -- ${shellQuote(temporary)} ${shellQuote(destination)}`,
    'trap - 0 1 2 15',
  ].join('; ')

  await (options.streamFile || streamFileOverSsh)(localFile, ssh, command)
  return {
    destination,
    relativeDestination: buildRelativeDestination(entry),
    size: stats.size,
    sha256: expectedHash,
  }
}

module.exports = {
  getSshConfig,
  inspectRemoteDestination,
  remoteDestination,
  shellQuote,
  uploadRemoteFile,
}
