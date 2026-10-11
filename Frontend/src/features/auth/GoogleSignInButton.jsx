import { useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { cancel, onUrl, start } from '@fabianlars/tauri-plugin-oauth'
import googleLogo from '../../assets/brand/google-g.png'
import { loadGoogleScript } from './googleIdentity.js'

function isDesktopRuntime() {
  return isTauri() || Boolean(window.__TAURI_INTERNALS__)
}

function GoogleSignInButton({ disabled, onCredential, onError, onInteraction }) {
  const containerRef = useRef(null)
  const [isReady, setIsReady] = useState(false)
  const desktopRuntime = isDesktopRuntime()
  const webClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()
  const desktopAuthUrl = import.meta.env.VITE_DESKTOP_AUTH_URL?.trim()
    || 'https://myslc.duckdns.org/#/desktop-auth'

  async function startDesktopLogin() {
    if (disabled) return

    let port
    let removeListener = () => {}
    let timeoutId

    try {
      port = await start({ ports: [14523] })
      const state = crypto.randomUUID()
      const callbackUrl = `http://127.0.0.1:${port}`
      const authorizationUrl = new URL(desktopAuthUrl)
      authorizationUrl.hash = `/desktop-auth?${new URLSearchParams({ callback: callbackUrl, state })}`

      const callback = new Promise((resolve, reject) => {
        onUrl((url) => {
          try {
            const callbackUrl = new URL(url)
            const query = new URLSearchParams(callbackUrl.search)
            const error = query.get('error')
            if (error) {
              reject(new Error('Se cancelo el acceso con Google.'))
              return
            }

            const returnedState = query.get('state')
            const credential = query.get('credential')
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
    if (!webClientId || desktopRuntime) return undefined

    let isCurrent = true

    loadGoogleScript()
      .then(() => {
        if (!isCurrent || !containerRef.current) return

        window.google.accounts.id.initialize({
          client_id: webClientId,
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
  }, [desktopRuntime, onCredential, onError, webClientId])

  if (!webClientId) {
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
        onPointerDown={onInteraction}
      >
        <img className="google-logo" src={googleLogo} alt="" aria-hidden="true" />
        {disabled ? 'Procesando...' : 'Continuar con Google'}
      </button>
    )
  }

  return (
    <div className={`google-signin${disabled ? ' google-signin--disabled' : ''}`} onPointerDown={onInteraction}>
      <div className="google-signin__visual" aria-hidden="true">
        <img className="google-logo" src={googleLogo} alt="" />
        <span>Continuar con Google</span>
      </div>
      <div ref={containerRef} className="google-signin__target" aria-busy={!isReady} />
    </div>
  )
}

export default GoogleSignInButton
