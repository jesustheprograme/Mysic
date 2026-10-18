import { useCallback, useEffect, useEffectEvent } from 'react'
import { claimMiniPlayer, ownsMiniPlayer, listenToMiniPlayerCommands, publishPlaybackState } from './playerBridge.ts'
import { openMiniPlayerWindow } from './openMiniPlayerWindow.tsx'

const adaptTrack = (song) => song ? ({ ...song, artwork: song.thumbnail ?? song.artwork, albumTitle: song.album }) : null

export default function useGlobalMiniPlayer(player, browse) {
  const publish = useCallback(() => {
    publishPlaybackState({
      track: adaptTrack(player.currentSong),
      queue: player.queue.map(adaptTrack),
      currentTime: player.currentTime,
      duration: player.progressMax,
      isPlaying: player.isPlaying,
      volume: Math.round(player.volume * 100),
      updatedAt: Date.now(),
    }, 'global').catch(() => {})
  }, [player.currentSong, player.queue, player.currentTime, player.progressMax, player.isPlaying, player.volume])
  const publishLatest = useEffectEvent(() => publish())
  const applyCommand = useEffectEvent((command) => {
    if (command.type === 'play-global') {
      claimMiniPlayer('global')
      player.playFrom([command.song], 0)
      return
    }
    if (command.type === 'open-global') {
      window.location.hash = '#/youtube'
      if (command.kind === 'artist') browse.openArtist(command.id)
      else browse.openAlbum(command.id)
      return
    }
    if (!ownsMiniPlayer('global') || !player.currentSong) return
    if (command.type === 'toggle') player.togglePlay()
    if (command.type === 'next') player.playNext()
    if (command.type === 'previous') player.playPrev()
    if (command.type === 'volume') player.setVolume(Math.max(0, Math.min(100, command.value)) / 100)
    if (command.type === 'seek') {
      const event = { target: { value: Math.max(0, Math.min(player.progressMax, command.time)) } }
      player.handleSeek(event)
      player.commitSeek(event)
    }
    if (command.type === 'select') {
      const index = player.queue.findIndex((song) => song.id === command.songId)
      if (index >= 0) player.playFrom(player.queue, index)
    }
  })

  useEffect(() => {
    let disposed = false
    let cleanup = () => {}
    const takeOwnership = () => { claimMiniPlayer('global'); publishLatest() }
    window.addEventListener('yotubei:play', takeOwnership)
    listenToMiniPlayerCommands(applyCommand).then((unlisten) => {
      if (disposed) unlisten()
      else cleanup = unlisten
    }).catch(() => {})
    return () => {
      disposed = true
      cleanup()
      window.removeEventListener('yotubei:play', takeOwnership)
    }
  }, [])

  useEffect(() => { publish() }, [publish])

  return () => {
    claimMiniPlayer('global')
    publish()
    // Keep requestWindow in the user's click gesture.
    return openMiniPlayerWindow()
  }
}
