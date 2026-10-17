-- Run against a local database with the migrations applied. No production data is retained.
begin;

create function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare actual text;
begin
  begin execute p_sql; exception when others then get stacked diagnostics actual = returned_sqlstate; end;
  if actual is distinct from p_code then
    raise exception 'Expected SQLSTATE %, got % for %', p_code, coalesce(actual, 'success'), p_sql;
  end if;
end;
$$;

-- Safety scenarios are fresh intents; retry-specific receipt cases live in the batch 4 script.
create function pg_temp.reply_to_like(p_like uuid,p_message text) returns jsonb language sql as $$
  select public.reply_to_like_once(p_like,p_message,gen_random_uuid());
$$;
create function pg_temp.send_chat_message(p_chat uuid,p_message text) returns jsonb language sql as $$
  select public.send_chat_message_once(p_chat,p_message,gen_random_uuid());
$$;


insert into auth.users (id) values
  ('aaaa0000-0000-4000-8000-000000000001'), ('bbbb0000-0000-4000-8000-000000000002'),
  ('cccc0000-0000-4000-8000-000000000003'), ('dddd0000-0000-4000-8000-000000000004'),
  ('eeee0000-0000-4000-8000-000000000005'), ('ffff0000-0000-4000-8000-000000000006');
insert into public.profiles (id, display_name, date_of_birth, time_of_birth, birth_place, birth_latitude, birth_longitude, birth_timezone)
select id, 'Safety test', '1995-02-09', '00:00:00', 'Mumbai', 19.076, 72.8777, 'Asia/Kolkata'
from auth.users where id in (
  'aaaa0000-0000-4000-8000-000000000001', 'bbbb0000-0000-4000-8000-000000000002',
  'cccc0000-0000-4000-8000-000000000003', 'dddd0000-0000-4000-8000-000000000004',
  'eeee0000-0000-4000-8000-000000000005', 'ffff0000-0000-4000-8000-000000000006');
insert into public.kundlis(user_id, raw_response, input_revision)
select id, '{}'::jsonb, birth_details_revision from public.profiles where display_name = 'Safety test';
insert into public.profile_photos(user_id,storage_path,sort_order)
select p.id,p.id::text || '/fixture-' || n || '.jpg',n-1 from public.profiles p cross join generate_series(1,4) n
where p.display_name = 'Safety test';
update public.profiles set location = 'Mumbai', onboarding_completed = true where display_name = 'Safety test';
insert into public.credit_transactions(user_id,amount,reason)
select id,5,'Safety test credit' from public.profiles where display_name = 'Safety test';
insert into public.match_scores(user_a_id,user_b_id,compatibility_score) values
 ('aaaa0000-0000-4000-8000-000000000001','bbbb0000-0000-4000-8000-000000000002',80),
 ('cccc0000-0000-4000-8000-000000000003','dddd0000-0000-4000-8000-000000000004',80),
 ('eeee0000-0000-4000-8000-000000000005','ffff0000-0000-4000-8000-000000000006',80);

set local role authenticated;
select set_config('request.jwt.claim.sub','aaaa0000-0000-4000-8000-000000000001',true);
select public.create_like('bbbb0000-0000-4000-8000-000000000002','Hello');
select public.create_like('bbbb0000-0000-4000-8000-000000000002','Retry');
do $$ begin
  assert (select sum(amount) from public.credit_transactions) = 4, 'A retry charged twice';
  assert (select count(*) from public.likes) = 1, 'A retry created a second like';
end $$;
select set_config('request.jwt.claim.sub','bbbb0000-0000-4000-8000-000000000002',true);
select public.create_like('aaaa0000-0000-4000-8000-000000000001','Reciprocal interest');
do $$ begin
  assert (select sum(amount) from public.credit_transactions) = 5, 'Reciprocal interest charged again';
  assert (select count(*) from public.likes) = 1, 'Reciprocal interest duplicated the pair';
