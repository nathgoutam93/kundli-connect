-- Generated charts must commit against the exact birth inputs that were read.
begin;
alter table public.profiles add column birth_details_revision bigint not null default 0;
alter table public.kundlis add column input_revision bigint;

create or replace function public.validate_birth_details_revision()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.birth_details_revision := 0;
  else
    new.birth_details_revision := old.birth_details_revision;
    if row(new.date_of_birth, new.time_of_birth, new.birth_place, new.birth_latitude, new.birth_longitude, new.birth_timezone)
       is distinct from row(old.date_of_birth, old.time_of_birth, old.birth_place, old.birth_latitude, old.birth_longitude, old.birth_timezone) then
      new.birth_details_revision := old.birth_details_revision + 1;
      new.kundli_generation_status := 'pending';
    end if;
  end if;
  if new.onboarding_completed and (tg_op = 'INSERT' or not old.onboarding_completed) then
    if new.date_of_birth is null or new.time_of_birth is null or nullif(btrim(new.birth_place), '') is null
       or new.birth_latitude is null or new.birth_longitude is null or nullif(btrim(new.birth_timezone), '') is null then
      raise exception 'Confirm your birth date, time and birthplace before continuing.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.kundlis where user_id = new.id and input_revision = new.birth_details_revision) then
      raise exception 'Generate your Kundli from your confirmed birth details before continuing.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_birth_details_revision() from public, anon, authenticated;
-- Runs after profiles_protect_columns, which preserves locked inputs and the age gate.
create trigger profiles_validate_birth_details_revision before insert or update on public.profiles
for each row execute function public.validate_birth_details_revision();

create or replace function public.commit_generated_kundli(p_user uuid, p_revision bigint, p_chart jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_revision bigint;
begin
  select birth_details_revision into v_revision from public.profiles where id = p_user for update;
  if not found or v_revision <> p_revision then
    raise exception 'Birth details changed. Please generate your Kundli again.' using errcode = '40001';
  end if;
  insert into public.kundlis(user_id, raw_response, parsed_summary, chart_image_paths, chart_raw_responses, chart_houses,
    input_signature, input_revision, generated_at)
  values (p_user, p_chart->'raw_response', p_chart->'parsed_summary', '{}'::jsonb, p_chart->'chart_raw_responses',
    p_chart->'chart_houses', p_chart->>'input_signature', p_revision, (p_chart->>'generated_at')::timestamptz)
  on conflict (user_id) do update set
    raw_response = excluded.raw_response, parsed_summary = excluded.parsed_summary,
    chart_image_paths = excluded.chart_image_paths, chart_raw_responses = excluded.chart_raw_responses,
    chart_houses = excluded.chart_houses, input_signature = excluded.input_signature,
    input_revision = excluded.input_revision, generated_at = excluded.generated_at;
  update public.profiles set kundli_generation_status = 'generated', updated_at = now() where id = p_user;
end;
$$;
revoke all on function public.commit_generated_kundli(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.commit_generated_kundli(uuid, bigint, jsonb) to service_role;
commit;
