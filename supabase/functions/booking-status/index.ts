// Returns a booking's status. While it's pending, asks JustiFi about the
// checkout and settles it, so payments are confirmed even when the webhook is
// late (or, in local development, never arrives).
//
// With `resume: true`, a still-pending booking also gets a fresh payment-form
// token, so a refreshed page can pick up where it left off.
import { handle, json } from '../_shared/cors.ts'
import { type Booking, findBooking, rpc } from '../_shared/db.ts'
import { settleDeps } from '../_shared/deps.ts'
import { justifi } from '../_shared/justifi.ts'
import { settleCheckout } from '../_shared/settle.ts'

Deno.serve(
  handle(async (body) => {
    let booking = await findBooking(body)

    // Expired and cancelled bookings are checked too: a payment may have landed after all.
    if (booking.checkout_id && ['pending', 'expired', 'cancelled'].includes(booking.status)) {
      await settleCheckout(settleDeps(), booking.checkout_id)
      booking = await findBooking(body)
    }

    if (booking.status === 'pending' && new Date(booking.expires_at) <= new Date()) {
      await rpc('release_booking', { booking_id: booking.id, status: 'expired' })
      booking = await findBooking(body)
    }

    return json({
      status: booking.status,
      seatIds: booking.seat_ids,
      amountCents: booking.amount_cents,
      expiresAt: booking.expires_at,
      paidAt: booking.paid_at,
      ...(body.resume === true && booking.status === 'pending' && booking.checkout_id ? await resumeFields(booking) : {}),
    })
  }),
)

async function resumeFields(booking: Booking) {
  return {
    checkoutId: booking.checkout_id,
    authToken: await justifi().createWebComponentToken(booking.checkout_id!),
  }
}
