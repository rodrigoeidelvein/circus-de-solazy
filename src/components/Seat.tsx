import { memo, type KeyboardEvent } from 'react'
import type { PriceTier, Seat as SeatModel, SeatId, SeatStatus } from '../types/venue'
import { seatAccessibleLabel } from '../venue/format'
import { SeatGlyph } from './SeatGlyph'

interface SeatProps {
  seat: SeatModel
  tier: PriceTier
  status: SeatStatus
  radius: number
  onToggle: (seat: SeatModel) => void
  onHover: (seatId: SeatId | null) => void
  onFocusChange: (seatId: SeatId | null) => void
}

export const Seat = memo(function Seat({
  seat,
  tier,
  status,
  radius,
  onToggle,
  onHover,
  onFocusChange,
}: SeatProps) {
  const reserved = status === 'reserved'

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onToggle(seat)
    }
  }

  return (
    <g
      className={`seat seat--${status} tier-${tier.id}`}
      transform={`translate(${seat.x.toFixed(2)} ${seat.y.toFixed(2)})`}
      role="checkbox"
      tabIndex={0}
      aria-checked={status === 'selected'}
      aria-disabled={reserved || undefined}
      aria-label={seatAccessibleLabel(seat, tier, status)}
      onClick={() => onToggle(seat)}
      onKeyDown={handleKeyDown}
      onPointerEnter={() => onHover(seat.id)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onFocusChange(seat.id)}
      onBlur={() => onFocusChange(null)}
    >
      <circle className="seat-focus" r={radius + 3.5} />
      <g className="seat-glyph">
        <SeatGlyph status={status} radius={radius} />
      </g>
    </g>
  )
})
