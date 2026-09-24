import type { BookingRef } from './api'

// sessionStorage, so a refresh mid-payment resumes but a new tab starts fresh.
const KEY = 'circus-du-solazy:booking'

export function saveBookingRef(ref: BookingRef): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ bookingId: ref.bookingId, secret: ref.secret }))
  } catch {
    // Storage unavailable (private mode): the booking just won't survive a refresh.
  }
}

export function loadBookingRef(): BookingRef | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
    return typeof value?.bookingId === 'string' && typeof value?.secret === 'string' ? value : null
  } catch {
    return null
  }
}

export function clearBookingRef(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
