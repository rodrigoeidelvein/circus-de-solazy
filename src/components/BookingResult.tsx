import type { BookingState } from '../state/booking'
import type { Seat } from '../types/venue'
import { bookingReference, formatPrice } from '../venue/format'

type ResultState = Extract<BookingState, { stage: 'confirmed' | 'failed' | 'expired' }>

interface BookingResultProps {
  result: ResultState
  /** The confirmed booking's seats. */
  seats: Seat[]
  onDone: () => void
}

export function BookingResult({ result, seats, onDone }: BookingResultProps) {
  if (result.stage === 'confirmed') {
    return (
      <section className="result panel" aria-labelledby="result-title">
        <h2 id="result-title">You’re going to the circus!</h2>
        <p className="result-lead">
          Booking reference <strong className="result-ref">{bookingReference(result.session.bookingId)}</strong>
        </p>
        <ul className="result-seats">
          {seats.map((seat) => (
            <li key={seat.id}>
              {seat.sectionId} · Row {seat.row} · Seat {seat.number}
            </li>
          ))}
        </ul>
        <p className="result-total">Paid {formatPrice(result.session.amountCents / 100)}</p>
        <button type="button" className="button button--primary result-action" onClick={onDone}>
          Book more seats
        </button>
      </section>
    )
  }

  const expired = result.stage === 'expired'
  return (
    <section className="result panel" aria-labelledby="result-title" role="alert">
      <h2 id="result-title">{expired ? 'Your hold expired' : 'Payment not completed'}</h2>
      <p className="result-lead">
        {expired
          ? 'We held your seats for 10 minutes and released them. You weren’t charged. Pick again to book.'
          : result.message}
      </p>
      <button type="button" className="button button--primary result-action" onClick={onDone}>
        Back to the seat map
      </button>
    </section>
  )
}
