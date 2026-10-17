begin;
create function pg_temp.expect_error(p_sql text,p_code text) returns void language plpgsql as $$
declare actual text;
begin
  begin execute p_sql; exception when others then get stacked diagnostics actual = returned_sqlstate; end;
  if actual is distinct from p_code then raise exception 'Expected %, got %: %',p_code,coalesce(actual,'success'),p_sql; end if;
end;
$$;
insert into auth.users(id,email,email_confirmed_at)
select ('e4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  case when n=3 then 'owner@example.com' when n=4 then 'unverified-auth@example.com' end,
  case when n=3 then now() end from generate_series(1,12) n;
insert into public.profiles(id,display_name,email,gender,gender_preferences,location,date_of_birth,time_of_birth,birth_place,birth_latitude,birth_longitude,birth_timezone)
select id,'Batch 4 '||n,case when n in (1,2) then 'owner@example.com' end,
  case when n%2=1 then 'Male' else 'Female' end,array['Everyone'],'Mumbai','1995-02-09','00:00:00','Mumbai',19,72,'Asia/Kolkata'
from generate_series(1,10) n join auth.users on id = ('e4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
insert into public.kundlis(user_id,raw_response,input_revision)
select id,'{}',birth_details_revision from public.profiles where display_name like 'Batch 4 %';
insert into public.profile_photos(user_id,storage_path,sort_order)
select p.id,p.id::text||'/fixture-'||n||'.jpg',n-1 from public.profiles p cross join generate_series(1,4) n where display_name like 'Batch 4 %';
update public.profiles set onboarding_completed = true where display_name like 'Batch 4 %';
insert into public.credit_transactions(user_id,amount,reason)
select id,10,'Batch 4 credit' from public.profiles where display_name like 'Batch 4 %' and display_name <> 'Batch 4 5';
insert into public.user_subscriptions(user_id,plan_id,status,renewal_date) values
 ('e4000000-0000-4000-8000-000000000003','plus-monthly','active',now()+interval '1 day'),
 ('e4000000-0000-4000-8000-000000000005','plus-monthly','active',now()-interval '1 day');
select set_config('test.report','{"id":"real-report","generatedAt":"2026-10-17T00:00:00Z","overallScore":80,"breakdown":[],"summary":"Real","yogas":[],"doshas":[],"raw":{}}',true);

-- Two computations may race; only the winning commit charges and determines the saved report.
set local role service_role;
select set_config('test.job',public.prepare_match_score('e4000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000002','engine-1')::text,true);
do $$ begin assert not exists(select 1 from public.credit_transactions where amount < 0 and user_id::text like 'e4000000%'), 'Preparation charged a credit'; end $$;
select set_config('test.first',public.commit_match_score('e4000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000002','engine-1',current_setting('test.job')::jsonb->'signature',current_setting('test.report')::jsonb)::text,true);
do $$ declare result jsonb; begin
 result := public.commit_match_score('e4000000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000001','engine-1',current_setting('test.job')::jsonb->'signature',jsonb_set(current_setting('test.report')::jsonb,'{overallScore}','90'));
 assert (result->>'cached')::boolean and result->'compatibility'->>'overallScore' = '80', 'Retry replaced or charged the existing report';
 assert result->>'matchScoreId' = current_setting('test.first')::jsonb->>'matchScoreId', 'Reverse request duplicated the pair';
 assert (select count(*) from public.credit_transactions where amount < 0 and user_id::text like 'e4000000%') = 1, 'Pair was billed twice';
 assert (select metadata->>'action' from public.credit_transactions where amount < 0 and user_id::text like 'e4000000%') = 'match_score', 'Debit lacks action metadata';
end $$;

-- Free refresh preserves the score ID and history when the engine changes.
select set_config('test.job',public.prepare_match_score('e4000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000002','engine-2')::text,true);
select public.commit_match_score('e4000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000002','engine-2',current_setting('test.job')::jsonb->'signature',current_setting('test.report')::jsonb);
do $$ begin assert (select count(*) from public.credit_transactions where amount < 0 and user_id::text like 'e4000000%') = 1, 'Report refresh charged again'; end $$;

-- A database failure after the debit rolls back both ledger and report.
reset role;
create function pg_temp.reject_score() returns trigger language plpgsql as $$ begin raise exception 'Injected save failure' using errcode='23514'; end; $$;
create trigger reject_test_score before insert on public.match_scores for each row when (new.user_b_id = 'e4000000-0000-4000-8000-000000000006') execute function pg_temp.reject_score();
set local role service_role;
select set_config('test.job',public.prepare_match_score('e4000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000006','engine-1')::text,true);
select pg_temp.expect_error($q$select public.commit_match_score('e4000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000006','engine-1',current_setting('test.job')::jsonb->'signature',current_setting('test.report')::jsonb)$q$,'23514');
do $$ begin assert (select count(*) from public.credit_transactions where amount < 0 and user_id::text like 'e4000000%') = 1, 'Failed save left a debit'; end $$;
reset role;
drop trigger reject_test_score on public.match_scores;

-- Recheck privacy, blocks and profile revisions at commit; never charge stale inputs.
set local role service_role;
select set_config('test.job',public.prepare_match_score('e4000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000006','engine-1')::text,true);
reset role;
update public.profiles set gender = 'Non - Binary' where id = 'e4000000-0000-4000-8000-000000000006';
set local role service_role;
select pg_temp.expect_error($q$select public.commit_match_score('e4000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000006','engine-1',current_setting('test.job')::jsonb->'signature',current_setting('test.report')::jsonb)$q$,'40001');
reset role;
insert into public.user_blocks(blocker_id,blocked_id) values ('e4000000-0000-4000-8000-000000000006','e4000000-0000-4000-8000-000000000001');
set local role service_role;
select pg_temp.expect_error($q$select public.commit_match_score('e4000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000006','engine-1',current_setting('test.job')::jsonb->'signature',current_setting('test.report')::jsonb)$q$,'P0002');
select set_config('test.job',public.prepare_match_score('e4000000-0000-4000-8000-000000000005','e4000000-0000-4000-8000-000000000004','engine-1')::text,true);
select pg_temp.expect_error($q$select public.commit_match_score('e4000000-0000-4000-8000-000000000005','e4000000-0000-4000-8000-000000000004','engine-1',current_setting('test.job')::jsonb->'signature',current_setting('test.report')::jsonb)$q$,'P0402');
select public.prepare_match_score('e4000000-0000-4000-8000-000000000003','e4000000-0000-4000-8000-000000000004','engine-1') from generate_series(1,10);
select pg_temp.expect_error($q$select public.prepare_match_score('e4000000-0000-4000-8000-000000000003','e4000000-0000-4000-8000-000000000004','engine-1')$q$,'P0429');
reset role;

-- Reply receipts and messages commit together. Retries do not create messages, activity or consume limits.
set local role authenticated;
select set_config('request.jwt.claim.sub','e4000000-0000-4000-8000-000000000001',true);
select set_config('test.like',(public.create_like('e4000000-0000-4000-8000-000000000002','Hello')->'like'->>'id'),true);
select set_config('request.jwt.claim.sub','e4000000-0000-4000-8000-000000000002',true);
select set_config('test.reply',public.reply_to_like_once(current_setting('test.like')::uuid,'Hello back','e4100000-0000-4000-8000-000000000001')::text,true);
select set_config('test.chat',current_setting('test.reply')::jsonb->>'chatId',true);
do $$ declare result jsonb; begin
 result := public.reply_to_like_once(current_setting('test.like')::uuid,'Hello back','e4100000-0000-4000-8000-000000000001');
 assert (result->>'cached')::boolean and result->>'chatId' = current_setting('test.chat'), 'Reply did not replay its original result';
 assert (select count(*) from public.messages) = 2, 'Retry duplicated reply/opening message';
end $$;
select pg_temp.expect_error($q$select public.reply_to_like_once(current_setting('test.like')::uuid,'Different','e4100000-0000-4000-8000-000000000001')$q$,'22023');
select public.send_chat_message_once(current_setting('test.chat')::uuid,'Identical text','e4100000-0000-4000-8000-000000000002');
select public.send_chat_message_once(current_setting('test.chat')::uuid,'Identical text','e4100000-0000-4000-8000-000000000002');
select public.send_chat_message_once(current_setting('test.chat')::uuid,'Identical text','e4100000-0000-4000-8000-000000000003');
do $$ begin assert (select count(*) from public.messages where body='Identical text') = 2, 'Distinct intents/retries were confused'; end $$;
select pg_temp.expect_error($q$select public.send_chat_message_once(current_setting('test.chat')::uuid,'Hello back','e4100000-0000-4000-8000-000000000001')$q$,'22023');
select pg_temp.expect_error($q$select public.send_chat_message_once(current_setting('test.chat')::uuid,'New',null)$q$,'22023');
select pg_temp.expect_error($q$select public.send_chat_message_once(current_setting('test.chat')::uuid,'New','e4100000-0000-4000-8000-000000000004','e4000000-0000-4000-8000-000000000001')$q$,'42501');
reset role;
do $$ begin
 assert (select attempts from public.action_limits where user_id='e4000000-0000-4000-8000-000000000002' and action='message') = 3, 'Retries consumed message limit';
 assert (select count(*) from public.message_requests) = 3, 'Receipt count is incorrect';
 assert (select count(*) from public.activity_events where event_type='message') = 2, 'Retry duplicated recipient activity';
end $$;
create function pg_temp.reject_receipt() returns trigger language plpgsql as $$ begin raise exception 'Injected receipt failure' using errcode='23514'; end; $$;
create trigger reject_test_receipt before insert on public.message_requests for each row execute function pg_temp.reject_receipt();
set local role authenticated;
select pg_temp.expect_error($q$select public.send_chat_message_once(current_setting('test.chat')::uuid,'Atomic failure','e4100000-0000-4000-8000-000000000005')$q$,'23514');
do $$ begin assert not exists(select 1 from public.messages where body='Atomic failure'), 'Receipt failure left a message'; end $$;
reset role;
drop trigger reject_test_receipt on public.message_requests;
set local role authenticated;
select set_config('request.jwt.claim.sub','e4000000-0000-4000-8000-000000000009',true);
select pg_temp.expect_error($q$select public.send_chat_message_once(current_setting('test.chat')::uuid,'Identical text','e4100000-0000-4000-8000-000000000002')$q$,'P0002');
select pg_temp.expect_error($q$select * from public.message_requests$q$,'42501');
select pg_temp.expect_error($q$select public.send_chat_message(current_setting('test.chat')::uuid,'Legacy bypass')$q$,'42501');
select pg_temp.expect_error($q$select public.reply_to_like(current_setting('test.like')::uuid,'Legacy bypass')$q$,'42501');
select pg_temp.expect_error($q$select public.prepare_match_score(auth.uid(),'e4000000-0000-4000-8000-000000000002','engine-1')$q$,'42501');
select set_config('request.jwt.claim.sub','e4000000-0000-4000-8000-000000000002',true);
select public.unmatch_chat(current_setting('test.chat')::uuid);
select pg_temp.expect_error($q$select public.send_chat_message_once(current_setting('test.chat')::uuid,'Identical text','e4100000-0000-4000-8000-000000000002')$q$,'P0002');
select pg_temp.expect_error($q$select public.reply_to_like_once(current_setting('test.like')::uuid,'Hello back','e4100000-0000-4000-8000-000000000001')$q$,'22023');
reset role;

-- A claimed contact address never claims a verified identity, nor prevents its owner's profile.
do $$ begin
 assert (select verified_email is null from public.profiles where display_name='Batch 4 1'), 'Contact email became identity';
 assert (select verified_email='owner@example.com' from public.profiles where display_name='Batch 4 3'), 'Verified Auth email was not synchronized';
 assert (select verified_email is null from public.profiles where display_name='Batch 4 4'), 'Unconfirmed Auth email was trusted';
end $$;
update public.profiles set verified_email='forged@example.com' where display_name='Batch 4 1';
do $$ begin assert (select verified_email is null from public.profiles where display_name='Batch 4 1'), 'Service/client write forged a verified identity'; end $$;
update auth.users set email='changed@example.com',email_confirmed_at=now() where id='e4000000-0000-4000-8000-000000000004';
do $$ begin assert (select verified_email='changed@example.com' from public.profiles where display_name='Batch 4 4'), 'Auth change did not synchronize'; end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','e4000000-0000-4000-8000-000000000011',true);
insert into public.profiles(id,email,verified_email,email_verified_at) values (auth.uid(),'owner@example.com','forged@example.com',now());
do $$ begin assert (select verified_email is null and email_verified_at is null from public.profiles), 'Insert forged verification'; end $$;
select pg_temp.expect_error($q$select public.update_profile_fields('{"verified_email":"owner@example.com"}',(select updated_at from public.profiles))$q$,'22023');
select pg_temp.expect_error($q$select public.update_profile_fields(jsonb_build_object('display_name',repeat('x',81)),(select updated_at from public.profiles))$q$,'22023');
select pg_temp.expect_error($q$select public.update_profile_fields(jsonb_build_object('bio',repeat('x',501)),(select updated_at from public.profiles))$q$,'22023');
select public.update_profile_fields(jsonb_build_object('display_name',repeat('😀',80),'bio',repeat('x',500)),(select updated_at from public.profiles));
select pg_temp.expect_error($q$select public.update_profile_fields('{"email":"bad address"}',(select updated_at from public.profiles))$q$,'22023');
do $$ begin
 assert not exists(select 1 from public.profiles where id='e4000000-0000-4000-8000-000000000003'), 'Another profile exposes private identity fields';
 assert exists(select 1 from public.profile_cards where id='e4000000-0000-4000-8000-000000000003'), 'Public card fixture is missing';
 assert not exists(select 1 from public.profile_cards c where c.id='e4000000-0000-4000-8000-000000000003' and
   (to_jsonb(c) ? 'email' or to_jsonb(c) ? 'verified_email' or to_jsonb(c) ? 'email_verified_at')), 'Public card exposes email identity';
end $$;
select set_config('request.jwt.claim.sub','e4000000-0000-4000-8000-000000000012',true);
select pg_temp.expect_error($q$insert into public.profiles(id,display_name) values(auth.uid(),repeat('x',81))$q$,'22023');
select pg_temp.expect_error($q$insert into public.profiles(id,bio) values(auth.uid(),repeat('x',501))$q$,'22023');
reset role;
alter table public.profiles disable trigger enforce_profile_identity_and_limits;
insert into public.profiles(id,display_name,bio) values ('e4000000-0000-4000-8000-000000000012',repeat('x',81),repeat('x',501));
alter table public.profiles enable trigger enforce_profile_identity_and_limits;
set local role authenticated;
select set_config('request.jwt.claim.sub','e4000000-0000-4000-8000-000000000012',true);
select public.update_profile_fields('{"height":"170 cm"}',(select updated_at from public.profiles));
do $$ begin assert (select char_length(display_name)=81 and char_length(bio)=501 and height='170 cm' from public.profiles), 'Legacy text was truncated or blocked unrelated edits'; end $$;
reset role;
rollback;
