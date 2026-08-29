import { useEffect, useRef, useState } from 'react'
import googleLogo from '../../assets/brand/google-g.png'

const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
let googleScriptPromise

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
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()

  useEffect(() => {
    if (!clientId) return undefined

    let isCurrent = true

    loadGoogleScript()
      .then(() => {
        if (!isCurrent || !containerRef.current) return

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: ({ credential }) => onCredential(credential),
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
  }, [clientId, onCredential, onError])

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
