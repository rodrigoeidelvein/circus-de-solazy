import { useCallback, useMemo, useState } from 'react'
import type { PriceTier, Seat as SeatModel, SeatId, SeatStatus, Venue } from '../types/venue'
import { annularSectorPath, polarToCartesian } from '../venue/geometry'
import { Seat } from './Seat'
import { SeatTooltip } from './SeatTooltip'
import './SeatMap.css'

interface SeatMapProps {
  venue: Venue
  isSelected: (seatId: SeatId) => boolean
  onToggle: (seat: SeatModel) => void
}

const LABEL_GAP = 20
const MARGIN = 52

export function SeatMap({ venue, isSelected, onToggle }: SeatMapProps) {
  const [hoveredId, setHoveredId] = useState<SeatId | null>(null)
  const [focusedId, setFocusedId] = useState<SeatId | null>(null)

  const tiersById = useMemo(() => new Map<string, PriceTier>(venue.tiers.map((t) => [t.id, t])), [venue.tiers])
  const statusOf = useCallback(
    (seat: SeatModel): SeatStatus => (seat.status === 'reserved' ? 'reserved' : isSelected(seat.id) ? 'selected' : 'available'),
    [isSelected],
  )

  const extent = venue.outerRadius + MARGIN
  const size = extent * 2
  const toPct = (v: number) => ((v + extent) / size) * 100

  const activeId = hoveredId ?? focusedId
  const activeSeat = activeId ? venue.seatsById.get(activeId) : undefined

  const entranceLabel = polarToCartesian((venue.innerRadius + venue.outerRadius) / 2, venue.entrance.centerDeg)

  return (
    <div className="seat-map">
      <svg
        className="seat-map-svg"
        viewBox={`${-extent} ${-extent} ${size} ${size}`}
        aria-labelledby="seat-map-title"
      >
        <title id="seat-map-title">Seat map</title>

        <g aria-hidden="true">
          {venue.sections.map((section) => {
            const mid = (section.startDeg + section.endDeg) / 2
            const label = polarToCartesian(venue.outerRadius + LABEL_GAP, mid)
            // Anchor labels away from the seats so side sections don't overlap them.
            const anchor = label.x < -40 ? 'end' : label.x > 40 ? 'start' : 'middle'
            return (
              <g key={section.id}>
                <path
                  className="section-bg"
                  d={annularSectorPath(venue.innerRadius, venue.outerRadius, section.startDeg - 1, section.endDeg + 1)}
                />
                <text className="section-label" x={label.x} y={label.y} textAnchor={anchor}>
                  {section.name}
                </text>
              </g>
            )
          })}

          <circle className="ring" r={venue.ringRadius} />
          <circle className="ring-inner" r={venue.ringRadius - 12} />
          <text className="ring-label" x={0} y={0}>
            Ring
          </text>

          <text className="entrance-label" x={entranceLabel.x} y={entranceLabel.y}>
            <tspan x={entranceLabel.x} dy="-0.5em">
              Performers’
            </tspan>
            <tspan x={entranceLabel.x} dy="1.2em">
              entrance
            </tspan>
          </text>
        </g>

        {venue.sections.map((section) => (
          <g key={section.id} role="group" aria-label={section.name}>
            {section.rows.flatMap((row) =>
              row.seats.map((seat) => (
                <Seat
                  key={seat.id}
                  seat={seat}
                  tier={tiersById.get(seat.tierId)!}
                  status={statusOf(seat)}
                  radius={venue.seatRadius}
                  onToggle={onToggle}
                  onHover={setHoveredId}
                  onFocusChange={setFocusedId}
                />
              )),
            )}
          </g>
        ))}
      </svg>

      {activeSeat && (
        <SeatTooltip
          seat={activeSeat}
          tier={tiersById.get(activeSeat.tierId)!}
          status={statusOf(activeSeat)}
          leftPct={toPct(activeSeat.x)}
          topPct={toPct(activeSeat.y)}
        />
      )}
    </div>
  )
}
