begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

-- Start from no bookings (rolled back at the end).
delete from public.bookings;

select plan(7);

-- A booking whose hold lapsed before the payment landed.
create temp table late as
  select (public.hold_seats(array['B-2-1', 'B-2-2'], 'late@example.com') ->> 'booking_id')::uuid as id;
update bookings set checkout_id = 'cho_late' where id = (select id from late);
select public.release_booking((select id from late), 'expired');

select is(public.confirm_booking('cho_late', 'py_late') ->> 'outcome', 'paid',
  'a late payment is confirmed when its seats are still free');
select is((select count(*)::int from seat_locks where booking_id = (select id from late) and status = 'sold'), 2,
  'and its seats are sold');

-- Same, but someone else took one of the seats in the meantime.
create temp table unlucky as
  select (public.hold_seats(array['B-3-1', 'B-3-2'], 'unlucky@example.com') ->> 'booking_id')::uuid as id;
update bookings set checkout_id = 'cho_unlucky' where id = (select id from unlucky);
select public.release_booking((select id from unlucky), 'expired');
select public.hold_seats(array['B-3-2'], 'quick@example.com');

select is(public.confirm_booking('cho_unlucky', 'py_unlucky') ->> 'outcome', 'conflict',
  'a late payment whose seat was resold is a conflict');
select is((select count(*)::int from seat_locks where booking_id = (select id from unlucky)), 0,
  'the conflicted booking claims no seats, not even the free one');
select matches((select flag from bookings where id = (select id from unlucky)), '^refund_required',
  'the booking is flagged for a refund');
select is((select payment_id from bookings where id = (select id from unlucky)), 'py_unlucky', 'the payment id is kept for the refund');

select public.mark_refunded((select id from unlucky));
select is(public.confirm_booking('cho_unlucky') ->> 'outcome', 'already_refunded', 'after refunding, confirming again is a no-op');

select * from finish();
rollback;
