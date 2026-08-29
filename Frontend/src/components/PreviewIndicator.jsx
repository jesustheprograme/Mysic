import { Pause, Play } from 'lucide-react'
import Spinner from './Spinner.jsx'

function PreviewIndicator({ status }) {
  if (status === 'loading') return <Spinner />

  if (status === 'playing') {
    return (
      <span className="preview-indicator preview-indicator--playing" aria-label="Reproduciendo">
        <span className="preview-indicator__wave">
          <span className="loading-wave" aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => (
              <span className="loading-bar" key={index} />
            ))}
          </span>
        </span>
        <Pause className="preview-indicator__pause" size={17} fill="currentColor" aria-hidden="true" />
      </span>
    )
  }

  return <Play size={17} fill="currentColor" />
}

export default PreviewIndicator
