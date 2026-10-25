import assert from 'node:assert/strict';
import test from 'node:test';
import { collectArtistSongs, createReleasePreview, expandReleaseShelf, findSongAlbum, mergeReleaseItems, selectArtistSongDetails } from './artist.mjs';

test('combina la vista previa y la discografía completa sin duplicar lanzamientos', () => {
  const preview = [{ id: 'album-1', title: 'Uno' }, { id: 'album-2', title: 'Dos' }];
  const complete = [{ id: 'album-1', title: 'Uno completo' }, { id: 'album-3', title: 'Tres' }];

  assert.deepEqual(mergeReleaseItems(preview, complete), [
    { id: 'album-1', title: 'Uno completo' },
    { id: 'album-2', title: 'Dos' },
    { id: 'album-3', title: 'Tres' },
  ]);
});

test('amplía la discografía exclusivamente con el endpoint de YouTube Music', async () => {
  const calls = [];
  const release = (id, title, subtitle = 'Album • 2024') => ({
    id,
    item_type: 'album',
    subtitle: { text: subtitle },
    title: { text: title },
  });
  const section = {
    contents: [release('album-1', 'Vista previa')],
    header: {
      title: { text: 'Albums' },
      more_content: {
        endpoint: {
          call: async (actions, options) => {
            calls.push({ actions, options });
            return {
              contents_memo: new Map([
                ['MusicTwoRowItem', [release('album-1', 'Completo'), release('album-2', 'Segundo')]],
              ]),
            };
          },
        },
      },
    },
  };
  const youtube = { actions: { source: 'music' } };

  const releases = await expandReleaseShelf(section, { id: 'artist-1', name: 'Artista' }, youtube);

  assert.deepEqual(calls, [{ actions: youtube.actions, options: { client: 'YTMUSIC', parse: true } }]);
  assert.deepEqual(releases.map((item) => item.id), ['album-1', 'album-2']);
  assert.equal(releases[0].artist, 'Artista');
  assert.equal(releases[0].artistId, 'artist-1');
});

test('la primera vista usa la discografía visible sin esperar la expansión', () => {
  let expansionCalls = 0;
  const release = { id: 'album-1', item_type: 'album', title: { text: 'Vista previa' } };
  const sections = [{
    type: 'MusicCarouselShelf',
    contents: [release],
    header: {
      title: { text: 'Álbumes' },
      more_content: { endpoint: { call: () => { expansionCalls += 1; } } },
    },
  }];

  const shelves = createReleasePreview(sections, { id: 'artist-1', name: 'Artista' });

  assert.equal(expansionCalls, 0);
  assert.deepEqual(shelves[0].items.map((item) => item.id), ['album-1']);
});

test('extrae el álbum enlazado de una canción popular', () => {
  const item = {
    flex_columns: [{ title: { runs: [
      { text: 'Artista', endpoint: { payload: { browseId: 'UCartist' } } },
      { text: 'Álbum real', endpoint: { payload: { browseId: 'MPREalbum' } } },
    ] } }],
  };

  assert.deepEqual(findSongAlbum(item), { id: 'MPREalbum', name: 'Álbum real' });
});

test('carga todas las páginas de canciones y elimina duplicados', async () => {
  const song = (id, title, albumId, album) => ({
    id,
    item_type: 'song',
    title: { text: title },
    flex_columns: [{ title: { runs: [{ text: album, endpoint: { payload: { browseId: albumId } } }] } }],
  });
  const secondPage = {
    items: [song('song-2', 'Dos', 'MPREalbum-2', 'Álbum 2')],
    has_continuation: false,
  };
  const firstPage = {
    items: [song('song-1', 'Uno', 'MPREalbum-1', 'Álbum 1'), song('song-2', 'Dos', 'MPREalbum-2', 'Álbum 2')],
    has_continuation: true,
    getContinuation: async () => secondPage,
  };

  const songs = await collectArtistSongs(firstPage, { artist: 'Artista', artistId: 'UCartist' });

  assert.deepEqual(songs.map((item) => item.id), ['song-1', 'song-2']);
  assert.deepEqual(songs.map((item) => item.album), ['Álbum 1', 'Álbum 2']);
  assert.deepEqual(songs.map((item) => item.albumId), ['MPREalbum-1', 'MPREalbum-2']);
});

test('completa solo las canciones destacadas con su duración real', () => {
  const items = [
    { id: 'top-1', item_type: 'song', title: 'Uno', duration: { text: '3:21', seconds: 201 } },
    { id: 'other', item_type: 'song', title: 'Otra', duration: { text: '4:00', seconds: 240 } },
  ];

  const songs = selectArtistSongDetails(items, ['top-1'], { artist: 'Artista' });

  assert.equal(songs.length, 1);
  assert.equal(songs[0].duration, '3:21');
  assert.equal(songs[0].durationSeconds, 201);
});

