import assert from 'node:assert/strict';
import test from 'node:test';
import { countArtistSongs, expandReleaseShelf, findSongAlbum, mergeReleaseItems } from './artist.mjs';

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

test('extrae el álbum enlazado de una canción popular', () => {
  const item = {
    flex_columns: [{ title: { runs: [
      { text: 'Artista', endpoint: { payload: { browseId: 'UCartist' } } },
      { text: 'Álbum real', endpoint: { payload: { browseId: 'MPREalbum' } } },
    ] } }],
  };

  assert.deepEqual(findSongAlbum(item), { id: 'MPREalbum', name: 'Álbum real' });
});

test('cuenta canciones únicas recorriendo las continuaciones de Music', async () => {
  const secondPage = {
    items: [{ id: 'song-2' }, { id: 'song-3' }],
    has_continuation: false,
  };
  const firstPage = {
    items: [{ id: 'song-1' }, { id: 'song-2' }, { type: 'ContinuationItem' }],
    has_continuation: true,
    getContinuation: async () => secondPage,
  };
  const calls = [];
  const youtube = { music: { getPlaylist: async (id) => { calls.push(id); return firstPage; } } };
  const section = { endpoint: { payload: { browseId: 'VLartist-songs' } } };

  assert.equal(await countArtistSongs(section, youtube), 3);
  assert.deepEqual(calls, ['VLartist-songs']);
});
