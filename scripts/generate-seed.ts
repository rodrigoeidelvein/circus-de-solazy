import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { generateVenue } from '../src/venue/generateVenue'
import { buildSeedSql } from '../src/venue/seedSql'
import { venueConfig } from '../src/venue/venueConfig'

const target = fileURLToPath(new URL('../supabase/seed.sql', import.meta.url))
const venue = generateVenue(venueConfig)
writeFileSync(target, buildSeedSql(venue))
console.log(`Wrote ${venue.seats.length} seats to supabase/seed.sql`)
