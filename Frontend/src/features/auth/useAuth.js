import { useCallback, useEffect, useState } from 'react'
import { ApiError, authApi } from '../../lib/api.js'

function useAuth() {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let isCurrent = true

    authApi.getSession()
      .then((session) => {
        if (!session?.user) throw new ApiError('El servidor devolvio una sesion no valida.', 502)
        const sessionUser = session.user
        if (isCurrent) setUser(sessionUser)
      })
      .catch((requestError) => {
        if (isCurrent && (!(requestError instanceof ApiError) || requestError.status !== 401)) {
          setError(requestError.message)
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [])

  const runAuthentication = useCallback(async (operation) => {
    setError('')
    setIsSubmitting(true)

    try {
      const result = await operation()
      if (!result?.user) throw new ApiError('El servidor no devolvio un usuario valido.', 502)
      const authenticatedUser = result.user
      setUser(authenticatedUser)
      return authenticatedUser
    } catch (requestError) {
      setError(requestError.message || 'No se pudo iniciar sesion.')
      throw requestError
    } finally {
      setIsSubmitting(false)
    }
  }, [])

  const login = useCallback(
    (credentials) => runAuthentication(() => authApi.login(credentials)),
    [runAuthentication],
  )

  const register = useCallback(
    (account) => runAuthentication(() => authApi.register(account)),
    [runAuthentication],
  )

  const loginWithGoogle = useCallback(
    (credential) => runAuthentication(() => authApi.loginWithGoogle(credential)),
    [runAuthentication],
  )

  const logout = useCallback(async () => {
    setError('')

    try {
      await authApi.logout()
    } finally {
      window.google?.accounts?.id?.disableAutoSelect()
      setUser(null)
    }
  }, [])

  const clearError = useCallback(() => setError(''), [])

  return {
    clearError,
    error,
    isLoading,
    isSubmitting,
    login,
    loginWithGoogle,
    logout,
    register,
    user,
  }
}

export default useAuth
