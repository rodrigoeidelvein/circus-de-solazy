import { useCallback, useMemo, useReducer } from 'react'
import { createSelectionState, isLimitReached, selectionReducer } from '../state/selection'
import type { Seat, SeatId } from '../types/venue'

export function useSeatSelection(maxSeats: number) {
  const [state, dispatch] = useReducer(selectionReducer, maxSeats, createSelectionState)

  const toggle = useCallback((seat: Seat) => dispatch({ type: 'toggle', seat }), [])
  const remove = useCallback((seatId: SeatId) => dispatch({ type: 'remove', seatId }), [])
  const clear = useCallback(() => dispatch({ type: 'clear' }), [])
  const dropUnavailable = useCallback(
    (unavailable: ReadonlySet<SeatId>) => dispatch({ type: 'dropUnavailable', unavailable }),
    [],
  )

  const selectedSet = useMemo(() => new Set(state.selectedIds), [state.selectedIds])
  const isSelected = useCallback((id: SeatId) => selectedSet.has(id), [selectedSet])

  return {
    selectedIds: state.selectedIds,
    isSelected,
    maxSeats: state.maxSeats,
    limitReached: isLimitReached(state),
    limitBlocked: state.limitBlocked,
    takenIds: state.takenIds,
    toggle,
    remove,
    clear,
    dropUnavailable,
  }
}
