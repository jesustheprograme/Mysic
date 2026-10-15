// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// frontend/src/components/SearchBox.jsx
// Buscador con desplegable: historial reciente (borrable), autocompletado
// y entidades directas (artistas, canciones, álbumes). Navegable con teclado.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { Cover } from './Cover.jsx';
import { CloseIcon, HistoryIcon, SearchIcon, TrashIcon } from './icons.jsx';

const SUGGEST_DELAY_MS = 180;
const HISTORY_SHOWN = 5;

export function SearchBox({ value, onChange, onSubmit, onPickEntity, history, onRemoveHistory, loading }) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState({ texts: [], entities: [] });
  const [active, setActive] = useState(-1);
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  // Historial que encaja con lo escrito (o todo el historial si está vacío)
  const historyItems = history
    .filter((h) => !lower || h.toLowerCase().includes(lower))
    .slice(0, HISTORY_SHOWN)
    .map((text) => ({ kind: 'history', text }));
  const textItems = trimmed
    ? suggestions.texts
        .filter((t) => !historyItems.some((h) => h.text.toLowerCase() === t.toLowerCase()))
        .map((text) => ({ kind: 'text', text }))
    : [];
  const entityItems = trimmed ? suggestions.entities.map((e) => ({ ...e, kind: 'entity', entity: e })) : [];
  const items = [...historyItems, ...textItems, ...entityItems];

  // Pedir sugerencias con un pequeño retraso tras cada pulsación, cancelando la anterior
  useEffect(() => {
    if (!trimmed) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .suggest(trimmed, controller.signal)
        .then((data) => {
          setSuggestions({ texts: data.texts || [], entities: data.entities || [] });
          setActive(-1);
        })
        .catch((err) => {
          if (err.name !== 'AbortError') setSuggestions({ texts: [], entities: [] });
        });
    }, SUGGEST_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const pick = (item) => {
    close();
    if (item.kind === 'entity') {
      onPickEntity(item.entity);
    } else {
      onChange(item.text);
      onSubmit(item.text);
    }
  };

  const submit = () => {
    if (!trimmed) return;
    close();
    onSubmit(trimmed);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (items.length ? (i + 1) % items.length : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && active >= 0 && items[active]) pick(items[active]);
      else submit();
    } else if (e.key === 'Escape') {
      close();
    }
  };

  const showDropdown = open && items.length > 0;

  return (
    <div className="searchbox" ref={boxRef}>
      <div className={`search${showDropdown ? ' search--open' : ''}`}>
        <span className="search-icon">
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Buscar canciones, artistas, álbumes..."
          aria-label="Buscar en YouTube Music"
          className="search-input"
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          aria-controls="search-suggestions"
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            className="search-clear"
            aria-label="Borrar"
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
          >
            <CloseIcon />
          </button>
        )}
        <button type="button" onClick={submit} disabled={loading || !trimmed} className="search-button">
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {showDropdown && (
        <ul className="suggestions" id="search-suggestions" role="listbox">
          {items.map((item, index) => {
            const isActive = index === active;
            const cls = `suggestion suggestion--${item.kind}${isActive ? ' suggestion--active' : ''}`;
            const common = {
              className: cls,
              role: 'option',
              'aria-selected': isActive,
              onMouseEnter: () => setActive(index),
              onMouseDown: (ev) => ev.preventDefault(),
              onClick: () => pick(item),
            };
            if (item.kind === 'entity') {
              const e = item.entity;
              return (
                <li key={`e-${e.kind}-${e.id}`} {...common}>
                  <Cover className="suggestion-thumb" round={e.kind === 'artist'} src={e.thumbnail} />
                  <div className="suggestion-body">
                    <div className="suggestion-title">{e.title}</div>
                    <div className="suggestion-sub">{e.subtitle}</div>
                  </div>
                </li>
              );
            }
            return (
              <li key={`${item.kind}-${item.text}`} {...common}>
                <span className="suggestion-icon">{item.kind === 'history' ? <HistoryIcon /> : <SearchIcon />}</span>
                <span className="suggestion-text">
                  <Highlight text={item.text} query={trimmed} />
                </span>
                {item.kind === 'history' && (
                  <button
                    type="button"
                    className="suggestion-remove"
                    aria-label={`Quitar "${item.text}" del historial`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onRemoveHistory(item.text);
                    }}
                  >
                    <TrashIcon />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Resalta en negrita la parte escrita, como hace YouTube Music
function Highlight({ text, query }) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <b>{text.slice(idx, idx + query.length)}</b>
      {text.slice(idx + query.length)}
    </>
  );
}
