// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSearchMusic, mapVideo, SEARCH_TYPES, VIDEO_SEARCH_PARAMS } from './search.mjs';

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
