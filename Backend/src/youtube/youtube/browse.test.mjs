import assert from 'node:assert/strict';
import test from 'node:test';
import { getPlaylistQueue, mapBrowseItem, mapShelf, rotateHomeShelves } from './browse.mjs';

test('normaliza una canción de radio al contrato del reproductor', () => {
  const item = mapBrowseItem({
    type: 'PlaylistPanelVideo',
    video_id: 'kJQP7kiw5Fk',
    title: { text: 'Despacito' },
    artists: [{ name: 'Luis Fonsi', channel_id: 'UC123' }],
    duration: { text: '4:42', seconds: 282 },
    thumbnail: [{ url: 'https://example.com/cover.jpg', width: 320 }],
  });

  assert.equal(item.kind, 'song');
  assert.equal(item.id, 'kJQP7kiw5Fk');
  assert.equal(item.title, 'Despacito');
  assert.equal(item.artist, 'Luis Fonsi');
  assert.equal(item.durationSeconds, 282);
});

test('omite elementos no reproducibles y conserva colecciones compatibles', () => {
  const shelf = mapShelf({
    header: { title: { text: 'Para ti' } },
    contents: [
      { item_type: 'unknown' },
      {
        item_type: 'playlist',
        id: 'VLPL12345',
        title: { text: 'Mix diario' },
        subtitle: { text: 'YouTube Music' },
        thumbnail: { contents: [{ url: 'https://example.com/mix.jpg', width: 200 }] },
      },
    ],
  });

  assert.equal(shelf.title, 'Para ti');
  assert.equal(shelf.items.length, 1);
  assert.deepEqual(shelf.items[0], {
    kind: 'playlist',
    id: 'PL12345',
    title: 'Mix diario',
    subtitle: 'YouTube Music',
    thumbnail: 'https://example.com/mix.jpg',
  });
});

test('normaliza las pistas de una playlist de YouTube Music', () => {
  const item = mapBrowseItem({
    type: 'MusicResponsiveListItem',
    item_type: 'song',
    id: 'abcdefghijk',
    title: 'Canción de playlist',
    artists: [{ name: 'Artista', channel_id: 'UC456' }],
    album: { id: 'MPRE123', name: 'Álbum' },
    duration: { text: '3:10', seconds: 190 },
    thumbnail: { contents: [{ url: 'https://example.com/song.jpg', width: 320 }] },
  });

  assert.equal(item.kind, 'song');
  assert.equal(item.id, 'abcdefghijk');
  assert.equal(item.album, 'Álbum');
  assert.equal(item.durationSeconds, 190);
});

test('convierte objetos Text de feeds personalizados en valores primitivos', () => {
  const text = (value) => ({ text: value, runs: [{ text: value }], rtl: false });
  const song = mapBrowseItem({
    item_type: 'song',
    id: 'abcdefghijk',
    title: text('Canción personal'),
    artists: [{ name: text('Artista personal'), channel_id: 'UC123' }],
    album: { id: 'MPRE123', name: text('Álbum personal') },
    duration: { text: '3:10', seconds: 190 },
  });
  const artist = mapBrowseItem({
    item_type: 'artist',
    id: 'UC12345',
    title: text('Artista recomendado'),
    subtitle: text('Artista • 2 M oyentes'),
  });
  const album = mapBrowseItem({
    item_type: 'album',
    id: 'MPRE12345',
    title: text('Álbum recomendado'),
    author: { name: text('Autor recomendado'), channel_id: 'UC123' },
    year: text('2026'),
  });

  assert.deepEqual(
    [song.title, song.artist, song.album, artist.name, artist.subtitle, album.title, album.artist, album.year]
      .map((value) => typeof value),
    Array(8).fill('string'),
  );
});

test('muestra otra ventana del feed sin inventar recomendaciones', () => {
  const shelves = [
    { title: 'Uno', items: [{ id: 'a' }, { id: 'b' }] },
    { title: 'Dos', items: [{ id: 'c' }, { id: 'd' }] },
    { title: 'Tres', items: [{ id: 'e' }, { id: 'f' }] },
  ];
  const rotated = rotateHomeShelves(shelves, 1, 2);

  assert.deepEqual(rotated.map((shelf) => shelf.title), ['Dos', 'Tres']);
  assert.deepEqual(rotated.flatMap((shelf) => shelf.items.map((item) => item.id)), ['d', 'c', 'e', 'f']);
  assert.deepEqual(shelves[1].items.map((item) => item.id), ['c', 'd']);
});

test('carga playlists con el cliente de la cuenta solicitante', async () => {
  const calls = [];
  const youtube = {
    music: {
      async getPlaylist(id) {
        calls.push(id);
        return {
          header: { title: { text: 'Playlist privada' } },
          items: [{
            type: 'MusicResponsiveListItem',
            item_type: 'song',
            id: 'abcdefghijk',
            title: 'Canción privada',
            artists: [{ name: 'Artista privado', channel_id: 'UC123' }],
          }],
        };
      },
    },
  };

  const playlist = await getPlaylistQueue('PLprivada', youtube);
  assert.deepEqual(calls, ['PLprivada']);
  assert.equal(playlist.title, 'Playlist privada');
  assert.equal(playlist.songs[0].title, 'Canción privada');
});
