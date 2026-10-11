import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import {
  PhysicalPosition,
  currentMonitor,
  getCurrentWindow,
  primaryMonitor,
  type Monitor,
} from '@tauri-apps/api/window'
import {
  MINI_PLAYER_COLLAPSED_HEIGHT,
  MINI_PLAYER_EXPANDED_HEIGHT,
  MINI_PLAYER_WIDTH,
} from '../miniPlayerConfig'

export const SURFACE_MOTION_MS = 180
const ANCHOR_KEY = 'mysic-mini-player-anchor-v1'
const PINNED_KEY = 'mysic-mini-player-pinned-v1'
const POSITION_KEY = 'mysic-mini-player-position-v1'
const WEB_PLAYER_WIDTHS = new WeakMap<Window, number>()

type Corner = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
type StoredPosition = { x: number; y: number }

async function getPlacementMonitor() {
  return (await currentMonitor()) ?? (await primaryMonitor())
}

export function readStoredBoolean(key: string, fallback: boolean) {
  const storedValue = localStorage.getItem(key)
  return storedValue === null ? fallback : storedValue === 'true'
}

function readStoredPosition(): StoredPosition | null {
  try {
    const position = JSON.parse(localStorage.getItem(POSITION_KEY) ?? 'null') as Partial<StoredPosition> | null
    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
      return { x: position.x as number, y: position.y as number }
    }
  } catch {
    // Ignore malformed values from older development builds.
  }
  return null
}

function storePosition(position: StoredPosition) {
  localStorage.setItem(POSITION_KEY, JSON.stringify({ x: Math.round(position.x), y: Math.round(position.y) }))
}

export function resizeWebMiniPlayer(hostWindow: Window, targetInnerHeight: number) {
  const frameHeight = Math.max(0, hostWindow.outerHeight - hostWindow.innerHeight)
  const targetOuterHeight = targetInnerHeight + frameHeight
  const initialOuterWidth = WEB_PLAYER_WIDTHS.get(hostWindow)
    ?? Math.max(hostWindow.outerWidth, MINI_PLAYER_WIDTH)

  WEB_PLAYER_WIDTHS.set(hostWindow, initialOuterWidth)
  hostWindow.resizeTo(initialOuterWidth, targetOuterHeight)
}

function getNearestCorner(
  position: { x: number; y: number },
  size: { width: number; height: number },
  monitor: Monitor,
): Corner {
  const workArea = monitor.workArea
  const centerX = position.x + size.width / 2
  const centerY = position.y + size.height / 2
  const workCenterX = workArea.position.x + workArea.size.width / 2
  const workCenterY = workArea.position.y + workArea.size.height / 2
  const horizontal = centerX < workCenterX ? 'left' : 'right'
  const vertical = centerY < workCenterY ? 'top' : 'bottom'
  return `${vertical}-${horizontal}` as Corner
}

function getAnchorAfterMove(
  position: StoredPosition,
  size: { width: number; height: number },
  monitor: Monitor,
  currentAnchor: Corner,
  previousPosition: StoredPosition | null,
) {
  const nearestAnchor = getNearestCorner(position, size, monitor)
  if (!previousPosition) return nearestAnchor

  const verticalTravel = Math.abs(position.y - previousPosition.y)
  const changedVerticalAnchor = verticalTravel >= 24 * monitor.scaleFactor
  const vertical = changedVerticalAnchor
    ? (nearestAnchor.startsWith('top') ? 'top' : 'bottom')
    : (currentAnchor.startsWith('top') ? 'top' : 'bottom')
  const horizontal = nearestAnchor.endsWith('left') ? 'left' : 'right'
  return `${vertical}-${horizontal}` as Corner
}

function clampToWorkArea(value: number, start: number, length: number, windowLength: number) {
  return Math.min(Math.max(value, start), Math.max(start, start + length - windowLength))
}

function getSurfaceOffset(windowHeight: number, visibleHeight: number, expanded: boolean, anchor: Corner) {
  return !expanded && anchor.startsWith('bottom') ? windowHeight - visibleHeight : 0
}

function getSurfacePosition(
  windowPosition: StoredPosition,
  windowHeight: number,
  visibleHeight: number,
  expanded: boolean,
  anchor: Corner,
) {
  return {
    x: windowPosition.x,
    y: windowPosition.y + getSurfaceOffset(windowHeight, visibleHeight, expanded, anchor),
  }
}

