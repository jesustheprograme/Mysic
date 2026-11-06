import assert from 'node:assert/strict'
import test from 'node:test'
import { translateShelfTitle } from './shelfTitles.js'

test('traduce títulos conocidos sin importar mayúsculas ni espacios', () => {
  assert.equal(translateShelfTitle('Listen again'), 'Volver a escuchar')
  assert.equal(translateShelfTitle('  FORGOTTEN FAVORITES '), 'Favoritos olvidados')
  assert.equal(translateShelfTitle('Springtime vibes'), 'Ambiente de primavera')
})

test('traduce los títulos con nombre propio conservándolo', () => {
  assert.equal(translateShelfTitle('Similar to Radiohead'), 'Similar a Radiohead')
  assert.equal(translateShelfTitle('More from Los Vaguens'), 'Más de Los Vaguens')
  assert.equal(translateShelfTitle('Because you listened to Queen'), 'Porque escuchaste Queen')
})

test('lo desconocido o que no es texto queda igual', () => {
  assert.equal(translateShelfTitle('Mis favoritos de 2024'), 'Mis favoritos de 2024')
  assert.equal(translateShelfTitle(undefined), undefined)
  assert.equal(translateShelfTitle(null), null)
})
