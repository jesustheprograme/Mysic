import { Volume2, VolumeX } from 'lucide-react'
import { useState } from 'react'

type MiniVolumeControlProps = {
  onVolumeChange: (volume: number) => void
  onVolumeInteractionChange: (active: boolean) => void
  volume: number
}

export default function ControlVolumenMini({ onVolumeChange, onVolumeInteractionChange, volume }: MiniVolumeControlProps) {
  const [open, setOpen] = useState(false)
  const VolumeIcon = volume === 0 ? VolumeX : Volume2

  return (
    <div
      className={`mini-player__volume-popover${open ? ' mini-player__volume-popover--open' : ''}`}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null
        if (!nextTarget || !event.currentTarget.contains(nextTarget)) setOpen(false)
      }}
    >
      <label className="mini-player__volume-slider-shell" title={`Volumen ${volume}%`}>
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          tabIndex={open ? 0 : -1}
          aria-label="Volumen"
          onPointerDown={() => onVolumeInteractionChange(true)}
          onPointerUp={() => onVolumeInteractionChange(false)}
          onPointerCancel={() => onVolumeInteractionChange(false)}
          onBlur={() => onVolumeInteractionChange(false)}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
          style={{ background: `linear-gradient(90deg, #f4f3ef 0%, #f4f3ef ${volume}%, #313735 ${volume}%, #313735 100%)` }}
        />
      </label>
      <button
        className="mini-player__icon-button"
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Contraer control de volumen' : 'Mostrar control de volumen'}
        title={`Volumen ${volume}%`}
        onClick={() => setOpen(true)}
      >
        <VolumeIcon size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
