# Circus du SoLazy

Seat reservation app for the Circus du SoLazy — think cinema seat picking, but under the big top.

## Stack

- [Vite](https://vite.dev/) + [React](https://react.dev/) + TypeScript
- [oxlint](https://oxc.rs/) for linting
- [Vitest](https://vitest.dev/) for unit tests

## Getting started

```sh
npm install
npm run dev      # start the dev server
npm run build    # type-check and build for production
npm run preview  # preview the production build
npm run lint     # lint the codebase
npm test         # run unit tests
```

## Seat map

The venue is generated from `src/venue/venueConfig.ts` by the pure `generateVenue()`
(`src/venue/generateVenue.ts`), which positions seats with polar coordinates around the ring.
Live seat status comes from the database (`useSeatAvailability`, see below). Selection state
lives in a reducer (`src/state/selection.ts`) wrapped by the `useSeatSelection` hook.

## Booking and payments

```
React app ──supabase-js──▶ Postgres        (read-only: seat availability + Realtime)
    └──functions.invoke──▶ Edge Functions ──▶ JustiFi API
                                ▲
                  JustiFi webhooks → justifi-webhook
```

- **Postgres is the source of truth** for seats, prices and holds (`supabase/migrations/`).
  `hold_seats`, `verify_booking`, `confirm_booking` and `release_booking` are
  `SECURITY DEFINER` functions callable only with the secret key, so each step is atomic.
  A `pg_cron` job expires overdue holds every minute.
- **The browser can read three columns of `seat_locks`** (`seat_id`, `status`, `expires_at`)
  and nothing else. Realtime respects the same column grant.
- **Edge Functions** (`supabase/functions/`) hold the JustiFi secrets and do all writes:
  `create-booking`, `verify-booking` (the payment form's `preCompleteHook`), `booking-status`
  (it polls JustiFi, so payments confirm even without webhooks), `cancel-booking` and
  `justifi-webhook`.
- **Frontend:** `useBooking` drives `src/state/booking.ts`
  (selecting → holding → paying → confirming → confirmed | failed | expired). `{bookingId, secret}`
  is kept in `sessionStorage`, so a refresh during payment resumes. `<justifi-checkout>` is
  lazy-loaded.
- **Late payments:** a payment that lands after its hold lapsed is kept if the seats are still
  free. Otherwise it is refunded and the booking is flagged (`bookings.flag`).

### Local setup

Needs Docker. The Supabase CLI and Deno are dev dependencies.

```sh
npm run db:start                  # Postgres, Realtime, Edge runtime in Docker; prints the keys
cp .env.example .env.local        # set VITE_SUPABASE_ANON_KEY to the printed publishable key
cp supabase/functions/.env.example supabase/functions/.env   # JustiFi sandbox credentials
npm run functions:serve           # serve the Edge Functions locally
npm run dev
```

Sandbox card: `4242 4242 4242 4242`. Decline: `4000 0000 0000 0002`.

### Tests

```sh
npm test                # Vitest: reducers, availability, seed-matches-config
npm run db:test         # pgTAP: hold_seats races, expiry reuse, limits, prices, late payments, access
npm run functions:test  # Deno: JustiFi client (mocked network), settlement, webhook signatures
```

### Seats

`npm run db:seed` regenerates `supabase/seed.sql` from `venueConfig`. A test fails if you change
the venue and forget to run it.

### Deploy

```sh
supabase link --project-ref <ref>
supabase db push --include-seed
supabase secrets set JUSTIFI_CLIENT_ID=… JUSTIFI_CLIENT_SECRET=… JUSTIFI_SUB_ACCOUNT=… JUSTIFI_WEBHOOK_SECRET=…
supabase functions deploy                                   # justifi-webhook: verify_jwt = false (config.toml)
```

Then register `https://<ref>.supabase.co/functions/v1/justifi-webhook` in JustiFi for
`checkout.completed`. Free projects pause after about 7 days idle, and a paused project drops
webhooks, so wake it before demos.
