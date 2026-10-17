// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rankSearchResult } from './searchRanking.js';

test('prioriza el artista con nombre exacto', () => {
  const result = rankSearchResult({
    type: 'artist',
    items: [
      { id: 'ado-money', name: 'Ado$' },
      { id: 'ado', name: 'Ado' },
      { id: 'shadow', name: 'Shadow' },
    ],
  }, 'Ado');

  assert.deepEqual(result.items.map((item) => item.id), ['ado', 'ado-money', 'shadow']);
});

test('prioriza lanzamientos del artista exacto en resultados combinados', () => {
  const result = rankSearchResult({
    type: 'all',
    songs: [],
    artists: [],
    albums: [
      { id: 'other', title: 'Ado', artist: 'Otro artista' },
      { id: 'official', title: 'Best Album', artist: 'Ado' },
    ],
  }, 'Ado');

  assert.deepEqual(result.albums.map((item) => item.id), ['official', 'other']);
});

test('mantiene el orden original cuando la relevancia empata', () => {
  const result = rankSearchResult({
    type: 'song',
    items: [{ id: 'one', title: 'Uno' }, { id: 'two', title: 'Dos' }],
  }, 'sin coincidencia');

  assert.deepEqual(result.items.map((item) => item.id), ['one', 'two']);
});
