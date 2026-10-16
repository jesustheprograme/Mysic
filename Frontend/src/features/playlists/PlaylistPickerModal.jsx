import { ListPlus, Search, X } from 'lucide-react'
import { useState } from 'react'
import VerticalSpectrum from '../../components/VerticalSpectrum.jsx'

function PlaylistPickerModal({ analyser, onAdd, onClose, onCreate, playing, playlists, song }) {
  const [query, setQuery] = useState('')
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState(() => new Set(
    playlists.filter((playlist) => (
      song.source === 'youtube'
        ? playlist.externalSongs?.some((item) => item.id === song.id)
        : playlist.songIds.includes(song.id)
    )).map((playlist) => playlist.id),
  ))
  const normalizedQuery = query.trim().toLocaleLowerCase('es')
  const visiblePlaylists = normalizedQuery
    ? playlists.filter((playlist) => playlist.title.toLocaleLowerCase('es').includes(normalizedQuery))
    : playlists
  const albumTitle = song.albumTitle ?? song.album?.title ?? song.albumMemberships?.[0]?.title
  const showSpectrum = Boolean(playing && analyser)

  function togglePlaylist(playlistId, selected) {
    setSelectedPlaylistIds((currentIds) => {
      const nextIds = new Set(currentIds)
      if (selected) nextIds.add(playlistId)
      else nextIds.delete(playlistId)
      return nextIds
    })
  }

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
          <div className={`playlist-picker__song${showSpectrum ? ' playlist-picker__song--spectrum' : ''}`}>
            <img src={song.artwork} alt="" />
            <span className="playlist-picker__song-copy">
              <strong>{song.title}</strong>
              <span className="playlist-picker__song-meta">
                <small className="playlist-picker__song-artist">{song.artist}</small>
                {albumTitle && <small className="playlist-picker__song-separator" aria-hidden="true">·</small>}
                {albumTitle && <small className="playlist-picker__song-album" title={albumTitle}>{albumTitle}</small>}
              </span>
            </span>
            {showSpectrum && (
              <span className="playlist-picker__spectrum" aria-hidden="true">
                <VerticalSpectrum analyser={analyser} playing width={30} span={0.82} pitch={2.6} minBars={14} maxBars={16} thickness={1} amplitude={0.42} />
              </span>
            )}
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
              const isAdded = selectedPlaylistIds.has(playlist.id)
              return (
                <label
                  className="playlist-picker__item"
                  key={playlist.id}
                >
                  {playlist.artwork ? <img src={playlist.artwork} alt="" /> : <span className="playlist-picker__empty-art" />}
                  <span className="playlist-picker__item-copy">
                    <strong>{playlist.title}</strong>
                    <small>{playlist.songIds.length + (playlist.externalSongs?.length ?? 0)} canciones</small>
                  </span>
                  <input
                    className="playlist-picker__checkbox"
                    type="checkbox"
                    checked={isAdded}
                    aria-label={`${isAdded ? 'Quitar' : 'Añadir'} ${song.title} ${isAdded ? 'de' : 'a'} ${playlist.title}`}
                    onChange={(event) => togglePlaylist(playlist.id, event.target.checked)}
                  />
                </label>
              )
            })}
            {visiblePlaylists.length === 0 && (
              <p className="playlist-picker__empty">No encontramos playlists con ese nombre.</p>
            )}
          </div>
        </div>

        <footer className="playlist-picker__footer">
          <button className="playlist-picker__create" type="button" aria-label="Nueva playlist" title="Nueva playlist" onClick={onCreate}>
            <ListPlus size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <button className="playlist-picker__add" type="button" onClick={() => onAdd([...selectedPlaylistIds])}>Agregar</button>
        </footer>
      </section>
    </dialog>
  )
}

export default PlaylistPickerModal
