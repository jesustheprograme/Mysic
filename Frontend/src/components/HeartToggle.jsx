import { Heart } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import './heart-toggle.css'

function HeartToggle({
  className = '',
  label = 'Añadir a favoritos',
  liked: controlledLiked,
  onToggle,
  portalCelebration = false,
  removeLabel = 'Quitar de favoritos',
  size = 20,
}) {
  const [internalLiked, setInternalLiked] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const [celebrationPosition, setCelebrationPosition] = useState(null)
  const timeoutRef = useRef(null)
  const liked = controlledLiked ?? internalLiked

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  function toggleFavorite(event) {
    const nextLiked = !liked
    if (controlledLiked === undefined) setInternalLiked(nextLiked)
    onToggle?.(nextLiked, event)

    if (!nextLiked) {
      clearTimeout(timeoutRef.current)
      setCelebrating(false)
      setCelebrationPosition(null)
      return
    }

    if (portalCelebration) {
      const bounds = event.currentTarget.getBoundingClientRect()
      setCelebrationPosition({
        left: bounds.left + bounds.width / 2,
        top: bounds.top + bounds.height / 2,
      })
    }

    clearTimeout(timeoutRef.current)
    setCelebrating(false)
    requestAnimationFrame(() => {
      setCelebrating(true)
      timeoutRef.current = setTimeout(() => {
        setCelebrating(false)
        setCelebrationPosition(null)
      }, 520)
    })
  }

  const celebration = (
    <svg
      className={portalCelebration ? 'svg-celebrate svg-celebrate--portal' : 'svg-celebrate'}
      style={portalCelebration ? celebrationPosition : undefined}
      width="64"
      height="64"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <polygon points="10,10 20,20" />
      <polygon points="10,50 20,50" />
      <polygon points="20,80 30,70" />
      <polygon points="90,10 80,20" />
      <polygon points="90,50 80,50" />
      <polygon points="80,80 70,70" />
    </svg>
  )

  return (
    <>
      <button
        className={`heart-container${className ? ` ${className}` : ''}${celebrating ? ' heart-container--celebrating' : ''}`}
        type="button"
        aria-label={liked ? removeLabel : label}
        aria-pressed={liked}
        title={liked ? removeLabel : label}
        onClick={toggleFavorite}
      >
        <Heart
          className="heart-icon"
          size={size}
          fill={liked ? 'currentColor' : 'none'}
          strokeWidth={1.7}
          aria-hidden="true"
        />
        {!portalCelebration && celebration}
      </button>
      {portalCelebration && celebrating && celebrationPosition
        ? createPortal(celebration, document.body)
        : null}
    </>
  )
}

export default HeartToggle
