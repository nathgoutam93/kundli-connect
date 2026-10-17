begin;
alter table public.match_scores add column invalidated_at timestamptz;
-- Preserve the score ID and original report for administrative history/free refresh,
-- while every authenticated table read and invoker list join hides invalidated rows.
create policy "Only current match reports are readable" on public.match_scores
as restrictive for select to authenticated using(invalidated_at is null);
create policy "Only current Kundlis are readable" on public.kundlis
as restrictive for select to authenticated using(exists(
 select 1 from public.profiles p where p.id=kundlis.user_id
 and (kundlis.input_revision=p.birth_details_revision or(kundlis.input_revision is null and p.birth_details_revision=0))
));

-- Contains only a cache-invalidation counter, never another member's birth inputs.
create table public.user_data_versions (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 version bigint not null default 1,
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.user_data_versions enable row level security;
revoke all on public.user_data_versions from public,anon,authenticated,service_role;
grant select on public.user_data_versions to authenticated;
create policy "Users read own data version" on public.user_data_versions for select to authenticated using(user_id=auth.uid());
alter publication supabase_realtime add table public.user_data_versions;

-- Scoring and support corrections acquire input locks before pair/profile locks.
create function public.lock_birth_inputs(p_a uuid,p_b uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare id uuid;
begin
 for id in select distinct x from unnest(array[p_a,p_b]) u(x) where x is not null order by x loop
   perform pg_advisory_xact_lock(hashtextextended('birth-input:'||id::text,0));
 end loop;
end;
$$;
revoke all on function public.lock_birth_inputs(uuid,uuid) from public,anon,authenticated;

create function public.invalidate_birth_dependents()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.birth_details_revision=old.birth_details_revision then return new; end if;
 perform 1 from public.match_scores where user_a_id=new.id or user_b_id=new.id order by id for no key update;
 update public.match_scores set invalidated_at=clock_timestamp()
 where user_a_id=new.id or user_b_id=new.id;
 insert into public.user_data_versions as v(user_id)
 select user_id from (select new.id user_id union select case when user_a_id=new.id then user_b_id else user_a_id end
 from public.match_scores where user_a_id=new.id or user_b_id=new.id) affected order by user_id
 on conflict(user_id) do update set version=v.version+1,updated_at=clock_timestamp();
 return new;
end;
$$;
revoke all on function public.invalidate_birth_dependents() from public,anon,authenticated;
create trigger profiles_invalidate_birth_dependents after update on public.profiles
for each row when(old.birth_details_revision is distinct from new.birth_details_revision)
execute function public.invalidate_birth_dependents();

-- Insights are also birth-dependent. Unversioned legacy rows remain stored but unavailable
-- until the updated weekly job recomputes them. A late old-input calculation is skipped.
alter table public.astro_insights add column input_revision bigint;
alter table public.astro_insights drop constraint astro_insights_user_id_week_of_kind_key;
alter table public.astro_insights add unique(user_id,week_of,kind,input_revision);
create policy "Only current birth insights are readable" on public.astro_insights
as restrictive for select to authenticated using(exists(select 1 from public.profiles p
 where p.id=astro_insights.user_id and p.birth_details_revision=astro_insights.input_revision));
create function public.guard_insight_revision()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform public.lock_birth_inputs(new.user_id);
 perform 1 from public.profiles where id=new.user_id and birth_details_revision=new.input_revision for share;
 if not found then return null; end if;
 return new;
end;
$$;
revoke all on function public.guard_insight_revision() from public,anon,authenticated;
create trigger astro_insights_guard_revision before insert or update on public.astro_insights
for each row execute function public.guard_insight_revision();


create or replace function public.match_score_inputs(p_user uuid,p_target uuid,p_engine text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.profiles; b public.profiles;
begin
  perform public.lock_birth_inputs(p_user,p_target);
  perform public.lock_user_pair(p_user,p_target);
  perform 1 from public.profiles where id in (p_user,p_target) order by id for share;
  perform public.assert_pair_available(p_user,p_target);
  select * into a from public.profiles where id = least(p_user,p_target);
  select * into b from public.profiles where id = greatest(p_user,p_target);
  if not exists (select 1 from public.profiles where id = p_target and onboarding_completed and is_discoverable)
     and not exists (select 1 from public.likes where status in ('pending','matched') and
       least(from_user_id,to_user_id) = a.id and greatest(from_user_id,to_user_id) = b.id) then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('aRevision',a.birth_details_revision,'bRevision',b.birth_details_revision,
    'aGender',a.gender,'bGender',b.gender,'engine',p_engine);
end;
$$;

create or replace function public.prepare_match_score(p_user uuid,p_target uuid,p_engine text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare signature jsonb; existing public.match_scores; profiles jsonb;
begin
  signature := public.match_score_inputs(p_user,p_target,p_engine);
  -- Even cache reads are bounded; subscribers cannot bypass the calculation limit.
  perform public.consume_action_limit(p_user,'match_score',60,10);
  select * into existing from public.match_scores
    where user_a_id = least(p_user,p_target) and user_b_id = greatest(p_user,p_target);
  if existing.invalidated_at is null and existing.input_signature = signature and public.valid_match_report(existing.compatibility_report) then
    return jsonb_build_object('matchScoreId',existing.id,'compatibility',existing.compatibility_report,'cached',true);
  end if;
  select jsonb_agg(jsonb_build_object('id',id,'gender',gender,'date_of_birth',date_of_birth,
    'time_of_birth',time_of_birth,'birth_latitude',birth_latitude,'birth_longitude',birth_longitude,
    'birth_timezone',birth_timezone) order by id) into profiles
  from public.profiles where id in (p_user,p_target);
  return jsonb_build_object('signature',signature,'profiles',profiles,'cached',false);
end;
$$;

create or replace function public.commit_match_score(p_user uuid,p_target uuid,p_engine text,p_signature jsonb,p_report jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare signature jsonb; existing public.match_scores; score_id uuid; allowed boolean; debit uuid;
begin
  signature := public.match_score_inputs(p_user,p_target,p_engine);
  select * into existing from public.match_scores
    where user_a_id = least(p_user,p_target) and user_b_id = greatest(p_user,p_target) for update;
  if existing.invalidated_at is null and existing.input_signature = signature and public.valid_match_report(existing.compatibility_report) then
    return jsonb_build_object('matchScoreId',existing.id,'compatibility',existing.compatibility_report,'cached',true);
  end if;
  if p_signature is distinct from signature then
    raise exception 'Profile details changed. Please try again.' using errcode = '40001';
  end if;
  if public.valid_match_report(p_report) is not true or octet_length(p_report::text) > 262144 then
    raise exception 'Invalid compatibility report.' using errcode = '22023';
  end if;
  -- Refreshing a historical/changed-input report is free. Never bill a pair twice for a refresh.
  if existing.id is null then
    select s.allowed,s.transaction_id into allowed,debit from public.spend_user_credit(p_user,'Generated a compatibility report') s;
    if not allowed then raise exception 'Credits needed' using errcode = 'P0402'; end if;
  end if;
  insert into public.match_scores(user_a_id,user_b_id,generated_by,compatibility_score,compatibility_report,raw_report,generated_at,input_signature)
  values(least(p_user,p_target),greatest(p_user,p_target),p_user,(p_report->>'overallScore')::integer,
    p_report,coalesce(p_report->'raw','{}'),(p_report->>'generatedAt')::timestamptz,signature)
  on conflict(user_a_id,user_b_id) do update set
    invalidated_at = null,
    generated_by = excluded.generated_by,
    compatibility_score = excluded.compatibility_score, compatibility_report = excluded.compatibility_report,
    raw_report = excluded.raw_report, generated_at = excluded.generated_at, input_signature = excluded.input_signature
  returning id into score_id;
  if debit is not null then
    update public.credit_transactions set metadata = metadata || jsonb_build_object(
      'action','match_score','targetUserId',p_target,'matchScoreId',score_id) where id = debit;
  end if;
  return jsonb_build_object('matchScoreId',score_id,'compatibility',p_report,'cached',false);
end;
$$;

create or replace function public.commit_generated_kundli(p_user uuid, p_revision bigint, p_chart jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_revision bigint;
begin
  perform public.lock_birth_inputs(p_user);
  select birth_details_revision into v_revision from public.profiles where id = p_user for no key update;
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
  ) as photo_paths,
  (select ms.compatibility_report from public.match_scores ms
    where ms.invalidated_at is null and ms.user_a_id = least(p.id, (select auth.uid()))
      and ms.user_b_id = greatest(p.id, (select auth.uid()))) as compatibility_report
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
create or replace function public.update_profile_fields(
  p_updates jsonb, p_expected_updated_at timestamptz, p_complete_onboarding boolean default false
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_next public.profiles%rowtype;
begin
  if v_user is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  if p_updates is null or jsonb_typeof(p_updates) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_updates) as keys(key) where key <> all(array['email', 'display_name', 'gender', 'gender_preferences', 'height', 'date_of_birth', 'time_of_birth', 'birth_place', 'birth_latitude', 'birth_longitude', 'birth_timezone', 'location', 'bio', 'family_plans', 'family_plans_visible_on_profile', 'workplace', 'workplace_visible_on_profile', 'job_role', 'job_role_visible_on_profile', 'school', 'school_visible_on_profile', 'education_level', 'education_level_visible_on_profile', 'religious_beliefs', 'drinking', 'drinking_visible_on_profile', 'smoking', 'smoking_visible_on_profile'])
  ) then raise exception 'Invalid profile fields.' using errcode = '22023'; end if;
  select * into v_profile from public.profiles where id = v_user for no key update;
  if not found then raise exception 'Profile not found.' using errcode = 'P0002'; end if;
  if p_expected_updated_at is null or p_expected_updated_at <> v_profile.updated_at then
    raise exception 'Your profile changed. Reload it before saving again.' using errcode = '40001';
  end if;
  v_next := jsonb_populate_record(v_profile, p_updates);
  if v_profile.onboarding_completed and row(v_next.date_of_birth, v_next.time_of_birth, v_next.birth_place,
    v_next.birth_latitude, v_next.birth_longitude, v_next.birth_timezone) is distinct from row(v_profile.date_of_birth,
    v_profile.time_of_birth, v_profile.birth_place, v_profile.birth_latitude, v_profile.birth_longitude, v_profile.birth_timezone) then
    raise exception 'Birth details are locked after onboarding.' using errcode = '22023';
  end if;
  if (v_next.date_of_birth is distinct from v_profile.date_of_birth or p_complete_onboarding)
    and (v_next.date_of_birth is null or v_next.date_of_birth > public.latest_adult_birth_date()) then
    raise exception 'You must be 18 or older to use Kundali Konnect.' using errcode = '23514';
  end if;
  update public.profiles set
    email = v_next.email,
    display_name = v_next.display_name,
    gender = v_next.gender,
    gender_preferences = v_next.gender_preferences,
    height = v_next.height,
    date_of_birth = v_next.date_of_birth,
    time_of_birth = v_next.time_of_birth,
    birth_place = v_next.birth_place,
    birth_latitude = v_next.birth_latitude,
    birth_longitude = v_next.birth_longitude,
    birth_timezone = v_next.birth_timezone,
    location = v_next.location,
    bio = v_next.bio,
    family_plans = v_next.family_plans,
    family_plans_visible_on_profile = v_next.family_plans_visible_on_profile,
    workplace = v_next.workplace,
    workplace_visible_on_profile = v_next.workplace_visible_on_profile,
    job_role = v_next.job_role,
    job_role_visible_on_profile = v_next.job_role_visible_on_profile,
    school = v_next.school,
    school_visible_on_profile = v_next.school_visible_on_profile,
    education_level = v_next.education_level,
    education_level_visible_on_profile = v_next.education_level_visible_on_profile,
    religious_beliefs = v_next.religious_beliefs,
    drinking = v_next.drinking,
    drinking_visible_on_profile = v_next.drinking_visible_on_profile,
    smoking = v_next.smoking,
    smoking_visible_on_profile = v_next.smoking_visible_on_profile,
    onboarding_completed = v_profile.onboarding_completed or coalesce(p_complete_onboarding, false),
    updated_at = clock_timestamp()
  where id = v_user;
end;
$$;

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
    where invalidated_at is null and user_a_id = least(v_user, p_target_profile_id) and user_b_id = greatest(v_user, p_target_profile_id);
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
commit;
