-- Administrative tooling, installed separately from app migrations. Requires all
-- remediation migrations through 20261017120000. Never expose this schema in PostgREST.
begin;
do $$ begin
 if to_regclass('public.chat_aliases') is null then raise exception 'Apply remediation migrations through 20261017120000 first.'; end if;
end $$;
create schema if not exists maintenance;
revoke all on schema maintenance from public,anon,authenticated,service_role;
create table if not exists maintenance.repair_actions (
 repair_key text primary key,
 kind text not null,
 request jsonb not null,
 evidence_ref text not null,
 before_state jsonb not null,
 after_state jsonb not null,
 outcome jsonb not null,
 executed_by text not null default session_user,
 executed_at timestamptz not null default clock_timestamp(),
 transaction_id bigint not null default txid_current()
);
alter table maintenance.repair_actions enable row level security;
revoke all on maintenance.repair_actions from public,anon,authenticated,service_role;

create or replace function maintenance.fingerprint(p_state jsonb)
returns text language sql immutable set search_path=pg_catalog as $$
 select encode(sha256(convert_to(p_state::text,'UTF8')),'hex');
$$;

-- Snapshots contain IDs, state and hashes, never message bodies or profile contact/birth text.
create or replace function maintenance.snapshot(p_kind text,p_args jsonb)
returns jsonb language plpgsql stable set search_path=pg_catalog,public,maintenance as $$
declare a uuid; b uuid; ids uuid[]; result jsonb; path text;
begin
 if p_kind in ('merge_chats','end_relationship') then
   a:=least((p_args->>'userA')::uuid,(p_args->>'userB')::uuid);
   b:=greatest((p_args->>'userA')::uuid,(p_args->>'userB')::uuid);
   if a is null or b is null or a=b then raise exception 'Two different user IDs are required.' using errcode='22023'; end if;
   select array_agg(ch.id order by ch.id) into ids from public.chats ch
   where ch.like_id in (select id from public.likes where least(from_user_id,to_user_id)=a and greatest(from_user_id,to_user_id)=b)
      or (exists(select 1 from public.chat_participants where chat_id=ch.id and user_id=a)
      and exists(select 1 from public.chat_participants where chat_id=ch.id and user_id=b));
   select jsonb_build_object(
    'profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'suspended_at',suspended_at) order by id),'[]') from public.profiles where id in(a,b)),
    'blocks',(select coalesce(jsonb_agg(to_jsonb(x) order by blocker_id,blocked_id),'[]') from public.user_blocks x where (blocker_id=a and blocked_id=b) or(blocker_id=b and blocked_id=a)),
    'likes',(select coalesce(jsonb_agg(to_jsonb(x)-'opening_message'-'compatibility_report' order by id),'[]') from public.likes x where least(from_user_id,to_user_id)=a and greatest(from_user_id,to_user_id)=b),
    'chats',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.chats x where id=any(ids)),
    'participants',(select coalesce(jsonb_agg(to_jsonb(x) order by chat_id,user_id),'[]') from public.chat_participants x where chat_id=any(ids)),
    'messages',(select coalesce(jsonb_agg((to_jsonb(x)-'body')||jsonb_build_object('bodyHash',maintenance.fingerprint(to_jsonb(body))) order by id),'[]') from public.messages x where chat_id=any(ids)),
    'activities',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'userId',user_id,'metadata',metadata) order by id),'[]') from public.activity_events where user_id in(a,b) and metadata->>'chatId' in(select unnest(ids)::text)),
    'aliases',(select coalesce(jsonb_agg(to_jsonb(x) order by source_chat_id),'[]') from public.chat_aliases x where source_chat_id=any(ids) or canonical_chat_id=any(ids))
   ) into result;
 elsif p_kind='refund_debit' then
   select jsonb_build_object('debits',coalesce(jsonb_agg((to_jsonb(t)-'reason')||jsonb_build_object('reasonHash',maintenance.fingerprint(to_jsonb(reason))) order by id),'[]'),
    'refunds',(select coalesce(jsonb_agg(to_jsonb(r)-'reason' order by r.id),'[]') from public.credit_transactions r
      where r.metadata->>'refundOf' in (p_args->>'debitId',p_args->>'keepDebitId')))
   into result from public.credit_transactions t where id in ((p_args->>'debitId')::uuid,(p_args->>'keepDebitId')::uuid);
 elsif p_kind='expire_plan' then
   select to_jsonb(s) into result from public.user_subscriptions s where user_id=(p_args->>'userId')::uuid;
 elsif p_kind='clear_placeholder_city' then
   select jsonb_build_object('id',id,'location',location,'updated_at',updated_at) into result from public.profiles where id=(p_args->>'userId')::uuid;
 elsif p_kind='queue_orphan_photo' then
   path:=p_args->>'path';
   select jsonb_build_object('object',(select to_jsonb(o)-'owner'-'owner_id' from storage.objects o where bucket_id='profile-photos' and name=path),
    'references',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.profile_photos p where storage_path=path),
    'uploads',(select coalesce(jsonb_agg(to_jsonb(u) order by id),'[]') from public.photo_uploads u where storage_path=path),
    'queue',(select to_jsonb(q) from public.photo_cleanup_queue q where storage_path=path)) into result;
 else raise exception 'Unsupported repair kind.' using errcode='22023';
 end if;
 return coalesce(result,'null'::jsonb);
