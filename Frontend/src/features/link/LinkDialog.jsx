import { useEffect, useRef, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { X } from 'lucide-react'
import { isSpotifyLink, parseYtLink } from '../youtube/ytLink.js'
import './link-dialog.css'

export const OPEN_LINK_EVENT = 'mysic:open-link'

const SPOTIFY_ERRORS = {
  not_spotify: 'Ese no es un enlace de Spotify.',
  private: 'Ese contenido de Spotify es privado o ya no existe.',
  spotify_changed: 'Spotify cambió su página y no se pudo leer ese enlace.',
}

/** Enlace pegado -> destino para la vista de YouTube Music. Lanza Error con un mensaje para mostrar. */
async function resolveLink(text) {
  if (isSpotifyLink(text)) {
    if (!isTauri()) throw new Error('Los enlaces de Spotify solo funcionan en la app de escritorio.')
    let info
    try {
      info = await invoke('spotify_link_info', { link: text.trim() })
    } catch (error) {
      throw new Error(SPOTIFY_ERRORS[String(error)] ?? `No se pudo leer el enlace de Spotify: ${String(error)}`)
    }
    return { kind: 'spotify', type: info.kind, name: info.name, owner: info.owner ?? null, tracks: info.tracks ?? [], cover: info.cover ?? null, truncated: Boolean(info.truncated) }
  }
  const target = parseYtLink(text)
  if (!target) throw new Error('Ese no es un enlace de YouTube Music o Spotify.')
  return target
}

/** "Abrir enlace": pega un enlace de YouTube Music o Spotify y abre la canción, playlist, álbum o artista. */
export default function LinkDialog({ onClose }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function submit(event) {
    event.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const target = await resolveLink(text)
      window.dispatchEvent(new CustomEvent(OPEN_LINK_EVENT, { detail: target }))
      onClose()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="link-dialog__backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="link-dialog" role="dialog" aria-modal="true" aria-labelledby="link-dialog-title" onSubmit={submit}>
        <header>
          <h2 id="link-dialog-title">Abrir enlace</h2>
          <button className="link-dialog__close" type="button" aria-label="Cerrar" onClick={onClose}><X size={16} aria-hidden="true" /></button>
        </header>
        <p>Pega un enlace de YouTube Music o Spotify para una canción, playlist, álbum o artista.</p>
        <div className="link-dialog__row">
          <input
            aria-invalid={Boolean(error)}
            aria-label="Enlace"
            autoComplete="off"
            onChange={(event) => { setText(event.target.value); setError('') }}
            placeholder="https://music.youtube.com/playlist?list=..."
            ref={inputRef}
            spellCheck="false"
            type="text"
            value={text}
          />
          <button type="submit" disabled={!text.trim() || busy}>{busy ? 'Abriendo…' : 'Abrir'}</button>
        </div>
        {error && <p className="link-dialog__error" role="alert">{error}</p>}
      </form>
    </div>
  )
}