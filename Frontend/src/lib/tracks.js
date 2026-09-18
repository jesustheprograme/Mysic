function positiveInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

export function normalizeTrack(track) {
  const discNumber = positiveInteger(track.discNumber ?? track.discNo) ?? 1
  const trackNumber = positiveInteger(track.trackNumber ?? track.trackNo)

  return {
    ...track,
    discNo: discNumber,
    discNumber,
    trackNo: trackNumber,
    trackNumber,
  }
}

export function sortTracks(tracks) {
  return [...tracks].sort((firstTrack, secondTrack) => {
    const first = normalizeTrack(firstTrack)
    const second = normalizeTrack(secondTrack)

    return first.discNumber - second.discNumber
      || (first.trackNumber ?? Number.MAX_SAFE_INTEGER) - (second.trackNumber ?? Number.MAX_SAFE_INTEGER)
  })
}

export function groupTracksByDisc(tracks) {
  const groups = new Map()

  for (const track of sortTracks(tracks).map(normalizeTrack)) {
    const discTracks = groups.get(track.discNumber) ?? []
    discTracks.push(track)
    groups.set(track.discNumber, discTracks)
  }

  return Array.from(groups, ([discNumber, discTracks]) => ({ discNumber, tracks: discTracks }))
}
