// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyLibraryId,
  collectLibraryBrowse,
  getExtendedLibrary,
  parseLibraryPage,
} from './library.mjs';

function twoRow({ id, title, subtitle = '', thumbnails = [] }) {
  return {
    musicTwoRowItemRenderer: {
      title: { runs: [{ text: title }] },
      subtitle: { runs: [{ text: subtitle }] },
      navigationEndpoint: { browseEndpoint: { browseId: id } },
      thumbnailRenderer: { musicThumbnailRenderer: { thumbnail: { thumbnails } } },
    },
  };
}

test('parsea una cuadrícula y elige la miniatura de mayor resolución', () => {
  const page = { data: { contents: [{ gridRenderer: { items: [twoRow({
    id: 'MPREb_album',
    title: 'Álbum real',
    subtitle: 'Álbum • Artista • 2026',
    thumbnails: [
      { url: 'https://img.test/120.jpg', width: 120, height: 120 },
      { url: 'https://img.test/544.jpg', width: 544, height: 544 },
    ],
  })] } }] } };

  assert.deepEqual(parseLibraryPage(page, 'album'), [{
    id: 'MPREb_album',
    title: 'Álbum real',
    thumbnail: 'https://img.test/544.jpg',
    artist: 'Artista',
    year: '2026',
  }]);
});

test('cae a musicResponsiveListItemRenderer para artistas', () => {
  const page = { contents: [{ musicResponsiveListItemRenderer: {
    flexColumns: [
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{
        text: 'Artista real',
        navigationEndpoint: { browseEndpoint: { browseId: 'UCartist' } },
      }] } } },
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: '12 canciones' }] } } },
    ],
    thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: 'https://img.test/artist.jpg', width: 256 }] } } },
  } }] };

  assert.deepEqual(parseLibraryPage(page, 'artist'), [{
    id: 'UCartist',
    name: 'Artista real',
    thumbnail: 'https://img.test/artist.jpg',
    subtitle: '12 canciones',
  }]);
});

test('clasifica prefijos y elimina MPLA antes de clasificar', () => {
  assert.equal(classifyLibraryId('MPREb_album'), 'album');
  assert.equal(classifyLibraryId('MPLAUCartist'), 'artist');
  assert.equal(classifyLibraryId('VLplaylist'), 'playlist');
  assert.equal(classifyLibraryId('video-id'), null);
});

test('deduplica por id entre páginas y corta un token repetido', async () => {
  const calls = [];
  const pages = [
    { contents: [twoRow({ id: 'MPREb_one', title: 'Uno' })], continuationCommand: { token: 'same-token' } },
    { contents: [
      twoRow({ id: 'MPREb_one', title: 'Uno repetido' }),
      twoRow({ id: 'MPREb_two', title: 'Dos' }),
    ], continuationCommand: { token: 'same-token' } },
  ];
  const youtube = { actions: { execute: async (_path, payload) => {
    calls.push(payload);
    return pages[calls.length - 1];
  } } };

  const items = await collectLibraryBrowse(youtube, {
    browseId: 'FEmusic_liked_albums',
    kind: 'album',
    label: 'los álbumes',
  });

  assert.deepEqual(items.map((item) => item.id), ['MPREb_one', 'MPREb_two']);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].continuation, 'same-token');
});

test('conserva resultados parciales si una consulta falla', async () => {
  let calls = 0;
  const youtube = { actions: { execute: async (_path, payload) => {
    calls += 1;
    if (payload.browseId === 'FEmusic_library_corpus_track_artists') throw new Error('fallo simulado');
    const id = payload.browseId.includes('artists') ? 'UCsubscription' : 'MPREb_release';
    return { contents: [twoRow({ id, title: 'Resultado' })] };
  } } };

  const result = await getExtendedLibrary(youtube, { userId: 'partial-test', fresh: true });

  assert.equal(result.albums.length, 1);
  assert.deepEqual(result.artists, []);
  assert.equal(result.subscriptions.length, 1);
  assert.equal(result.uploads.length, 1);

  await getExtendedLibrary(youtube, { userId: 'partial-test' });
  assert.equal(calls, 8);
});

test('cachea por usuario y fresh fuerza las cuatro consultas', async () => {
  let calls = 0;
  const youtube = { actions: { execute: async (_path, payload) => {
    calls += 1;
    const id = payload.browseId.includes('artists') ? 'UCcached' : 'MPREb_cached';
    return { contents: [twoRow({ id, title: 'Cacheado' })] };
  } } };

  await getExtendedLibrary(youtube, { userId: 'cache-user', fresh: true });
  await getExtendedLibrary(youtube, { userId: 'cache-user' });
  assert.equal(calls, 4);

  await getExtendedLibrary(youtube, { userId: 'other-user' });
  assert.equal(calls, 8);

  await getExtendedLibrary(youtube, { userId: 'cache-user', fresh: true });
  assert.equal(calls, 12);
});

test('avisa si encuentra renderers pero no puede parsear ninguno', async () => {
  const diagnostics = {};
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(String(message));
  try {
    const items = await collectLibraryBrowse({
      actions: { execute: async () => ({ contents: [twoRow({ id: 'UCnot-an-album', title: 'Artista' })] }) },
    }, {
      browseId: 'FEmusic_liked_albums',
      kind: 'album',
      label: 'los álbumes guardados',
      diagnostics,
    });

    assert.deepEqual(items, []);
    assert.equal(diagnostics.pages, 1);
    assert.equal(diagnostics.foundTwoRow, 1);
    assert.equal(diagnostics.foundResponsive, 0);
    assert.equal(diagnostics.parsed, 0);
    assert.equal(diagnostics.unique, 0);
    assert.ok(diagnostics.elapsedMs >= 0);
    assert.match(warnings[0], /1 renderers encontrados y 0 parseados/);
  } finally {
    console.warn = originalWarn;
  }
});
