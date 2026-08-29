import { ArrowRight, Sparkles } from 'lucide-react'

function HomeDiscoveryPrompt({ disabled = false, loading = false, onDiscover }) {
  return (
    <section className="home-discovery-prompt" aria-labelledby="home-discovery-title">
      <h1 id="home-discovery-title">
        ¿Sin saber por dónde empezar? <span>Descubre algo nuevo.</span>
      </h1>

      <button
        className="home-discovery-prompt__option"
        disabled={disabled || loading}
        onClick={onDiscover}
        type="button"
      >
        <span className="home-discovery-prompt__visual" aria-hidden="true">
          <Sparkles size={18} strokeWidth={1.8} />
        </span>
        <span className="home-discovery-prompt__meta">
          <strong>{loading ? 'Preparando descubrimiento' : 'Descubrimiento semanal'}</strong>
          <small>{loading ? 'Eligiendo canciones para ti' : 'Una selección renovada para ti'}</small>
        </span>
        <ArrowRight aria-hidden="true" size={17} strokeWidth={1.8} />
      </button>
    </section>
  )
}

export default HomeDiscoveryPrompt
