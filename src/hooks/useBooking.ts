import { useCallback, useEffect, useReducer, useRef } from 'react'
import { api, ApiError, type BookingRef } from '../lib/api'
import { clearBookingRef, loadBookingRef, saveBookingRef } from '../lib/bookingStorage'
import { bookingReducer, initialBookingState, type BookingState } from '../state/booking'
import type { SeatId } from '../types/venue'

const POLL_INTERVAL_MS = 2000
const POLL_ATTEMPTS = 30
/** How long after the hold's expiry to ask the server, allowing for clock skew. */
const EXPIRY_GRACE_MS = 1500

interface UseBookingOptions {
  /** Called when some of the requested seats were taken by someone else first. */
  onSeatsTaken: (seatIds: SeatId[]) => void
}

const holdErrorNotice: Record<string, string> = {
  invalid_email: 'Please enter a valid email address.',
  invalid_seat_count: 'Pick between 1 and 8 seats.',
  unknown_seats: 'Some of those seats no longer exist. Please pick again.',
  payment_unavailable: 'Payments are unavailable right now. Please try again in a moment.',
  network_error: "We couldn't reach the box office. Check your connection and try again.",
}

const sessionRef = (state: BookingState): BookingRef | null =>
  state.stage === 'paying' || state.stage === 'confirming' ? state.session : null

/** The booking flow: holds seats, tracks payment, and resumes after a page refresh. */
export function useBooking({ onSeatsTaken }: UseBookingOptions) {
  const [state, dispatch] = useReducer(bookingReducer, initialBookingState)
  const stateRef = useRef(state)
  const onSeatsTakenRef = useRef(onSeatsTaken)
  useEffect(() => {
    stateRef.current = state
    onSeatsTakenRef.current = onSeatsTaken
  })

  // Pick up a booking left in progress by a refresh.
  useEffect(() => {
    const ref = loadBookingRef()
    if (!ref) {
      dispatch({ type: 'nothingToResume' })
      return
    }
    let active = true
    api
      .bookingStatus(ref, true)
      .then((res) => {
        if (!active) return
        if (res.status === 'pending' && res.checkoutId && res.authToken) {
          dispatch({
            type: 'resumed',
            session: {
              ...ref,
              checkoutId: res.checkoutId,
              authToken: res.authToken,
              amountCents: res.amountCents,
              expiresAt: res.expiresAt,
              seatIds: res.seatIds,
            },
          })
        } else if (res.status === 'paid') {
          dispatch({ type: 'statusChecked', status: 'paid', session: { ...ref, seatIds: res.seatIds, amountCents: res.amountCents } })
        } else {
          clearBookingRef()
          dispatch({ type: 'nothingToResume' })
        }
      })
      .catch(() => {
        if (!active) return
        clearBookingRef()
        dispatch({ type: 'nothingToResume' })
      })
    return () => {
      active = false
    }
  }, [])

  // Nothing left to resume once a booking has ended without a payment.
  useEffect(() => {
    if (state.stage === 'expired' || (state.stage === 'failed' && state.reason !== 'unconfirmed')) clearBookingRef()
  }, [state])

  const refreshStatus = useCallback(async () => {
    const ref = sessionRef(stateRef.current)
    if (!ref) return
    try {
      const res = await api.bookingStatus(ref)
      if (res.status === 'pending' && stateRef.current.stage !== 'resuming') {
        dispatch({ type: 'holdExtended', expiresAt: res.expiresAt })
      }
      dispatch({ type: 'statusChecked', status: res.status })
    } catch {
      // Transient: the next poll or timer tries again.
    }
  }, [])

  const book = useCallback(async (seatIds: SeatId[], email: string) => {
    if (stateRef.current.stage !== 'selecting') return
    dispatch({ type: 'holdRequested', seatIds })
    try {
      const booking = await api.createBooking(seatIds, email)
      saveBookingRef(booking)
      dispatch({ type: 'held', session: { ...booking, seatIds } })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'seats_taken') {
        const taken = Array.isArray(error.body.seatIds) ? (error.body.seatIds as SeatId[]) : []
        onSeatsTakenRef.current(taken)
        dispatch({
          type: 'holdFailed',
          notice: `Sorry, ${taken.length === 1 ? 'a seat was' : 'some seats were'} just taken (${taken.join(', ')}). We've removed ${taken.length === 1 ? 'it' : 'them'} from your selection.`,
        })
      } else {
        const code = error instanceof ApiError ? error.code : 'error'
        dispatch({ type: 'holdFailed', notice: holdErrorNotice[code] ?? 'Something went wrong. Please try again.' })
      }
    }
  }, [])

  /** For the payment form's preCompleteHook: true if the hold is still ours (and now extended). */
  const verifyBeforePayment = useCallback(async (): Promise<boolean> => {
    const ref = sessionRef(stateRef.current)
    if (!ref) return false
    try {
      const { expiresAt } = await api.verifyBooking(ref)
      dispatch({ type: 'holdExtended', expiresAt })
      return true
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await refreshStatus()
      } else {
        dispatch({ type: 'paymentError', message: "We couldn't reach the box office, so your card wasn't charged. Please try again." })
      }
      return false
    }
  }, [refreshStatus])

  const paymentSubmitted = useCallback(() => dispatch({ type: 'paymentSubmitted' }), [])
  const paymentFailed = useCallback((message: string) => dispatch({ type: 'paymentError', message }), [])

  const cancel = useCallback(async () => {
    const ref = sessionRef(stateRef.current)
    if (!ref) return
    dispatch({ type: 'cancelRequested' })
    try {
      const { status } = await api.cancelBooking(ref)
      if (status === 'paid') {
        dispatch({ type: 'statusChecked', status })
      } else {
        clearBookingRef()
        dispatch({ type: 'cancelled' })
      }
    } catch {
      dispatch({ type: 'cancelFailed', message: "Couldn't cancel. Please try again." })
    }
  }, [])

  const reset = useCallback(() => {
    clearBookingRef()
    dispatch({ type: 'reset' })
  }, [])

  // After the payment is submitted, poll until the booking is settled.
  const confirmingId = state.stage === 'confirming' ? state.session.bookingId : null
  useEffect(() => {
    if (!confirmingId) return
    let attempts = 0
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      attempts += 1
      await refreshStatus()
      if (stateRef.current.stage !== 'confirming') return
      if (attempts >= POLL_ATTEMPTS) dispatch({ type: 'confirmTimedOut' })
      else timer = setTimeout(poll, POLL_INTERVAL_MS)
    }
    timer = setTimeout(poll, 500)
    return () => clearTimeout(timer)
  }, [confirmingId, refreshStatus])

  // When the hold runs out while paying, ask the server (it may have been extended, or paid).
  const payingExpiresAt = state.stage === 'paying' ? state.session.expiresAt : null
  useEffect(() => {
    if (!payingExpiresAt) return
    let timer: ReturnType<typeof setTimeout>
    const check = async () => {
      await refreshStatus()
      const current = stateRef.current
      // Still pending with the same expiry: our clock is ahead of the server's. Try again shortly.
      if (current.stage === 'paying' && current.session.expiresAt === payingExpiresAt) timer = setTimeout(check, 3000)
    }
    timer = setTimeout(check, Math.max(0, Date.parse(payingExpiresAt) - Date.now()) + EXPIRY_GRACE_MS)
    return () => clearTimeout(timer)
  }, [payingExpiresAt, refreshStatus])

  return { state, book, verifyBeforePayment, paymentSubmitted, paymentFailed, cancel, reset }
}
