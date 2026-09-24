import type { PriceTier, SeatStatus } from '../types/venue'
import { formatPrice } from '../venue/format'
import { SeatGlyph } from './SeatGlyph'
import './Legend.css'

interface LegendProps {
  tiers: PriceTier[]
}

const statuses: { status: SeatStatus; label: string }[] = [
  { status: 'available', label: 'Available' },
  { status: 'selected', label: 'Selected' },
  { status: 'reserved', label: 'Reserved' },
]

const GLYPH_R = 7

function Swatch({ status, className }: { status: SeatStatus; className: string }) {
  return (
    <svg className="legend-swatch" viewBox="-10 -10 20 20" aria-hidden="true">
      <g className={`seat seat--${status} ${className}`}>
        <SeatGlyph status={status} radius={GLYPH_R} />
      </g>
    </svg>
  )
}

export function Legend({ tiers }: LegendProps) {
  return (
    <section className="legend panel" aria-labelledby="legend-title">
      <h2 id="legend-title">Legend</h2>
      <div className="legend-groups">
        <ul className="legend-list">
          {statuses.map(({ status, label }) => (
            <li key={status}>
              <Swatch status={status} className="tier-neutral" />
              {label}
            </li>
          ))}
        </ul>
        <ul className="legend-list">
          {tiers.map((tier) => (
            <li key={tier.id}>
              <Swatch status="available" className={`tier-${tier.id}`} />
              <span>
                {tier.name} <span className="legend-meta">rows {tier.fromRow}–{tier.toRow}</span>
              </span>
              <span className="legend-price">{formatPrice(tier.price)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
