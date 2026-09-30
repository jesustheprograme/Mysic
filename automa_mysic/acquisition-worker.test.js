const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { createWorker, safeFileName, validateUrls } = require('./acquisition-worker')

test('valida protocolos y dominios permitidos', () => {
  const hosts = new Set(['music.youtube.com'])
  assert.deepEqual(validateUrls(['https://music.youtube.com/watch?v=abc'], hosts), ['https://music.youtube.com/watch?v=abc'])
  assert.throws(() => validateUrls(['file:///secret'], hosts), /Protocolo no permitido|Dominio no permitido/)
  assert.throws(() => validateUrls(['https://example.com/song'], hosts), /Dominio no permitido/)
})

test('normaliza nombres de Windows sin eliminar Unicode', () => {
  assert.equal(safeFileName('01 - 唱: Ado?.mp3'), '01 - 唱_ Ado_.mp3')
})

test('descubre el nombre Unicode real aunque stdout esté dañado', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mysic-worker-unicode-'))
  const inboxRoot = path.join(root, 'inbox')
  const registered = []
  const fakeRun = async (command, args) => {
    if (command === 'ffprobe') return { code: 0, stdout: JSON.stringify({ format: { duration: '10' } }), stderr: '' }
    const workDir = args[args.indexOf('--paths') + 1]
    const target = path.join(workDir, '008 - Amanhã [track].mp3')
    await fs.writeFile(target, 'audio')
    return { code: 0, stdout: `${path.join(workDir, '008 - Amanh� [track].mp3')}\n`, stderr: '' }
  }
  const worker = createWorker({
    dataRoot: path.join(root, 'data'),
    inboxRoot,
    token: 'test',
    runProcess: fakeRun,
    addEntries: async (entries) => { registered.push(...entries) },
  })
  await worker.initialize()
  const job = await worker.createJob({ urls: ['https://music.youtube.com/watch?v=unicode'], rightsConfirmed: true })
  for (let attempt = 0; attempt < 100 && worker.getJob(job.id).status !== 'completed'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.equal(worker.getJob(job.id).status, 'completed')
  assert.equal(registered[0].file, '008 - Amanhã [track].mp3')
})

test('exige confirmación de derechos antes de crear el trabajo', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mysic-worker-'))
  const worker = createWorker({ dataRoot: path.join(root, 'data'), inboxRoot: path.join(root, 'inbox'), token: 'test' })
  await worker.initialize()
  await assert.rejects(worker.createJob({ urls: ['https://music.youtube.com/watch?v=abc'] }), /confirmar/)
})

test('considera completado un enlace cuyas pistas ya están en el historial', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mysic-worker-duplicate-'))
  const worker = createWorker({
    dataRoot: path.join(root, 'data'),
    inboxRoot: path.join(root, 'inbox'),
    token: 'test',
    runProcess: async () => ({ code: 0, stdout: '', stderr: '' }),
    addEntries: async () => {},
  })
  await worker.initialize()
  const job = await worker.createJob({ urls: ['https://music.youtube.com/watch?v=duplicate'], rightsConfirmed: true })
  for (let attempt = 0; attempt < 100 && worker.getJob(job.id).status !== 'completed'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.equal(worker.getJob(job.id).status, 'completed')
  assert.equal(worker.getJob(job.id).results[0].status, 'skipped')
  assert.equal(worker.getJob(job.id).errors.length, 0)
})

