import { Check, Search, X } from 'lucide-react'
import { useState } from 'react'

function PlaylistPickerModal({ onAdd, onClose, onCreate, onManage, playlists, song }) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase('es')
  const visiblePlaylists = normalizedQuery
    ? playlists.filter((playlist) => playlist.title.toLocaleLowerCase('es').includes(normalizedQuery))
    : playlists

  return (
    <dialog className="playlist-modal playlist-picker" open aria-labelledby="playlist-picker-title" aria-modal="true">
      <section className="playlist-modal__panel playlist-picker__panel">
        <div className="playlist-modal__header playlist-picker__header">
          <h2 id="playlist-picker-title">Guardar en playlist</h2>
          <button className="playlist-modal__close" type="button" aria-label="Cerrar" title="Cerrar" onClick={onClose}>
            <X size={21} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </div>

        <div className="playlist-picker__content">
          <div className="playlist-picker__song">
            <img src={song.artwork} alt="" />
            <span>
              <strong>{song.title}</strong>
              <small>{song.artist}</small>
            </span>
          </div>

          <label className="playlist-picker__search">
            <Search size={21} strokeWidth={1.6} aria-hidden="true" />
            <input
              type="search"
              value={query}
              autoFocus
              placeholder="Buscar playlist"
              aria-label="Buscar playlist"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className="playlist-picker__list">
            {visiblePlaylists.map((playlist) => {
              const isAdded = playlist.songIds.includes(song.id)
              return (
                <button
                  className="playlist-picker__item"
                  key={playlist.id}
                  type="button"
                  disabled={isAdded}
                  aria-label={
                    isAdded
                      ? `${playlist.title} ya contiene ${song.title}`
                      : `Añadir ${song.title} a ${playlist.title}`
                  }
                  onClick={() => onAdd(playlist.id)}
                >
                  {playlist.artwork ? <img src={playlist.artwork} alt="" /> : <span className="playlist-picker__empty-art" />}
                  <span className="playlist-picker__item-copy">
                    <strong>{playlist.title}</strong>
                    <small>{playlist.songIds.length} canciones</small>
                  </span>
                  <span
                    className={`playlist-picker__add${isAdded ? ' playlist-picker__add--added' : ''}`}
                  >
                    {isAdded && <Check size={18} strokeWidth={1.8} aria-hidden="true" />}
                    <span>{isAdded ? 'A\u00f1adida' : 'A\u00f1adir'}</span>
                  </span>
                </button>
              )
            })}
            {visiblePlaylists.length === 0 && (
              <p className="playlist-picker__empty">No encontramos playlists con ese nombre.</p>
            )}
          </div>
        </div>

        <footer className="playlist-picker__footer">
          <button className="playlist-picker__create" type="button" onClick={onCreate}>Nueva playlist</button>
          <button className="playlist-picker__manage" type="button" onClick={onManage}>Gestionar</button>
        </footer>
      </section>
    </dialog>
  )
}

export default PlaylistPickerModal
