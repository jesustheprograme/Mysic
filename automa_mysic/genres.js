const MAX_GENRES = 2

function normalizeGenres(values, limit = MAX_GENRES) {
  const unique = new Map()
  for (const value of values || []) {
    const genre = String(value || '').trim()
    if (!genre) continue
    const key = genre.toLocaleLowerCase('en')
    if (!unique.has(key)) unique.set(key, genre)
  }
  return [...unique.values()].slice(0, limit)
}

function rankedNames(items = []) {
  return [...items]
    .filter((item) => item?.name)
    .sort((left, right) => (Number(right.count) || 0) - (Number(left.count) || 0))
    .map((item) => item.name)
}

function selectMusicBrainzGenres(recording = {}, releaseGroup = {}) {
  const officialGenres = normalizeGenres([
    ...rankedNames(recording.genres),
    ...rankedNames(releaseGroup.genres),
  ])
  if (officialGenres.length === MAX_GENRES) return officialGenres

  return normalizeGenres([
    ...officialGenres,
    ...rankedNames(recording.tags),
    ...rankedNames(releaseGroup.tags),
  ])
}

module.exports = { MAX_GENRES, normalizeGenres, selectMusicBrainzGenres }
