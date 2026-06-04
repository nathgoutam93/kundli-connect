alter table public.push_tokens
  add column if not exists token_type text not null default 'expo',
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'push_tokens_token_type_check'
  ) then
    alter table public.push_tokens
      add constraint push_tokens_token_type_check check (token_type in ('expo'));
  end if;
end $$;

create index if not exists push_tokens_user_id_idx on public.push_tokens(user_id);

create or replace function public.upsert_own_push_token(
  p_token text,
  p_platform text default null,
  p_token_type text default 'expo',
  p_updated_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_token is null or btrim(p_token) = '' then
    raise exception 'Push token is required';
  end if;

  if p_token_type <> 'expo' then
    raise exception 'Unsupported push token type';
  end if;

  delete from public.push_tokens
  where token = p_token
    and user_id <> current_user_id;

  insert into public.push_tokens (
    user_id,
    token,
    token_type,
    platform,
    updated_at
  )
  values (
    current_user_id,
    p_token,
    p_token_type,
    p_platform,
    p_updated_at
  )
  on conflict (token) do update
  set user_id = excluded.user_id,
      token_type = excluded.token_type,
      platform = excluded.platform,
      updated_at = excluded.updated_at;
end;
$$;

grant execute on function public.upsert_own_push_token(text, text, text, timestamptz) to authenticated;
