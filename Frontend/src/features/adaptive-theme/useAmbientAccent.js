import { useEffect } from 'react'

const PROPERTY = '--ambient-accent'
const TARGET = '.music-app__content'

/**
 * Publica el color de la portada que suena como `--ambient-accent` en la zona de contenido (ver minimal.css), que es
 * lo único que lo usa. Se pone en ese elemento y no en <html>: la propiedad no hereda y su fundido de 700 ms solo
 * repinta un elemento, no recalcula los estilos de toda la página. Al desmontar el reproductor se retira.
 */
export default function useAmbientAccent(accent) {
  useEffect(() => {
    const target = document.querySelector(TARGET)
    if (!target) return
    if (accent) target.style.setProperty(PROPERTY, accent)
    else target.style.removeProperty(PROPERTY)
  }, [accent])

  useEffect(() => () => document.querySelector(TARGET)?.style.removeProperty(PROPERTY), [])
}