end;
$$;

-- Default dry run is also valid in a READ ONLY transaction; it writes no preview/audit rows.
-- Apply is an explicit, single reviewed action, never a sweep of all audit candidates.
create or replace function maintenance.repair(
 p_key text,p_kind text,p_args jsonb,p_expected text,p_evidence text,p_dry_run boolean default true
) returns jsonb language plpgsql set search_path=pg_catalog,public,maintenance as $$
declare
 prior maintenance.repair_actions; before_state jsonb; after_state jsonb; request jsonb;
 outcome jsonb; a uuid; b uuid; canonical uuid; source_ids uuid[]; all_ids uuid[];
 debit public.credit_transactions; keep_debit public.credit_transactions; refunded bigint; remaining bigint;
 v_user uuid; at_time timestamptz; path text; object_created timestamptz;
begin
 if p_dry_run is null or p_key is null or p_key !~ '^[A-Za-z0-9._:-]{1,128}$'
    or jsonb_typeof(p_args) is distinct from 'object'
    or nullif(btrim(p_evidence),'') is null or char_length(p_evidence)>1000 then
   raise exception 'Provide a repair key, object arguments, evidence reference and explicit mode.' using errcode='22023';
 end if;
 request:=jsonb_build_object('kind',p_kind,'args',p_args,'expected',p_expected,'evidence',p_evidence);
 if not p_dry_run then perform pg_advisory_xact_lock(hashtextextended('repair:'||p_key,0)); end if;
 select * into prior from maintenance.repair_actions where repair_key=p_key;
 if found then
   if prior.request is distinct from request then raise exception 'Repair key already used for another request.' using errcode='22023'; end if;
   return prior.outcome||jsonb_build_object('alreadyApplied',true,'dryRun',p_dry_run);
 end if;
 -- Acquire the same application locks before re-reading the inspected state.
 if p_kind in ('merge_chats','end_relationship') then
   a:=least((p_args->>'userA')::uuid,(p_args->>'userB')::uuid);
   b:=greatest((p_args->>'userA')::uuid,(p_args->>'userB')::uuid);
   if not p_dry_run then
     perform public.lock_user_pair(a,b);
     perform 1 from public.likes where least(from_user_id,to_user_id)=a and greatest(from_user_id,to_user_id)=b order by id for update;
     select array_agg(ch.id) into all_ids from public.chats ch
       where ch.like_id in(select id from public.likes where least(from_user_id,to_user_id)=a and greatest(from_user_id,to_user_id)=b)
          or (exists(select 1 from public.chat_participants where chat_id=ch.id and user_id=a)
          and exists(select 1 from public.chat_participants where chat_id=ch.id and user_id=b));
     perform 1 from public.chats where id=any(all_ids) order by id for update;
     perform 1 from public.messages where chat_id=any(all_ids) order by id for update;
     perform 1 from public.chat_participants where chat_id=any(all_ids) order by chat_id,user_id for update;
     perform 1 from public.activity_events where user_id in(a,b) and metadata->>'chatId' in(select unnest(all_ids)::text) order by id for update;
   end if;
 elsif p_kind='refund_debit' then
   select * into debit from public.credit_transactions where id=(p_args->>'debitId')::uuid;
   if not p_dry_run then perform pg_advisory_xact_lock(hashtextextended('credits:'||debit.user_id::text,0)); end if;
 elsif p_kind in ('expire_plan','clear_placeholder_city') then
   v_user:=(p_args->>'userId')::uuid;
   if not p_dry_run then
     if p_kind='expire_plan' then perform 1 from public.user_subscriptions s where s.user_id=v_user for update;
     else perform 1 from public.profiles where id=v_user for update; end if;
   end if;
 elsif p_kind='queue_orphan_photo' then
   path:=p_args->>'path';
   if path !~ '^[0-9a-fA-F-]{36}/[^/]+$' or path like '%..%' then raise exception 'Invalid owned photo path.' using errcode='22023'; end if;
   v_user:=split_part(path,'/',1)::uuid;
   if not p_dry_run then perform 1 from public.profiles where id=v_user for update; end if;
 end if;
 before_state:=maintenance.snapshot(p_kind,p_args);
 if p_expected is null or maintenance.fingerprint(before_state)<>p_expected then
   raise exception 'Inspected data changed. Audit and review again.' using errcode='40001';
 end if;
 outcome:=jsonb_build_object('kind',p_kind,'repairKey',p_key,'dryRun',p_dry_run,'beforeFingerprint',p_expected);
 if p_kind in ('merge_chats','end_relationship') then
   if jsonb_array_length(before_state->'profiles')<>2 then raise exception 'Pair profiles missing.' using errcode='22023'; end if;
   select array_agg((x->>'id')::uuid) into all_ids from jsonb_array_elements(before_state->'chats') x;
   if p_kind='end_relationship' then
     if not (jsonb_array_length(before_state->'blocks')>0
       or exists(select 1 from jsonb_array_elements(before_state->'profiles') p where p->>'suspended_at' is not null)
       or exists(select 1 from public.likes l where least(from_user_id,to_user_id)=a and greatest(from_user_id,to_user_id)=b
         and ((status='matched' and not exists(select 1 from public.chats where like_id=l.id))
           or (status='dismissed' and not exists(select 1 from public.chats ch join public.chat_aliases al on al.source_chat_id=ch.id where ch.like_id=l.id))))) then
       raise exception 'No blocked, suspended or ended relationship evidence.' using errcode='22023';
     end if;
     outcome:=outcome||jsonb_build_object('preservedChats',coalesce(cardinality(all_ids),0));
     if not p_dry_run then update public.likes set status='dismissed' where least(from_user_id,to_user_id)=a and greatest(from_user_id,to_user_id)=b; end if;
   else
     canonical:=(p_args->>'canonicalChatId')::uuid;
     if canonical is null or not coalesce(canonical=any(all_ids),false)
       or exists(select 1 from public.chat_aliases where source_chat_id=canonical) then
       raise exception 'Choose an original canonical chat from this pair.' using errcode='22023'; end if;
     perform public.assert_pair_available(a,b);
     if (select count(*) from public.chats ch where id=any(all_ids) and not exists(select 1 from public.chat_aliases where source_chat_id=ch.id))<2 then
       raise exception 'At least two unresolved chats are required.' using errcode='22023'; end if;
     if exists(select 1 from public.likes l where least(from_user_id,to_user_id)=a and greatest(from_user_id,to_user_id)=b and status='dismissed'
       and not exists(select 1 from public.chats ch join public.chat_aliases al on al.source_chat_id=ch.id where ch.like_id=l.id)) then
       raise exception 'An ended relationship cannot be merged or reopened.' using errcode='22023'; end if;
     if exists(select 1 from public.chats ch left join public.likes l on l.id=ch.like_id where ch.id=any(all_ids)
        and (l.id is null or least(l.from_user_id,l.to_user_id)<>a or greatest(l.from_user_id,l.to_user_id)<>b
         or (l.status<>'matched' and not exists(select 1 from public.chat_aliases where source_chat_id=ch.id))
         or (select count(*) from public.chat_participants where chat_id=ch.id)<>2
         or not exists(select 1 from public.chat_participants where chat_id=ch.id and user_id=a)
         or not exists(select 1 from public.chat_participants where chat_id=ch.id and user_id=b)))
        or exists(select 1 from public.messages where chat_id=any(all_ids) and sender_id not in(a,b)) then
       raise exception 'Unexpected chat membership or relationship. Manual investigation required.' using errcode='22023'; end if;
     select array_agg(id) into source_ids from public.chats where id=any(all_ids) and id<>canonical;
     outcome:=outcome||jsonb_build_object('canonicalChatId',canonical,'sourceChatIds',source_ids,
       'messagesToMove',(select count(*) from public.messages where chat_id=any(source_ids)));
     if not p_dry_run then
       -- Conservatively retain hidden state and the oldest read cursor, including NULL.
       update public.chat_participants cp set hidden=merged.hidden,last_read_at=merged.last_read_at
       from (select user_id,bool_or(hidden) hidden,case when bool_or(last_read_at is null) then null else min(last_read_at) end last_read_at
         from public.chat_participants where chat_id=any(all_ids) group by user_id) merged
       where cp.chat_id=canonical and cp.user_id=merged.user_id;
       update public.messages set chat_id=canonical where chat_id=any(source_ids);
       update public.activity_events set metadata=jsonb_set(metadata,'{chatId}',to_jsonb(canonical::text))
         where user_id in(a,b) and metadata->>'chatId' in(select unnest(source_ids)::text);
       update public.chat_aliases set canonical_chat_id=canonical where canonical_chat_id=any(source_ids);
       insert into public.chat_aliases(source_chat_id,canonical_chat_id,repair_key)
         select id,canonical,p_key from unnest(source_ids) ids(id)
         on conflict(source_chat_id) do update set canonical_chat_id=excluded.canonical_chat_id;
       update public.likes set status='dismissed' where least(from_user_id,to_user_id)=a and greatest(from_user_id,to_user_id)=b
         and id<>(select like_id from public.chats where id=canonical);
       update public.chats set updated_at=greatest((select max(updated_at) from public.chats where id=any(all_ids)),
         (select max(created_at) from public.messages where chat_id=canonical)) where id=canonical;
       -- Message IDs, read receipts, request IDs, receipts, source chats and source participants are retained.
     end if;
   end if;
 elsif p_kind='refund_debit' then
   select * into debit from public.credit_transactions where id=(p_args->>'debitId')::uuid;
   select * into keep_debit from public.credit_transactions where id=(p_args->>'keepDebitId')::uuid;
   if debit.id is null or keep_debit.id is null or debit.id=keep_debit.id or debit.user_id<>keep_debit.user_id
      or debit.amount>=0 or keep_debit.amount>=0 or debit.amount<>keep_debit.amount then
     raise exception 'Choose two equal debits for the same account, and retain one.' using errcode='22023'; end if;
   if (debit.metadata->>'action' is not null and keep_debit.metadata->>'action' is not null and debit.metadata->>'action'<>keep_debit.metadata->>'action')
      or (debit.metadata->>'targetUserId' is not null and keep_debit.metadata->>'targetUserId' is not null and debit.metadata->>'targetUserId'<>keep_debit.metadata->>'targetUserId') then
     raise exception 'Debits describe different actions or targets.' using errcode='22023'; end if;
   if exists(select 1 from public.credit_transactions where metadata->>'refundOf'=keep_debit.id::text and amount>0) then
     raise exception 'Retained debit has a refund; review the reconciliation.' using errcode='22023'; end if;
   select coalesce(sum(amount),0) into refunded from public.credit_transactions where user_id=debit.user_id and metadata->>'refundOf'=debit.id::text and amount>0;
   remaining:=-debit.amount::bigint-refunded;
   if remaining<0 then raise exception 'Debit already over-refunded.' using errcode='22023'; end if;
   outcome:=outcome||jsonb_build_object('debitId',debit.id,'keepDebitId',keep_debit.id,'creditsToRestore',remaining);
   if not p_dry_run and remaining>0 then
     insert into public.credit_transactions(user_id,amount,reason,metadata) values(debit.user_id,remaining::integer,'Historical duplicate debit correction',
       jsonb_build_object('action','repair_refund','refundOf',debit.id,'repairKey',p_key,'retainedDebitId',keep_debit.id));
   end if;
 elsif p_kind='expire_plan' then
   at_time:=(p_args->>'asOf')::timestamptz;
   if at_time is null or not isfinite(at_time) or at_time>clock_timestamp() or before_state='null'::jsonb
      or before_state->>'status'<>'active' or (before_state->>'renewal_date')::timestamptz>at_time then
     raise exception 'Plan is not expired at the reviewed cutoff.' using errcode='22023'; end if;
   if not p_dry_run then update public.user_subscriptions s set status='expired',updated_at=clock_timestamp() where s.user_id=v_user; end if;
 elsif p_kind='clear_placeholder_city' then
   if btrim(before_state->>'location') is distinct from 'India' then raise exception 'City is not the exact legacy placeholder.' using errcode='22023'; end if;
   if not p_dry_run then update public.profiles set location=null,updated_at=clock_timestamp() where id=v_user; end if;
 elsif p_kind='queue_orphan_photo' then
   object_created:=(before_state->'object'->>'created_at')::timestamptz;
   if not exists(select 1 from public.profiles where id=v_user) or before_state->'object'='null'::jsonb
      or object_created is null or object_created>clock_timestamp()-interval '24 hours'
      or jsonb_array_length(before_state->'references')>0
      or exists(select 1 from public.photo_uploads where storage_path=path and status='pending' and expires_at>clock_timestamp()) then
     raise exception 'Photo is referenced, recent, reserved, missing or has no owning profile.' using errcode='22023'; end if;
   if not p_dry_run then insert into public.photo_cleanup_queue(storage_path,user_id) values(path,v_user) on conflict do nothing; end if;
 else raise exception 'Unsupported repair kind.' using errcode='22023';
 end if;
 if p_dry_run then return outcome; end if;
 after_state:=maintenance.snapshot(p_kind,p_args);
 outcome:=outcome||jsonb_build_object('afterFingerprint',maintenance.fingerprint(after_state));
 insert into maintenance.repair_actions(repair_key,kind,request,evidence_ref,before_state,after_state,outcome)
 values(p_key,p_kind,request,p_evidence,before_state,after_state,outcome);
 return outcome;
