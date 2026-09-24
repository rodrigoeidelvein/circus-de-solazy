import type { VenueConfig } from '../types/venue'

export const MAX_SEATS_PER_BOOKING = 8

export const venueConfig: VenueConfig = {
  ringRadius: 92,
  firstRowRadius: 130,
  rowSpacing: 26,
  seatRadius: 7.5,
  entrance: { centerDeg: 180, widthDeg: 40 },
  aisleWidthDeg: 10,
  sections: [
    { id: 'A', name: 'Section A' },
    { id: 'B', name: 'Section B' },
    { id: 'C', name: 'Section C' },
    { id: 'D', name: 'Section D' },
  ],
  seatsPerRow: [8, 9, 10, 11, 12, 13, 14, 15],
  tiers: [
    { id: 'ringside', name: 'Ringside', price: 85, fromRow: 1, toRow: 2 },
    { id: 'standard', name: 'Standard', price: 45, fromRow: 3, toRow: 5 },
    { id: 'gallery', name: 'Gallery', price: 25, fromRow: 6, toRow: 8 },
  ],
}
