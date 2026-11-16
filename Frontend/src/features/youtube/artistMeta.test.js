import assert from 'node:assert/strict'
import test from 'node:test'
import { artistMeta, spanishNumber } from './artistMeta.js'

test('traduce los subtitulos de artista de YouTube Music', () => {
  assert.equal(artistMeta('17.6M monthly audience'), '17,6 M oyentes mensuales')
  assert.equal(artistMeta('31M monthly audience'), '31 M oyentes mensuales')
  assert.equal(artistMeta('1 subscriber'), '1 suscriptor')
  assert.equal(artistMeta('559 subscribers'), '559 suscriptores')
  assert.equal(artistMeta('392 subscribers'), '392 suscriptores')
  assert.equal(artistMeta('Artist • 3.2M monthly listeners'), 'Artista · 3,2 M oyentes mensuales')
  assert.equal(artistMeta('1.8K views'), '1,8 K visualizaciones')
})

test('la version corta cabe en tarjetas estrechas', () => {
  assert.equal(artistMeta('17.6M monthly audience', { short: true }), '17,6 M oyentes')
  assert.equal(artistMeta('559 subscribers', { short: true }), '559 suscriptores')
})

test('lo que ya esta en espanol o no se reconoce se deja igual; vacio es "Artista"', () => {
  assert.equal(artistMeta('Artista • 69,1 M usuarios mensuales'), 'Artista · 69,1 M usuarios mensuales')
  assert.equal(artistMeta('Algo raro'), 'Algo raro')
  assert.equal(artistMeta(''), 'Artista')
  assert.equal(artistMeta(undefined), 'Artista')
})

test('spanishNumber respeta los miles y las abreviaturas', () => {
  assert.equal(spanishNumber('559'), '559')
  assert.equal(spanishNumber('1,234'), '1,234')
  assert.equal(spanishNumber('2.5m'), '2,5 M')
})