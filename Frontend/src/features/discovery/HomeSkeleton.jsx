import './skeleton.css'

const CARD_COUNT = 6
const ROW_COUNT = 5

function CardSkeleton() {
  return (
    <div className="skeleton-card">
      <span className="skeleton skeleton-card__cover" />
      <span className="skeleton skeleton-line skeleton-line--title" />
      <span className="skeleton skeleton-line skeleton-line--meta" />
    </div>
  )
}

function RowSkeleton() {
  return (
    <div className="skeleton-row">
      <span className="skeleton skeleton-row__thumb" />
      <span className="skeleton-row__copy">
        <span className="skeleton skeleton-line skeleton-line--title" />
        <span className="skeleton skeleton-line skeleton-line--meta" />
      </span>
      <span className="skeleton skeleton-line skeleton-line--time" />
    </div>
  )
}

/**
 * Esqueleto del inicio mientras llega el catálogo. Reproduce la forma del contenido real
 * (una fila de tarjetas y una lista) para que la página no salte al cargar y no parezca vacía.
 */
export default function HomeSkeleton() {
  return (
    <div className="home-skeleton" role="status" aria-busy="true" aria-label="Cargando catálogo">
      <span className="skeleton skeleton-heading" />
      <div className="skeleton-rail">
        {Array.from({ length: CARD_COUNT }, (_, index) => <CardSkeleton key={index} />)}
      </div>
      <span className="skeleton skeleton-heading" />
      <div className="skeleton-list">
        {Array.from({ length: ROW_COUNT }, (_, index) => <RowSkeleton key={index} />)}
      </div>
    </div>
  )
}
