begin;
-- A historical source chat remains stored for audit, with its like dismissed. Aliases
-- disappear when either retained chat is deleted by block/unmatch/account deletion.
create table public.chat_aliases (
  source_chat_id uuid primary key references public.chats(id) on delete cascade,
  canonical_chat_id uuid not null references public.chats(id) on delete cascade,
  repair_key text not null,
  created_at timestamptz not null default now(),
  check (source_chat_id <> canonical_chat_id)
);
create index chat_aliases_canonical_idx on public.chat_aliases(canonical_chat_id);
alter table public.chat_aliases enable row level security;
revoke all on public.chat_aliases from public,anon,authenticated,service_role;

-- Explicit checks also hold when called from another SECURITY DEFINER function.
-- Never reveal a mapping to a nonparticipant, or revive an ended/blocked relationship.
create function public.resolve_chat_id(p_chat_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
 select ch.id from public.chats ch join public.likes l on l.id=ch.like_id
 where ch.id=coalesce((select canonical_chat_id from public.chat_aliases where source_chat_id=p_chat_id),p_chat_id)
   and auth.uid() in (l.from_user_id,l.to_user_id) and l.status='matched'
   and exists(select 1 from public.chat_participants where chat_id=p_chat_id and user_id=auth.uid())
   and exists(select 1 from public.chat_participants where chat_id=ch.id and user_id=auth.uid())
   and (select count(*) from public.profiles where id in (l.from_user_id,l.to_user_id) and suspended_at is null)=2
   and not public.is_blocked_with(case when l.from_user_id=auth.uid() then l.to_user_id else l.from_user_id end);
$$;
revoke all on function public.resolve_chat_id(uuid) from public,anon;
grant execute on function public.resolve_chat_id(uuid) to authenticated;

-- Retries retain their original request target, including after a historical merge.
create or replace function public.message_request_result(p_user uuid,p_request uuid,p_kind text,p_target uuid,p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare receipt public.message_requests; equivalent boolean;
begin
 if p_request is null then raise exception 'Request ID is required.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('message-request:'||p_user::text||':'||p_request::text,0));
 select * into receipt from public.message_requests where user_id=p_user and request_id=p_request;
 if found then
   equivalent := receipt.target_id=p_target;
   if not equivalent and p_kind='send' and receipt.kind='send' and p_user=auth.uid() then
     equivalent := public.resolve_chat_id(receipt.target_id) = public.resolve_chat_id(p_target);
   end if;
   if receipt.kind is distinct from p_kind or receipt.body_hash is distinct from sha256(convert_to(p_body,'UTF8'))
      or equivalent is not true then
     raise exception 'Request ID was already used for another message.' using errcode='22023';
   end if;
   return receipt.result;
 end if;
 return null;
end;
$$;
revoke all on function public.message_request_result(uuid,uuid,text,uuid,text) from public,anon,authenticated;

create or replace function public.send_chat_message_once(p_chat_id uuid, p_body text, p_request_id uuid, p_expected_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cached jsonb;
  v_chat_id uuid;
  v_result jsonb;
  v_user_id uuid := auth.uid();
  v_body text := nullif(btrim(p_body), '');
  v_message public.messages%rowtype;
  v_recipient_id uuid;
  v_sender_name text;
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  if v_body is null or char_length(v_body) > 2000 then
    raise exception 'Message body is required' using errcode = '22023';
  end if;

  if p_expected_user_id is not null and p_expected_user_id <> v_user_id then
    raise exception 'Session changed.' using errcode = '42501';
  end if;
  v_cached := public.message_request_result(v_user_id,p_request_id,'send',p_chat_id,v_body);
  v_chat_id := public.resolve_chat_id(p_chat_id);

  if not exists (
    select 1
    from public.chat_participants cp
    where cp.chat_id = v_chat_id
      and cp.user_id = v_user_id
  ) then
    raise exception 'Chat not found' using errcode = 'P0002';
  end if;

  select cp.user_id into v_recipient_id
  from public.chat_participants cp
  where cp.chat_id = v_chat_id and cp.user_id <> v_user_id limit 1;
  if v_recipient_id is null then
    raise exception 'Chat not found' using errcode = 'P0002';
  end if;
  perform public.lock_user_pair(v_user_id, v_recipient_id);
  perform public.assert_pair_available(v_user_id, v_recipient_id);
  if not exists (
    select 1 from public.chats ch join public.likes l on l.id = ch.like_id
    where ch.id = v_chat_id and l.status = 'matched'
      and exists (select 1 from public.chat_participants where chat_id = ch.id and user_id = v_user_id)
      and exists (select 1 from public.chat_participants where chat_id = ch.id and user_id = v_recipient_id)
  ) then
    raise exception 'Chat not found' using errcode = 'P0002';
  end if;
  if v_cached is not null then
    return v_cached || jsonb_build_object('cached',true,'text',v_body,'chatId',v_chat_id);
  end if;

  perform public.consume_action_limit(v_user_id, 'message', 60, 30);

  insert into public.messages (chat_id, sender_id, body, status,client_request_id)
  values (v_chat_id, v_user_id, v_body, 'sent',p_request_id)
  returning * into v_message;

  update public.chats
  set updated_at = v_message.created_at
  where id = v_chat_id;

  update public.chat_participants
  set last_read_at = v_message.created_at
  where chat_id = v_chat_id
    and user_id = v_user_id;

  select cp.user_id into v_recipient_id
  from public.chat_participants cp
  where cp.chat_id = v_chat_id
    and cp.user_id <> v_user_id
  limit 1;

  select nullif(btrim(display_name), '') into v_sender_name
  from public.profiles where id = v_user_id;

  if v_recipient_id is not null then
    insert into public.activity_events (user_id, event_type, title, description, metadata)
    values (
      v_recipient_id,
      'message',
      coalesce(v_sender_name, 'Someone') || ' sent a message',
      v_body,
      jsonb_build_object('chatId', v_chat_id, 'messageId', v_message.id, 'fromUserId', v_user_id)
    );
  end if;

  v_result := jsonb_build_object(
    'chatId', v_chat_id,
    'id', v_message.id,
    'createdAt', v_message.created_at,
    'senderId', 'me',
    'text', v_message.body,
    'status', v_message.status,
    'senderUserId', v_user_id,
    'recipientId', v_recipient_id,
    'senderName', v_sender_name,
    'clientRequestId', p_request_id
  );
  insert into public.message_requests(user_id,request_id,kind,target_id,body_hash,result)
  values(v_user_id,p_request_id,'send',p_chat_id,sha256(convert_to(v_body,'UTF8')),v_result - 'text');
  return v_result || '{"cached":false}'::jsonb;
end;
$$;
revoke all on function public.send_chat_message_once(uuid,text,uuid,uuid) from public,anon;
grant execute on function public.send_chat_message_once(uuid,text,uuid,uuid) to authenticated;
commit;
