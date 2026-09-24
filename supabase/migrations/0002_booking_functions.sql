-- Booking logic. Each function runs in a single transaction, so holds are
-- atomic. They're SECURITY DEFINER and callable only with the secret key
-- (service_role): the browser goes through Edge Functions.

-- Expires pending bookings whose hold has run out and frees their seats.
-- With seat_ids, only bookings holding one of those seats are touched (used to
-- clear the way before a hold); without, it sweeps everything (the cron job).
create function public.expire_bookings(seat_ids text[] default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count int;
begin
  with expired as (
    update public.bookings b
       set status = 'expired'
     where b.status = 'pending'
       and b.expires_at <= now()
       and (expire_bookings.seat_ids is null or exists (
             select 1 from public.seat_locks l
              where l.booking_id = b.id and l.seat_id = any (expire_bookings.seat_ids)))
    returning b.id
  )
  delete from public.seat_locks l
   using expired e
   where l.booking_id = e.id and l.status = 'held';
  get diagnostics expired_count = row_count;

  -- Held locks can only outlive their booking through a bug, but never let
  -- one block a seat forever.
  if expire_bookings.seat_ids is null then
    delete from public.seat_locks where status = 'held' and expires_at <= now();
  end if;

  return expired_count;
end;
$$;

-- Holds 1–8 seats for a new pending booking. Raises `seats_taken` (detail: a
-- JSON array of seat ids) if any seat is already held or sold.
create function public.hold_seats(seat_ids text[], email text, ttl interval default '10 minutes')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted   text[];
  missing  text[];
  taken    text[];
  inserted int;
  booking  public.bookings;
begin
  select coalesce(array_agg(distinct s order by s), '{}') into wanted
    from unnest(hold_seats.seat_ids) s;

  if cardinality(wanted) not between 1 and 8 then
    raise exception 'invalid_seat_count'
      using errcode = '22023', detail = format('Book between 1 and 8 seats, got %s.', cardinality(wanted));
  end if;
  if hold_seats.email is null or hold_seats.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if hold_seats.ttl not between interval '1 minute' and interval '30 minutes' then
    raise exception 'invalid_ttl' using errcode = '22023';
  end if;

  select array_agg(w order by w) into missing
    from unnest(wanted) w
   where not exists (select 1 from public.seats where id = w);
  if missing is not null then
    raise exception 'unknown_seats' using errcode = '22023', detail = array_to_json(missing)::text;
  end if;

  perform public.expire_bookings(wanted);

  insert into public.bookings (email, seat_ids, amount_cents, expires_at)
  select hold_seats.email, wanted, sum(s.price_cents), now() + hold_seats.ttl
    from public.seats s
   where s.id = any (wanted)
  returning * into booking;

  -- A concurrent hold on the same seat waits here for the other transaction,
  -- then skips the row if that one committed.
  insert into public.seat_locks (seat_id, booking_id, status, expires_at)
  select w, booking.id, 'held', booking.expires_at
    from unnest(wanted) w
  on conflict (seat_id) do nothing;
  get diagnostics inserted = row_count;

  if inserted < cardinality(wanted) then
    select array_agg(l.seat_id order by l.seat_id) into taken
      from public.seat_locks l
     where l.seat_id = any (wanted) and l.booking_id <> booking.id;
    -- Rolls back the booking and the locks that did go in.
    raise exception 'seats_taken' using detail = array_to_json(taken)::text;
  end if;

  return jsonb_build_object(
    'booking_id',   booking.id,
    'secret',       booking.secret,
    'amount_cents', booking.amount_cents,
    'expires_at',   booking.expires_at
  );
end;
$$;

-- Checks a pending booking still holds all its seats, just before the card is
-- charged, and extends the hold so it can't lapse mid-payment.
create function public.verify_booking(booking_id uuid, extend interval default '2 minutes')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking public.bookings;
  held    int;
begin
  select * into booking from public.bookings b where b.id = verify_booking.booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if booking.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', booking.status);
  end if;

  select count(*) into held
    from public.seat_locks l
   where l.booking_id = booking.id and l.status = 'held' and l.expires_at > now();
  if booking.expires_at <= now() or held <> cardinality(booking.seat_ids) then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  update public.bookings b
     set expires_at = greatest(b.expires_at, now() + verify_booking.extend)
   where b.id = booking.id
  returning * into booking;
  update public.seat_locks l set expires_at = booking.expires_at where l.booking_id = booking.id;

  return jsonb_build_object('ok', true, 'expires_at', booking.expires_at);
end;
$$;

-- Records a successful payment. Safe to call repeatedly (webhook retries,
-- status polling). Outcomes:
--   paid / already_paid  the seats are the buyer's
--   conflict             the payment landed after the hold lapsed and someone
--                        else took a seat: the caller must refund
--   already_refunded     a previous call hit the conflict and refunded
create function public.confirm_booking(checkout_id text, payment_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking public.bookings;
  claimed int;
begin
  select * into booking from public.bookings b where b.checkout_id = confirm_booking.checkout_id for update;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;

  if booking.status = 'paid' then
    return jsonb_build_object('booking_id', booking.id, 'status', 'paid', 'outcome', 'already_paid');
  elsif booking.status = 'refunded' then
    return jsonb_build_object('booking_id', booking.id, 'status', 'refunded', 'outcome', 'already_refunded');
  end if;

  -- Pending, or expired/cancelled with money taken anyway: claim the seats if
  -- they're still ours or free. A lapsed hold of another booking counts as free.
  begin
    insert into public.seat_locks (seat_id, booking_id, status, expires_at)
    select s, booking.id, 'sold', null
      from unnest(booking.seat_ids) s
    on conflict (seat_id) do update
       set booking_id = excluded.booking_id, status = 'sold', expires_at = null
     where public.seat_locks.booking_id = excluded.booking_id
        or (public.seat_locks.status = 'held' and public.seat_locks.expires_at <= now());
    get diagnostics claimed = row_count;

    if claimed < cardinality(booking.seat_ids) then
      raise exception 'seats_taken';
    end if;
  exception when raise_exception then
    -- Undo the partial claim (this block is a savepoint) and flag for a refund.
    update public.bookings b
       set payment_id = coalesce(confirm_booking.payment_id, b.payment_id),
           flag = 'refund_required: paid after the hold lapsed and a seat was resold'
     where b.id = booking.id;
    return jsonb_build_object('booking_id', booking.id, 'status', booking.status, 'outcome', 'conflict');
  end;

  update public.bookings b
     set status = 'paid',
         paid_at = now(),
         payment_id = coalesce(confirm_booking.payment_id, b.payment_id),
         flag = null
   where b.id = booking.id;

  return jsonb_build_object('booking_id', booking.id, 'status', 'paid', 'outcome', 'paid');
end;
$$;

-- Marks a conflicted booking refunded once the refund went through.
create function public.mark_refunded(booking_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.bookings b
     set status = 'refunded',
         flag = 'refunded: paid after the hold lapsed and a seat was resold'
   where b.id = mark_refunded.booking_id and b.status <> 'paid';
$$;

-- Ends a pending booking (expired or cancelled) and frees its held seats.
-- Returns the booking's resulting status; paid bookings are left alone.
create function public.release_booking(booking_id uuid, status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  result text;
begin
  if release_booking.status not in ('expired', 'cancelled') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  update public.bookings b
     set status = release_booking.status
   where b.id = release_booking.booking_id and b.status = 'pending';

  delete from public.seat_locks l
   where l.booking_id = release_booking.booking_id and l.status = 'held';

  select b.status into result from public.bookings b where b.id = release_booking.booking_id;
  return result;
end;
$$;

revoke execute on function
  public.expire_bookings(text[]),
  public.hold_seats(text[], text, interval),
  public.verify_booking(uuid, interval),
  public.confirm_booking(text, text),
  public.mark_refunded(uuid),
  public.release_booking(uuid, text)
  from public, anon, authenticated;

grant execute on function
  public.expire_bookings(text[]),
  public.hold_seats(text[], text, interval),
  public.verify_booking(uuid, interval),
  public.confirm_booking(text, text),
  public.mark_refunded(uuid),
  public.release_booking(uuid, text)
  to service_role;

-- Every minute, expire overdue bookings so their seats show as free again.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('expire-bookings', '* * * * *', $$select public.expire_bookings()$$);
