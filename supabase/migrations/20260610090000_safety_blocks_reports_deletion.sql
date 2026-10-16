-- Safety: blocking, reporting, suspension and account deletion.
--
-- 1. Suspension: `profiles.suspended_at` (server-only) hides a profile from everyone and stops it
--    from sending messages or likes. Set it from the dashboard when actioning reports.
-- 2. Blocking: `user_blocks`. A block hides the two people from each other everywhere (every
--    screen reads people through `profile_cards`), deletes any chat between them and dismisses
--    pending likes. Managed through `block_user` / `unblock_user` / `get_blocked_users`.
-- 3. Reporting: `user_reports`, written only through `report_user`, which snapshots the reported
--    profile and the recent conversation as evidence before an optional block deletes the chat.
--    Reports are readable only with the service role.
-- 4. Chat actions: `unmatch_chat` (ends the chat for both) and `set_chat_hidden` (per user).
-- 5. Account deletion: `delete_user_account_data` removes the user's chats so the other person
--    isn't left with an empty one; the delete-account Edge Function then deletes the auth user and
--    everything else cascades.

-- ---------------------------------------------------------------------------------------------
-- 1. Suspension
-- ---------------------------------------------------------------------------------------------

alter table public.profiles add column if not exists suspended_at timestamptz;

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- The phone number comes from the verified sign-in, never from the request body.
    new.phone := nullif(coalesce(v_claims ->> 'phone', current_setting('request.jwt.claim.phone', true)), '');
    new.verification_status := 'unverified';
    new.kundli_generation_status := 'pending';
    new.is_discoverable := true;
    new.suspended_at := null;
    new.created_at := now();
  else
    new.id := old.id;
    new.phone := old.phone;
    new.verification_status := old.verification_status;
    new.kundli_generation_status := old.kundli_generation_status;
    new.is_discoverable := old.is_discoverable;
    new.suspended_at := old.suspended_at;
    new.created_at := old.created_at;

    if old.onboarding_completed then
      new.onboarding_completed := true;
      new.date_of_birth := old.date_of_birth;
      new.time_of_birth := old.time_of_birth;
      new.birth_place := old.birth_place;
      new.birth_latitude := old.birth_latitude;
      new.birth_longitude := old.birth_longitude;
      new.birth_timezone := old.birth_timezone;
    end if;
  end if;

  return new;
end;
$$;

-- Suspended accounts can't start new conversations. A trigger covers every write path (SQL
-- functions and Edge Functions alike).
create or replace function public.reject_suspended_sender()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- messages.sender_id or likes.from_user_id; read via jsonb so one function serves both tables.
  v_sender uuid := coalesce(to_jsonb(new) ->> 'sender_id', to_jsonb(new) ->> 'from_user_id')::uuid;
begin
  if exists (select 1 from public.profiles where id = v_sender and suspended_at is not null) then
    raise exception 'This account is suspended.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_reject_suspended on public.messages;
create trigger messages_reject_suspended
before insert on public.messages
for each row execute function public.reject_suspended_sender();

drop trigger if exists likes_reject_suspended on public.likes;
create trigger likes_reject_suspended
before insert on public.likes
for each row execute function public.reject_suspended_sender();

-- ---------------------------------------------------------------------------------------------
-- 2. Blocks
-- ---------------------------------------------------------------------------------------------

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx on public.user_blocks(blocked_id, blocker_id);

alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from anon, authenticated;

-- Whether the caller and another person have blocked each other, in either direction. SECURITY
-- DEFINER so it can see blocks made by the other person without exposing those rows.
create or replace function public.is_blocked_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = p_other)
       or (b.blocker_id = p_other and b.blocked_id = (select auth.uid()))
  );
$$;

revoke all on function public.is_blocked_with(uuid) from public, anon;
grant execute on function public.is_blocked_with(uuid) to authenticated;

