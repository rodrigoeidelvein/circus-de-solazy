begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

-- Start from no bookings (rolled back at the end).
delete from public.bookings;

select plan(26);

-- Price sum: ringside A-1-1 (8500) + gallery A-6-1 (2500).
create temp table first_hold as
  select public.hold_seats(array['A-1-1', 'A-6-1'], 'ann@example.com') as r;

select is((select (r ->> 'amount_cents')::int from first_hold), 11000, 'amount is the sum of seat prices');
select isnt((select r ->> 'secret' from first_hold), null, 'returns the booking secret');
select ok((select (r ->> 'expires_at')::timestamptz from first_hold) > now() + interval '9 minutes',
  'hold lasts the default 10 minutes');
select is((select status from bookings where id = (select (r ->> 'booking_id')::uuid from first_hold)), 'pending',
  'booking starts pending');
select is((select count(*)::int from seat_locks where status = 'held'), 2, 'both seats are held');

-- Two bookings grabbing the same seats.
select throws_ok(
  $$select public.hold_seats(array['A-6-1', 'A-6-2'], 'bob@example.com')$$,
  'P0001', 'seats_taken', 'a second booking cannot take a held seat');
select is((select count(*)::int from bookings), 1, 'the failed booking is rolled back');
select is((select count(*)::int from seat_locks where seat_id = 'A-6-2'), 0,
  'seats the failed booking did get are rolled back too');

-- The error lists the seats that were taken.
create function pg_temp.taken_detail(ids text[]) returns text language plpgsql as $$
begin
  perform public.hold_seats(ids, 'bob@example.com');
  return null;
exception when raise_exception then
  declare d text;
  begin
    get stacked diagnostics d = pg_exception_detail;
    return d;
  end;
end $$;
select is(pg_temp.taken_detail(array['A-6-2', 'A-1-1', 'A-6-1']), '["A-1-1","A-6-1"]', 'error detail lists the taken seats');

select lives_ok($$select public.hold_seats(array['A-6-2'], 'bob@example.com')$$, 'a free seat can still be held');

-- Duplicate ids count once.
select is((public.hold_seats(array['B-1-1', 'B-1-1'], 'cy@example.com') ->> 'amount_cents')::int, 8500,
  'duplicate seat ids are held once');

-- Seat limit and validation.
select throws_ok(
  $$select public.hold_seats(array['C-8-1','C-8-2','C-8-3','C-8-4','C-8-5','C-8-6','C-8-7','C-8-8','C-8-9'], 'dee@example.com')$$,
  '22023', 'invalid_seat_count', 'more than 8 seats is rejected');
select lives_ok(
  $$select public.hold_seats(array['C-8-1','C-8-2','C-8-3','C-8-4','C-8-5','C-8-6','C-8-7','C-8-8'], 'dee@example.com')$$,
  'exactly 8 seats is allowed');
select throws_ok($$select public.hold_seats(array[]::text[], 'dee@example.com')$$,
  '22023', 'invalid_seat_count', 'zero seats is rejected');
select throws_ok($$select public.hold_seats(array['Z-9-9'], 'dee@example.com')$$,
  '22023', 'unknown_seats', 'unknown seats are rejected');
select throws_ok($$select public.hold_seats(array['D-1-1'], 'not-an-email')$$,
  '22023', 'invalid_email', 'a bad email is rejected');

-- Expired holds are reused, and the lapsed booking is expired with all its seats freed.
update bookings set expires_at = now() - interval '1 second'
  where id = (select (r ->> 'booking_id')::uuid from first_hold);
update seat_locks set expires_at = now() - interval '1 second'
  where booking_id = (select (r ->> 'booking_id')::uuid from first_hold);

select lives_ok($$select public.hold_seats(array['A-1-1'], 'eve@example.com')$$, 'an expired hold can be taken over');
select is((select status from bookings where id = (select (r ->> 'booking_id')::uuid from first_hold)), 'expired',
  'the lapsed booking is marked expired');
select is((select count(*)::int from seat_locks where seat_id = 'A-6-1'), 0,
  'the lapsed booking''s other seats are freed too');

-- verify_booking extends a live hold and refuses a lapsed one.
select is((public.verify_booking((select (r ->> 'booking_id')::uuid from first_hold)) ->> 'reason'), 'expired',
  'verify refuses an expired booking');

create temp table eve as
  select id from bookings where email = 'eve@example.com';
update bookings set expires_at = now() + interval '30 seconds' where id = (select id from eve);
update seat_locks set expires_at = now() + interval '30 seconds' where booking_id = (select id from eve);
select ok((public.verify_booking((select id from eve)) ->> 'ok')::boolean, 'verify accepts a live booking');
select ok((select expires_at from seat_locks where booking_id = (select id from eve)) > now() + interval '1 minute',
  'verify extends the hold');

-- confirm_booking is idempotent.
update bookings set checkout_id = 'cho_eve' where id = (select id from eve);
select is(public.confirm_booking('cho_eve', 'py_1') ->> 'outcome', 'paid', 'confirm marks the booking paid');
select is(public.confirm_booking('cho_eve', 'py_1') ->> 'outcome', 'already_paid', 'confirming twice is harmless');

-- release_booking frees held seats but never un-sells.
select is(public.release_booking((select id from eve), 'cancelled'), 'paid', 'a paid booking cannot be released');

-- The cron sweep.
update bookings set expires_at = now() - interval '1 second' where email = 'bob@example.com';
update seat_locks set expires_at = now() - interval '1 second'
  where booking_id in (select id from bookings where email = 'bob@example.com');
select is(public.expire_bookings(), 1, 'the sweep frees seats of overdue bookings');

select * from finish();
rollback;
