import type { InventoryStatus, PriceTier, Row, Seat, SeatId, Section, Venue, VenueConfig } from '../types/venue'
import { polarToCartesian } from './geometry'

export interface GenerateVenueOptions {
  /** Decides which seats are already reserved. Defaults to none. */
  isReserved?: (seatId: SeatId) => boolean
}

export function seatId(sectionId: string, row: number, seat: number): SeatId {
  return `${sectionId}-${row}-${seat}`
}

export function tierForRow(tiers: PriceTier[], row: number): PriceTier {
  const tier = tiers.find((t) => row >= t.fromRow && row <= t.toRow)
  if (!tier) throw new Error(`No price tier covers row ${row}`)
  return tier
}

/**
 * Builds the full venue (sections, rows, positioned seats) from a config.
 * Pure: the same config and options always produce the same venue.
 */
export function generateVenue(config: VenueConfig, options: GenerateVenueOptions = {}): Venue {
  const { isReserved = () => false } = options
  const sectionCount = config.sections.length
  const rowCount = config.seatsPerRow.length

  if (sectionCount === 0) throw new Error('Venue needs at least one section')
  if (rowCount === 0) throw new Error('Venue needs at least one row')
  if (config.seatsPerRow.some((n) => !Number.isInteger(n) || n < 1)) {
    throw new Error('seatsPerRow must contain positive integers')
  }

  const aisleTotal = config.aisleWidthDeg * (sectionCount - 1)
  const sectionSpan = (360 - config.entrance.widthDeg - aisleTotal) / sectionCount
  if (sectionSpan <= 0) throw new Error('Entrance and aisles leave no room for seats')

  // Resolve tiers up front so a gap in the tier rules fails fast.
  const rowTiers = config.seatsPerRow.map((_, i) => tierForRow(config.tiers, i + 1))

  const firstSectionStart = config.entrance.centerDeg + config.entrance.widthDeg / 2
  const seats: Seat[] = []

  const sections: Section[] = config.sections.map((def, sectionIndex) => {
    const startDeg = firstSectionStart + sectionIndex * (sectionSpan + config.aisleWidthDeg)
    const endDeg = startDeg + sectionSpan

    const rows: Row[] = config.seatsPerRow.map((seatCount, rowIndex) => {
      const rowNumber = rowIndex + 1
      const radius = config.firstRowRadius + rowIndex * config.rowSpacing
      const tier = rowTiers[rowIndex]
      const step = sectionSpan / seatCount

      const rowSeats = Array.from({ length: seatCount }, (_, seatIndex): Seat => {
        const number = seatIndex + 1
        const id = seatId(def.id, rowNumber, number)
        const angleDeg = startDeg + (seatIndex + 0.5) * step
        const { x, y } = polarToCartesian(radius, angleDeg)
        const status: InventoryStatus = isReserved(id) ? 'reserved' : 'available'
        return {
          id,
          sectionId: def.id,
          row: rowNumber,
          number,
          tierId: tier.id,
          price: tier.price,
          angleDeg,
          radius,
          x,
          y,
          status,
        }
      })
      seats.push(...rowSeats)
      return { number: rowNumber, radius, tierId: tier.id, seats: rowSeats }
    })

    return { id: def.id, name: def.name, startDeg, endDeg, rows }
  })

  const lastRowRadius = config.firstRowRadius + (rowCount - 1) * config.rowSpacing
  const { centerDeg, widthDeg } = config.entrance

  return {
    sections,
    seats,
    seatsById: new Map(seats.map((s) => [s.id, s])),
    tiers: config.tiers,
    ringRadius: config.ringRadius,
    seatRadius: config.seatRadius,
    innerRadius: config.firstRowRadius - config.rowSpacing / 2,
    outerRadius: lastRowRadius + config.rowSpacing / 2,
    entrance: { centerDeg, startDeg: centerDeg - widthDeg / 2, endDeg: centerDeg + widthDeg / 2 },
  }
}
