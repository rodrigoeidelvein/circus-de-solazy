import type { InventoryStatus, Seat, SeatId, Venue } from '../types/venue'
import { generateVenue } from './generateVenue'
import { venueConfig } from './venueConfig'

/** The venue layout, with every seat available. Live status comes from `withAvailability`. */
export const venue = generateVenue(venueConfig)

/**
 * The venue with the given seats marked reserved. Seats whose status didn't
 * change keep their object identity, so memoised seat components don't re-render.
 */
export function withAvailability(base: Venue, unavailable: ReadonlySet<SeatId>): Venue {
  const seats: Seat[] = []
  const sections = base.sections.map((section) => ({
    ...section,
    rows: section.rows.map((row) => {
      const rowSeats = row.seats.map((seat) => {
        const status: InventoryStatus = unavailable.has(seat.id) ? 'reserved' : 'available'
        return status === seat.status ? seat : { ...seat, status }
      })
      seats.push(...rowSeats)
      return { ...row, seats: rowSeats }
    }),
  }))
  return { ...base, sections, seats, seatsById: new Map(seats.map((s) => [s.id, s])) }
}
