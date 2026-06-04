create table public.discovery_passes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  passed_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, passed_user_id),
  check (user_id <> passed_user_id)
);

create table public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  notify_likes boolean not null default true,
  notify_matches boolean not null default true,
  notify_messages boolean not null default true,
  notify_astrology_reports boolean not null default false,
  show_distance boolean not null default true,
  show_online_status boolean not null default true,
  profile_discoverable boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.chat_participants add column hidden boolean not null default false;

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  title text not null,
  description text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.subscription_plans (
  id text primary key,
  name text not null,
  price_label text not null,
  cadence text not null,
  badge text,
  features jsonb not null default '[]'::jsonb,
  credit_bonus integer not null default 0,
  active boolean not null default true
);

insert into public.subscription_plans (id, name, price_label, cadence, badge, features, credit_bonus)
values
  ('plus-monthly', 'Plus', '₹499', 'monthly', 'Popular', '["Unlimited likes","20 credits","Priority likes inbox"]', 20),
  ('premium-quarterly', 'Premium', '₹1,199', '3 months', null, '["All Plus features","Advanced compatibility reports","Profile boost every week"]', 75)
on conflict (id) do nothing;

create table public.user_subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  plan_id text references public.subscription_plans(id),
  status text not null default 'free' check (status in ('free', 'active', 'expired')),
  renewal_date timestamptz,
  restored_at timestamptz,
  updated_at timestamptz not null default now()
);

create index discovery_passes_user_id_idx on public.discovery_passes(user_id);
create index activity_events_user_id_created_at_idx on public.activity_events(user_id, created_at desc);

alter table public.discovery_passes enable row level security;
alter table public.user_settings enable row level security;
alter table public.activity_events enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.user_subscriptions enable row level security;

create policy "Users manage own passes" on public.discovery_passes for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own settings" on public.user_settings for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users read own activity" on public.activity_events for select using (auth.uid() = user_id);
create policy "Authenticated users read active plans" on public.subscription_plans for select
to authenticated using (active);
create policy "Users read own subscription" on public.user_subscriptions for select using (auth.uid() = user_id);

create or replace function public.get_credit_balance()
returns integer language sql security definer set search_path = public stable as $$
  select coalesce(sum(amount), 0)::integer from public.credit_transactions where user_id = auth.uid()
$$;

create or replace function public.spend_credit(p_reason text)
returns boolean language plpgsql security definer set search_path = public as $$
declare current_balance integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from public.user_subscriptions where user_id = auth.uid() and status = 'active' and renewal_date > now()) then
    return true;
  end if;
  select public.get_credit_balance() into current_balance;
  if current_balance < 1 then return false; end if;
  insert into public.credit_transactions(user_id, amount, reason) values (auth.uid(), -1, p_reason);
  return true;
end $$;

create or replace function public.test_purchase_credits(p_amount integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_amount not in (10, 25, 50) then raise exception 'Invalid test credit pack'; end if;
  insert into public.credit_transactions(user_id, amount, reason) values (auth.uid(), p_amount, 'Test credit purchase');
end $$;

create or replace function public.activate_test_subscription(p_plan_id text)
returns void language plpgsql security definer set search_path = public as $$
declare bonus integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select credit_bonus into bonus from public.subscription_plans where id = p_plan_id and active;
  if bonus is null then raise exception 'Invalid subscription plan'; end if;
  insert into public.user_subscriptions(user_id, plan_id, status, renewal_date, updated_at)
  values (auth.uid(), p_plan_id, 'active', now() + interval '30 days', now())
  on conflict (user_id) do update set plan_id = excluded.plan_id, status = 'active', renewal_date = excluded.renewal_date, updated_at = now();
  insert into public.credit_transactions(user_id, amount, reason) values (auth.uid(), bonus, 'Subscription bonus');
end $$;

create or replace function public.restore_test_subscription()
returns void language sql security definer set search_path = public as $$
  update public.user_subscriptions set restored_at = now(), updated_at = now() where user_id = auth.uid()
$$;

grant execute on function public.get_credit_balance() to authenticated;
grant execute on function public.spend_credit(text) to authenticated;
grant execute on function public.test_purchase_credits(integer) to authenticated;
grant execute on function public.activate_test_subscription(text) to authenticated;
grant execute on function public.restore_test_subscription() to authenticated;

create or replace function public.is_profile_discoverable(p_user_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((select profile_discoverable from public.user_settings where user_id = p_user_id), true)
$$;

drop policy if exists "Authenticated users can read completed discovery profiles" on public.profiles;
create policy "Authenticated users can read completed discoverable profiles"
on public.profiles for select using (
  auth.uid() is not null
  and onboarding_completed = true
  and public.is_profile_discoverable(profiles.id)
);

drop policy if exists "Authenticated users can read discovery profile photos" on public.profile_photos;
create policy "Authenticated users can read discoverable profile photos"
on public.profile_photos for select using (
  auth.uid() is not null
  and exists (
    select 1 from public.profiles
    where profiles.id = profile_photos.user_id
      and profiles.onboarding_completed = true
      and public.is_profile_discoverable(profiles.id)
  )
);
