// Called by the payment form's preCompleteHook just before the card is
// charged: refuses if the hold has lapsed, otherwise extends it so it can't
// run out mid-payment.
import { handle, HttpError, json } from '../_shared/cors.ts'
import { findBooking, rpc } from '../_shared/db.ts'

Deno.serve(
  handle(async (body) => {
    const booking = await findBooking(body)
    const result = await rpc<{ ok: boolean; reason?: string; expires_at?: string }>('verify_booking', {
      booking_id: booking.id,
    })
    if (!result.ok) throw new HttpError(409, 'hold_not_active', { reason: result.reason })
    return json({ ok: true, expiresAt: result.expires_at })
  }),
)
