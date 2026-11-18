// Comentarios de YouTube de una canción o vídeo (MYSIC-LOCAL: no viene de Yotubei).
// youtubei.js entrega los comentarios por páginas con un objeto que guarda su propio token de continuación. Para
// servir `?page=N` por HTTP se conserva ese objeto unos minutos por vídeo y orden, y se van pidiendo las páginas
// siguientes según se necesitan. Las respuestas de cada hilo se piden aparte y también se cachean.
import { getYoutube } from './client.mjs';

const SORTS = { top: 'TOP_COMMENTS', new: 'NEWEST_FIRST' };
const SESSION_TTL_MS = 10 * 60_000;
const MAX_SESSIONS = 200;
const MAX_PAGES = 25;

const textOf = (value) => (value == null ? '' : String(value.toString?.() ?? value)).trim();

/** Comentario de youtubei.js (CommentView) → objeto plano para la app. */
export function mapComment(view) {
  if (!view?.comment_id) return null;
  const thumbnails = view.author?.thumbnails ?? [];
  const avatar = thumbnails[thumbnails.length - 1]?.url || thumbnails[0]?.url || view.creator_thumbnail_url || '';
  return {
    id: view.comment_id,
    text: textOf(view.content),
    author: textOf(view.author?.name) || 'Usuario',
    authorId: view.author?.id || null,
    avatar: avatar.startsWith('//') ? `https:${avatar}` : avatar,
    published: view.published_time || '',
    likes: view.like_count || '0',
    replies: Number.parseInt(String(view.reply_count || '0').replace(/\D/g, ''), 10) || 0,
    pinned: Boolean(view.is_pinned),
    hearted: Boolean(view.is_hearted),
    isOwner: Boolean(view.author_is_channel_owner),
    isVerified: Boolean(view.author?.is_verified || view.author?.is_verified_artist),
  };
}

/** Hilos de una página (descarta lo que no sea un comentario). */
export function mapThreads(contents) {
  return (contents || []).map((thread) => mapComment(thread?.comment)).filter(Boolean);
}

/** "2,462,506 Comments" / "6" → número; null si no se puede leer. */
export function parseCommentCount(header) {
  const raw = textOf(header?.count) || textOf(header?.comments_count);
  const digits = raw.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

function isDisabledError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('disabled') || message.includes('turned off') || message.includes('comments section');
}

/**
 * Servicio con caché de sesiones. `youtube` se inyecta en los tests.
 * page(videoId, { sort, page }) → { id, sort, page, total, comments, hasMore, disabled }
 * replies(videoId, commentId, { sort }) → { id, commentId, comments }
 */
export function createCommentsService({ getClient = getYoutube, now = Date.now } = {}) {
  const sessions = new Map();

  const prune = () => {
    const time = now();
    for (const [key, session] of sessions) if (session.expiresAt <= time) sessions.delete(key);
    while (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
  };

  async function openSession(videoId, sort) {
    const key = `${videoId}:${sort}`;
    const cached = sessions.get(key);
    if (cached && cached.expiresAt > now()) return cached;
    const session = { key, pages: [], threads: new Map(), current: null, total: null, disabled: false, loading: null, expiresAt: now() + SESSION_TTL_MS };
    sessions.set(key, session);
    prune();
    try {
      const first = await getClient().getComments(videoId, SORTS[sort]);
      session.current = first;
      session.total = parseCommentCount(first.header);
      session.pages.push(collect(session, first.contents));
    } catch (error) {
      if (!isDisabledError(error)) {
        sessions.delete(key);
        throw error;
      }
      session.disabled = true;
    }
    return session;
  }

  function collect(session, contents) {
    for (const thread of contents || []) {
      const id = thread?.comment?.comment_id;
      if (id) session.threads.set(id, thread);
    }
    return mapThreads(contents);
  }

  async function loadUntil(session, page) {
    while (session.pages.length <= page && session.current?.has_continuation && session.pages.length < MAX_PAGES) {
      // Peticiones simultáneas a la misma sesión comparten la página en curso.
      session.loading ??= session.current.getContinuation().then((next) => {
        session.current = next;
        session.pages.push(collect(session, next.contents));
      }).finally(() => { session.loading = null; });
      await session.loading;
    }
  }

  return {
    async page(videoId, { sort = 'top', page = 0 } = {}) {
      const order = SORTS[sort] ? sort : 'top';
      const index = Math.max(0, Math.min(MAX_PAGES - 1, Number(page) || 0));
      const session = await openSession(videoId, order);
      session.expiresAt = now() + SESSION_TTL_MS;
      if (!session.disabled) await loadUntil(session, index);
      const comments = session.pages[index] ?? [];
      const hasMore = !session.disabled && (index < session.pages.length - 1
        || (index === session.pages.length - 1 && Boolean(session.current?.has_continuation) && session.pages.length < MAX_PAGES));
      return { id: videoId, sort: order, page: index, total: session.total, comments, hasMore, disabled: session.disabled };
    },

    async replies(videoId, commentId, { sort = 'top' } = {}) {
      const order = SORTS[sort] ? sort : 'top';
      const session = await openSession(videoId, order);
      const thread = session.threads.get(commentId);
      if (!thread) return { id: videoId, commentId, comments: [], missing: true };
      const loaded = thread.is_prepopulated || thread.replies?.length ? thread : await thread.getReplies();
      return { id: videoId, commentId, comments: mapThreads(loaded.replies) };
    },
  };
}

let defaultService = null;
export function getCommentsService() {
  defaultService ??= createCommentsService();
  return defaultService;
}
