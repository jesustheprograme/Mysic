const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const http = require('node:http')
const path = require('node:path')
const { spawn } = require('node:child_process')

const { addEntries } = require('./ui-state')
const { appendErrorLog } = require('./error-log')

const TERMINAL_STATUSES = new Set(['completed', 'completed_with_errors', 'failed', 'cancelled'])
const DEFAULT_ALLOWED_HOSTS = ['youtube.com', 'www.youtube.com', 'music.youtube.com', 'youtu.be']

function loadConfiguration() {
  require('dotenv').config({ path: path.join(__dirname, '..', 'Backend', '.env'), quiet: true })
  require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true, override: true })
}

function cleanHosts(value) {
  const source = value ? String(value).split(',') : DEFAULT_ALLOWED_HOSTS
  return new Set(source.map((host) => host.trim().toLowerCase()).filter(Boolean))
}

function validateUrls(urls, allowedHosts) {
  if (!Array.isArray(urls) || urls.length === 0) throw new Error('Debes enviar al menos una URL.')
  if (urls.length > 20) throw new Error('Se permiten como máximo 20 URLs por trabajo.')

  return urls.map((raw) => {
    let parsed
    try {
      parsed = new URL(String(raw).trim())
    } catch {
      throw new Error(`URL no válida: ${raw}`)
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`Protocolo no permitido: ${parsed.protocol}`)
    if (!allowedHosts.has(parsed.hostname.toLowerCase())) throw new Error(`Dominio no permitido: ${parsed.hostname}`)
    return parsed.toString()
  })
}

function safeFileName(fileName) {
  const extension = path.extname(fileName).toLowerCase() === '.mp3' ? '.mp3' : ''
  const stem = path.basename(fileName, path.extname(fileName))
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 180)
  return `${stem || 'audio'}${extension || '.mp3'}`
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    options.onChild?.(child)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-1024 * 1024) })
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-1024 * 1024) })
    child.on('error', reject)
    child.on('exit', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
}

async function sha256(filePath) {
  const content = await fs.readFile(filePath)
  return crypto.createHash('sha256').update(content).digest('hex')
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await fs.rename(temporary, filePath)
}

async function uniqueDestination(inboxRoot, fileName) {
  const parsed = path.parse(safeFileName(fileName))
  let counter = 0
  while (true) {
    const suffix = counter ? ` (${counter})` : ''
    const candidate = path.join(inboxRoot, `${parsed.name}${suffix}${parsed.ext}`)
    try {
      await fs.access(candidate)
      counter += 1
    } catch {
      return candidate
    }
  }
}

async function listMp3Files(root) {
  const files = []
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(fullPath)
      else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.mp3') files.push(fullPath)
    }
  }
  await visit(root)
  return files.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
}

function sourceId(fileName) {
  return String(fileName || '').match(/\[([^\]]+)\]\.mp3$/i)?.[1] || null
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    currentUrl: job.currentUrl,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    results: job.results,
    errors: job.errors,
  }
}

function persistedJob(job) {
  return { ...publicJob(job), urls: job.urls }
}

