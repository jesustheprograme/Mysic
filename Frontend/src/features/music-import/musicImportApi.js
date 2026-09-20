import { invoke } from '@tauri-apps/api/core'

export async function pickMusicFiles() {
  return invoke('pick_music_files')
}

export async function stageMusicFiles(paths) {
  return invoke('stage_music_files', { paths })
}

export async function analyzeMusicImport() {
  return invoke('analyze_music_import')
}

export async function readMusicImportState() {
  return invoke('read_music_import_state')
}

export async function saveMusicImport(stateJson) {
  return invoke('save_music_import', { stateJson })
}

export async function previewMusicImport() {
  return invoke('preview_music_import')
}

export async function applyMusicImport() {
  return invoke('apply_music_import')
}
