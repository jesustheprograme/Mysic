// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/lib/scroll.js
// Sube al principio de la vista. Funciona tanto en la app independiente (scroll
// de la ventana) como dentro de otra app cuyo contenido tenga su propio
// contenedor con scroll (p. ej. `.music-app__content` en Mysic).
export function scrollAppToTop() {
  window.scrollTo({ top: 0 });
  let node = document.querySelector('.yt-app')?.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      node.scrollTo({ top: 0 });
      return;
    }
    node = node.parentElement;
  }
}
