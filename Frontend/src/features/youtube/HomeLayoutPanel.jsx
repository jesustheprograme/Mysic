import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, LayoutGrid, RotateCcw, Check, X } from 'lucide-react'
import { useEffect } from 'react'
import { CARD_SIZES, setAllHidden, toggleHidden, withOrder } from './homeLayout.js'
import './home-layout.css'

function SizePreview({ size }) {
  const count = size === 'small' ? 4 : size === 'medium' ? 3 : 2
  return <span className={`hl-size__preview hl-size__preview--${size}`} aria-hidden="true">{Array.from({ length: count }, (_, index) => <i key={index} />)}</span>
}

function SectionRow({ section, onToggle }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: section.key })
  return (
    <li
      className={`hl-row${isDragging ? ' hl-row--dragging' : ''}${section.hidden ? ' hl-row--hidden' : ''}`}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button className="hl-row__handle" type="button" ref={setActivatorNodeRef} aria-label={`Mover ${section.title}. Usa espacio y las flechas del teclado.`} {...attributes} {...listeners}>
        <GripVertical size={16} aria-hidden="true" />
      </button>
      <span className="hl-row__title">{section.title}</span>
      <button className="hl-switch" type="button" role="switch" aria-checked={!section.hidden} aria-label={`Mostrar ${section.title}`} onClick={() => onToggle(section.key)} />
    </li>
  )
}

/**
 * Panel lateral "Editar inicio": tamaño de tarjetas, secciones visibles y su orden.
 * Los cambios se aplican al momento sobre la página (no hay botón de guardar).
 */
export default function HomeLayoutPanel({ layout, onChange, onClose, onReset, sections }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const keys = sections.map((section) => section.key)
  const visibleCount = sections.filter((section) => !section.hidden).length
  const allVisible = visibleCount === sections.length

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <aside className="hl-panel" role="dialog" aria-label="Editar inicio">
      <header className="hl-panel__header">
        <span className="hl-panel__icon" aria-hidden="true"><LayoutGrid size={20} /></span>
        <div>
          <h2>Editar inicio</h2>
          <p>Los cambios aparecen en la página cuando los haces.</p>
        </div>
        <button className="hl-panel__close" type="button" aria-label="Cerrar" onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </header>

      <div className="hl-panel__body">
        <section className="hl-card">
          <h3>Tamaño de tarjetas</h3>
          <p>Qué tan grandes se ven los álbumes, playlists y artistas en las secciones.</p>
          <div className="hl-sizes" role="radiogroup" aria-label="Tamaño de tarjetas">
            {Object.entries(CARD_SIZES).map(([id, size]) => (
              <button className={`hl-size${layout.cardSize === id ? ' hl-size--active' : ''}`} type="button" role="radio" aria-checked={layout.cardSize === id} key={id} onClick={() => onChange((current) => ({ ...current, cardSize: id }))}>
                <SizePreview size={id} />
                <span>{size.label}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="hl-sections__head">
          <h3>Secciones</h3>
          <span>{visibleCount} de {sections.length} visibles</span>
          <button type="button" onClick={() => onChange((current) => setAllHidden(current, keys, allVisible))}>{allVisible ? 'Desactivar todos' : 'Activar todos'}</button>
        </div>

        <DndContext
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          sensors={sensors}
          onDragEnd={({ active, over }) => {
            if (!over || active.id === over.id) return
            onChange((current) => withOrder(current, arrayMove(keys, keys.indexOf(active.id), keys.indexOf(over.id))))
          }}
        >
          <SortableContext items={keys} strategy={verticalListSortingStrategy}>
            <ul className="hl-rows">
              {sections.map((section) => <SectionRow key={section.key} section={section} onToggle={(key) => onChange((current) => toggleHidden(current, key))} />)}
            </ul>
          </SortableContext>
        </DndContext>
        <p className="hl-hint">Arrastra una sección para moverla, o selecciona su botón de arrastre y usa las flechas. Las secciones ocultas conservan su posición.</p>
      </div>

      <footer className="hl-panel__footer">
        <button className="hl-reset" type="button" onClick={onReset}><RotateCcw size={16} aria-hidden="true" /> Restablecer</button>
        <button className="hl-done" type="button" onClick={onClose}><Check size={16} aria-hidden="true" /> Listo</button>
      </footer>
    </aside>
  )
}
