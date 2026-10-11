import { sendMiniPlayerCommand } from '../playerBridge'

export function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const minutes = Math.floor(safeSeconds / 60)
  return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`
}

export function dispatchMiniPlayerCommand(command: Parameters<typeof sendMiniPlayerCommand>[0]) {
  sendMiniPlayerCommand(command).catch(() => {})
}