end $$;
select pg_temp.reply_to_like((select id from public.likes limit 1),'Hello back');
select pg_temp.send_chat_message((select chat_id from public.chat_participants limit 1),'A normal message');
select pg_temp.expect_error($q$select pg_temp.send_chat_message((select chat_id from public.chat_participants limit 1),repeat('x',2001))$q$,'22023');
-- Keep IDs for attempts to bypass the UI after unmatching.
select set_config('test.like_id',(select id::text from public.likes limit 1),true);
select set_config('test.chat_id',(select chat_id::text from public.chat_participants limit 1),true);
select public.unmatch_chat(current_setting('test.chat_id')::uuid);
select pg_temp.expect_error($q$select pg_temp.reply_to_like(current_setting('test.like_id')::uuid,'Reopen')$q$,'22023');
select pg_temp.expect_error($q$select pg_temp.send_chat_message(current_setting('test.chat_id')::uuid,'After unmatch')$q$,'P0002');
do $$ begin assert not exists(select 1 from public.chats), 'Unmatched chat reappeared'; end $$;

-- Simulate a conversation recreated by the historical hole: preserve it for audit, hide it from clients.
reset role;
insert into public.chats(id,like_id) values (current_setting('test.chat_id')::uuid,current_setting('test.like_id')::uuid);
insert into public.chat_participants(chat_id,user_id) values
 (current_setting('test.chat_id')::uuid,'aaaa0000-0000-4000-8000-000000000001'),
 (current_setting('test.chat_id')::uuid,'bbbb0000-0000-4000-8000-000000000002');
insert into public.messages(chat_id,sender_id,body) values
 (current_setting('test.chat_id')::uuid,'aaaa0000-0000-4000-8000-000000000001','Historical unauthorized message');
set local role authenticated;
do $$ begin
  assert not exists(select 1 from public.chats), 'Historical ended chat still readable';
  assert not exists(select 1 from public.messages), 'Historical ended messages still readable';
  assert not exists(select 1 from public.get_chat_previews()), 'Historical ended chat still listed';
end $$;
reset role;
delete from public.chats where id = current_setting('test.chat_id')::uuid;
set local role authenticated;

-- Block a matched pair; both directions must be denied and unblock must not revive the like.
select set_config('request.jwt.claim.sub','cccc0000-0000-4000-8000-000000000003',true);
select public.create_like('dddd0000-0000-4000-8000-000000000004','Hello');
select set_config('request.jwt.claim.sub','dddd0000-0000-4000-8000-000000000004',true);
select pg_temp.reply_to_like((select id from public.likes limit 1),'Hello back');
select set_config('test.like_id',(select id::text from public.likes limit 1),true);
select set_config('test.chat_id',(select chat_id::text from public.chat_participants limit 1),true);
select public.block_user('cccc0000-0000-4000-8000-000000000003');
select pg_temp.expect_error($q$select pg_temp.reply_to_like(current_setting('test.like_id')::uuid,'From blocker')$q$,'P0002');
select set_config('request.jwt.claim.sub','cccc0000-0000-4000-8000-000000000003',true);
select pg_temp.expect_error($q$select public.create_like('dddd0000-0000-4000-8000-000000000004','From blocked')$q$,'P0002');
select pg_temp.expect_error($q$select pg_temp.send_chat_message(current_setting('test.chat_id')::uuid,'From blocked')$q$,'P0002');
select set_config('request.jwt.claim.sub','dddd0000-0000-4000-8000-000000000004',true);
select public.unblock_user('cccc0000-0000-4000-8000-000000000003');
select pg_temp.expect_error($q$select pg_temp.reply_to_like(current_setting('test.like_id')::uuid,'After unblock')$q$,'22023');

-- Raw RPCs cannot invoke privileged helpers or forge an authenticated user.
select pg_temp.expect_error($q$select public.spend_user_credit(auth.uid(),'bypass')$q$,'42501');
select pg_temp.expect_error($q$select public.consume_action_limit(auth.uid(),'message',60,999999)$q$,'42501');
select pg_temp.expect_error($q$select public.commit_generated_kundli(auth.uid(),0,'{}')$q$,'42501');

-- Push authorization, suspension and throttling are checked independently of client guards.
reset role;
do $$ begin
  assert not public.can_deliver_social_push('cccc0000-0000-4000-8000-000000000003','dddd0000-0000-4000-8000-000000000004',current_setting('test.chat_id')::uuid), 'Ended-chat push allowed';
