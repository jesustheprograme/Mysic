// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/App.jsx
// Composición de la aplicación: buscador, pestañas, vista activa y reproductor.
// La lógica vive en los hooks (hooks/), la interfaz en components/ y views/.
import './styles/base.css'
import './styles/layout.css'
import './styles/search.css'
import './styles/results.css'
import './styles/songs.css'
import './styles/detail.css'
import './styles/artist.css'
import './styles/downloads.css'
import './styles/player.css'
import { SearchBox } from './components/SearchBox.jsx';
import { Player } from './components/Player.jsx';
import { BackIcon, DownloadIcon, OfflineIcon, Spinner } from './components/icons.jsx';
import { useBrowse, SEARCH_TABS } from './hooks/useBrowse.js';
import { useDownloads } from './hooks/useDownloads.js';
import { usePlayer } from './hooks/usePlayer.js';
import { AlbumView } from './views/AlbumView.jsx';
import { ArtistView } from './views/ArtistView.jsx';
import { DownloadsView } from './views/DownloadsView.jsx';
import { SearchResults } from './views/SearchResults.jsx';

/**
 * @param {{ active?: boolean }} props
 *   active = false cuando la vista está montada pero oculta (p. ej. otra sección
 *   de Mysic): la música sigue sonando pero los atajos de teclado no actúan.
 */
function YoutubeView({ active = true, PlayerPanelComponent, VolumeControlComponent }) {
  const browse = useBrowse();
  const dl = useDownloads();
  const player = usePlayer({ isDownloaded: dl.isDownloaded, enabled: active });

  const { view, loading, error } = browse;

  // Props comunes para cualquier lista de canciones
  const songListProps = {
    currentId: player.currentSong?.id,
    isPlaying: player.isPlaying,
    onPlay: player.playFrom,
    onPlayShuffled: player.playShuffled,
    onTogglePlay: player.togglePlay,
    onOpenArtist: browse.openArtist,
    onOpenAlbum: browse.openAlbum,
    downloadedIds: dl.downloadedIds,
    jobs: dl.downloads.jobs,
    onDownload: dl.downloadSong,
    onDownloadMany: dl.downloadMany,
    onDeleteDownload: dl.deleteDownload,
    online: dl.online,
  };

  // Qué hacer al elegir una entidad del desplegable de sugerencias
  const handlePickEntity = (entity) => {
    if (entity.kind === 'artist') browse.openArtist(entity.id);
    else if (entity.kind === 'album') browse.openAlbum(entity.id);
    else if (entity.kind === 'song' && entity.song) player.playFrom([entity.song], 0);
  };

  // .yt-app aísla los estilos: dentro de otra app todas las reglas van prefijadas con él
  return (
    <div className="yt-app">
    <div className="app">
      <main className={`content${view.kind === 'artist' ? ' content--wide' : ''}`}>
        {view.kind === 'search' && (
          <header className="browse-intro">
            <div>
              <p className="browse-intro__eyebrow">Catálogo en línea</p>
              <h1 className="browse-intro__title">YouTube Music</h1>
              <p className="browse-intro__copy">Encuentra música y reprodúcela sin salir de Mysic.</p>
            </div>
            <span className="browse-intro__status">
              <span aria-hidden="true" /> Disponible
            </span>
          </header>
        )}

        {view.kind === 'search' && (
          <div className="search-stage">
            <SearchBox
              value={browse.query}
              onChange={browse.setQuery}
              onSubmit={(text) => browse.runSearch(text, browse.searchType)}
              onPickEntity={handlePickEntity}
              history={browse.history}
              onRemoveHistory={browse.removeFromHistory}
              loading={loading}
            />
          </div>
        )}

        {(view.kind === 'search' || view.kind === 'downloads') && (
        <div className="tabs" role="tablist" aria-label="Tipo de contenido">
          {SEARCH_TABS.map((tab) => {
            const isActive = view.kind !== 'downloads' && browse.searchType === tab.type;
            return (
              <button
                key={tab.type}
                role="tab"
                aria-selected={isActive}
                className={`tab${isActive ? ' tab--active' : ''}`}
                onClick={() => browse.changeTab(tab.type)}
              >
                {tab.label}
              </button>
            );
          })}
          <button
            role="tab"
            aria-selected={view.kind === 'downloads'}
            className={`tab tab--downloads${view.kind === 'downloads' ? ' tab--active' : ''}`}
            onClick={browse.showDownloads}
          >
            <DownloadIcon /> Descargas
            {dl.downloads.items.length > 0 && <span className="tab-count">{dl.downloads.items.length}</span>}
            {dl.activeJobs > 0 && <Spinner small />}
          </button>
        </div>
        )}

        {!dl.online && (
          <p className="offline-banner">
            <OfflineIcon /> Sin conexión a internet. Solo puedes escuchar las canciones descargadas.
          </p>
        )}

        {view.kind === 'album' && (
          <button className="back" onClick={browse.goBack}>
            <BackIcon /> Volver a resultados
          </button>
        )}

        {error && <p className="message error">{error}</p>}
        {loading && view.kind !== 'search' && <p className="message message--surface">Cargando contenido…</p>}

        {view.kind === 'search' && (
          <SearchResults
            results={browse.results}
            loading={loading}
            error={error}
            songListProps={songListProps}
            onOpenArtist={browse.openArtist}
            onOpenAlbum={browse.openAlbum}
            onShowAll={browse.changeTab}
          />
        )}
        {view.kind === 'artist' && (
          <ArtistView
            artist={view.data}
            songListProps={songListProps}
            onOpenAlbum={browse.openAlbum}
            onBack={browse.goBack}
          />
        )}
        {view.kind === 'album' && (
          <AlbumView album={view.data} songListProps={songListProps} onOpenArtist={browse.openArtist} />
        )}
        {view.kind === 'downloads' && <DownloadsView downloads={dl.downloads} songListProps={songListProps} />}
      </main>

      <Player
        player={player}
        onOpenArtist={browse.openArtist}
        PlayerPanelComponent={PlayerPanelComponent}
        VolumeControlComponent={VolumeControlComponent}
      />
    </div>
    </div>
  );
}

export default YoutubeView;
