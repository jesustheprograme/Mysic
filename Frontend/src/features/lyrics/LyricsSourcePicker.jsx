import { Check, ChevronDown, ChevronRight, Minus, Pin, Plus, RotateCcw, Search, Sparkles, Timer } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { lyricsEngine, LYRICS_PROVIDERS } from './useLyrics.js'
import { OFFSET_STEP } from './sources/prefs.js'
import './lyrics-source-picker.css'

// Selector de la fuente de la letra (como el de Limusic, con el diseño de Mysic): Automático o un proveedor fijado
// para esta canción, desfase y búsqueda por título. Al abrirse consulta todos los proveedores en paralelo para
// mostrar qué tiene cada uno; lo consultado queda en la caché del motor, así que elegirlo después es instantáneo.

const WIDTH = 320
const nameOf = (id) => LYRICS_PROVIDERS.find((provider) => provider.id === id)?.name ?? id
const formatOffset = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' })

function Status({ status, onRetry }) {
  if (!status || status.state === 'loading') return <span className="lsp__skeleton" aria-label="Comprobando" />
  if (status.state === 'error') {
    return (
      <span className="lsp__note">
        Inaccesible · <button type="button" className="lsp__retry" onClick={(event) => { event.stopPropagation(); onRetry() }}>Intentar de nuevo</button>
      </span>
    )
  }
  if (status.state === 'none') return <span className="lsp__note">No se encontró</span>
  return <span className={status.synced ? 'lsp__badge lsp__badge--synced' : 'lsp__badge'}>{status.synced ? 'Sincronizada' : 'Texto plano'}</span>
}