-- Same columns as before; only the access rule changes: other people's cards also require that
-- the profile isn't suspended and that neither person has blocked the other.
create or replace view public.profile_cards
with (security_invoker = false) as
select
  p.id,
  p.display_name,
  p.gender,
  p.gender_preferences,
  p.height,
  case
    when p.date_of_birth is null then null
    else extract(year from age(current_date, p.date_of_birth))::integer
  end as age,
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
from public.profiles p
where (select auth.uid()) is not null
  and (
    p.id = (select auth.uid())
    or (
      p.suspended_at is null
      and not public.is_blocked_with(p.id)
      and (
        (p.onboarding_completed and p.is_discoverable)
        or exists (
          select 1
          from public.likes l
          where (l.from_user_id = (select auth.uid()) and l.to_user_id = p.id)
             or (l.to_user_id = (select auth.uid()) and l.from_user_id = p.id)
        )
      )
    )
  );

revoke all on public.profile_cards from public, anon;
grant select on public.profile_cards to authenticated;

-- Chats are tied to the like that started them; this finds every chat between two people.
create or replace function public.chats_between(p_a uuid, p_b uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select ch.id
  from public.chats ch
  join public.likes l on l.id = ch.like_id
  where (l.from_user_id = p_a and l.to_user_id = p_b)
     or (l.from_user_id = p_b and l.to_user_id = p_a);
$$;

revoke all on function public.chats_between(uuid, uuid) from public, anon, authenticated;

-- Internal: record the block and cut every existing connection between the two people.
create or replace function public.apply_block(p_blocker uuid, p_blocked uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_blocks (blocker_id, blocked_id)
  values (p_blocker, p_blocked)
  on conflict do nothing;

  delete from public.chats where id in (select public.chats_between(p_blocker, p_blocked));

  update public.likes
  set status = 'dismissed'
  where status = 'pending'
    and ((from_user_id = p_blocker and to_user_id = p_blocked)
      or (from_user_id = p_blocked and to_user_id = p_blocker));
end;
$$;

revoke all on function public.apply_block(uuid, uuid) from public, anon, authenticated;

create or replace function public.block_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;
  if p_user_id is null or p_user_id = v_user_id then
    raise exception 'You cannot block yourself.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  perform public.apply_block(v_user_id, p_user_id);
end;
$$;

create or replace function public.unblock_user(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.user_blocks
  where blocker_id = (select auth.uid()) and blocked_id = p_user_id;
$$;

-- The people the caller has blocked, for the "Blocked people" list. Their cards are hidden by
-- the block, so the name and first photo come straight from the profile.
create or replace function public.get_blocked_users()
returns table (user_id uuid, display_name text, photo_path text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.blocked_id,
    p.display_name,
    (select pp.storage_path from public.profile_photos pp where pp.user_id = p.id order by pp.sort_order limit 1),
    b.created_at
  from public.user_blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Reports
-- ---------------------------------------------------------------------------------------------

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  -- Kept when either account is deleted, so moderation history survives.
  reporter_id uuid references public.profiles(id) on delete set null,
  reported_user_id uuid references public.profiles(id) on delete set null,
  reason text not null check (reason in (
    'fake_profile', 'inappropriate_photos', 'harassment', 'offensive_messages',
    'spam_or_scam', 'underage', 'other'
  )),
  details text check (details is null or char_length(details) <= 1000),
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  reviewer_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists user_reports_queue_idx on public.user_reports(status, created_at);
create index if not exists user_reports_reported_idx on public.user_reports(reported_user_id, created_at desc);
create index if not exists user_reports_reporter_idx on public.user_reports(reporter_id, created_at desc);

alter table public.user_reports enable row level security;
revoke all on public.user_reports from anon, authenticated;

create or replace function public.report_user(
  p_user_id uuid,
  p_reason text,
  p_details text default null,
  p_block boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_report_id uuid;
  v_evidence jsonb;
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;
  if p_user_id is null or p_user_id = v_user_id then
    raise exception 'You cannot report yourself.' using errcode = '22023';
  end if;
  if p_reason is null or p_reason not in (
    'fake_profile', 'inappropriate_photos', 'harassment', 'offensive_messages',
    'spam_or_scam', 'underage', 'other'
  ) then
    raise exception 'Choose a reason for the report.' using errcode = '22023';
  end if;
  if v_details is not null and char_length(v_details) > 1000 then
    raise exception 'Details must be 1000 characters or fewer.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  -- One report per person per day is enough; a repeat just (re)applies the block.
  select id into v_report_id
  from public.user_reports
  where reporter_id = v_user_id
    and reported_user_id = p_user_id
    and created_at > now() - interval '1 day'
  limit 1;

  if v_report_id is null then
    if (select count(*) from public.user_reports
        where reporter_id = v_user_id and created_at > now() - interval '1 day') >= 20 then
      raise exception 'Too many reports today. Please try again tomorrow.' using errcode = '54000';
    end if;

    -- Snapshot what the reporter saw, before a block deletes the conversation.
    select jsonb_build_object(
      'profile', (
        select jsonb_build_object(
          'display_name', p.display_name,
          'bio', p.bio,
          'location', p.location,
          'photo_paths', coalesce((
            select jsonb_agg(pp.storage_path order by pp.sort_order)
            from public.profile_photos pp where pp.user_id = p.id
          ), '[]'::jsonb)
        )
        from public.profiles p where p.id = p_user_id
      ),
      'messages', coalesce((
        select jsonb_agg(m order by m.created_at)
        from (
          select
            case when msg.sender_id = p_user_id then 'reported' else 'reporter' end as sender,
            msg.body,
            msg.created_at
          from public.messages msg
          where msg.chat_id in (select public.chats_between(v_user_id, p_user_id))
          order by msg.created_at desc
          limit 50
        ) m
      ), '[]'::jsonb),
      'opening_messages', coalesce((
        select jsonb_agg(jsonb_build_object('body', l.opening_message, 'created_at', l.created_at))
        from public.likes l
        where l.from_user_id = p_user_id and l.to_user_id = v_user_id and l.opening_message is not null
      ), '[]'::jsonb)
    ) into v_evidence;

    insert into public.user_reports (reporter_id, reported_user_id, reason, details, evidence)
    values (v_user_id, p_user_id, p_reason, v_details, v_evidence)
    returning id into v_report_id;
  end if;

  if p_block then
    perform public.apply_block(v_user_id, p_user_id);
  end if;

  return v_report_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. Chat actions
-- ---------------------------------------------------------------------------------------------

-- Ends the match for both people (messages are deleted with the chat).
create or replace function public.unmatch_chat(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.chat_participants
    where chat_id = p_chat_id and user_id = auth.uid()
  ) then
    raise exception 'Chat not found' using errcode = 'P0002';
  end if;

  delete from public.chats where id = p_chat_id;
end;
$$;

-- Moves a chat in or out of the caller's "Hidden" section; the other person isn't affected.
create or replace function public.set_chat_hidden(p_chat_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_participants
  set hidden = coalesce(p_hidden, false)
  where chat_id = p_chat_id and user_id = auth.uid();

  if not found then
    raise exception 'Chat not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Account deletion
-- ---------------------------------------------------------------------------------------------

-- Service role only (called by the delete-account Edge Function before it deletes the auth
-- user). Chats aren't owned by a profile, so they'd otherwise outlive the account.
create or replace function public.delete_user_account_data(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.chats
  where id in (select chat_id from public.chat_participants where user_id = p_user_id);
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------

revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.get_blocked_users() from public, anon;
revoke all on function public.report_user(uuid, text, text, boolean) from public, anon;
revoke all on function public.unmatch_chat(uuid) from public, anon;
revoke all on function public.set_chat_hidden(uuid, boolean) from public, anon;
revoke all on function public.delete_user_account_data(uuid) from public, anon, authenticated;
revoke all on function public.reject_suspended_sender() from public, anon, authenticated;

grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.get_blocked_users() to authenticated;
grant execute on function public.report_user(uuid, text, text, boolean) to authenticated;
grant execute on function public.unmatch_chat(uuid) to authenticated;
grant execute on function public.set_chat_hidden(uuid, boolean) to authenticated;
