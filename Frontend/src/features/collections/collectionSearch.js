// Búsqueda dentro de un álbum o playlist: sin distinguir mayúsculas ni acentos, por título, artista o álbum.

const normalize = (value) => String(value ?? '')
  .toLocaleLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .trim()

/** Canciones que contienen todas las palabras de `query` (en título, artista o álbum). Sin consulta, todas. */
export function filterSongs(songs, query) {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (!words.length) return songs
  return songs.filter((song) => {
    const haystack = normalize(`${song.title} ${song.artist} ${song.albumTitle ?? song.album ?? ''}`)
    return words.every((word) => haystack.includes(word))
  })
}
