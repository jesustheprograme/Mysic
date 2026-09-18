const assert = require('node:assert/strict')
const test = require('node:test')
const { parseTrackFileName } = require('./import-music')
const { loadAlbumLinkManifests, resolveSourceSong } = require('./link-album-tracks')
const { candidateFromNavidromeSong } = require('./sync-navidrome')
const { parseRemoteImagePath } = require('./sync-images')
const { buildImageCandidates, listCloudinaryImages } = require('./sync-cloudinary-images')

test('extrae disco, pista y título de un álbum multidisco', () => {
  assert.deepEqual(
    parseTrackFileName('01-14 - Episode X.mp3'),
    {
      cleanTitle: 'Episode X',
      discNumber: 1,
      title: 'Episode X',
      trackNumber: 14,
      requestedDiscNo: 1,
      requestedTrackNo: 14,
    },
  )

  const secondDisc = parseTrackFileName('02-01 - 初夏 (Shoka).mp3')
  assert.equal(secondDisc.discNumber, 2)
  assert.equal(secondDisc.trackNumber, 1)
  assert.equal(secondDisc.cleanTitle, '初夏 (Shoka)')

  const spacedNumbers = parseTrackFileName('01 - 06 - unravel.mp3')
  assert.equal(spacedNumbers.discNumber, 1)
  assert.equal(spacedNumbers.trackNumber, 6)
  assert.equal(spacedNumbers.cleanTitle, 'unravel')
})

test('interpreta una pista normal como disco 1', () => {
  const track = parseTrackFileName('03 - 逆光 (Gyakkō).mp3')
  assert.equal(track.discNumber, 1)
  assert.equal(track.trackNumber, 3)
  assert.equal(track.cleanTitle, '逆光 (Gyakkō)')
})

test('conserva archivos sin prefijo', () => {
  const track = parseTrackFileName('Tot Musica.mp3')
  assert.equal(track.discNumber, 1)
  assert.equal(track.trackNumber, null)
  assert.equal(track.cleanTitle, 'Tot Musica')
})

test('prioriza números válidos de metadata cuando no se fuerza FileZilla', () => {
  const candidate = candidateFromNavidromeSong({
    id: 'song-1',
    path: 'Artistas/Ado/Albums/Album/cancion.mp3',
    discNumber: 2,
    trackNumber: 7,
  })

  assert.equal(candidate.requestedDiscNo, 2)
  assert.equal(candidate.requestedTrackNo, 7)
})

test('metadata válida prevalece cuando difiere del filename', () => {
  const candidate = candidateFromNavidromeSong({
    id: 'song-2',
    path: 'Artistas/Ado/Albums/Album/01-14 - Episode X.mp3',
    discNumber: 2,
    trackNumber: 7,
  })

  assert.equal(candidate.requestedDiscNo, 2)
  assert.equal(candidate.requestedTrackNo, 7)
})

test('usa cada subcarpeta de Singles como un lanzamiento independiente', () => {
  const candidate = candidateFromNavidromeSong({
    id: 'single-1',
    path: 'Artistas/Ado/Singles/綺羅 (KIRA)/01 - 綺羅(KIRA).mp3',
  }, { preferFilename: true })

  assert.equal(candidate.albumTitle, '綺羅 (KIRA)')
  assert.equal(candidate.title, '綺羅(KIRA)')
  assert.equal(candidate.requestedTrackNo, 1)
})

test('el Best Adobum tiene una secuencia única de cuarenta pistas con fuente para cada canción', async () => {
  const [manifest] = await loadAlbumLinkManifests()

  assert.equal(manifest.tracks.length, 40)
  assert.deepEqual(manifest.tracks.map((track) => track.trackNo), Array.from({ length: 40 }, (_, index) => index + 1))
  assert.equal(manifest.tracks.every((track) => track.discNo === 1), true)
  assert.equal(manifest.tracks.filter((track) => !track.sourceAlbum).length, 0)
  const unravel = manifest.tracks[5]
  assert.equal(unravel.sourceTrackNo, 8)
  assert.equal(unravel.sourceAlbum, "Adoの歌ってみたアルバム (Ado's Utattemita Album)")
  assert.equal(manifest.tracks[13].sourceAlbum, 'Episode X')
  assert.equal(manifest.tracks[20].sourceTrackNo, 2)
  assert.equal(manifest.tracks[27].sourceTrackNo, 3)
  assert.equal(manifest.tracks[31].sourceAlbum, 'エルフ (Erufu)')
  assert.equal(manifest.tracks[37].sourceAlbum, 'わたしに花束 (Watashi ni Hanataba)')
  assert.equal(manifest.tracks[39].sourceTrackNo, 1)
})

