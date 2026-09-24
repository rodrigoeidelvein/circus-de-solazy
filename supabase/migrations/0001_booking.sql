-- Seats, bookings and seat locks. The database is the source of truth for
-- which seats exist, what they cost and who holds them.

create table public.seats (
  id          text primary key,
  section     text not null,
  row         int  not null check (row > 0),
  number      int  not null check (number > 0),
  tier_id     text not null,
  price_cents int  not null check (price_cents >= 0),
  unique (section, row, number)
);

create table public.bookings (
  id            uuid primary key default gen_random_uuid(),
  -- Only the buyer's browser gets this; it authorises status checks and cancels.
  secret        uuid not null default gen_random_uuid(),
  status        text not null default 'pending'
                check (status in ('pending', 'paid', 'expired', 'cancelled', 'refunded')),
  email         text not null,
  -- Kept on the booking so a late payment can still tell which seats it was for
  -- after its locks were released.
  seat_ids      text[] not null,
  amount_cents  int  not null check (amount_cents >= 0),
  checkout_id   text unique,
  payment_id    text,
  -- Why a booking needs a human to look at it, e.g. a payment that arrived after
  -- its seats were resold and had to be refunded.
  flag          text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  paid_at       timestamptz
);

create index bookings_pending_expiry_idx on public.bookings (expires_at) where status = 'pending';

-- seat_id is the primary key, so a seat can only ever be locked by one booking.
create table public.seat_locks (
  seat_id    text primary key references public.seats,
  booking_id uuid not null references public.bookings on delete cascade,
  status     text not null check (status in ('held', 'sold')),
  -- null once sold
  expires_at timestamptz,
  check ((status = 'held') = (expires_at is not null))
);

create index seat_locks_booking_idx on public.seat_locks (booking_id);

-- Webhook deliveries already processed, so retries are no-ops.
create table public.webhook_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);

-- Access rules --------------------------------------------------------------
-- Everything is locked down. The browser may read three columns of seat_locks
-- (enough to colour the map) and nothing else; all writes go through Edge
-- Functions using the secret key.

alter table public.seats          enable row level security;
alter table public.bookings       enable row level security;
alter table public.seat_locks     enable row level security;
alter table public.webhook_events enable row level security;

revoke all on public.seats, public.bookings, public.seat_locks, public.webhook_events
  from anon, authenticated;

grant select (seat_id, status, expires_at) on public.seat_locks to anon, authenticated;

create policy "Seat availability is public"
  on public.seat_locks for select
  to anon, authenticated
  using (true);

-- Live seat-map updates. Realtime applies the subscriber's RLS policies and
-- column privileges, so browsers only receive seat_id, status and expires_at
-- (checked in supabase/tests/access.test.sql).
alter publication supabase_realtime add table public.seat_locks;
