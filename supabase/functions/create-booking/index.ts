// Holds the seats, opens a JustiFi checkout for them and returns what the
// browser needs to render the payment form.
import { handle, HttpError, json } from '../_shared/cors.ts'
import { db, rpc } from '../_shared/db.ts'
import { justifi } from '../_shared/justifi.ts'

interface Hold {
  booking_id: string
  secret: string
  amount_cents: number
  expires_at: string
}

const parseList = (value: string | undefined) => {
  try {
    const list = JSON.parse(value ?? '')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

Deno.serve(
  handle(async (body) => {
    const { seatIds, email } = body
    if (!Array.isArray(seatIds) || !seatIds.every((id) => typeof id === 'string') || typeof email !== 'string') {
      throw new HttpError(400, 'invalid_body')
    }

    const { data, error } = await db.rpc('hold_seats', { seat_ids: seatIds, email: email.trim() })
    if (error) {
      if (error.message === 'seats_taken') throw new HttpError(409, 'seats_taken', { seatIds: parseList(error.details) })
      if (error.code === '22023') throw new HttpError(400, error.message, { detail: error.details })
      throw error
    }
    const hold = data as Hold

    try {
      const seatCount = new Set(seatIds).size
      const client = justifi()
      // The booking id is the idempotency key: retrying can't open a second checkout.
      const checkout = await client.createCheckout(
        hold.amount_cents,
        `Circus du SoLazy: ${seatCount} seat${seatCount === 1 ? '' : 's'}`,
        hold.booking_id,
      )
      const { error: saveError } = await db.from('bookings').update({ checkout_id: checkout.id }).eq('id', hold.booking_id)
      if (saveError) throw saveError
      const authToken = await client.createWebComponentToken(checkout.id)

      return json({
        bookingId: hold.booking_id,
        secret: hold.secret,
        checkoutId: checkout.id,
        authToken,
        amountCents: hold.amount_cents,
        expiresAt: hold.expires_at,
      })
    } catch (err) {
      console.error('Opening the checkout failed; releasing the seats', err)
      await rpc('release_booking', { booking_id: hold.booking_id, status: 'cancelled' }).catch(console.error)
      throw new HttpError(502, 'payment_unavailable')
    }
  }),
)
