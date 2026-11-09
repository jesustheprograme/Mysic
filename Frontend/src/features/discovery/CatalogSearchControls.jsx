import FavoriteSearch from './FavoriteSearch.jsx'

const CATALOG_SEARCH_TABS = [
  { type: 'all', label: 'Todo' },
  { type: 'song', label: 'Canciones' },
  { type: 'artist', label: 'Artistas' },
  { type: 'album', label: 'Álbumes' },
]

// "Vídeos" es opcional: no todas las vistas que usan estos filtros saben mostrarlos.
const VIDEO_TAB = { type: 'video', label: 'Vídeos' }

export default function CatalogSearchControls({
  activeType,
  className = '',
  downloadsActive = false,
  downloadsLabel = 'Descargas',
  includeVideos = false,
  label = 'Buscar canciones, artistas o álbumes',
  onDownloadsSelect,
  onSubmit,
  onTypeSelect,
  onQueryChange,
  query,
  showField = true,
  showDownloads = true,
}) {
  return (
    <div className={`catalog-search__controls${className ? ` ${className}` : ''}`}>
      <nav className="catalog-search__filters" aria-label="Tipo de contenido">
        {(includeVideos ? [...CATALOG_SEARCH_TABS.slice(0, 2), VIDEO_TAB, ...CATALOG_SEARCH_TABS.slice(2)] : CATALOG_SEARCH_TABS).map((tab) => (
          <button
            className={!downloadsActive && tab.type === activeType ? 'catalog-search__filter catalog-search__filter--active' : 'catalog-search__filter'}
            type="button"
            aria-pressed={!downloadsActive && tab.type === activeType}
            key={tab.type}
            onClick={() => onTypeSelect(tab.type)}
          >
            {tab.label}
          </button>
        ))}
        {showDownloads && (
          <button
            className={downloadsActive ? 'catalog-search__filter catalog-search__filter--active' : 'catalog-search__filter'}
            type="button"
            aria-pressed={downloadsActive}
            onClick={onDownloadsSelect}
          >
            {downloadsLabel}
          </button>
        )}
      </nav>
      {showField && (
        <form className="catalog-search__form" onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
          <FavoriteSearch label={label} value={query} onChange={onQueryChange} />
        </form>
      )}
    </div>
  )
}
