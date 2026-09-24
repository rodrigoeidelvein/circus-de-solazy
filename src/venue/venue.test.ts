import { describe, expect, it } from 'vitest'
import { venue, withAvailability } from './venue'

describe('venue', () => {
  it('starts with every seat available: status comes from the database', () => {
    expect(venue.seats.every((s) => s.status === 'available')).toBe(true)
  })
})

describe('withAvailability', () => {
  it('marks unavailable seats reserved and keeps unchanged seats as the same objects', () => {
    const v = withAvailability(venue, new Set(['A-1-1', 'D-8-15']))
    expect(v.seatsById.get('A-1-1')!.status).toBe('reserved')
    expect(v.sections[3].rows[7].seats.at(-1)!.status).toBe('reserved')
    expect(v.seats.filter((s) => s.status === 'reserved')).toHaveLength(2)
    expect(v.seatsById.get('A-1-2')).toBe(venue.seatsById.get('A-1-2'))
    expect(v.seats).toHaveLength(venue.seats.length)

    const freed = withAvailability(v, new Set())
    expect(freed.seatsById.get('A-1-1')!.status).toBe('available')
  })
})
