-- Keep authorization in Postgres: authenticated clients can call these RPCs directly.
-- Do not delete/merge historical duplicates in a schema deployment; audit them separately.
begin;

create or replace function public.lock_user_pair(p_a uuid, p_b uuid)
returns void language sql security definer set search_path = public as $$
  select pg_advisory_xact_lock(hashtextextended(
    'pair:' || least(p_a, p_b)::text || ':' || greatest(p_a, p_b)::text, 0
  ));
$$;
revoke all on function public.lock_user_pair(uuid, uuid) from public, anon, authenticated;

create or replace function public.assert_pair_available(p_a uuid, p_b uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_a is null or p_b is null or p_a = p_b
     or (select count(*) from public.profiles where id in (p_a, p_b) and suspended_at is null) <> 2
     or exists (select 1 from public.user_blocks
       where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)) then
    raise exception 'This interaction is unavailable.' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.assert_pair_available(uuid, uuid) from public, anon, authenticated;

create table public.action_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  attempts integer not null,
  primary key (user_id, action)
);
alter table public.action_limits enable row level security;
revoke all on public.action_limits from public, anon, authenticated;

create or replace function public.consume_action_limit(p_user uuid, p_action text, p_seconds integer, p_max integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_attempts integer;
begin
  insert into public.action_limits as limits(user_id, action, window_start, attempts)
  values (p_user, p_action, clock_timestamp(), 1)
  on conflict (user_id, action) do update set
    attempts = case when limits.window_start <= clock_timestamp() - make_interval(secs => p_seconds)
      then 1 else limits.attempts + 1 end,
    window_start = case when limits.window_start <= clock_timestamp() - make_interval(secs => p_seconds)
      then clock_timestamp() else limits.window_start end
  returning attempts into v_attempts;
  if v_attempts > p_max then
    raise exception 'Too many requests. Please try again shortly.' using errcode = 'P0429';
  end if;
end;
$$;
revoke all on function public.consume_action_limit(uuid, text, integer, integer) from public, anon, authenticated;

create index if not exists likes_pair_idx on public.likes
  (least(from_user_id, to_user_id), greatest(from_user_id, to_user_id));

-- Covers service-role inserts as well as the transactional API; serializes opposite-direction likes.
create or replace function public.guard_like_pair()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_user_pair(new.from_user_id, new.to_user_id);
  perform public.assert_pair_available(new.from_user_id, new.to_user_id);
  if exists (select 1 from public.likes
    where least(from_user_id, to_user_id) = least(new.from_user_id, new.to_user_id)
      and greatest(from_user_id, to_user_id) = greatest(new.from_user_id, new.to_user_id)) then
    raise exception 'An interaction already exists.' using errcode = '23505';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_like_pair() from public, anon, authenticated;
create trigger guard_like_pair before insert on public.likes for each row execute function public.guard_like_pair();

-- Credit debit and like insertion commit together, including for concurrent reciprocal requests.
create or replace function public.create_like(p_target_profile_id uuid, p_opening_message text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_message text := nullif(btrim(p_opening_message), '');
  v_like public.likes%rowtype;
  v_score uuid;
  v_allowed boolean;
  v_transaction uuid;
begin
  if v_user is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  if v_message is null or char_length(v_message) > 300 then
    raise exception 'Opening message must contain 1 to 300 characters.' using errcode = '22023';
  end if;
  perform public.lock_user_pair(v_user, p_target_profile_id);
  perform public.assert_pair_available(v_user, p_target_profile_id);
  select * into v_like from public.likes
    where least(from_user_id, to_user_id) = least(v_user, p_target_profile_id)
      and greatest(from_user_id, to_user_id) = greatest(v_user, p_target_profile_id)
    order by created_at, id limit 1;
  if found then
    if v_like.status = 'dismissed' then
      raise exception 'This interaction has ended.' using errcode = 'P0002';
    end if;
    return jsonb_build_object('like', to_jsonb(v_like), 'existing', true);
  end if;
  if not exists (select 1 from public.profiles where id = p_target_profile_id and onboarding_completed and is_discoverable) then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;
  select id into v_score from public.match_scores
    where user_a_id = least(v_user, p_target_profile_id) and user_b_id = greatest(v_user, p_target_profile_id);
  if v_score is null then
    raise exception 'Generate a match score before sending a like.' using errcode = '22023';
  end if;
  perform public.consume_action_limit(v_user, 'like', 60, 20);
  select allowed, transaction_id into v_allowed, v_transaction
    from public.spend_user_credit(v_user, 'Sent a like');
  if not v_allowed then raise exception 'Credits needed' using errcode = 'P0402'; end if;
  insert into public.likes(from_user_id, to_user_id, opening_message, match_score_id, status)
    values (v_user, p_target_profile_id, v_message, v_score, 'pending') returning * into v_like;
  if v_transaction is not null then
    update public.credit_transactions set metadata = metadata || jsonb_build_object('action', 'like', 'targetUserId', p_target_profile_id, 'likeId', v_like.id)
    where id = v_transaction;
  end if;
  return jsonb_build_object('like', to_jsonb(v_like), 'existing', false);
end;
$$;
revoke all on function public.create_like(uuid, text) from public, anon;
grant execute on function public.create_like(uuid, text) to authenticated;

create or replace function public.apply_block(p_blocker uuid, p_blocked uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_user_pair(p_blocker, p_blocked);
  insert into public.user_blocks(blocker_id, blocked_id) values (p_blocker, p_blocked) on conflict do nothing;
  update public.likes set status = 'dismissed'
    where (from_user_id = p_blocker and to_user_id = p_blocked)
       or (from_user_id = p_blocked and to_user_id = p_blocker);
  delete from public.chats where id in (select public.chats_between(p_blocker, p_blocked));
end;
$$;

create or replace function public.unmatch_chat(p_chat_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_other uuid;
begin
  if v_user is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  select other.user_id into v_other
  from public.chat_participants mine join public.chat_participants other on other.chat_id = mine.chat_id
  where mine.chat_id = p_chat_id and mine.user_id = v_user and other.user_id <> v_user limit 1;
  if v_other is null then raise exception 'Chat not found' using errcode = 'P0002'; end if;
  perform public.lock_user_pair(v_user, v_other);
  if not exists (select 1 from public.chat_participants where chat_id = p_chat_id and user_id = v_user) then
    raise exception 'Chat not found' using errcode = 'P0002';
  end if;
  update public.likes set status = 'dismissed'
    where (from_user_id = v_user and to_user_id = v_other) or (from_user_id = v_other and to_user_id = v_user);
  delete from public.chats where id in (select public.chats_between(v_user, v_other));
end;
$$;

create or replace function public.reply_to_like(p_like_id uuid, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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
  v_is_new_match := v_chat_id is null;

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

  insert into public.messages (chat_id, sender_id, body, created_at, status)
  values (v_chat_id, v_user_id, v_message, v_now, 'sent');

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

  return jsonb_build_object(
    'chatId', v_chat_id,
    'recipientId', v_like.from_user_id,
    'replierName', v_replier_name,
    'replierId', v_user_id,
    'isNewMatch', v_is_new_match
  );
end;
$$;


create or replace function public.send_chat_message(
  p_chat_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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
  perform public.consume_action_limit(v_user_id, 'message', 60, 30);

  insert into public.messages (chat_id, sender_id, body, status)
  values (p_chat_id, v_user_id, v_body, 'sent')
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

  return jsonb_build_object(
    'id', v_message.id,
    'createdAt', v_message.created_at,
    'senderId', 'me',
    'text', v_message.body,
    'status', v_message.status,
    'senderUserId', v_user_id,
    'recipientId', v_recipient_id,
    'senderName', v_sender_name
  );
end;
$$;


-- Existing blocked/stale matched likes can no longer be actionable. No conversation data is deleted here.
update public.likes l set status = 'dismissed'
where exists (select 1 from public.user_blocks b
  where (b.blocker_id = l.from_user_id and b.blocked_id = l.to_user_id)
     or (b.blocker_id = l.to_user_id and b.blocked_id = l.from_user_id))
  or (l.status = 'matched' and not exists (select 1 from public.chats where like_id = l.id));

-- Historical chats recreated through the old hole remain preserved for audit, but cannot
-- appear in lists or be read by bypassing the UI after their relationship has ended.
create policy "Only active unblocked chats are readable"
on public.chats as restrictive for select to authenticated
using (exists (
  select 1 from public.likes l where l.id = chats.like_id and l.status = 'matched'
    and not public.is_blocked_with(case when l.from_user_id = (select auth.uid()) then l.to_user_id else l.from_user_id end)
));

create policy "Only active unblocked messages are readable"
on public.messages as restrictive for select to authenticated
using (exists (select 1 from public.chats ch where ch.id = messages.chat_id));

-- Service-only check used immediately before contacting the push provider.
create or replace function public.can_deliver_social_push(p_sender uuid, p_recipient uuid, p_chat uuid default null, p_like uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select p_sender <> p_recipient
    and (select count(*) from public.profiles where id in (p_sender, p_recipient) and suspended_at is null) = 2
    and not exists (select 1 from public.user_blocks
      where (blocker_id = p_sender and blocked_id = p_recipient) or (blocker_id = p_recipient and blocked_id = p_sender))
    and case when p_chat is not null then exists (
      select 1 from public.chats ch join public.likes l on l.id = ch.like_id
      where ch.id = p_chat and l.status = 'matched'
        and exists (select 1 from public.chat_participants where chat_id = ch.id and user_id = p_sender)
        and exists (select 1 from public.chat_participants where chat_id = ch.id and user_id = p_recipient)
    ) else exists (
      select 1 from public.likes where id = p_like and from_user_id = p_sender and to_user_id = p_recipient and status = 'pending'
    ) end;
$$;
revoke all on function public.can_deliver_social_push(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_deliver_social_push(uuid, uuid, uuid, uuid) to service_role;

commit;
