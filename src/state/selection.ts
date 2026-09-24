import type { Seat, SeatId } from '../types/venue'

export interface SelectionState {
  maxSeats: number
  /** Selected seat ids, in the order they were picked. */
  selectedIds: SeatId[]
  /** True when the last attempt to add a seat was blocked by the limit. */
  limitBlocked: boolean
  /** Seats dropped from the selection because someone else took them. */
  takenIds: SeatId[]
}

export type SelectionAction =
  | { type: 'toggle'; seat: Pick<Seat, 'id' | 'status'> }
  | { type: 'remove'; seatId: SeatId }
  | { type: 'clear' }
  | { type: 'dropUnavailable'; unavailable: ReadonlySet<SeatId> }

export function createSelectionState(maxSeats: number): SelectionState {
  return { maxSeats, selectedIds: [], limitBlocked: false, takenIds: [] }
}

export function isLimitReached(state: SelectionState): boolean {
  return state.selectedIds.length >= state.maxSeats
}

export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case 'toggle': {
      const { seat } = action
      if (seat.status === 'reserved') return state
      if (state.selectedIds.includes(seat.id)) {
        return { ...state, selectedIds: state.selectedIds.filter((id) => id !== seat.id), limitBlocked: false, takenIds: [] }
      }
      if (isLimitReached(state)) {
        return state.limitBlocked ? state : { ...state, limitBlocked: true }
      }
      return { ...state, selectedIds: [...state.selectedIds, seat.id], limitBlocked: false, takenIds: [] }
    }
    case 'remove':
      if (!state.selectedIds.includes(action.seatId)) return state
      return { ...state, selectedIds: state.selectedIds.filter((id) => id !== action.seatId), limitBlocked: false }
    case 'clear':
      return createSelectionState(state.maxSeats)
    case 'dropUnavailable': {
      const taken = state.selectedIds.filter((id) => action.unavailable.has(id))
      if (taken.length === 0) return state
      return {
        ...state,
        selectedIds: state.selectedIds.filter((id) => !action.unavailable.has(id)),
        limitBlocked: false,
        takenIds: taken,
      }
    }
  }
}
