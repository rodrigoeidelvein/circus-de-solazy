import { describe, expect, it } from 'vitest'
import type { VenueConfig } from '../types/venue'
import { generateVenue, tierForRow } from './generateVenue'
import { venueConfig } from './venueConfig'

const normalize = (deg: number) => ((deg % 360) + 360) % 360

describe('generateVenue', () => {
  const venue = generateVenue(venueConfig)

  it('creates every section with the configured rows and seats', () => {
    expect(venue.sections.map((s) => s.id)).toEqual(['A', 'B', 'C', 'D'])
    for (const section of venue.sections) {
      expect(section.rows.map((r) => r.seats.length)).toEqual(venueConfig.seatsPerRow)
    }
    const perSection = venueConfig.seatsPerRow.reduce((a, b) => a + b, 0)
    expect(venue.seats).toHaveLength(perSection * 4)
    expect(venue.seatsById.size).toBe(venue.seats.length)
  })

  it('gives outer rows more seats and a larger radius than inner rows', () => {
    const rows = venue.sections[0].rows
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].seats.length).toBeGreaterThan(rows[i - 1].seats.length)
      expect(rows[i].radius).toBeGreaterThan(rows[i - 1].radius)
    }
    expect(rows[0].radius).toBeGreaterThan(venue.ringRadius)
  })

  it('places seats on their row radius using polar coordinates', () => {
    for (const seat of venue.seats) {
      expect(Math.hypot(seat.x, seat.y)).toBeCloseTo(seat.radius, 6)
    }
    // 0° is 12 o'clock, 90° is 3 o'clock.
    const seat = venue.seats[0]
    const rad = (seat.angleDeg * Math.PI) / 180
    expect(seat.x).toBeCloseTo(seat.radius * Math.sin(rad))
    expect(seat.y).toBeCloseTo(-seat.radius * Math.cos(rad))
  })

  it('assigns ids, 1-based seat numbers and tiers by row', () => {
    const b3 = venue.sections[1].rows[2]
    expect(b3.seats[0].id).toBe('B-3-1')
    expect(b3.seats.map((s) => s.number)).toEqual(b3.seats.map((_, i) => i + 1))

    const tierOf = (row: number) => venue.seats.find((s) => s.row === row)!
    expect(tierOf(1)).toMatchObject({ tierId: 'ringside', price: 85 })
    expect(tierOf(2)).toMatchObject({ tierId: 'ringside', price: 85 })
    expect(tierOf(3)).toMatchObject({ tierId: 'standard', price: 45 })
    expect(tierOf(5)).toMatchObject({ tierId: 'standard', price: 45 })
    expect(tierOf(6)).toMatchObject({ tierId: 'gallery', price: 25 })
    expect(tierOf(8)).toMatchObject({ tierId: 'gallery', price: 25 })
  })

  it('leaves the entrance free of seats', () => {
    const { startDeg, endDeg } = venue.entrance
    for (const seat of venue.seats) {
      const a = normalize(seat.angleDeg)
      expect(a > normalize(startDeg) && a < normalize(endDeg)).toBe(false)
    }
  })

  it('separates sections with aisles and keeps seats inside their section', () => {
    const [a, b] = venue.sections
    expect(b.startDeg - a.endDeg).toBeCloseTo(venueConfig.aisleWidthDeg)
    for (const section of venue.sections) {
      for (const seat of section.rows.flatMap((r) => r.seats)) {
        expect(seat.angleDeg).toBeGreaterThan(section.startDeg)
        expect(seat.angleDeg).toBeLessThan(section.endDeg)
      }
    }
  })

  it('does not overlap neighbouring seats', () => {
    for (const row of venue.sections.flatMap((s) => s.rows)) {
      for (let i = 1; i < row.seats.length; i++) {
        const [p, q] = [row.seats[i - 1], row.seats[i]]
        expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeGreaterThan(venue.seatRadius * 2)
      }
    }
    expect(venueConfig.rowSpacing).toBeGreaterThan(venue.seatRadius * 2)
  })

  it('marks seats reserved via the isReserved option', () => {
    const reserved = new Set(['A-1-1', 'C-8-15'])
    const v = generateVenue(venueConfig, { isReserved: (id) => reserved.has(id) })
    expect(v.seats.filter((s) => s.status === 'reserved').map((s) => s.id).sort()).toEqual([...reserved].sort())
    expect(venue.seats.every((s) => s.status === 'available')).toBe(true)
  })

  it('is deterministic', () => {
    expect(generateVenue(venueConfig)).toEqual(generateVenue(venueConfig))
  })

  it('adapts to a different config', () => {
    const config: VenueConfig = {
      ...venueConfig,
      sections: [
        { id: 'N', name: 'North' },
        { id: 'S', name: 'South' },
      ],
      seatsPerRow: [4, 6],
      tiers: [{ id: 'flat', name: 'Flat', price: 10, fromRow: 1, toRow: 2 }],
    }
    const v = generateVenue(config)
    expect(v.seats).toHaveLength(20)
    expect(v.sections[1].rows[1].seats.at(-1)!.id).toBe('S-2-6')
  })

  it('rejects configs with uncovered rows or no room for seats', () => {
    expect(() =>
      generateVenue({ ...venueConfig, tiers: venueConfig.tiers.filter((t) => t.id !== 'standard') }),
    ).toThrow(/row 3/)
    expect(() => generateVenue({ ...venueConfig, aisleWidthDeg: 120 })).toThrow(/no room/)
    expect(() => generateVenue({ ...venueConfig, seatsPerRow: [] })).toThrow()
  })
})

describe('tierForRow', () => {
  it('finds the tier whose row range contains the row', () => {
    expect(tierForRow(venueConfig.tiers, 4).name).toBe('Standard')
  })
})
