begin;
create function pg_temp.expect_error(p_sql text,p_code text) returns void language plpgsql as $$
declare actual text;
begin
  begin execute p_sql; exception when others then get stacked diagnostics actual = returned_sqlstate; end;
  if actual is distinct from p_code then raise exception 'Expected %, got %: %',p_code,coalesce(actual,'success'),p_sql; end if;
end;
$$;
insert into auth.users(id)
select ('d3000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid from generate_series(1,11) n;
insert into public.profiles(id,display_name,gender,gender_preferences,location,date_of_birth,time_of_birth,birth_place,birth_latitude,birth_longitude,birth_timezone,created_at)
select id,'Discovery ' || n,
 case when n in (1,4) then 'Male' when n = 5 then 'Non - Binary' else 'Female' end,
 case when n = 1 then array['Female'] when n = 3 then array['Female'] when n = 6 then array[]::text[] else array['Male'] end,
 'Mumbai','1995-02-09','00:00:00','Mumbai',19,72,'Asia/Kolkata','2026-01-01'
from generate_series(1,11) n join auth.users on id = ('d3000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
insert into public.kundlis(user_id,raw_response,input_revision)
select id,'{}',birth_details_revision from public.profiles where display_name like 'Discovery %';
insert into public.profile_photos(user_id,storage_path,sort_order)
select p.id,p.id::text || '/fixture-' || n || '.jpg',n-1 from public.profiles p cross join generate_series(1,4) n
where p.display_name like 'Discovery %';
update public.profiles set onboarding_completed = true where display_name like 'Discovery %' and display_name <> 'Discovery 11';
insert into public.discovery_passes(user_id,passed_user_id) values ('d3000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000007');
insert into public.user_blocks(blocker_id,blocked_id) values ('d3000000-0000-4000-8000-000000000008','d3000000-0000-4000-8000-000000000001');
update public.profiles set is_discoverable = false where display_name = 'Discovery 9';
insert into public.likes(id,from_user_id,to_user_id,opening_message) values
 ('d3100000-0000-4000-8000-000000000010','d3000000-0000-4000-8000-000000000010','d3000000-0000-4000-8000-000000000001','Hello');

set local role authenticated;
select set_config('request.jwt.claim.sub','d3000000-0000-4000-8000-000000000001',true);
do $$ begin
 assert (select array_agg(display_name) from public.get_discover_profiles()) = array['Discovery 2'], 'Feed ignored preferences, privacy, passes or existing likes';
 assert (select array_agg(display_name) from public.get_skipped_profiles()) = array['Discovery 7'], 'Skipped profiles were not separately queryable';
 assert (select count(*) from public.get_incoming_likes() where read_at is null) = 1, 'New like should be unread';
end $$;
select public.mark_incoming_likes_read(array['d3100000-0000-4000-8000-000000000010']::uuid[]);
select set_config('test.first_read',(select read_at::text from public.get_incoming_likes()),true);
select public.mark_incoming_likes_read(array['d3100000-0000-4000-8000-000000000010']::uuid[]);
do $$ begin assert (select read_at::text from public.get_incoming_likes()) = current_setting('test.first_read'), 'Read timestamp changed on repeat'; end $$;

-- Server-side patches preserve other switches, including a privacy change between notifications.
select public.update_settings_fields('{"notify_likes":false}');
select public.update_settings_fields('{"profile_discoverable":false}');
select public.update_settings_fields('{"notify_messages":false}');
do $$ begin
 assert (select not notify_likes and not notify_messages and notify_matches and not profile_discoverable from public.user_settings), 'A settings patch overwrote another switch';
 assert (select not is_discoverable from public.profiles), 'Privacy patch did not reach public visibility';
end $$;
select pg_temp.expect_error($q$select public.update_settings_fields('{"user_id":"d3000000-0000-4000-8000-000000000002"}')$q$,'22023');
select pg_temp.expect_error($q$select public.update_settings_fields('{"notify_likes":null}')$q$,'22023');
select pg_temp.expect_error($q$select public.update_settings_fields('{"notify_likes":"false"}')$q$,'22023');
select pg_temp.expect_error($q$update public.user_settings set notify_likes = true$q$,'42501');
select pg_temp.expect_error($q$select public.update_settings_fields('{"notify_likes":true}','d3000000-0000-4000-8000-000000000002')$q$,'42501');
select public.register_push_token_for_session('ExpoPushToken[this-device]','ios','expo','2026-10-17T00:00:00Z',auth.uid());
select pg_temp.expect_error($q$select public.register_push_token_for_session('ExpoPushToken[wrong-account]','ios','expo',now(),'d3000000-0000-4000-8000-000000000002')$q$,'42501');
do $$ begin assert (select count(*) from public.push_tokens) = 1, 'Push registration crossed an account boundary'; end $$;
select public.retire_own_push_registration('ExpoPushToken[this-device]','2026-10-16T00:00:00Z',auth.uid());
do $$ begin assert (select count(*) from public.push_tokens) = 1, 'Old retirement removed a new registration'; end $$;
select pg_temp.expect_error($q$select public.retire_own_push_registration('ExpoPushToken[this-device]',null,'d3000000-0000-4000-8000-000000000002')$q$,'42501');
select public.retire_own_push_registration('ExpoPushToken[this-device]','2026-10-17T00:00:00Z',auth.uid());
do $$ begin assert (select count(*) from public.push_tokens) = 0, 'Matching installation was not retired'; end $$;

-- A sender cannot mark their own outgoing like read on the recipient's behalf.
select set_config('request.jwt.claim.sub','d3000000-0000-4000-8000-000000000010',true);
reset role;
insert into public.likes(id,from_user_id,to_user_id,opening_message) values
 ('d3100000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000010','d3000000-0000-4000-8000-000000000002','New arrival');
set local role authenticated;
select public.mark_incoming_likes_read(array['d3100000-0000-4000-8000-000000000002']::uuid[]);
reset role;
do $$ begin assert (select read_at is null from public.likes where id = 'd3100000-0000-4000-8000-000000000002'), 'Sender forged read state'; end $$;

-- Everyone/non-binary labels and deterministic cursors work even with identical timestamps.
update public.profiles set gender_preferences = array['Everyone'] where display_name = 'Discovery 1';
set local role authenticated;
select set_config('request.jwt.claim.sub','d3000000-0000-4000-8000-000000000001',true);
do $$ begin
 assert exists(select 1 from public.get_discover_profiles() where display_name = 'Discovery 5'), 'Everyone omitted non-binary people';
end $$;
select public.update_profile_fields('{"gender_preferences":["Non - Binary People"]}',(select updated_at from public.profiles));
do $$ begin assert (select array_agg(display_name) from public.get_discover_profiles()) = array['Discovery 5'], 'Non-binary label normalization failed'; end $$;
select public.update_profile_fields('{"gender_preferences":["Everyone"]}',(select updated_at from public.profiles));
insert into public.discovery_passes(user_id,passed_user_id) values
 ('d3000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000005'),
 ('d3000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000002');
do $$ begin
 assert (select array_agg(display_name) from public.get_skipped_profiles(1)) = array['Discovery 7'], 'First skipped page incorrect';
 assert (select array_agg(display_name) from public.get_skipped_profiles(1,'2026-01-01','d3000000-0000-4000-8000-000000000007')) = array['Discovery 5'], 'Skipped cursor lost equal-timestamp profiles';
 assert (select array_agg(display_name) from public.get_skipped_profiles(1,'2026-01-01','d3000000-0000-4000-8000-000000000005')) = array['Discovery 2'], 'Skipped cursor repeated a profile';
end $$;

-- Returning legacy profiles can remain signed in; new completion needs a current city.
select set_config('request.jwt.claim.sub','d3000000-0000-4000-8000-000000000011',true);
select public.update_profile_fields('{"location":""}',(select updated_at from public.profiles));
select pg_temp.expect_error($q$select public.update_profile_fields('{}',(select updated_at from public.profiles),true)$q$,'22023');
select public.update_profile_fields('{"location":"Pune"}',(select updated_at from public.profiles),true);
do $$ begin assert (select onboarding_completed and location = 'Pune' from public.profiles), 'Explicit current city was not saved'; end $$;
reset role;
set local role anon;
select pg_temp.expect_error($q$select public.get_skipped_profiles()$q$,'42501');
select pg_temp.expect_error($q$select public.update_settings_fields('{}')$q$,'42501');
select pg_temp.expect_error($q$select public.mark_incoming_likes_read(array[]::uuid[])$q$,'42501');
reset role;
rollback;
