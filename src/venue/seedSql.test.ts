import { describe, expect, it } from 'vitest'
import seedFile from '../../supabase/seed.sql?raw'
import { generateVenue } from './generateVenue'
import { buildSeedSql } from './seedSql'
import { venueConfig } from './venueConfig'

describe('buildSeedSql', () => {
  const venue = generateVenue(venueConfig)

  it('matches supabase/seed.sql, so the map and the database agree (run `npm run db:seed` if not)', () => {
    expect(seedFile).toBe(buildSeedSql(venue))
  })

  it('writes every seat with its tier and price in cents', () => {
    const sql = buildSeedSql(venue)
    expect(sql.match(/^ {2}\('/gm)).toHaveLength(venue.seats.length)
    expect(sql).toContain("('A-1-1', 'A', 1, 1, 'ringside', 8500)")
    expect(sql).toContain("('D-8-15', 'D', 8, 15, 'gallery', 2500)")
  })
})
