// Barra de scroll superpuesta: no ocupa espacio (la nativa sigue oculta en todo Mysic, ver index.css) y se dibuja
// encima del borde derecho del elemento. Aparece al pasar el ratón o al desplazarse y se puede arrastrar.
//
// Rendimiento: las lecturas (scrollTop, scrollHeight, clientHeight) se hacen en el evento de scroll, con el diseño ya
// calculado, y la escritura (un transform) va en el siguiente fotograma. La posición en pantalla del elemento solo se
// mide cuando cambia su tamaño o el de la ventana (ResizeObserver), nunca en cada fotograma.

const MIN_THUMB = 28
const EDGE = 2
const HIDE_AFTER = 900

/**
 * Engancha la barra a `scroller` y devuelve la función que la retira. Se usa como ref de React 19
 * (`ref={overlayScrollbarRef}`) o desde un efecto con un ref de objeto. `side: 'left'` la dibuja en el borde izquierdo.
 */
export function attachOverlayScrollbar(scroller, { inset = 2, side = 'right' } = {}) {
  if (!scroller || typeof document === 'undefined') return () => {}
  const thumb = document.createElement('div')
  thumb.className = 'overlay-scrollbar'
  thumb.setAttribute('aria-hidden', 'true')
  document.body.append(thumb)

  let rect = null
  let frame = 0
  let hideTimer = 0
  let hovering = false
  let drag = null
  let metrics = { top: 0, height: 0, visible: false }

  const read = () => {
    const { clientHeight, scrollHeight, scrollTop } = scroller
    if (!rect || rect.height < 1 || scrollHeight - clientHeight < 2) {
      metrics = { top: 0, height: 0, visible: false }
      return
    }
    const track = rect.height - EDGE * 2
    const height = Math.max(MIN_THUMB, Math.round(track * (clientHeight / scrollHeight)))
    const top = Math.round((scrollTop / (scrollHeight - clientHeight)) * (track - height))
    metrics = { top, height, visible: true }
  }

  const paint = () => {
    frame = 0
    if (!metrics.visible || !rect) {
      thumb.style.display = 'none'
      return
    }
    thumb.style.display = ''
    // 6 px de ancho; `inset` es la separación con el borde (0 = pegada al borde) y `side` el lado: derecho o izquierdo.
    thumb.style.left = `${side === 'left' ? rect.left + inset : rect.right - 6 - inset}px`
    thumb.style.top = `${rect.top + EDGE}px`
    thumb.style.height = `${metrics.height}px`
    thumb.style.transform = `translateY(${metrics.top}px)`
  }

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(paint)
  }

  // ¿Hay algo tapando la lista donde iría la barra? La barra se dibuja por encima de todo (z-index 130), así que sin
  // esta comprobación aparecía sobre los paneles y diálogos abiertos encima del contenido (p. ej. "Editar inicio").
  // Cubierta = lo que hay en ese punto no es de la lista, o es un panel fijo aunque en el DOM cuelgue de ella.
  // Es una consulta de posición (elementsFromPoint): solo se hace al entrar, al empezar a desplazarse y al cambiar el
  // elemento bajo el puntero, nunca en cada fotograma.
  let covered = false
  const checkCovered = () => {
    covered = false
    if (!rect || !metrics.visible) return
    const x = side === 'left' ? rect.left + 8 : rect.right - 8
    const y = rect.top + EDGE + metrics.top + metrics.height / 2
    const top = document.elementsFromPoint(x, y).find((element) => !element.classList.contains('overlay-scrollbar'))
    if (!top || top === scroller) return
    if (!scroller.contains(top)) { covered = true; return }
    for (let element = top; element && element !== scroller; element = element.parentElement) {
      if (getComputedStyle(element).position === 'fixed') { covered = true; return }
    }
  }

  const hide = () => thumb.classList.remove('overlay-scrollbar--visible')

  const show = () => {
    clearTimeout(hideTimer)
    if (covered && !drag) { hide(); return }
    thumb.classList.add('overlay-scrollbar--visible')
    hideTimer = setTimeout(() => {
      if (!hovering && !drag) hide()
    }, HIDE_AFTER)
  }

  const measure = () => {
    const box = scroller.getBoundingClientRect()
    rect = { height: box.height, left: box.left, right: box.right, top: box.top }
    read()
    checkCovered()
    schedule()
  }

  const onScroll = () => {
    // Al empezar a desplazarse (barra aún oculta) se mide de nuevo: el panel pudo moverse sin cambiar de tamaño (p. ej.
    // la animación de entrada del reproductor). Una sola lectura por gesto, no una por fotograma.
    if (thumb.classList.contains('overlay-scrollbar--visible')) read()
    else measure()
    schedule()
    show()
  }
  const onEnter = () => {
    hovering = true
    // El contenido puede haber crecido sin cambiar el tamaño del contenedor (filas nuevas) o el elemento puede haberse
    // movido sin cambiar de tamaño (el panel deslizante del móvil): se vuelve a medir al entrar.
    measure()
    show()
  }
  // Una lista dentro de otro panel con scroll (la cola dentro del reproductor) se mueve sin cambiar de tamaño cuando
  // ese panel se desplaza: entonces se recoloca, pero solo si su barra está a la vista.
  const onAncestorScroll = (event) => {
    if (event.target === scroller || !thumb.classList.contains('overlay-scrollbar--visible')) return
    if (event.target instanceof Node && event.target.contains(scroller)) measure()
  }
  const onLeave = () => {
    hovering = false
    show()
  }
  // Con la barra a la vista, un panel puede abrirse encima sin que el puntero salga de la lista (el panel cuelga de
  // ella en el DOM): al cambiar el elemento bajo el puntero se vuelve a comprobar y, si quedó tapada, se oculta.
  let overFrame = 0
  const onOver = () => {
    if (overFrame || drag || !thumb.classList.contains('overlay-scrollbar--visible')) return
    overFrame = requestAnimationFrame(() => {
      overFrame = 0
      checkCovered()
      if (covered) hide()
    })
  }

  const onThumbDown = (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    thumb.setPointerCapture(event.pointerId)
    drag = { y: event.clientY, scrollTop: scroller.scrollTop }
    thumb.classList.add('overlay-scrollbar--dragging')
  }
  const onThumbMove = (event) => {
    if (!drag || !rect) return
    const track = rect.height - EDGE * 2 - metrics.height
    if (track <= 0) return
    const ratio = (scroller.scrollHeight - scroller.clientHeight) / track
    scroller.scrollTo({ top: drag.scrollTop + (event.clientY - drag.y) * ratio, behavior: 'instant' })
  }
  const onThumbUp = () => {
    drag = null
    thumb.classList.remove('overlay-scrollbar--dragging')
    show()
  }

  scroller.addEventListener('scroll', onScroll, { passive: true })
  scroller.addEventListener('pointerenter', onEnter)
  scroller.addEventListener('pointerleave', onLeave)
  scroller.addEventListener('pointerover', onOver, { passive: true })
  thumb.addEventListener('pointerenter', onEnter)
  thumb.addEventListener('pointerleave', onLeave)
  thumb.addEventListener('pointerdown', onThumbDown)
  thumb.addEventListener('pointermove', onThumbMove)
  thumb.addEventListener('pointerup', onThumbUp)
  thumb.addEventListener('pointercancel', onThumbUp)
  window.addEventListener('resize', measure)
  document.addEventListener('scroll', onAncestorScroll, { capture: true, passive: true })

  let observer = null
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(measure)
    observer.observe(scroller)
  } else {
    measure()
  }

  return () => {
    scroller.removeEventListener('scroll', onScroll)
    scroller.removeEventListener('pointerenter', onEnter)
    scroller.removeEventListener('pointerleave', onLeave)
    scroller.removeEventListener('pointerover', onOver)
    if (overFrame) cancelAnimationFrame(overFrame)
    window.removeEventListener('resize', measure)
    document.removeEventListener('scroll', onAncestorScroll, { capture: true })
    observer?.disconnect()
    clearTimeout(hideTimer)
    if (frame) cancelAnimationFrame(frame)
    thumb.remove()
  }
}

/** Ref de React 19 con limpieza: `<div ref={overlayScrollbarRef}>`. */
export const overlayScrollbarRef = (node) => attachOverlayScrollbar(node)

/**
 * Igual, con opciones. Créala una vez a nivel de módulo (no en el render) para que la ref sea estable. Un `inset`
 * negativo saca la barra al margen que hay a la derecha de la lista, para que no tape lo que hay en el borde de cada
 * fila (los "⋮" de la cola).
 */
export const createOverlayScrollbarRef = (options) => (node) => attachOverlayScrollbar(node, options)