export default function LyricsSourcePicker({ lyrics }) {
  const [open, setOpen] = useState(false)
  const [statuses, setStatuses] = useState({})
  const [searching, setSearching] = useState(false)
  const [form, setForm] = useState({ title: '', artist: '' })
  const [position, setPosition] = useState(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const { request, songKey } = lyrics

  // Estados de cada proveedor para esta canción/consulta; los de otra canción se descartan.
  const probe = (id) => {
    if (!request) return
    const key = songKey
    setStatuses((current) => ({ ...current, [id]: { state: 'loading', key } }))
    lyricsEngine.fromProvider(id, request)
      .then((result) => setStatuses((current) => (current[id]?.key === key ? { ...current, [id]: result ? { state: 'ready', synced: result.synced, key } : { state: 'none', key } } : current)))
      .catch(() => setStatuses((current) => (current[id]?.key === key ? { ...current, [id]: { state: 'error', key } } : current)))
  }

  useEffect(() => {
    if (!open || !request) return
    setStatuses({})
    LYRICS_PROVIDERS.forEach((provider) => probe(provider.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, songKey])

  // Posición: encima del botón, sin salirse de la ventana.
  useLayoutEffect(() => {
    if (!open) return undefined
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - WIDTH - 8))
      const above = rect.top > window.innerHeight - rect.bottom
      setPosition(above
        ? { left, bottom: window.innerHeight - rect.top + 8, maxHeight: rect.top - 16 }
        : { left, top: rect.bottom + 8, maxHeight: window.innerHeight - rect.bottom - 16 })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  // Cerrar al pulsar fuera o con Esc (sin cerrar también la vista extensa, que escucha Esc).
  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => {
      if (!panelRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const showing = lyrics.provider ? nameOf(lyrics.provider) : null
  const autoNote = lyrics.status === 'loading' ? 'Buscando…' : showing ? `Mostrando ${showing}` : 'Sin letra'

  function openSearch() {
    setForm({ title: lyrics.search?.title ?? request?.title ?? '', artist: lyrics.search?.artist ?? request?.artist ?? '' })
    setSearching(true)
  }

  return (
    <>
      <button
        className={open ? 'lsp__trigger lsp__trigger--open' : 'lsp__trigger'}
        type="button"
        ref={triggerRef}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {lyrics.pinnedSource && <Pin size={11} aria-hidden="true" />}
        <span>{showing ? `Letra de ${showing}` : 'Fuente de la letra'}</span>
        {lyrics.offset !== 0 && <span className="lsp__trigger-offset">{formatOffset.format(lyrics.offset)} s</span>}
        <ChevronDown className="lsp__chevron" size={13} aria-hidden="true" />
      </button>

      {open && position && createPortal(
        <div className="lsp" ref={panelRef} role="dialog" aria-label="Fuente de las letras" style={{ width: WIDTH, ...position }}>
          <header className="lsp__header">
            <strong>Fuente de las letras</strong>
            <span>Solo para esta canción.</span>
          </header>

          <div className="lsp__list" role="radiogroup" aria-label="Fuente">
            <button
              className={!lyrics.pinnedSource ? 'lsp__row lsp__row--auto lsp__row--selected' : 'lsp__row lsp__row--auto'}
              type="button"
              role="radio"
              aria-checked={!lyrics.pinnedSource}
              onClick={() => lyrics.chooseSource(null)}
            >
              <span className="lsp__auto-icon" aria-hidden="true"><Sparkles size={15} /></span>
              <span className="lsp__auto-copy"><strong>Automático</strong><small>{autoNote}</small></span>
              {!lyrics.pinnedSource && <Check className="lsp__check" size={15} aria-hidden="true" />}
            </button>
            <span className="lsp__divider" aria-hidden="true" />
            {LYRICS_PROVIDERS.map((provider) => {
              const selected = lyrics.pinnedSource === provider.id
              const status = statuses[provider.id]?.key === songKey ? statuses[provider.id] : null
              const unavailable = status?.state === 'none'
              return (
                <div
                  className={`lsp__row${selected ? ' lsp__row--selected' : ''}${unavailable ? ' lsp__row--muted' : ''}`}
                  role="radio"
                  aria-checked={selected}
                  tabIndex={0}
                  key={provider.id}
                  onClick={() => lyrics.chooseSource(provider.id)}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); lyrics.chooseSource(provider.id) } }}
                >
                  <span className={selected ? 'lsp__radio lsp__radio--on' : 'lsp__radio'} aria-hidden="true" />
                  <span className="lsp__name">{provider.name}</span>
                  <Status status={status} onRetry={() => probe(provider.id)} />
                </div>
              )
            })}
          </div>

          {lyrics.synced && (
            <section className="lsp__offset">
              <Timer size={15} aria-hidden="true" />
              <div className="lsp__offset-copy">
                <strong>Desfase</strong>
                <span>¿La letra no coincide con la voz? Ajusta el desfase.</span>
              </div>
              <div className="lsp__stepper">
                <button type="button" aria-label="Letra antes" title="Letra 0,25 s antes" onClick={() => lyrics.setOffset(lyrics.offset - OFFSET_STEP)}><Minus size={13} aria-hidden="true" /></button>
                <output aria-live="polite">{formatOffset.format(lyrics.offset)} s</output>
                <button type="button" aria-label="Letra después" title="Letra 0,25 s después" onClick={() => lyrics.setOffset(lyrics.offset + OFFSET_STEP)}><Plus size={13} aria-hidden="true" /></button>
              </div>
              <button className={lyrics.offset ? 'lsp__reset' : 'lsp__reset lsp__reset--hidden'} type="button" aria-label="Quitar desfase" title="Quitar desfase" onClick={() => lyrics.setOffset(0)}>
                <RotateCcw size={13} aria-hidden="true" />
              </button>
            </section>
          )}

          {lyrics.search && !searching && (
            <div className="lsp__searched">
              <span>Buscando «{lyrics.search.title}{lyrics.search.artist ? ` — ${lyrics.search.artist}` : ''}»</span>
              <button type="button" onClick={() => lyrics.runSearch(null)}>Restablecer</button>
            </div>
          )}
          {searching ? (
            <form
              className="lsp__search-form"
              onSubmit={(event) => { event.preventDefault(); lyrics.runSearch(form); setSearching(false) }}
            >
              <input aria-label="Título" placeholder="Título" value={form.title} autoFocus onChange={(event) => setForm({ ...form, title: event.target.value })} />
              <input aria-label="Artista" placeholder="Artista" value={form.artist} onChange={(event) => setForm({ ...form, artist: event.target.value })} />
              <div className="lsp__search-actions">
                <button type="button" onClick={() => setSearching(false)}>Cancelar</button>
                <button className="lsp__search-submit" type="submit" disabled={!form.title.trim()}>Buscar</button>
              </div>
            </form>
          ) : (
            <button className="lsp__search" type="button" onClick={openSearch}>
              <Search size={14} aria-hidden="true" />
              <span>¿Canción incorrecta? Busca por título</span>
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
