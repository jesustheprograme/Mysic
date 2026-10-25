import { Download, LoaderCircle, Radio, Trash2 } from 'lucide-react'
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import PlayerDock from '../../components/PlayerDock.jsx'
import { connectAudioAnalyser, disconnectAudioAnalyser, resumeAudioContext } from '../../lib/audioAnalyser.js'
import useGlobalMiniPlayer from '../mini-player/useGlobalMiniPlayer.js'
import { useBrowse } from './hooks/useBrowse.js'
import { useDownloads } from './hooks/useDownloads.js'
import { usePlayer } from './hooks/usePlayer.js'
import { adaptSong } from './lib/adapters.js'
import { api } from './lib/api.js'
import { readStorage, writeStorage } from './lib/storage.js'
import YoutubeCatalogContent from './YoutubeCatalogContent.jsx'

function useFavoriteIds(storageKey) {
  const [ids, setIds] = useState(() => new Set(readStorage(storageKey, [])))
  function toggle(id, liked) {
    setIds((current) => {
      const next = new Set(current)
      if (liked) next.add(id)
      else next.delete(id)
      writeStorage(storageKey, [...next])
      return next
    })
  }
  return [ids, toggle]
}

function getScrollTargets(workspace) {
  const content = workspace?.closest('.music-app__content')
  if (!workspace || !content) return []
  return [content, workspace.querySelector('.artist-profile__content'), workspace.querySelector('.collection-detail__tracks')].filter(Boolean)
}

