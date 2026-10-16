// Sube al principio del espacio de trabajo actual de Mysic.
export function scrollAppToTop() {
  window.scrollTo({ top: 0 });
  let node = document.querySelector('.music-workspace');
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      node.scrollTo({ top: 0 });
      return;
    }
    node = node.parentElement;
  }
}
