-- Only explicit preferences count. Empty legacy preferences require a choice.
create function public.gender_is_preferred(p_gender text, p_preferences text[])
returns boolean language sql immutable set search_path = public as $$
  select exists (
    select 1 from unnest(p_preferences) preference
    where lower(preference) = 'everyone'
      or regexp_replace(lower(preference), '[^a-z]', '', 'g') =
         regexp_replace(lower(p_gender), '[^a-z]', '', 'g')
      or (regexp_replace(lower(preference), '[^a-z]', '', 'g') = 'nonbinarypeople'
          and regexp_replace(lower(p_gender), '[^a-z]', '', 'g') = 'nonbinary')
  ) and nullif(trim(p_gender), '') is not null;
$$;
revoke all on function public.gender_is_preferred(text,text[]) from public, anon;

create function public.has_mutual_gender_preferences(p_other_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select public.gender_is_preferred(other.gender, viewer.gender_preferences)
       and public.gender_is_preferred(viewer.gender, other.gender_preferences)
    from public.profiles viewer cross join public.profiles other
    where viewer.id = (select auth.uid()) and other.id = p_other_user
  ), false);
$$;
revoke all on function public.has_mutual_gender_preferences(uuid) from public, anon;
grant execute on function public.has_mutual_gender_preferences(uuid) to authenticated;

create or replace function public.get_discover_profiles(p_limit integer default 50)
returns setof public.profile_cards language sql stable security invoker set search_path = public as $$
  select c.* from public.profile_cards c
  where c.onboarding_completed and c.is_discoverable and c.id <> (select auth.uid())
    and public.has_mutual_gender_preferences(c.id)
    and not exists (select 1 from public.likes l where l.from_user_id = (select auth.uid()) and l.to_user_id = c.id)
    and not exists (select 1 from public.likes l where l.to_user_id = (select auth.uid()) and l.from_user_id = c.id)
    and not exists (select 1 from public.discovery_passes dp where dp.user_id = (select auth.uid()) and dp.passed_user_id = c.id)
  order by c.created_at desc, c.id desc
  limit least(greatest(coalesce(p_limit,50),1),100);
$$;

create function public.get_skipped_profiles(p_limit integer default 50, p_before timestamptz default null, p_before_id uuid default null)
returns setof public.profile_cards language sql stable security invoker set search_path = public as $$
  select c.* from public.profile_cards c
  join public.discovery_passes dp on dp.passed_user_id = c.id and dp.user_id = (select auth.uid())
  where c.onboarding_completed and c.is_discoverable and c.id <> (select auth.uid())
    and public.has_mutual_gender_preferences(c.id)
    and not exists (select 1 from public.likes l where l.from_user_id = (select auth.uid()) and l.to_user_id = c.id)
    and not exists (select 1 from public.likes l where l.to_user_id = (select auth.uid()) and l.from_user_id = c.id)
    and (p_before is null or (c.created_at,c.id) < (p_before,p_before_id))
  order by c.created_at desc, c.id desc
  limit least(greatest(coalesce(p_limit,50),1),100);
$$;
revoke all on function public.get_skipped_profiles(integer,timestamptz,uuid) from public, anon;
grant execute on function public.get_skipped_profiles(integer,timestamptz,uuid) to authenticated;

alter table public.likes add column read_at timestamptz;
drop function public.get_incoming_likes();
create function public.get_incoming_likes()
returns table(id uuid, from_user_id uuid, opening_message text, created_at timestamptz,
  compatibility_report jsonb, profile jsonb, read_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select l.id,l.from_user_id,l.opening_message,l.created_at,ms.compatibility_report,to_jsonb(c),l.read_at
  from public.likes l
  join public.profile_cards c on c.id = l.from_user_id
  left join public.match_scores ms on ms.id = l.match_score_id
  where l.to_user_id = (select auth.uid()) and l.status = 'pending'
  order by l.created_at desc, l.id desc;
$$;
revoke all on function public.get_incoming_likes() from public, anon;
grant execute on function public.get_incoming_likes() to authenticated;

create function public.mark_incoming_likes_read(p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if cardinality(p_ids) > 100 then raise exception 'Too many likes' using errcode = '22023'; end if;
  update public.likes set read_at = now()
  where id = any(p_ids) and to_user_id = auth.uid() and status = 'pending' and read_at is null;
end;
$$;
revoke all on function public.mark_incoming_likes_read(uuid[]) from public, anon;
grant execute on function public.mark_incoming_likes_read(uuid[]) to authenticated;

-- Patches merge while the row is locked, so independent switches cannot undo each other.
create function public.update_settings_fields(p_updates jsonb, p_expected_user_id uuid default null)
returns public.user_settings language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_result public.user_settings;
begin
  if v_user is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_expected_user_id is not null and p_expected_user_id <> v_user then
    raise exception 'Session changed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_updates) is distinct from 'object' then
    raise exception 'Invalid settings' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_updates) e
    where e.key not in ('notify_likes','notify_matches','notify_messages','notify_astrology_reports','profile_discoverable')
      or jsonb_typeof(e.value) <> 'boolean') then
    raise exception 'Invalid settings field' using errcode = '22023';
  end if;
  insert into public.user_settings(user_id) values(v_user) on conflict do nothing;
  select * into v_result from public.user_settings where user_id = v_user for update;
  v_result := jsonb_populate_record(v_result,p_updates);
  update public.user_settings set
    notify_likes = v_result.notify_likes,
    notify_matches = v_result.notify_matches,
    notify_messages = v_result.notify_messages,
    notify_astrology_reports = v_result.notify_astrology_reports,
    profile_discoverable = v_result.profile_discoverable,
    updated_at = now()
  where user_id = v_user returning * into v_result;
  return v_result;
end;
$$;
revoke all on function public.update_settings_fields(jsonb,uuid) from public, anon;
grant execute on function public.update_settings_fields(jsonb,uuid) to authenticated;
revoke insert, update on public.user_settings from authenticated;

-- This exact value came from the old client default, not a city supplied by a member.
update public.profiles set location = null where trim(location) = 'India';

create function public.require_onboarding_city()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.onboarding_completed and not old.onboarding_completed
    and (nullif(trim(new.location),'') is null or trim(new.location) = 'India') then
    raise exception 'Choose your current city before continuing' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger require_onboarding_city before update on public.profiles
for each row execute function public.require_onboarding_city();
revoke all on function public.require_onboarding_city() from public, anon, authenticated;

-- A registration waiting on native permissions/token lookup must not attach to a later account.
create function public.register_push_token_for_session(p_token text, p_platform text, p_token_type text,
  p_updated_at timestamptz, p_expected_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id then
    raise exception 'Session changed' using errcode = '42501';
  end if;
  perform public.upsert_own_push_token(p_token,p_platform,p_token_type,p_updated_at);
end;
$$;
revoke all on function public.register_push_token_for_session(text,text,text,timestamptz,uuid) from public, anon;
grant execute on function public.register_push_token_for_session(text,text,text,timestamptz,uuid) to authenticated;

create function public.retire_own_push_registration(p_token text, p_updated_at timestamptz, p_expected_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id then
    raise exception 'Session changed' using errcode = '42501';
  end if;
  delete from public.push_tokens where user_id = auth.uid() and token = p_token
    and (p_updated_at is null or updated_at = p_updated_at);
end;
$$;
revoke all on function public.retire_own_push_registration(text,timestamptz,uuid) from public, anon;
grant execute on function public.retire_own_push_registration(text,timestamptz,uuid) to authenticated;
