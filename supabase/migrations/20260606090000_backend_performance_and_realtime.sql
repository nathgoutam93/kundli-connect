-- Backend performance pass + realtime chat.
--
-- 1. RLS policies call auth.uid() through a scalar subquery so Postgres evaluates it once per
--    statement instead of once per row, and the per-row is_profile_discoverable() call is
--    replaced with a denormalized profiles.is_discoverable column kept in sync by a trigger.
--    (A NOT EXISTS on user_settings would not work: RLS applies inside policy subqueries, so
--    callers cannot see other users' settings rows.)
-- 2. People connected through a like can always see each other's profile card and photos,
--    even after one of them turns off discoverability (chats and likes no longer go blank).
-- 3. Missing / redundant indexes.
-- 4. Single-round-trip RPCs for the Discover feed, incoming likes, chat previews and photo
--    reordering, an atomic reply_to_like, and send_chat_message returning what the
--    notification step needs.
-- 5. Realtime publication for messages, likes and chat participation.

-- ---------------------------------------------------------------------------------------------
-- 1 + 2. Policies
-- ---------------------------------------------------------------------------------------------

alter table public.profiles
  add column if not exists is_discoverable boolean not null default true;

update public.profiles p
set is_discoverable = s.profile_discoverable
from public.user_settings s
where s.user_id = p.id
  and p.is_discoverable is distinct from s.profile_discoverable;

create or replace function public.sync_profile_discoverable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set is_discoverable = new.profile_discoverable
  where id = new.user_id
    and is_discoverable is distinct from new.profile_discoverable;
  return new;
end;
$$;

revoke all on function public.sync_profile_discoverable() from public, anon, authenticated;

drop trigger if exists user_settings_sync_discoverable on public.user_settings;
create trigger user_settings_sync_discoverable
after insert or update of profile_discoverable on public.user_settings
for each row execute function public.sync_profile_discoverable();

-- Backs the Discover feed: newest completed, discoverable profiles first.
create index if not exists profiles_discoverable_created_at_idx
  on public.profiles(created_at desc)
  where onboarding_completed and is_discoverable;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
using ((select auth.uid()) = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles for insert
with check ((select auth.uid()) = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Authenticated users can read completed discoverable profiles" on public.profiles;
create policy "Authenticated users can read completed discoverable profiles"
on public.profiles for select
to authenticated
using (onboarding_completed = true and is_discoverable = true);

drop policy if exists "Users can read profiles connected through a like" on public.profiles;
create policy "Users can read profiles connected through a like"
on public.profiles for select
to authenticated
using (
  exists (
    select 1
    from public.likes l
    where (l.from_user_id = (select auth.uid()) and l.to_user_id = profiles.id)
       or (l.to_user_id = (select auth.uid()) and l.from_user_id = profiles.id)
  )
);

drop policy if exists "Users can manage own profile photos" on public.profile_photos;
create policy "Users can manage own profile photos"
on public.profile_photos for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Authenticated users can read discoverable profile photos" on public.profile_photos;
create policy "Authenticated users can read discoverable profile photos"
on public.profile_photos for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = profile_photos.user_id
      and p.onboarding_completed = true
      and p.is_discoverable = true
  )
);

drop policy if exists "Users can read photos of profiles connected through a like" on public.profile_photos;
create policy "Users can read photos of profiles connected through a like"
on public.profile_photos for select
to authenticated
using (
  exists (
    select 1
    from public.likes l
    where (l.from_user_id = (select auth.uid()) and l.to_user_id = profile_photos.user_id)
       or (l.to_user_id = (select auth.uid()) and l.from_user_id = profile_photos.user_id)
  )
);

drop policy if exists "Users can read own kundli" on public.kundlis;
create policy "Users can read own kundli"
on public.kundlis for select
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read likes involving them" on public.likes;
create policy "Users can read likes involving them"
on public.likes for select
using ((select auth.uid()) = from_user_id or (select auth.uid()) = to_user_id);

drop policy if exists "Users can create sent likes" on public.likes;
create policy "Users can create sent likes"
on public.likes for insert
with check ((select auth.uid()) = from_user_id);

-- Also adds the missing WITH CHECK so a recipient cannot re-point a like at someone else.
drop policy if exists "Users can update received likes" on public.likes;
create policy "Users can update received likes"
on public.likes for update
using ((select auth.uid()) = to_user_id)
with check ((select auth.uid()) = to_user_id);

drop policy if exists "Users can read own chat participation" on public.chat_participants;
create policy "Users can read own chat participation"
on public.chat_participants for select
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read chats they participate in" on public.chats;
create policy "Users can read chats they participate in"
on public.chats for select
using (
  exists (
    select 1
    from public.chat_participants cp
    where cp.chat_id = chats.id
      and cp.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can read messages in their chats" on public.messages;
create policy "Users can read messages in their chats"
on public.messages for select
using (
  exists (
    select 1
    from public.chat_participants cp
    where cp.chat_id = messages.chat_id
      and cp.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can send messages in their chats" on public.messages;
create policy "Users can send messages in their chats"
on public.messages for insert
with check (
  (select auth.uid()) = sender_id
  and exists (
    select 1
    from public.chat_participants cp
    where cp.chat_id = messages.chat_id
      and cp.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can read own credit transactions" on public.credit_transactions;
create policy "Users can read own credit transactions"
on public.credit_transactions for select
using ((select auth.uid()) = user_id);

drop policy if exists "Users can manage own push tokens" on public.push_tokens;
create policy "Users can manage own push tokens"
on public.push_tokens for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read match scores involving them" on public.match_scores;
create policy "Users can read match scores involving them"
on public.match_scores for select
using ((select auth.uid()) = user_a_id or (select auth.uid()) = user_b_id);

drop policy if exists "Users manage own passes" on public.discovery_passes;
create policy "Users manage own passes"
on public.discovery_passes for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage own settings" on public.user_settings;
create policy "Users manage own settings"
on public.user_settings for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users read own activity" on public.activity_events;
create policy "Users read own activity"
on public.activity_events for select
using ((select auth.uid()) = user_id);

drop policy if exists "Users read own subscription" on public.user_subscriptions;
create policy "Users read own subscription"
on public.user_subscriptions for select
using ((select auth.uid()) = user_id);

drop function if exists public.is_profile_discoverable(uuid);

-- ---------------------------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------------------------

-- "My chats" lookups filter chat_participants by user_id; the primary key leads with chat_id.
create index if not exists chat_participants_user_id_idx
  on public.chat_participants(user_id);

-- Unread counts and mark_chat_read only ever look at unread messages.
create index if not exists messages_unread_idx
  on public.messages(chat_id, sender_id)
  where status <> 'read';
drop index if exists public.messages_chat_id_status_idx;

-- Covered by the (user_id, passed_user_id) primary key.
drop index if exists public.discovery_passes_user_id_idx;

-- ---------------------------------------------------------------------------------------------
-- 4. Read models and RPCs
-- ---------------------------------------------------------------------------------------------

-- Public-facing profile card with photos aggregated in order. Runs with the caller's
-- permissions, so the profiles/profile_photos policies above decide who sees what. Fields the
-- owner hid from their profile come back null.
create or replace view public.profile_cards
with (security_invoker = true) as
select
  p.id,
  p.display_name,
  p.gender,
  p.gender_preferences,
  p.height,
  p.date_of_birth,
  p.birth_place,
  p.location,
  p.bio,
  case when p.family_plans_visible_on_profile then p.family_plans end as family_plans,
  p.family_plans_visible_on_profile,
  case when p.workplace_visible_on_profile then p.workplace end as workplace,
  p.workplace_visible_on_profile,
  case when p.job_role_visible_on_profile then p.job_role end as job_role,
  p.job_role_visible_on_profile,
  case when p.school_visible_on_profile then p.school end as school,
  p.school_visible_on_profile,
  case when p.education_level_visible_on_profile then p.education_level end as education_level,
  p.education_level_visible_on_profile,
  p.religious_beliefs,
  case when p.drinking_visible_on_profile then p.drinking end as drinking,
  p.drinking_visible_on_profile,
  case when p.smoking_visible_on_profile then p.smoking end as smoking,
  p.smoking_visible_on_profile,
  p.onboarding_completed,
  p.is_discoverable,
  p.created_at,
  coalesce(
    (
      select array_agg(pp.storage_path order by pp.sort_order)
      from public.profile_photos pp
      where pp.user_id = p.id
    ),
    '{}'::text[]
  ) as photo_paths
from public.profiles p;

revoke all on public.profile_cards from anon;
grant select on public.profile_cards to authenticated;

-- Discover feed: completed, discoverable profiles the caller has not liked, been liked by, or
-- passed. Replaces three client round trips and an ever-growing `not in (...)` URL filter.
create or replace function public.get_discover_profiles(p_limit integer default 50)
returns setof public.profile_cards
language sql
stable
security invoker
set search_path = public
as $$
  select c.*
  from public.profile_cards c
  where c.onboarding_completed = true
    and c.is_discoverable = true
    and c.id <> (select auth.uid())
    and not exists (
      select 1 from public.likes l
      where l.from_user_id = (select auth.uid()) and l.to_user_id = c.id
    )
    and not exists (
      select 1 from public.likes l
      where l.to_user_id = (select auth.uid()) and l.from_user_id = c.id
    )
    and not exists (
      select 1 from public.discovery_passes dp
      where dp.user_id = (select auth.uid()) and dp.passed_user_id = c.id
    )
  order by c.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- Pending likes sent to the caller, with the sender's card and the stored match report.
create or replace function public.get_incoming_likes()
returns table (
  id uuid,
  from_user_id uuid,
  opening_message text,
  created_at timestamptz,
  compatibility_report jsonb,
  profile jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    l.id,
    l.from_user_id,
    l.opening_message,
    l.created_at,
    ms.compatibility_report,
    to_jsonb(c) as profile
  from public.likes l
  join public.profile_cards c on c.id = l.from_user_id
  left join public.match_scores ms on ms.id = l.match_score_id
  where l.to_user_id = (select auth.uid())
    and l.status = 'pending'
  order by l.created_at desc;
$$;

-- One row per chat the caller is in: partner card, match report, last message and unread
-- count. Replaces 4 sequential queries plus 2 extra queries per chat.
create or replace function public.get_chat_previews()
returns table (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  hidden boolean,
  participant_id uuid,
  compatibility_report jsonb,
  last_message jsonb,
  unread_count integer,
  participant jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    ch.id,
    ch.created_at,
    ch.updated_at,
    cp.hidden,
    partner.id as participant_id,
    ms.compatibility_report,
    case when lm.id is null then null else jsonb_build_object(
      'id', lm.id,
      'sender_id', lm.sender_id,
      'body', lm.body,
      'status', lm.status,
      'read_at', lm.read_at,
      'created_at', lm.created_at
    ) end as last_message,
    coalesce(unread.total, 0)::integer as unread_count,
    to_jsonb(card) as participant
  from public.chat_participants cp
  join public.chats ch on ch.id = cp.chat_id
  join public.likes l on l.id = ch.like_id
  cross join lateral (
    select case when l.from_user_id = cp.user_id then l.to_user_id else l.from_user_id end as id
  ) partner
  left join public.profile_cards card on card.id = partner.id
  left join public.match_scores ms on ms.id = l.match_score_id
  left join lateral (
    select m.id, m.sender_id, m.body, m.status, m.read_at, m.created_at
    from public.messages m
    where m.chat_id = ch.id
    order by m.created_at desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*) as total
    from public.messages m
    where m.chat_id = ch.id
      and m.sender_id <> cp.user_id
      and m.status <> 'read'
  ) unread on true
  where cp.user_id = (select auth.uid())
  order by ch.updated_at desc;
$$;

-- Persist a new photo order in one statement (was 2 x N sequential updates).
create or replace function public.reorder_profile_photos(p_storage_paths text[])
returns void
language sql
security invoker
set search_path = public
as $$
  update public.profile_photos pp
  set sort_order = ordered.position - 1
  from unnest(p_storage_paths) with ordinality as ordered(storage_path, position)
  where pp.user_id = (select auth.uid())
    and pp.storage_path = ordered.storage_path;
$$;

-- Accept a like: create the chat, participants, opening messages and activity in one
-- transaction. Safe to call twice (a second call just sends the text as a normal message).
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

  if v_message is null then
    raise exception 'Message is required' using errcode = '22023';
  end if;

  select * into v_like
  from public.likes
  where id = p_like_id
    and to_user_id = v_user_id
  for update;

  if not found then
    raise exception 'Like not found.' using errcode = 'P0002';
  end if;

  if v_like.status = 'dismissed' then
    raise exception 'Cannot reply to a dismissed like.' using errcode = '22023';
  end if;

  select id into v_chat_id from public.chats where like_id = v_like.id;
  v_is_new_match := v_chat_id is null;

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
    'isNewMatch', v_is_new_match
  );
end;
$$;

-- Same contract as before plus senderUserId/recipientId/senderName for the push step, and the recipient's
-- activity entry is written here instead of in a separate request from the Edge Function.
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

  if v_body is null then
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

revoke all on function public.get_discover_profiles(integer) from public, anon;
revoke all on function public.get_incoming_likes() from public, anon;
revoke all on function public.get_chat_previews() from public, anon;
revoke all on function public.reorder_profile_photos(text[]) from public, anon;
revoke all on function public.reply_to_like(uuid, text) from public, anon;
revoke all on function public.send_chat_message(uuid, text) from public, anon;
revoke all on function public.mark_chat_read(uuid) from public, anon;

grant execute on function public.get_discover_profiles(integer) to authenticated;
grant execute on function public.get_incoming_likes() to authenticated;
grant execute on function public.get_chat_previews() to authenticated;
grant execute on function public.reorder_profile_photos(text[]) to authenticated;
grant execute on function public.reply_to_like(uuid, text) to authenticated;
grant execute on function public.send_chat_message(uuid, text) to authenticated;
grant execute on function public.mark_chat_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Realtime
-- ---------------------------------------------------------------------------------------------

-- Realtime applies each subscriber's RLS select policies, so clients only receive rows they
-- could already read.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['messages', 'likes', 'chat_participants'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end
$$;
