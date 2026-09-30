function primaryArtist(value) {
  const artist = String(value || '').trim()
  if (!artist) return ''

  return artist
    .split(/\s+(?:feat(?:uring)?\.?|ft\.?|with|&|x)\s+|\s*,\s*/i, 1)[0]
    .trim()
}

module.exports = { primaryArtist }
