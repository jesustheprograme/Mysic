export const MINI_PLAYER_COLLAPSED_HEIGHT = 148
export const MINI_PLAYER_EXPANDED_HEIGHT = 500
export const MINI_PLAYER_WIDTH = 380
export const MINI_PLAYER_EXPANDED_KEY = 'mysic-mini-player-expanded-v1'

export function getStoredMiniPlayerHeight() {
  return localStorage.getItem(MINI_PLAYER_EXPANDED_KEY) === 'true'
    ? MINI_PLAYER_EXPANDED_HEIGHT
    : MINI_PLAYER_COLLAPSED_HEIGHT
}
