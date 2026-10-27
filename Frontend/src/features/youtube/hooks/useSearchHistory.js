// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/hooks/useSearchHistory.js
// Historial de búsquedas recientes guardado en el navegador.
import { useCallback, useState } from 'react';
import { readStorage, writeStorage } from '../lib/storage.js';

const HISTORY_KEY = 'searchHistory';
const HISTORY_MAX = 10;

function readHistory() {
  const saved = readStorage(HISTORY_KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved.filter((item) => typeof item === 'string' && item.trim()).slice(0, HISTORY_MAX);
}

export function useSearchHistory() {
  const [history, setHistory] = useState(readHistory);

  const add = useCallback((text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setHistory((prev) => {
      const next = [trimmed, ...prev.filter((item) => item.toLocaleLowerCase() !== trimmed.toLocaleLowerCase())].slice(0, HISTORY_MAX);
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
