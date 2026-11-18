import { ListPlus, LoaderCircle, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import VerticalSpectrum from '../../components/VerticalSpectrum.jsx'
import { sizedImage } from '../../lib/imageSize.js'
import { api } from '../youtube/lib/api.js'
import { getPlaylistTrackCount, playlistHasTrack } from './playlistTracks.js'
import { targetChanges, targetsErrorMessage, withLibraryArt, youtubeVideoIdOf } from './youtubeTargets.js'

const plural = (count) => (count == null ? null : `${count.toLocaleString('es-ES')} ${count === 1 ? 'canción' : 'canciones'}`)

/**
 * Playlists de YouTube Music donde se puede guardar la canción (las propias) y si ya la tienen. Las da el servidor
 * con la sesión vinculada, igual que el diálogo de YouTube Music.
 */
function useYoutubeTargets(videoId, libraryPlaylists) {
  const [state, setState] = useState({ status: videoId ? 'loading' : 'none', playlists: [], error: null })
  useEffect(() => {
    if (!videoId) return undefined
    const controller = new AbortController()
    api.playlistTargets(videoId, controller.signal)
      .then((data) => setState({ status: 'ready', playlists: withLibraryArt(data?.playlists ?? [], libraryPlaylists), error: null }))
      .catch((error) => { if (!controller.signal.aborted) setState({ status: 'error', playlists: [], error: targetsErrorMessage(error) }) })
    return () => controller.abort()
    // La biblioteca solo aporta portadas: no hace falta volver a pedir si cambia mientras está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])
  return state
}

function PlaylistPickerModal({ analyser, libraryPlaylists = [], onAdd, onClose, onCreate, playing, playlists, song }) {
  const [query, setQuery] = useState('')
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState(() => new Set(
    playlists.filter((playlist) => playlistHasTrack(playlist, song)).map((playlist) => playlist.id),
  ))
  const videoId = youtubeVideoIdOf(song)
  const youtube = useYoutubeTargets(videoId, libraryPlaylists)
  // Marcas de YouTube: null hasta que llegan (entonces valen lo que YouTube dice que ya tiene la canción).
  const [youtubeSelected, setYoutubeSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const checkedOnYoutube = youtubeSelected ?? new Set(youtube.playlists.filter((target) => target.contains).map((target) => target.id))

  const normalizedQuery = query.trim().toLocaleLowerCase('es')
  const matches = (title) => !normalizedQuery || title.toLocaleLowerCase('es').includes(normalizedQuery)
  const visiblePlaylists = playlists.filter((playlist) => matches(playlist.title))
  const visibleTargets = youtube.playlists.filter((target) => matches(target.title))
  const albumTitle = song.albumTitle ?? song.album?.title ?? song.albumMemberships?.[0]?.title
  const showSpectrum = Boolean(playing && analyser)
  const showYoutube = youtube.status !== 'none'
  const nothingVisible = !visiblePlaylists.length && !visibleTargets.length && youtube.status !== 'loading' && youtube.status !== 'error'

  function togglePlaylist(playlistId, selected) {
    setSelectedPlaylistIds((currentIds) => {
      const nextIds = new Set(currentIds)
      if (selected) nextIds.add(playlistId)
      else nextIds.delete(playlistId)
      return nextIds
    })
  }

  function toggleTarget(targetId, selected) {
    const next = new Set(checkedOnYoutube)
    if (selected) next.add(targetId)
    else next.delete(targetId)
    setYoutubeSelected(next)
  }

  async function save() {
    setSaving(true)
    setSaveError(null)
    // YouTube primero: si falla, el diálogo sigue abierto con el motivo y nada local cambió todavía.
    const changes = targetChanges(youtube.playlists, checkedOnYoutube)
    const results = await Promise.allSettled(changes.map((change) => api.setInPlaylist(change.id, videoId, change.add)))
    const failed = results.find((result) => result.status === 'rejected')
    if (failed) {
      setSaving(false)
      setSaveError(targetsErrorMessage(failed.reason))
      return
    }
    const localOk = playlists.length ? await onAdd([...selectedPlaylistIds]) : true
    setSaving(false)
    if (localOk) onClose()
  }

  const renderTarget = (target) => {
    const checked = checkedOnYoutube.has(target.id)
    return (
      <label className="playlist-picker__item" key={`yt-${target.id}`}>
        {target.thumbnail ? <img loading="lazy" decoding="async" src={sizedImage(target.thumbnail, 48)} alt="" /> : <span className="playlist-picker__empty-art" />}
        <span className="playlist-picker__item-copy">
          <strong>{target.title}</strong>
          <small>{[plural(target.count), target.privacy === 'PRIVATE' ? 'Privada' : target.privacy === 'UNLISTED' ? 'Oculta' : null].filter(Boolean).join(' · ') || 'YouTube Music'}</small>
        </span>
        <input
          className="playlist-picker__checkbox"
          type="checkbox"
          checked={checked}
          disabled={saving}
          aria-label={`${checked ? 'Quitar' : 'Añadir'} ${song.title} ${checked ? 'de' : 'a'} ${target.title}`}
          onChange={(event) => toggleTarget(target.id, event.target.checked)}
        />
      </label>
    )
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
            <img loading="lazy" decoding="async" src={song.artwork ?? song.thumbnail} alt="" />
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

          <div className="playlist-picker__list" aria-busy={youtube.status === 'loading'}>
            {showYoutube && (
              <>
                {visiblePlaylists.length > 0 && <h3 className="playlist-picker__group">YouTube Music</h3>}
                {youtube.status === 'loading' && (
                  <p className="playlist-picker__status" role="status"><LoaderCircle className="playlist-picker__spinner" size={16} aria-hidden="true" />Cargando tus playlists…</p>
                )}
                {youtube.status === 'error' && <p className="playlist-picker__status playlist-picker__status--error" role="alert">{youtube.error}</p>}
                {youtube.status === 'ready' && !youtube.playlists.length && !normalizedQuery && (
                  <p className="playlist-picker__status">Aún no tienes playlists propias en YouTube Music.</p>
                )}
                {visibleTargets.map(renderTarget)}
                {visiblePlaylists.length > 0 && <h3 className="playlist-picker__group">En Mysic</h3>}
              </>
            )}
            {visiblePlaylists.map((playlist) => {
              const isAdded = selectedPlaylistIds.has(playlist.id)
              return (
                <label
                  className="playlist-picker__item"
                  key={playlist.id}
                >
                  {playlist.artwork ? <img loading="lazy" decoding="async" src={playlist.artwork} alt="" /> : <span className="playlist-picker__empty-art" />}
                  <span className="playlist-picker__item-copy">
                    <strong>{playlist.title}</strong>
                    <small>{getPlaylistTrackCount(playlist)} canciones</small>
                  </span>
                  <input
                    className="playlist-picker__checkbox"
                    type="checkbox"
                    checked={isAdded}
                    disabled={saving}
                    aria-label={`${isAdded ? 'Quitar' : 'Añadir'} ${song.title} ${isAdded ? 'de' : 'a'} ${playlist.title}`}
                    onChange={(event) => togglePlaylist(playlist.id, event.target.checked)}
                  />
                </label>
              )
            })}
            {nothingVisible && (
              <p className="playlist-picker__empty">{normalizedQuery ? 'No encontramos playlists con ese nombre.' : 'Aún no tienes playlists.'}</p>
            )}
          </div>
        </div>

        <footer className="playlist-picker__footer">
          <button className="playlist-picker__create" type="button" aria-label="Nueva playlist" title="Nueva playlist" onClick={onCreate}>
            <ListPlus size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
          {saveError && <p className="playlist-picker__save-error" role="alert">{saveError}</p>}
          <button className="playlist-picker__add" type="button" disabled={saving || youtube.status === 'loading'} onClick={save}>
            {saving ? 'Guardando…' : 'Agregar'}
          </button>
        </footer>
      </section>
    </dialog>
  )
}

export default PlaylistPickerModal
