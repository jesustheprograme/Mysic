const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
let googleScriptPromise

export function loadGoogleScript() {
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
