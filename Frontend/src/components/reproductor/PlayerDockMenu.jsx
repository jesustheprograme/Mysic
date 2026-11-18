import { Maximize2, MoreHorizontal, X } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import '../../features/youtube/item-menus.css'

/**
 * Menú de tres puntos de la cabecera del reproductor ("Reproduciendo ahora"): reúne las acciones que antes eran dos
 * botones sueltos (ampliar a pantalla completa y cerrar). `onExpand` es opcional (el reproductor local no la tiene).
 */
export default function PlayerDockMenu({ onClose, onExpand }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="player-dock__close player-dock__menu" type="button" aria-label="Opciones del reproductor" title="Opciones">
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="ym-menu" collisionPadding={8} sideOffset={4}>
        {onExpand && (
          <DropdownMenuItem className="ym-item" onSelect={onExpand}>
            <Maximize2 size={17} strokeWidth={1.8} aria-hidden="true" />
            <span>Pantalla completa</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="ym-item" onSelect={onClose}>
          <X size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>Cerrar reproductor</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
