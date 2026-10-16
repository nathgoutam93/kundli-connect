-- Weekly chart insights, written by the `send-astro-insights` Edge Function (scheduled weekly, see
-- supabase/README.md → Astrology insights) and read by the app's "This week" card. People who turn
-- on Settings → Notifications → Astrology reports also get the most notable one as a push.

create table if not exists public.astro_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- The first day (India time) of the week the insight belongs to; one row per kind per week.
  week_of date not null,
  kind text not null,
  tone text not null check (tone in ('positive', 'neutral', 'caution')),
  title text not null,
  body text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  priority smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, week_of, kind)
);

create index if not exists astro_insights_user_week_idx on public.astro_insights(user_id, week_of desc);

alter table public.astro_insights enable row level security;

drop policy if exists "Users can read their own insights" on public.astro_insights;
create policy "Users can read their own insights"
on public.astro_insights
for select
to authenticated
using (user_id = auth.uid());

-- Written only by the Edge Function (service role).
revoke all on public.astro_insights from anon, authenticated;
grant select on public.astro_insights to authenticated;
