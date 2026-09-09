/**
 * Cliente mínimo para Navidrome/Subsonic.
 *
 * La contraseña solo se usa localmente para calcular t = MD5(password + salt).
 * Para producción, configura una URL HTTPS en lugar de HTTP.
 */

const DEFAULT_BASE_URL = 'http://155.181.37.222:4533'
const API_VERSION = '1.16.1'
const CLIENT_NAME = 'mysic'

export class NavidromeError extends Error {
  constructor(message, kind, status = 0) {
    super(message)
    this.name = 'NavidromeError'
    this.kind = kind
    this.status = status
  }
}

function leftRotate(value, amount) {
  return (value << amount) | (value >>> (32 - amount))
}

// MD5 en navegador, sin guardar la contraseña ni añadir una dependencia.
function md5(value) {
  const bytes = new TextEncoder().encode(value)
  const bitLength = bytes.length * 8
  const paddedLength = (((bytes.length + 8) >> 6) + 1) * 64
  const buffer = new Uint8Array(paddedLength)
  buffer.set(bytes)
  buffer[bytes.length] = 0x80

  const view = new DataView(buffer.buffer)
  view.setUint32(paddedLength - 8, bitLength >>> 0, true)
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476
  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ]
  const constants = Array.from({ length: 64 }, (_, index) =>
    Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000),
  )

  for (let offset = 0; offset < buffer.length; offset += 64) {
    const words = Array.from({ length: 16 }, (_, index) => view.getUint32(offset + index * 4, true))
    let a = a0
    let b = b0
    let c = c0
    let d = d0

    for (let i = 0; i < 64; i += 1) {
      let functionResult
      let wordIndex
      if (i < 16) {
        functionResult = (b & c) | (~b & d)
        wordIndex = i
      } else if (i < 32) {
        functionResult = (d & b) | (~d & c)
        wordIndex = (5 * i + 1) % 16
      } else if (i < 48) {
        functionResult = b ^ c ^ d
        wordIndex = (3 * i + 5) % 16
      } else {
        functionResult = c ^ (b | ~d)
        wordIndex = (7 * i) % 16
      }

      const next = (a + functionResult + constants[i] + words[wordIndex]) | 0
      a = d
      d = c
      c = b
      b = (b + leftRotate(next, shifts[i])) | 0
    }

    a0 = (a0 + a) | 0
    b0 = (b0 + b) | 0
    c0 = (c0 + c) | 0
    d0 = (d0 + d) | 0
  }

  const digest = new Uint8Array(16)
  const result = new DataView(digest.buffer)
  result.setUint32(0, a0, true)
  result.setUint32(4, b0, true)
  result.setUint32(8, c0, true)
  result.setUint32(12, d0, true)
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function createSalt() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * @param {{ baseUrl?: string, username?: string, password: string }} config
 */
export function createNavidromeClient({
  baseUrl = DEFAULT_BASE_URL,
  username = 'RAWR',
  password,
}) {
  if (!password) throw new Error('Se requiere la contraseña de Navidrome.')

  const restUrl = `${baseUrl.replace(/\/$/, '')}/rest`

  async function request(endpoint, params = {}) {
    const salt = createSalt()
    const query = new URLSearchParams({
      v: API_VERSION,
      c: CLIENT_NAME,
      f: 'json',
      u: username,
      t: md5(password + salt),
      s: salt,
      ...params,
    })
    let response
    try {
      response = await fetch(`${restUrl}/${endpoint}.view?${query}`)
    } catch {
      throw new NavidromeError(
        'No se pudo conectar con Navidrome. Verifica http://155.181.37.222:4533.',
        'connection',
      )
    }
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      const kind = response.status === 404 ? 'endpoint' : response.status === 401 || response.status === 403 ? 'authentication' : 'http'
      throw new NavidromeError(`Navidrome respondió HTTP ${response.status}.`, kind, response.status)
    }
    if (payload?.['subsonic-response']?.status === 'failed') {
      const error = payload['subsonic-response'].error
      const kind = error?.code === 40 ? 'authentication' : error?.code === 10 ? 'parameters' : 'subsonic'
      throw new NavidromeError(error?.message || 'Navidrome rechazó la solicitud.', kind, error?.code || 0)
    }
    return payload['subsonic-response']
  }

  return {
    /** Obtiene una página de canciones desde un endpoint soportado por Navidrome. */
    getRandomSongs: ({ count = 500, offset = 0 } = {}) => request('getRandomSongs', {
      size: count,
      offset,
    }),

    /** Busca canciones, álbumes y artistas con search3. */
    searchSongs: (query, { count = 100, offset = 0 } = {}) => request('search3', {
      query,
      songCount: count,
      songOffset: offset,
    }),

    /** Compatibilidad con el cliente anterior: nunca llama al endpoint inexistente getSongs. */
    getSongs: ({ query, count, offset } = {}) => query
      ? request('search3', { query, songCount: count || 100, songOffset: offset || 0 })
      : request('getRandomSongs', { size: count || 500, offset: offset || 0 }),

    /** Obtiene los álbumes más recientes. */
    getLatestReleases: (size = 20, offset = 0) => request('getAlbumList2', {
      type: 'newest',
      size,
      offset,
    }),

    /** Devuelve una URL lista para usar como src de <audio>. */
    getStreamUrl: (songId) => {
      if (!songId) throw new Error('Se requiere el ID de la canción.')
      const salt = createSalt()
      const query = new URLSearchParams({
        v: API_VERSION,
        c: CLIENT_NAME,
        f: 'json',
        u: username,
        t: md5(password + salt),
        s: salt,
        id: songId,
      })
      return `${restUrl}/stream.view?${query}`
    },
  }
}

export { md5 }
