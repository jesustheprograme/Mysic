import { Languages, MicVocal, Type } from 'lucide-react'
import { readStorage, writeStorage } from '../../lib/storage.js'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { findActiveLineIndex, lyricsDuration } from './activeLine.js'
import LyricsSourcePicker from './LyricsSourcePicker.jsx'
import { translateLyrics, useLyrics } from './useLyrics.js'
import './lyrics.css'

const MANUAL_SCROLL_PAUSE_MS = 3000
const LYRICS_LEAD_SECONDS = 0.3
// Altura (fracción de la lista) donde queda la línea cantada, y deslizamiento de las líneas (valores de Limusic).
const LINE_ANCHOR = 0.37
const GLIDE_MS = 520
const GLIDE_STAGGER_MS = 45

const MESSAGES = {
  empty: 'No encontramos letra para esta canción.',
  error: 'No se pudo cargar la letra. Inténtalo de nuevo más tarde.',
  loading: 'Buscando letra…',
}

// Cada línea es un botón; con letras de 50-100 líneas, repintarlas todas en cada tick de
// reproducción (5 veces por segundo) es trabajo inútil: solo cambian la activa y la anterior.
const LyricLine = memo(function LyricLine({ index, isActive, isPast, line, onSeek, showRomanized, translation }) {
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
        {showRomanized && line.romanized && <span className="lyrics__romanized" lang="und-Latn">{line.romanized}</span>}
        {translation && <span className="lyrics__translation" lang="es">{translation}</span>}
      </button>
    </li>
  )
})

const ROMANIZED_KEY = 'mysic:lyrics:romanized'
const TRANSLATION_KEY = 'mysic:lyrics:translation'

/**
 * Traducción al español de la letra mostrada (ver sources/translate.js): solo se pide con la traducción activada y se
 * guarda por canción y fuente. → { status: idle | loading | ready | error, result }
 */
function useLyricsTranslation(lyrics, wanted) {
  const key = `${lyrics.songKey}|${lyrics.provider ?? ''}`
  const { lines } = lyrics
  const [state, setState] = useState({ key: '', status: 'idle', result: null })
  useEffect(() => {
    if (!wanted || !translateLyrics || !lines.length) return undefined
    let cancelled = false
    setState({ key, status: 'loading', result: null })
    translateLyrics(key, lines).then(
      (result) => { if (!cancelled) setState({ key, status: 'ready', result }) },
      () => { if (!cancelled) setState({ key, status: 'error', result: null }) },
    )
    return () => { cancelled = true }
  }, [wanted, key, lines])
  if (!wanted || !lines.length) return { status: 'idle', result: null }
  return state.key === key ? state : { status: 'loading', result: null }
}

function translationLabel({ status, result }) {
  if (status === 'loading') return 'Traduciendo…'
  if (status === 'error') return 'Sin traducción'
  if (result && !result.byText.size && result.original === 'es') return 'Ya en español'
  return 'Traducción'
}

/** Botón de micrófono para abrir la letra desde la fila de acciones del reproductor (junto al mini reproductor). */
export function LyricsToggleButton({ open, onToggle }) {
  return (
    <button
      className={`player-dock__action player-dock__action--lyrics${open ? ' player-dock__action--active' : ''}`}
      type="button"
      aria-pressed={open}
      aria-label={open ? 'Ocultar letra' : 'Mostrar letra'}
      title={open ? 'Ocultar letra' : 'Mostrar letra'}
      onClick={onToggle}
    >
      <MicVocal size={17} aria-hidden="true" />
    </button>
  )
}

/**
 * Letra sincronizada. Con `open` (controlado desde fuera, p. ej. por LyricsToggleButton) no pinta su propio botón y,
 * cerrada, no ocupa espacio; sin él, se abre y cierra con su botón "Letra".
 */
