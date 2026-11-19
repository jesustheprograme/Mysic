// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSearchMusic, mapGeneralSections, mapVideo, SEARCH_TYPES, VIDEO_SEARCH_PARAMS } from './search.mjs';

const baseVideo = {
  id: 'abcdefghijk',
  title: 'Vídeo oficial',
  duration: { text: '3:21', seconds: 201 },
  thumbnail: [{ url: 'https://img.test/video.jpg', width: 320 }],
  videoType: 'MUSIC_VIDEO_TYPE_OMV',
};

test('acepta video como tipo de búsqueda', () => {
  assert.equal(SEARCH_TYPES.has('video'), true);
  assert.equal(VIDEO_SEARCH_PARAMS, 'EgWKAQIQAWoKEAkQChAFEAMQBA==');
});

test('mapVideo usa author cuando no hay artists', () => {
  const video = mapVideo({ ...baseVideo, author: { name: 'Canal', channel_id: 'UCauthor' } });
  assert.equal(video.artist, 'Canal');
  assert.equal(video.artistId, 'UCauthor');
  assert.equal(video.videoType, 'OMV');
});

test('mapVideo prioriza artists y admite videos sin autor', () => {
  const withArtists = mapVideo({
    ...baseVideo,
    artists: [{ name: 'Artista', channel_id: 'UCartist' }],
    author: { name: 'Canal', channel_id: 'UCauthor' },
  });
  const withoutArtist = mapVideo({ ...baseVideo, videoType: 'MUSIC_VIDEO_TYPE_UGC' });

  assert.equal(withArtists.artist, 'Artista');
  assert.equal(withArtists.artistId, 'UCartist');
  assert.equal(withoutArtist.artist, 'Artista desconocido');
  assert.equal(withoutArtist.videoType, 'UGC');
  assert.equal(mapVideo({ title: 'Sin id' }), null);
});

test('usa results.videos.contents sin alterar los demás tipos', async () => {
  const calls = [];
  const youtube = { music: { search: async (_text, filters) => {
    calls.push(filters);
    if (filters.type === 'video') return { videos: { contents: [baseVideo] } };
    return { songs: { contents: [{ id: 'song-id', title: 'Canción', artists: [{ name: 'Artista' }] }] } };
  } } };

  assert.deepEqual(await loadSearchMusic('Ado', 'video', youtube), {
    type: 'video',
    items: [mapVideo(baseVideo)],
  });
  assert.equal((await loadSearchMusic('Ado', 'song', youtube)).items[0].id, 'song-id');
  assert.deepEqual(calls, [{ type: 'video' }, { type: 'song' }]);
});

test('usa el params explícito si youtubei.js no expone videos', async () => {
  const fallbackVideo = { ...baseVideo, item_type: 'video' };
  const calls = [];
  const youtube = {
    music: { search: async () => ({ videos: { contents: [] } }) },
    actions: { execute: async (endpoint, payload) => {
      calls.push([endpoint, payload]);
      return { contents_memo: new Map([['MusicResponsiveListItem', [fallbackVideo]]]) };
    } },
  };

  const result = await loadSearchMusic('Ado', 'video', youtube);
  assert.equal(result.items[0].id, fallbackVideo.id);
  assert.deepEqual(calls, [['/search', {
    query: 'Ado',
    params: VIDEO_SEARCH_PARAMS,
    client: 'YTMUSIC',
    parse: true,
  }]]);
});

test('búsqueda general en el formato plano de ItemSection: reparte canciones, vídeos, artistas y álbumes', () => {
  const row = (item_type, id, title, secondColumn, extra = {}) => ({ type: 'MusicResponsiveListItem', item_type, id, title, flex_columns: [{ title: { text: title } }, { title: { text: secondColumn, runs: secondColumn.split(' • ').flatMap((text, index) => (index ? [{ text: ' • ' }, { text }] : [{ text }])) } }], ...extra });
  const general = { contents: [
    { type: 'MusicCardShelf', contents: [] },
    { type: 'ItemSection', contents: [row('song', 's1', 'Uno', 'Song • Ado • 23K plays', { artists: [{ name: 'Ado', channel_id: 'UC1' }] })] },
    { type: 'ItemSection', contents: [row('video', 'v1', 'Clip', 'Video • Q2000 • 1K views', { authors: [{ name: 'Q2000', channel_id: 'UC2' }] })] },
    { type: 'ItemSection', contents: [row('album', 'MPREb_1', 'Disco', 'Album • Ado • 2022', { year: '2022' })] },
    { type: 'ItemSection', contents: [{ ...row('artist', 'UC3', 'Otro', 'Artist'), name: 'Otro', subtitle: { text: 'Artist • 1.6M monthly audience' } }] },
    { type: 'ItemSection', contents: [row('song', 's2', 'Dos', 'Song • Anthrax & Sinecore • 218 plays')] },
    { type: 'ItemSection', contents: [row('playlist', 'PL1', 'Lista', 'Playlist • YouTube Music')] },
  ] };
  const result = mapGeneralSections(general);
  assert.deepEqual(result.songs.map((song) => [song.id, song.artist]), [['s1', 'Ado'], ['s2', 'Anthrax & Sinecore'], ['v1', 'Q2000']], 'canciones antes que vídeos, sin tomar "Song" por artista');
  assert.deepEqual(result.albums.map((album) => [album.id, album.artist, album.year]), [['MPREb_1', 'Ado', '2022']]);
  assert.deepEqual(result.artists.map((artist) => [artist.id, artist.name, artist.subtitle]), [['UC3', 'Otro', '1.6M monthly audience']]);
});

test('búsqueda general en el formato antiguo de estanterías sigue usando los getters', () => {
  const song = { id: 'a', title: 'Vieja', artists: [{ name: 'X' }] };
  const result = mapGeneralSections({ songs: { contents: [song] }, artists: { contents: [] }, albums: { contents: [] }, contents: [] });
  assert.deepEqual(result.songs.map((item) => item.id), ['a']);
});