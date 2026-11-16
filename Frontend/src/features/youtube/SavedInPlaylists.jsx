import { CircleCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { sizedImage } from '../../lib/imageSize.js'
import { useSavedIn } from './playlistIndex.js'
import './saved-in-playlists.css'

const CARD_WIDTH = 232
const CLOSE_DELAY_MS = 140

const tracks = (count) => `${count} ${count === 1 ? 'pista' : 'pistas'}`

/**
 * ✓ de las canciones que ya están en alguna de tus playlists personales. Al pasar el cursor (o con el foco) muestra la
 * tarjeta "Guardada en" con cada lista; pulsar una la abre. Sin listas no pinta nada (ni ocupa sitio).
 */
export default function SavedInPlaylists({ onOpen, songId }) {
  const lists = useSavedIn(songId)
  const buttonRef = useRef(null)
  const closeTimer = useRef(null)
  const [position, setPosition] = useState(null)

  useEffect(() => () => clearTimeout(closeTimer.current), [])
  if (!lists.length) return null

  const open = () => {
    clearTimeout(closeTimer.current)
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    // Debajo del ✓ y alineada a su borde derecho; si no cabe abajo, encima.
    const below = rect.bottom + 8
    const estimated = 48 * Math.min(lists.length, 4) + 26
    const top = below + estimated > window.innerHeight ? Math.max(8, rect.top - 8 - estimated) : below
    const left = Math.min(Math.max(8, rect.right - CARD_WIDTH), window.innerWidth - CARD_WIDTH - 8)
    setPosition({ left, top })
  }
  const close = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setPosition(null), CLOSE_DELAY_MS)
  }
  const label = lists.length === 1 ? `Guardada en ${lists[0].title}` : `Guardada en ${lists.length} playlists`

  return (
    <>
      <button
        aria-expanded={Boolean(position)}
        aria-label={label}
        className={`saved-in${position ? ' saved-in--open' : ''}`}
        onBlur={close}
        onClick={() => (lists.length === 1 ? onOpen?.(lists[0].id) : open())}
        onFocus={open}
        onPointerEnter={open}
        onPointerLeave={close}
        ref={buttonRef}
        type="button"
      >
        <CircleCheck size={17} strokeWidth={2} aria-hidden="true" />
      </button>
      {position && createPortal(
        <div className="saved-in-card" onPointerEnter={open} onPointerLeave={close} role="dialog" aria-label={label} style={{ left: position.left, top: position.top, width: CARD_WIDTH }}>
          <span className="saved-in-card__eyebrow">Guardada en</span>
          {lists.slice(0, 4).map((list) => (
            <button className="saved-in-card__list" key={list.id} type="button" onClick={() => { setPosition(null); onOpen?.(list.id) }}>
              {list.thumbnail ? <img alt="" src={sizedImage(list.thumbnail, 40)} width="38" height="38" decoding="async" /> : <i aria-hidden="true" />}
              <span>
                <strong>{list.title}</strong>
                <small>{list.author ? `${list.author} • ` : ''}{tracks(list.count)}</small>
              </span>
            </button>
          ))}
          {lists.length > 4 && <small className="saved-in-card__more">y {lists.length - 4} más</small>}
        </div>,
        document.body,
      )}
    </>
  )
}
