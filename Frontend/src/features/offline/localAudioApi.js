import { convertFileSrc, invoke } from '@tauri-apps/api/core'

/** Llamadas al núcleo nativo (src-tauri/src/local_audio.rs). Solo existen en la app de escritorio. */
export const localAudioApi = {
  list: () => invoke('local_audio_list'),
  usage: () => invoke('local_audio_usage'),
  begin: (id, meta) => invoke('local_audio_begin', { id, meta }),
  // Cuerpo binario crudo: sin JSON ni base64. El id viaja en una cabecera.
  append: (id, bytes) => invoke('local_audio_append', bytes, { headers: { 'x-id': id } }),
  commit: (id, expectedSize) => invoke('local_audio_commit', { id, expectedSize: expectedSize ?? null }),
  abort: (id) => invoke('local_audio_abort', { id }),
  remove: (id) => invoke('local_audio_remove', { id }),
}

/** URL del protocolo propio (`http://mysicaudio.localhost/<id>` en Windows). */
export const localAudioUrl = (id) => convertFileSrc(id, 'mysicaudio')
