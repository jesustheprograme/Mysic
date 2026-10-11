const assert = require('node:assert/strict')
const test = require('node:test')
const { mapImage, parseByteRange, parseCatalogPagination } = require('./catalog')

test('conserva URLs remotas estables para compartir portadas entre entornos', () => {
  const url = 'https://res.cloudinary.com/demo/image/upload/v123/cover.jpg'

  assert.equal(mapImage({ id: 'environment-specific-id', url }), url)
})

test('mantiene el proxy para imágenes almacenadas solo en el servidor actual', () => {
  assert.equal(
    mapImage({ id: 'local-image-id', url: 'catalog-image:cover-456.jpg' }),
    '/catalog/images/local-image-id?v=cover-456',
  )
})

test('interpreta rangos completos, abiertos y de sufijo', () => {
  assert.deepEqual(parseByteRange('bytes=0-499', 1000), { start: 0, end: 499 })
  assert.deepEqual(parseByteRange('bytes=500-', 1000), { start: 500, end: 999 })
  assert.deepEqual(parseByteRange('bytes=-200', 1000), { start: 800, end: 999 })
  assert.deepEqual(parseByteRange('bytes=-2000', 1000), { start: 0, end: 999 })
})

test('rechaza rangos inválidos o fuera del archivo', () => {
  assert.equal(parseByteRange('bytes=-0', 1000), null)
  assert.equal(parseByteRange('bytes=1000-', 1000), null)
  assert.equal(parseByteRange('bytes=600-500', 1000), null)
  assert.equal(parseByteRange('bytes=0-1,4-5', 1000), null)
})

test('normaliza la paginación del catálogo y limita el tamaño', () => {
  assert.deepEqual(parseCatalogPagination({}), { page: 1, limit: 250 })
  assert.deepEqual(parseCatalogPagination({ page: '3', limit: '40' }), { page: 3, limit: 40 })
  assert.deepEqual(parseCatalogPagination({ page: '-1', limit: '5000' }), { page: 1, limit: 250 })
})
