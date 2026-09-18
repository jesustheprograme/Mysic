export function getVisiblePages(page, pageCount) {
  return [page - 1, page, page + 1].filter((candidate) => candidate >= 0 && candidate < pageCount)
}

export function getAdjacentArtworkUrls(songs, page, pageSize, pageCount) {
  const urls = new Set()

  for (const adjacentPage of getVisiblePages(page, pageCount).filter((candidate) => candidate !== page)) {
    const start = adjacentPage * pageSize
    for (const song of songs.slice(start, start + pageSize)) {
      if (song.artwork) urls.add(song.artwork)
    }
  }

  return [...urls]
}
