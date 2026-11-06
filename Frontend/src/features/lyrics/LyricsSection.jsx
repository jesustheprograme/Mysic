import { MicVocal } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { findActiveLineIndex, lyricsDuration } from './activeLine.js'
import { useLyrics } from './useLyrics.js'
import './lyrics.css'

const MANUAL_SCROLL_PAUSE_MS = 3000

const MESSAGES = {
  empty: 'No encontramos letra para esta canción.',
  error: 'No se pudo cargar la letra. Inténtalo de nuevo más tarde.',
  loading: 'Buscando letra…',
}

// Cada línea es un botón; con letras de 50-100 líneas, repintarlas todas en cada tick de
// reproducción (5 veces por segundo) es trabajo inútil: solo cambian la activa y la anterior.
const LyricLine = memo(function LyricLine({ index, isActive, isPast, line, onSeek }) {
  return (
    <li>
      <button
        className={`lyrics__line${isActive ? ' lyrics__line--active' : ''}${isPast ? ' lyrics__line--past' : ''}`}
        type="button"
        aria-current={isActive || undefined}
        disabled={!line.text}
        onClick={() => onSeek(line.time)}
        data-index={index}
      >
        {line.text || '♪'}
      </button>
    </li>
  )
})

export default function LyricsSection({ currentTime, duration, onSeek, track }) {
  const [open, setOpen] = useState(false)
  const listRef = useRef(null)
  const manualScrollUntil = useRef(0)
  const onSeekRef = useRef(onSeek)

  useEffect(() => {
    onSeekRef.current = onSeek
  })
  // El padre pasa una función nueva en cada render; esta mantiene la identidad para que memo funcione.
  const seek = useCallback((time) => onSeekRef.current?.(time), [])

  const lyrics = useLyrics({
    album: track.album,
    artist: track.artist,
    duration: lyricsDuration(track.durationSeconds, duration),
    enabled: open,
    title: track.title,
  })

  const synced = lyrics.lines.length > 0
  const activeIndex = synced ? findActiveLineIndex(lyrics.lines, currentTime) : -1

  useEffect(() => {
    const list = listRef.current
    const line = list?.children[activeIndex]
    if (!line || Date.now() < manualScrollUntil.current) return

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const top = line.offsetTop - list.clientHeight / 2 + line.clientHeight / 2
    list.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [activeIndex, lyrics.lines])

  function pauseAutoScroll() {
    manualScrollUntil.current = Date.now() + MANUAL_SCROLL_PAUSE_MS
  }

  return (
    <section className="lyrics" aria-label="Letra de la canción">
      <button
        className={`lyrics__toggle${open ? ' lyrics__toggle--open' : ''}`}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MicVocal size={16} aria-hidden="true" />
        <span>Letra</span>
      </button>

      {open && lyrics.status === 'ready' && synced && (
        <ol
          className="lyrics__lines"
          ref={listRef}
          onTouchMove={pauseAutoScroll}
          onWheel={pauseAutoScroll}
        >
          {lyrics.lines.map((line, index) => (
            <LyricLine
              index={index}
              isActive={index === activeIndex}
              isPast={index < activeIndex}
              key={`${line.time}-${index}`}
              line={line}
              onSeek={seek}
            />
          ))}
        </ol>
      )}

      {open && lyrics.status === 'ready' && !synced && (
        <p className="lyrics__plain">{lyrics.plain}</p>
      )}

      {open && MESSAGES[lyrics.status] && (
        <p className="lyrics__message" role="status">{MESSAGES[lyrics.status]}</p>
      )}
    </section>
  )
}
