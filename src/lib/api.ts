import { FunctionsHttpError } from '@supabase/supabase-js'
import type { ServerStatus } from '../state/booking'
import type { SeatId } from '../types/venue'
import { supabase } from './supabase'

/** An Edge Function answered with an error status; `code` is its `error` field. */
export class ApiError extends Error {
  readonly status: number | null
  readonly code: string
  readonly body: Record<string, unknown>

  constructor(status: number | null, code: string, body: Record<string, unknown> = {}) {
    super(code)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.body = body
  }
}

async function call<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })
  if (!error) return data as T
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response
    const payload = await response.json().catch(() => ({}))
    throw new ApiError(response.status, typeof payload.error === 'string' ? payload.error : 'http_error', payload)
  }
  throw new ApiError(null, 'network_error')
}

export interface BookingRef {
  bookingId: string
  secret: string
}

export interface CreatedBooking extends BookingRef {
  checkoutId: string
  authToken: string
  amountCents: number
  expiresAt: string
}

export interface BookingStatusResponse {
  status: ServerStatus
  seatIds: SeatId[]
  amountCents: number
  expiresAt: string
  paidAt: string | null
  /** Only for `resume: true` on a pending booking. */
  checkoutId?: string
  authToken?: string
}

export const api = {
  createBooking: (seatIds: SeatId[], email: string) => call<CreatedBooking>('create-booking', { seatIds, email }),
  verifyBooking: (ref: BookingRef) => call<{ ok: true; expiresAt: string }>('verify-booking', { ...ref }),
  bookingStatus: (ref: BookingRef, resume = false) => call<BookingStatusResponse>('booking-status', { ...ref, resume }),
  cancelBooking: (ref: BookingRef) => call<{ status: ServerStatus }>('cancel-booking', { ...ref }),
}