function YoutubeView({ active = true, onAddToPlaylist, onPlayerCollapseToggle, onPlayerVisibilityChange, playerCollapsed = false, playbackRequest, searchRequest, stopNonce = 0 }) {
  const scrollPositionsRef = useRef(new Map())
  const workspaceRef = useRef(null)
  const queueRequestRef = useRef(null)
  const browse = useBrowse({ progressive: true })
  const downloads = useDownloads()
  const [likedSongIds, toggleSongFavorite] = useFavoriteIds('mysic:youtube:favorite-songs')
  const [likedArtistIds, toggleArtistFavorite] = useFavoriteIds('mysic:youtube:favorite-artists')
  const [likedAlbumIds, toggleAlbumFavorite] = useFavoriteIds('mysic:youtube:favorite-albums')
  const [account, setAccount] = useState(null)
  const [accountHelpOpen, setAccountHelpOpen] = useState(false)
  const [accountBusy, setAccountBusy] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [actionError, setActionError] = useState('')
  const [queueLoadingKey, setQueueLoadingKey] = useState(null)
  const player = usePlayer({ enabled: active, isDownloaded: downloads.isDownloaded, onPlayerVisibilityChange })
  const playRequestedSong = useEffectEvent((song) => player.playFrom([song], 0))
  const closeRequestedPlayer = useEffectEvent(() => player.closePlayer())
  const playerAudioRef = player.audioProps.ref
  const playerSongId = player.currentSong?.id
  const playerUsesLocalAudio = player.isLocal
  const [playerAnalyser, setPlayerAnalyser] = useState(null)
  const openMiniPlayer = useGlobalMiniPlayer(player, browse)
  const refreshPersonalizedHome = useEffectEvent(() => browse.showHome())
  const applyHeaderSearch = useEffectEvent((request) => {
    browse.setQuery(request.query)
    if (request.nonce > 0) browse.runSearch(request.query, 'all')
  })
  const warmHeaderSearch = useEffectEvent((query) => browse.prefetchSearch(query))

  useEffect(() => {
    if (!searchRequest?.query.trim()) return undefined
    applyHeaderSearch(searchRequest)
    const timer = setTimeout(() => warmHeaderSearch(searchRequest.query), 180)
    return () => clearTimeout(timer)
  }, [searchRequest])

  useEffect(() => {
    const controller = new AbortController()
    api.account(controller.signal).then(setAccount).catch((error) => {
      if (error.name !== 'AbortError') setAccount(null)
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (account?.status !== 'pending') return undefined
    const controller = new AbortController()
    let polling = false
    const poll = () => {
      if (polling) return
      polling = true
      api.accountLinkStatus(controller.signal).then((nextAccount) => {
        setAccount(nextAccount)
        if (nextAccount.connected) {
          setAccountError('')
          refreshPersonalizedHome()
        } else if (nextAccount.status === 'error') {
          setAccountError(nextAccount.error || 'No se pudo completar la vinculación.')
        }
      }).catch((error) => {
        if (error.name !== 'AbortError') {
          setAccountError(error.message || 'No se pudo comprobar la vinculación.')
        }
      }).finally(() => {
        polling = false
      })
    }
    const timer = setInterval(poll, Math.max(2000, Number(account.interval || 3) * 1000))
    poll()
    return () => {
      clearInterval(timer)
      controller.abort()
    }
  }, [account?.status, account?.interval])

  useEffect(() => () => queueRequestRef.current?.abort(), [])
  useEffect(() => { setActionError('') }, [browse.view.kind])

  useEffect(() => {
    const audio = playerAudioRef.current
    if (!playerUsesLocalAudio || !audio) {
      setPlayerAnalyser(null)
      return undefined
    }
    const analyser = connectAudioAnalyser(audio)
    const resumeAnalyser = () => resumeAudioContext().catch(() => {})
    audio.addEventListener('play', resumeAnalyser)
    setPlayerAnalyser(analyser)
    return () => {
      audio.removeEventListener('play', resumeAnalyser)
      disconnectAudioAnalyser(audio)
      setPlayerAnalyser(null)
    }
  }, [playerAudioRef, playerSongId, playerUsesLocalAudio])

  const { loadSection } = browse
  const { results } = browse
  useEffect(() => {
    if (results?.type !== 'all') return
    if (results.pending?.includes('artist')) void loadSection('artist')
    if (results.pending?.includes('album')) void loadSection('album')
  }, [loadSection, results?.pending, results?.query, results?.type])

  useEffect(() => {
    if (playbackRequest?.song?.id) playRequestedSong(playbackRequest.song)
  }, [playbackRequest?.nonce, playbackRequest?.song, playbackRequest?.song?.id])

  const previousStopNonceRef = useRef(stopNonce)
  useEffect(() => {
    if (stopNonce === previousStopNonceRef.current) return
    previousStopNonceRef.current = stopNonce
    closeRequestedPlayer()
  }, [stopNonce])

  function playSongs(sourceSongs, songId) {
    const index = sourceSongs.findIndex((song) => song.id === songId)
    if (index >= 0) player.playFrom(sourceSongs, index)
  }

  function toggleDownload(song) {
    if (downloads.downloadedIds.has(song.id)) downloads.deleteDownload(song.id)
    else downloads.downloadSong(song)
  }

  async function loadQueue(key, loader) {
    queueRequestRef.current?.abort()
    const controller = new AbortController()
    queueRequestRef.current = controller
    setActionError('')
    setQueueLoadingKey(key)
    try {
      const queue = await loader(controller.signal)
      if (!queue.songs?.length) throw new Error('Esta selección no tiene canciones reproducibles.')
      if (queueRequestRef.current === controller) player.playFrom(queue.songs, 0)
    } catch (error) {
      if (error.name !== 'AbortError') setActionError(error.message || 'No se pudo iniciar la reproducción.')
    } finally {
      if (queueRequestRef.current === controller) {
        queueRequestRef.current = null
        setQueueLoadingKey(null)
      }
    }
  }

  function startRadio(song) {
    void loadQueue(`radio:${song.id}`, (signal) => api.radio(song.id, signal))
  }
  function startPlaylist(playlistId) {
    void loadQueue(`playlist:${playlistId}`, (signal) => api.playlist(playlistId, signal))
  }

  function renderSongActions(song) {
    const job = downloads.downloads.jobs[song.id]
    const downloaded = downloads.downloadedIds.has(song.id)
    const busy = job?.status === 'downloading'
    const Icon = busy ? LoaderCircle : downloaded ? Trash2 : Download
    const label = downloaded ? `Eliminar descarga de ${song.title}` : `Descargar ${song.title}`
    const startingRadio = queueLoadingKey === `radio:${song.id}`
    return (
      <>
        <button className="song-row__action collection-detail__track-action" type="button" aria-label={`Iniciar radio de ${song.title}`} title="Iniciar radio" disabled={startingRadio} onClick={() => startRadio(song)}>
          {startingRadio ? <LoaderCircle className="yt-spin" size={16} aria-hidden="true" /> : <Radio size={16} strokeWidth={1.8} aria-hidden="true" />}
        </button>
        <button className="song-row__action collection-detail__track-action" type="button" aria-label={label} title={label} disabled={busy || (!downloads.online && !downloaded)} onClick={() => toggleDownload(song)}>
          <Icon className={busy ? 'yt-spin' : undefined} size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </>
    )
  }

  const workspaceKey = browse.view.data?.id
    ? `${browse.view.kind}-${browse.view.data.id}`
    : browse.view.kind === 'recommendations' && playerSongId
      ? `${browse.view.kind}-${playerSongId}`
      : browse.view.kind

  function saveCurrentScrollPosition() {
    const positions = getScrollTargets(workspaceRef.current).map((target) => target.scrollTop)
    scrollPositionsRef.current.set(workspaceKey, positions)
  }
  function openArtist(artistId) {
    saveCurrentScrollPosition()
    browse.openArtist(artistId)
  }
  function openAlbum(albumId) {
    saveCurrentScrollPosition()
    browse.openAlbum(albumId)
  }
  function openArtistSongs(artistId) {
    saveCurrentScrollPosition()
    browse.openArtistSongs(artistId)
  }
  function showDownloads() {
    saveCurrentScrollPosition()
    browse.showDownloads()
  }
  function changeTab(type) {
    saveCurrentScrollPosition()
    browse.changeTab(type)
  }
  function goBack() {
    saveCurrentScrollPosition()
    browse.goBack()
  }

  useLayoutEffect(() => {
    if (!active) return undefined
    const scrollTargets = getScrollTargets(workspaceRef.current)
    if (!scrollTargets.length) return undefined
    const savedPositions = scrollPositionsRef.current.get(workspaceKey)
    scrollTargets.forEach((target, index) => target.scrollTo({ top: savedPositions?.[index] ?? 0, behavior: 'instant' }))
  }, [active, workspaceKey])

  function selectSearchEntity(entity) {
    if (entity.kind === 'song' && entity.song) player.playFrom([entity.song], 0)
    if (entity.kind === 'artist') openArtist(entity.id)
    if (entity.kind === 'album') openAlbum(entity.id)
  }

  async function startAccountLink() {
    setAccountBusy(true)
    setAccountError('')
    try {
      setAccount(await api.startAccountLink())
    } catch (error) {
      setAccountError(error.message || 'No se pudo iniciar la vinculación.')
    } finally {
      setAccountBusy(false)
    }
  }

  async function connectMusicSession(requestText) {
    setAccountBusy(true)
    setAccountError('')
    try {
      const nextAccount = await api.connectMusicSession(requestText)
      setAccount(nextAccount)
      browse.showHome()
      return true
    } catch (error) {
      setAccountError(error.message || 'No se pudo validar la sesión de YouTube Music.')
      return false
    } finally {
      setAccountBusy(false)
    }
  }

  async function disconnectAccount() {
    setAccountBusy(true)
    setAccountError('')
    try {
      setAccount(await api.unlinkAccount())
      browse.showHome()
    } catch (error) {
      setAccountError(error.message || 'No se pudo desvincular la cuenta.')
    } finally {
      setAccountBusy(false)
    }
  }

  const controller = {
    account, accountBusy, accountError, accountHelpOpen, actionError, browse, changeTab, connectMusicSession, disconnectAccount, downloads, goBack, likedAlbumIds,
    likedArtistIds, likedSongIds, onAddToPlaylist, openAlbum, openArtist, openArtistSongs, player, playSongs,
    renderSongActions, searchType: browse.searchType, selectSearchEntity, setAccountHelpOpen, startAccountLink,
    showDownloads, startPlaylist, toggleAlbumFavorite, toggleArtistFavorite, toggleSongFavorite,
  }
  const root = document.getElementById('music-home')
  const currentTrack = player.currentSong ? adaptSong(player.currentSong) : null

  return (
    <div className="youtube-catalog">
      <main className="music-app__main">
        <div className="music-workspace" key={workspaceKey} ref={workspaceRef}>
          <YoutubeCatalogContent controller={controller} />
        </div>
      </main>
      <audio {...player.audioProps}><track default kind="captions" label="Sin contenido hablado" src="/music-captions.vtt" srcLang="es" /></audio>
      <div ref={player.iframeHostRef} className="youtube-player-engine" aria-hidden="true" />
      {currentTrack && root && createPortal(
        <PlayerDock
          collapsed={playerCollapsed}
          externalPlayback={{ analyser: playerAnalyser, commitSeek: player.commitSeek, currentIndex: player.currentIndex, currentTime: player.currentTime, duration: player.progressMax, error: player.playerError, handleSeek: player.handleSeek, isBuffering: player.isBuffering, isPlaying: player.isPlaying, setVolume: player.setVolume, togglePlayback: player.togglePlay, volume: player.volume }}
          onClose={player.closePlayer}
          onOpenMiniPlayer={() => openMiniPlayer().catch(() => {})}
          onNext={player.playNext}
          onPrevious={player.playPrev}
          onQueueSelect={(index) => player.playFrom(player.queue, index)}
          onToggleCollapsed={onPlayerCollapseToggle}
          liked={likedSongIds.has(player.currentSong.id)}
          onToggleFavorite={(liked) => toggleSongFavorite(player.currentSong.id, liked)}
          queue={player.queue.map(adaptSong)}
          track={currentTrack}
        />,
        root,
      )}
    </div>
  )
}

export default YoutubeView
