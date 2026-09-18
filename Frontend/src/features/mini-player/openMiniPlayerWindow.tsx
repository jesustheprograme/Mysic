import { invoke, isTauri } from '@tauri-apps/api/core'
import { createRoot } from 'react-dom/client'
import MiniPlayer from './MiniPlayer'
import {
  getStoredMiniPlayerHeight,
  MINI_PLAYER_COLLAPSED_HEIGHT,
  MINI_PLAYER_WIDTH,
} from './miniPlayerConfig'

type DocumentPictureInPictureApi = {
  window: Window | null
  requestWindow: (options: {
    disallowReturnToOpener?: boolean
    height: number
    width: number
  }) => Promise<Window>
}

function copyStylesToWindow(targetDocument: Document) {
  const base = targetDocument.createElement('base')
  base.href = document.baseURI
  targetDocument.head.append(base)

  Array.from(document.styleSheets).forEach((styleSheet) => {
    try {
      const style = targetDocument.createElement('style')
      style.textContent = Array.from(styleSheet.cssRules, (rule) => rule.cssText).join('\n')
      targetDocument.head.append(style)
    } catch {
      if (!styleSheet.href) return
      const link = targetDocument.createElement('link')
      link.rel = 'stylesheet'
      link.href = styleSheet.href
      targetDocument.head.append(link)
    }
  })
}

async function openPictureInPicturePlayer(pipApi: DocumentPictureInPictureApi) {
  if (pipApi.window) {
    pipApi.window.focus()
    return
  }

  const pipWindow = await pipApi.requestWindow({
    disallowReturnToOpener: true,
    height: getStoredMiniPlayerHeight(),
    width: MINI_PLAYER_WIDTH,
  })
  const pipDocument = pipWindow.document
  pipDocument.title = 'Mysic mini player'
  copyStylesToWindow(pipDocument)

  const rootElement = pipDocument.createElement('div')
  rootElement.id = 'root'
  pipDocument.body.append(rootElement)

  const root = createRoot(rootElement)
  root.render(<MiniPlayer hostDocument={pipDocument} hostWindow={pipWindow} />)
  pipWindow.addEventListener('pagehide', () => window.setTimeout(() => root.unmount(), 0), { once: true })
}

export async function openMiniPlayerWindow() {
  if (isTauri()) {
    await invoke('open_mini_player')
    return
  }

  const pipApi = (window as Window & { documentPictureInPicture?: DocumentPictureInPictureApi }).documentPictureInPicture
  if (pipApi) {
    await openPictureInPicturePlayer(pipApi)
    return
  }

  const miniPlayerUrl = `${window.location.origin}${window.location.pathname}#/mini-player`
  window.open(
    miniPlayerUrl,
    'mysic-mini-player',
    `popup=yes,width=${MINI_PLAYER_WIDTH},height=${MINI_PLAYER_COLLAPSED_HEIGHT},resizable=no,noopener,noreferrer`,
  )
}