end;
$$;
create or replace function maintenance.audit()
returns table(issue text,entity_key text,details jsonb)
language sql stable set search_path=pg_catalog,public,maintenance as $$
 with pairs as (
   select least(from_user_id,to_user_id) a,greatest(from_user_id,to_user_id) b,
     array_agg(id order by created_at,id) like_ids,count(*) filter(where status in('pending','matched')) active_likes
   from public.likes group by 1,2
 ), connections as (
   select p.*,(select count(*) from public.chats ch where ch.like_id=any(p.like_ids)
     and not exists(select 1 from public.chat_aliases where source_chat_id=ch.id)) chat_count from pairs p
 ), identified_debits as (
   select t.* from public.credit_transactions t where amount<0
     and metadata->>'action' in ('like','match_score') and nullif(metadata->>'targetUserId','') is not null
 ), repeated_debits as (
   select user_id,metadata->>'action' action,metadata->>'targetUserId' target,array_agg(id order by created_at,id) ids
   from identified_debits group by 1,2,3 having count(*)>1
 )
 select 'duplicate_live_pair',a::text||':'||b::text,jsonb_build_object('likeIds',like_ids,'activeLikes',active_likes,'unresolvedChats',chat_count)
 from connections where active_likes>1 or chat_count>1
 union all
 select 'blocked_active_like',l.id::text,jsonb_build_object('userA',least(from_user_id,to_user_id),'userB',greatest(from_user_id,to_user_id),'status',status)
 from public.likes l where status<>'dismissed' and exists(select 1 from public.user_blocks where
   (blocker_id=l.from_user_id and blocked_id=l.to_user_id) or (blocker_id=l.to_user_id and blocked_id=l.from_user_id))
 union all
 select 'ended_or_invalid_chat',ch.id::text,jsonb_build_object('likeId',ch.like_id,'status',l.status,'messages',(select count(*) from public.messages where chat_id=ch.id))
 from public.chats ch left join public.likes l on l.id=ch.like_id
 where not exists(select 1 from public.chat_aliases where source_chat_id=ch.id)
 and (l.id is null or l.status<>'matched' or (select count(*) from public.chat_participants where chat_id=ch.id)<>2
   or not exists(select 1 from public.chat_participants where chat_id=ch.id and user_id=l.from_user_id)
   or not exists(select 1 from public.chat_participants where chat_id=ch.id and user_id=l.to_user_id))
 union all
 select 'matched_like_without_chat',id::text,jsonb_build_object('userA',from_user_id,'userB',to_user_id)
 from public.likes l where status='matched' and not exists(select 1 from public.chats where like_id=l.id)
 union all
 -- These are candidates, never a determination that a refund is owed. In particular,
 -- one score debit and one like debit are distinct, and refunded debits remain in history.
 select 'repeated_debit_candidate',user_id::text||':'||action||':'||target,
   jsonb_build_object('userId',user_id,'action',action,'targetUserId',target,'debitIds',ids,
     'refunds',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'refundOf',metadata->>'refundOf','amount',amount) order by id),'[]')
       from public.credit_transactions where metadata->>'refundOf' in(select unnest(ids)::text)))
 from repeated_debits
 union all
 select 'unattributed_debit',id::text,jsonb_build_object('userId',user_id,'amount',amount,'reasonHash',maintenance.fingerprint(to_jsonb(reason)))
 from public.credit_transactions where amount<0 and (metadata->>'action' is null or metadata->>'targetUserId' is null)
 union all
 select 'expired_active_plan',user_id::text,jsonb_build_object('planId',plan_id,'renewalDate',renewal_date)
 from public.user_subscriptions where status='active' and (renewal_date is null or renewal_date<=transaction_timestamp())
 union all
 select 'profile_photo_count',p.id::text,jsonb_build_object('completed',p.onboarding_completed,'count',count(pp.id))
 from public.profiles p left join public.profile_photos pp on pp.user_id=p.id group by p.id
 having count(pp.id)>6 or(p.onboarding_completed and count(pp.id)<4)
 union all
 select 'missing_photo_object',p.id::text,jsonb_build_object('userId',p.user_id,'path',p.storage_path)
 from public.profile_photos p where not exists(select 1 from storage.objects where bucket_id='profile-photos' and name=p.storage_path)
 union all
 select 'orphan_photo_object',o.id::text,jsonb_build_object('path',o.name,'createdAt',to_jsonb(o)->>'created_at',
   'queued',exists(select 1 from public.photo_cleanup_queue where storage_path=o.name),
   'hasLiveReservation',exists(select 1 from public.photo_uploads where storage_path=o.name and status='pending' and expires_at>transaction_timestamp()))
 from storage.objects o where bucket_id='profile-photos' and not exists(select 1 from public.profile_photos where storage_path=o.name)
 union all
 select 'legacy_city',id::text,jsonb_build_object('placeholder',btrim(location)='India','completed',onboarding_completed)
 from public.profiles where nullif(btrim(location),'') is null or btrim(location)='India'
 union all
 select 'legacy_text_limits',id::text,jsonb_build_object('nameLength',char_length(display_name),'bioLength',char_length(bio),'contactLength',char_length(email))
 from public.profiles where char_length(display_name)>80 or char_length(bio)>500 or char_length(email)>254
 union all
 select 'birth_details_review',id::text,jsonb_build_object('completed',onboarding_completed,'defaultDate',date_of_birth=date '2000-01-01',
   'midnight',time_of_birth=time '00:00','missingInputs',date_of_birth is null or time_of_birth is null or nullif(btrim(birth_place),'') is null
     or birth_latitude is null or birth_longitude is null or nullif(btrim(birth_timezone),'') is null,
   'revision',birth_details_revision)
 from public.profiles where onboarding_completed and (date_of_birth=date '2000-01-01' or time_of_birth=time '00:00'
   or date_of_birth is null or time_of_birth is null or nullif(btrim(birth_place),'') is null
   or birth_latitude is null or birth_longitude is null or nullif(btrim(birth_timezone),'') is null)
 union all
 select 'chart_revision_review',p.id::text,jsonb_build_object('profileRevision',p.birth_details_revision,'chartRevision',k.input_revision,'hasChart',k.id is not null)
 from public.profiles p left join public.kundlis k on k.user_id=p.id
 where p.onboarding_completed and (k.id is null or k.input_revision is distinct from p.birth_details_revision)
 union all
 select 'score_revision_review',m.id::text,jsonb_build_object('userA',a.id,'userB',b.id,'hasSignature',m.input_signature is not null)
 from public.match_scores m join public.profiles a on a.id=m.user_a_id join public.profiles b on b.id=m.user_b_id
 where m.input_signature is null or m.input_signature->>'aRevision' is distinct from a.birth_details_revision::text
   or m.input_signature->>'bRevision' is distinct from b.birth_details_revision::text;
$$;

revoke all on all functions in schema maintenance from public,anon,authenticated,service_role;
commit;
