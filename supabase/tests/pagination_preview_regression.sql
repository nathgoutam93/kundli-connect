-- Run after all migrations with an administrative connection. Fixtures roll back.
begin;
insert into auth.users(id)
select ('d5000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid from generate_series(1,151) n;
insert into public.profiles(id,display_name,gender,gender_preferences,location,bio,workplace,workplace_visible_on_profile,
 date_of_birth,time_of_birth,birth_place,birth_latitude,birth_longitude,birth_timezone,created_at)
select id,'Pages ' || n,'Female',array['Everyone'],'Mumbai',null,'Secret workplace',false,
 '1995-02-09','00:00','Mumbai',19,72,'Asia/Kolkata','2026-01-01'
from generate_series(1,151) n join auth.users on id = ('d5000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
insert into public.kundlis(user_id,raw_response,input_revision)
select id,'{}',birth_details_revision from public.profiles where id::text like 'd5000000%';
insert into public.profile_photos(user_id,storage_path,sort_order)
select id,id::text||'/fixture-'||n||'.jpg',n-1 from public.profiles cross join generate_series(1,4) n where id::text like 'd5000000%';
update public.profiles set onboarding_completed=true where id::text like 'd5000000%';

-- Forty incoming likes, forty outgoing likes and forty matched threads, all with tied times.
insert into public.likes(id,from_user_id,to_user_id,status,opening_message,created_at)
select ('d5100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n between 42 and 81 then 'd5000000-0000-4000-8000-000000000001'::uuid else p.id end,
 case when n between 42 and 81 then p.id else 'd5000000-0000-4000-8000-000000000001'::uuid end,
 case when n between 82 and 121 then 'matched' else 'pending' end,'Hello','2026-01-01'
from generate_series(2,121) n join public.profiles p on p.id = ('d5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
insert into public.chats(id,like_id,created_at,updated_at)
select ('d5200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('d5100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'2026-01-01','2026-01-01' from generate_series(82,121) n;
insert into public.chat_participants(chat_id,user_id)
select ch.id,p.user_id from public.chats ch join public.likes l on l.id=ch.like_id cross join lateral (values (l.from_user_id),(l.to_user_id)) p(user_id)
where ch.id::text like 'd5200000%';
insert into public.messages(id,chat_id,sender_id,body,created_at)
select ('d5300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('d5200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('d5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Unread','2026-01-01' from generate_series(82,121) n;
-- Forty more messages sharing a timestamp in the oldest thread.
insert into public.messages(id,chat_id,sender_id,body,created_at)
select ('d5400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'d5200000-0000-4000-8000-000000000082',
 'd5000000-0000-4000-8000-000000000082','Tied message','2026-01-01' from generate_series(1,40) n;
insert into public.user_blocks(blocker_id,blocked_id,created_at)
select 'd5000000-0000-4000-8000-000000000002',id,'2026-01-01' from public.profiles
where id >= 'd5000000-0000-4000-8000-000000000090' and id <= 'd5000000-0000-4000-8000-000000000129';

set local role authenticated;
select set_config('request.jwt.claim.sub','d5000000-0000-4000-8000-000000000001',true);
do $$
declare v_cursor record; v_ids uuid[]; v_second uuid[];
begin
 select array_agg(id) into v_ids from public.get_incoming_likes_page(30);
 assert cardinality(v_ids)=30, 'Incoming page not bounded';
 select created_at,id into v_cursor from public.get_incoming_likes_page(30) offset 29;
 select array_agg(id) into v_second from public.get_incoming_likes_page(30,v_cursor.created_at,v_cursor.id);
 assert cardinality(v_second)=10 and not v_ids && v_second, 'Incoming ties skipped or repeated';
 select array_agg(id) into v_ids from public.get_sent_likes_page(30);
 select created_at,id into v_cursor from public.get_sent_likes_page(30) offset 29;
 select array_agg(id) into v_second from public.get_sent_likes_page(30,v_cursor.created_at,v_cursor.id);
 assert cardinality(v_ids)=30 and cardinality(v_second)=10 and not v_ids && v_second, 'Sent cursor failed';
 select array_agg(id) into v_ids from public.get_chat_previews_page(30);
 select updated_at,id into v_cursor from public.get_chat_previews_page(30) offset 29;
 select array_agg(id) into v_second from public.get_chat_previews_page(30,v_cursor.updated_at,v_cursor.id);
 assert cardinality(v_ids)=30 and cardinality(v_second)=10 and not v_ids && v_second, 'Chat cursor failed';
 assert not 'd5200000-0000-4000-8000-000000000082'::uuid = any(v_ids), 'Old-chat fixture unexpectedly on first page';
 assert (select count(*) from public.get_chat_previews_page(1,null,null,'d5200000-0000-4000-8000-000000000082'))=1, 'Direct old thread lookup applied LIMIT before ID';
 select array_agg(id) into v_ids from public.get_chat_messages_page('d5200000-0000-4000-8000-000000000082',30);
 select created_at,id into v_cursor from public.get_chat_messages_page('d5200000-0000-4000-8000-000000000082',30) offset 29;
 select array_agg(id) into v_second from public.get_chat_messages_page('d5200000-0000-4000-8000-000000000082',30,v_cursor.created_at,v_cursor.id);
 assert cardinality(v_ids)=30 and cardinality(v_second)=11 and not v_ids && v_second, 'Messages sharing timestamps lost or duplicated';
 assert public.get_social_unread_counts()='{"likes":40,"messages":80}'::jsonb, 'Badges only count loaded pages';
 -- Own card uses the same redaction as another viewer and never invents a bio.
 assert (select workplace is null and bio is null and cardinality(photo_paths)=4 from public.profile_cards where id=auth.uid()), 'Own preview bypassed public redaction';
end $$;
select public.mark_incoming_likes_read(array['d5100000-0000-4000-8000-000000000002']::uuid[]);
select public.mark_chat_read('d5200000-0000-4000-8000-000000000082');
select public.set_chat_hidden('d5200000-0000-4000-8000-000000000083',true);
do $$ begin
 assert public.get_social_unread_counts()='{"likes":39,"messages":38}'::jsonb, 'Reads or hidden threads not reflected in global counters';
end $$;
select set_config('request.jwt.claim.sub','d5000000-0000-4000-8000-000000000002',true);
do $$
declare v_cursor record; v_ids uuid[]; v_second uuid[];
begin
 select array_agg(user_id) into v_ids from public.get_blocked_users_page(30);
 select blocked_at,user_id into v_cursor from public.get_blocked_users_page(30) offset 29;
 select array_agg(user_id) into v_second from public.get_blocked_users_page(30,v_cursor.blocked_at,v_cursor.user_id);
 assert cardinality(v_ids)=30 and cardinality(v_second)=10 and not v_ids && v_second, 'Blocked ties skipped or repeated';
 assert (select bool_and(photo_path is null) from public.get_blocked_users_page(100)), 'Blocked page exposed photos';
 assert (select count(*) from public.get_chat_previews_page(1,null,null,'d5200000-0000-4000-8000-000000000082'))=0, 'Foreign thread exposed';
 assert (select count(*) from public.get_chat_messages_page('d5200000-0000-4000-8000-000000000082'))=0, 'Foreign messages exposed';
 assert (select workplace is null and bio is null from public.profile_cards where id='d5000000-0000-4000-8000-000000000001'), 'Viewer card differs from own preview';
end $$;
select set_config('request.jwt.claim.sub','d5000000-0000-4000-8000-000000000151',true);
do $$ begin
 assert public.get_social_unread_counts()='{"likes":0,"messages":0}'::jsonb, 'Counters exposed another account';
 assert (select count(*) from public.get_blocked_users_page(100))=0, 'Block list exposed another account';
end $$;
reset role;
-- Exceed the hard server cap while requesting 10,000 rows.
insert into public.messages(chat_id,sender_id,body,created_at)
select 'd5200000-0000-4000-8000-000000000082','d5000000-0000-4000-8000-000000000082','Capped','2026-01-01' from generate_series(1,101);
update public.likes set status='dismissed' where id='d5100000-0000-4000-8000-000000000084';
insert into public.user_blocks(blocker_id,blocked_id) values ('d5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000085');
set local role authenticated;
select set_config('request.jwt.claim.sub','d5000000-0000-4000-8000-000000000001',true);
do $$ begin
 assert (select count(*) from public.get_chat_messages_page('d5200000-0000-4000-8000-000000000082',10000))=100, 'Hard limit bypassed';
 assert (select count(*) from public.get_chat_previews_page(100))=38, 'Ended/blocked relationships leaked into pages';
 assert (select count(*) from public.get_chat_messages_page('d5200000-0000-4000-8000-000000000084'))=0, 'Ended messages remained accessible';
end $$;
reset role;
rollback;
