begin;
create function pg_temp.expect_error(p_sql text,p_code text) returns void language plpgsql as $$
declare actual text;
begin
  begin execute p_sql; exception when others then get stacked diagnostics actual = returned_sqlstate; end;
  if actual is distinct from p_code then raise exception 'Expected %, got %: %',p_code,coalesce(actual,'success'),p_sql; end if;
end;
$$;
insert into auth.users(id) values ('a1000000-0000-4000-8000-000000000001'),('b1000000-0000-4000-8000-000000000002');
insert into public.profiles(id,display_name,date_of_birth,time_of_birth,birth_place,birth_latitude,birth_longitude,birth_timezone)
values ('a1000000-0000-4000-8000-000000000001','Photo owner','1995-02-09','00:00:00','Mumbai',19,72,'Asia/Kolkata'),
 ('b1000000-0000-4000-8000-000000000002','Photo viewer','1995-02-09','00:00:00','Mumbai',19,72,'Asia/Kolkata');
insert into public.kundlis(user_id,raw_response,input_revision)
select id,'{}',birth_details_revision from public.profiles where display_name in ('Photo owner','Photo viewer');
insert into public.profile_photos(user_id,storage_path,sort_order)
select p.id,p.id::text || '/fixture-' || n || '.jpg',n-1 from public.profiles p cross join generate_series(1,4) n
where p.display_name in ('Photo owner','Photo viewer');
insert into storage.objects(bucket_id,name,metadata)
select 'profile-photos',storage_path,'{"size":100,"mimetype":"image/jpeg"}' from public.profile_photos
where user_id in ('a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002');
update public.profiles set location = 'Mumbai', onboarding_completed = true where display_name in ('Photo owner','Photo viewer');

-- An eligible viewer uses the authorized proxy, not raw Storage or reusable signed URLs.
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000002',true);
do $$ begin
  assert public.can_read_profile_photo('a1000000-0000-4000-8000-000000000001/fixture-1.jpg'), 'Eligible viewer denied';
  assert not exists(select 1 from storage.objects where name like 'a1000000%'), 'Viewer can read raw Storage/mint a signed URL';
end $$;
select public.block_user('a1000000-0000-4000-8000-000000000001');
do $$ begin assert not public.can_read_profile_photo('a1000000-0000-4000-8000-000000000001/fixture-1.jpg'), 'Block did not deny photo'; end $$;
select public.unblock_user('a1000000-0000-4000-8000-000000000001');
reset role;
update public.profiles set is_discoverable = false where id = 'a1000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin assert not public.can_read_profile_photo('a1000000-0000-4000-8000-000000000001/fixture-1.jpg'), 'Hidden profile photo exposed'; end $$;
reset role;
update public.profiles set is_discoverable = true,suspended_at = now() where id = 'a1000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin assert not public.can_read_profile_photo('a1000000-0000-4000-8000-000000000001/fixture-1.jpg'), 'Suspended profile photo exposed'; end $$;
reset role;
update public.profiles set suspended_at = null where id = 'a1000000-0000-4000-8000-000000000001';
set local role anon;
select pg_temp.expect_error($q$select public.can_read_profile_photo('a1000000-0000-4000-8000-000000000001/fixture-1.jpg')$q$,'42501');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error($q$select public.remove_profile_photo('a1000000-0000-4000-8000-000000000001/fixture-1.jpg')$q$,'22023');
select pg_temp.expect_error($q$delete from public.profile_photos where user_id = auth.uid()$q$,'42501');
-- A raw Storage deletion cannot bypass the minimum, even by the owner.
delete from storage.objects where name = 'a1000000-0000-4000-8000-000000000001/fixture-1.jpg';
do $$ begin assert exists(select 1 from storage.objects where name = 'a1000000-0000-4000-8000-000000000001/fixture-1.jpg'), 'Raw Storage bypassed minimum'; end $$;
select public.reserve_profile_photo('c1000000-0000-4000-8000-000000000001');
select public.reserve_profile_photo('c1000000-0000-4000-8000-000000000002');
select pg_temp.expect_error($q$select public.reserve_profile_photo('c1000000-0000-4000-8000-000000000003')$q$,'22023');
select pg_temp.expect_error($q$insert into storage.objects(bucket_id,name) values ('profile-photos','a1000000-0000-4000-8000-000000000001/unreserved.jpg')$q$,'42501');
insert into storage.objects(bucket_id,name,metadata) values
 ('profile-photos','a1000000-0000-4000-8000-000000000001/c1000000-0000-4000-8000-000000000001.jpg','{"size":100,"mimetype":"image/jpeg"}'),
 ('profile-photos','a1000000-0000-4000-8000-000000000001/c1000000-0000-4000-8000-000000000002.jpg','{"size":100,"mimetype":"image/jpeg"}');
