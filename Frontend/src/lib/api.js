const isTauriRuntime = Boolean(window.__TAURI_INTERNALS__)
const defaultApiUrl = import.meta.env.DEV || isTauriRuntime
  ? `http://localhost:4000/api`
  : '/api'
const API_URL = (import.meta.env.VITE_API_URL || defaultApiUrl).replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request(path, options = {}) {
  let response

  try {
    response = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    })
  } catch {
    throw new ApiError('No se pudo conectar con el servidor de Mysic.', 0)
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(data?.message || data?.detail || 'No se pudo completar la solicitud.', response.status)
  }

  return data
}

export const authApi = {
  getSession: () => request('/auth/me'),
  login: (credentials) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  }),
  register: (account) => request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(account),
  }),
  loginWithGoogle: (credential) => request('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential, remember: true }),
  }),
  logout: () => request('/auth/logout', { method: 'POST' }),
}
