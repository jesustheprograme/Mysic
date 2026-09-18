const crypto = require('node:crypto')
const { Readable } = require('node:stream')

const API_VERSION = '1.16.1'
const CLIENT_NAME = 'mysic-backend'

function getNavidromeConfig(config) {
  if (!config.navidromeUrl || !config.navidromeUser || !config.navidromePassword) {
    throw new Error('Configura NAVIDROME_URL, NAVIDROME_USER y NAVIDROME_PASSWORD en Backend/.env.')
  }
  return config
}

function createNavidromeUrl(config, endpoint, params = {}) {
  getNavidromeConfig(config)
  const salt = crypto.randomBytes(16).toString('hex')
  const token = crypto.createHash('md5').update(config.navidromePassword + salt).digest('hex')
  const query = new URLSearchParams({
    v: API_VERSION,
    c: CLIENT_NAME,
    f: 'json',
    u: config.navidromeUser,
    t: token,
    s: salt,
    ...params,
  })
  return `${config.navidromeUrl.replace(/\/$/, '')}/rest/${endpoint}.view?${query}`
}

async function navidromeRequest(config, endpoint, params) {
  const response = await fetch(createNavidromeUrl(config, endpoint, params))
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`Navidrome respondió HTTP ${response.status}.`)

  const result = payload?.['subsonic-response']
  if (result?.status !== 'ok') throw new Error(result?.error?.message || 'Navidrome rechazó la solicitud.')
  return result
}

async function proxyNavidromeAudio(config, songId, req, res) {
  const headers = req.headers.range ? { Range: req.headers.range } : undefined
  const response = await fetch(createNavidromeUrl(config, 'stream', { id: songId }), { headers })
  if (!response.ok && response.status !== 206) throw new Error(`Navidrome no pudo reproducir el audio (${response.status}).`)

  res.status(response.status)
  for (const header of ['accept-ranges', 'content-length', 'content-range', 'content-type']) {
    const value = response.headers.get(header)
    if (value) res.setHeader(header, value)
  }
  res.setHeader('Cache-Control', 'private, max-age=3600')
  Readable.fromWeb(response.body).pipe(res)
}

module.exports = { navidromeRequest, proxyNavidromeAudio }
