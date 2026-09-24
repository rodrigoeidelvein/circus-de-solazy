import type { PriceTier, Seat, SeatStatus } from '../types/venue'
import { formatPrice } from '../venue/format'

interface SeatTooltipProps {
  seat: Seat
  tier: PriceTier
  status: SeatStatus
  /** Position within the map, as percentages of its width/height. */
  leftPct: number
  topPct: number
}

const statusText: Record<SeatStatus, string> = {
  available: 'Available',
  selected: 'Selected',
  reserved: 'Reserved',
}

export function SeatTooltip({ seat, tier, status, leftPct, topPct }: SeatTooltipProps) {
  // Flip below the seat near the top edge so the tooltip isn't clipped.
  const placement = topPct < 22 ? 'below' : 'above'
  return (
    <div
      className={`seat-tooltip seat-tooltip--${placement}`}
      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
      aria-hidden="true"
    >
      <strong>
        Section {seat.sectionId} · Row {seat.row} · Seat {seat.number}
      </strong>
      <span>
        {tier.name} · {formatPrice(seat.price)}
      </span>
      <span className={`seat-tooltip-status seat-tooltip-status--${status}`}>{statusText[status]}</span>
    </div>
  )
}
