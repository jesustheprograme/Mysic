// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
import assert from 'node:assert/strict';
import test from 'node:test';
import { artistsOf, mapSong } from './mappers.mjs';

const run = (text, browseId) => ({ text, endpoint: browseId ? { payload: { browseId } } : undefined });
const column = (...runs) => ({ title: { runs } });

test('un vídeo trae sus artistas en `authors` (plural): ya no sale "Artista desconocido"', () => {
  const video = {
    id: 'v1',
    title: '幸せのイメージ',
    authors: [{ name: 'KANE-CHANG', channel_id: 'UC9RxxxxxxxxxxxxxxxxxxxxA' }],
    flex_columns: [column(run('x')), column(run('KANE-CHANG', 'UC9R'), run(' • '), run('58K views'), run(' • '), run('4:39'))],
  };
  const mapped = mapSong(video);
  assert.equal(mapped.artist, 'KANE-CHANG');
  assert.equal(mapped.artistId, 'UC9RxxxxxxxxxxxxxxxxxxxxA');
});

test('prioridad: artists > authors > author > texto de la segunda columna', () => {
  assert.deepEqual(artistsOf({ artists: [{ name: 'A' }], authors: [{ name: 'B' }], author: { name: 'C' } }).map((a) => a.name), ['A']);
  assert.deepEqual(artistsOf({ artists: [], authors: [{ name: 'B' }], author: { name: 'C' } }).map((a) => a.name), ['B']);
  assert.deepEqual(artistsOf({ author: { name: 'C', channel_id: 'UC1' } }), [{ name: 'C', channel_id: 'UC1' }]);
  assert.deepEqual(artistsOf({ artists: [{ name: '  ' }], authors: [{ name: '' }] }), []);
});

test('un artista que solo es texto (sin enlace de canal) se lee de la segunda columna', () => {
  const song = {
    id: 's1',
    title: 'Quasimodo (Ver. 1)',
    artists: [],
    flex_columns: [column(run('x')), column(run('Charlie Parker Sextet'), run(' • '), run('Bebop Story, Vol. 27', 'MPREb_x'), run(' • '), run('2:55'))],
  };
  const mapped = mapSong(song);
  assert.equal(mapped.artist, 'Charlie Parker Sextet');
  assert.equal(mapped.artistId, null, 'sin enlace de canal no hay id');
});

test('varios artistas separados por comas en la misma columna se conservan juntos y se toma el primer canal', () => {
  const song = { id: 's2', title: 'Duo', flex_columns: [column(run('x')), column(run('Uno', 'UC1'), run(', '), run('Dos', 'UC2'), run(' • '), run('Disco', 'MPREb_y'))] };
  const mapped = mapSong(song);
  assert.equal(mapped.artist, 'Uno, Dos');
  assert.equal(mapped.artistId, 'UC1');
});

test('una columna que solo trae datos de la fila (vistas, reproducciones, duración, año) no se toma como artista', () => {
  for (const text of ['9.1K plays', '58K views', '1.2M visualizaciones', '3:45', '1:02:03', '2019']) {
    const song = { id: 's3', title: 'Pista', flex_columns: [column(run('x')), column(run(text))] };
    assert.equal(mapSong(song, { artist: 'Del álbum' }).artist, 'Del álbum', text);
  }
});

test('los valores por defecto (pistas de álbum) siguen usándose y sin nada se mantiene el texto de siempre', () => {
  assert.equal(mapSong({ id: 'a', title: 'T' }, { artist: 'Daft Punk', artistId: 'UCdp' }).artistId, 'UCdp');
  assert.equal(mapSong({ id: 'a', title: 'T' }).artist, 'Artista desconocido');
  assert.equal(mapSong({ id: 'a', title: 'T', artists: [{ name: { text: 'Con Text' }, channel_id: 'UCx' }] }).artist, 'Con Text');
});

test('un separador suelto al principio no vacía el artista y el subtítulo de tarjetas también sirve', () => {
  const song = { id: 's4', title: 'Tarjeta', subtitle: { runs: [run(' • '), run('Oasis', 'UCmM'), run(' • '), run('716M views')] } };
  assert.equal(mapSong(song).artist, 'Oasis');
});
