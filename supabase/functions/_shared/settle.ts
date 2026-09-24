import type { JustifiClient } from './justifi.ts'

export interface ConfirmResult {
  booking_id: string
  status: string
  outcome: 'paid' | 'already_paid' | 'conflict' | 'already_refunded'
}

export interface SettleDeps {
  justifi: Pick<JustifiClient, 'getCheckout' | 'refundPayment'>
  confirmBooking: (checkoutId: string, paymentId: string | null) => Promise<ConfirmResult>
  markRefunded: (bookingId: string) => Promise<void>
}

/**
 * Brings a booking in line with its JustiFi checkout. Asks JustiFi rather than
 * trusting the caller, so it's safe to run from the webhook, from status
 * polling, or both. Returns the checkout status.
 *
 * A payment that landed after the hold lapsed is kept if the seats are still
 * free; if one was resold, the payment is refunded and the booking flagged.
 */
export async function settleCheckout(deps: SettleDeps, checkoutId: string) {
  const checkout = await deps.justifi.getCheckout(checkoutId)
  if (checkout.status !== 'completed') return { checkoutStatus: checkout.status, outcome: null }

  const paymentId = checkout.successful_payment_id ?? null
  const result = await deps.confirmBooking(checkoutId, paymentId)

  if (result.outcome === 'conflict') {
    if (!paymentId) throw new Error(`Checkout ${checkoutId} completed without a payment id; refund by hand`)
    // Idempotency key per booking, so a retry never refunds twice.
    await deps.justifi.refundPayment(paymentId, checkout.payment_amount, `refund-${result.booking_id}`)
    await deps.markRefunded(result.booking_id)
    console.warn(`Refunded late payment ${paymentId} for booking ${result.booking_id}: a seat was resold`)
    return { checkoutStatus: checkout.status, outcome: 'refunded' as const }
  }
  return { checkoutStatus: checkout.status, outcome: result.outcome }
}
