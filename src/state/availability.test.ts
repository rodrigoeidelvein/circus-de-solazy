import { describe, expect, it } from 'vitest'
import { type LockMap, locksReducer, nextExpiry, unavailableSeats } from './availability'

const at = (ms: number) => new Date(ms).toISOString()
const empty: LockMap = new Map()

describe('locksReducer', () => {
  it('loads, upserts and deletes locks', () => {
    let locks = locksReducer(empty, {
      type: 'loaded',
      rows: [
        { seat_id: 'A-1-1', status: 'sold', expires_at: null },
        { seat_id: 'A-1-2', status: 'held', expires_at: at(5000) },
      ],
    })
    expect(locks.get('A-1-2')).toEqual({ status: 'held', expiresAt: 5000 })

    locks = locksReducer(locks, { type: 'upserted', row: { seat_id: 'A-1-2', status: 'sold', expires_at: null } })
    expect(locks.get('A-1-2')).toEqual({ status: 'sold', expiresAt: null })

    locks = locksReducer(locks, { type: 'deleted', seatId: 'A-1-1' })
    expect([...locks.keys()]).toEqual(['A-1-2'])
    expect(locksReducer(locks, { type: 'deleted', seatId: 'nope' })).toBe(locks)
  })
})

describe('unavailableSeats', () => {
  const locks = locksReducer(empty, {
    type: 'loaded',
    rows: [
      { seat_id: 'sold', status: 'sold', expires_at: null },
      { seat_id: 'held', status: 'held', expires_at: at(5000) },
      { seat_id: 'lapsed', status: 'held', expires_at: at(1000) },
      { seat_id: 'later', status: 'held', expires_at: at(9000) },
    ],
  })

  it('counts sold seats and live holds, but not lapsed holds', () => {
    expect([...unavailableSeats(locks, 2000)].sort()).toEqual(['held', 'later', 'sold'])
    expect([...unavailableSeats(locks, 6000)].sort()).toEqual(['later', 'sold'])
  })

  it('finds when the next live hold lapses', () => {
    expect(nextExpiry(locks, 2000)).toBe(5000)
    expect(nextExpiry(locks, 6000)).toBe(9000)
    expect(nextExpiry(locks, 10000)).toBeNull()
  })
})
