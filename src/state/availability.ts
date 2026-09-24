import type { SeatId } from '../types/venue'

/** A row of `seat_locks` as the browser may see it. */
export interface SeatLockRow {
  seat_id: SeatId
  status: 'held' | 'sold'
  expires_at: string | null
}

export interface SeatLock {
  status: 'held' | 'sold'
  /** Epoch ms; null once sold. */
  expiresAt: number | null
}

export type LockMap = ReadonlyMap<SeatId, SeatLock>

export type LockAction =
  | { type: 'loaded'; rows: SeatLockRow[] }
  | { type: 'upserted'; row: SeatLockRow }
  | { type: 'deleted'; seatId: SeatId }

const toLock = (row: SeatLockRow): SeatLock => ({
  status: row.status,
  expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
})

export function locksReducer(state: LockMap, action: LockAction): LockMap {
  switch (action.type) {
    case 'loaded':
      return new Map(action.rows.map((row) => [row.seat_id, toLock(row)]))
    case 'upserted': {
      const next = new Map(state)
      next.set(action.row.seat_id, toLock(action.row))
      return next
    }
    case 'deleted': {
      if (!state.has(action.seatId)) return state
      const next = new Map(state)
      next.delete(action.seatId)
      return next
    }
  }
}

/** Seats that are sold, or held by a hold that hasn't lapsed yet. */
export function unavailableSeats(locks: LockMap, now: number): Set<SeatId> {
  const ids = new Set<SeatId>()
  for (const [id, lock] of locks) {
    if (lock.status === 'sold' || (lock.expiresAt !== null && lock.expiresAt > now)) ids.add(id)
  }
  return ids
}

/** When the next live hold lapses (so the map can free that seat), or null. */
export function nextExpiry(locks: LockMap, now: number): number | null {
  let next: number | null = null
  for (const lock of locks.values()) {
    if (lock.status === 'held' && lock.expiresAt !== null && lock.expiresAt > now) {
      next = next === null ? lock.expiresAt : Math.min(next, lock.expiresAt)
    }
  }
  return next
}
