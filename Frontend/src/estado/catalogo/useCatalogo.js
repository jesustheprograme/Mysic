import { useCallback, useEffect, useState } from 'react'
import { songs as fallbackSongs } from '../../data/music.js'
import { catalogApi } from '../../lib/api.js'

const CATALOG_PAGE_SIZE = 250

function addFallbackArtwork(catalogSongs, offset = 0) {
  return catalogSongs.map((song, index) => ({
    ...song,
    artwork: song.artwork ?? fallbackSongs[(offset + index) % fallbackSongs.length]?.artwork ?? null,
  }))
}

function mergeUniqueSongs(currentSongs, incomingSongs) {
  const merged = new Map(currentSongs.map((song) => [song.id, song]))
  incomingSongs.forEach((song) => merged.set(song.id, song))
  return [...merged.values()]
}

export default function useCatalogo() {
  const [librarySongs, setLibrarySongs] = useState([])
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [libraryPagination, setLibraryPagination] = useState(null)
  const [searchSongs, setSearchSongs] = useState([])
  const [searchPagination, setSearchPagination] = useState(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [catalogLoadingMore, setCatalogLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [catalogError, setCatalogError] = useState(null)

  const refreshLibrary = useCallback(async () => {
    const result = await catalogApi.listSongs({ limit: CATALOG_PAGE_SIZE })
    const songsWithArtwork = addFallbackArtwork(result.songs)
    setLibrarySongs(songsWithArtwork)
    setLibraryPagination(result.pagination)
    setCatalogError(result.songs.length
      ? null
      : { kind: 'empty', message: 'El catálogo PostgreSQL todavía no contiene canciones.' })
    return songsWithArtwork
  }, [])

  useEffect(() => {
    const search = searchQuery.trim()
    if (!search) {
      setSearchSongs([])
      setSearchPagination(null)
      setSearchLoading(false)
      return undefined
    }

    let cancelled = false
    setSearchLoading(true)
    const timer = window.setTimeout(() => {
      catalogApi.listSongs({ limit: CATALOG_PAGE_SIZE, search })
        .then((result) => {
          if (cancelled) return
          setSearchSongs(addFallbackArtwork(result.songs))
          setSearchPagination(result.pagination)
        })
        .catch((error) => {
          if (!cancelled) setCatalogError({ kind: 'error', message: error.message })
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false)
        })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [searchQuery])

  const loadMoreCatalogSongs = useCallback(async () => {
    const search = searchQuery.trim()
    const pagination = search ? searchPagination : libraryPagination
    if (!pagination?.hasNext || catalogLoadingMore) return false

    setCatalogLoadingMore(true)
    try {
      const result = await catalogApi.listSongs({
        limit: CATALOG_PAGE_SIZE,
        page: pagination.page + 1,
        search,
      })
      const existingCount = search ? searchSongs.length : librarySongs.length
      const nextSongs = addFallbackArtwork(result.songs, existingCount)
      if (search) {
        setSearchSongs((currentSongs) => mergeUniqueSongs(currentSongs, nextSongs))
        setSearchPagination(result.pagination)
      } else {
        setLibrarySongs((currentSongs) => mergeUniqueSongs(currentSongs, nextSongs))
        setLibraryPagination(result.pagination)
      }
      return true
    } catch (error) {
      setCatalogError({ kind: 'error', message: error.message || 'No se pudo cargar otra página del catálogo.' })
      return false
    } finally {
      setCatalogLoadingMore(false)
    }
  }, [catalogLoadingMore, libraryPagination, librarySongs.length, searchPagination, searchQuery, searchSongs.length])

  useEffect(() => {
    let cancelled = false

    async function loadLibrary() {
      try {
        const catalogSongs = await refreshLibrary()
        if (cancelled) return
        if (catalogSongs.length > 0) {
          setLibraryLoading(false)
          return
        }
      } catch (error) {
        console.warn('El catálogo PostgreSQL todavía no está disponible:', error)
        if (!cancelled) {
          setLibrarySongs([])
          setCatalogError({
            kind: 'error',
            message: error.message || 'No se pudo conectar con el catálogo PostgreSQL.',
          })
        }
      }

      if (!cancelled) setLibraryLoading(false)
    }

    loadLibrary()
    return () => {
      cancelled = true
    }
  }, [refreshLibrary])

  return {
    catalogError,
    catalogLoadingMore,
    libraryLoading,
    libraryPagination,
    librarySongs,
    loadMoreCatalogSongs,
    refreshLibrary,
    searchLoading,
    searchPagination,
    searchQuery,
    searchSongs,
    setSearchQuery,
  }
}
