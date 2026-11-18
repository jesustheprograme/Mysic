import { ChevronDown, Heart, LoaderCircle, MessageSquareOff, Pin, ThumbsUp } from 'lucide-react'
import { memo, useEffect, useRef, useState } from 'react'
import { sizedImage } from '../../lib/imageSize.js'
import { api } from '../youtube/lib/api.js'
import { formatLikes, formatTotal, mergeComments, translatePublished } from './commentsModel.js'
import './comments.css'

// Comentarios de YouTube de la canción que suena. Se piden por páginas al servidor (/comments/:id) y la siguiente se
// carga al llegar al final de la lista. Cambiar de canción o de orden empieza de cero.

const SORTS = [
  { id: 'top', label: 'Más relevantes' },
  { id: 'new', label: 'Más recientes' },
]

function initialState(key) {
  return { key, comments: [], page: -1, total: null, hasMore: true, disabled: false, loading: false, error: null }
}

const CommentItem = memo(function CommentItem({ comment, sort, videoId, isReply = false }) {
  const [replies, setReplies] = useState({ open: false, loading: false, items: [], error: null })
  const likes = formatLikes(comment.likes)

  async function toggleReplies() {
    if (replies.open) { setReplies((current) => ({ ...current, open: false })); return }
    if (replies.items.length) { setReplies((current) => ({ ...current, open: true })); return }
    setReplies({ open: true, loading: true, items: [], error: null })
    try {
      const data = await api.commentReplies(videoId, comment.id, sort)
      setReplies({ open: true, loading: false, items: data.comments ?? [], error: null })
    } catch {
      setReplies({ open: true, loading: false, items: [], error: 'No se pudieron cargar las respuestas.' })
    }
  }

  return (
    <li className={`comment${isReply ? ' comment--reply' : ''}`}>
      {comment.avatar
        ? <img className="comment__avatar" src={sizedImage(comment.avatar, isReply ? 28 : 36)} alt="" width={isReply ? 28 : 36} height={isReply ? 28 : 36} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        : <span className="comment__avatar" aria-hidden="true" />}
      <div className="comment__body">
        {comment.pinned && <span className="comment__pinned"><Pin size={11} aria-hidden="true" />Fijado</span>}
        <div className="comment__meta">
          <strong className={comment.isOwner ? 'comment__author comment__author--owner' : 'comment__author'}>{comment.author}</strong>
          <span>{translatePublished(comment.published)}</span>
        </div>
        <p className="comment__text">{comment.text}</p>
        <div className="comment__actions">
          <span className="comment__likes"><ThumbsUp size={13} aria-hidden="true" />{likes}</span>
          {comment.hearted && <span className="comment__heart" title="Al autor le encanta"><Heart size={12} fill="currentColor" aria-hidden="true" /></span>}
          {!isReply && comment.replies > 0 && (
            <button className="comment__replies-toggle" type="button" aria-expanded={replies.open} onClick={toggleReplies}>
              <ChevronDown size={14} aria-hidden="true" />
              {replies.open ? 'Ocultar respuestas' : `${comment.replies} ${comment.replies === 1 ? 'respuesta' : 'respuestas'}`}
            </button>
          )}
        </div>
        {replies.open && (
          <ul className="comment__replies">
            {replies.loading && <li className="comments__status"><LoaderCircle className="comments__spin" size={14} aria-hidden="true" /> Cargando…</li>}
            {replies.error && <li className="comments__status">{replies.error}</li>}
            {replies.items.map((reply) => <CommentItem comment={reply} isReply key={reply.id} sort={sort} videoId={videoId} />)}
          </ul>
        )}
      </div>
    </li>
  )
})

export default function CommentsPanel({ videoId }) {
  const [sort, setSort] = useState('top')
  const key = `${videoId}:${sort}`
  const [state, setState] = useState(() => initialState(key))
  const current = state.key === key ? state : initialState(key)
  const sentinelRef = useRef(null)
  const requestRef = useRef(null)

  // Pide la página siguiente de esta canción y orden; las respuestas que llegan tarde de otra clave se descartan.
  const loadNext = useRef(null)
  loadNext.current = () => {
    if (!videoId || current.loading || !current.hasMore || current.disabled || current.error) return
    const page = current.page + 1
    const controller = new AbortController()
    requestRef.current?.abort()
    requestRef.current = controller
    setState({ ...current, loading: true })
    api.comments(videoId, { sort, page }, controller.signal)
      .then((data) => setState((latest) => {
        const base = latest.key === key ? latest : initialState(key)
        return {
          ...base,
          comments: mergeComments(base.comments, data.comments ?? []),
          page,
          total: data.total ?? base.total,
          hasMore: Boolean(data.hasMore),
          disabled: Boolean(data.disabled),
          loading: false,
        }
      }))
      .catch((error) => {
        if (controller.signal.aborted) return
        const message = error?.status === 404
          ? 'Los comentarios llegarán cuando se actualice el servidor de Mysic.'
          : 'No se pudieron cargar los comentarios.'
        setState((latest) => ({ ...(latest.key === key ? latest : initialState(key)), loading: false, error: message }))
      })
  }

  // Primera página al abrir, al cambiar de canción o de orden.
  useEffect(() => {
    loadNext.current()
    return () => requestRef.current?.abort()
  }, [key])

  // Página siguiente al acercarse al final de la lista. Al reintentar (error → null) el observador se vuelve a crear y,
  // si el final está a la vista, pide la página otra vez.
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || typeof IntersectionObserver !== 'function') return undefined
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) loadNext.current() }, { rootMargin: '300px 0px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [key, current.page, current.error])

  const total = formatTotal(current.total)

  return (
    <section className="comments" aria-label="Comentarios de YouTube">
      <header className="comments__header">
        <strong>{total || 'Comentarios'}</strong>
        <div className="comments__sort" role="group" aria-label="Ordenar comentarios">
          {SORTS.map((option) => (
            <button
              className={sort === option.id ? 'comments__sort-option comments__sort-option--active' : 'comments__sort-option'}
              type="button"
              aria-pressed={sort === option.id}
              key={option.id}
              onClick={() => setSort(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {current.disabled ? (
        <p className="comments__empty"><MessageSquareOff size={18} aria-hidden="true" />Los comentarios están desactivados en esta canción.</p>
      ) : (
        <ul className="comments__list">
          {current.comments.map((comment) => <CommentItem comment={comment} key={comment.id} sort={sort} videoId={videoId} />)}
        </ul>
      )}

      {current.loading && <p className="comments__status"><LoaderCircle className="comments__spin" size={14} aria-hidden="true" /> Cargando comentarios…</p>}
      {current.error && (
        <p className="comments__status" role="status">
          {current.error}
          <button type="button" onClick={() => setState({ ...current, error: null, loading: false })}>Reintentar</button>
        </p>
      )}
      {!current.loading && !current.error && !current.disabled && current.page >= 0 && !current.comments.length && (
        <p className="comments__empty">Todavía no hay comentarios.</p>
      )}
      <div className="comments__sentinel" ref={sentinelRef} aria-hidden="true" />
    </section>
  )
}
