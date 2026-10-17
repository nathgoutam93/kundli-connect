-- Disposable database only; install both maintenance tool files first. All fixtures roll back.
begin;
create or replace function pg_temp.expect_error(p_sql text,p_code text) returns void language plpgsql as $$
declare actual text;
begin
 begin execute p_sql; exception when others then get stacked diagnostics actual=returned_sqlstate; end;
 if actual is distinct from p_code then raise exception 'Expected %, got %: %',p_code,coalesce(actual,'success'),p_sql; end if;
end $$;
insert into auth.users(id)
select ('d7000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,4) n;
insert into public.profiles(id,display_name,gender,gender_preferences,location,bio,date_of_birth,time_of_birth,birth_place,birth_latitude,birth_longitude,birth_timezone)
select id,'Birth fixture '||n,case when n=1 then 'Male' else 'Female' end,array['Everyone'],'Mumbai','Keep my bio',
 '2000-01-01','00:00','Mumbai',19.076,72.8777,'Asia/Kolkata'
from generate_series(1,4) n join auth.users on id=('d7000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
insert into public.kundlis(user_id,raw_response,parsed_summary,input_revision,input_signature)
select id,'{"oldChart":true}','{"ascendant":"Old chart"}',0,'legacy-signature' from public.profiles where id::text like 'd7000000%';
insert into public.profile_photos(user_id,storage_path,sort_order)
select id,id::text||'/fixture-'||n||'.jpg',n-1 from public.profiles cross join generate_series(1,4) n where id::text like 'd7000000%';
update public.profiles set onboarding_completed=true,kundli_generation_status='generated' where id::text like 'd7000000%';
insert into public.match_scores(id,user_a_id,user_b_id,compatibility_score,compatibility_report,input_signature) values
 ('d7100000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000002',80,'{"id":"old-score-12","generatedAt":"2026-01-01T00:00:00Z","overallScore":80}','{"aRevision":0,"bRevision":0,"aGender":"Male","bGender":"Female","engine":"engine-test"}'),
 ('d7100000-0000-4000-8000-000000000002','d7000000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000003',81,'{"id":"old-score-13","generatedAt":"2026-01-01T00:00:00Z","overallScore":81}',null),
 ('d7100000-0000-4000-8000-000000000003','d7000000-0000-4000-8000-000000000002','d7000000-0000-4000-8000-000000000003',82,'{"id":"unrelated-score","generatedAt":"2026-01-01T00:00:00Z","overallScore":82}',null);
insert into public.likes(id,from_user_id,to_user_id,status,match_score_id) values
 ('d7200000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000002','d7000000-0000-4000-8000-000000000001','pending','d7100000-0000-4000-8000-000000000001'),
 ('d7200000-0000-4000-8000-000000000002','d7000000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000003','matched','d7100000-0000-4000-8000-000000000002');
insert into public.chats(id,like_id) values('d7300000-0000-4000-8000-000000000001','d7200000-0000-4000-8000-000000000002');
insert into public.chat_participants(chat_id,user_id)
select 'd7300000-0000-4000-8000-000000000001',id from public.profiles where id in('d7000000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000003');
insert into public.messages(chat_id,sender_id,body) values('d7300000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000003','Keep this conversation');
insert into public.astro_insights(user_id,week_of,kind,tone,title,body,starts_at,input_revision) values
 ('d7000000-0000-4000-8000-000000000001',current_date,'fixture','neutral','Old insight','Old-input content',now(),0);
-- A structural chart fixture tests SQL binding and atomicity; Deno tests and the CLI rehearsal
-- separately verify genuine chart calculation through the shared generator.
create function pg_temp.birth_artifact(p_key text default 'birth-fix-1') returns jsonb language sql as $$
 with inputs as(select '{"date_of_birth":"1996-03-14","time_of_birth":"06:42:00","birth_place":"Lucknow","birth_latitude":26.8467,"birth_longitude":80.9462,"birth_timezone":"Asia/Kolkata"}'::jsonb birth),
 houses as(select jsonb_agg(jsonb_build_object('house',n,'sign',n,'signName','Test','planets','[]'::jsonb) order by n) houses from generate_series(1,12) n)
 select jsonb_build_object('version',1,'repairKey',p_key,'evidenceRef','SUPPORT-123','userId','d7000000-0000-4000-8000-000000000001',
 'memberConfirmed',true,'placeConfirmed',true,'engine','local-1','birth',birth,
 'expectedRevision',0,'expectedFingerprint',maintenance.fingerprint(maintenance.birth_snapshot('d7000000-0000-4000-8000-000000000001')),
 'chart',jsonb_build_object('raw_response','{"replacement":true}'::jsonb,'parsed_summary',jsonb_build_object('ascendant','Pisces','moonSign','Sagittarius','generatedAt',now()),
 'chart_raw_responses','{}'::jsonb,'chart_houses',jsonb_build_object('D1',houses,'D9',houses),'generated_at',now(),
 'source_inputs',birth,'input_revision',1,'input_signature','local-1|1996-03-14|06:42:00|26.8467|80.9462|Asia/Kolkata')) from inputs,houses;
$$;
select set_config('test.birth_artifact',pg_temp.birth_artifact()::text,true);
select set_config('test.birth_before',maintenance.birth_snapshot('d7000000-0000-4000-8000-000000000001')::text,true);
select maintenance.correct_birth_details(current_setting('test.birth_artifact')::jsonb);
do $$ begin
 assert current_setting('test.birth_before')::jsonb=maintenance.birth_snapshot('d7000000-0000-4000-8000-000000000001'), 'Dry run changed profile/dependents';
 assert not exists(select 1 from maintenance.repair_actions where repair_key='birth-fix-1'), 'Dry run wrote general audit';
 assert not exists(select 1 from maintenance.birth_corrections where repair_key='birth-fix-1'), 'Dry run stored private inputs';
end $$;
select pg_temp.expect_error($q$select maintenance.correct_birth_details(jsonb_set(current_setting('test.birth_artifact')::jsonb,'{memberConfirmed}','false'),false)$q$,'22023');
select pg_temp.expect_error($q$select maintenance.correct_birth_details(jsonb_set(current_setting('test.birth_artifact')::jsonb,'{chart,source_inputs,birth_place}','"Wrong place"'),false)$q$,'22023');
select pg_temp.expect_error($q$select maintenance.correct_birth_details(jsonb_set(current_setting('test.birth_artifact')::jsonb,'{chart,input_revision}','99'),false)$q$,'22023');
select pg_temp.expect_error($q$select maintenance.correct_birth_details(jsonb_set(current_setting('test.birth_artifact')::jsonb,'{birth,date_of_birth}','"2015-01-01"'),false)$q$,'22023');
select pg_temp.expect_error($q$select maintenance.correct_birth_details(jsonb_set(current_setting('test.birth_artifact')::jsonb,'{expectedRevision}','0.1'),false)$q$,'22023');
update public.profiles set bio='Edited while support reviewed',updated_at=clock_timestamp() where id='d7000000-0000-4000-8000-000000000001';
select pg_temp.expect_error($q$select maintenance.correct_birth_details(current_setting('test.birth_artifact')::jsonb,false)$q$,'40001');
select set_config('test.birth_artifact',pg_temp.birth_artifact()::text,true);
select set_config('test.birth_before',maintenance.birth_snapshot('d7000000-0000-4000-8000-000000000001')::text,true);
-- Failure after the chart write must roll back profile, chart, invalidation and both audit rows.
create function pg_temp.reject_birth_archive() returns trigger language plpgsql as $$ begin raise exception 'Injected archive failure' using errcode='23514'; end $$;
create trigger reject_birth_test before insert on maintenance.birth_corrections for each row execute function pg_temp.reject_birth_archive();
select pg_temp.expect_error($q$select maintenance.correct_birth_details(current_setting('test.birth_artifact')::jsonb,false)$q$,'23514');
drop trigger reject_birth_test on maintenance.birth_corrections;
do $$ begin
 assert current_setting('test.birth_before')::jsonb=maintenance.birth_snapshot('d7000000-0000-4000-8000-000000000001'), 'Failed correction partially committed';
 assert not exists(select 1 from public.user_data_versions where user_id::text like 'd7000000%'), 'Failed correction emitted invalidation';
end $$;
select set_config('test.queued_score',public.prepare_match_score('d7000000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000002','queued-engine')::text,true);
select maintenance.correct_birth_details(current_setting('test.birth_artifact')::jsonb,false);
select maintenance.correct_birth_details(current_setting('test.birth_artifact')::jsonb,false);
select pg_temp.expect_error($q$select maintenance.correct_birth_details(jsonb_set(current_setting('test.birth_artifact')::jsonb,'{evidenceRef}','"different-ticket"'),false)$q$,'22023');
do $$ begin
 assert (select birth_details_revision=1 and date_of_birth='1996-03-14' and time_of_birth='06:42' and birth_place='Lucknow' and onboarding_completed and bio='Edited while support reviewed' and kundli_generation_status='generated' from public.profiles where id='d7000000-0000-4000-8000-000000000001'), 'Correction lost input/profile state';
 assert (select input_revision=1 and raw_response='{"replacement":true}'::jsonb from public.kundlis where user_id='d7000000-0000-4000-8000-000000000001'), 'Replacement chart not committed';
 assert (select count(*) from public.match_scores where (user_a_id='d7000000-0000-4000-8000-000000000001' or user_b_id='d7000000-0000-4000-8000-000000000001') and invalidated_at is not null)=2, 'Dependent reports were not invalidated';
 assert (select invalidated_at is null from public.match_scores where id='d7100000-0000-4000-8000-000000000003'), 'Unrelated report invalidated';
 assert (select previous_birth->>'birth_place'='Mumbai' and previous_kundli->'raw_response'='{"oldChart":true}'::jsonb and jsonb_array_length(previous_reports)=2 from maintenance.birth_corrections where repair_key='birth-fix-1'), 'Private history was not preserved';
 assert (select count(*) from maintenance.repair_actions where repair_key='birth-fix-1')=1, 'Correction replay created another action';
 assert (select count(*) from public.user_data_versions where user_id::text like 'd7000000%')=3, 'Owner/partner caches not invalidated';
 assert (select count(*) from public.messages where chat_id='d7300000-0000-4000-8000-000000000001')=1, 'Conversation changed';
end $$;
select pg_temp.expect_error($q$select public.commit_generated_kundli('d7000000-0000-4000-8000-000000000001',0,current_setting('test.birth_artifact')::jsonb->'chart')$q$,'40001');
-- Prepared old score must fail, retaining its old debit/report identity for a free refresh.
select pg_temp.expect_error($q$select public.commit_match_score('d7000000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000002','queued-engine',current_setting('test.queued_score')::jsonb->'signature','{"id":"late","generatedAt":"2026-01-01T00:00:00Z","overallScore":80}')$q$,'40001');
-- A late old-input insight cannot be tagged with the corrected profile revision or trigger a push.
insert into public.astro_insights(user_id,week_of,kind,tone,title,body,starts_at,input_revision) values
 ('d7000000-0000-4000-8000-000000000001',current_date,'stale-job','neutral','Stale','Must not insert',now(),0);
do $$ begin assert not exists(select 1 from public.astro_insights where user_id='d7000000-0000-4000-8000-000000000001' and kind='stale-job'), 'Late insight inserted'; end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','d7000000-0000-4000-8000-000000000001',true);
do $$ begin
 assert (select count(*) from public.match_scores)=0, 'Raw API returned stale report';
 assert (select compatibility_report is null from public.profile_cards where id='d7000000-0000-4000-8000-000000000002'), 'Discover view bypassed invalidation';
 assert (select compatibility_report is null from public.get_incoming_likes_page() where id='d7200000-0000-4000-8000-000000000001'), 'Like retained stale report';
 assert (select compatibility_report is null from public.get_chat_previews_page() where id='d7300000-0000-4000-8000-000000000001'), 'Chat retained stale report';
 assert (select count(*) from public.astro_insights)=0, 'Stale insight remained visible';
 assert (select count(*) from public.kundlis where input_revision=1)=1, 'Current chart unavailable to owner';
 assert (select count(*) from public.user_data_versions)=1, 'Another user data-version row leaked';
end $$;
select pg_temp.expect_error($q$select * from maintenance.birth_corrections$q$,'42501');
select pg_temp.expect_error($q$select maintenance.correct_birth_details(current_setting('test.birth_artifact')::jsonb,false)$q$,'42501');
select pg_temp.expect_error($q$select public.update_profile_fields('{"birth_place":"Change locked birth"}',(select updated_at from public.profiles where id=auth.uid()))$q$,'22023');
reset role;
-- A legitimate refresh reuses the stored score ID and charges no extra credit.
select set_config('test.refresh',public.prepare_match_score('d7000000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000002','engine-test')::text,true);
select public.commit_match_score('d7000000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000002','engine-test',current_setting('test.refresh')::jsonb->'signature','{"id":"corrected-score","generatedAt":"2026-01-01T00:00:00Z","overallScore":85}');
do $$ begin
 assert (select invalidated_at is null and compatibility_score=85 from public.match_scores where id='d7100000-0000-4000-8000-000000000001'), 'Free refresh lost ID or invalidation state';
 assert (select match_score_id='d7100000-0000-4000-8000-000000000001' from public.likes where id='d7200000-0000-4000-8000-000000000001'), 'Like score reference changed';
 assert not exists(select 1 from public.credit_transactions where user_id::text like 'd7000000%'), 'Correction/refresh charged a credit';
end $$;
insert into public.astro_insights(user_id,week_of,kind,tone,title,body,starts_at,input_revision) values
 ('d7000000-0000-4000-8000-000000000001',current_date,'fixture','neutral','New insight','Corrected-input content',now(),1);
set local role authenticated;
select set_config('request.jwt.claim.sub','d7000000-0000-4000-8000-000000000001',true);
do $$ begin
 assert (select count(*) from public.astro_insights)=1, 'Versioned current insight did not replace old display';
 assert (select compatibility_report->>'id'='corrected-score' from public.profile_cards where id='d7000000-0000-4000-8000-000000000002'), 'Corrected score unavailable';
end $$;
reset role;
set local role service_role;
select pg_temp.expect_error($q$select maintenance.birth_snapshot('d7000000-0000-4000-8000-000000000001')$q$,'42501');
reset role;
-- Account deletion removes the private birth archive, while the redacted action audit remains.
delete from auth.users where id='d7000000-0000-4000-8000-000000000001';
do $$ begin assert not exists(select 1 from maintenance.birth_corrections where repair_key='birth-fix-1'), 'Deleted account retained private birth archive'; end $$;
rollback;
