-- Security lockdown.
--
-- 1. Other users' profiles are only readable through public.profile_cards, which exposes a
--    safe projection (age instead of date of birth; no phone, email, birth time/place or
--    coordinates). The profiles and profile_photos tables become owner-only.
-- 2. Columns users must not set on their own profile (phone, verification, Kundli status,
--    discoverability) are ignored on direct writes.
-- 3. Likes can no longer be inserted directly (that skipped credits and match scores); the
--    recipient may only move a pending like to dismissed.
-- 4. Messages are written only through send_chat_message / reply_to_like, with length limits.
-- 5. Credit spending is serialised per user and only callable by the Edge Functions; test
--    purchases are off unless explicitly enabled in app_settings.
-- 6. Anonymous (signed-out) requests get no table or function access in public.

-- ---------------------------------------------------------------------------------------------
-- 1. Profiles: owner-only tables, filtered public cards
-- ---------------------------------------------------------------------------------------------

drop policy if exists "Authenticated users can read completed discoverable profiles" on public.profiles;
drop policy if exists "Users can read profiles connected through a like" on public.profiles;
drop policy if exists "Authenticated users can read discoverable profile photos" on public.profile_photos;
drop policy if exists "Users can read photos of profiles connected through a like" on public.profile_photos;

-- get_discover_profiles returns this view's row type, so both are recreated.
drop function if exists public.get_discover_profiles(integer);
drop view if exists public.profile_cards;

-- Runs with the view owner's rights (security_invoker = false) so it can read profiles the
-- caller cannot read directly; the WHERE clause is the access rule. A card is visible to its
-- owner, to everyone for completed + discoverable profiles, and to people connected through a
-- like in either direction.
create view public.profile_cards
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
    or (p.onboarding_completed and p.is_discoverable)
    or exists (
      select 1
      from public.likes l
      where (l.from_user_id = (select auth.uid()) and l.to_user_id = p.id)
         or (l.to_user_id = (select auth.uid()) and l.from_user_id = p.id)
    )
  );

revoke all on public.profile_cards from public, anon;
grant select on public.profile_cards to authenticated;

create function public.get_discover_profiles(p_limit integer default 50)
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

