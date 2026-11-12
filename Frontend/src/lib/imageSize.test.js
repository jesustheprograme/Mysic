import assert from 'node:assert/strict'
import test from 'node:test'
import { deviceScale, IMAGE_STEPS, imageStep, sizedImage } from './imageSize.js'

test('deviceScale acota la densidad entre 1 y 2 y vale 1 sin ventana', () => {
  assert.equal(deviceScale(), 1)
  assert.equal(deviceScale(undefined), 1)
  assert.equal(deviceScale(0.75), 1)
  assert.equal(deviceScale(1.25), 1.25)
  assert.equal(deviceScale(3), 2)
  assert.equal(deviceScale(Number.NaN), 1)
  assert.equal(deviceScale('2'), 1)
})

test('imageStep redondea al escalón que cubre el hueco', () => {
  assert.equal(imageStep(44, 1), 96)
  assert.equal(imageStep(96, 1), 96)
  assert.equal(imageStep(97, 1), 160)
  assert.equal(imageStep(180, 1), 240)
  assert.equal(imageStep(180, 1.25), 240)
  assert.equal(imageStep(180, 1.5), 360)
  assert.equal(imageStep(180, 2), 360)
  assert.equal(imageStep(180, 4), 360)
  assert.equal(imageStep(5000, 2), IMAGE_STEPS.at(-1))
})

test('reescribe =wN-hN en googleusercontent según hueco y densidad', () => {
  const cover = 'https://lh3.googleusercontent.com/abc=w544-h544-l90-rj'
  assert.equal(sizedImage(cover, 44, 1), 'https://lh3.googleusercontent.com/abc=w96-h96-l90-rj')
  assert.equal(sizedImage(cover, 148, 1), 'https://lh3.googleusercontent.com/abc=w160-h160-l90-rj')
  assert.equal(sizedImage(cover, 148, 2), 'https://lh3.googleusercontent.com/abc=w360-h360-l90-rj')
  assert.equal(sizedImage('https://yt3.googleusercontent.com/abc=w120-h120-l90-rj', 220, 2), 'https://yt3.googleusercontent.com/abc=w544-h544-l90-rj')
})

test('reescribe =sN en ggpht y googleusercontent', () => {
  assert.equal(sizedImage('https://yt3.ggpht.com/y=s900-c-k-c0x00ffffff-no-rj', 84, 1), 'https://yt3.ggpht.com/y=s96-c-k-c0x00ffffff-no-rj')
  assert.equal(sizedImage('https://yt3.googleusercontent.com/y=s176', 120, 2), 'https://yt3.googleusercontent.com/y=s240')
})

test('las imágenes no cuadradas de Google conservan la proporción', () => {
  assert.equal(sizedImage('https://lh3.googleusercontent.com/b=w1920-h1080-p-l90-rj', 120, 1), 'https://lh3.googleusercontent.com/b=w284-h160-p-l90-rj')
  assert.equal(sizedImage('https://lh3.googleusercontent.com/b=w600-h1200', 96, 1), 'https://lh3.googleusercontent.com/b=w96-h192')
})

test('una URL de Google sin tamaño vuelve intacta', () => {
  assert.equal(sizedImage('https://lh3.googleusercontent.com/abc', 44, 1), 'https://lh3.googleusercontent.com/abc')
})

test('miniaturas de vídeo sin firmar: mqdefault solo en huecos pequeños', () => {
  const big = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg'
  assert.equal(sizedImage(big, 48, 1), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg')
  assert.equal(sizedImage(big, 48, 2), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg')
  assert.equal(sizedImage(big, 148, 1), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg')
  // Por encima de 160 px físicos mqdefault (180 de alto) se vería borrosa: se conserva la original.
  assert.equal(sizedImage(big, 148, 2), big)
  assert.equal(sizedImage(big, 220, 1), big)
  assert.equal(sizedImage('https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', 40, 1), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg')
  assert.equal(sizedImage('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', 40, 1), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg')
  assert.equal(sizedImage('https://i.ytimg.com/vi_webp/dQw4w9WgXcQ/sddefault.webp', 40, 1), 'https://i.ytimg.com/vi_webp/dQw4w9WgXcQ/mqdefault.webp')
  assert.equal(sizedImage('https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg', 40, 1), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg')
})

test('las miniaturas firmadas (sqp/rs) o con cualquier parámetro no se tocan', () => {
  const signed = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg?sqp=-oaymwEXCNUGEOADIAQqCwjVARCqCBh4INgESFo&rs=AMzJL3kXyz'
  assert.equal(sizedImage(signed, 40, 1), signed)
  assert.equal(sizedImage(signed, 400, 2), signed)
  const versioned = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg?v=5f1a'
  assert.equal(sizedImage(versioned, 40, 1), versioned)
})

test('otros hosts, rutas locales y URLs ya pasadas por el proxy vuelven intactas', () => {
  for (const url of [
    'https://e-cdns-images.dzcdn.net/images/cover/abc/500x500.jpg',
    'https://i.scdn.co/image/ab67616d=s640',
    'https://evil.example/lh3.googleusercontent.com/x=w544-h544',
    'http://127.0.0.1:4000/api/youtube/image?u=https%3A%2F%2Flh3.googleusercontent.com%2Fx%3Dw544-h544',
    '/api/downloads/abc/cover',
    '/assets/afterglow-abc123.webp',
    'data:image/png;base64,AAAA=s64',
    '',
  ]) assert.equal(sizedImage(url, 44, 1), url)
})

test('los valores no string y los tamaños inválidos no rompen', () => {
  assert.equal(sizedImage(undefined, 44), undefined)
  assert.equal(sizedImage(null, 44), null)
  assert.equal(sizedImage(42, 44), 42)
  const object = { url: 'x' }
  assert.equal(sizedImage(object, 44), object)
  const cover = 'https://lh3.googleusercontent.com/abc=w544-h544'
  assert.equal(sizedImage(cover), cover)
  assert.equal(sizedImage(cover, 0), cover)
  assert.equal(sizedImage(cover, Number.NaN), cover)
  assert.equal(sizedImage(cover, '44px'), cover)
})

test('sin densidad explícita usa la de la ventana (1 en Node) y es idempotente', () => {
  const once = sizedImage('https://lh3.googleusercontent.com/abc=w544-h544-l90-rj', 180)
  assert.equal(once, 'https://lh3.googleusercontent.com/abc=w240-h240-l90-rj')
  assert.equal(sizedImage(once, 180), once)
})
