// Biblioteca de YouTube por páginas (cliente): estado puro. La red vive en libraryApi.js.
//
// El servidor entrega la primera página de cada categoría (overview) y el resto bajo demanda con cursores
// opacos. `library` guarda las listas ya cargadas (con la misma forma que antes) y `meta` lo que falta:
//   meta.cursors[kind]   cursor de la siguiente página (solo vale para esta sincronización)
//   meta.hasMore[kind]   ¿quedan más páginas en el servidor?
//   meta.loading[kind]   ¿hay una petición en curso?
//   meta.errors[kind]    código del último fallo (detiene la carga automática de esa categoría)
//   meta.legacy          el servidor no tiene biblioteca por páginas: llegó todo de una vez

export const SECTION_KINDS = ['playlists', 'liked-songs', 'albums', 'artists', 'subscriptions', 'uploads']

export const FIELD_OF = {
  playlists: 'playlists',
  'liked-songs': 'likedSongs',
  albums: 'albums',
  artists: 'artists',
  subscriptions: 'subscriptions',
  uploads: 'uploads',
}

export const emptyLibrary = () => ({ albums: [], artists: [], likedSongs: [], playlists: [], subscriptions: [], uploads: [] })
export const emptyMeta = () => ({ cursors: {}, errors: {}, hasMore: {}, legacy: false, loading: {} })
/** Todo llegó de una vez (servidor sin biblioteca por páginas): no hay nada más que pedir. */
export const legacyMeta = () => ({ ...emptyMeta(), legacy: true })

/** Añade lo nuevo al final, sin repetir ids y conservando el orden. */
export function mergeById(existing, incoming) {
  const seen = new Set(existing.map((item) => item.id))
  const merged = [...existing]
  for (const item of incoming) {
    if (item?.id == null || seen.has(item.id)) continue
    seen.add(item.id)
    merged.push(item)
  }
  return merged
}

/** La primera página (la más reciente) va delante; lo que ya se tenía de más allá se conserva detrás. */
export function mergeFirstPage(previous, firstPage) {
  const ids = new Set(firstPage.map((item) => item.id))
  return [...firstPage, ...previous.filter((item) => !ids.has(item.id))]
}

/**
 * Aplica la vista general a la biblioteca que ya se tenía (por ejemplo, la guardada). Una categoría que falló
 * conserva lo anterior y anota el error. Devuelve { library, meta }.
 */
export function applyOverview(previous, overview) {
  const library = { ...emptyLibrary(), ...previous }
  const meta = emptyMeta()
  for (const kind of SECTION_KINDS) {
    const field = FIELD_OF[kind]
    const section = overview?.sections?.[field]
    if (!section) continue
    if (section.error) {
      meta.errors[kind] = section.error
      continue
    }
    library[field] = mergeFirstPage(library[field] ?? [], section.items ?? [])
    meta.cursors[kind] = section.continuation ?? null
    meta.hasMore[kind] = Boolean(section.hasMore && section.continuation)
  }
  return { library, meta }
}

/** Suma una página siguiente de una categoría y actualiza su cursor. */
export function applyPage(library, meta, kind, page) {
  const field = FIELD_OF[kind]
  const errors = { ...meta.errors }
  delete errors[kind]
  return {
    library: { ...library, [field]: mergeById(library[field] ?? [], page.items ?? []) },
    meta: {
      ...meta,
      cursors: { ...meta.cursors, [kind]: page.continuation ?? null },
      errors,
      hasMore: { ...meta.hasMore, [kind]: Boolean(page.hasMore && page.continuation) },
    },
  }
}

export const withLoading = (meta, kind, loading) => ({ ...meta, loading: { ...meta.loading, [kind]: loading } })
export const withError = (meta, kind, code) => ({ ...meta, errors: { ...meta.errors, [kind]: code } })

/** ¿Se puede pedir otra página de esta categoría ahora? Hay más, hay cursor, no hay petición ni fallo. */
export const canLoadMore = (meta, kind) => Boolean(meta.hasMore[kind] && meta.cursors[kind] && !meta.loading[kind] && !meta.errors[kind])

/** La siguiente categoría a cargar de entre `kinds` (en ese orden), o null si no hay ninguna pendiente. */
export const nextKindToLoad = (meta, kinds) => kinds.find((kind) => canLoadMore(meta, kind)) ?? null

/** Categorías con más páginas pendientes en el servidor (aunque estén cargando o con error). */
export const pendingKinds = (meta, kinds = SECTION_KINDS) => kinds.filter((kind) => meta.hasMore[kind])

/** "120" si está completa; "120+" si el servidor aún tiene más. */
export const countLabel = (count, hasMore) => (hasMore ? `${count}+` : String(count))