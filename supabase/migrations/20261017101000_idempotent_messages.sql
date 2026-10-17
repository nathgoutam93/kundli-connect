begin;
alter table public.messages add column client_request_id uuid;
create unique index messages_sender_request_idx on public.messages(sender_id,client_request_id) where client_request_id is not null;
create table public.message_requests (
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  kind text not null check (kind in ('send','reply')),
  target_id uuid not null,
  body_hash bytea not null check (octet_length(body_hash) = 32),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
alter table public.message_requests enable row level security;
revoke all on public.message_requests from public,anon,authenticated;

create function public.message_request_result(p_user uuid,p_request uuid,p_kind text,p_target uuid,p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare receipt public.message_requests;
begin
  if p_request is null then raise exception 'Request ID is required.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('message-request:' || p_user::text || ':' || p_request::text,0));
  select * into receipt from public.message_requests where user_id = p_user and request_id = p_request;
  if found then
    if (receipt.kind,receipt.target_id,receipt.body_hash) is distinct from (p_kind,p_target,sha256(convert_to(p_body,'UTF8'))) then
      raise exception 'Request ID was already used for another message.' using errcode = '22023';
    end if;
    return receipt.result;
  end if;
  return null;
end;
$$;
revoke all on function public.message_request_result(uuid,uuid,text,uuid,text) from public,anon,authenticated;

create or replace function public.reply_to_like_once(p_like_id uuid, p_message text, p_request_id uuid, p_expected_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cached jsonb;
  v_result jsonb;
  v_user_id uuid := auth.uid();
  v_message text := nullif(btrim(p_message), '');
  v_now timestamptz := now();
  v_like public.likes%rowtype;
  v_chat_id uuid;
  v_is_new_match boolean;
  v_replier_name text;
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  if v_message is null or char_length(v_message) > 2000 then
    raise exception 'Message is required' using errcode = '22023';
  end if;

  if p_expected_user_id is not null and p_expected_user_id <> v_user_id then
    raise exception 'Session changed.' using errcode = '42501';
  end if;
  v_cached := public.message_request_result(v_user_id,p_request_id,'reply',p_like_id,v_message);

  select * into v_like
  from public.likes
  where id = p_like_id
    and to_user_id = v_user_id;

  if not found then
    raise exception 'Like not found.' using errcode = 'P0002';
  end if;

  perform public.lock_user_pair(v_like.from_user_id, v_user_id);
  select * into v_like from public.likes
  where id = p_like_id and to_user_id = v_user_id for update;
  if not found then
    raise exception 'Like not found.' using errcode = 'P0002';
  end if;
  perform public.assert_pair_available(v_user_id, v_like.from_user_id);

  if v_like.status = 'dismissed' then
    raise exception 'Cannot reply to a dismissed like.' using errcode = '22023';
  end if;

  select id into v_chat_id from public.chats where like_id = v_like.id;
  if v_chat_id is null and v_like.status <> 'pending' then
    raise exception 'This interaction has ended.' using errcode = 'P0002';
  end if;
  -- Legacy reciprocal likes must reuse an existing conversation rather than create a second.
  if v_chat_id is null then
    select id into v_chat_id from public.chats
    where id in (select public.chats_between(v_user_id, v_like.from_user_id))
    order by created_at, id limit 1;
  end if;
  if v_chat_id is not null and (
    not exists (select 1 from public.chat_participants where chat_id = v_chat_id and user_id = v_user_id)
    or not exists (select 1 from public.chat_participants where chat_id = v_chat_id and user_id = v_like.from_user_id)
  ) then raise exception 'Chat not found.' using errcode = 'P0002'; end if;
  v_is_new_match := v_chat_id is null;

  if v_cached is not null then
    if v_is_new_match or (v_cached->>'chatId')::uuid is distinct from v_chat_id then
      raise exception 'This interaction has ended.' using errcode = 'P0002';
    end if;
    return v_cached || '{"cached":true}'::jsonb;
  end if;

  perform public.consume_action_limit(v_user_id, 'message', 60, 30);

  if v_is_new_match then
    insert into public.chats (like_id, created_at, updated_at)
    values (v_like.id, v_now, v_now)
    returning id into v_chat_id;

    insert into public.chat_participants (chat_id, user_id, last_read_at)
    values
      (v_chat_id, v_like.from_user_id, null),
      (v_chat_id, v_user_id, v_now)
    on conflict (chat_id, user_id) do nothing;

    insert into public.messages (chat_id, sender_id, body, created_at, status, read_at)
    values (
      v_chat_id,
      v_like.from_user_id,
      coalesce(nullif(btrim(v_like.opening_message), ''), 'Sent you a like.'),
      v_like.created_at,
      'read',
      v_now
    );
  end if;

  insert into public.messages (chat_id, sender_id, body, created_at, status,client_request_id)
  values (v_chat_id, v_user_id, v_message, v_now, 'sent',p_request_id);

  update public.chats set updated_at = v_now where id = v_chat_id;
  update public.chat_participants
  set last_read_at = v_now
  where chat_id = v_chat_id and user_id = v_user_id;

  update public.likes set status = 'matched' where id = v_like.id and status <> 'matched';

  select nullif(btrim(display_name), '') into v_replier_name
  from public.profiles where id = v_user_id;

  if v_is_new_match then
    insert into public.activity_events (user_id, event_type, title, description, metadata)
    values
      (
        v_user_id, 'match', 'You made a match', v_message,
        jsonb_build_object('likeId', v_like.id, 'chatId', v_chat_id)
      ),
      (
        v_like.from_user_id, 'match',
        coalesce(v_replier_name, 'Someone') || ' matched with you',
        'Open Chats to continue the conversation.',
        jsonb_build_object('likeId', v_like.id, 'chatId', v_chat_id)
      );
  end if;

  v_result := jsonb_build_object(
    'chatId', v_chat_id,
    'recipientId', v_like.from_user_id,
    'replierName', v_replier_name,
    'replierId', v_user_id,
    'isNewMatch', v_is_new_match
  );
  insert into public.message_requests(user_id,request_id,kind,target_id,body_hash,result)
  values(v_user_id,p_request_id,'reply',p_like_id,sha256(convert_to(v_message,'UTF8')),v_result);
  return v_result || '{"cached":false}'::jsonb;
end;
$$;


create or replace function public.send_chat_message_once(p_chat_id uuid, p_body text, p_request_id uuid, p_expected_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cached jsonb;
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

  if not exists (
    select 1
    from public.chat_participants cp
    where cp.chat_id = p_chat_id
      and cp.user_id = v_user_id
  ) then
    raise exception 'Chat not found' using errcode = 'P0002';
  end if;

  select cp.user_id into v_recipient_id
  from public.chat_participants cp
  where cp.chat_id = p_chat_id and cp.user_id <> v_user_id limit 1;
  if v_recipient_id is null then
    raise exception 'Chat not found' using errcode = 'P0002';
  end if;
  perform public.lock_user_pair(v_user_id, v_recipient_id);
  perform public.assert_pair_available(v_user_id, v_recipient_id);
  if not exists (
    select 1 from public.chats ch join public.likes l on l.id = ch.like_id
    where ch.id = p_chat_id and l.status = 'matched'
      and exists (select 1 from public.chat_participants where chat_id = ch.id and user_id = v_user_id)
      and exists (select 1 from public.chat_participants where chat_id = ch.id and user_id = v_recipient_id)
  ) then
    raise exception 'Chat not found' using errcode = 'P0002';
  end if;
  if v_cached is not null then
    return v_cached || jsonb_build_object('cached',true,'text',v_body);
  end if;

  perform public.consume_action_limit(v_user_id, 'message', 60, 30);

  insert into public.messages (chat_id, sender_id, body, status,client_request_id)
  values (p_chat_id, v_user_id, v_body, 'sent',p_request_id)
  returning * into v_message;

  update public.chats
  set updated_at = v_message.created_at
  where id = p_chat_id;

  update public.chat_participants
  set last_read_at = v_message.created_at
  where chat_id = p_chat_id
    and user_id = v_user_id;

  select cp.user_id into v_recipient_id
  from public.chat_participants cp
  where cp.chat_id = p_chat_id
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
      jsonb_build_object('chatId', p_chat_id, 'messageId', v_message.id, 'fromUserId', v_user_id)
    );
  end if;

  v_result := jsonb_build_object(
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


revoke all on function public.reply_to_like_once(uuid,text,uuid,uuid) from public,anon;
revoke all on function public.send_chat_message_once(uuid,text,uuid,uuid) from public,anon;
grant execute on function public.reply_to_like_once(uuid,text,uuid,uuid) to authenticated;
grant execute on function public.send_chat_message_once(uuid,text,uuid,uuid) to authenticated;
-- Require a request ID on every authenticated write path, including raw PostgREST calls.
revoke all on function public.reply_to_like(uuid,text) from public,anon,authenticated;
revoke all on function public.send_chat_message(uuid,text) from public,anon,authenticated;
commit;