test('reconoce las canciones físicas del Best por título aunque cambie su posición', async () => {
  const [manifest] = await loadAlbumLinkManifests()
  const entry = manifest.tracks[15]
  const sourceSong = { title: entry.title, mediaAssets: [{ type: 'audio' }] }
  const database = {
    albumTrack: {
      findFirst: async ({ where }) => {
        assert.deepEqual(where, {
          album: { title: manifest.album },
          isPrimary: true,
          song: { title: entry.title },
        })
        return { song: sourceSong }
      },
    },
  }

  assert.equal(await resolveSourceSong(database, entry, manifest.album), sourceSong)
})

test('vincula una portada usando las carpetas de artista y álbum', () => {
  assert.deepEqual(
    parseRemoteImagePath('Artistas/Ado/Albums/狂言(Kyogen)/cover_狂言(Kyogen).jpg'),
    {
      kind: 'album',
      artistName: 'Ado',
      albumTitle: '狂言(Kyogen)',
      extension: '.jpg',
      relativePath: 'Artistas/Ado/Albums/狂言(Kyogen)/cover_狂言(Kyogen).jpg',
    },
  )
})

test('reconoce imágenes verticales numeradas dentro de Perfil', () => {
  assert.deepEqual(
    parseRemoteImagePath('Artistas/Ado/Perfil/artista_img5.webp'),
    {
      kind: 'profile',
      artistName: 'Ado',
      position: 5,
      extension: '.webp',
      relativePath: 'Artistas/Ado/Perfil/artista_img5.webp',
    },
  )
})

test('vincula carpetas de Cloudinary aunque los public IDs sean aleatorios', () => {
  const config = { cloudName: 'example', folderMode: 'dynamic' }
  const assets = [
    {
      asset_folder: "Artistas/Ado/Albums/Adoの歌ってみたアルバム (Ado's Utattemita Album)",
      public_id: 'random-cover-id',
      display_name: 'Portada principal',
      format: 'jpg',
      secure_url: 'https://res.cloudinary.com/example/image/upload/v1/random-cover-id.jpg',
    },
    {
      asset_folder: 'Artistas/Ado/Perfil',
      public_id: 'random-profile-id',
      display_name: 'Retrato nuevo',
      format: 'webp',
      secure_url: 'https://res.cloudinary.com/example/image/upload/v1/random-profile-id.webp',
    },
    {
      asset_folder: 'Artistas/Ado/Perfil',
      public_id: 'second-profile-id',
      display_name: 'artista_img5',
      format: 'png',
      secure_url: 'https://res.cloudinary.com/example/image/upload/v1/second-profile-id.png',
    },
  ]
  const { candidates, skipped } = buildImageCandidates(assets, config)

  assert.equal(skipped.length, 0)
  assert.equal(candidates.find((item) => item.kind === 'album').albumTitle, "Adoの歌ってみたアルバム (Ado's Utattemita Album)")
  assert.deepEqual(candidates.filter((item) => item.kind === 'profile').map((item) => item.position), [5, 1])
})

test('lee todas las páginas de la búsqueda de Cloudinary', async () => {
  const cursors = []
  const fetcher = async (url) => {
    cursors.push(url.searchParams.get('next_cursor'))
    return {
      ok: true,
      json: async () => cursors.length === 1
        ? { resources: [{ public_id: 'first' }], next_cursor: 'page-two' }
        : { resources: [{ public_id: 'second' }] },
    }
  }
  const assets = await listCloudinaryImages({
    cloudName: 'example', apiKey: 'key', apiSecret: 'secret', folderMode: 'dynamic',
  }, fetcher)

  assert.deepEqual(cursors, [null, 'page-two'])
  assert.deepEqual(assets.map((asset) => asset.public_id), ['first', 'second'])
})
