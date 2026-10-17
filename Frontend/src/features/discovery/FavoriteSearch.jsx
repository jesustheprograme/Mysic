import { Search } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

function FavoriteSearch({ label, onChange, value }) {
  const [open, setOpen] = useState(false)
  const inputId = useId()
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  return (
    <div className={`favorites-search${open ? ' favorites-search--open' : ''}`}>
      <button
        className="favorites-search__toggle"
        type="button"
        aria-controls={inputId}
        aria-expanded={open}
        aria-label={open ? `Ocultar ${label.toLocaleLowerCase()}` : label}
        title={label}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <Search size={19} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <label className="favorites-search__field" htmlFor={inputId}>
        <Search size={17} strokeWidth={1.8} aria-hidden="true" />
        <input
          id={inputId}
          ref={inputRef}
          type="search"
          aria-label={label}
          placeholder={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false)
          }}
        />
      </label>
    </div>
  )
}

export default FavoriteSearch
