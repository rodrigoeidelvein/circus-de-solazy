import { useEffect, useMemo, useReducer, useState } from 'react'
import { supabase } from '../lib/supabase'
import { locksReducer, nextExpiry, type SeatLockRow, unavailableSeats } from '../state/availability'
import type { SeatId } from '../types/venue'

const COLUMNS = 'seat_id, status, expires_at'

/**
 * Which seats are taken (sold, or held by a live hold), kept up to date with
 * Realtime. Holds that lapse free their seat on the map right away, before the
 * database sweep removes them.
 */
export function useSeatAvailability(): { unavailable: ReadonlySet<SeatId>; ready: boolean; error: string | null } {
  const [locks, dispatch] = useReducer(locksReducer, new Map())
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let active = true

    const load = async () => {
      const { data, error } = await supabase
        .from('seat_locks')
        .select(COLUMNS)
        .or(`status.eq.sold,expires_at.gt.${new Date().toISOString()}`)
      if (!active) return
      if (error) {
        setError("Couldn't load seat availability. Please refresh.")
        return
      }
      dispatch({ type: 'loaded', rows: data as SeatLockRow[] })
      setError(null)
      setReady(true)
    }

    const channel = supabase
      .channel('seat-locks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seat_locks' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const seatId = (payload.old as Partial<SeatLockRow>).seat_id
          if (seatId) dispatch({ type: 'deleted', seatId })
        } else {
          dispatch({ type: 'upserted', row: payload.new as SeatLockRow })
        }
      })
      .subscribe((status) => {
        // (Re)load once live, so changes made before the subscription started aren't missed.
        if (status === 'SUBSCRIBED') void load()
      })

    void load()
    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [])

  // Re-render when the next hold lapses.
  useEffect(() => {
    const next = nextExpiry(locks, now)
    if (next === null) return
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, next - Date.now()) + 50)
    return () => clearTimeout(timer)
  }, [locks, now])

  const unavailable = useMemo(() => unavailableSeats(locks, now), [locks, now])
  return { unavailable, ready, error }
}