export function useVentanaMiniReproductor(
  windowExpanded: boolean,
  hostWindow: Window,
  reducedMotion: boolean,
  onExpandedLayoutReady: () => void,
) {
  const [pinned, setPinned] = useState(() => readStoredBoolean(PINNED_KEY, true))
  const [anchor, setAnchor] = useState<Corner>(() => (localStorage.getItem(ANCHOR_KEY) as Corner | null) ?? 'bottom-right')
  const anchorRef = useRef<Corner>(anchor)
  const windowExpandedRef = useRef(windowExpanded)
  const animationTokenRef = useRef(0)
  const layoutSequenceRef = useRef(0)
  const hasNativeLayoutRef = useRef(false)
  const lastPositionRef = useRef<StoredPosition | null>(null)
  const positionTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isTauri()) return undefined

    const appWindow = getCurrentWindow()
    let disposed = false
    let unlistenMoved = () => {}

    appWindow.onMoved(({ payload: position }) => {
      if (animationTokenRef.current > 0) return
      if (positionTimerRef.current !== null) window.clearTimeout(positionTimerRef.current)
      positionTimerRef.current = window.setTimeout(async () => {
        positionTimerRef.current = null
        if (disposed || animationTokenRef.current > 0) return

        const [monitor, size] = await Promise.all([
          getPlacementMonitor().catch(() => null),
          appWindow.outerSize().catch(() => null),
        ])
        if (disposed || !monitor || !size) return

        const currentAnchor = anchorRef.current
        const currentExpanded = windowExpandedRef.current
        const visibleHeight = (currentExpanded ? MINI_PLAYER_EXPANDED_HEIGHT : MINI_PLAYER_COLLAPSED_HEIGHT) * monitor.scaleFactor
        const visiblePosition = getSurfacePosition(position, size.height, visibleHeight, currentExpanded, currentAnchor)
        const nextAnchor = getAnchorAfterMove(
          visiblePosition,
          { width: size.width, height: visibleHeight },
          monitor,
          currentAnchor,
          lastPositionRef.current,
        )
        const anchorChangedVertically = currentAnchor.startsWith('top') !== nextAnchor.startsWith('top')

        if (!currentExpanded && anchorChangedVertically) {
          const token = ++layoutSequenceRef.current
          animationTokenRef.current = token
          const clipY = getSurfaceOffset(size.height, visibleHeight, false, nextAnchor)
          const targetPosition = new PhysicalPosition(position.x, Math.round(visiblePosition.y - clipY))
          await invoke('set_mini_player_bounds', {
            clipHeight: Math.round(visibleHeight),
            clipY: Math.round(clipY),
            height: Math.round(size.height),
            width: Math.round(size.width),
            x: targetPosition.x,
            y: targetPosition.y,
          }).catch(() => {})
          window.setTimeout(() => {
            if (animationTokenRef.current === token) animationTokenRef.current = 0
          }, 80)
        }

        storePosition(visiblePosition)
        lastPositionRef.current = visiblePosition
        anchorRef.current = nextAnchor
        setAnchor(nextAnchor)
        localStorage.setItem(ANCHOR_KEY, nextAnchor)
      }, 100)
    }).then((unlisten) => {
      if (disposed) unlisten()
      else unlistenMoved = unlisten
    })

    return () => {
      disposed = true
      if (positionTimerRef.current !== null) window.clearTimeout(positionTimerRef.current)
      unlistenMoved()
    }
  }, [hostWindow])

  useEffect(() => {
    localStorage.setItem(PINNED_KEY, String(pinned))
    if (isTauri()) getCurrentWindow().setAlwaysOnTop(pinned).catch(() => {})
  }, [pinned])

  useEffect(() => {
    if (!isTauri()) return undefined

    const appWindow = getCurrentWindow()
    const isInitialLayout = !hasNativeLayoutRef.current
    const previousWindowExpanded = windowExpandedRef.current
    windowExpandedRef.current = windowExpanded
    hasNativeLayoutRef.current = true
    const token = ++layoutSequenceRef.current
    let cancelled = false
    let settleTimer: number | null = null

    animationTokenRef.current = token
    if (positionTimerRef.current !== null) {
      window.clearTimeout(positionTimerRef.current)
      positionTimerRef.current = null
    }

    const resizeAndAnchor = async () => {
      const monitor = await getPlacementMonitor().catch(() => null)
      if (cancelled) return
      if (!monitor) {
        animationTokenRef.current = 0
        await appWindow.show()
        if (windowExpanded) onExpandedLayoutReady()
        return
      }
      const [currentPosition, currentSize] = await Promise.all([
        appWindow.outerPosition(),
        appWindow.outerSize(),
      ])
      if (cancelled) return

      const targetSize = {
        width: MINI_PLAYER_WIDTH * monitor.scaleFactor,
        height: MINI_PLAYER_EXPANDED_HEIGHT * monitor.scaleFactor,
      }
      const previousVisibleHeight = (previousWindowExpanded ? MINI_PLAYER_EXPANDED_HEIGHT : MINI_PLAYER_COLLAPSED_HEIGHT) * monitor.scaleFactor
      const currentVisiblePosition = getSurfacePosition(
        currentPosition,
        currentSize.height,
        previousVisibleHeight,
        previousWindowExpanded,
        anchorRef.current,
      )
      const storedPosition = isInitialLayout ? readStoredPosition() : null
      const nextAnchor = isInitialLayout
        ? anchorRef.current
        : getAnchorAfterMove(
          currentVisiblePosition,
          { width: currentSize.width, height: previousVisibleHeight },
          monitor,
          anchorRef.current,
          lastPositionRef.current,
        )
      const targetVisibleHeight = (windowExpanded ? MINI_PLAYER_EXPANDED_HEIGHT : MINI_PLAYER_COLLAPSED_HEIGHT) * monitor.scaleFactor
      const desiredVisiblePosition = storedPosition ?? {
        x: currentVisiblePosition.x,
        y: nextAnchor.startsWith('bottom')
          ? currentVisiblePosition.y + previousVisibleHeight - targetVisibleHeight
          : currentVisiblePosition.y,
      }
      const targetVisiblePosition = {
        x: Math.round(clampToWorkArea(desiredVisiblePosition.x, monitor.workArea.position.x, monitor.workArea.size.width, targetSize.width)),
        y: Math.round(clampToWorkArea(desiredVisiblePosition.y, monitor.workArea.position.y, monitor.workArea.size.height, targetVisibleHeight)),
      }
      const clipY = getSurfaceOffset(targetSize.height, targetVisibleHeight, windowExpanded, nextAnchor)
      const targetPosition = new PhysicalPosition(
        targetVisiblePosition.x,
        Math.round(targetVisiblePosition.y - clipY),
      )

      anchorRef.current = nextAnchor
      setAnchor(nextAnchor)
      localStorage.setItem(ANCHOR_KEY, nextAnchor)

      await invoke('set_mini_player_bounds', {
        clipHeight: Math.round(targetVisibleHeight),
        clipY: Math.round(clipY),
        height: Math.round(targetSize.height),
        width: Math.round(targetSize.width),
        x: targetPosition.x,
        y: targetPosition.y,
      })
      if (cancelled) return
      await appWindow.show()
      lastPositionRef.current = targetVisiblePosition
      storePosition(targetVisiblePosition)
      if (windowExpanded) onExpandedLayoutReady()

      settleTimer = window.setTimeout(() => {
        if (animationTokenRef.current === token) animationTokenRef.current = 0
      }, windowExpanded && !reducedMotion ? SURFACE_MOTION_MS + 80 : 80)
    }

    const runResize = () => {
      resizeAndAnchor().catch(() => {
        if (animationTokenRef.current === token) animationTokenRef.current = 0
        if (windowExpanded) onExpandedLayoutReady()
      })
    }

    runResize()

    return () => {
      cancelled = true
      if (settleTimer !== null) window.clearTimeout(settleTimer)
      if (animationTokenRef.current === token) animationTokenRef.current = 0
    }
  }, [onExpandedLayoutReady, reducedMotion, windowExpanded])

  const closeWindow = useCallback(() => {
    if (isTauri()) getCurrentWindow().close().catch(() => {})
    else hostWindow.close()
  }, [hostWindow])

  return { anchor, closeWindow, pinned, setPinned }
}
