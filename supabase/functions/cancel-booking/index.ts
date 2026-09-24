// The buyer backs out: frees their held seats.
import { handle, json } from '../_shared/cors.ts'
import { findBooking, rpc } from '../_shared/db.ts'
import { settleDeps } from '../_shared/deps.ts'
import { settleCheckout } from '../_shared/settle.ts'

Deno.serve(
  handle(async (body) => {
    const booking = await findBooking(body)
    // If a payment slipped through just before the cancel, keep it rather than
    // freeing seats that were paid for.
    if (booking.status === 'pending' && booking.checkout_id) await settleCheckout(settleDeps(), booking.checkout_id)
    const status = await rpc<string>('release_booking', { booking_id: booking.id, status: 'cancelled' })
    return json({ status })
  }),
)