select public.commit_profile_photo('c1000000-0000-4000-8000-000000000001');
select public.commit_profile_photo('c1000000-0000-4000-8000-000000000001');
select public.commit_profile_photo('c1000000-0000-4000-8000-000000000002');
do $$ begin
 assert (select count(*) from public.profile_photos) = 6, 'Retry duplicated registered photos';
 assert not public.cancel_profile_photo('c1000000-0000-4000-8000-000000000001'), 'A cancellation removed a completed upload';
end $$;
-- Replacement works at six and preserves sort order/count; a second concurrent replacement is rejected.
select public.reserve_profile_photo('d1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001/fixture-1.jpg');
select pg_temp.expect_error($q$select public.reserve_profile_photo('d1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001/fixture-2.jpg')$q$,'22023');
insert into storage.objects(bucket_id,name,metadata) values ('profile-photos','a1000000-0000-4000-8000-000000000001/d1000000-0000-4000-8000-000000000001.jpg','{"size":100,"mimetype":"image/jpeg"}');
select public.commit_profile_photo('d1000000-0000-4000-8000-000000000001');
do $$ begin
 assert (select count(*) from public.profile_photos) = 6, 'Replacement changed count';
 assert (select sort_order from public.profile_photos where storage_path like '%d1000000%') = 0, 'Replacement lost position';
 assert public.can_delete_profile_photo_object('a1000000-0000-4000-8000-000000000001/fixture-1.jpg'), 'Retired object not queued';
end $$;
select pg_temp.expect_error($q$select public.reorder_profile_photos(array['a1000000-0000-4000-8000-000000000001/fixture-2.jpg'])$q$,'22023');
select public.remove_profile_photo('a1000000-0000-4000-8000-000000000001/c1000000-0000-4000-8000-000000000001.jpg');
select public.remove_profile_photo('a1000000-0000-4000-8000-000000000001/c1000000-0000-4000-8000-000000000002.jpg');
select pg_temp.expect_error($q$select public.remove_profile_photo('a1000000-0000-4000-8000-000000000001/fixture-2.jpg')$q$,'22023');
select pg_temp.expect_error($q$select public.commit_profile_photo('c1000000-0000-4000-8000-000000000001')$q$,'22023');

-- Real reports are scoped to the requesting pair, including a valid zero result.
do $$ begin assert (select compatibility_report is null from public.profile_cards where id='b1000000-0000-4000-8000-000000000002'), 'Absent report was invented'; end $$;
reset role;
insert into public.match_scores(user_a_id,user_b_id,compatibility_score,compatibility_report) values
 ('a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002',0,
 '{"id":"real-zero","generatedAt":"2026-10-16T00:00:00Z","overallScore":0,"breakdown":[],"yogas":[],"doshas":[]}');
insert into public.user_subscriptions(user_id,plan_id,status,renewal_date) values
 ('a1000000-0000-4000-8000-000000000001','plus-monthly','active',now()-interval '1 day');
set local role authenticated;
do $$ begin
 assert (select compatibility_report->>'overallScore' from public.profile_cards where id='b1000000-0000-4000-8000-000000000002') = '0', 'Real zero report lost';
 assert public.get_effective_subscription()->>'status' = 'expired', 'Expired plan shown as active';
 assert not exists(select 1 from public.subscription_plans where features::text ~ 'Priority likes inbox|Advanced compatibility reports|Profile boost every week'), 'Unsupported plan claims remain';
end $$;
reset role;
update public.user_subscriptions set renewal_date = now()+interval '1 hour' where user_id='a1000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin assert public.get_effective_subscription()->>'status' = 'active', 'Future active plan denied'; end $$;
reset role;
-- Worker sees retired paths only, and expired reservations cannot subsequently commit.
select public.reserve_profile_photo('e1000000-0000-4000-8000-000000000001');
update public.photo_uploads set expires_at = now()-interval '1 second' where id='e1000000-0000-4000-8000-000000000001';
select * from public.get_photo_cleanup();
select pg_temp.expect_error($q$select public.commit_profile_photo('e1000000-0000-4000-8000-000000000001')$q$,'22023');
do $$ begin assert not exists(select 1 from public.photo_cleanup_queue q join public.profile_photos p using(storage_path)), 'Worker may delete an active photo'; end $$;
select public.reserve_profile_photo('f1000000-0000-4000-8000-000000000001');
do $$ begin assert public.cancel_profile_photo('f1000000-0000-4000-8000-000000000001'), 'Local failure did not free its slot'; end $$;
select pg_temp.expect_error($q$select public.commit_profile_photo('f1000000-0000-4000-8000-000000000001')$q$,'22023');
rollback;
