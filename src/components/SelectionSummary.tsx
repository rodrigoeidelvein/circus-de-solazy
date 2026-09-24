import { useState, type FormEvent } from 'react'
import type { PriceTier, Seat, SeatId } from '../types/venue'
import { formatPrice } from '../venue/format'
import './SelectionSummary.css'

interface SelectionSummaryProps {
  seats: Seat[]
  tiersById: ReadonlyMap<string, PriceTier>
  maxSeats: number
  limitReached: boolean
  limitBlocked: boolean
  /** Something to tell the buyer, e.g. that seats were taken while they chose. */
  notice: string | null
  /** True while the seats are being held. */
  busy: boolean
  onRemove: (seatId: SeatId) => void
  onClear: () => void
  onContinue: (email: string) => void
}

export function SelectionSummary({
  seats,
  tiersById,
  maxSeats,
  limitReached,
  limitBlocked,
  notice,
  busy,
  onRemove,
  onClear,
  onContinue,
}: SelectionSummaryProps) {
  const total = seats.reduce((sum, seat) => sum + seat.price, 0)
  const [askingEmail, setAskingEmail] = useState(false)
  const [email, setEmail] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onContinue(email.trim())
  }

  let message = ''
  if (notice) {
    message = notice
  } else if (limitBlocked) {
    message = `You can book up to ${maxSeats} seats at a time. Deselect a seat to pick another.`
  } else if (limitReached) {
    message = `You've reached the limit of ${maxSeats} seats for this booking.`
  }

  return (
    <section className="summary panel" aria-labelledby="summary-title">
      <div className="summary-header">
        <h2 id="summary-title">Your seats</h2>
        <span className="summary-count">
          {seats.length} / {maxSeats}
        </span>
      </div>

      {seats.length === 0 ? (
        <p className="summary-empty">No seats selected yet. Pick a seat on the map.</p>
      ) : (
        <ul className="summary-list">
          {seats.map((seat) => {
            const tier = tiersById.get(seat.tierId)
            const name = `Section ${seat.sectionId}, Row ${seat.row}, Seat ${seat.number}`
            return (
              <li key={seat.id}>
                <span className="summary-seat">
                  <strong>
                    {seat.sectionId} · Row {seat.row} · Seat {seat.number}
                  </strong>
                  <span className="summary-tier">{tier?.name}</span>
                </span>
                <span className="summary-price">{formatPrice(seat.price)}</span>
                <button type="button" className="summary-remove" onClick={() => onRemove(seat.id)} aria-label={`Remove ${name}`}>
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className={`summary-message${limitBlocked || notice ? ' summary-message--warn' : ''}`} role="status" aria-live="polite">
        {message}
      </p>

      <div className="summary-total">
        <span>Total</span>
        <strong>{formatPrice(total)}</strong>
      </div>

      {askingEmail && seats.length > 0 ? (
        <form className="summary-email" onSubmit={submit}>
          <label htmlFor="summary-email-input">Email for your tickets</label>
          <input
            id="summary-email-input"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
          <div className="summary-actions">
            <button type="button" className="button button--secondary" onClick={() => setAskingEmail(false)} disabled={busy}>
              Back
            </button>
            <button type="submit" className="button button--primary" disabled={busy}>
              {busy ? 'Holding seats…' : 'Hold seats & pay'}
            </button>
          </div>
        </form>
      ) : (
        <div className="summary-actions">
          <button type="button" className="button button--secondary" onClick={onClear} disabled={seats.length === 0}>
            Clear selection
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={() => setAskingEmail(true)}
            disabled={seats.length === 0}
          >
            Continue
          </button>
        </div>
      )}
    </section>
  )
}
