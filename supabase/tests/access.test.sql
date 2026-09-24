begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

-- Start from no bookings (rolled back at the end).
delete from public.bookings;

select plan(9);

select public.hold_seats(array['A-2-1'], 'ann@example.com');

set local role anon;

select is((select count(*)::int from seat_locks), 1, 'anon can see seat availability');
select lives_ok($$select seat_id, status, expires_at from public.seat_locks$$, 'anon can read the public columns');
select throws_ok($$select booking_id from public.seat_locks$$, '42501', null, 'anon cannot read which booking holds a seat');
select throws_ok($$select * from public.bookings$$, '42501', null, 'anon cannot read bookings');
select throws_ok($$select * from public.seats$$, '42501', null, 'anon cannot read the seats table');
select throws_ok($$delete from public.seat_locks$$, '42501', null, 'anon cannot free seats');
select throws_ok($$insert into public.seat_locks (seat_id, booking_id, status) values ('A-1-1', gen_random_uuid(), 'sold')$$,
  '42501', null, 'anon cannot lock seats');
select throws_ok($$select public.hold_seats(array['A-1-1'], 'x@example.com')$$, '42501', null, 'anon cannot call hold_seats');

reset role;
set local role authenticated;
select throws_ok($$select public.confirm_booking('cho_x')$$, '42501', null, 'authenticated cannot call confirm_booking');

select * from finish();
rollback;
