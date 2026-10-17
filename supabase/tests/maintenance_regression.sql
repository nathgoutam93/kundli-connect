-- Administrative tooling must be installed before this suite. Everything rolls back.
begin;
create or replace function pg_temp.expect_error(p_sql text,p_code text) returns void language plpgsql as $$
declare actual text;
begin
 begin execute p_sql; exception when others then get stacked diagnostics actual=returned_sqlstate; end;
 if actual is distinct from p_code then raise exception 'Expected %, got %: %',p_code,coalesce(actual,'success'),p_sql; end if;
end;
$$;
create or replace function pg_temp.run_repair(p_key text,p_kind text,p_args jsonb,p_dry boolean default true)
returns jsonb language sql as $$
 select maintenance.repair(p_key,p_kind,p_args,maintenance.fingerprint(maintenance.snapshot(p_kind,p_args)),'review-ticket-123',p_dry);
$$;
insert into auth.users(id)
select ('d6000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,8) n;
insert into public.profiles(id,display_name,location,gender,gender_preferences,date_of_birth,time_of_birth,birth_place,birth_latitude,birth_longitude,birth_timezone)
select id,'Repair fixture '||n,'Mumbai','Female',array['Everyone'],
 '2000-01-01','00:00','Mumbai',19,72,'Asia/Kolkata' from generate_series(1,8) n
 join auth.users on id=('d6000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
insert into public.kundlis(user_id,raw_response,input_revision)
select id,'{}',birth_details_revision from public.profiles where id::text like 'd6000000%';
insert into public.profile_photos(user_id,storage_path,sort_order)
select id,id::text||'/fixture-'||n||'.jpg',n-1 from public.profiles cross join generate_series(1,4) n where id::text like 'd6000000%';
update public.profiles set onboarding_completed=true where id::text like 'd6000000%';
update public.profiles set location=' India ' where id='d6000000-0000-4000-8000-000000000003';
-- Legacy reciprocal rows existed before guard_like_pair; disable only to seed that historical shape.
alter table public.likes disable trigger guard_like_pair;
insert into public.likes(id,from_user_id,to_user_id,status,opening_message) values
 ('d6100000-0000-4000-8000-000000000001','d6000000-0000-4000-8000-000000000001','d6000000-0000-4000-8000-000000000002','matched','Private opening'),
 ('d6100000-0000-4000-8000-000000000002','d6000000-0000-4000-8000-000000000002','d6000000-0000-4000-8000-000000000001','matched','Other private opening'),
 ('d6100000-0000-4000-8000-000000000003','d6000000-0000-4000-8000-000000000004','d6000000-0000-4000-8000-000000000005','matched','Ended chat'),
 ('d6100000-0000-4000-8000-000000000004','d6000000-0000-4000-8000-000000000005','d6000000-0000-4000-8000-000000000004','dismissed','Ended reciprocal');
alter table public.likes enable trigger guard_like_pair;
insert into public.chats(id,like_id,created_at,updated_at)
select ('d6200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('d6100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'2026-01-01','2026-01-02' from generate_series(1,4) n;
insert into public.chat_participants(chat_id,user_id,hidden,last_read_at)
select ch.id,u.id,ch.id='d6200000-0000-4000-8000-000000000002' and u.id='d6000000-0000-4000-8000-000000000001',
 case when ch.id='d6200000-0000-4000-8000-000000000002' then null else '2026-01-01'::timestamptz end
from public.chats ch join public.likes l on l.id=ch.like_id join public.profiles u on u.id in(l.from_user_id,l.to_user_id)
where ch.id::text like 'd6200000%';
insert into public.messages(id,chat_id,sender_id,body,status,read_at,created_at) values
 ('d6300000-0000-4000-8000-000000000001','d6200000-0000-4000-8000-000000000001','d6000000-0000-4000-8000-000000000002','Private message','read','2026-01-02','2026-01-01'),
 ('d6300000-0000-4000-8000-000000000002','d6200000-0000-4000-8000-000000000002','d6000000-0000-4000-8000-000000000001','Private message two','sent',null,'2026-01-02');
-- A modern send receipt must remain retryable after its historical chat is merged.
set local role authenticated;
select set_config('request.jwt.claim.sub','d6000000-0000-4000-8000-000000000001',true);
select public.send_chat_message_once('d6200000-0000-4000-8000-000000000002','Lost response before merge','d6400000-0000-4000-8000-000000000001',auth.uid());
reset role;
insert into public.activity_events(user_id,event_type,title,metadata) values
 ('d6000000-0000-4000-8000-000000000001','message','Fixture','{"chatId":"d6200000-0000-4000-8000-000000000002"}');
insert into public.credit_transactions(id,user_id,amount,reason,metadata) values
 ('d6500000-0000-4000-8000-000000000001','d6000000-0000-4000-8000-000000000001',-3,'First action','{"action":"like","targetUserId":"d6000000-0000-4000-8000-000000000002"}'),
 ('d6500000-0000-4000-8000-000000000002','d6000000-0000-4000-8000-000000000001',-3,'Duplicate action','{"action":"like","targetUserId":"d6000000-0000-4000-8000-000000000002"}'),
 ('d6500000-0000-4000-8000-000000000003','d6000000-0000-4000-8000-000000000001',1,'Partial prior refund','{"refundOf":"d6500000-0000-4000-8000-000000000002"}'),
 ('d6500000-0000-4000-8000-000000000004','d6000000-0000-4000-8000-000000000001',-3,'Different action','{"action":"match_score","targetUserId":"d6000000-0000-4000-8000-000000000002"}');
insert into public.user_subscriptions(user_id,status,renewal_date) values
 ('d6000000-0000-4000-8000-000000000001','active','2025-01-01'),
 ('d6000000-0000-4000-8000-000000000002','active','2099-01-01');
-- Storage's real schema has created_at; minimal embedded test scaffolding adds it if needed.
alter table storage.objects add column if not exists created_at timestamptz default now();
insert into storage.objects(bucket_id,name,metadata,created_at) values
 ('profile-photos','d6000000-0000-4000-8000-000000000001/old-orphan.jpg','{"size":20,"mimetype":"image/jpeg"}',now()-interval '2 days'),
 ('profile-photos','d6000000-0000-4000-8000-000000000001/recent.jpg','{}',now()),
 ('profile-photos','d6000000-0000-4000-8000-000000000001/live.jpg','{}',now()-interval '2 days');
insert into public.photo_uploads(id,user_id,storage_path,expires_at) values
 ('d6600000-0000-4000-8000-000000000001','d6000000-0000-4000-8000-000000000001','d6000000-0000-4000-8000-000000000001/live.jpg',now()+interval '1 hour');
select set_config('test.merge','{"userA":"d6000000-0000-4000-8000-000000000001","userB":"d6000000-0000-4000-8000-000000000002","canonicalChatId":"d6200000-0000-4000-8000-000000000001"}',true);
select set_config('test.refund','{"debitId":"d6500000-0000-4000-8000-000000000002","keepDebitId":"d6500000-0000-4000-8000-000000000001"}',true);
select set_config('test.expire','{"userId":"d6000000-0000-4000-8000-000000000001","asOf":"2026-01-01"}',true);
select set_config('test.city','{"userId":"d6000000-0000-4000-8000-000000000003"}',true);
select set_config('test.orphan','{"path":"d6000000-0000-4000-8000-000000000001/old-orphan.jpg"}',true);
select set_config('test.before',maintenance.fingerprint(maintenance.snapshot('merge_chats',current_setting('test.merge')::jsonb)),true);
select set_config('test.receipts',(select jsonb_agg(to_jsonb(r) order by request_id)::text from public.message_requests r where user_id::text like 'd6000000%'),true);
select set_config('test.messages',(select jsonb_agg(to_jsonb(m)-'chat_id' order by id)::text from public.messages m where chat_id::text like 'd6200000%'),true);
-- Audit sees candidates without publishing content or classifying a midnight birthday as incorrect.
do $$ begin
 assert exists(select 1 from maintenance.audit() where issue='duplicate_live_pair' and entity_key like 'd6000000%'), 'Missing duplicate pair';
 assert exists(select 1 from maintenance.audit() where issue='repeated_debit_candidate' and entity_key like 'd6000000%'), 'Missing debit candidate';
 assert exists(select 1 from maintenance.audit() where issue='birth_details_review' and entity_key like 'd6000000%'), 'Birth-review flag missing';
 assert not exists(select 1 from maintenance.audit() where details::text like '%Private message%' or details::text like '%Private opening%'), 'Audit exposed private text';
end $$;
-- Every dry run is valid in a READ ONLY transaction; these leave no audit or application writes.
select pg_temp.run_repair('merge-1','merge_chats',current_setting('test.merge')::jsonb);
select pg_temp.run_repair('refund-1','refund_debit',current_setting('test.refund')::jsonb);
select pg_temp.run_repair('expire-1','expire_plan',current_setting('test.expire')::jsonb);
select pg_temp.run_repair('city-1','clear_placeholder_city',current_setting('test.city')::jsonb);
select pg_temp.run_repair('orphan-1','queue_orphan_photo',current_setting('test.orphan')::jsonb);
do $$ begin
 assert not exists(select 1 from maintenance.repair_actions where repair_key in('merge-1','refund-1','expire-1','city-1','orphan-1')), 'Dry run wrote audit rows';
 assert current_setting('test.before')=maintenance.fingerprint(maintenance.snapshot('merge_chats',current_setting('test.merge')::jsonb)), 'Dry merge mutated data';
 assert (select count(*) from public.photo_cleanup_queue where storage_path like 'd6000000%')=0, 'Dry run queued a deletion';
end $$;
select pg_temp.expect_error($q$select maintenance.repair('stale','merge_chats',current_setting('test.merge')::jsonb,'wrong','ticket',false)$q$,'40001');
update public.messages set body='Changed after inspection' where id='d6300000-0000-4000-8000-000000000001';
select pg_temp.expect_error($q$select maintenance.repair('changed-data','merge_chats',current_setting('test.merge')::jsonb,current_setting('test.before'),'ticket',false)$q$,'40001');
update public.messages set body='Private message' where id='d6300000-0000-4000-8000-000000000001';
select pg_temp.expect_error($q$select pg_temp.run_repair('no-merge','merge_chats','{"userA":"d6000000-0000-4000-8000-000000000004","userB":"d6000000-0000-4000-8000-000000000005","canonicalChatId":"d6200000-0000-4000-8000-000000000003"}',false)$q$,'22023');
-- Atomic audit insertion: failure must roll the merge back too.
create function pg_temp.reject_repair_log() returns trigger language plpgsql as $$ begin raise exception 'Injected audit failure' using errcode='23514'; end $$;
create trigger reject_test_repair before insert on maintenance.repair_actions for each row execute function pg_temp.reject_repair_log();
select pg_temp.expect_error($q$select pg_temp.run_repair('merge-1','merge_chats',current_setting('test.merge')::jsonb,false)$q$,'23514');
drop trigger reject_test_repair on maintenance.repair_actions;
do $$ begin assert current_setting('test.before')=maintenance.fingerprint(maintenance.snapshot('merge_chats',current_setting('test.merge')::jsonb)), 'Audit failure left a partial repair'; end $$;
select maintenance.repair('merge-1','merge_chats',current_setting('test.merge')::jsonb,current_setting('test.before'),'review-ticket-123',false);
-- Same key + original request is an idempotent replay, even though state has changed.
select maintenance.repair('merge-1','merge_chats',current_setting('test.merge')::jsonb,current_setting('test.before'),'review-ticket-123',false);
select pg_temp.expect_error($q$select maintenance.repair('merge-1','merge_chats',current_setting('test.merge')::jsonb,current_setting('test.before'),'different-ticket',false)$q$,'22023');
do $$ begin
 assert (select count(*) from public.messages where chat_id='d6200000-0000-4000-8000-000000000001')=3, 'Messages were not consolidated';
 assert (select count(*) from public.messages where chat_id='d6200000-0000-4000-8000-000000000002')=0, 'Source messages were duplicated';
 assert current_setting('test.messages')::jsonb=(select jsonb_agg(to_jsonb(m)-'chat_id' order by id) from public.messages m where chat_id::text like 'd6200000%'), 'Message IDs/content/read receipts changed';
 assert current_setting('test.receipts')::jsonb=(select jsonb_agg(to_jsonb(r) order by request_id) from public.message_requests r where user_id::text like 'd6000000%'), 'Retry journal changed';
 assert (select hidden and last_read_at='2026-01-01' from public.chat_participants where chat_id='d6200000-0000-4000-8000-000000000001' and user_id='d6000000-0000-4000-8000-000000000001'), 'Hidden/read state lost';
 assert (select last_read_at is null from public.chat_participants where chat_id='d6200000-0000-4000-8000-000000000001' and user_id='d6000000-0000-4000-8000-000000000002'), 'Unread NULL cursor lost';
 assert (select count(*) from public.chats where id::text like 'd6200000%')=4, 'Historical chat records deleted';
 assert (select count(*) from maintenance.repair_actions where repair_key='merge-1')=1, 'Duplicate audit record';
 assert not exists(select 1 from maintenance.audit() where issue='duplicate_live_pair' and entity_key='d6000000-0000-4000-8000-000000000001:d6000000-0000-4000-8000-000000000002'), 'Resolved pair still considered duplicate';
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','d6000000-0000-4000-8000-000000000001',true);
do $$ declare replay jsonb; begin
 assert public.resolve_chat_id('d6200000-0000-4000-8000-000000000002')='d6200000-0000-4000-8000-000000000001', 'Old link did not resolve';
 replay:=public.send_chat_message_once('d6200000-0000-4000-8000-000000000002','Lost response before merge','d6400000-0000-4000-8000-000000000001',auth.uid());
 assert (replay->>'cached')::boolean and replay->>'chatId'='d6200000-0000-4000-8000-000000000001', 'Old-target retry duplicated or lost canonical destination';
 replay:=public.send_chat_message_once('d6200000-0000-4000-8000-000000000001','Lost response before merge','d6400000-0000-4000-8000-000000000001',auth.uid());
 assert (replay->>'cached')::boolean, 'Canonical retry rejected the same request';
end $$;
select pg_temp.expect_error($q$select * from maintenance.repair_actions$q$,'42501');
select pg_temp.expect_error($q$select * from maintenance.audit()$q$,'42501');
select pg_temp.expect_error($q$insert into public.chat_aliases(source_chat_id,canonical_chat_id,repair_key) values('d6200000-0000-4000-8000-000000000003','d6200000-0000-4000-8000-000000000001','forged')$q$,'42501');
select set_config('request.jwt.claim.sub','d6000000-0000-4000-8000-000000000008',true);
do $$ begin assert public.resolve_chat_id('d6200000-0000-4000-8000-000000000002') is null, 'Mapping leaked to unrelated account'; end $$;
reset role;
-- Real apply paths, including a partial prior refund and no double refund under a different key.
select pg_temp.run_repair('refund-1','refund_debit',current_setting('test.refund')::jsonb,false);
select pg_temp.run_repair('refund-2','refund_debit',current_setting('test.refund')::jsonb,false);
select pg_temp.run_repair('expire-1','expire_plan',current_setting('test.expire')::jsonb,false);
select pg_temp.run_repair('city-1','clear_placeholder_city',current_setting('test.city')::jsonb,false);
select pg_temp.run_repair('orphan-1','queue_orphan_photo',current_setting('test.orphan')::jsonb,false);
select pg_temp.expect_error($q$select pg_temp.run_repair('wrong-refund','refund_debit','{"debitId":"d6500000-0000-4000-8000-000000000004","keepDebitId":"d6500000-0000-4000-8000-000000000001"}',false)$q$,'22023');
select pg_temp.expect_error($q$select pg_temp.run_repair('future-plan','expire_plan','{"userId":"d6000000-0000-4000-8000-000000000002","asOf":"2026-01-01"}',false)$q$,'22023');
select pg_temp.expect_error($q$select pg_temp.run_repair('recent','queue_orphan_photo','{"path":"d6000000-0000-4000-8000-000000000001/recent.jpg"}',false)$q$,'22023');
select pg_temp.expect_error($q$select pg_temp.run_repair('live','queue_orphan_photo','{"path":"d6000000-0000-4000-8000-000000000001/live.jpg"}',false)$q$,'22023');
do $$ begin
 assert (select sum(amount) from public.credit_transactions where metadata->>'refundOf'='d6500000-0000-4000-8000-000000000002')=3, 'Refund was not bounded by original debit';
 assert (select count(*) from public.credit_transactions where id in('d6500000-0000-4000-8000-000000000001','d6500000-0000-4000-8000-000000000002'))=2, 'Original debits deleted';
 assert (select status='expired' and renewal_date='2025-01-01' from public.user_subscriptions where user_id='d6000000-0000-4000-8000-000000000001'), 'Expiry repair altered history';
 assert (select location is null and onboarding_completed from public.profiles where id='d6000000-0000-4000-8000-000000000003'), 'City repair erased profile state';
 assert exists(select 1 from storage.objects where name='d6000000-0000-4000-8000-000000000001/old-orphan.jpg'), 'SQL deleted a storage object';
 assert exists(select 1 from public.photo_cleanup_queue where storage_path='d6000000-0000-4000-8000-000000000001/old-orphan.jpg'), 'Orphan was not queued';
end $$;
-- Ending an already-ended pair preserves historical messages/chats and closes every like.
select pg_temp.run_repair('end-1','end_relationship','{"userA":"d6000000-0000-4000-8000-000000000004","userB":"d6000000-0000-4000-8000-000000000005"}',false);
set local role authenticated;
select set_config('request.jwt.claim.sub','d6000000-0000-4000-8000-000000000001',true);
select public.block_user('d6000000-0000-4000-8000-000000000002');
do $$ begin assert public.resolve_chat_id('d6200000-0000-4000-8000-000000000002') is null, 'Alias survived authorization revocation'; end $$;
select pg_temp.expect_error($q$select public.send_chat_message_once('d6200000-0000-4000-8000-000000000002','Lost response before merge','d6400000-0000-4000-8000-000000000001',auth.uid())$q$,'P0002');
reset role;
set local role service_role;
select pg_temp.expect_error($q$select * from maintenance.repair_actions$q$,'42501');
reset role;
rollback;
