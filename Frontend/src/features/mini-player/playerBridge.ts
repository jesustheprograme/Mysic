import { isTauri } from '@tauri-apps/api/core'
import { emitTo, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

export type MiniSong = {
  id: string
  title: string
  artist: string
  artwork: string
  durationSeconds: number
}

export type PlaybackSnapshot = {
  currentTime: number
  duration: number
  isPlaying: boolean
  queue: MiniSong[]
  track: MiniSong | null
  updatedAt: number
  volume: number
}

export type MiniPlayerCommand =
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'seek'; time: number }
  | { type: 'select'; songId: string }
  | { type: 'toggle' }
  | { type: 'volume'; value: number }

const CHANNEL_NAME = 'mysic-mini-player-v1'
const SNAPSHOT_KEY = 'mysic-mini-player-snapshot-v1'
const PLAYBACK_EVENT = 'mysic://playback-state'
const COMMAND_EVENT = 'mysic://mini-command'
const PLAYBACK_PUBLISH_INTERVAL = 120
const SNAPSHOT_PERSIST_INTERVAL = 500

let lastPublishedAt = 0
let lastPersistedAt = 0
let lastCriticalState = ''
let pendingSnapshot: PlaybackSnapshot | null = null
let publishTimer: ReturnType<typeof setTimeout> | null = null

function createChannel() {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME)
}

export function readPlaybackSnapshot(): PlaybackSnapshot | null {
  try {
    const storedSnapshot = localStorage.getItem(SNAPSHOT_KEY)
    return storedSnapshot ? JSON.parse(storedSnapshot) as PlaybackSnapshot : null
  } catch {
    return null
  }
}

async function deliverPlaybackState(snapshot: PlaybackSnapshot) {
  const now = Date.now()
  lastPublishedAt = now
  const shouldPersist = now - lastPersistedAt >= SNAPSHOT_PERSIST_INTERVAL

  if (shouldPersist) {
    lastPersistedAt = now
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot))
    } catch {
      // Event delivery still keeps the native mini player in sync.
    }
  }

  if (isTauri()) {
    await emitTo('mini-player', PLAYBACK_EVENT, snapshot)
  } else {
    const channel = createChannel()
    channel?.postMessage({ kind: 'playback', payload: snapshot })
    channel?.close()
  }
}

export async function publishPlaybackState(snapshot: PlaybackSnapshot) {
  const criticalState = `${snapshot.track?.id ?? ''}:${snapshot.isPlaying}`
  const now = Date.now()
  const shouldPublishNow = criticalState !== lastCriticalState
    || now - lastPublishedAt >= PLAYBACK_PUBLISH_INTERVAL

  lastCriticalState = criticalState
  pendingSnapshot = snapshot

  if (!shouldPublishNow) {
    if (publishTimer === null) {
      publishTimer = setTimeout(() => {
        publishTimer = null
        const nextSnapshot = pendingSnapshot
        pendingSnapshot = null
        if (nextSnapshot) deliverPlaybackState(nextSnapshot).catch(() => {})
      }, Math.max(0, PLAYBACK_PUBLISH_INTERVAL - (now - lastPublishedAt)))
    }
    return
  }

  if (publishTimer !== null) {
    clearTimeout(publishTimer)
    publishTimer = null
  }
  pendingSnapshot = null

  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot))
    lastPersistedAt = now
  } catch {
    // Event delivery still keeps the native mini player in sync.
  }

  await deliverPlaybackState(snapshot)
}

export async function sendMiniPlayerCommand(command: MiniPlayerCommand) {
  if (isTauri()) {
    await emitTo('main', COMMAND_EVENT, command)
  } else {
    const channel = createChannel()
    channel?.postMessage({ kind: 'command', payload: command })
    channel?.close()
  }
}

export async function listenToPlaybackState(handler: (snapshot: PlaybackSnapshot) => void) {
  const cleanups: Array<() => void> = []
  if (isTauri()) {
    const unlistenTauri: UnlistenFn = await getCurrentWebviewWindow().listen<PlaybackSnapshot>(PLAYBACK_EVENT, (event) => handler(event.payload))
    cleanups.push(unlistenTauri)
  } else {
    const channel = createChannel()
    if (channel) {
      channel.addEventListener('message', (event) => {
        if (event.data?.kind === 'playback') handler(event.data.payload as PlaybackSnapshot)
      })
      cleanups.push(() => channel.close())
    }
  }

  return () => cleanups.forEach((cleanup) => cleanup())
}

export async function listenToMiniPlayerCommands(handler: (command: MiniPlayerCommand) => void) {
  const cleanups: Array<() => void> = []
  if (isTauri()) {
    const unlistenTauri = await getCurrentWebviewWindow().listen<MiniPlayerCommand>(COMMAND_EVENT, (event) => handler(event.payload))
    cleanups.push(unlistenTauri)
  } else {
    const channel = createChannel()
    if (channel) {
      channel.addEventListener('message', (event) => {
        if (event.data?.kind === 'command') handler(event.data.payload as MiniPlayerCommand)
      })
      cleanups.push(() => channel.close())
    }
  }

  return () => cleanups.forEach((cleanup) => cleanup())
}
