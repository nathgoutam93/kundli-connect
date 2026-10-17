-- Run against a local database with the migrations applied. No production data is retained.
-- profile_cards with the inline block check behaves exactly like the is_blocked_with() version.
begin;

insert into auth.users (id) values
  ('a2000000-0000-4000-8000-000000000001'), ('b2000000-0000-4000-8000-000000000002'),
  ('c2000000-0000-4000-8000-000000000003');
insert into public.profiles (id, display_name, gender, gender_preferences, date_of_birth, time_of_birth,
  birth_place, birth_latitude, birth_longitude, birth_timezone)
select id, 'Perf test', 'Female', array['Everyone'], '1995-02-09', '00:00:00', 'Mumbai', 19.076, 72.8777, 'Asia/Kolkata'
from auth.users where id in ('a2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002',
  'c2000000-0000-4000-8000-000000000003');
insert into public.kundlis(user_id, raw_response, input_revision)
select id, '{}'::jsonb, birth_details_revision from public.profiles where display_name = 'Perf test';
insert into public.profile_photos(user_id, storage_path, sort_order)
select p.id, p.id::text || '/fixture-' || n || '.jpg', n - 1 from public.profiles p cross join generate_series(1, 4) n
where p.display_name = 'Perf test';
update public.profiles set location = 'Mumbai', onboarding_completed = true where display_name = 'Perf test';

do $$ begin
  assert pg_get_viewdef('public.profile_cards'::regclass) not like '%is_blocked_with%',
    'profile_cards still calls is_blocked_with per row';
  assert to_regclass('public.discovery_passes_passed_user_id_idx') is not null, 'discovery_passes index missing';
  assert to_regclass('public.match_scores_generated_by_idx') is not null, 'match_scores index missing';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
do $$ begin
  assert (select count(*) from public.profile_cards) = 3, 'Own card plus both discoverable cards expected';
end $$;

-- A blocks B: hidden from each other, C unaffected; A still sees their own card.
select public.block_user('b2000000-0000-4000-8000-000000000002');
do $$ begin
  assert not exists (select 1 from public.profile_cards where id = 'b2000000-0000-4000-8000-000000000002'), 'Blocked card visible to blocker';
  assert exists (select 1 from public.profile_cards where id = 'c2000000-0000-4000-8000-000000000003'), 'Unrelated card hidden';
  assert exists (select 1 from public.profile_cards where id = 'a2000000-0000-4000-8000-000000000001'), 'Own card hidden';
end $$;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
do $$ begin
  assert not exists (select 1 from public.profile_cards where id = 'a2000000-0000-4000-8000-000000000001'), 'Blocker card visible to blocked person';
  assert (select count(*) from public.profile_cards) = 2, 'Blocked person should still see self and C';
end $$;

-- Unblocking restores visibility both ways.
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
select public.unblock_user('b2000000-0000-4000-8000-000000000002');
do $$ begin
  assert exists (select 1 from public.profile_cards where id = 'b2000000-0000-4000-8000-000000000002'), 'Unblock did not restore card';
end $$;

-- The view still doesn't expose user_blocks itself.
do $$ declare denied boolean := false; begin
  begin perform 1 from public.user_blocks; exception when insufficient_privilege then denied := true; end;
  assert denied, 'user_blocks readable by clients';
end $$;

reset role;
rollback;
