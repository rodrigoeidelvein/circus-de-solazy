/** Display status of a seat. `selected` only exists client-side, while booking. */
export type SeatStatus = 'available' | 'reserved' | 'selected'

/** Status as known by the venue inventory (before the current user's selection). */
export type InventoryStatus = Exclude<SeatStatus, 'selected'>

export type TierId = string
export type SectionId = string
/** Stable seat identifier, e.g. `B-3-12` (section-row-seat). */
export type SeatId = string

export interface PriceTier {
  id: TierId
  name: string
  /** Price in whole US dollars. */
  price: number
  /** First row (inclusive, 1-based) this tier applies to. */
  fromRow: number
  /** Last row (inclusive, 1-based) this tier applies to. */
  toRow: number
}

export interface Seat {
  id: SeatId
  sectionId: SectionId
  /** Row number, 1 = closest to the ring. */
  row: number
  /** Seat number within its row, counted clockwise from 1. */
  number: number
  tierId: TierId
  price: number
  /** Degrees clockwise from the top of the map (12 o'clock). May exceed 360. */
  angleDeg: number
  radius: number
  x: number
  y: number
  status: InventoryStatus
}

export interface Row {
  number: number
  radius: number
  tierId: TierId
  seats: Seat[]
}

export interface Section {
  id: SectionId
  name: string
  startDeg: number
  endDeg: number
  rows: Row[]
}

export interface Venue {
  sections: Section[]
  /** All seats, flattened in section → row → seat order. */
  seats: Seat[]
  seatsById: ReadonlyMap<SeatId, Seat>
  tiers: PriceTier[]
  ringRadius: number
  seatRadius: number
  /** Radius of the innermost edge of the seating area. */
  innerRadius: number
  /** Radius of the outermost edge of the seating area. */
  outerRadius: number
  entrance: { startDeg: number; endDeg: number; centerDeg: number }
}

export interface VenueConfig {
  ringRadius: number
  /** Radius of row 1. */
  firstRowRadius: number
  /** Radial distance between consecutive rows. */
  rowSpacing: number
  seatRadius: number
  /** Performers' entrance: the one wide gap in the seating. */
  entrance: { centerDeg: number; widthDeg: number }
  /** Angular width of the aisles between neighbouring sections. */
  aisleWidthDeg: number
  /** Sections in clockwise order, starting right after the entrance. */
  sections: { id: SectionId; name: string }[]
  /** Seats in each row of every section; index 0 is row 1. Length defines the row count. */
  seatsPerRow: number[]
  tiers: PriceTier[]
}
