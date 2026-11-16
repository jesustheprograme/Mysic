import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanTitle, isSpotifyLink, parseYtLink, trackQuery } from './ytLink.js'

test('reconoce los enlaces de YouTube y YouTube Music que se pegan', () => {
  assert.deepEqual(parseYtLink('https://music.youtube.com/watch?v=abc123&list=RDAMVMabc123'), { kind: 'song', id: 'abc123' })
  assert.deepEqual(parseYtLink('https://youtu.be/abc123?t=30'), { kind: 'song', id: 'abc123' })
  assert.deepEqual(parseYtLink('www.youtube.com/watch?v=xyz'), { kind: 'song', id: 'xyz' })
  assert.deepEqual(parseYtLink('https://music.youtube.com/playlist?list=PL123'), { kind: 'playlist', id: 'PL123' })
  assert.deepEqual(parseYtLink('https://music.youtube.com/browse/VLPL123'), { kind: 'playlist', id: 'PL123' })
  assert.deepEqual(parseYtLink('https://music.youtube.com/browse/MPREb_abc'), { kind: 'album', id: 'MPREb_abc' })
  assert.deepEqual(parseYtLink('https://music.youtube.com/channel/UCabc'), { kind: 'artist', id: 'UCabc' })
  assert.deepEqual(parseYtLink('music.youtube.com/browse/UCabc'), { kind: 'artist', id: 'UCabc' })
})

test('lo que no es un enlace conocido devuelve null', () => {
  for (const input of ['', '   ', 'hola', 'https://example.com/watch?v=1', 'https://open.spotify.com/track/abc', 'https://music.youtube.com/', null, undefined]) {
    assert.equal(parseYtLink(input), null, String(input))
  }
})

test('isSpotifyLink distingue web, sin esquema y URI', () => {
  assert.equal(isSpotifyLink('https://open.spotify.com/track/abc?si=1'), true)
  assert.equal(isSpotifyLink('open.spotify.com/playlist/abc'), true)
  assert.equal(isSpotifyLink('spotify:album:abc'), true)
  assert.equal(isSpotifyLink('https://music.youtube.com/watch?v=abc'), false)
  assert.equal(isSpotifyLink(''), false)
})

test('trackQuery usa título y artista principal', () => {
  assert.equal(trackQuery({ title: 'Tomorrow', artists: ['Kali Uchis', 'Otro'] }), 'Tomorrow Kali Uchis')
  assert.equal(trackQuery({ title: 'Solo título', artists: [] }), 'Solo título')
})

test('cleanTitle quita los sufijos de edicion que rompen la busqueda y respeta el resto', () => {
  assert.equal(cleanTitle('Panama - 2015 Remaster'), 'Panama')
  assert.equal(cleanTitle('Yesterday (Remastered 2009)'), 'Yesterday')
  assert.equal(cleanTitle('Song - Radio Edit'), 'Song')
  assert.equal(cleanTitle('Global Warming (feat. Sensato)'), 'Global Warming (feat. Sensato)')
  assert.equal(cleanTitle('Mi - Cancion'), 'Mi - Cancion')
  assert.equal(cleanTitle(''), '')
  assert.equal(trackQuery({ title: 'Panama - 2015 Remaster', artists: ['Van Halen'] }), 'Panama Van Halen')
})
