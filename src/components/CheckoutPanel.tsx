import { useEffect, useRef } from 'react'
import { useCountdown } from '../hooks/useCountdown'
import '../register-web-components'
import type { JustifiCheckoutElement } from '../register-web-components'
import type { BookingSession } from '../state/booking'
import type { PriceTier, Seat } from '../types/venue'
import { formatPrice } from '../venue/format'
import './CheckoutPanel.css'

interface CheckoutPanelProps {
  session: BookingSession
  seats: Seat[]
  tiersById: ReadonlyMap<string, PriceTier>
  /** True once the payment is submitted, while we wait for it to be confirmed. */
  confirming: boolean
  paymentError: string | null
  cancelling: boolean
  /** Runs just before the card is charged; resolves false to stop the payment. */
  onBeforePayment: () => Promise<boolean>
  onSubmitted: () => void
  onPaymentError: (message: string) => void
  onCancel: () => void
}

const formatCountdown = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

export function CheckoutPanel({
  session,
  seats,
  tiersById,
  confirming,
  paymentError,
  cancelling,
  onBeforePayment,
  onSubmitted,
  onPaymentError,
  onCancel,
}: CheckoutPanelProps) {
  const checkoutRef = useRef<JustifiCheckoutElement>(null)
  const secondsLeft = useCountdown(session.expiresAt)

  // Latest callbacks, so the listeners below attach once per element.
  const handlers = useRef({ onBeforePayment, onSubmitted, onPaymentError })
  useEffect(() => {
    handlers.current = { onBeforePayment, onSubmitted, onPaymentError }
  })

  useEffect(() => {
    const el = checkoutRef.current
    if (!el) return
    // Check the hold (and extend it) right before JustiFi charges the card.
    el.preCompleteHook = (state, resolve, reject) => {
      handlers.current.onBeforePayment().then(
        (ok) => (ok ? resolve(state) : reject()),
        () => reject(),
      )
    }
    const onSubmit = () => handlers.current.onSubmitted()
    const onError = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; severity?: string }>).detail
      if (detail?.severity === 'info') return
      handlers.current.onPaymentError(detail?.message || 'The payment didn’t go through. Please try again.')
    }
    el.addEventListener('submit-event', onSubmit)
    el.addEventListener('error-event', onError)
    return () => {
      el.removeEventListener('submit-event', onSubmit)
      el.removeEventListener('error-event', onError)
    }
  }, [session.checkoutId])

  const urgent = secondsLeft <= 60

  return (
    <section className="checkout panel" aria-labelledby="checkout-title">
      <div className="checkout-header">
        <h2 id="checkout-title">Checkout</h2>
        <span className={`checkout-timer${urgent ? ' checkout-timer--urgent' : ''}`} role="timer" aria-live="off">
          Seats held for {formatCountdown(secondsLeft)}
        </span>
      </div>

      <ul className="checkout-seats">
        {seats.map((seat) => (
          <li key={seat.id}>
            <span>
              {seat.sectionId} · Row {seat.row} · Seat {seat.number}
              <span className="checkout-tier"> {tiersById.get(seat.tierId)?.name}</span>
            </span>
            <span>{formatPrice(seat.price)}</span>
          </li>
        ))}
      </ul>
      <div className="checkout-total">
        <span>Total</span>
        <strong>{formatPrice(session.amountCents / 100)}</strong>
      </div>

      {paymentError && (
        <p className="checkout-error" role="alert">
          {paymentError}
        </p>
      )}

      <div className="checkout-form" aria-busy={confirming}>
        <justifi-checkout
          ref={checkoutRef}
          key={session.checkoutId}
          auth-token={session.authToken}
          checkout-id={session.checkoutId}
          disable-bank-account
        />
        {confirming && (
          <div className="checkout-confirming" role="status">
            <span className="checkout-spinner" aria-hidden="true" />
            Confirming your payment…
          </div>
        )}
      </div>

      <button
        type="button"
        className="button button--secondary checkout-cancel"
        onClick={onCancel}
        disabled={confirming || cancelling}
      >
        {cancelling ? 'Releasing seats…' : 'Cancel and release seats'}
      </button>
    </section>
  )
}
