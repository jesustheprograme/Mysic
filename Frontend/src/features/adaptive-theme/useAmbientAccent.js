import { useEffect } from 'react'

const PROPERTY = '--ambient-accent'

/**
 * Publica el color de la portada que suena como `--ambient-accent` en <html>, para que la zona de
 * contenido se tiña con él (ver minimal.css). Al desmontar el reproductor se retira.
 */
export default function useAmbientAccent(accent) {
  useEffect(() => {
    const root = document.documentElement
    if (accent) root.style.setProperty(PROPERTY, accent)
    else root.style.removeProperty(PROPERTY)
  }, [accent])

  useEffect(() => () => document.documentElement.style.removeProperty(PROPERTY), [])
}