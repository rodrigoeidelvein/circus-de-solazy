import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { HttpError } from './cors.ts'

/** Supabase client with the secret key: bypasses RLS and may call the booking RPCs. */
export const db: SupabaseClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

export type BookingStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'refunded'

export interface Booking {
  id: string
  status: BookingStatus
  email: string
  seat_ids: string[]
  amount_cents: number
  checkout_id: string | null
  payment_id: string | null
  flag: string | null
  expires_at: string
  paid_at: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Loads a booking for its buyer: both the id and the secret must match. */
export async function findBooking(body: Record<string, unknown>): Promise<Booking> {
  const { bookingId, secret } = body
  if (typeof bookingId !== 'string' || typeof secret !== 'string' || !UUID.test(bookingId) || !UUID.test(secret)) {
    throw new HttpError(400, 'invalid_booking_reference')
  }
  const { data, error } = await db
    .from('bookings')
    .select('id, status, email, seat_ids, amount_cents, checkout_id, payment_id, flag, expires_at, paid_at')
    .eq('id', bookingId)
    .eq('secret', secret)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(404, 'booking_not_found')
  return data as Booking
}

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args)
  if (error) throw error
  return data as T
}
