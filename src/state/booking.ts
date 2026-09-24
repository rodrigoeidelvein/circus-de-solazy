import type { SeatId } from '../types/venue'

/** What the buyer's browser knows about its booking once the seats are held. */
export interface BookingSession {
  bookingId: string
  secret: string
  checkoutId: string
  /** Token for <justifi-checkout>, scoped to this checkout. */
  authToken: string
  amountCents: number
  /** ISO timestamp the hold lapses at. */
  expiresAt: string
  seatIds: SeatId[]
}

export type BookingFailure = 'refunded' | 'unconfirmed' | 'error'

/**
 * selecting → holding → paying → confirming → confirmed | failed | expired
 *
 * `resuming` is the brief check on page load for a booking left in progress.
 */
export type BookingState =
  | { stage: 'resuming' }
  | { stage: 'selecting'; notice: string | null }
  | { stage: 'holding'; seatIds: SeatId[] }
  | { stage: 'paying'; session: BookingSession; paymentError: string | null; cancelling: boolean }
  | { stage: 'confirming'; session: BookingSession }
  | { stage: 'confirmed'; session: Pick<BookingSession, 'bookingId' | 'seatIds' | 'amountCents'> }
  | { stage: 'failed'; reason: BookingFailure; message: string | null }
  | { stage: 'expired' }

/** The status a booking can have on the server. */
export type ServerStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'refunded'

export type BookingAction =
  | { type: 'nothingToResume' }
  | { type: 'resumed'; session: BookingSession }
  | { type: 'holdRequested'; seatIds: SeatId[] }
  | { type: 'held'; session: BookingSession }
  | { type: 'holdFailed'; notice: string }
  | { type: 'holdExtended'; expiresAt: string }
  | { type: 'paymentError'; message: string }
  | { type: 'paymentSubmitted' }
  | { type: 'statusChecked'; status: ServerStatus; session?: Pick<BookingSession, 'bookingId' | 'seatIds' | 'amountCents'> }
  | { type: 'confirmTimedOut' }
  | { type: 'cancelRequested' }
  | { type: 'cancelFailed'; message: string }
  | { type: 'cancelled' }
  | { type: 'failed'; message: string }
  | { type: 'reset'; notice?: string }

export const initialBookingState: BookingState = { stage: 'resuming' }

const selecting = (notice: string | null = null): BookingState => ({ stage: 'selecting', notice })

export function bookingReducer(state: BookingState, action: BookingAction): BookingState {
  switch (action.type) {
    case 'nothingToResume':
      return state.stage === 'resuming' ? selecting() : state
    case 'resumed':
      return state.stage === 'resuming' ? paying(action.session) : state

    case 'holdRequested':
      return state.stage === 'selecting' ? { stage: 'holding', seatIds: action.seatIds } : state
    case 'held':
      return state.stage === 'holding' ? paying(action.session) : state
    case 'holdFailed':
      return state.stage === 'holding' ? selecting(action.notice) : state

    case 'holdExtended':
      if (state.stage !== 'paying' && state.stage !== 'confirming') return state
      return { ...state, session: { ...state.session, expiresAt: action.expiresAt } }
    case 'paymentError':
      // The same checkout accepts another attempt, so stay on the payment form.
      if (state.stage === 'paying') return { ...state, paymentError: action.message }
      if (state.stage === 'confirming') return { ...paying(state.session), paymentError: action.message }
      return state
    case 'paymentSubmitted':
      return state.stage === 'paying' ? { stage: 'confirming', session: state.session } : state

    case 'statusChecked': {
      if (state.stage !== 'resuming' && state.stage !== 'paying' && state.stage !== 'confirming') return state
      switch (action.status) {
        case 'pending':
          return state
        case 'paid': {
          const session = action.session ?? (state.stage === 'resuming' ? undefined : state.session)
          return session
            ? { stage: 'confirmed', session: { bookingId: session.bookingId, seatIds: session.seatIds, amountCents: session.amountCents } }
            : state
        }
        case 'expired':
        case 'cancelled':
          return { stage: 'expired' }
        case 'refunded':
          return {
            stage: 'failed',
            reason: 'refunded',
            message: 'Your payment arrived after the hold ran out and a seat had been sold. It has been refunded.',
          }
      }
      return state
    }
    case 'confirmTimedOut':
      return state.stage === 'confirming'
        ? {
            stage: 'failed',
            reason: 'unconfirmed',
            message: "We couldn't confirm your payment yet. If you were charged, your booking will confirm shortly.",
          }
        : state

    case 'cancelRequested':
      return state.stage === 'paying' ? { ...state, cancelling: true, paymentError: null } : state
    case 'cancelFailed':
      return state.stage === 'paying' ? { ...state, cancelling: false, paymentError: action.message } : state
    case 'cancelled':
      return state.stage === 'paying' ? selecting() : state

    case 'failed':
      return { stage: 'failed', reason: 'error', message: action.message }
    case 'reset':
      return selecting(action.notice ?? null)
  }
}

function paying(session: BookingSession): Extract<BookingState, { stage: 'paying' }> {
  return { stage: 'paying', session, paymentError: null, cancelling: false }
}

/** Seats that belong to the booking in progress (shown as the buyer's own on the map). */
export function bookingSeatIds(state: BookingState): SeatId[] | null {
  switch (state.stage) {
    case 'holding':
      return state.seatIds
    case 'paying':
    case 'confirming':
    case 'confirmed':
      return state.session.seatIds
    default:
      return null
  }
}