function createWorker(options = {}) {
  const dataRoot = options.dataRoot || path.join(__dirname, 'acquisition-data')
  const inboxRoot = options.inboxRoot || path.join(__dirname, 'asignar_metadatos')
  const jobsPath = path.join(dataRoot, 'jobs.json')
  const indexPath = path.join(inboxRoot, '.acquisition-index.json')
  const archivePath = path.join(dataRoot, 'download-archive.txt')
  const allowedHosts = cleanHosts(options.allowedHosts || process.env.ACQUISITION_ALLOWED_HOSTS)
  const token = options.token || process.env.ACQUISITION_WORKER_TOKEN
  const ytDlpPath = options.ytDlpPath || process.env.YT_DLP_PATH || 'yt-dlp'
  const ffmpegPath = options.ffmpegPath || process.env.FFMPEG_PATH || 'ffmpeg'
  const ffprobePath = options.ffprobePath || process.env.FFPROBE_PATH || 'ffprobe'
  const execute = options.runProcess || runProcess
  const registerEntries = options.addEntries || addEntries
  const jobs = new Map()
  let activeJobId = null
  let persistChain = Promise.resolve()

  async function persistJobs() {
    const snapshot = { jobs: [...jobs.values()].map(persistedJob) }
    persistChain = persistChain.then(() => writeJsonAtomic(jobsPath, snapshot))
    await persistChain
  }

  async function initialize() {
    await fs.mkdir(inboxRoot, { recursive: true })
    await fs.mkdir(dataRoot, { recursive: true })
    const stored = await readJson(jobsPath, { jobs: [] })
    for (const raw of stored.jobs || []) {
      const status = raw.status === 'running' ? 'queued' : raw.status
      jobs.set(raw.id, { ...raw, status, child: null, cancelRequested: false })
    }
    await persistJobs()
    queueMicrotask(processQueue)
  }

  async function checkCommand(command, args) {
    try {
      const result = await execute(command, args)
      return { ok: result.code === 0, detail: result.code === 0 ? null : (result.stderr || result.stdout).trim() }
    } catch (error) {
      return { ok: false, detail: error.message }
    }
  }

  async function health() {
    const [ytDlp, ffmpeg, ffprobe] = await Promise.all([
      checkCommand(ytDlpPath, ['--version']),
      checkCommand(ffmpegPath, ['-version']),
      checkCommand(ffprobePath, ['-version']),
    ])
    let inbox = { ok: true, detail: null }
    try {
      await fs.access(inboxRoot)
    } catch (error) {
      inbox = { ok: false, detail: error.message }
    }
    const ok = ytDlp.ok && ffmpeg.ok && ffprobe.ok && inbox.ok
    return { ok, node: process.version, ytDlp, ffmpeg, ffprobe, inbox }
  }

  async function validateAudio(filePath) {
    const result = await execute(ffprobePath, [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', filePath,
    ])
    if (result.code !== 0) throw new Error((result.stderr || 'FFprobe rechazó el archivo.').trim())
    const duration = Number(JSON.parse(result.stdout).format?.duration)
    const stats = await fs.stat(filePath)
    if (!Number.isFinite(duration) || duration <= 0 || stats.size === 0) throw new Error('El MP3 generado está vacío o no tiene duración válida.')
    return { duration, size: stats.size }
  }

  async function stageFile(filePath, job) {
    const audio = await validateAudio(filePath)
    const hash = await sha256(filePath)
    const index = await readJson(indexPath, { hashes: {} })
    if (index.hashes?.[hash]) {
      await fs.rm(filePath, { force: true })
      return { status: 'skipped', reason: 'Audio duplicado por SHA-256.', duplicateOf: index.hashes[hash], hash }
    }

    const destination = await uniqueDestination(inboxRoot, path.basename(filePath))
    await fs.rename(filePath, destination)
    const file = path.basename(destination)
    try {
      await registerEntries([{ file }])
      index.hashes = { ...(index.hashes || {}), [hash]: file }
      await writeJsonAtomic(indexPath, index)
      return { status: 'staged', file, hash, ...audio }
    } catch (error) {
      await fs.rename(destination, filePath).catch(() => {})
      throw error
    } finally {
      job.updatedAt = new Date().toISOString()
    }
  }

  async function downloadUrl(job, url, urlIndex) {
    const workDir = path.join(dataRoot, 'jobs', job.id, String(urlIndex + 1))
    await fs.mkdir(workDir, { recursive: true })
    const args = [
      '--no-config',
      '--ignore-errors',
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '192K',
      '--embed-metadata',
      '--ffmpeg-location', ffmpegPath,
      '--windows-filenames',
      '--download-archive', archivePath,
      '--paths', workDir,
      '--output', '%(playlist_index|)02d - %(title).180B [%(id)s].%(ext)s',
      '--print', 'after_move:%(filepath)s',
      url,
    ]
    const result = await execute(ytDlpPath, args, {
      cwd: workDir,
      onChild(child) { job.child = child },
    })
    job.child = null
    if (job.cancelRequested) return

    if (result.code !== 0) {
      await fs.writeFile(
        path.join(workDir, 'yt-dlp.log'),
        `STDOUT\n${result.stdout}\n\nSTDERR\n${result.stderr}\n`,
        'utf8',
      )
      await appendErrorLog('acquisition-worker.yt-dlp', new Error('yt-dlp terminó con error.'), {
        jobId: job.id,
        url,
        exitCode: result.code,
        signal: result.signal,
        stderr: result.stderr.slice(-4000),
      }).catch(() => {})
    }

    // La salida de Python puede usar una página de códigos distinta a UTF-8 en Windows.
    // Enumerar el directorio conserva los nombres Unicode reales del sistema de archivos.
    const candidates = await listMp3Files(workDir)
    for (const candidate of candidates) {
      try {
        job.results.push(await stageFile(candidate, job))
      } catch (error) {
        job.errors.push({ url, file: path.basename(candidate), message: error.message })
        await appendErrorLog('acquisition-worker.stage', error, {
          jobId: job.id,
          url,
          file: path.basename(candidate),
        }).catch(() => {})
      }
    }
    if (result.code === 0 && candidates.length === 0) {
      job.results.push({
        status: 'skipped',
        reason: 'No hay MP3 nuevos; las pistas ya figuran en el historial de adquisición.',
        url,
      })
    } else if (result.code !== 0) {
      job.errors.push({ url, message: (result.stderr || 'No se generó ningún MP3.').trim().slice(-4000) })
    }
  }

  async function runJob(job) {
    job.status = 'running'
    job.updatedAt = new Date().toISOString()
    await persistJobs()
    for (let index = 0; index < job.urls.length; index += 1) {
      if (job.cancelRequested) break
      job.currentUrl = job.urls[index]
      job.progress.current = index + 1
      await persistJobs()
      await downloadUrl(job, job.urls[index], index)
      job.progress.completed = index + 1
      await persistJobs()
    }

    job.currentUrl = null
    if (job.cancelRequested) job.status = 'cancelled'
    else if (job.results.some((item) => item.status === 'staged') && job.errors.length) job.status = 'completed_with_errors'
    else if (job.errors.length) job.status = 'failed'
    else job.status = 'completed'
    job.updatedAt = new Date().toISOString()
    await persistJobs()
    if (job.status === 'completed' || job.status === 'cancelled') {
      await fs.rm(path.join(dataRoot, 'jobs', job.id), { recursive: true, force: true }).catch(() => {})
    }
  }

  async function processQueue() {
    if (activeJobId) return
    const next = [...jobs.values()].find((job) => job.status === 'queued')
    if (!next) return
    activeJobId = next.id
    try {
      await runJob(next)
    } catch (error) {
      next.status = next.cancelRequested ? 'cancelled' : 'failed'
      next.errors.push({ message: error.message })
      next.currentUrl = null
      next.updatedAt = new Date().toISOString()
      await persistJobs()
      await appendErrorLog('acquisition-worker.job', error, { jobId: next.id }).catch(() => {})
    } finally {
      activeJobId = null
      queueMicrotask(processQueue)
    }
  }

  async function recoverJobFiles(id) {
    const job = jobs.get(id)
    if (!job) throw new Error('Trabajo no encontrado.')
    const jobRoot = path.join(dataRoot, 'jobs', job.id)
    const candidates = await listMp3Files(jobRoot)
    const recoveredIds = new Set()

    for (const candidate of candidates) {
      const result = await stageFile(candidate, job)
      job.results.push(result)
      const idFromFile = sourceId(result.file || path.basename(candidate))
      if (idFromFile) recoveredIds.add(idFromFile)
    }

    job.errors = job.errors.filter((error) => {
      const idFromError = sourceId(error.file)
      return !idFromError || !recoveredIds.has(idFromError)
    })
    job.status = job.errors.length ? 'completed_with_errors' : 'completed'
    job.currentUrl = null
    job.updatedAt = new Date().toISOString()
    await persistJobs()
    if (job.status === 'completed') await fs.rm(jobRoot, { recursive: true, force: true })
    return publicJob(job)
  }

  async function createJob(payload) {
    if (payload?.rightsConfirmed !== true) throw new Error('Debes confirmar que el contenido es propio o está autorizado.')
    const urls = validateUrls(payload.urls, allowedHosts)
    const now = new Date().toISOString()
    const job = {
      id: crypto.randomUUID(),
      urls,
      status: 'queued',
      progress: { total: urls.length, current: 0, completed: 0 },
      currentUrl: null,
      results: [],
      errors: [],
      createdAt: now,
      updatedAt: now,
      child: null,
      cancelRequested: false,
    }
    jobs.set(job.id, job)
    await persistJobs()
    queueMicrotask(processQueue)
    return publicJob(job)
  }

  function getJob(id) {
    const job = jobs.get(id)
    return job ? publicJob(job) : null
  }

  async function cancelJob(id) {
    const job = jobs.get(id)
    if (!job) return null
    if (TERMINAL_STATUSES.has(job.status)) throw new Error('El trabajo ya terminó y no puede cancelarse.')
    job.cancelRequested = true
    if (job.status === 'queued') job.status = 'cancelled'
    if (job.child && !job.child.killed) job.child.kill()
    job.updatedAt = new Date().toISOString()
    await persistJobs()
    return publicJob(job)
  }

  function authorized(request) {
    return Boolean(token) && request.headers.authorization === `Bearer ${token}`
  }

  async function readBody(request) {
    let raw = ''
    for await (const chunk of request) {
      raw += chunk
      if (raw.length > 64 * 1024) throw new Error('El cuerpo de la solicitud es demasiado grande.')
    }
    return raw ? JSON.parse(raw) : {}
  }

  function send(response, status, body) {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(body))
  }

  async function handle(request, response) {
    if (!authorized(request)) return send(response, 401, { error: 'No autorizado.' })
    const requestUrl = new URL(request.url, 'http://127.0.0.1')
    try {
      if (request.method === 'GET' && requestUrl.pathname === '/health') return send(response, 200, await health())
      if (request.method === 'POST' && requestUrl.pathname === '/jobs') return send(response, 202, await createJob(await readBody(request)))
      const match = requestUrl.pathname.match(/^\/jobs\/([0-9a-f-]+)(\/cancel)?$/i)
      if (match && request.method === 'GET' && !match[2]) {
        const job = getJob(match[1])
        return job ? send(response, 200, job) : send(response, 404, { error: 'Trabajo no encontrado.' })
      }
      if (match && request.method === 'POST' && match[2]) {
        const job = await cancelJob(match[1])
        return job ? send(response, 200, job) : send(response, 404, { error: 'Trabajo no encontrado.' })
      }
      return send(response, 404, { error: 'Ruta no encontrada.' })
    } catch (error) {
      await appendErrorLog('acquisition-worker.http', error, {
        method: request.method,
        path: requestUrl.pathname,
      }).catch(() => {})
      return send(response, 400, { error: error.message })
    }
  }

  function listen(port = Number(process.env.ACQUISITION_WORKER_PORT) || 4310) {
    if (!token) throw new Error('Falta ACQUISITION_WORKER_TOKEN.')
    const server = http.createServer((request, response) => { handle(request, response) })
    return new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => resolve(server))
    })
  }

  return { initialize, health, createJob, getJob, cancelJob, recoverJobFiles, handle, listen, processQueue }
}

async function main() {
  loadConfiguration()
  const worker = createWorker()
  await worker.initialize()
  const server = await worker.listen()
  console.log(`Mysic acquisition worker listo en http://127.0.0.1:${server.address().port}`)
}

if (require.main === module) main().catch(async (error) => {
  await appendErrorLog('acquisition-worker.startup', error).catch(() => {})
  console.error(`No se pudo iniciar el worker: ${error.message}`)
  process.exitCode = 1
})

module.exports = { createWorker, validateUrls, safeFileName, runProcess, publicJob }
