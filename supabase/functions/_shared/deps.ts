import { rpc } from './db.ts'
import { justifi } from './justifi.ts'
import type { ConfirmResult, SettleDeps } from './settle.ts'

/** Production wiring for settleCheckout. */
export function settleDeps(): SettleDeps {
  return {
    justifi: justifi(),
    confirmBooking: (checkoutId, paymentId) =>
      rpc<ConfirmResult>('confirm_booking', { checkout_id: checkoutId, payment_id: paymentId }),
    markRefunded: (bookingId) => rpc<void>('mark_refunded', { booking_id: bookingId }),
  }
}
