import assert from 'node:assert/strict';
import test from 'node:test';
import { createCommentsService, mapComment, parseCommentCount } from './comments.mjs';

const view = (id, extra = {}) => ({
  comment_id: id,
  content: { toString: () => `texto ${id}` },
  author: { id: `UC${id}`, name: `@autor${id}`, thumbnails: [{ url: '//yt3/small' }, { url: '//yt3/big' }] },
  published_time: '6 years ago',
  like_count: '429K',
  reply_count: '775',
  ...extra,
});
const thread = (id, extra) => ({ comment: view(id, extra), replies: [], is_prepopulated: false, getReplies: async () => ({ replies: [{ comment: view(`${id}-r1`) }] }) });

function fakePage(ids, next) {
  return {
    header: { count: { toString: () => '2,462,506 Comments' } },
    contents: ids.map((id) => thread(id)),
    has_continuation: Boolean(next),
    getContinuation: async () => next(),
  };
}

test('mapComment: aplana el comentario y completa la URL del avatar', () => {
  const comment = mapComment(view('a', { is_pinned: true, is_hearted: true, author_is_channel_owner: true }));
  assert.deepEqual(comment, {
    id: 'a', text: 'texto a', author: '@autora', authorId: 'UCa', avatar: 'https://yt3/big', published: '6 years ago',
    likes: '429K', replies: 775, pinned: true, hearted: true, isOwner: true, isVerified: false,
  });
  assert.equal(mapComment(null), null);
  assert.equal(mapComment({}), null);
});

test('parseCommentCount: lee el total con separadores', () => {
  assert.equal(parseCommentCount({ count: { toString: () => '2,462,506 Comments' } }), 2462506);
  assert.equal(parseCommentCount({ comments_count: { toString: () => '6' } }), 6);
  assert.equal(parseCommentCount({}), null);
});

test('page: pagina con la continuación guardada y la reutiliza', async () => {
  let calls = 0;
  let continuations = 0;
  const client = {
    getComments: async (id, sort) => {
      calls += 1;
      assert.equal(sort, 'NEWEST_FIRST');
      return fakePage(['1', '2'], () => { continuations += 1; return fakePage(['3'], null); });
    },
  };
  const service = createCommentsService({ getClient: () => client });
  const first = await service.page('dQw4w9WgXcQ', { sort: 'new', page: 0 });
  assert.deepEqual(first.comments.map((c) => c.id), ['1', '2']);
  assert.equal(first.total, 2462506);
  assert.equal(first.hasMore, true);
  const second = await service.page('dQw4w9WgXcQ', { sort: 'new', page: 1 });
  assert.deepEqual(second.comments.map((c) => c.id), ['3']);
  assert.equal(second.hasMore, false);
  // Volver a pedir la primera página no repite la petición a YouTube.
  await service.page('dQw4w9WgXcQ', { sort: 'new', page: 0 });
  assert.equal(calls, 1);
  assert.equal(continuations, 1);
});

test('page: comentarios desactivados no es un error', async () => {
  const service = createCommentsService({ getClient: () => ({ getComments: async () => { throw new Error('Comments are turned off'); } }) });
  const result = await service.page('dQw4w9WgXcQ');
  assert.equal(result.disabled, true);
  assert.deepEqual(result.comments, []);
  assert.equal(result.hasMore, false);
});

test('page: otros errores se propagan y no quedan cacheados', async () => {
  let fail = true;
  const service = createCommentsService({ getClient: () => ({ getComments: async () => { if (fail) throw new Error('red'); return fakePage(['1'], null); } }) });
  await assert.rejects(service.page('dQw4w9WgXcQ'), /red/);
  fail = false;
  assert.equal((await service.page('dQw4w9WgXcQ')).comments.length, 1);
});

test('replies: carga las respuestas del hilo cacheado', async () => {
  const service = createCommentsService({ getClient: () => ({ getComments: async () => fakePage(['1'], null) }) });
  await service.page('dQw4w9WgXcQ');
  const result = await service.replies('dQw4w9WgXcQ', '1');
  assert.deepEqual(result.comments.map((c) => c.id), ['1-r1']);
  assert.equal((await service.replies('dQw4w9WgXcQ', 'nope')).missing, true);
});
