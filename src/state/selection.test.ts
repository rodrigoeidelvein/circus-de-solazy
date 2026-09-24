import { describe, expect, it } from 'vitest'
import type { InventoryStatus } from '../types/venue'
import { createSelectionState, isLimitReached, selectionReducer, type SelectionState } from './selection'

const seat = (id: string, status: InventoryStatus = 'available') => ({ id, status })
const toggle = (state: SelectionState, id: string, status?: InventoryStatus) =>
  selectionReducer(state, { type: 'toggle', seat: seat(id, status) })

describe('selectionReducer', () => {
  it('selects an available seat and deselects it on the second toggle', () => {
    let state = createSelectionState(8)
    state = toggle(state, 'A-1-1')
    expect(state.selectedIds).toEqual(['A-1-1'])
    state = toggle(state, 'A-1-1')
    expect(state.selectedIds).toEqual([])
  })

  it('keeps selection order', () => {
    let state = createSelectionState(8)
    for (const id of ['B-2-3', 'A-1-1', 'C-4-4']) state = toggle(state, id)
    expect(state.selectedIds).toEqual(['B-2-3', 'A-1-1', 'C-4-4'])
  })

  it('ignores reserved seats', () => {
    const state = createSelectionState(8)
    expect(toggle(state, 'A-1-1', 'reserved')).toBe(state)
  })

  it('enforces the seat limit and flags the blocked attempt', () => {
    let state = createSelectionState(3)
    for (const id of ['a', 'b', 'c']) state = toggle(state, id)
    expect(isLimitReached(state)).toBe(true)
    expect(state.limitBlocked).toBe(false)

    state = toggle(state, 'd')
    expect(state.selectedIds).toEqual(['a', 'b', 'c'])
    expect(state.limitBlocked).toBe(true)
  })

  it('still allows deselecting at the limit, which clears the warning', () => {
    let state = createSelectionState(2)
    for (const id of ['a', 'b', 'c']) state = toggle(state, id)
    state = toggle(state, 'a')
    expect(state.selectedIds).toEqual(['b'])
    expect(state.limitBlocked).toBe(false)
    expect(isLimitReached(state)).toBe(false)

    state = toggle(state, 'c')
    expect(state.selectedIds).toEqual(['b', 'c'])
  })

  it('removes a single seat', () => {
    let state = createSelectionState(8)
    for (const id of ['a', 'b']) state = toggle(state, id)
    state = selectionReducer(state, { type: 'remove', seatId: 'a' })
    expect(state.selectedIds).toEqual(['b'])
    expect(selectionReducer(state, { type: 'remove', seatId: 'zzz' })).toBe(state)
  })

  it('clears the selection and keeps the limit', () => {
    let state = createSelectionState(2)
    for (const id of ['a', 'b', 'c']) state = toggle(state, id)
    state = selectionReducer(state, { type: 'clear' })
    expect(state).toEqual(createSelectionState(2))
  })

  it('drops seats someone else took and remembers which', () => {
    let state = createSelectionState(8)
    for (const id of ['a', 'b', 'c']) state = toggle(state, id)
    const same = selectionReducer(state, { type: 'dropUnavailable', unavailable: new Set(['x']) })
    expect(same).toBe(state)

    state = selectionReducer(state, { type: 'dropUnavailable', unavailable: new Set(['b', 'x']) })
    expect(state.selectedIds).toEqual(['a', 'c'])
    expect(state.takenIds).toEqual(['b'])

    state = toggle(state, 'd')
    expect(state.takenIds).toEqual([])
  })
})
