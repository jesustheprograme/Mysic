import { useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { cancel, onUrl, start } from '@fabianlars/tauri-plugin-oauth'
import googleLogo from '../../assets/brand/google-g.png'

const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
let googleScriptPromise

function isDesktopRuntime() {
  return isTauri() || Boolean(window.__TAURI_INTERNALS__)
}

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (googleScriptPromise) return googleScriptPromise

  googleScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${GOOGLE_SCRIPT_URL}"]`)
    const script = existingScript || document.createElement('script')

    script.addEventListener('load', resolve, { once: true })
    script.addEventListener('error', () => reject(new Error('No se pudo cargar Google.')), { once: true })

    if (!existingScript) {
      script.src = GOOGLE_SCRIPT_URL
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
  })

  return googleScriptPromise
}

function GoogleSignInButton({ disabled, onCredential, onError }) {
  const containerRef = useRef(null)
  const [isReady, setIsReady] = useState(false)
  const desktopRuntime = isDesktopRuntime()
  const webClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()
  const desktopClientId = import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_ID?.trim()
  const clientId = desktopRuntime ? (desktopClientId || webClientId) : webClientId

  async function startDesktopLogin() {
    if (disabled) return

    let port
    let removeListener = () => {}
    let timeoutId

    try {
      port = await start({ ports: [14523] })
      const state = crypto.randomUUID()
      const redirectUri = `http://127.0.0.1:${port}`
      const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authorizationUrl.search = new URLSearchParams({
        client_id: clientId,
        nonce: crypto.randomUUID(),
        prompt: 'select_account',
        redirect_uri: redirectUri,
        response_mode: 'fragment',
        response_type: 'id_token',
        scope: 'openid email profile',
        state,
      }).toString()

      const callback = new Promise((resolve, reject) => {
        onUrl((url) => {
          try {
            const callbackUrl = new URL(url)
            const query = new URLSearchParams(callbackUrl.search)
            const fragment = new URLSearchParams(callbackUrl.hash.slice(1))
            const error = query.get('error') || fragment.get('error')
            if (error) {
              reject(new Error('Se cancelo el acceso con Google.'))
              return
            }

            const returnedState = query.get('state') || fragment.get('state')
            const credential = query.get('id_token') || fragment.get('id_token')
            if (returnedState !== state || !credential) {
              reject(new Error('Google devolvio una respuesta no valida.'))
              return
            }

            resolve(credential)
          } catch {
            reject(new Error('Google devolvio una respuesta no valida.'))
          }
        }).then((cleanup) => { removeListener = cleanup }).catch(reject)

        timeoutId = window.setTimeout(() => reject(new Error('El acceso con Google tardo demasiado.')), 120000)
      })

      await openUrl(authorizationUrl.toString())
      await onCredential(await callback)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '')
      onError(message || 'No se pudo iniciar el acceso con Google.')
    } finally {
      clearTimeout(timeoutId)
      removeListener()
      if (port) cancel(port).catch(() => {})
    }
  }

  useEffect(() => {
    if (!clientId || desktopRuntime) return undefined

    let isCurrent = true

    loadGoogleScript()
      .then(() => {
        if (!isCurrent || !containerRef.current) return

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: ({ credential }) => {
            if (credential) onCredential(credential)
            else onError('Google no devolvio una credencial valida.')
          },
          error_callback: ({ type }) => {
            const message = type === 'popup_failed_to_open'
              ? 'Google no pudo abrir la ventana de acceso. Permite ventanas emergentes para Mysic.'
              : 'No se pudo completar el acceso con Google.'
            onError(message)
          },
          ux_mode: 'popup',
          use_fedcm_for_button: false,
        })

        window.google.accounts.id.renderButton(containerRef.current, {
          locale: 'es',
          logo_alignment: 'left',
          shape: 'rectangular',
          size: 'large',
          text: 'continue_with',
          theme: 'outline',
          type: 'standard',
          width: Math.round(containerRef.current.getBoundingClientRect().width),
        })
        setIsReady(true)
      })
      .catch((error) => {
        if (isCurrent) onError(error.message)
      })

    return () => {
      isCurrent = false
    }
  }, [clientId, desktopRuntime, onCredential, onError])

  if (!clientId) {
    return (
      <button
        className="google-button google-button--disabled"
        type="button"
        disabled
        title="Configura VITE_GOOGLE_CLIENT_ID para habilitar Google"
      >
        <img className="google-logo" src={googleLogo} alt="" aria-hidden="true" />
        Continuar con Google
      </button>
    )
  }

  if (desktopRuntime) {
    return (
      <button
        className="google-button"
        type="button"
        disabled={disabled}
        onClick={startDesktopLogin}
      >
        <img className="google-logo" src={googleLogo} alt="" aria-hidden="true" />
        {disabled ? 'Procesando...' : 'Continuar con Google'}
      </button>
    )
  }

  return (
    <div className={`google-signin${disabled ? ' google-signin--disabled' : ''}`}>
      <div className="google-signin__visual" aria-hidden="true">
        <img className="google-logo" src={googleLogo} alt="" />
        <span>Continuar con Google</span>
      </div>
      <div ref={containerRef} className="google-signin__target" aria-busy={!isReady} />
    </div>
  )
}

export default GoogleSignInButton
