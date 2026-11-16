import { Heart, ListRestart, Music2, PinOff, X } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useMemo, useRef, useState } from 'react'
import { LIKED_ID, REPEAT_ID } from './libraryModel.js'
import { readTopPlays } from './playHistory.js'
import { prefetchHandlers } from './prefetchDetail.js'
import { CursorMenu } from './ItemMenus.jsx'
import { buildQuickAccess, moveKey } from './quickAccessModel.js'
import { dismissShortcut, setShortcutOrder, shortcutKey, useHiddenShortcuts, usePinnedShortcuts, useShortcutOrder } from './quickAccessStore.js'
import './quick-access.css'

const ICONS = { heart: Heart, repeat: ListRestart }
// Píxeles que hay que mover el puntero para que un clic pase a ser un arrastre.
const DRAG_THRESHOLD_PX = 8
const keyOf = (entry) => shortcutKey(entry.kind, entry.id)

/** Cuadrado de la izquierda: la carátula o, si no hay, el icono del acceso. */
function Cover({ entry }) {
  if (entry.thumbnail) return <img alt="" className="qa-tile__cover" decoding="async" draggable={false} loading="lazy" src={entry.thumbnail} />
  const Icon = ICONS[entry.icon] ?? Music2
  return <span className="qa-tile__cover qa-tile__cover--icon" aria-hidden="true"><Icon size={22} strokeWidth={1.8} /></span>
}

/**
 * "Accesos directos" del Inicio: tarjetas horizontales (carátula + título + detalle) a tus listas de siempre.
 * Un clic abre la lista (las canciones en repetición empiezan a sonar); arrastrar una tarjeta sobre otra las reordena
 * y la "x" de la esquina la quita. Solo se muestra si hay algo que mostrar.
 */
export default function QuickAccess({ controller, data }) {
  const { openAlbum, openArtist, openLiked, openPlaylist, playSongs } = controller
  const pinned = usePinnedShortcuts()
  const hidden = useHiddenShortcuts()
  const order = useShortcutOrder()
  const [menu, setMenu] = useState(null)
  // "En repetición" sale del historial local: se lee al montar el Inicio, igual que en la biblioteca.
  const repeat = useMemo(() => readTopPlays(), [])
  const entries = useMemo(() => buildQuickAccess(data, { hidden, order, pinned, repeat }), [data, hidden, order, pinned, repeat])

  // Arrastre con el puntero (el arrastrar y soltar nativo no llega a la página en la ventana de escritorio): mientras
  // se arrastra solo cambia un orden provisional; al soltar se guarda una vez.
  const [drag, setDrag] = useState(null) // { key, keys }
  const dragRef = useRef(null)
  const suppressClickRef = useRef(false)
  const shown = useMemo(() => {
    if (!drag) return entries
    const byKey = new Map(entries.map((entry) => [keyOf(entry), entry]))
    return drag.keys.map((key) => byKey.get(key)).filter(Boolean)
  }, [drag, entries])

  if (!entries.length) return null

  const open = (entry) => {
    if (entry.id === LIKED_ID) openLiked?.()
    else if (entry.id === REPEAT_ID) playSongs(repeat, repeat[0].id)
    else if (entry.kind === 'playlist') openPlaylist(entry.id)
    else if (entry.kind === 'album') openAlbum(entry.id)
    else if (entry.kind === 'artist') openArtist(entry.id)
    else if (entry.kind === 'song') playSongs([{ id: entry.id, title: entry.title, artist: entry.subtitle, thumbnail: entry.thumbnail }], entry.id)
  }
  const prefetch = (entry) => (entry.kind === 'playlist' || entry.kind === 'album' ? prefetchHandlers(entry.kind, entry.id) : {})

  const onPointerDown = (event, key) => {
    if (event.button !== 0) return
    dragRef.current = { active: false, key, keys: entries.map(keyOf), x: event.clientX, y: event.clientY }
  }
  const onPointerMove = (event) => {
    const current = dragRef.current
    if (!current) return
    if (!current.active) {
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < DRAG_THRESHOLD_PX) return
      current.active = true
      event.currentTarget.setPointerCapture?.(event.pointerId)
      setDrag({ key: current.key, keys: current.keys })
    }
    const over = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-qa-key]')?.dataset.qaKey
    if (!over || over === current.key) return
    const next = moveKey(current.keys, current.key, over)
    if (next === current.keys) return
    current.keys = next
    setDrag({ key: current.key, keys: next })
  }
  const endDrag = (commit) => {
    const current = dragRef.current
    dragRef.current = null
    if (!current?.active) return
    if (commit) setShortcutOrder(current.keys)
    setDrag(null)
    // El clic que sigue a soltar no debe abrir la tarjeta; si no llega (se soltó fuera), la marca se limpia sola.
    suppressClickRef.current = true
    setTimeout(() => { suppressClickRef.current = false }, 0)
  }

  return (
    <section className="qa" aria-labelledby="qa-title">
      <h2 className="qa__title" id="qa-title"><span className="qa__icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.6" /><rect x="14" y="3" width="7" height="7" rx="1.6" /><rect x="3" y="14" width="7" height="7" rx="1.6" /><rect x="14" y="14" width="7" height="7" rx="1.6" /></svg></span>Accesos directos</h2>
      <ul className={`qa__grid${drag ? ' qa__grid--dragging' : ''}`}>
        {shown.map((entry) => {
          const hover = prefetch(entry)
          const key = keyOf(entry)
          return (
            <li className={`qa__item${drag?.key === key ? ' qa__item--dragging' : ''}`} data-qa-key={key} key={key}>
              <button
                className="qa-tile"
                type="button"
                onBlur={hover.stop}
                onClick={() => { if (!suppressClickRef.current) open(entry) }}
                onContextMenu={(event) => { event.preventDefault(); setMenu({ entry, x: event.clientX, y: event.clientY }) }}
                onFocus={hover.start}
                onPointerCancel={() => endDrag(false)}
                onPointerDown={(event) => onPointerDown(event, key)}
                onPointerEnter={hover.start}
                onPointerLeave={hover.stop}
                onPointerMove={onPointerMove}
                onPointerUp={() => endDrag(true)}
              >
                <Cover entry={entry} />
                <span className="qa-tile__text">
                  <span className="qa-tile__title">{entry.title}</span>
                  <span className="qa-tile__sub">{entry.subtitle}</span>
                </span>
              </button>
              {/* Bolita con una x justo en la esquina superior derecha: quita el acceso. */}
              <button className="qa-tile__remove" type="button" aria-label={`Quitar ${entry.title} de accesos directos`} title="Quitar de accesos directos" onClick={() => dismissShortcut(entry.kind, entry.id)}>
                <X size={12} strokeWidth={2.6} aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>
      {menu && (
        <CursorMenu onClose={() => setMenu(null)} point={menu}>
          <DropdownMenuItem className="ym-item" onSelect={() => dismissShortcut(menu.entry.kind, menu.entry.id)}><PinOff size={17} strokeWidth={1.8} aria-hidden="true" /><span>Quitar de accesos directos</span></DropdownMenuItem>
        </CursorMenu>
      )}
    </section>
  )
}