end $$;
select set_config('request.jwt.claim.sub','eeee0000-0000-4000-8000-000000000005',true);
set local role authenticated;
select public.create_like('ffff0000-0000-4000-8000-000000000006','Hello');
select set_config('request.jwt.claim.sub','ffff0000-0000-4000-8000-000000000006',true);
select pg_temp.reply_to_like((select id from public.likes limit 1),'Hello back');
reset role;
update public.profiles set suspended_at = now() where id = 'eeee0000-0000-4000-8000-000000000005';
set local role authenticated;
select pg_temp.expect_error($q$select pg_temp.send_chat_message((select chat_id from public.chat_participants limit 1),'Suspended partner')$q$,'P0002');
reset role;
update public.profiles set suspended_at = null where id = 'eeee0000-0000-4000-8000-000000000005';
select public.consume_action_limit('ffff0000-0000-4000-8000-000000000006','message',60,30) from generate_series(1,29);
set local role authenticated;
select pg_temp.expect_error($q$select pg_temp.send_chat_message((select chat_id from public.chat_participants limit 1),'Throttled')$q$,'P0429');
reset role;

-- A stale generation result cannot overwrite a newer birth-input revision.
update public.profiles set birth_latitude = 20 where id = 'aaaa0000-0000-4000-8000-000000000001';
select pg_temp.expect_error($q$select public.commit_generated_kundli('aaaa0000-0000-4000-8000-000000000001',0,'{}')$q$,'40001');

-- Profile edits are field patches; legacy clients cannot update a whole row.
update public.profiles set bio = 'Keep my biography', workplace = 'Keep my workplace'
where id = 'bbbb0000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','bbbb0000-0000-4000-8000-000000000002',true);
set local role authenticated;
select set_config('test.profile_version',(select updated_at::text from public.profiles),true);
select public.update_profile_fields('{"height":"170 cm"}',current_setting('test.profile_version')::timestamptz);
select pg_temp.expect_error($q$select public.update_profile_fields('{"bio":"Stale edit"}',current_setting('test.profile_version')::timestamptz)$q$,'40001');
select public.update_profile_fields('{"religious_beliefs":"Hindu"}',(select updated_at from public.profiles));
do $$ begin
  assert (select bio = 'Keep my biography' and workplace = 'Keep my workplace' and height = '170 cm' and religious_beliefs = 'Hindu' and onboarding_completed from public.profiles), 'A step save erased unrelated fields';
end $$;
select pg_temp.expect_error($q$update public.profiles set bio = null$q$,'42501');
select pg_temp.expect_error($q$select public.update_profile_fields('{"suspended_at":null}',(select updated_at from public.profiles))$q$,'22023');
select pg_temp.expect_error($q$select public.update_profile_fields('{"date_of_birth":"2000-01-01"}',(select updated_at from public.profiles))$q$,'22023');
select public.update_profile_fields('{"bio":""}',(select updated_at from public.profiles));
do $$ begin assert (select bio = '' from public.profiles), 'Explicit field clearing failed'; end $$;
reset role;

-- New onboarding cannot lock missing or stale chart inputs, and the new RPC preserves the age gate.
insert into auth.users(id) values ('11110000-0000-4000-8000-000000000007');
insert into public.profiles(id,date_of_birth,time_of_birth,birth_place,birth_latitude,birth_longitude,birth_timezone,location)
values ('11110000-0000-4000-8000-000000000007','1995-02-09','00:00:00','Mumbai',19.076,72.8777,'Asia/Kolkata','Mumbai');
select set_config('request.jwt.claim.sub','11110000-0000-4000-8000-000000000007',true);
set local role authenticated;
select pg_temp.expect_error($q$select public.update_profile_fields('{"date_of_birth":"2020-01-01"}',(select updated_at from public.profiles))$q$,'23514');
select pg_temp.expect_error($q$select public.update_profile_fields('{}',(select updated_at from public.profiles),true)$q$,'23514');
reset role;
set local role service_role;
select public.commit_generated_kundli('11110000-0000-4000-8000-000000000007',0,
  '{"raw_response":{},"parsed_summary":{},"chart_raw_responses":{},"chart_houses":{},"input_signature":"test","generated_at":"2026-10-16T00:00:00Z"}');
reset role;
insert into public.profile_photos(user_id,storage_path,sort_order)
select '11110000-0000-4000-8000-000000000007','11110000-0000-4000-8000-000000000007/fixture-' || n || '.jpg',n-1 from generate_series(1,4) n;
set local role authenticated;
select public.update_profile_fields('{}',(select updated_at from public.profiles),true);
do $$ begin assert (select onboarding_completed and kundli_generation_status = 'generated' from public.profiles), 'Valid onboarding did not complete'; end $$;
reset role;

rollback;