export default function LyricsSection({ currentTime, duration, onSeek, open: controlledOpen, track }) {
  const [ownOpen, setOpen] = useState(false)
  const controlled = controlledOpen !== undefined
  const open = controlled ? controlledOpen : ownOpen
  const listRef = useRef(null)
  const manualScrollUntil = useRef(0)
  const onSeekRef = useRef(onSeek)

  useEffect(() => {
    onSeekRef.current = onSeek
  })
  const lyrics = useLyrics({
    album: typeof track.album === 'string' ? track.album : track.album?.title ?? track.albumTitle,
    artist: track.artist,
    duration: lyricsDuration(track.durationSeconds, duration),
    enabled: open,
    title: track.title,
    videoId: track.id,
  })
  // Desfase de la canción (positivo = la letra va después): la línea activa se busca en `tiempo - desfase` y al pulsar
  // una línea se salta a `su tiempo + desfase`.
  const offsetRef = useRef(lyrics.offset)
  offsetRef.current = lyrics.offset
  // El padre pasa una función nueva en cada render; esta mantiene la identidad para que memo funcione.
  const seek = useCallback((time) => onSeekRef.current?.(Math.max(0, time + offsetRef.current)), [])

  // Romanizado bajo cada línea (letras en japonés, coreano…): solo si la fuente lo trae; la elección se recuerda.
  const [showRomanized, setShowRomanized] = useState(() => readStorage(ROMANIZED_KEY, true) !== false)
  const hasRomanized = lyrics.lines.some((line) => line.romanized)
  const toggleRomanized = () => setShowRomanized((value) => { writeStorage(ROMANIZED_KEY, !value); return !value })

  // Traducción bajo cada línea (al español). Desactivada por defecto; la elección se recuerda.
  const [showTranslation, setShowTranslation] = useState(() => readStorage(TRANSLATION_KEY, false) === true)
  const translation = useLyricsTranslation(lyrics, open && showTranslation)
  const translatedText = showTranslation ? translation.result?.byText : null
  const canTranslate = Boolean(translateLyrics) && lyrics.lines.some((line) => line.text)
  const toggleTranslation = () => setShowTranslation((value) => { writeStorage(TRANSLATION_KEY, !value); return !value })

  const synced = lyrics.lines.length > 0
  // La posición llega cada 250-500 ms: sin adelanto, cada línea se encendía hasta medio segundo tarde.
  const activeIndex = synced ? findActiveLineIndex(lyrics.lines, currentTime + LYRICS_LEAD_SECONDS - lyrics.offset) : -1

  // Colocación de la línea cantada (como Limusic, LyricsView.svelte): siempre al 37 % del alto de la lista, un poco por
  // encima del centro. La lista salta al sitio exacto al instante y las líneas visibles se deslizan desde donde estaban
  // (Web Animations, `composite: 'add'`): la línea activa nunca queda a medio camino aunque lleguen seguidas. Las
  // posiciones salen de `offsetTop` (la lista es `position: relative`), que no mueven ni el deslizamiento ni el `scale`
  // de la línea activa. Al cambiar el ancho o la letra (cola, romanizado, ventana) se recoloca sin animar.
  const activeRef = useRef(activeIndex)
  activeRef.current = activeIndex
  const placedRef = useRef(false)
  const glidingRef = useRef([])

  const place = useCallback((smooth) => {
    const list = listRef.current
    const rows = list?.children
    const line = rows?.[activeRef.current]
    if (!line) return
    const height = list.clientHeight
    const target = Math.max(0, Math.min(list.scrollHeight - height, line.offsetTop + line.offsetHeight / 2 - height * LINE_ANCHOR))
    const delta = target - list.scrollTop
    if (Math.abs(delta) < 1) return
    list.scrollTop = target
    glidingRef.current = glidingRef.current.filter((animation) => animation.playState === 'running')
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!smooth || reduceMotion || typeof line.animate !== 'function') {
      glidingRef.current.forEach((animation) => animation.cancel())
      glidingRef.current = []
      return
    }
    // Como mucho una pantalla: tras un salto largo se mueve lo que se verá, no todo lo de en medio.
    const shift = Math.max(-height, Math.min(height, delta))
    const index = activeRef.current
    for (let row = 0; row < rows.length; row += 1) {
      const element = rows[row]
      const top = element.offsetTop - target
      if (Math.max(top, top + shift) + element.offsetHeight < 0 || Math.min(top, top + shift) > height) continue
      // Las que van detrás en el sentido del movimiento llegan un poco después: el texto "fluye".
      const behind = delta > 0 ? row - index : index - row
      const duration = GLIDE_MS + Math.max(0, Math.min(5, behind)) * GLIDE_STAGGER_MS
      glidingRef.current.push(element.animate(
        [{ transform: `translateY(${shift}px)` }, { transform: 'translateY(0)' }],
        { duration, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', composite: 'add' },
      ))
    }
  }, [])

  // Nueva letra: el primer colocado es un salto; después, deslizamientos.
  useEffect(() => { placedRef.current = false }, [lyrics.lines])

  useEffect(() => {
    if (activeIndex < 0 || Date.now() < manualScrollUntil.current) return
    place(placedRef.current)
    placedRef.current = true
  }, [activeIndex, lyrics.lines, place])

  // Mostrar u ocultar el romanizado o la traducción cambia el alto de todas las líneas: recolocar sin animar.
  useEffect(() => {
    manualScrollUntil.current = 0
    place(false)
  }, [showRomanized, translatedText, place])

  // Cambio de tamaño de la lista (ocultar/mostrar la cola, otra vista, la ventana): recolocar sin animar.
  const listNodeRef = useCallback((node) => {
    listRef.current = node
    if (!node || typeof ResizeObserver !== 'function') return undefined
    let frame = 0
    let lastWidth = node.clientWidth
    let lastHeight = node.clientHeight
    const observer = new ResizeObserver(() => {
      if (node.clientWidth === lastWidth && node.clientHeight === lastHeight) return
      lastWidth = node.clientWidth
      lastHeight = node.clientHeight
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        manualScrollUntil.current = 0
        place(false)
      })
    })
    observer.observe(node)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [place])

  function pauseAutoScroll() {
    manualScrollUntil.current = Date.now() + MANUAL_SCROLL_PAUSE_MS
  }

  if (controlled && !open) return null

  return (
    <section className="lyrics" aria-label="Letra de la canción">
      {!controlled && (
        <button
          className={`lyrics__toggle${open ? ' lyrics__toggle--open' : ''}`}
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <MicVocal size={16} aria-hidden="true" />
          <span>Letra</span>
        </button>
      )}

      {open && lyrics.status === 'ready' && synced && (
        <ol
          className="lyrics__lines"
          ref={listNodeRef}
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
              showRomanized={showRomanized}
              translation={line.text ? translatedText?.get(line.text.trim()) : undefined}
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

      {/* Fuente, desfase y búsqueda: también cuando no se encontró letra (para probar otra fuente o buscar). */}
      {open && lyrics.status !== 'idle' && (
        <div className="lyrics__footer">
          <LyricsSourcePicker lyrics={lyrics} />
          {hasRomanized && (
            <button
              className={showRomanized ? 'lyrics__chip lyrics__chip--on' : 'lyrics__chip'}
              type="button"
              aria-pressed={showRomanized}
              title={showRomanized ? 'Ocultar romanizado' : 'Mostrar romanizado'}
              onClick={toggleRomanized}
            >
              <Type size={13} aria-hidden="true" />
              Romanizado
            </button>
          )}
          {canTranslate && (
            <button
              className={showTranslation ? 'lyrics__chip lyrics__chip--on' : 'lyrics__chip'}
              type="button"
              aria-pressed={showTranslation}
              title={showTranslation ? 'Ocultar traducción' : 'Traducir la letra al español'}
              onClick={toggleTranslation}
            >
              <Languages size={13} aria-hidden="true" />
              {showTranslation ? translationLabel(translation) : 'Traducción'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
