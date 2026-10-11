import { useEffect, useRef, useState } from 'react'
import googleLogo from '../../assets/brand/google-g.png'
import BrandLogo from '../../components/BrandLogo.jsx'
import { loadGoogleScript } from './googleIdentity.js'

function getDesktopCallback() {
  const query = new URLSearchParams(window.location.hash.split('?')[1] || '')
  const callback = new URL(query.get('callback') || '')
  const state = query.get('state') || ''
  const validCallback = callback.protocol === 'http:'
    && callback.hostname === '127.0.0.1'
    && callback.port === '14523'
    && callback.pathname === '/'

  if (!validCallback || !state) throw new Error('La solicitud de acceso no es valida.')
  return { callback, state }
}

function DesktopGoogleAuth() {
  const buttonRef = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let isCurrent = true

    try {
      const { callback, state } = getDesktopCallback()
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()
      if (!clientId) throw new Error('El acceso con Google no esta configurado.')

      loadGoogleScript().then(() => {
        if (!isCurrent || !buttonRef.current) return

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: ({ credential }) => {
            if (!credential) {
              setError('Google no devolvio una credencial valida.')
              return
            }

            callback.search = new URLSearchParams({ credential, state }).toString()
            window.location.assign(callback.toString())
          },
          ux_mode: 'popup',
          use_fedcm_for_button: false,
        })
        window.google.accounts.id.renderButton(buttonRef.current, {
          locale: 'es',
          logo_alignment: 'left',
          shape: 'rectangular',
          size: 'large',
          text: 'continue_with',
          theme: 'outline',
          type: 'standard',
          width: 320,
        })
      }).catch((loadError) => {
        if (isCurrent) setError(loadError.message || 'No se pudo cargar Google.')
      })
    } catch (requestError) {
      setError(requestError.message)
    }

    return () => {
      isCurrent = false
    }
  }, [])

  return (
    <main className="desktop-auth-page">
      <section className="desktop-auth-card" aria-labelledby="desktop-auth-title">
        <BrandLogo className="desktop-auth-card__brand" tone="light" />
        <img className="desktop-auth-card__google" src={googleLogo} alt="" aria-hidden="true" />
        <h1 id="desktop-auth-title">Continua en Mysic</h1>
        <p>Elige tu cuenta de Google y volveras automaticamente a la aplicacion.</p>
        <div ref={buttonRef} className="desktop-auth-card__button" />
        {error && <p className="desktop-auth-card__error" role="alert">{error}</p>}
      </section>
    </main>
  )
}

export default DesktopGoogleAuth
