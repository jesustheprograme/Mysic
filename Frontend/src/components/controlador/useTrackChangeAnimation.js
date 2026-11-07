import { useEffect, useRef, useState } from 'react'

/** true durante el fotograma posterior a un cambio de pista, para disparar la animación del dock. */
export default function useTrackChangeAnimation(animationNonce) {
  const hasMountedRef = useRef(false)
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return undefined
    }

    setEnabled(false)
    const frameId = requestAnimationFrame(() => setEnabled(true))
    return () => cancelAnimationFrame(frameId)
  }, [animationNonce])
  return enabled
}