test('procesa trabajos en serie y registra el MP3 como pendiente', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mysic-worker-'))
  const dataRoot = path.join(root, 'data')
  const inboxRoot = path.join(root, 'inbox')
  const active = []
  let simultaneous = 0
  let maximum = 0
  const registered = []

  const fakeRun = async (command, args) => {
    if (args.includes('--version') || args.includes('-version')) return { code: 0, stdout: 'ok', stderr: '' }
    if (command === 'ffprobe') return { code: 0, stdout: JSON.stringify({ format: { duration: '42.5' } }), stderr: '' }
    assert.ok(args.includes('%(playlist_index|)02d - %(title).180B [%(id)s].%(ext)s'))
    simultaneous += 1
    maximum = Math.max(maximum, simultaneous)
    const outputIndex = args.indexOf('--paths')
    const trackNumber = String(active.length + 1).padStart(2, '0')
    const target = path.join(args[outputIndex + 1], `${trackNumber} - canción [id-${trackNumber}].mp3`)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, `audio-${active.length}`)
    active.push(target)
    await new Promise((resolve) => setTimeout(resolve, 20))
    simultaneous -= 1
    return { code: 0, stdout: `${target}\n`, stderr: '' }
  }

  const worker = createWorker({
    dataRoot,
    inboxRoot,
    token: 'test',
    ytDlpPath: 'yt-dlp',
    ffmpegPath: 'ffmpeg',
    ffprobePath: 'ffprobe',
    runProcess: fakeRun,
    addEntries: async (entries) => { registered.push(...entries) },
  })
  await worker.initialize()
  const first = await worker.createJob({ urls: ['https://music.youtube.com/watch?v=one'], rightsConfirmed: true })
  const second = await worker.createJob({ urls: ['https://music.youtube.com/watch?v=two'], rightsConfirmed: true })

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (['completed', 'failed'].includes(worker.getJob(first.id).status) && ['completed', 'failed'].includes(worker.getJob(second.id).status)) break
    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  assert.equal(maximum, 1)
  assert.equal(worker.getJob(first.id).status, 'completed')
  assert.equal(worker.getJob(second.id).status, 'completed')
  assert.equal(registered.length, 2)
})

test('recupera un trabajo que estaba ejecutándose antes del reinicio', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mysic-worker-restart-'))
  const dataRoot = path.join(root, 'data')
  const inboxRoot = path.join(root, 'inbox')
  const jobId = '11111111-1111-4111-8111-111111111111'
  await fs.mkdir(dataRoot, { recursive: true })
  await fs.writeFile(path.join(dataRoot, 'jobs.json'), JSON.stringify({ jobs: [{
    id: jobId,
    urls: ['https://music.youtube.com/watch?v=restart'],
    status: 'running',
    progress: { total: 1, current: 1, completed: 0 },
    currentUrl: null,
    results: [],
    errors: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }] }))

  const fakeRun = async (command, args) => {
    if (command === 'ffprobe') return { code: 0, stdout: JSON.stringify({ format: { duration: '10' } }), stderr: '' }
    const target = path.join(args[args.indexOf('--paths') + 1], '01 - reinicio [id].mp3')
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, 'audio')
    return { code: 0, stdout: `${target}\n`, stderr: '' }
  }
  const worker = createWorker({ dataRoot, inboxRoot, token: 'test', runProcess: fakeRun, addEntries: async () => {} })
  await worker.initialize()
  for (let attempt = 0; attempt < 100 && worker.getJob(jobId).status !== 'completed'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.equal(worker.getJob(jobId).status, 'completed')
})

test('protege incluso el endpoint de salud con el token del worker', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mysic-worker-http-'))
  const fakeRun = async () => ({ code: 0, stdout: 'ok', stderr: '' })
  const worker = createWorker({ dataRoot: path.join(root, 'data'), inboxRoot: path.join(root, 'inbox'), token: 'secret', runProcess: fakeRun })
  await worker.initialize()
  const server = await worker.listen(0)
  const port = server.address().port
  try {
    const unauthorized = await fetch(`http://127.0.0.1:${port}/health`)
    assert.equal(unauthorized.status, 401)
    const authorized = await fetch(`http://127.0.0.1:${port}/health`, { headers: { authorization: 'Bearer secret' } })
    assert.equal(authorized.status, 200)
    assert.equal((await authorized.json()).ok, true)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
