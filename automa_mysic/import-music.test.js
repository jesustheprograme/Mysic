const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildDestination,
  buildRelativeDestination,
  buildReleaseFolder,
  normalizeEntry,
  selectCoverForFolder,
} = require('./import-music')

const validUrl = 'https://res.cloudinary.com/demo/image/upload/v1/cover.jpg'

test('normalizes an import entry and its Cloudinary folder', () => {
  const entry = normalizeEntry({
    file: 'ado-show.mp3',
    artist: 'Ado',
    title: 'Show',
    kind: 'single',
    releaseName: 'Show',
    year: 2023,
    genres: ['J-Pop'],
    trackNumber: 1,
    cloudinaryFolder: 'Artistas/Ado/Singles/Show/',
  })

  assert.equal(entry.cloudinaryFolder, 'Artistas/Ado/Singles/Show')
  assert.deepEqual(entry.genres, ['J-Pop'])
})

test('limits manifest genres to two values', () => {
  const entry = normalizeEntry({
    file: 'show.mp3', artist: 'Ado', title: 'Show', kind: 'single', releaseName: 'Show',
    year: 2023, genres: ['J-Pop', 'Rock', 'Pop'], trackNumber: 1,
    cloudinaryFolder: 'Artistas/Ado/Singles/Show',
  })

  assert.deepEqual(entry.genres, ['J-Pop', 'Rock'])
})

test('builds the final path inside the configured library', () => {
  const destination = buildDestination('C:/Musica', {
    artist: 'Ado',
    title: 'Show',
    kind: 'single',
    releaseName: 'Show',
    trackNumber: 1,
  })

  assert.match(destination, /Artistas[\\/]Ado[\\/]Singles[\\/]Show[\\/]01 - Show\.mp3$/)
})

test('builds matching Cloudinary and remote destinations', () => {
  const entry = {
    artist: 'Ado',
    title: 'おどるポンポコリン (Odoru Ponpokorin)',
    kind: 'single',
    releaseName: 'おどるポンポコリン (Odoru Ponpokorin)',
    trackNumber: 1,
  }

  assert.equal(buildReleaseFolder(entry), 'Artistas/Ado/Singles/おどるポンポコリン (Odoru Ponpokorin)')
  assert.equal(
    buildRelativeDestination(entry),
    'Artistas/Ado/Singles/おどるポンポコリン (Odoru Ponpokorin)/01 - おどるポンポコリン (Odoru Ponpokorin).mp3',
  )
})

test('blocks a Japanese filename when no reliable romanization is available', () => {
  assert.throws(() => buildRelativeDestination({
    artist: 'Ado',
    title: '日本語',
    kind: 'single',
    releaseName: 'Single',
    trackNumber: 1,
  }), /romanización oficial/)
})

test('selects portada from the exact Cloudinary folder', () => {
  const cover = selectCoverForFolder([
    { asset_folder: 'Artistas/Ado/Singles/Show', display_name: 'other', format: 'jpg', secure_url: validUrl },
    { asset_folder: 'Artistas/Ado/Singles/Show', display_name: 'portada', format: 'jpg', secure_url: validUrl },
  ], 'Artistas/Ado/Singles/Show', 'dynamic')

  assert.equal(cover.display_name, 'portada')
})

test('rejects a Cloudinary folder without an image', () => {
  assert.throws(() => selectCoverForFolder([
    { asset_folder: 'Artistas/Ado/Singles/Show/detalle', display_name: 'cover', format: 'jpg', secure_url: validUrl },
  ], 'Artistas/Ado/Singles/Show', 'dynamic'), /no contiene una imagen/)
})
