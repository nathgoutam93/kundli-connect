create table if not exists public.match_scores (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references public.profiles(id) on delete cascade,
  user_b_id uuid not null references public.profiles(id) on delete cascade,
  generated_by uuid references public.profiles(id) on delete set null,
  compatibility_score integer not null,
  compatibility_report jsonb not null default '{}'::jsonb,
  raw_report jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  unique (user_a_id, user_b_id),
  check (user_a_id < user_b_id),
  check (compatibility_score >= 0 and compatibility_score <= 100)
);

create index if not exists match_scores_user_a_id_idx
  on public.match_scores(user_a_id);

create index if not exists match_scores_user_b_id_idx
  on public.match_scores(user_b_id);

alter table public.match_scores enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'match_scores'
      and policyname = 'Users can read match scores involving them'
  ) then
    create policy "Users can read match scores involving them"
    on public.match_scores for select
    using (auth.uid() = user_a_id or auth.uid() = user_b_id);
  end if;
end
$$;
