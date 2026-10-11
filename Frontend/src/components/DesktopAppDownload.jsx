import { Download } from 'lucide-react'
import { isTauri } from '@tauri-apps/api/core'

const desktopDownloadUrl = import.meta.env.VITE_DESKTOP_DOWNLOAD_URL
  || '/downloads/Mysic-Setup.exe'

export function DesktopAppHeaderLink() {
  if (isTauri() || window.__TAURI_INTERNALS__) return null

  return (
    <a
      className="desktop-download desktop-download--header"
      href={desktopDownloadUrl}
      download
      aria-label="Descargar Mysic para escritorio"
      title="Descargar Mysic para Windows"
    >
      <Download size={17} strokeWidth={1.8} aria-hidden="true" />
      <span>Descargar app</span>
    </a>
  )
}