revoke all on function public.get_discover_profiles(integer) from public, anon;
grant execute on function public.get_discover_profiles(integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Protected profile columns
-- ---------------------------------------------------------------------------------------------

-- SECURITY INVOKER on purpose: current_user is 'authenticated' for direct API writes, but the
-- service role, migrations and our SECURITY DEFINER functions (e.g. the discoverability sync)
-- run as other roles and may set these columns.
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
    new.created_at := now();
  else
    new.id := old.id;
    new.phone := old.phone;
    new.verification_status := old.verification_status;
    new.kundli_generation_status := old.kundli_generation_status;
    new.is_discoverable := old.is_discoverable;
    new.created_at := old.created_at;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_columns on public.profiles;
create trigger profiles_protect_columns
before insert or update on public.profiles
for each row execute function public.protect_profile_columns();

-- ---------------------------------------------------------------------------------------------
-- 3. Likes
-- ---------------------------------------------------------------------------------------------

-- Likes are created by the create-like Edge Function, which charges a credit and requires a
-- match score; a direct insert skipped both.
drop policy if exists "Users can create sent likes" on public.likes;
drop policy if exists "Users can update received likes" on public.likes;
drop policy if exists "Recipients can dismiss pending likes" on public.likes;

create policy "Recipients can dismiss pending likes"
on public.likes for update
to authenticated
using ((select auth.uid()) = to_user_id and status = 'pending')
with check ((select auth.uid()) = to_user_id and status = 'dismissed');

revoke insert, update, delete on public.likes from anon, authenticated;
grant update (status) on public.likes to authenticated;

alter table public.likes
  drop constraint if exists likes_opening_message_length,
  add constraint likes_opening_message_length
    check (opening_message is null or char_length(opening_message) <= 300) not valid;

-- ---------------------------------------------------------------------------------------------
-- 4. Messages and other server-owned tables
-- ---------------------------------------------------------------------------------------------

-- send_chat_message (SECURITY DEFINER) handles inserts, chat timestamps and activity.
drop policy if exists "Users can send messages in their chats" on public.messages;

alter table public.messages
  drop constraint if exists messages_body_length,
  add constraint messages_body_length
    check (char_length(body) between 1 and 2000) not valid;

-- These tables are only written by Edge Functions or SQL functions. RLS already denies
-- writes (no write policies); revoking the privileges as well removes any reliance on that.
revoke insert, update, delete on
  public.messages,
  public.chats,
  public.chat_participants,
  public.match_scores,
  public.kundlis,
  public.credit_transactions,
  public.activity_events,
  public.subscription_plans,
  public.user_subscriptions
from anon, authenticated;

-- TRUNCATE is not subject to RLS.
revoke truncate on all tables in schema public from anon, authenticated;

-- Signed-out requests never need data access.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- ---------------------------------------------------------------------------------------------
-- 5. Credits and test purchases
-- ---------------------------------------------------------------------------------------------

-- Server-only configuration (no policies: only the service role can read or change it).
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

insert into public.app_settings (key, value)
values ('test_purchases_enabled', 'false'::jsonb)
on conflict (key) do nothing;

-- Spends one credit for a user, or none for active subscribers. Returns whether the action is
-- allowed and the debit transaction (null for subscribers) so callers can refund precisely.
-- The advisory lock serialises concurrent spends per user, so two requests can no longer both
-- read the same balance and overdraw it.
create or replace function public.spend_user_credit(p_user_id uuid, p_reason text)
returns table (allowed boolean, transaction_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_transaction_id uuid;
begin
  if p_user_id is null then
    raise exception 'User is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('credits:' || p_user_id::text, 0));

  if exists (
    select 1
    from public.user_subscriptions
    where user_id = p_user_id
      and status = 'active'
      and renewal_date > now()
  ) then
    return query select true, null::uuid;
    return;
  end if;

  select coalesce(sum(amount), 0) into v_balance
  from public.credit_transactions
  where user_id = p_user_id;

  if v_balance < 1 then
    return query select false, null::uuid;
    return;
  end if;

  insert into public.credit_transactions (user_id, amount, reason)
  values (p_user_id, -1, coalesce(nullif(btrim(p_reason), ''), 'Credit spent'))
  returning id into v_transaction_id;

  return query select true, v_transaction_id;
end;
$$;

-- Reverses a debit made by spend_user_credit, at most once.
create or replace function public.refund_credit_transaction(p_transaction_id uuid, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debit public.credit_transactions%rowtype;
begin
  select * into v_debit from public.credit_transactions where id = p_transaction_id;
  if not found or v_debit.amount >= 0 then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('credits:' || v_debit.user_id::text, 0));

  if exists (
    select 1 from public.credit_transactions
    where user_id = v_debit.user_id
      and metadata ->> 'refundOf' = p_transaction_id::text
  ) then
    return false;
  end if;

  insert into public.credit_transactions (user_id, amount, reason, metadata)
  values (
    v_debit.user_id,
    -v_debit.amount,
    coalesce(p_reason, 'Refund: ' || v_debit.reason),
    jsonb_build_object('refundOf', p_transaction_id)
  );

  return true;
end;
$$;

revoke all on function public.spend_user_credit(uuid, text) from public, anon, authenticated;
revoke all on function public.refund_credit_transaction(uuid, text) from public, anon, authenticated;
grant execute on function public.spend_user_credit(uuid, text) to service_role;
grant execute on function public.refund_credit_transaction(uuid, text) to service_role;

-- Kept only so Edge Functions deployed before this migration keep working until they are
-- redeployed; it now goes through the same locked path. Safe to drop afterwards.
create or replace function public.spend_credit(p_reason text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select allowed from public.spend_user_credit(auth.uid(), p_reason);
$$;

revoke all on function public.spend_credit(text) from public, anon;
grant execute on function public.spend_credit(text) to authenticated;

create or replace function public.assert_test_purchases_enabled()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(
    (select value = 'true'::jsonb from public.app_settings where key = 'test_purchases_enabled'),
    false
  ) then
    raise exception 'Purchases are not available yet.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_test_purchases_enabled() from public, anon, authenticated;

create or replace function public.test_purchase_credits(p_amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  perform public.assert_test_purchases_enabled();
  if p_amount not in (10, 25, 50) then raise exception 'Invalid test credit pack' using errcode = '22023'; end if;
  insert into public.credit_transactions (user_id, amount, reason)
  values (auth.uid(), p_amount, 'Test credit purchase');
end;
$$;

create or replace function public.activate_test_subscription(p_plan_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bonus integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  perform public.assert_test_purchases_enabled();
  select credit_bonus into v_bonus from public.subscription_plans where id = p_plan_id and active;
  if v_bonus is null then raise exception 'Invalid subscription plan' using errcode = '22023'; end if;
  insert into public.user_subscriptions (user_id, plan_id, status, renewal_date, updated_at)
  values (auth.uid(), p_plan_id, 'active', now() + interval '30 days', now())
  on conflict (user_id) do update
  set plan_id = excluded.plan_id, status = 'active', renewal_date = excluded.renewal_date, updated_at = now();
  insert into public.credit_transactions (user_id, amount, reason)
  values (auth.uid(), v_bonus, 'Subscription bonus');
end;
$$;

revoke all on function public.test_purchase_credits(integer) from public, anon;
revoke all on function public.activate_test_subscription(text) from public, anon;
grant execute on function public.test_purchase_credits(integer) to authenticated;
grant execute on function public.activate_test_subscription(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. Kundli generation cache key
-- ---------------------------------------------------------------------------------------------

-- Birth details the stored Kundli was generated from. generate-kundli skips the paid astrology
-- calls when they have not changed.
alter table public.kundlis add column if not exists input_signature text;
