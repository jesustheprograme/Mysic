const DEFAULT_CHUNK_BYTES = 512 * 1024

/**
 * Baja una canción del servidor y la guarda por trozos en el disco local.
 *
 * - Streaming: el archivo nunca se carga entero en memoria; se agrupan lecturas hasta `chunkBytes`
 *   (pocas llamadas al núcleo en vez de una por cada lectura de red) y se escribe cada trozo antes de
 *   pedir el siguiente (el propio ritmo de escritura frena la descarga).
 * - Integridad: el núcleo comprueba que los bytes escritos coinciden con `Content-Length`.
 *   Si la respuesta viene comprimida ese tamaño no es fiable y la comprobación se omite.
 * - Limpieza: cualquier fallo o cancelación descarta el archivo parcial.
 *
 * `api` = { begin, append, commit, abort }. Devuelve { status: 'exists' } si ya había copia.
 */
export async function copySongToLocal({ api, chunkBytes = DEFAULT_CHUNK_BYTES, fetchImpl = (...args) => globalThis.fetch(...args), id, meta, signal, url }) {
  if (await api.begin(id, meta) === 'exists') return { status: 'exists' }

  try {
    const response = await fetchImpl(url, { credentials: 'include', signal })
    if (!response.ok || !response.body) throw new Error(`El servidor respondió ${response.status}.`)

    const compressed = Boolean(response.headers.get('content-encoding'))
    const announced = Number(response.headers.get('content-length')) || null
    const expectedSize = compressed ? null : announced

    const reader = response.body.getReader()
    let pending = []
    let pendingBytes = 0

    const flush = async () => {
      if (!pendingBytes) return
      const buffer = new Uint8Array(pendingBytes)
      let offset = 0
      for (const part of pending) {
        buffer.set(part, offset)
        offset += part.length
      }
      pending = []
      pendingBytes = 0
      await api.append(id, buffer)
    }

    for (;;) {
      if (signal?.aborted) throw new DOMException('Descarga cancelada.', 'AbortError')
      const { done, value } = await reader.read()
      if (done) break
      pending.push(value)
      pendingBytes += value.length
      if (pendingBytes >= chunkBytes) await flush()
    }
    await flush()

    return { item: await api.commit(id, expectedSize), status: 'saved' }
  } catch (error) {
    await Promise.resolve(api.abort(id)).catch(() => {})
    throw error
  }
}
