import { describe, expect, it } from 'vitest'
import { type BookingAction, bookingReducer, bookingSeatIds, type BookingSession, type BookingState } from './booking'

const session: BookingSession = {
  bookingId: 'b1',
  secret: 's1',
  checkoutId: 'cho_1',
  authToken: 'wct_1',
  amountCents: 11000,
  expiresAt: '2026-01-01T00:10:00Z',
  seatIds: ['A-1-1', 'A-6-1'],
}

const run = (state: BookingState, ...actions: BookingAction[]) => actions.reduce(bookingReducer, state)
const selecting: BookingState = { stage: 'selecting', notice: null }
const paying = run(selecting, { type: 'holdRequested', seatIds: session.seatIds }, { type: 'held', session })

describe('bookingReducer', () => {
  it('starts by checking for a booking to resume', () => {
    expect(run({ stage: 'resuming' }, { type: 'nothingToResume' })).toEqual(selecting)
    expect(run({ stage: 'resuming' }, { type: 'resumed', session })).toMatchObject({ stage: 'paying', session })
  })

  it('walks the happy path: selecting → holding → paying → confirming → confirmed', () => {
    let state = run(selecting, { type: 'holdRequested', seatIds: session.seatIds })
    expect(state).toEqual({ stage: 'holding', seatIds: session.seatIds })
    state = run(state, { type: 'held', session })
    expect(state).toEqual({ stage: 'paying', session, paymentError: null, cancelling: false })
    state = run(state, { type: 'paymentSubmitted' })
    expect(state).toEqual({ stage: 'confirming', session })
    state = run(state, { type: 'statusChecked', status: 'pending' })
    expect(state.stage).toBe('confirming')
    state = run(state, { type: 'statusChecked', status: 'paid' })
    expect(state).toEqual({ stage: 'confirmed', session: { bookingId: 'b1', seatIds: session.seatIds, amountCents: 11000 } })
  })

  it('goes back to selecting with a notice when the hold fails', () => {
    const state = run(selecting, { type: 'holdRequested', seatIds: ['A-1-1'] }, { type: 'holdFailed', notice: 'taken' })
    expect(state).toEqual({ stage: 'selecting', notice: 'taken' })
  })

  it('keeps the payment form after a payment error so the buyer can retry', () => {
    let state = run(paying, { type: 'paymentError', message: 'Card declined' })
    expect(state).toMatchObject({ stage: 'paying', paymentError: 'Card declined' })
    state = run(state, { type: 'paymentSubmitted' }, { type: 'paymentError', message: 'Declined again' })
    expect(state).toMatchObject({ stage: 'paying', paymentError: 'Declined again' })
  })

  it('extends the hold countdown after verification', () => {
    const state = run(paying, { type: 'holdExtended', expiresAt: '2026-01-01T00:12:00Z' })
    expect(state).toMatchObject({ stage: 'paying', session: { expiresAt: '2026-01-01T00:12:00Z' } })
  })

  it('ends up expired when the server says the hold lapsed or was cancelled', () => {
    expect(run(paying, { type: 'statusChecked', status: 'expired' })).toEqual({ stage: 'expired' })
    expect(run(paying, { type: 'paymentSubmitted' }, { type: 'statusChecked', status: 'cancelled' })).toEqual({ stage: 'expired' })
  })

  it('reports a refunded late payment as a failure', () => {
    expect(run(paying, { type: 'paymentSubmitted' }, { type: 'statusChecked', status: 'refunded' })).toMatchObject({
      stage: 'failed',
      reason: 'refunded',
    })
  })

  it('fails if the payment is never confirmed', () => {
    const state = run(paying, { type: 'paymentSubmitted' }, { type: 'confirmTimedOut' })
    expect(state).toMatchObject({ stage: 'failed', reason: 'unconfirmed' })
    expect(run(paying, { type: 'confirmTimedOut' })).toBe(paying)
  })

  it('cancels back to selecting, or shows the error if cancelling failed', () => {
    const cancelling = run(paying, { type: 'cancelRequested' })
    expect(cancelling).toMatchObject({ stage: 'paying', cancelling: true })
    expect(run(cancelling, { type: 'cancelled' })).toEqual(selecting)
    expect(run(cancelling, { type: 'cancelFailed', message: 'offline' })).toMatchObject({
      cancelling: false,
      paymentError: 'offline',
    })
  })

  it('confirms a resumed booking that was paid while the page was away', () => {
    const state = run({ stage: 'resuming' }, { type: 'statusChecked', status: 'paid', session })
    expect(state).toMatchObject({ stage: 'confirmed', session: { bookingId: 'b1' } })
  })

  it('ignores actions that do not apply to the current stage', () => {
    expect(run(selecting, { type: 'paymentSubmitted' })).toBe(selecting)
    expect(run(selecting, { type: 'held', session })).toBe(selecting)
    expect(run(paying, { type: 'holdRequested', seatIds: [] })).toBe(paying)
    const confirmed = run(paying, { type: 'statusChecked', status: 'paid' })
    expect(run(confirmed, { type: 'statusChecked', status: 'expired' })).toBe(confirmed)
  })

  it('resets to selecting from a result screen', () => {
    expect(run({ stage: 'expired' }, { type: 'reset' })).toEqual(selecting)
  })
})

describe('bookingSeatIds', () => {
  it('returns the seats of the booking in progress', () => {
    expect(bookingSeatIds(selecting)).toBeNull()
    expect(bookingSeatIds(paying)).toEqual(session.seatIds)
    expect(bookingSeatIds({ stage: 'holding', seatIds: ['X'] })).toEqual(['X'])
  })
})
