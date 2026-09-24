import { lazy, Suspense, useEffect, useMemo } from 'react'
import { BookingResult } from './components/BookingResult'
import { Legend } from './components/Legend'
import { SeatMap } from './components/SeatMap'
import { SelectionSummary } from './components/SelectionSummary'
import { useBooking } from './hooks/useBooking'
import { useSeatAvailability } from './hooks/useSeatAvailability'
import { useSeatSelection } from './hooks/useSeatSelection'
import { bookingSeatIds } from './state/booking'
import type { PriceTier, Seat, SeatId } from './types/venue'
import { venue, withAvailability } from './venue/venue'
import { MAX_SEATS_PER_BOOKING } from './venue/venueConfig'
import './App.css'

const tiersById = new Map<string, PriceTier>(venue.tiers.map((t) => [t.id, t]))
const seatsFor = (ids: readonly SeatId[]): Seat[] =>
  ids.map((id) => venue.seatsById.get(id)).filter((s) => s !== undefined)
const noop = () => {}

// The JustiFi payment form is large; load it only once seats are held.
const CheckoutPanel = lazy(() => import('./components/CheckoutPanel').then((m) => ({ default: m.CheckoutPanel })))
const loadingPanel = (text: string) => (
  <section className="panel" aria-busy="true">
    <p className="panel-loading">{text}</p>
  </section>
)

function App() {
  const selection = useSeatSelection(MAX_SEATS_PER_BOOKING)
  const availability = useSeatAvailability()
  const booking = useBooking({ onSeatsTaken: (ids) => ids.forEach(selection.remove) })
  const { state } = booking

  // Seats of the booking in progress are the buyer's own: show them as selected, not reserved.
  const ownSeatIds = bookingSeatIds(state)
  const ownSet = useMemo(() => (ownSeatIds ? new Set(ownSeatIds) : null), [ownSeatIds])
  const unavailable = useMemo(() => {
    if (!ownSet) return availability.unavailable
    return new Set([...availability.unavailable].filter((id) => !ownSet.has(id)))
  }, [availability.unavailable, ownSet])
  const liveVenue = useMemo(() => withAvailability(venue, unavailable), [unavailable])

  const selecting = state.stage === 'selecting'
  const isSelected = useMemo(
    () => (ownSet ? (id: SeatId) => ownSet.has(id) : selection.isSelected),
    [ownSet, selection.isSelected],
  )

  // Someone else took a seat while it was selected here: drop it (and say so, below).
  const { dropUnavailable } = selection
  useEffect(() => {
    if (selecting) dropUnavailable(availability.unavailable)
  }, [selecting, availability.unavailable, dropUnavailable])
  const { takenIds } = selection
  const takenNotice = takenIds.length
    ? `${takenIds.join(', ')} ${takenIds.length === 1 ? 'was' : 'were'} just taken by someone else.`
    : null

  const selectedSeats = useMemo(() => seatsFor(selection.selectedIds), [selection.selectedIds])
  const bookingSeats = useMemo(() => seatsFor(ownSeatIds ?? []), [ownSeatIds])

  let side
  switch (state.stage) {
    case 'resuming':
      side = loadingPanel('Checking for a booking in progress…')
      break
    case 'selecting':
    case 'holding':
      side = (
        <SelectionSummary
          seats={selectedSeats}
          tiersById={tiersById}
          maxSeats={selection.maxSeats}
          limitReached={selection.limitReached}
          limitBlocked={selection.limitBlocked}
          notice={(state.stage === 'selecting' && state.notice) || takenNotice}
          busy={state.stage === 'holding'}
          onRemove={selection.remove}
          onClear={selection.clear}
          onContinue={(email) => void booking.book(selection.selectedIds, email)}
        />
      )
      break
    case 'paying':
    case 'confirming':
      side = (
        <Suspense fallback={loadingPanel('Loading checkout…')}>
          <CheckoutPanel
            session={state.session}
            seats={bookingSeats}
            tiersById={tiersById}
            confirming={state.stage === 'confirming'}
            paymentError={state.stage === 'paying' ? state.paymentError : null}
            cancelling={state.stage === 'paying' && state.cancelling}
            onBeforePayment={booking.verifyBeforePayment}
            onSubmitted={booking.paymentSubmitted}
            onPaymentError={booking.paymentFailed}
            onCancel={() => void booking.cancel()}
          />
        </Suspense>
      )
      break
    case 'confirmed':
    case 'failed':
    case 'expired':
      side = (
        <BookingResult
          result={state}
          seats={bookingSeats}
          onDone={() => {
            if (state.stage === 'confirmed') selection.clear()
            booking.reset()
          }}
        />
      )
      break
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>Circus du SoLazy</h1>
        <p>Pick your seat under the big top.</p>
      </header>

      <div className="booking">
        <section className="booking-map" aria-label="Choose seats">
          <SeatMap venue={liveVenue} isSelected={isSelected} onToggle={selecting ? selection.toggle : noop} />
          {availability.error ? (
            <p className="booking-hint booking-hint--error" role="alert">
              {availability.error}
            </p>
          ) : (
            <p className="booking-hint">
              {selecting
                ? 'Click a seat to select it. With a keyboard, Tab to a seat and press Enter or Space.'
                : 'Your seats are highlighted on the map.'}
            </p>
          )}
        </section>

        <aside className="booking-side">
          {side}
          <Legend tiers={venue.tiers} />
        </aside>
      </div>
    </main>
  )
}

export default App
