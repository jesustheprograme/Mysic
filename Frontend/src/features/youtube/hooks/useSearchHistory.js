// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/hooks/useSearchHistory.js
// Historial de búsquedas recientes guardado en el navegador.
import { useCallback, useState } from 'react';
import { readStorage, writeStorage } from '../lib/storage.js';

const HISTORY_KEY = 'searchHistory';
const HISTORY_MAX = 10;

export function useSearchHistory() {
  const [history, setHistory] = useState(() => readStorage(HISTORY_KEY, []));

  const add = useCallback((text) => {
    setHistory((prev) => {
      const next = [text, ...prev.filter((h) => h.toLowerCase() !== text.toLowerCase())].slice(0, HISTORY_MAX);
      writeStorage(HISTORY_KEY, next);
      return next;
    });
  }, []);

  const remove = useCallback((text) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h !== text);
      writeStorage(HISTORY_KEY, next);
      return next;
    });
  }, []);

  return { history, add, remove };
}
