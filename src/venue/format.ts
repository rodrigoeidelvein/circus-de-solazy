import type { PriceTier, Seat, SeatStatus } from '../types/venue'

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export function formatPrice(amount: number): string {
  return usd.format(amount)
}

export function seatAccessibleLabel(seat: Seat, tier: PriceTier, status: SeatStatus): string {
  return `Section ${seat.sectionId}, Row ${seat.row}, Seat ${seat.number}, ${tier.name}, ${formatPrice(seat.price)}, ${status}`
}

/** Short, readable booking reference derived from the booking id. */
export function bookingReference(bookingId: string): string {
  return bookingId.replaceAll('-', '').slice(0, 8).toUpperCase()
}
