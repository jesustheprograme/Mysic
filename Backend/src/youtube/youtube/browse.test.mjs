import assert from 'node:assert/strict';
import test from 'node:test';
import { mapBrowseItem, mapShelf } from './browse.mjs';

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
